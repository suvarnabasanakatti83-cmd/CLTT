const { RequestValidationError } = require("../utils/validation");

function notFoundHandler(req, res) {
    return res.status(404).json({ message: "Route not found." });
}

function errorHandler(error, req, res, next) {
    if (res.headersSent) {
        return next(error);
    }

    if (error?.type === "entity.too.large") {
        return res.status(413).json({ message: "Request payload is too large." });
    }

    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
        return res.status(400).json({ message: "Malformed JSON payload." });
    }

    if (error instanceof RequestValidationError) {
        return res.status(error.statusCode).json({
            message: error.message,
            details: error.details
        });
    }

    if (error?.name === "ValidationError") {
        return res.status(400).json({
            message: "Validation failed.",
            details: Object.fromEntries(
                Object.entries(error.errors || {}).map(([field, entry]) => [field, entry.message])
            )
        });
    }

    if (error?.code === 11000) {
        return res.status(409).json({
            message: "A record with the same unique field already exists.",
            details: error.keyValue || {}
        });
    }

    if (error?.name === "StrictModeError") {
        return res.status(400).json({ message: error.message });
    }

    console.error("Unhandled error:", error);
    return res.status(500).json({ message: "Internal server error." });
}

module.exports = {
    errorHandler,
    notFoundHandler
};
