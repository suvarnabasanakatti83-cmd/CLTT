const zlib = require("zlib");

function parseBoolean(value, defaultValue = false) {
    if (value === undefined) {
        return defaultValue;
    }

    return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parseInteger(value, defaultValue) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function getAllowedOrigins() {
    const configuredOrigins = String(process.env.CORS_ORIGINS || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

    if (configuredOrigins.length > 0) {
        return new Set(configuredOrigins);
    }

    return new Set([
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5002",
        "http://127.0.0.1:5002"
    ]);
}

function buildContentSecurityPolicy() {
    return [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "connect-src 'self'",
        "form-action 'self'"
    ].join("; ");
}

function applySecurityHeaders(req, res, next) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader("Content-Security-Policy", buildContentSecurityPolicy());

    if (process.env.NODE_ENV === "production") {
        res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    return next();
}

function corsMiddleware(req, res, next) {
    const allowedOrigins = getAllowedOrigins();
    const origin = req.headers.origin;

    res.setHeader("Vary", "Origin");

    if (!origin) {
        if (req.method === "OPTIONS") {
            return res.sendStatus(204);
        }

        return next();
    }

    if (!allowedOrigins.has(origin)) {
        return res.status(403).json({ message: "Origin is not allowed." });
    }

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, X-Requested-With");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    return next();
}

function compressionMiddleware(req, res, next) {
    const acceptEncoding = String(req.headers["accept-encoding"] || "");

    if (!/\b(gzip|br)\b/i.test(acceptEncoding)) {
        return next();
    }

    const originalSend = res.send.bind(res);

    res.send = function sendWithCompression(body) {
        if (res.getHeader("Content-Encoding")) {
            return originalSend(body);
        }

        let payload = body;
        if (payload === undefined || payload === null) {
            return originalSend(payload);
        }

        if (!Buffer.isBuffer(payload)) {
            payload = typeof payload === "string" ? Buffer.from(payload) : Buffer.from(JSON.stringify(payload));
        }

        if (payload.length < 1024) {
            return originalSend(body);
        }

        const contentType = String(res.getHeader("Content-Type") || "");
        const compressible = /json|text|javascript|svg|xml/i.test(contentType);
        if (!compressible) {
            return originalSend(body);
        }

        const useBrotli = /\bbr\b/i.test(acceptEncoding);
        const compressed = useBrotli
            ? zlib.brotliCompressSync(payload)
            : zlib.gzipSync(payload);

        res.setHeader("Content-Encoding", useBrotli ? "br" : "gzip");
        res.setHeader("Vary", "Accept-Encoding");
        res.removeHeader("Content-Length");

        return originalSend(compressed);
    };

    return next();
}

function createRateLimiter({
    windowMs,
    max,
    message,
    keyGenerator = (req) => req.ip || req.socket.remoteAddress || "unknown"
}) {
    const bucket = new Map();

    return (req, res, next) => {
        if (parseBoolean(process.env.DISABLE_RATE_LIMIT, false)) {
            return next();
        }

        const now = Date.now();
        const key = keyGenerator(req);
        const entry = bucket.get(key);

        if (!entry || entry.resetAt <= now) {
            bucket.set(key, { count: 1, resetAt: now + windowMs });
            res.setHeader("RateLimit-Limit", String(max));
            res.setHeader("RateLimit-Remaining", String(max - 1));
            res.setHeader("RateLimit-Reset", String(Math.ceil((now + windowMs) / 1000)));
            return next();
        }

        entry.count += 1;
        bucket.set(key, entry);

        res.setHeader("RateLimit-Limit", String(max));
        res.setHeader("RateLimit-Remaining", String(Math.max(max - entry.count, 0)));
        res.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

        if (entry.count > max) {
            return res.status(429).json({ message });
        }

        return next();
    };
}

const authRateLimiter = createRateLimiter({
    windowMs: parseInteger(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: parseInteger(process.env.AUTH_RATE_LIMIT_MAX, 10),
    message: "Too many authentication requests. Please try again later."
});

const apiRateLimiter = createRateLimiter({
    windowMs: parseInteger(process.env.API_RATE_LIMIT_WINDOW_MS, 60 * 1000),
    max: parseInteger(process.env.API_RATE_LIMIT_MAX, 300),
    message: "Too many API requests. Please slow down."
});

module.exports = {
    apiRateLimiter,
    applySecurityHeaders,
    authRateLimiter,
    compressionMiddleware,
    corsMiddleware
};
