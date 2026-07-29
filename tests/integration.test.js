process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "integration-test-secret";
process.env.ADMIN_EMAIL = "admin.integration@example.com";
process.env.ALLOW_DEMO_PAYMENTS = "true";
process.env.AUTH_RATE_LIMIT_MAX = "5000";
process.env.API_RATE_LIMIT_MAX = "5000";
process.env.MONGODB_URI = `mongodb://127.0.0.1:27017/chemistry_lab_integration_${Date.now()}`;

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { startServer } = require("../server");
const User = require("../models/User");
const Element = require("../models/Element");
const AuditLog = require("../models/AuditLog");
const { Feedback, Sheet } = require("../database");

let server;
let baseUrl;
let trialCookie;
let trialActivationCode;
let adminCookie;
let adminActivationCode;

function extractCookie(response) {
    const raw = response.headers.get("set-cookie") || "";
    return raw.split(";")[0];
}

async function request(path, options = {}) {
    const headers = {
        Accept: "application/json",
        ...(options.headers || {})
    };

    if (options.cookie) {
        headers.Cookie = options.cookie;
    }

    if (options.body !== undefined && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${baseUrl}${path}`, {
        method: options.method || "GET",
        headers,
        body: options.rawBody !== undefined ? options.rawBody : options.body !== undefined ? JSON.stringify(options.body) : undefined
    });

    const text = await response.text();
    let body = text;

    try {
        body = text ? JSON.parse(text) : null;
    } catch (error) {
        body = text;
    }

    return { response, body };
}

async function registerProfileUser({
    fullName,
    email,
    mobile,
    password,
    country = "India",
    state = "Karnataka",
    district = "Belagavi",
    city = "Belagavi",
    villageTown = "Belagavi",
    pincode = "590001"
}) {
    return request("/api/auth/register", {
        method: "POST",
        body: {
            fullName,
            dateOfBirth: "1995-01-15",
            gender: "male",
            profession: "Researcher",
            mobile,
            email,
            country,
            state,
            district,
            city,
            villageTown,
            pincode,
            password
        }
    });
}

test.before(async () => {
    const started = await startServer({ port: 0 });
    server = started.server;
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const trialRegistration = await registerProfileUser({
        fullName: "Trial Researcher",
        email: "trial.user@example.com",
        mobile: "+91 9876543210",
        password: "Password123!"
    });

    assert.equal(trialRegistration.response.status, 201);
    trialCookie = extractCookie(trialRegistration.response);
    trialActivationCode = trialRegistration.body.activationCode;

    const adminRegistration = await registerProfileUser({
        fullName: "Admin Operator",
        email: "admin.integration@example.com",
        mobile: "+91 9999999999",
        password: "Password123!"
    });

    assert.equal(adminRegistration.response.status, 201);
    adminActivationCode = adminRegistration.body.activationCode;

    const adminLogin = await request("/api/auth/login", {
        method: "POST",
        body: {
            identifier: "admin.integration@example.com",
            password: "Password123!"
        }
    });

    assert.equal(adminLogin.response.status, 200);
    adminCookie = extractCookie(adminLogin.response);
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase().catch(() => undefined);
    await mongoose.disconnect().catch(() => undefined);
});

test("registers with profile validation and locks workspace until plan selection", async () => {
    const me = await request("/api/auth/me", { cookie: trialCookie });
    assert.equal(me.response.status, 200);
    assert.equal(me.body.user.subscription.plan, "basic_platinum");
    assert.equal(me.body.user.subscription.trialStatus, "not_started");
    assert.equal(me.body.user.access.accessGranted, false);
    assert.equal(me.body.user.access.needsMembershipSelection, true);
    assert.equal(me.body.user.verificationStatus.mobileVerified, true);
    assert.equal(me.body.user.verificationStatus.emailVerified, true);

    const trialSelection = await request("/api/auth/pay", {
        method: "POST",
        cookie: trialCookie,
        body: {
            planId: "basic_platinum",
            paymentMethod: "manual"
        }
    });

    assert.equal(trialSelection.response.status, 200);
    assert.equal(trialSelection.body.redirectTo, "/dashboard");
    assert.equal(trialSelection.body.user.subscription.trialStatus, "active");
    assert.equal(trialSelection.body.user.access.accessGranted, true);
    assert.ok(trialSelection.body.user.subscription.daysRemaining > 0);
    trialCookie = extractCookie(trialSelection.response);
    trialActivationCode = trialSelection.body.activationCode;
});

test("prevents duplicate email and duplicate mobile registration", async () => {
    const duplicateEmailRequest = await request("/api/auth/verification/email/request", {
        method: "POST",
        body: { email: "trial.user@example.com" }
    });
    assert.equal(duplicateEmailRequest.response.status, 409);

    const duplicateMobileRequest = await request("/api/auth/verification/mobile/request", {
        method: "POST",
        body: { mobile: "+91 9876543210" }
    });
    assert.equal(duplicateMobileRequest.response.status, 409);
});

test("logs in using email or mobile plus password", async () => {
    const logout = await request("/api/auth/logout", { method: "POST", cookie: trialCookie });
    assert.equal(logout.response.status, 200);

    const emailLogin = await request("/api/auth/login", {
        method: "POST",
        body: {
            identifier: "trial.user@example.com",
            password: "Password123!"
        }
    });
    assert.equal(emailLogin.response.status, 200);
    assert.equal(emailLogin.body.redirectTo, "/dashboard");

    const mobileLogin = await request("/api/auth/login", {
        method: "POST",
        body: {
            identifier: "+91 9876543210",
            password: "Password123!"
        }
    });
    assert.equal(mobileLogin.response.status, 200);
});

test("blocks expired memberships and redirects renewal flow", async () => {
    const user = await User.findOne({ email: "trial.user@example.com" });
    user.subscription.trialStatus = "expired";
    user.subscription.status = "renewal_required";
    user.subscription.renewalRequired = true;
    user.subscription.trialExpiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    user.payment_status = "unpaid";
    user.sessionVersion += 1;
    await user.save();

    const renewalLogin = await request("/api/auth/login", {
        method: "POST",
        body: {
            identifier: "trial.user@example.com",
            password: "Password123!"
        }
    });

    assert.equal(renewalLogin.response.status, 403);
    assert.equal(renewalLogin.body.redirectTo, "/renewal");

    const renewalCookie = extractCookie(renewalLogin.response);
    const membershipMe = await request("/api/auth/me", { cookie: renewalCookie });
    assert.equal(membershipMe.response.status, 200);
    assert.equal(membershipMe.body.user.access.needsRenewal, true);

    const paidActivation = await request("/api/auth/pay", {
        method: "POST",
        cookie: renewalCookie,
        body: {
            planId: "silver",
            paymentMethod: "manual"
        }
    });

    assert.equal(paidActivation.response.status, 200);
    assert.equal(paidActivation.body.redirectTo, "/dashboard");

    const renewedCookie = extractCookie(paidActivation.response);
    const renewedSession = await request("/api/auth/me", { cookie: renewedCookie });
    assert.equal(renewedSession.response.status, 200);
    assert.equal(renewedSession.body.user.subscription.plan, "silver");
    trialCookie = renewedCookie;
    trialActivationCode = paidActivation.body.activationCode;
});

test("restores 118 elements and keeps atomic numbers backend-only by default", async () => {
    assert.equal(await Element.countDocuments(), 118);

    const publicElements = await request("/api/elements", { cookie: trialCookie });
    assert.equal(publicElements.response.status, 200);
    assert.ok(Array.isArray(publicElements.body));
    assert.equal(publicElements.body.length, 118);
    assert.equal("atomicNumber" in publicElements.body[0], false);

    const adminElements = await request("/api/elements?includeAtomicNumber=true", { cookie: adminCookie });
    assert.equal(adminElements.response.status, 200);
    assert.equal(adminElements.body[0].atomicNumber, 1);
});

test("generates formulas from Mongo-backed elements and matches compounds", async () => {
    const water = await request("/api/formula/resolve", {
        method: "POST",
        cookie: trialCookie,
        body: { inputs: ["Hydrogen", "Hydrogen", "Oxygen"] }
    });
    assert.equal(water.response.status, 200);
    assert.deepEqual(
        { formula: water.body.formula, name: water.body.name, matched: water.body.matched },
        { formula: "H2O", name: "Water", matched: true }
    );

    const salt = await request("/api/formula/resolve", {
        method: "POST",
        cookie: trialCookie,
        body: { inputs: ["Sodium", "Chlorine"] }
    });
    assert.equal(salt.body.formula, "NaCl");
    assert.equal(salt.body.name, "Sodium Chloride");

    const criticalExamples = [
        {
            inputs: ["Hydrogen", "Hydrogen", "Oxygen", "Oxygen"],
            formula: "H2O2",
            name: "Hydrogen Peroxide"
        },
        {
            inputs: ["Carbon", "Hydrogen", "Hydrogen", "Hydrogen", "Hydrogen"],
            formula: "CH4",
            name: "Methane"
        },
        {
            inputs: ["Calcium", "Oxygen"],
            formula: "CaO",
            name: "Calcium Oxide"
        },
        {
            inputs: ["Hydrogen", "Hydrogen", "Sulfur", "Oxygen", "Oxygen", "Oxygen", "Oxygen"],
            formula: "H2SO4",
            name: "Sulfuric Acid"
        }
    ];

    for (const example of criticalExamples) {
        const resolved = await request("/api/formula/resolve", {
            method: "POST",
            cookie: trialCookie,
            body: { inputs: example.inputs }
        });

        assert.equal(resolved.response.status, 200);
        assert.equal(resolved.body.formula, example.formula);
        assert.equal(resolved.body.name, example.name);
        assert.equal(resolved.body.compound.formula, example.formula);
    }
});

test("stores feedback once and returns thank-you metadata", async () => {
    const payload = {
        overallExperience: "Excellent",
        easeOfUse: "Very Easy",
        chemicalAccuracy: "Yes",
        speedRating: "Good",
        learningValue: "Strongly Agree",
        futureUsage: "Definitely",
        recommendation: "Yes",
        suggestions: "Keep improving the compound coverage."
    };

    const submitted = await request("/api/feedback", {
        method: "POST",
        cookie: trialCookie,
        body: payload
    });

    assert.equal(submitted.response.status, 201);
    assert.ok(submitted.body.feedback.id);
    assert.ok(submitted.body.feedback.createdAt);
    assert.ok(await Feedback.findById(submitted.body.feedback.id));
    assert.equal(await Feedback.countDocuments(), 1);

    const duplicate = await request("/api/feedback", {
        method: "POST",
        cookie: trialCookie,
        body: payload
    });

    assert.equal(duplicate.response.status, 409);
});

test("blocks unauthorized writes and rejects NoSQL and XSS probes", async () => {
    const noAuth = await request("/api/compounds");
    assert.equal(noAuth.response.status, 401);

    const userCreate = await request("/api/compounds", {
        method: "POST",
        cookie: trialCookie,
        body: {
            name: "User Should Not Create",
            formula: "U1",
            inputs: ["H", "H"]
        }
    });
    assert.equal(userCreate.response.status, 403);

    const loginInjection = await request("/api/auth/login", {
        method: "POST",
        body: {
            identifier: { $ne: null },
            password: "Password123!"
        }
    });
    assert.equal(loginInjection.response.status, 400);

    const xssProbe = await request("/api/formula/resolve", {
        method: "POST",
        cookie: trialCookie,
        body: {
            inputs: ["<script>alert(1)</script>"]
        }
    });
    assert.equal(xssProbe.response.status, 400);
});

test("supports concurrent sheet saves without duplicates", async () => {
    await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
            request("/api/save", {
                method: "POST",
                cookie: trialCookie,
                body: {
                    name: "ConcurrentSheet",
                    data: { version: index }
                }
            })
        )
    );

    assert.equal(await Sheet.countDocuments({ name: "ConcurrentSheet" }), 1);
});

test("exposes protected admin analytics and user monitoring", async () => {
    const overview = await request("/api/admin/analytics/overview", { cookie: adminCookie });
    assert.equal(overview.response.status, 200);
    assert.ok(overview.body.activeUsers >= 1);
    assert.ok(overview.body.onlineUsers >= 1);
    assert.ok(overview.body.revenue.amount >= 999);

    const users = await request("/api/admin/users?filter=paid", { cookie: adminCookie });
    assert.equal(users.response.status, 200);
    assert.ok(users.body.items.some((entry) => entry.email === "trial.user@example.com"));

    const sessions = await request("/api/admin/sessions", { cookie: adminCookie });
    assert.equal(sessions.response.status, 200);
    assert.ok(Array.isArray(sessions.body.items));

    const auditFeed = await request("/api/admin/audit-logs?limit=20", { cookie: adminCookie });
    assert.equal(auditFeed.response.status, 200);
    assert.ok(auditFeed.body.items.length > 0);
    assert.ok(await AuditLog.countDocuments({ event: "auth.login.success" }) >= 2);
});
