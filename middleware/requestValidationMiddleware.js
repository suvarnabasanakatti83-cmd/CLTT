const { RequestValidationError, isPlainObject, rejectDangerousKeys } = require("../utils/validation");

function containsSuspiciousMarkup(value) {
    if (typeof value === "string") {
        return /<script\b|javascript:|onerror\s*=|onload\s*=/i.test(value);
    }

    if (Array.isArray(value)) {
        return value.some((entry) => containsSuspiciousMarkup(entry));
    }

    if (isPlainObject(value)) {
        return Object.values(value).some((entry) => containsSuspiciousMarkup(entry));
    }

    return false;
}

function inspectRequestSegment(value, pathLabel) {
    if (Array.isArray(value) || isPlainObject(value)) {
        rejectDangerousKeys(value, pathLabel);
    }

    if (containsSuspiciousMarkup(value)) {
        throw new RequestValidationError(`Unsafe markup detected in ${pathLabel}.`);
    }
}

function rejectDangerousRequestValues(req, res, next) {
    try {
        inspectRequestSegment(req.body, "body");
        inspectRequestSegment(req.query, "query");
        inspectRequestSegment(req.params, "params");
        return next();
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    rejectDangerousRequestValues
};
