const crypto = require("crypto");
const UserSession = require("../models/UserSession");
const { logAuditEvent } = require("../utils/auditLogger");

function assignRequestContext(req, res, next) {
    req.requestId = req.headers["x-request-id"] || crypto.randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    req.requestStartedAt = Date.now();
    next();
}

function requestAuditMiddleware(req, res, next) {
    const shouldAudit = req.path === "/health" || req.path.startsWith("/api/");

    if (!shouldAudit) {
        return next();
    }

    res.on("finish", () => {
        const durationMs = Date.now() - (req.requestStartedAt || Date.now());
        const statusCode = res.statusCode;
        const isFailure = statusCode >= 400;

        logAuditEvent(
            isFailure ? "api.request.failure" : "api.request.success",
            req,
            {
                queryKeys: Object.keys(req.query || {}),
                paramKeys: Object.keys(req.params || {})
            },
            statusCode >= 500 ? "error" : isFailure ? "warn" : "info",
            {
                category: "traffic",
                statusCode,
                durationMs
            }
        ).catch(() => undefined);
    });

    return next();
}

function sessionActivityMiddleware(req, res, next) {
    if (!req.user?.sessionId) {
        return next();
    }

    UserSession.updateOne(
        { sessionId: req.user.sessionId },
        {
            $set: {
                lastSeenAt: new Date(),
                lastActivity: `${req.method} ${req.originalUrl || req.url || ""}`.slice(0, 200)
            }
        }
    ).catch(() => undefined);

    return next();
}

module.exports = {
    assignRequestContext,
    requestAuditMiddleware,
    sessionActivityMiddleware
};
