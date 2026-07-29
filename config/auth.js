const DEFAULT_JWT_SECRET = "chemistry-lab-super-secret";
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
const JWT_ISSUER = "chemistry-lab-api";
const JWT_AUDIENCE = "chemistry-lab-client";
const COOKIE_NAME = "chem_lab_token";

const JWT_SIGN_OPTIONS = {
    algorithm: "HS256",
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
};

const JWT_VERIFY_OPTIONS = {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
};

function assertSecureJwtConfig() {
    if (process.env.NODE_ENV !== "production") {
        return;
    }

    if (JWT_SECRET === DEFAULT_JWT_SECRET || JWT_SECRET === "your_secret") {
        throw new Error("JWT_SECRET must be configured in production.");
    }

    if (!process.env.MONGODB_URI) {
        throw new Error("MONGODB_URI must be configured in production.");
    }

    if (!process.env.CORS_ORIGINS) {
        throw new Error("CORS_ORIGINS must be configured in production.");
    }
}

module.exports = {
    COOKIE_NAME,
    JWT_AUDIENCE,
    JWT_ISSUER,
    JWT_SECRET,
    JWT_SIGN_OPTIONS,
    JWT_VERIFY_OPTIONS,
    assertSecureJwtConfig
};
