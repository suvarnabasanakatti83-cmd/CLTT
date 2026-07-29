const crypto = require("crypto");

function hashActivationCode(code) {
    return crypto.createHash("sha256").update(String(code || "").trim().toUpperCase()).digest("hex");
}

function generateActivationCode(role = "user") {
    const prefix = String(role || "user").slice(0, 4).toUpperCase();
    return `CHEM-${prefix}-${crypto.randomBytes(3).toString("base64url").toUpperCase()}`;
}

function getRole(user) {
    return user?.role === "superadmin" ? "superadmin" : user?.role === "admin" ? "admin" : "user";
}

function evaluateSubscriptionState(user) {
    const role = getRole(user);

    return {
        role,
        accessGranted: Boolean(user),
        needsMembershipSelection: false,
        needsRenewal: false,
        reason: user ? "authenticated" : "unauthenticated",
        status: user ? "active" : "inactive",
        daysRemaining: null,
        trialDaysRemaining: null
    };
}

function issueActivationCode(user) {
    const now = new Date();
    const activationCode = generateActivationCode(getRole(user));

    user.subscription = {
        ...user.subscription,
        activationCodeHash: hashActivationCode(activationCode),
        activationCodeLast4: activationCode.slice(-4),
        activationCodeIssuedAt: now
    };

    return activationCode;
}

function preserveAccessState(user) {
    return user;
}

module.exports = {
    evaluateSubscriptionState,
    generateActivationCode,
    hashActivationCode,
    issueActivationCode,
    preserveAccessState
};
