const AuditLog = require("../models/AuditLog");
const User = require("../models/User");
const UserSession = require("../models/UserSession");
const { logAuditEvent } = require("../utils/auditLogger");
const { TtlCache } = require("../utils/cache");
const { RequestValidationError, assertAllowedKeys } = require("../utils/validation");

const analyticsCache = new TtlCache(30 * 1000, 100);

function handleControllerError(res, error, fallbackMessage) {
    if (error instanceof RequestValidationError) {
        return res.status(400).json({
            message: error.message,
            details: error.details
        });
    }

    console.error(fallbackMessage, error);
    return res.status(500).json({ message: fallbackMessage });
}

function parsePositiveInteger(value, fieldName, defaultValue, maxValue = 3650) {
    if (value === undefined) {
        return defaultValue;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxValue) {
        throw new RequestValidationError(`${fieldName} must be an integer between 1 and ${maxValue}.`);
    }

    return parsed;
}

function getWindowDates({ windowHours = 24, growthDays = 30, trafficDays = 7, onlineMinutes = 15 }) {
    const now = new Date();

    return {
        now,
        activeSince: new Date(now.getTime() - windowHours * 60 * 60 * 1000),
        growthSince: new Date(now.getTime() - growthDays * 24 * 60 * 60 * 1000),
        trafficSince: new Date(now.getTime() - trafficDays * 24 * 60 * 60 * 1000),
        onlineSince: new Date(now.getTime() - onlineMinutes * 60 * 1000)
    };
}

async function getOverview(req, res) {
    try {
        const query = assertAllowedKeys(req.query, ["windowHours", "growthDays", "trafficDays", "onlineMinutes"], "query");
        const windowHours = parsePositiveInteger(query.windowHours, "windowHours", 24, 24 * 30);
        const growthDays = parsePositiveInteger(query.growthDays, "growthDays", 30, 365);
        const trafficDays = parsePositiveInteger(query.trafficDays, "trafficDays", 7, 90);
        const onlineMinutes = parsePositiveInteger(query.onlineMinutes, "onlineMinutes", 15, 240);
        const cacheKey = JSON.stringify({ type: "overview", windowHours, growthDays, trafficDays, onlineMinutes });
        const cached = analyticsCache.get(cacheKey);

        if (cached) {
            return res.json(cached);
        }

        const { activeSince, growthSince, trafficSince, onlineSince } = getWindowDates({
            windowHours,
            growthDays,
            trafficDays,
            onlineMinutes
        });

        const [
            activeUsers,
            onlineUsers,
            totalSearches,
            failedApiRequests,
            suspiciousLoginAttempts,
            userGrowth,
            trafficSummary,
            subscriptionSummary
        ] = await Promise.all([
            AuditLog.aggregate([
                {
                    $match: {
                        createdAt: { $gte: activeSince },
                        userId: { $type: "objectId" }
                    }
                },
                {
                    $group: {
                        _id: "$userId"
                    }
                },
                { $count: "count" }
            ]).then((items) => items[0]?.count || 0),
            UserSession.countDocuments({
                logoutAt: null,
                purpose: "auth",
                lastSeenAt: { $gte: onlineSince }
            }),
            AuditLog.countDocuments({
                event: { $in: ["formula.resolve", "formula.search"] },
                createdAt: { $gte: activeSince }
            }),
            AuditLog.countDocuments({
                category: "traffic",
                statusCode: { $gte: 400 },
                createdAt: { $gte: trafficSince }
            }),
            AuditLog.aggregate([
                {
                    $match: {
                        event: { $in: ["auth.login.failure", "auth.failure"] },
                        createdAt: { $gte: activeSince }
                    }
                },
                {
                    $group: {
                        _id: "$ip",
                        attempts: { $sum: 1 }
                    }
                },
                {
                    $match: {
                        attempts: { $gte: 3 }
                    }
                },
                { $count: "count" }
            ]).then((items) => items[0]?.count || 0),
            User.aggregate([
                {
                    $match: {
                        createdAt: { $gte: growthSince }
                    }
                },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
                        },
                        users: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]),
            AuditLog.aggregate([
                {
                    $match: {
                        category: "traffic",
                        createdAt: { $gte: trafficSince }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalRequests: { $sum: 1 },
                        failedRequests: {
                            $sum: {
                                $cond: [{ $gte: ["$statusCode", 400] }, 1, 0]
                            }
                        },
                        averageDurationMs: { $avg: "$durationMs" }
                    }
                }
            ]).then((items) => items[0] || { totalRequests: 0, failedRequests: 0, averageDurationMs: 0 }),
            User.aggregate([
                {
                    $group: {
                        _id: null,
                        trialUsers: {
                            $sum: {
                                $cond: [{ $eq: ["$subscription.trialStatus", "active"] }, 1, 0]
                            }
                        },
                        paidUsers: {
                            $sum: {
                                $cond: [{ $eq: ["$subscription.paymentStatus", "paid"] }, 1, 0]
                            }
                        },
                        expiredUsers: {
                            $sum: {
                                $cond: [{ $eq: ["$subscription.status", "expired"] }, 1, 0]
                            }
                        },
                        renewalUsers: {
                            $sum: {
                                $cond: [{ $eq: ["$subscription.renewalRequired", true] }, 1, 0]
                            }
                        },
                        totalRevenue: {
                            $sum: {
                                $cond: [
                                    { $eq: ["$subscription.paymentStatus", "paid"] },
                                    { $divide: ["$subscription.paymentAmount", 100] },
                                    0
                                ]
                            }
                        },
                        totalUsers: { $sum: 1 }
                    }
                }
            ]).then((items) => items[0] || {
                trialUsers: 0,
                paidUsers: 0,
                expiredUsers: 0,
                renewalUsers: 0,
                totalRevenue: 0,
                totalUsers: 0
            })
        ]);

        const conversionRate = subscriptionSummary.totalUsers > 0
            ? Number(((subscriptionSummary.paidUsers / subscriptionSummary.totalUsers) * 100).toFixed(2))
            : 0;

        const payload = {
            activeUsers,
            onlineUsers,
            totalSearches,
            failedApiRequests,
            suspiciousLoginAttempts,
            trialUsers: subscriptionSummary.trialUsers || 0,
            paidUsers: subscriptionSummary.paidUsers || 0,
            expiredUsers: subscriptionSummary.expiredUsers || 0,
            renewalUsers: subscriptionSummary.renewalUsers || 0,
            conversionRate,
            revenue: {
                amount: Number((subscriptionSummary.totalRevenue || 0).toFixed(2)),
                formatted: `INR ${Number((subscriptionSummary.totalRevenue || 0).toFixed(2)).toLocaleString("en-IN")}`
            },
            traffic: {
                totalRequests: trafficSummary.totalRequests || 0,
                failedRequests: trafficSummary.failedRequests || 0,
                averageDurationMs: Number((trafficSummary.averageDurationMs || 0).toFixed(2))
            },
            userGrowth
        };

        analyticsCache.set(cacheKey, payload);
        await logAuditEvent("admin.analytics.overview", req, payload, "info", { category: "admin" });
        return res.json(payload);
    } catch (error) {
        return handleControllerError(res, error, "Unable to load analytics overview.");
    }
}

async function getUsers(req, res) {
    try {
        const query = assertAllowedKeys(req.query, ["page", "limit", "filter"], "query");
        const page = parsePositiveInteger(query.page, "page", 1, 10000);
        const limit = parsePositiveInteger(query.limit, "limit", 20, 200);
        const filter = {};

        switch (query.filter) {
            case "trial":
                filter["subscription.trialStatus"] = "active";
                break;
            case "paid":
                filter["subscription.paymentStatus"] = "paid";
                break;
            case "expired":
                filter["subscription.status"] = "expired";
                break;
            case "renewal":
                filter["subscription.renewalRequired"] = true;
                break;
            default:
                break;
        }

        const [items, total] = await Promise.all([
            User.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            User.countDocuments(filter)
        ]);

        const userIds = items.map((item) => item._id);
        const latestSessions = await UserSession.aggregate([
            {
                $match: {
                    userId: { $in: userIds }
                }
            },
            { $sort: { lastSeenAt: -1 } },
            {
                $group: {
                    _id: "$userId",
                    lastDevice: { $first: "$userAgent" },
                    lastSeenAt: { $first: "$lastSeenAt" }
                }
            }
        ]);
        const latestSessionMap = new Map(latestSessions.map((session) => [String(session._id), session]));

        const responseItems = items.map((item) => ({
            _id: item._id,
            fullName: item.fullName,
            email: item.email,
            mobile: item.mobile,
            role: item.role,
            lastLoginAt: item.lastLoginAt,
            createdAt: item.createdAt,
            subscription: {
                plan: item.subscription?.plan,
                status: item.subscription?.status,
                paymentStatus: item.subscription?.paymentStatus,
                expiresAt: item.subscription?.expiresAt,
                trialStatus: item.subscription?.trialStatus
            },
            lastDevice: latestSessionMap.get(String(item._id))?.lastDevice || null
        }));

        await logAuditEvent("admin.users.list", req, { filter: query.filter || "all", page, limit }, "info", { category: "admin" });
        return res.json({
            items: responseItems,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.max(1, Math.ceil(total / limit))
            }
        });
    } catch (error) {
        return handleControllerError(res, error, "Unable to load users.");
    }
}

async function getSessions(req, res) {
    try {
        const query = assertAllowedKeys(req.query, ["page", "limit"], "query");
        const page = parsePositiveInteger(query.page, "page", 1, 10000);
        const limit = parsePositiveInteger(query.limit, "limit", 20, 200);
        const [items, total] = await Promise.all([
            UserSession.find()
                .sort({ lastSeenAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            UserSession.countDocuments()
        ]);

        await logAuditEvent("admin.sessions.list", req, { page, limit }, "info", { category: "admin" });
        return res.json({
            items,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.max(1, Math.ceil(total / limit))
            }
        });
    } catch (error) {
        return handleControllerError(res, error, "Unable to load sessions.");
    }
}

async function getTopSearchedCompounds(req, res) {
    try {
        const query = assertAllowedKeys(req.query, ["limit", "windowHours"], "query");
        const limit = parsePositiveInteger(query.limit, "limit", 10, 100);
        const windowHours = parsePositiveInteger(query.windowHours, "windowHours", 24 * 7, 24 * 90);
        const cacheKey = JSON.stringify({ type: "topSearches", limit, windowHours });
        const cached = analyticsCache.get(cacheKey);

        if (cached) {
            return res.json(cached);
        }

        const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
        const searches = await AuditLog.aggregate([
            {
                $match: {
                    event: { $in: ["formula.resolve", "formula.search"] },
                    "details.compoundName": { $nin: [null, "", "No Match"] },
                    createdAt: { $gte: since }
                }
            },
            {
                $group: {
                    _id: "$details.compoundName",
                    searches: { $sum: 1 },
                    lastFormula: { $last: "$details.formula" }
                }
            },
            { $sort: { searches: -1, _id: 1 } },
            { $limit: limit }
        ]);

        const payload = searches.map((entry) => ({
            name: entry._id,
            searches: entry.searches,
            formula: entry.lastFormula || null
        }));

        analyticsCache.set(cacheKey, payload);
        await logAuditEvent("admin.analytics.top_searches", req, { limit, windowHours }, "info", { category: "admin" });
        return res.json(payload);
    } catch (error) {
        return handleControllerError(res, error, "Unable to load top searched compounds.");
    }
}

async function getTrafficStats(req, res) {
    try {
        const query = assertAllowedKeys(req.query, ["days"], "query");
        const days = parsePositiveInteger(query.days, "days", 7, 90);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const cacheKey = JSON.stringify({ type: "traffic", days });
        const cached = analyticsCache.get(cacheKey);

        if (cached) {
            return res.json(cached);
        }

        const traffic = await AuditLog.aggregate([
            {
                $match: {
                    category: "traffic",
                    createdAt: { $gte: since }
                }
            },
            {
                $group: {
                    _id: {
                        day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        statusBucket: {
                            $cond: [{ $gte: ["$statusCode", 400] }, "failed", "successful"]
                        }
                    },
                    requests: { $sum: 1 }
                }
            },
            { $sort: { "_id.day": 1 } }
        ]);

        analyticsCache.set(cacheKey, traffic);
        await logAuditEvent("admin.analytics.traffic", req, { days }, "info", { category: "admin" });
        return res.json(traffic);
    } catch (error) {
        return handleControllerError(res, error, "Unable to load traffic statistics.");
    }
}

async function getAuditActivity(req, res) {
    try {
        const query = assertAllowedKeys(req.query, ["page", "limit", "event", "userId"], "query");
        const page = parsePositiveInteger(query.page, "page", 1, 10000);
        const limit = parsePositiveInteger(query.limit, "limit", 25, 200);
        const filter = {};

        if (query.event) {
            filter.event = query.event;
        }

        if (query.userId) {
            filter.userId = query.userId;
        }

        const [items, total] = await Promise.all([
            AuditLog.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            AuditLog.countDocuments(filter)
        ]);

        await logAuditEvent("admin.analytics.audit_feed", req, { page, limit, event: query.event || null }, "info", {
            category: "admin"
        });

        return res.json({
            items,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.max(1, Math.ceil(total / limit))
            }
        });
    } catch (error) {
        return handleControllerError(res, error, "Unable to load audit activity.");
    }
}

module.exports = {
    getAuditActivity,
    getOverview,
    getTopSearchedCompounds,
    getSessions,
    getTrafficStats,
    getUsers
};
