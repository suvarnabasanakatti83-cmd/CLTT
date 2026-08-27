require("./config/loadEnv");

const express = require("express");
const path = require("path");
const { connectDB, getDatabaseHealth, syncDatabaseIndexes } = require("./database");
const { syncCompoundsFromFile } = require("./utils/compoundSync");
const { syncElementsFromFile } = require("./utils/elementSync");
const authRoutes = require("./routes/authRoutes");
const labRoutes = require("./routes/labRoutes");
const {
    apiAuthMiddleware,
    pageAuthMiddleware
} = require("./middleware/authMiddleware");
const {
    assignRequestContext,
    requestAuditMiddleware,
    sessionActivityMiddleware
} = require("./middleware/activityMiddleware");
const { rejectDangerousRequestValues } = require("./middleware/requestValidationMiddleware");
const { errorHandler, notFoundHandler } = require("./middleware/errorMiddleware");
const {
    apiRateLimiter,
    applySecurityHeaders,
    authRateLimiter,
    compressionMiddleware,
    corsMiddleware
} = require("./middleware/securityMiddleware");
console.log("NODE_ENV =", process.env.NODE_ENV);
console.log("JWT_SECRET =", process.env.JWT_SECRET);
console.log("MONGODB_URI =", process.env.MONGODB_URI);
console.log("CORS_ORIGINS =", process.env.CORS_ORIGINS);

const { assertSecureJwtConfig } = require("./config/auth");

const REQUEST_SIZE_LIMIT = process.env.REQUEST_SIZE_LIMIT || "50kb";
const PORT = Number(process.env.PORT || 5002);
const PRIVATE_ADMIN_DIR = path.join(__dirname, "private", "admin");

function requireAdminPage(req, res, next) {
    return pageAuthMiddleware(req, res, () => {
        if (req.user.role !== "admin" && req.user.role !== "superadmin") {
            return res.redirect("/dashboard");
        }

        return next();
    });
}

function createApp() {
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", 1);
    app.set("query parser", "simple");

    app.use(assignRequestContext);
    app.use(applySecurityHeaders);
    app.use(corsMiddleware);
    app.use(compressionMiddleware);
    app.use(express.json({ limit: REQUEST_SIZE_LIMIT, strict: true }));
    app.use(express.urlencoded({ extended: false, limit: REQUEST_SIZE_LIMIT }));
    app.use(requestAuditMiddleware);

    app.get("/health", (req, res) => {
        res.json({
            status: "ok",
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || "development",
            database: getDatabaseHealth(),
            memory: process.memoryUsage()
        });
    });

    app.use(
        "/api/auth",
        authRateLimiter,
        rejectDangerousRequestValues,
        (req, res, next) => {
            res.set("Cache-Control", "no-store");
            next();
        },
        authRoutes
    );

    app.use(
        "/api",
        apiRateLimiter,
        rejectDangerousRequestValues,
        apiAuthMiddleware,
        sessionActivityMiddleware,
        labRoutes
    );

    app.get("/", (req, res) => {
        res.sendFile(path.join(__dirname, "public/index.html"));
    });

    app.get("/login", (req, res) => {
        res.redirect("/");
    });

    app.get("/login.html", (req, res) => {
        res.redirect("/");
    });

    app.get("/register", (req, res) => {
        res.sendFile(path.join(__dirname, "public/register.html"));
    });

    app.get("/forgot-password", (req, res) => {
        res.sendFile(path.join(__dirname, "public/forgot-password.html"));
    });

    app.get("/dashboard", (req, res) => {
        return pageAuthMiddleware(req, res, () => {
            if (req.user.role === "admin" || req.user.role === "superadmin") {
                return res.redirect("/admin");
            }

            res.sendFile(path.join(__dirname, "public/dashboard.html"));
        });
    });

    app.get("/dashboard.html", (req, res) => {
        return pageAuthMiddleware(req, res, () => {
            if (req.user.role === "admin" || req.user.role === "superadmin") {
                return res.redirect("/admin");
            }

            res.sendFile(path.join(__dirname, "public/dashboard.html"));
        });
    });

    app.get("/profile", (req, res) => {
        return pageAuthMiddleware(req, res, () => {
            res.sendFile(path.join(__dirname, "public/profile.html"));
        });
    });

    app.get("/profile.html", (req, res) => {
        return pageAuthMiddleware(req, res, () => {
            res.sendFile(path.join(__dirname, "public/profile.html"));
        });
    });

    app.get("/admin", requireAdminPage, (req, res) => {
        res.sendFile(path.join(PRIVATE_ADMIN_DIR, "admin.html"));
    });

    app.get("/admin/app.js", requireAdminPage, (req, res) => {
        res.type("application/javascript");
        res.sendFile(path.join(PRIVATE_ADMIN_DIR, "admin.js"));
    });

    app.use((req, res, next) => {
        const requestPath = req.path.toLowerCase();

        if (!requestPath.startsWith("/api/") && requestPath.endsWith(".json")) {
            return res.status(404).send("Not found");
        }

        return next();
    });

    app.use(express.static(path.join(__dirname, "public")));
    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}

async function startServer(options = {}) {
    const {
        app = createApp(),
        port = PORT,
        syncCompounds = true,
        syncElements = true
    } = options;

    assertSecureJwtConfig();
    await connectDB();

    if (syncElements) {
        const elementSyncResult = await syncElementsFromFile();
        console.log(`Synced ${elementSyncResult.count} elements from ${path.relative(__dirname, elementSyncResult.source)}`);
    }

    if (syncCompounds) {
        const syncResult = await syncCompoundsFromFile();
        console.log(`Synced ${syncResult.count} compounds from ${path.relative(__dirname, syncResult.source)}`);
    }

    await syncDatabaseIndexes();

    const server = await new Promise((resolve, reject) => {
        const listener = app.listen(port, () => {
            console.log(`Server running on port ${listener.address().port}`);
            resolve(listener);
        });
        listener.once("error", reject);
    });

    return { app, server };
}

if (require.main === module) {
    startServer().catch((error) => {
        if (error?.code === "EADDRINUSE") {
            console.error(`Server startup failed: port ${error.port || PORT} is already in use. Stop the existing server or set PORT to a free port.`);
        } else {
            console.error("Server startup failed:", error);
        }
        process.exit(1);
    });
}

module.exports = {
    createApp,
    startServer
};
