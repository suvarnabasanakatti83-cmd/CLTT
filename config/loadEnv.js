const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");

if (fs.existsSync(envPath)) {
    const contents = fs.readFileSync(envPath, "utf8");

    contents.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            return;
        }

        const separatorIndex = trimmed.indexOf("=");
        if (separatorIndex === -1) {
            return;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        if (!key || process.env[key] !== undefined) {
            return;
        }

        let value = trimmed.slice(separatorIndex + 1).trim();
        if (
            (value.startsWith("\"") && value.endsWith("\"")) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        process.env[key] = value;
    });
}
