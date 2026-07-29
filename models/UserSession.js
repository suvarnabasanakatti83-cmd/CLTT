const mongoose = require("mongoose");

const userSessionSchema = new mongoose.Schema(
    {
        sessionId: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120,
            unique: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        role: {
            type: String,
            enum: ["admin", "user"],
            required: true
        },
        purpose: {
            type: String,
            enum: ["auth", "payment"],
            default: "auth",
            index: true
        },
        ip: {
            type: String,
            trim: true,
            maxlength: 200,
            default: null
        },
        userAgent: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: null
        },
        loginAt: {
            type: Date,
            default: Date.now,
            index: true
        },
        logoutAt: {
            type: Date,
            default: null,
            index: true
        },
        lastSeenAt: {
            type: Date,
            default: Date.now,
            index: true
        },
        lastActivity: {
            type: String,
            trim: true,
            maxlength: 200,
            default: "session.created"
        }
    },
    {
        timestamps: true,
        strict: "throw",
        minimize: false
    }
);

userSessionSchema.index({ userId: 1, loginAt: -1 });
userSessionSchema.index({ purpose: 1, logoutAt: 1, lastSeenAt: -1 });

module.exports = mongoose.model("UserSession", userSessionSchema);
