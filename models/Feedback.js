const mongoose = require("mongoose");

const FEEDBACK_OPTIONS = {
    overallExperience: ["Excellent", "Good", "Average", "Poor"],
    easeOfUse: ["Very Easy", "Easy", "Neutral", "Difficult", "Very Difficult"],
    chemicalAccuracy: ["Yes", "No", "Not Sure"],
    speedRating: ["Excellent", "Good", "Average", "Poor"],
    learningValue: ["Strongly Agree", "Agree", "Neutral", "Disagree", "Strongly Disagree"],
    futureUsage: ["Definitely", "Maybe", "No"],
    recommendation: ["Yes", "No"]
};

const feedbackSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        overallExperience: {
            type: String,
            enum: FEEDBACK_OPTIONS.overallExperience,
            required: true
        },
        easeOfUse: {
            type: String,
            enum: FEEDBACK_OPTIONS.easeOfUse,
            required: true
        },
        chemicalAccuracy: {
            type: String,
            enum: FEEDBACK_OPTIONS.chemicalAccuracy,
            required: true
        },
        speedRating: {
            type: String,
            enum: FEEDBACK_OPTIONS.speedRating,
            required: true
        },
        learningValue: {
            type: String,
            enum: FEEDBACK_OPTIONS.learningValue,
            required: true
        },
        futureUsage: {
            type: String,
            enum: FEEDBACK_OPTIONS.futureUsage,
            required: true
        },
        recommendation: {
            type: String,
            enum: FEEDBACK_OPTIONS.recommendation,
            required: true
        },
        suggestions: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: ""
        }
    },
    {
        timestamps: true,
        strict: "throw",
        minimize: false
    }
);

feedbackSchema.index({ userId: 1 }, { unique: true });
feedbackSchema.index({ createdAt: -1 });

module.exports = {
    Feedback: mongoose.model("Feedback", feedbackSchema),
    FEEDBACK_OPTIONS
};
