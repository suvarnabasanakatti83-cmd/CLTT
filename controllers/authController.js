const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const UserSession = require("../models/UserSession");
const VerificationChallenge = require("../models/VerificationChallenge");
const { sendEmail } = require("../utils/email");
const { logAuditEvent } = require("../utils/auditLogger");
const {
    evaluateSubscriptionState,
    hashActivationCode,
    issueActivationCode,
    preserveAccessState
} = require("../utils/subscription");
const {
    RequestValidationError,
    assertAllowedKeys,
    optionalString,
    requireDateString,
    requireEmail,
    requireEnum,
    requireMobile,
    requirePassword,
    requireString
} = require("../utils/validation");
const {
    COOKIE_NAME,
    JWT_SECRET,
    JWT_SIGN_OPTIONS,
    JWT_VERIFY_OPTIONS
} = require("../config/auth");
const { clearAuthCookie, resolveAuthenticatedUser } = require("../middleware/authMiddleware");

const PAYMENT_CURRENCY = "INR";
const PRIMARY_ADMIN_EMAIL = "suvarnabasanakatti83@gmail.com";
const ENV_ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const ADMIN_EMAILS = new Set(
    [PRIMARY_ADMIN_EMAIL, ENV_ADMIN_EMAIL]
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
);
const GENDER_VALUES = ["male", "female", "other", "prefer_not_to_say"];
const EMAIL_OTP_EXPIRY_MS = 10 * 60 * 1000;
const MOBILE_OTP_EXPIRY_MS = 10 * 60 * 1000;
const VERIFICATION_TTL_MS = 30 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = Number(process.env.OTP_RESEND_COOLDOWN_MS || 45 * 1000);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const FIREBASE_TEST_PHONE_NUMBERS = parseTestPhoneNumbers(process.env.FIREBASE_TEST_PHONE_NUMBERS || "");

function hashOtp(otp) {
    return crypto.createHash("sha256").update(String(otp)).digest("hex");
}

function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function parseTestPhoneNumbers(value) {
    return String(value || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .reduce((acc, entry) => {
            const [phone, code] = entry.split(":").map((part) => String(part || "").trim());
            const normalizedPhone = normalizeMobile(phone);
            if (!normalizedPhone || !/^\d{6}$/.test(code)) {
                return acc;
            }

            acc.set(normalizedPhone, code);
            return acc;
        }, new Map());
}

function normalizeMobile(value) {
    return String(value || "").replace(/\D+/g, "");
}

function isProduction() {
    return process.env.NODE_ENV === "production";
}

function getRole(user) {
    return user?.role === "superadmin" ? "superadmin" : user?.role === "admin" ? "admin" : "user";
}

function isAdminEmail(email) {
    return ADMIN_EMAILS.has(String(email || "").trim().toLowerCase());
}

function setAuthCookie(res, token) {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
}

async function createSessionForUser(user, req, purpose = "auth") {
    const sessionId = crypto.randomUUID();

    await UserSession.create({
        sessionId,
        userId: user._id,
        role: getRole(user),
        purpose,
        ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || null,
        userAgent: req.headers["user-agent"] || null,
        loginAt: new Date(),
        lastSeenAt: new Date(),
        lastActivity: "auth.login.success"
    });

    return sessionId;
}

function signToken(user, purpose = "auth", sessionId = null) {
    return jwt.sign(
        {
            id: String(user._id),
            role: getRole(user),
            payment_status: user.payment_status === "paid" ? "paid" : "unpaid",
            purpose,
            sessionVersion: Number(user.sessionVersion || 0),
            sessionId
        },
        JWT_SECRET,
        {
            ...JWT_SIGN_OPTIONS,
            expiresIn: "7d"
        }
    );
}

function createPasswordResetToken(user) {
    return jwt.sign(
        {
            id: String(user._id),
            purpose: "password_reset",
            sessionVersion: Number(user.sessionVersion || 0)
        },
        JWT_SECRET,
        {
            ...JWT_SIGN_OPTIONS,
            expiresIn: "15m"
        }
    );
}

function sanitizeUser(user) {
    const access = evaluateSubscriptionState(user);

    return {
        id: user._id,
        name: user.name,
        fullName: user.fullName,
        email: user.email,
        mobile: user.mobile,
        role: getRole(user),
        gender: user.gender,
        profession: user.profession,
        professionDetails: user.professionDetails || {},
        dateOfBirth: user.dateOfBirth,
        address: {
            country: user.country,
            state: user.state,
            district: user.district,
            city: user.city,
            villageTown: user.villageTown,
            pincode: user.pincode
        },
        verificationStatus: user.verificationStatus,
        payment_status: user.payment_status,
        paymentGateway: user.paymentGateway,
        paymentVerifiedAt: user.paymentVerifiedAt,
        createdAt: user.createdAt,
        access
    };
}

async function sendActivationCodeEmail(user, activationCode, contextLabel) {
    if (!user?.email || !activationCode) {
        return;
    }

    await sendEmail({
        to: user.email,
        subject: "Chemistry Lab activation code",
        text: `Your Chemistry Lab ${contextLabel} activation code is ${activationCode}. Keep it secure for login access.`
    });
}

function handleControllerError(res, error, fallbackMessage) {
    if (error instanceof RequestValidationError) {
        return res.status(400).json({
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

    console.error(fallbackMessage, error);
    return res.status(500).json({ message: fallbackMessage });
}

async function syncAdminAccess(user) {
    if (!user || !isAdminEmail(user.email)) {
        return { user, activationCode: null };
    }

    preserveAccessState(user);

    let changed = false;
    let activationCode = null;
    const now = new Date();
    const superAdmin = PRIMARY_ADMIN_EMAIL === String(user.email || "").trim().toLowerCase();

    if (user.role !== (superAdmin ? "superadmin" : "admin")) {
        user.role = superAdmin ? "superadmin" : "admin";
        changed = true;
    }

    if (!user.subscription) {
        user.subscription = {};
        changed = true;
    }

    if (!user.subscription.activationCodeHash) {
        activationCode = issueActivationCode(user);
        changed = true;
    }

    user.subscription.plan = "basic_platinum";
    user.subscription.tier = "internal";
    user.subscription.status = "active";
    user.subscription.trialStatus = "active";
    user.subscription.paymentStatus = "waived";
    user.subscription.price = 0;
    user.subscription.paymentAmount = 0;
    user.subscription.transactionId = `waived-${user._id}`;
    user.subscription.startedAt = user.subscription.startedAt || now;
    user.subscription.purchaseDate = user.subscription.purchaseDate || now;
    user.subscription.expiresAt = new Date(now.getTime() + 3650 * 24 * 60 * 60 * 1000);
    user.subscription.renewalRequired = false;
    user.payment_status = "paid";
    user.paymentGateway = "waived";
    user.paymentAmount = 0;
    user.paymentCurrency = PAYMENT_CURRENCY;
    user.paymentVerifiedAt = user.paymentVerifiedAt || now;
    user.pendingPlanId = null;

    if (!user.verificationStatus?.emailVerified) {
        user.verificationStatus.emailVerified = true;
        user.emailVerification = {
            ...(user.emailVerification || {}),
            verifiedAt: now
        };
        changed = true;
    }

    if (!user.verificationStatus?.mobileVerified) {
        user.verificationStatus.mobileVerified = true;
        user.mobileVerification = {
            ...(user.mobileVerification || {}),
            verifiedAt: now
        };
        changed = true;
    }

    if (changed || user.isModified()) {
        await user.save();
    }

    return { user, activationCode };
}

function buildVerificationResponse(code) {
    if (isProduction()) {
        return {};
    }

    return { debugCode: code };
}

function getFirebaseClientConfig() {
    const config = {
        apiKey: process.env.FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY || "",
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
        projectId: process.env.FIREBASE_PROJECT_ID || "",
        appId: process.env.FIREBASE_APP_ID || "",
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || ""
    };

    return config.apiKey && config.authDomain && config.projectId && config.appId ? config : null;
}

function getTestPhoneCode(target) {
    return FIREBASE_TEST_PHONE_NUMBERS.get(normalizeMobile(target)) || null;
}

function buildRegistrationConfig() {
    const firebaseClientConfig = getFirebaseClientConfig();

    return {
        authFlow: {
            emailRequired: true,
            passwordRequired: true,
            mobileRequired: true,
            activationCodeRequired: false
        },
        verification: {
            emailOtpRequired: false,
            mobileOtpRequired: false,
            provider: "profile-validation",
            otpLength: 0,
            resendCooldownSeconds: 0,
            maxAttempts: 0
        },
        developerTesting: {
            enabled: !isProduction(),
            activationBypassForPrivilegedAccounts: true,
            testPhoneNumbersConfigured: FIREBASE_TEST_PHONE_NUMBERS.size > 0
        },
        firebase: {
            enabled: Boolean(firebaseClientConfig),
            clientConfig: firebaseClientConfig,
            testMode: !isProduction(),
            testPhoneNumbers: Array.from(FIREBASE_TEST_PHONE_NUMBERS.keys())
        }
    };
}

function validateVerificationRequestPayload(body, channel) {
    const payload = assertAllowedKeys(body, [channel], "body");
    return channel === "email"
        ? { target: requireEmail(payload.email) }
        : { target: requireMobile(payload.mobile), targetNormalized: normalizeMobile(payload.mobile) };
}

function validateVerificationConfirmPayload(body, channel) {
    const payload = assertAllowedKeys(body, [channel, "otp"], "body");
    return {
        target: channel === "email" ? requireEmail(payload.email) : requireMobile(payload.mobile),
        targetNormalized: channel === "email" ? undefined : normalizeMobile(payload.mobile),
        otp: requireString(payload.otp, "otp", {
            minLength: 6,
            maxLength: 6,
            pattern: /^\d{6}$/,
            patternMessage: "OTP must be a 6 digit code."
        })
    };
}

function validateRegistrationPayload(body) {
    const payload = assertAllowedKeys(
        body,
        [
            "fullName",
            "dateOfBirth",
            "gender",
            "profession",
            "mobile",
            "email",
            "country",
            "state",
            "district",
            "city",
            "villageTown",
            "pincode",
            "professionDetails",
            "password"
        ],
        "body"
    );

    return {
        fullName: requireString(payload.fullName, "fullName", { minLength: 2, maxLength: 120 }),
        dateOfBirth: payload.dateOfBirth ? requireDateString(payload.dateOfBirth, "dateOfBirth") : null,
        gender: payload.gender ? requireEnum(payload.gender, "gender", GENDER_VALUES) : "prefer_not_to_say",
        profession: optionalString(payload.profession, "profession", { maxLength: 120, defaultValue: "" }) || "",
        professionDetails: payload.professionDetails && typeof payload.professionDetails === "object" && !Array.isArray(payload.professionDetails)
            ? Object.fromEntries(
                Object.entries(payload.professionDetails)
                    .slice(0, 30)
                    .map(([key, value]) => [
                        String(key).replace(/[^A-Za-z0-9_ -]/g, "").slice(0, 60),
                        String(value || "").trim().slice(0, 300)
                    ])
                    .filter(([key]) => key)
            )
            : {},
        mobile: requireMobile(payload.mobile),
        email: requireEmail(payload.email),
        country: optionalString(payload.country, "country", { maxLength: 120, defaultValue: "" }) || "",
        state: optionalString(payload.state, "state", { maxLength: 120, defaultValue: "" }) || "",
        district: optionalString(payload.district, "district", { maxLength: 120, defaultValue: "" }) || "",
        city: optionalString(payload.city, "city", { maxLength: 120, defaultValue: "" }) || "",
        villageTown: optionalString(payload.villageTown, "villageTown", { maxLength: 120, defaultValue: "" }) || "",
        pincode: optionalString(payload.pincode, "pincode", {
            maxLength: 12,
            pattern: /^[A-Za-z0-9- ]+$/,
            patternMessage: "pincode contains unsupported characters.",
            defaultValue: ""
        }) || "",
        password: requirePassword(payload.password)
    };
}

function validateLoginPayload(body) {
    const payload = assertAllowedKeys(body, ["identifier", "email", "mobile", "activationCode", "password"], "body");
    const identifier = payload.identifier || payload.email || payload.mobile;

    return {
        identifier: requireString(identifier, "identifier", { minLength: 3, maxLength: 254 }),
        activationCode: optionalString(payload.activationCode, "activationCode", { minLength: 8, maxLength: 64 }),
        password: requireString(payload.password, "password", {
            minLength: 1,
            maxLength: 72,
            trim: false
        })
    };
}

function validateForgotPasswordPayload(body) {
    const payload = assertAllowedKeys(body, ["email"], "body");
    return { email: requireEmail(payload.email) };
}

function validateResetPasswordPayload(body) {
    const payload = assertAllowedKeys(body, ["resetToken", "newPassword"], "body");

    return {
        resetToken: requireString(payload.resetToken, "resetToken", { maxLength: 2000 }),
        newPassword: requirePassword(payload.newPassword, "newPassword")
    };
}

async function findLatestChallenge(channel, target) {
    const normalized = channel === "email" ? String(target).trim().toLowerCase() : normalizeMobile(target);
    return VerificationChallenge.findOne({
        purpose: "registration",
        channel,
        targetNormalized: normalized
    })
        .sort({ createdAt: -1 })
        .select("+codeHash");
}

async function requireVerifiedChallenge(channel, target) {
    const normalized = channel === "email" ? String(target).trim().toLowerCase() : normalizeMobile(target);
    const challenge = await VerificationChallenge.findOne({
        purpose: "registration",
        channel,
        targetNormalized: normalized,
        consumedAt: null
    }).sort({ createdAt: -1 });

    if (!challenge || !challenge.verifiedAt || challenge.verifiedAt.getTime() + VERIFICATION_TTL_MS < Date.now()) {
        throw new RequestValidationError(`Please verify your ${channel} before registering.`);
    }

    return challenge;
}

async function requestVerificationCode(req, res, channel) {
    try {
        const { target, targetNormalized } = validateVerificationRequestPayload(req.body, channel);
        const normalizedTarget = channel === "email" ? target : targetNormalized;
        const latestChallenge = await findLatestChallenge(channel, target);

        if (
            latestChallenge &&
            !latestChallenge.consumedAt &&
            latestChallenge.createdAt &&
            latestChallenge.createdAt.getTime() + OTP_RESEND_COOLDOWN_MS > Date.now()
        ) {
            const retryAfterSeconds = Math.ceil(
                (latestChallenge.createdAt.getTime() + OTP_RESEND_COOLDOWN_MS - Date.now()) / 1000
            );

            return res.status(429).json({
                message: `Please wait ${retryAfterSeconds} second(s) before requesting another OTP.`,
                retryAfterSeconds
            });
        }

        if (channel === "email") {
            const existingUser = await User.findOne({ email: target }).select("_id");
            if (existingUser) {
                return res.status(409).json({ message: "An account with this email already exists." });
            }
        } else {
            const existingUser = await User.findOne({ mobileNormalized: normalizedTarget }).select("_id");
            if (existingUser) {
                return res.status(409).json({ message: "An account with this mobile number already exists." });
            }
        }

        const code = channel === "mobile" && !isProduction()
            ? getTestPhoneCode(target) || generateOtp()
            : generateOtp();
        const challenge = await VerificationChallenge.create({
            purpose: "registration",
            channel,
            target,
            targetNormalized: normalizedTarget,
            codeHash: hashOtp(code),
            expiresAt: new Date(Date.now() + (channel === "email" ? EMAIL_OTP_EXPIRY_MS : MOBILE_OTP_EXPIRY_MS)),
            metadata: {
                provider: channel === "mobile" && getFirebaseClientConfig() ? "firebase-configured" : "internal-otp",
                testPhoneNumber: Boolean(channel === "mobile" && getTestPhoneCode(target))
            }
        });

        if (channel === "email") {
            await sendEmail({
                to: target,
                subject: "Chemistry Lab email verification code",
                text: `Your Chemistry Lab email verification code is ${code}. It expires in 10 minutes.`
            });
        } else {
            console.log(`[MOBILE OTP FALLBACK] Mobile: ${target} | Code: ${code}`);
        }

        await logAuditEvent(`auth.verify.${channel}.request`, req, {
            target: channel === "email" ? target : normalizedTarget
        });

        return res.json({
            message: `${channel === "email" ? "Email" : "Mobile"} OTP sent successfully.`,
            challengeId: challenge._id,
            retryAfterSeconds: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
            ...buildVerificationResponse(code)
        });
    } catch (error) {
        return handleControllerError(res, error, `Unable to send ${channel} verification code right now.`);
    }
}

async function confirmVerificationCode(req, res, channel) {
    try {
        const payload = validateVerificationConfirmPayload(req.body, channel);
        const challenge = await findLatestChallenge(channel, payload.target);

        if (!challenge || challenge.consumedAt || !challenge.expiresAt || challenge.expiresAt.getTime() < Date.now()) {
            return res.status(400).json({ message: "OTP has expired. Request a new one." });
        }

        if (Number(challenge.attempts || 0) >= OTP_MAX_ATTEMPTS) {
            challenge.consumedAt = new Date();
            await challenge.save();
            return res.status(429).json({ message: "Too many invalid OTP attempts. Request a new code." });
        }

        challenge.attempts = Number(challenge.attempts || 0) + 1;
        if (challenge.codeHash !== hashOtp(payload.otp)) {
            if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
                challenge.consumedAt = new Date();
            }
            await challenge.save();
            await logAuditEvent(`auth.verify.${channel}.failure`, req, { target: payload.target }, "warn");
            return res.status(400).json({
                message: challenge.attempts >= OTP_MAX_ATTEMPTS
                    ? "Too many invalid OTP attempts. Request a new code."
                    : "Invalid OTP. Please check the code and try again."
            });
        }

        challenge.verifiedAt = new Date();
        await challenge.save();
        await logAuditEvent(`auth.verify.${channel}.success`, req, { target: payload.target });

        return res.json({ message: `${channel === "email" ? "Email" : "Mobile"} verified successfully.` });
    } catch (error) {
        return handleControllerError(res, error, `Unable to verify ${channel} code right now.`);
    }
}

function getRegistrationConfig(req, res) {
    return res.json(buildRegistrationConfig());
}

async function register(req, res) {
    try {
        const payload = validateRegistrationPayload(req.body);
        const existingUser = await User.findOne({
            $or: [
                { email: payload.email },
                { mobileNormalized: normalizeMobile(payload.mobile) }
            ]
        }).select("email mobile");

        if (existingUser) {
            return res.status(409).json({
                message: existingUser.email === payload.email
                    ? "An account with this email already exists."
                    : "An account with this mobile number already exists."
            });
        }

        const user = new User({
            name: payload.fullName,
            fullName: payload.fullName,
            dateOfBirth: payload.dateOfBirth ? new Date(`${payload.dateOfBirth}T00:00:00.000Z`) : null,
            gender: payload.gender,
            profession: payload.profession,
            professionDetails: payload.professionDetails,
            mobile: payload.mobile,
            email: payload.email,
            country: payload.country,
            state: payload.state,
            district: payload.district,
            city: payload.city,
            villageTown: payload.villageTown,
            pincode: payload.pincode,
            passwordHash: await bcrypt.hash(payload.password, 12),
            role: isAdminEmail(payload.email) ? (payload.email === PRIMARY_ADMIN_EMAIL ? "superadmin" : "admin") : "user",
            verificationStatus: {
                emailVerified: true,
                mobileVerified: true
            },
            emailVerification: {
                verifiedAt: new Date()
            },
            mobileVerification: {
                verifiedAt: new Date()
            },
            paymentCurrency: PAYMENT_CURRENCY
        });

        let activationCode = null;

        if (isAdminEmail(payload.email)) {
            const adminSync = await syncAdminAccess(user);
            activationCode = adminSync.activationCode;
        }

        await user.save();

        if (isAdminEmail(payload.email)) {
            await sendActivationCodeEmail(user, activationCode, "admin");
        }

        const authSessionId = await createSessionForUser(user, req, "auth");
        const token = signToken(user, "auth", authSessionId);
        setAuthCookie(res, token);

        await logAuditEvent("auth.register.success", req, {
            email: user.email,
            mobile: user.mobileNormalized,
            role: user.role
        });

        const privilegedRegistration = isAdminEmail(payload.email);
        return res.status(201).json({
            message: privilegedRegistration
                ? "Registration successful. Your admin workspace is active."
                : "Registration successful. Redirecting to your CLTT workspace.",
            user: sanitizeUser(user),
            redirectTo: privilegedRegistration ? "/admin" : "/dashboard",
            ...(process.env.NODE_ENV === "production" ? {} : { activationCode })
        });
    } catch (error) {
        return handleControllerError(res, error, "Unable to complete registration right now.");
    }
}

async function findUserByIdentifier(identifier) {
    const normalizedIdentifier = String(identifier || "").trim();
    if (normalizedIdentifier.includes("@")) {
        return User.findOne({ email: normalizedIdentifier.toLowerCase() }).select("+passwordHash +subscription.activationCodeHash");
    }

    return User.findOne({ mobileNormalized: normalizeMobile(normalizedIdentifier) }).select("+passwordHash +subscription.activationCodeHash");
}

async function login(req, res) {
    try {
        const payload = validateLoginPayload(req.body);
        const user = await findUserByIdentifier(payload.identifier);

        if (!user) {
            await logAuditEvent("auth.login.failure", req, { identifier: payload.identifier, reason: "user_not_found" }, "warn");
            return res.status(401).json({ message: "Invalid login credentials." });
        }

        const passwordMatches = await bcrypt.compare(payload.password, user.passwordHash);
        if (!passwordMatches) {
            await logAuditEvent("auth.login.failure", req, { identifier: payload.identifier, reason: "password_mismatch" }, "warn");
            return res.status(401).json({ message: "Invalid login credentials." });
        }

        const adminSync = await syncAdminAccess(user);
        const activationHash = adminSync.user.subscription?.activationCodeHash || user.subscription?.activationCodeHash;
        if (payload.activationCode && activationHash && activationHash !== hashActivationCode(payload.activationCode)) {
            await logAuditEvent("auth.login.failure", req, { identifier: payload.identifier, reason: "invalid_activation_code" }, "warn");
            return res.status(401).json({ message: "Invalid activation code." });
        }

        user.lastLoginAt = new Date();
        await user.save();

        const authSessionId = await createSessionForUser(user, req, "auth");
        const token = signToken(user, "auth", authSessionId);
        setAuthCookie(res, token);
        await logAuditEvent("auth.login.success", req, {
            userId: String(user._id),
            identifier: payload.identifier,
            sessionId: authSessionId
        });

        return res.json({
            message: "Login successful.",
            user: sanitizeUser(user),
            redirectTo: getRole(user) === "user" ? "/dashboard" : "/admin"
        });
    } catch (error) {
        return handleControllerError(res, error, "Unable to log in right now.");
    }
}

async function me(req, res) {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            clearAuthCookie(res);
            return res.status(404).json({ message: "User not found." });
        }

        return res.json({
            user: sanitizeUser(user),
            sessionPurpose: req.user.sessionPurpose
        });
    } catch (error) {
        return handleControllerError(res, error, "Unable to load user details.");
    }
}

async function logout(req, res) {
    try {
        const user = await resolveAuthenticatedUser(req).catch(() => null);

        if (user) {
            await User.updateOne({ _id: user.id }, { $inc: { sessionVersion: 1 } });
            if (user.sessionId) {
                await UserSession.updateOne(
                    { sessionId: user.sessionId },
                    {
                        $set: {
                            logoutAt: new Date(),
                            lastSeenAt: new Date(),
                            lastActivity: "auth.logout.success"
                        }
                    }
                );
            }
            await logAuditEvent("auth.logout.success", req, { userId: user.id });
        }

        clearAuthCookie(res);
        return res.json({ message: "Logout successful." });
    } catch (error) {
        clearAuthCookie(res);
        return res.json({ message: "Logout successful." });
    }
}

async function forgotPassword(req, res) {
    try {
        const { email } = validateForgotPasswordPayload(req.body);
        const user = await User.findOne({ email }).select("email otp otp_expiry sessionVersion");

        if (!user) {
            await logAuditEvent("auth.password_reset.request", req, { email, delivered: false });
            return res.json({ message: "If that email exists, an OTP has been sent." });
        }

        const otp = generateOtp();
        user.otp = hashOtp(otp);
        user.otp_expiry = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        await sendEmail({
            to: user.email,
            subject: "Chemistry Lab password reset OTP",
            text: `Your Chemistry Lab password reset OTP is ${otp}. It expires in 10 minutes.`
        });
        await logAuditEvent("auth.password_reset.request", req, { email, delivered: true });

        return res.json({ message: "If that email exists, an OTP has been sent.", ...buildVerificationResponse(otp) });
    } catch (error) {
        return handleControllerError(res, error, "Unable to process your request right now.");
    }
}

async function verifyOtp(req, res) {
    try {
        const payload = validateVerificationConfirmPayload(req.body, "email");
        const user = await User.findOne({ email: payload.target }).select("otp otp_expiry sessionVersion");

        if (
            !user ||
            !user.otp ||
            !user.otp_expiry ||
            user.otp_expiry.getTime() < Date.now() ||
            user.otp !== hashOtp(payload.otp)
        ) {
            await logAuditEvent("auth.password_reset.otp_failure", req, { email: payload.target }, "warn");
            return res.status(400).json({ message: "Invalid or expired OTP." });
        }

        await logAuditEvent("auth.password_reset.otp_success", req, { email: payload.target });
        return res.json({
            message: "OTP verified. You can now reset your password.",
            resetToken: createPasswordResetToken(user)
        });
    } catch (error) {
        return handleControllerError(res, error, "Unable to verify OTP right now.");
    }
}

async function resetPassword(req, res) {
    try {
        const payload = validateResetPasswordPayload(req.body);
        let decoded;

        try {
            decoded = jwt.verify(payload.resetToken, JWT_SECRET, JWT_VERIFY_OPTIONS);
        } catch (error) {
            return res.status(400).json({ message: "Invalid or expired reset token." });
        }

        if (decoded.purpose !== "password_reset") {
            return res.status(400).json({ message: "Invalid reset token." });
        }

        const user = await User.findById(decoded.id).select("+passwordHash otp otp_expiry sessionVersion");
        if (
            !user ||
            !user.otp ||
            !user.otp_expiry ||
            user.otp_expiry.getTime() < Date.now() ||
            Number(decoded.sessionVersion) !== Number(user.sessionVersion)
        ) {
            return res.status(400).json({ message: "Password reset session has expired." });
        }

        user.passwordHash = await bcrypt.hash(payload.newPassword, 12);
        user.otp = null;
        user.otp_expiry = null;
        user.sessionVersion += 1;
        await user.save();
        clearAuthCookie(res);
        await logAuditEvent("auth.password_reset.success", req, { userId: String(user._id) });

        return res.json({ message: "Password reset successful. Please log in." });
    } catch (error) {
        return handleControllerError(res, error, "Unable to reset password right now.");
    }
}

module.exports = {
    confirmEmailVerification: (req, res) => confirmVerificationCode(req, res, "email"),
    confirmMobileVerification: (req, res) => confirmVerificationCode(req, res, "mobile"),
    forgotPassword,
    getRegistrationConfig,
    login,
    logout,
    me,
    register,
    requestEmailVerification: (req, res) => requestVerificationCode(req, res, "email"),
    requestMobileVerification: (req, res) => requestVerificationCode(req, res, "mobile"),
    resetPassword,
    verifyOtp
};
