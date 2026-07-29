const net = require("net");
const tls = require("tls");

function readSmtpConfig() {
    const host = process.env.SMTP_HOST || "";
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = String(process.env.SMTP_SECURE || "true").toLowerCase() !== "false";
    const user = process.env.SMTP_USER || "";
    const pass = process.env.SMTP_PASS || "";
    const from = process.env.SMTP_FROM || user;

    return {
        host,
        port,
        secure,
        user,
        pass,
        from
    };
}

function waitForLine(socket, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        let buffer = "";

        const onData = (chunk) => {
            buffer += chunk.toString("utf8");
            if (!buffer.includes("\r\n")) {
                return;
            }

            const lines = buffer.trim().split(/\r?\n/);
            const lastLine = lines[lines.length - 1];
            if (!/^\d{3} /.test(lastLine)) {
                return;
            }

            cleanup();
            resolve(lastLine);
        };

        const onError = (error) => {
            cleanup();
            reject(error);
        };

        const onTimeout = () => {
            cleanup();
            reject(new Error("SMTP response timed out."));
        };

        const cleanup = () => {
            socket.off("data", onData);
            socket.off("error", onError);
            clearTimeout(timer);
        };

        const timer = setTimeout(onTimeout, timeoutMs);

        socket.on("data", onData);
        socket.on("error", onError);
    });
}

async function sendCommand(socket, command, expectedCodes) {
    if (command) {
        socket.write(`${command}\r\n`);
    }

    const response = await waitForLine(socket);
    const code = Number(response.slice(0, 3));

    if (!expectedCodes.includes(code)) {
        throw new Error(`SMTP command failed: ${response}`);
    }

    return response;
}

async function sendViaSmtp({ to, subject, text }) {
    const config = readSmtpConfig();
    if (!config.host || !config.user || !config.pass || !config.from) {
        return { delivered: false, mode: "log" };
    }

    const connector = config.secure ? tls : net;
    const socket = connector.connect({
        host: config.host,
        port: config.port,
        rejectUnauthorized: false
    });

    socket.setEncoding("utf8");

    await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
    });

    try {
        await sendCommand(socket, null, [220]);
        await sendCommand(socket, "EHLO localhost", [250]);
        await sendCommand(socket, "AUTH LOGIN", [334]);
        await sendCommand(socket, Buffer.from(config.user).toString("base64"), [334]);
        await sendCommand(socket, Buffer.from(config.pass).toString("base64"), [235]);
        await sendCommand(socket, `MAIL FROM:<${config.from}>`, [250]);
        await sendCommand(socket, `RCPT TO:<${to}>`, [250, 251]);
        await sendCommand(socket, "DATA", [354]);

        const safeSubject = String(subject || "Chemistry Lab OTP").replace(/\r?\n/g, " ");
        const message = [
            `From: ${config.from}`,
            `To: ${to}`,
            `Subject: ${safeSubject}`,
            "MIME-Version: 1.0",
            "Content-Type: text/plain; charset=utf-8",
            "",
            text,
            "."
        ].join("\r\n");

        socket.write(`${message}\r\n`);
        await sendCommand(socket, null, [250]);
        await sendCommand(socket, "QUIT", [221]);

        socket.end();
        return { delivered: true, mode: "smtp" };
    } catch (error) {
        socket.destroy();
        throw error;
    }
}

async function sendEmail({ to, subject, text }) {
    const result = await sendViaSmtp({ to, subject, text });

    if (!result.delivered) {
        console.log(`[OTP EMAIL FALLBACK] To: ${to} | Subject: ${subject} | Body: ${text}`);
    }

    return result;
}

module.exports = {
    sendEmail
};
