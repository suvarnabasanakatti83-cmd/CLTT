const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { logAuditEvent } = require("../utils/auditLogger");
const { COOKIE_NAME, JWT_SECRET, JWT_VERIFY_OPTIONS } = require("../config/auth");

function parseCookies(cookieHeader = "") {
    return cookieHeader.split(";").reduce((acc, part) => {
        const [rawName, ...rawValue] = part.trim().split("=");
        if (!rawName) {
            return acc;
        }

        acc[rawName] = decodeURIComponent(rawValue.join("="));
        return acc;
    }, {});
}

function extractToken(req) {
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
        return authHeader.slice(7).trim();
    }

    const cookies = parseCookies(req.headers.cookie || "");
    return cookies[COOKIE_NAME] || null;
}

function clearAuthCookie(res) {
    res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production"
    });
}

function getRole(user) {
    return user?.role === "superadmin" ? "superadmin" : user?.role === "admin" ? "admin" : "user";
}

function getPaymentStatus(user) {
    return user?.payment_status === "paid" ? "paid" : "unpaid";
}

function hasPaidAccess(user) {
    return Boolean(user);
}

function buildWorkspaceAccess() {
    return {
        accessGranted: true,
        needsMembershipSelection: false,
        needsRenewal: false,
        reason: "authenticated",
        status: "active",
        daysRemaining: null,
        trialDaysRemaining: null
    };
}

async function resolveAuthenticatedUser(req) {
    const token = extractToken(req);
    if (!token) {
        return null;
    }

    const decoded = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTIONS);
    const user = await User.findById(decoded.id);
    if (!user) {
        return null;
    }

    if (typeof decoded.sessionVersion !== "number" || decoded.sessionVersion !== user.sessionVersion) {
        return null;
    }

    return {
        id: String(user._id),
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: getRole(user),
        payment_status: getPaymentStatus(user),
        hasPaidAccess: hasPaidAccess(user),
        access: buildWorkspaceAccess(),
        sessionPurpose: decoded.purpose || "auth",
        sessionVersion: user.sessionVersion,
        sessionId: decoded.sessionId || null
    };
}

async function apiAuthMiddleware(req, res, next) {
    try {
        const user = await resolveAuthenticatedUser(req);
        if (!user) {
            clearAuthCookie(res);
            await logAuditEvent("auth.failure", req, { reason: "missing_or_invalid_token" }, "warn");
            return res.status(401).json({ message: "Authentication required." });
        }

        req.user = user;
        return next();
    } catch (error) {
        clearAuthCookie(res);
        await logAuditEvent("auth.failure", req, { reason: "token_verification_failed" }, "warn");
        return res.status(401).json({ message: "Invalid or expired token." });
    }
}

function requireSessionPurpose(...allowedPurposes) {
    return (req, res, next) => {
        if (!req.user || !allowedPurposes.includes(req.user.sessionPurpose)) {
            return res.status(403).json({ message: "Your session does not allow this action." });
        }

        return next();
    };
}

function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: "You do not have permission to perform this action." });
        }

        return next();
    };
}

async function pageAuthMiddleware(req, res, next) {
    try {
        const user = await resolveAuthenticatedUser(req);
        if (!user || user.sessionPurpose !== "auth") {
            clearAuthCookie(res);
            return res.redirect("/register");
        }

        req.user = user;
        res.set("Cache-Control", "no-store");
        return next();
    } catch (error) {
        clearAuthCookie(res);
        return res.redirect("/register");
    }
}

module.exports = {
    apiAuthMiddleware,
    pageAuthMiddleware,
    clearAuthCookie,
    extractToken,
    hasPaidAccess,
    requireRole,
    requireSessionPurpose,
    resolveAuthenticatedUser
};
