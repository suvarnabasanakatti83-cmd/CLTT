const mongoose = require("mongoose");

const verificationCodeSchema = new mongoose.Schema(
    {
        hash: {
            type: String,
            default: null,
            maxlength: 128
        },
        expiresAt: {
            type: Date,
            default: null
        },
        verifiedAt: {
            type: Date,
            default: null
        },
        attempts: {
            type: Number,
            default: 0,
            min: 0,
            max: 20
        }
    },
    { _id: false, strict: "throw" }
);

const subscriptionSchema = new mongoose.Schema(
    {
        plan: {
            type: String,
            enum: ["basic_platinum", "platinum", "silver", "gold", "diamond"],
            default: "basic_platinum",
            index: true
        },
        tier: {
            type: String,
            default: "trial"
        },
        status: {
            type: String,
            enum: ["inactive", "trial_active", "active", "expired", "renewal_required", "cancelled"],
            default: "inactive",
            index: true
        },
        price: {
            type: Number,
            default: 0,
            min: 0
        },
        currency: {
            type: String,
            default: "INR",
            trim: true,
            uppercase: true,
            minlength: 3,
            maxlength: 3
        },
        validityDays: {
            type: Number,
            default: 30,
            min: 1,
            max: 3650
        },
        limits: {
            savedFormulas: {
                type: Number,
                default: 100,
                min: 0
            },
            reportsPerMonth: {
                type: Number,
                default: 50,
                min: 0
            },
            supportLevel: {
                type: String,
                default: "standard"
            }
        },
        trialStartAt: {
            type: Date,
            default: null,
            index: true
        },
        trialExpiresAt: {
            type: Date,
            default: null,
            index: true
        },
        trialStatus: {
            type: String,
            enum: ["not_started", "active", "expired", "converted"],
            default: "not_started",
            index: true
        },
        startedAt: {
            type: Date,
            default: null
        },
        expiresAt: {
            type: Date,
            default: null,
            index: true
        },
        purchaseDate: {
            type: Date,
            default: null
        },
        paymentStatus: {
            type: String,
            enum: ["pending", "paid", "failed", "refunded", "waived", "trial"],
            default: "pending",
            index: true
        },
        paymentAmount: {
            type: Number,
            default: 0,
            min: 0
        },
        transactionId: {
            type: String,
            default: null,
            maxlength: 150
        },
        renewalRequired: {
            type: Boolean,
            default: false,
            index: true
        },
        activationCodeHash: {
            type: String,
            default: null,
            maxlength: 128,
            select: false
        },
        activationCodeLast4: {
            type: String,
            default: null,
            maxlength: 4
        },
        activationCodeIssuedAt: {
            type: Date,
            default: null
        }
    },
    { _id: false, strict: "throw" }
);

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 120
        },
        fullName: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 120
        },
        dateOfBirth: {
            type: Date,
            default: null
        },
        gender: {
            type: String,
            enum: ["male", "female", "other", "prefer_not_to_say"],
            default: "prefer_not_to_say"
        },
        profession: {
            type: String,
            trim: true,
            maxlength: 120,
            default: ""
        },
        professionDetails: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({})
        },
        mobile: {
            type: String,
            required: true,
            trim: true,
            maxlength: 20
        },
        mobileNormalized: {
            type: String,
            required: true,
            maxlength: 20,
            select: false
        },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            maxlength: 254,
            match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        },
        passwordHash: {
            type: String,
            required: true,
            select: false
        },
        role: {
            type: String,
            enum: ["superadmin", "admin", "user"],
            default: "user",
            index: true
        },
        country: {
            type: String,
            trim: true,
            maxlength: 120,
            default: ""
        },
        state: {
            type: String,
            trim: true,
            maxlength: 120,
            default: ""
        },
        district: {
            type: String,
            trim: true,
            maxlength: 120,
            default: ""
        },
        city: {
            type: String,
            trim: true,
            maxlength: 120,
            default: ""
        },
        villageTown: {
            type: String,
            trim: true,
            maxlength: 120,
            default: ""
        },
        pincode: {
            type: String,
            trim: true,
            maxlength: 12,
            default: ""
        },
        emailVerification: {
            type: verificationCodeSchema,
            default: () => ({})
        },
        mobileVerification: {
            type: verificationCodeSchema,
            default: () => ({})
        },
        verificationStatus: {
            emailVerified: {
                type: Boolean,
                default: false,
                index: true
            },
            mobileVerified: {
                type: Boolean,
                default: false,
                index: true
            }
        },
        subscription: {
            type: subscriptionSchema,
            default: () => ({})
        },
        payment_status: {
            type: String,
            enum: ["paid", "unpaid"],
            default: "unpaid",
            index: true
        },
        sessionVersion: {
            type: Number,
            default: 0,
            min: 0
        },
        otp: {
            type: String,
            default: null,
            maxlength: 128
        },
        otp_expiry: {
            type: Date,
            default: null
        },
        paymentGateway: {
            type: String,
            enum: ["pending", "demo", "manual", "razorpay", "upi", "googlepay", "phonepe", "qrcode", "waived"],
            default: "pending"
        },
        paymentAmount: {
            type: Number,
            default: 0,
            min: 0
        },
        paymentCurrency: {
            type: String,
            default: "INR",
            trim: true,
            uppercase: true,
            minlength: 3,
            maxlength: 3
        },
        paymentOrderId: {
            type: String,
            default: null
        },
        paymentId: {
            type: String,
            default: null
        },
        paymentSignature: {
            type: String,
            default: null
        },
        paymentVerifiedAt: {
            type: Date,
            default: null
        },
        pendingPlanId: {
            type: String,
            enum: ["basic_platinum", "platinum", "silver", "gold", "diamond", null],
            default: null
        },
        lastLoginAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true,
        strict: "throw",
        minimize: false
    }
);

userSchema.index(
    { mobileNormalized: 1 },
    {
        unique: true
    }
);

userSchema.index({ "subscription.plan": 1, "subscription.status": 1 });
userSchema.index({ "subscription.expiresAt": 1, "subscription.renewalRequired": 1 });
userSchema.index({ "subscription.trialExpiresAt": 1, "subscription.trialStatus": 1 });

userSchema.index(
    { paymentOrderId: 1 },
    {
        unique: true,
        partialFilterExpression: { paymentOrderId: { $type: "string" } }
    }
);
userSchema.index(
    { paymentId: 1 },
    {
        unique: true,
        partialFilterExpression: { paymentId: { $type: "string" } }
    }
);
userSchema.index(
    { "subscription.transactionId": 1 },
    {
        unique: true,
        partialFilterExpression: { "subscription.transactionId": { $type: "string" } }
    }
);

userSchema.pre("validate", function normalizeUser(next) {
    this.name = String(this.fullName || this.name || "")
        .trim()
        .replace(/\s+/g, " ");
    this.fullName = this.name;
    this.email = String(this.email || "").trim().toLowerCase();
    this.mobile = String(this.mobile || "").trim();
    this.mobileNormalized = this.mobile.replace(/\D+/g, "");

    this.country = String(this.country || "").trim();
    this.state = String(this.state || "").trim();
    this.district = String(this.district || "").trim();
    this.city = String(this.city || "").trim();
    this.villageTown = String(this.villageTown || "").trim();
    this.pincode = String(this.pincode || "").trim();

    if (this.subscription?.paymentStatus === "paid" || this.role === "admin" || this.role === "superadmin") {
        this.payment_status = "paid";
    } else if (this.subscription?.trialStatus === "active") {
        this.payment_status = "unpaid";
    } else {
        this.payment_status = "unpaid";
    }

    if (this.subscription) {
        this.paymentAmount = this.subscription.paymentAmount ?? this.paymentAmount;
        this.paymentCurrency = this.subscription.currency || this.paymentCurrency;
    }

    next();
});

module.exports = mongoose.model("User", userSchema);
