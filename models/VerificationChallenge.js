const mongoose = require("mongoose");

const verificationChallengeSchema = new mongoose.Schema(
    {
        purpose: {
            type: String,
            enum: ["registration", "password_reset", "login"],
            required: true,
            index: true
        },
        channel: {
            type: String,
            enum: ["email", "mobile"],
            required: true,
            index: true
        },
        target: {
            type: String,
            required: true,
            trim: true,
            maxlength: 254
        },
        targetNormalized: {
            type: String,
            required: true,
            trim: true,
            maxlength: 254,
            index: true
        },
        codeHash: {
            type: String,
            required: true,
            maxlength: 128,
            select: false
        },
        expiresAt: {
            type: Date,
            required: true,
            index: true
        },
        verifiedAt: {
            type: Date,
            default: null
        },
        consumedAt: {
            type: Date,
            default: null
        },
        attempts: {
            type: Number,
            default: 0,
            min: 0,
            max: 20
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    },
    {
        timestamps: true,
        strict: "throw",
        minimize: false
    }
);

verificationChallengeSchema.index({ channel: 1, purpose: 1, targetNormalized: 1, createdAt: -1 });

module.exports = mongoose.model("VerificationChallenge", verificationChallengeSchema);
