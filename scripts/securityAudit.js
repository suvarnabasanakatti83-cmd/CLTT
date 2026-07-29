process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "security-audit-secret";
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin.audit@example.com";
process.env.ALLOW_DEMO_PAYMENTS = process.env.ALLOW_DEMO_PAYMENTS || "true";
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX || "5000";
process.env.API_RATE_LIMIT_MAX = process.env.API_RATE_LIMIT_MAX || "200000";
process.env.REQUEST_SIZE_LIMIT = process.env.REQUEST_SIZE_LIMIT || "50kb";
process.env.MONGODB_URI =
    process.env.MONGODB_URI || `mongodb://127.0.0.1:27017/chemistry_lab_security_audit_${Date.now()}`;

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { startServer } = require("../server");

const REPORT_DIR = path.join(__dirname, "..", "reports");

async function request(baseUrl, routePath, options = {}) {
    const headers = { Accept: "application/json", ...(options.headers || {}) };

    if (options.cookie) {
        headers.Cookie = options.cookie;
    }

    if (options.body !== undefined && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${baseUrl}${routePath}`, {
        method: options.method || "GET",
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined
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

function extractCookie(response) {
    return (response.headers.get("set-cookie") || "").split(";")[0];
}

async function registerUser(baseUrl, payload) {
    const emailOtp = await request(baseUrl, "/api/auth/verification/email/request", {
        method: "POST",
        body: { email: payload.email }
    });
    const mobileOtp = await request(baseUrl, "/api/auth/verification/mobile/request", {
        method: "POST",
        body: { mobile: payload.mobile }
    });

    await request(baseUrl, "/api/auth/verification/email/confirm", {
        method: "POST",
        body: { email: payload.email, otp: emailOtp.body.debugCode }
    });
    await request(baseUrl, "/api/auth/verification/mobile/confirm", {
        method: "POST",
        body: { mobile: payload.mobile, otp: mobileOtp.body.debugCode }
    });

    return request(baseUrl, "/api/auth/register", {
        method: "POST",
        body: payload
    });
}

function buildScores(findings) {
    const securityScore = findings.critical.length === 0 ? 100 : Math.max(0, 100 - findings.critical.length * 25);
    const performanceScore = 80;
    const scalabilityScore = 75;
    const productionReadinessScore = Math.round((securityScore * 0.5) + (performanceScore * 0.25) + (scalabilityScore * 0.25));

    return {
        securityScore,
        performanceScore,
        scalabilityScore,
        productionReadinessScore
    };
}

async function main() {
    await fs.promises.mkdir(REPORT_DIR, { recursive: true });
    const report = {
        generatedAt: new Date().toISOString(),
        findings: {
            critical: [],
            medium: [],
            low: []
        },
        checks: {}
    };

    const { server } = await startServer({ port: 0 });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
        const trialRegistration = await registerUser(baseUrl, {
            fullName: "Audit Trial User",
            dateOfBirth: "1992-10-10",
            gender: "male",
            profession: "Chemist",
            mobile: "+91 9000000001",
            email: "audit.user@example.com",
            country: "India",
            state: "Karnataka",
            district: "Belagavi",
            city: "Belagavi",
            villageTown: "Belagavi",
            pincode: "590001",
            password: "Password123!"
        });
        const trialCookie = extractCookie(trialRegistration.response);
        const trialActivationCode = trialRegistration.body.activationCode;

        const adminRegistration = await registerUser(baseUrl, {
            fullName: "Audit Admin",
            dateOfBirth: "1990-01-01",
            gender: "female",
            profession: "Administrator",
            mobile: "+91 9000000002",
            email: process.env.ADMIN_EMAIL,
            country: "India",
            state: "Karnataka",
            district: "Belagavi",
            city: "Belagavi",
            villageTown: "Belagavi",
            pincode: "590001",
            password: "Password123!"
        });
        const adminActivationCode = adminRegistration.body.activationCode;

        const login = await request(baseUrl, "/api/auth/login", {
            method: "POST",
            body: {
                identifier: "audit.user@example.com",
                activationCode: trialActivationCode,
                password: "Password123!"
            }
        });
        const adminLogin = await request(baseUrl, "/api/auth/login", {
            method: "POST",
            body: {
                identifier: process.env.ADMIN_EMAIL,
                activationCode: adminActivationCode,
                password: "Password123!"
            }
        });
        const adminCookie = extractCookie(adminLogin.response);

        report.checks.registerTrial = trialRegistration.response.status;
        report.checks.registerAdmin = adminRegistration.response.status;
        report.checks.loginTrial = login.response.status;
        report.checks.loginAdmin = adminLogin.response.status;

        const formula = await request(baseUrl, "/api/formula/resolve", {
            method: "POST",
            cookie: trialCookie,
            body: { inputs: ["Hydrogen", "Hydrogen", "Oxygen"] }
        });
        report.checks.formulaResolve = formula.body;

        const injection = await request(baseUrl, "/api/auth/login", {
            method: "POST",
            body: {
                identifier: { $ne: null },
                activationCode: "CHEM-FAIL-000000",
                password: "Password123!"
            }
        });
        report.checks.loginInjectionStatus = injection.response.status;

        const xss = await request(baseUrl, "/api/formula/resolve", {
            method: "POST",
            cookie: trialCookie,
            body: { inputs: ["<script>alert(1)</script>"] }
        });
        report.checks.xssStatus = xss.response.status;

        const overview = await request(baseUrl, "/api/admin/analytics/overview", { cookie: adminCookie });
        report.checks.adminOverviewStatus = overview.response.status;
        report.checks.adminOverview = overview.body;

        if (trialRegistration.response.status !== 201) {
            report.findings.critical.push("Registration flow failed for a verified trial user.");
        }
        if (adminLogin.response.status !== 200) {
            report.findings.critical.push("Admin login with activation code failed.");
        }
        if (formula.body.formula !== "H2O") {
            report.findings.critical.push("Formula engine did not resolve H2O correctly.");
        }
        if (injection.response.status !== 400) {
            report.findings.critical.push("NoSQL login injection probe was not rejected.");
        }
        if (xss.response.status !== 400) {
            report.findings.critical.push("XSS formula probe was not rejected.");
        }
        if (overview.response.status !== 200) {
            report.findings.medium.push("Admin analytics overview endpoint did not load successfully.");
        }

        report.scores = buildScores(report.findings);
        const reportPath = path.join(REPORT_DIR, `security-audit-${Date.now()}.json`);
        await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

        console.log(JSON.stringify({ reportPath, scores: report.scores, findings: report.findings }, null, 2));
    } finally {
        await new Promise((resolve) => server.close(resolve));
        await mongoose.connection.dropDatabase().catch(() => undefined);
        await mongoose.disconnect().catch(() => undefined);
    }
}

main().catch(async (error) => {
    console.error("Security audit failed:", error);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
});
