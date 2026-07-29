const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const AuditLog = require("../models/AuditLog");

const LOG_DIR = path.join(__dirname, "..", "logs");
const AUDIT_LOG_PATH = path.join(LOG_DIR, "audit.log");

const REDACTED_FIELDS = new Set([
    "password",
    "passwordHash",
    "otp",
    "resetToken",
    "token",
    "authorization",
    "paymentSignature",
    "smtp_pass"
]);

function ensureLogDirectory() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

function redact(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => redact(entry));
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
            key,
            REDACTED_FIELDS.has(String(key).toLowerCase()) ? "[REDACTED]" : redact(nestedValue)
        ])
    );
}

function getClientIp(req) {
    const forwarded = req?.headers?.["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
        return forwarded.split(",")[0].trim();
    }

    return req?.socket?.remoteAddress || null;
}

function buildAuditEntry(event, req, details = {}, level = "info", metadata = {}) {
    const userId = req?.user?.id;

    return {
        timestamp: new Date().toISOString(),
        level,
        event,
        category: metadata.category || "activity",
        method: req?.method || null,
        path: req?.originalUrl || req?.url || null,
        statusCode: metadata.statusCode || null,
        durationMs: metadata.durationMs || null,
        ip: getClientIp(req),
        userId: mongoose.isValidObjectId(userId) ? userId : null,
        userRole: req?.user?.role || null,
        userAgent: req?.headers?.["user-agent"] || null,
        requestId: req?.requestId || null,
        details: redact(details)
    };
}

async function appendAuditLine(entry) {
    ensureLogDirectory();
    await fs.promises.appendFile(AUDIT_LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

async function writeAuditDocument(entry) {
    if (mongoose.connection.readyState !== 1) {
        return;
    }

    await AuditLog.create({
        level: entry.level,
        event: entry.event,
        category: entry.category,
        method: entry.method,
        path: entry.path,
        statusCode: entry.statusCode,
        durationMs: entry.durationMs,
        ip: entry.ip,
        userId: entry.userId,
        userRole: entry.userRole,
        userAgent: entry.userAgent,
        requestId: entry.requestId,
        details: entry.details,
        createdAt: entry.timestamp
    });
}

async function logAuditEvent(event, req, details = {}, level = "info", metadata = {}) {
    try {
        const entry = buildAuditEntry(event, req, details, level, metadata);
        await Promise.allSettled([
            appendAuditLine(entry),
            writeAuditDocument(entry)
        ]);
    } catch (error) {
        console.error("Failed to write audit log:", error.message);
    }
}

module.exports = {
    AUDIT_LOG_PATH,
    buildAuditEntry,
    getClientIp,
    logAuditEvent
};
