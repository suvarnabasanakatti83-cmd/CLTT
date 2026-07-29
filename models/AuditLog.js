const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
    {
        level: {
            type: String,
            enum: ["info", "warn", "error"],
            default: "info",
            index: true
        },
        event: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150,
            index: true
        },
        category: {
            type: String,
            trim: true,
            maxlength: 50,
            default: "activity",
            index: true
        },
        method: {
            type: String,
            trim: true,
            maxlength: 10
        },
        path: {
            type: String,
            trim: true,
            maxlength: 500,
            index: true
        },
        statusCode: {
            type: Number,
            min: 100,
            max: 599,
            index: true
        },
        durationMs: {
            type: Number,
            min: 0
        },
        ip: {
            type: String,
            trim: true,
            maxlength: 200,
            index: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            index: true,
            default: null
        },
        userRole: {
            type: String,
            trim: true,
            maxlength: 20,
            default: null
        },
        userAgent: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: null
        },
        requestId: {
            type: String,
            trim: true,
            maxlength: 120,
            default: null,
            index: true
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
        strict: "throw",
        minimize: false
    }
);

auditLogSchema.index({ createdAt: -1, event: 1 });
auditLogSchema.index({ createdAt: -1, userId: 1 });
auditLogSchema.index({ createdAt: -1, category: 1, statusCode: 1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
