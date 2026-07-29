const mongoose = require("mongoose");

function normalizeAlias(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

const elementSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120
        },
        symbol: {
            type: String,
            required: true,
            trim: true,
            maxlength: 3,
            match: /^[A-Za-z]{1,3}$/
        },
        atomicNumber: {
            type: Number,
            required: true,
            min: 1,
            max: 118
        },
        atomicMass: {
            type: Number,
            default: null,
            min: 0.0001,
            max: 400
        },
        aliases: {
            type: [
                {
                    type: String,
                    trim: true,
                    maxlength: 120
                }
            ],
            default: []
        },
        normalizedName: {
            type: String,
            required: true,
            select: false
        },
        normalizedSymbol: {
            type: String,
            required: true,
            select: false
        },
        normalizedAliases: {
            type: [
                {
                    type: String,
                    maxlength: 120
                }
            ],
            default: [],
            select: false
        },
        category: {
            type: String,
            trim: true,
            enum: [
                "alkali metal",
                "alkaline earth metal",
                "transition metal",
                "post-transition metal",
                "metalloid",
                "nonmetal",
                "halogen",
                "noble gas",
                "lanthanide",
                "actinide",
                "unknown"
            ],
            default: "unknown"
        },
        stateAtRoomTemp: {
            type: String,
            trim: true,
            enum: ["solid", "liquid", "gas", "unknown"],
            default: "unknown"
        }
    },
    {
        timestamps: true,
        strict: "throw",
        minimize: false
    }
);

elementSchema.index({ name: 1 }, { unique: true });
elementSchema.index({ symbol: 1 }, { unique: true });
elementSchema.index({ atomicNumber: 1 }, { unique: true });
elementSchema.index({ normalizedName: 1 });
elementSchema.index({ normalizedSymbol: 1 });
elementSchema.index({ normalizedAliases: 1 });

elementSchema.pre("validate", function normalizeElement(next) {
    this.name = String(this.name || "")
        .trim()
        .replace(/\s+/g, " ");
    this.symbol = String(this.symbol || "").trim();

    if (this.symbol) {
        this.symbol = this.symbol.charAt(0).toUpperCase() + this.symbol.slice(1).toLowerCase();
    }

    const aliasSet = new Set([
        normalizeAlias(this.name),
        normalizeAlias(this.symbol),
        ...(Array.isArray(this.aliases) ? this.aliases.map((alias) => normalizeAlias(alias)) : [])
    ]);

    aliasSet.delete("");

    this.aliases = Array.from(aliasSet)
        .filter((alias) => alias !== normalizeAlias(this.symbol))
        .sort();
    this.normalizedName = normalizeAlias(this.name);
    this.normalizedSymbol = normalizeAlias(this.symbol);
    this.normalizedAliases = Array.from(aliasSet).sort();

    next();
});

elementSchema.statics.normalizeLookupValue = normalizeAlias;

module.exports = mongoose.model("Element", elementSchema);
