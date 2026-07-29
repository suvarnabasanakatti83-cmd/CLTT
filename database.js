const mongoose = require("mongoose");
const AuditLog = require("./models/AuditLog");
const Element = require("./models/Element");
const { Feedback } = require("./models/Feedback");
const User = require("./models/User");
const UserSession = require("./models/UserSession");
const VerificationChallenge = require("./models/VerificationChallenge");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/chemistry_lab";
const commonSchemaOptions = {
    timestamps: true,
    strict: "throw",
    minimize: false
};

mongoose.set("strictQuery", true);
mongoose.set("sanitizeFilter", true);
mongoose.set("runValidators", true);

function parseInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeSymbol(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
        return "";
    }

    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function createCompoundInputSignature(inputs = []) {
    return inputs
        .map((value) => normalizeSymbol(value))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))
        .join(",");
}

async function applyCollectionValidators() {
    if (!mongoose.connection.db) {
        return;
    }

    const validatorEntries = [
        [
            "elements",
            {
                bsonType: "object",
                required: ["name", "symbol", "atomicNumber", "normalizedName", "normalizedSymbol"],
                properties: {
                    name: { bsonType: "string" },
                    symbol: { bsonType: "string" },
                    atomicNumber: { bsonType: "int", minimum: 1, maximum: 118 },
                    aliases: { bsonType: ["array"], items: { bsonType: "string" } },
                    normalizedName: { bsonType: "string" },
                    normalizedSymbol: { bsonType: "string" }
                }
            }
        ],
        [
            "compounds",
            {
                bsonType: "object",
                required: ["name", "formula", "inputs", "inputSignature"],
                properties: {
                    name: { bsonType: "string" },
                    formula: { bsonType: "string" },
                    inputs: { bsonType: "array", items: { bsonType: "string" } },
                    inputSignature: { bsonType: "string" }
                }
            }
        ],
        [
            "feedbacks",
            {
                bsonType: "object",
                required: [
                    "userId",
                    "overallExperience",
                    "easeOfUse",
                    "chemicalAccuracy",
                    "speedRating",
                    "learningValue",
                    "futureUsage",
                    "recommendation"
                ],
                properties: {
                    userId: { bsonType: "objectId" },
                    overallExperience: { bsonType: "string" },
                    easeOfUse: { bsonType: "string" },
                    chemicalAccuracy: { bsonType: "string" },
                    speedRating: { bsonType: "string" },
                    learningValue: { bsonType: "string" },
                    futureUsage: { bsonType: "string" },
                    recommendation: { bsonType: "string" },
                    suggestions: { bsonType: "string" }
                }
            }
        ],
        [
            "auditlogs",
            {
                bsonType: "object",
                required: ["event", "category", "level"],
                properties: {
                    event: { bsonType: "string" },
                    category: { bsonType: "string" },
                    level: { bsonType: "string" }
                }
            }
        ],
        [
            "usersessions",
            {
                bsonType: "object",
                required: ["sessionId", "userId", "role", "purpose", "loginAt", "lastSeenAt"],
                properties: {
                    sessionId: { bsonType: "string" },
                    userId: { bsonType: "objectId" },
                    role: { bsonType: "string" },
                    purpose: { bsonType: "string" }
                }
            }
        ]
    ];

    for (const [collectionName, validator] of validatorEntries) {
        const collections = await mongoose.connection.db
            .listCollections({ name: collectionName }, { nameOnly: true })
            .toArray();

        if (collections.length === 0) {
            await mongoose.connection.db.createCollection(collectionName, {
                validator: { $jsonSchema: validator }
            }).catch((error) => {
                if (error?.codeName !== "NamespaceExists" && error?.code !== 48) {
                    throw error;
                }
            });
        }

        await mongoose.connection.db.command({
            collMod: collectionName,
            validator: { $jsonSchema: validator },
            validationLevel: "moderate"
        }).catch(() => undefined);
    }
}

async function connectDB() {
    try {
        if (mongoose.connection.readyState === 1) {
            return mongoose.connection;
        }

        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: parseInteger(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS, 10000),
            socketTimeoutMS: parseInteger(process.env.MONGO_SOCKET_TIMEOUT_MS, 45000),
            maxPoolSize: parseInteger(process.env.MONGO_MAX_POOL_SIZE, 50),
            minPoolSize: parseInteger(process.env.MONGO_MIN_POOL_SIZE, 5),
            maxConnecting: parseInteger(process.env.MONGO_MAX_CONNECTING, 10)
        });

        await applyCollectionValidators();
        console.log("Database connected successfully");
        return mongoose.connection;
    } catch (error) {
        console.error("Database connection error:", error);
        process.exit(1);
    }
}

mongoose.connection.on("connected", () => console.log("MongoDB connected"));
mongoose.connection.on("error", (error) => console.error("MongoDB error:", error));
mongoose.connection.on("disconnected", () => console.log("MongoDB disconnected"));

const conditionSchema = new mongoose.Schema(
    {
        temperature: {
            type: String,
            trim: true,
            maxlength: 100
        },
        pressure: {
            type: String,
            trim: true,
            maxlength: 100
        },
        catalyst: {
            type: String,
            trim: true,
            maxlength: 100
        }
    },
    { _id: false, strict: "throw" }
);

const experimentSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 120,
            index: true
        },
        description: {
            type: String,
            trim: true,
            maxlength: 2000
        },
        procedure: {
            type: [
                {
                    type: String,
                    trim: true,
                    maxlength: 500
                }
            ],
            default: []
        },
        materials: {
            type: [
                {
                    type: String,
                    trim: true,
                    maxlength: 200
                }
            ],
            default: []
        },
        observations: {
            type: String,
            trim: true,
            maxlength: 2000
        },
        results: {
            type: String,
            trim: true,
            maxlength: 2000
        },
        reaction: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Reaction",
            index: true
        },
        conductedBy: {
            type: String,
            trim: true,
            maxlength: 120
        },
        date: {
            type: Date,
            default: Date.now
        }
    },
    commonSchemaOptions
);

const Experiment = mongoose.model("Experiment", experimentSchema);

const reactionSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 120,
            index: true
        },
        reactants: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Compound" }],
            default: []
        },
        products: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Compound" }],
            default: []
        },
        conditions: {
            type: conditionSchema,
            default: {}
        },
        equation: {
            type: String,
            trim: true,
            maxlength: 500
        },
        type: {
            type: String,
            trim: true,
            enum: ["acid-base", "combustion", "decomposition", "redox", "synthesis", "other"],
            default: "other"
        }
    },
    commonSchemaOptions
);

const Reaction = mongoose.model("Reaction", reactionSchema);

const processSchema = new mongoose.Schema(
    {
        description: {
            type: String,
            trim: true,
            maxlength: 1000
        },
        steps: {
            type: [
                {
                    type: String,
                    trim: true,
                    maxlength: 300
                }
            ],
            default: []
        }
    },
    { _id: false, strict: "throw" }
);

const compoundSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 120,
            index: true
        },
        normalizedName: {
            type: String,
            required: true,
            select: false,
            index: true
        },
        formula: {
            type: String,
            required: true,
            trim: true,
            maxlength: 50,
            unique: true,
            index: true,
            match: /^[A-Za-z0-9()+\-.[\]\s]+$/
        },
        inputs: {
            type: [
                {
                    type: String,
                    trim: true,
                    maxlength: 10
                }
            ],
            required: true,
            validate: {
                validator: (value) => Array.isArray(value) && value.length > 0,
                message: "At least one input element is required."
            }
        },
        inputSignature: {
            type: String,
            required: true,
            index: true
        },
        type: {
            type: String,
            trim: true,
            maxlength: 50
        },
        conditions: {
            type: new mongoose.Schema(
                {
                    temperature: {
                        type: String,
                        trim: true,
                        maxlength: 100
                    },
                    pressure: {
                        type: String,
                        trim: true,
                        maxlength: 100
                    }
                },
                { _id: false, strict: "throw" }
            ),
            default: {}
        },
        process: {
            type: processSchema,
            default: {}
        },
        video: {
            type: String,
            trim: true,
            maxlength: 500
        }
    },
    commonSchemaOptions
);

compoundSchema.index({ inputs: 1 });
compoundSchema.index({ inputSignature: 1, formula: 1 });

compoundSchema.pre("validate", function normalizeCompound(next) {
    this.name = String(this.name || "")
        .trim()
        .replace(/\s+/g, " ");
    this.formula = String(this.formula || "").trim();
    this.inputs = Array.isArray(this.inputs) ? this.inputs.map((value) => normalizeSymbol(value)).filter(Boolean) : [];
    this.normalizedName = this.name.toLowerCase();
    this.inputSignature = createCompoundInputSignature(this.inputs);
    next();
});

const Compound = mongoose.model("Compound", compoundSchema);

const sheetSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 1,
            maxlength: 100
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        data: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
            default: {}
        }
    },
    commonSchemaOptions
);

sheetSchema.index({ userId: 1, name: 1 }, { unique: true });
sheetSchema.index({ userId: 1, updatedAt: -1 });

const Sheet = mongoose.model("Sheet", sheetSchema);

async function syncDatabaseIndexes() {
    await Promise.all([
        User.syncIndexes(),
        Element.syncIndexes(),
        Feedback.syncIndexes(),
        AuditLog.syncIndexes(),
        UserSession.syncIndexes(),
        VerificationChallenge.syncIndexes(),
        Experiment.syncIndexes(),
        Reaction.syncIndexes(),
        Compound.syncIndexes(),
        Sheet.syncIndexes()
    ]);
}

function getDatabaseHealth() {
    return {
        state: mongoose.connection.readyState,
        stateLabel: ["disconnected", "connected", "connecting", "disconnecting"][mongoose.connection.readyState] || "unknown",
        host: mongoose.connection.host || null,
        name: mongoose.connection.name || null
    };
}

module.exports = {
    AuditLog,
    Compound,
    Element,
    Feedback,
    Experiment,
    Reaction,
    Sheet,
    User,
    UserSession,
    VerificationChallenge,
    connectDB,
    createCompoundInputSignature,
    getDatabaseHealth,
    syncDatabaseIndexes
};
