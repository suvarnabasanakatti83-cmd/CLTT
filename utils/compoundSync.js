const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { Compound, connectDB } = require("../database");
const { clearFormulaCaches } = require("./formulaEngine");
const { normalizeCompoundPayload } = require("./validation");

const COMPOUND_FILE_PATH = path.join(__dirname, "..", "public", "compounds", "compound.json");

function loadCompoundsFromFile(filePath = COMPOUND_FILE_PATH) {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || !Array.isArray(parsed.compounds)) {
        throw new Error("compound.json must contain a compounds array.");
    }

    return parsed.compounds;
}

function normalizeCompound(compound) {
    return normalizeCompoundPayload(compound);
}

function dedupeCompounds(compounds) {
    const byFormula = new Map();

    compounds.forEach((compound) => {
        const normalized = normalizeCompound(compound);

        if (!byFormula.has(normalized.formula)) {
            byFormula.set(normalized.formula, normalized);
        }
    });

    return Array.from(byFormula.values());
}

async function removeDuplicateDatabaseEntries() {
    const duplicates = await Compound.aggregate([
        {
            $group: {
                _id: "$formula",
                ids: { $push: "$_id" },
                count: { $sum: 1 }
            }
        },
        {
            $match: {
                _id: { $ne: null },
                count: { $gt: 1 }
            }
        }
    ]);

    let removedCount = 0;

    for (const duplicate of duplicates) {
        const extraIds = duplicate.ids.slice(1);

        if (extraIds.length > 0) {
            const result = await Compound.deleteMany({ _id: { $in: extraIds } });
            removedCount += result.deletedCount || 0;
        }
    }

    return removedCount;
}

async function syncCompoundCollection(compounds) {
    const normalizedCompounds = dedupeCompounds(compounds);
    const removedDuplicateEntries = await removeDuplicateDatabaseEntries();
    const preparedCompounds = [];

    if (normalizedCompounds.length === 0) {
        throw new Error("At least one valid compound is required for synchronization.");
    }

    for (const compound of normalizedCompounds) {
        const document = new Compound(compound);
        await document.validate();
        const prepared = document.toObject({ depopulate: true, versionKey: false });
        delete prepared._id;
        delete prepared.createdAt;
        delete prepared.updatedAt;
        preparedCompounds.push(prepared);
    }

    await Compound.bulkWrite(
        preparedCompounds.map((compound) => ({
            updateOne: {
                filter: { formula: compound.formula },
                update: { $set: compound },
                upsert: true
            }
        })),
        { ordered: false }
    );

    await Compound.deleteMany({ formula: mongoose.trusted({ $nin: preparedCompounds.map((compound) => compound.formula) }) });
    clearFormulaCaches();

    return {
        count: preparedCompounds.length,
        removedDuplicateEntries
    };
}

async function syncCompoundsFromFile(filePath = COMPOUND_FILE_PATH) {
    const compounds = loadCompoundsFromFile(filePath);
    const result = await syncCompoundCollection(compounds);

    return {
        ...result,
        source: filePath
    };
}

module.exports = {
    COMPOUND_FILE_PATH,
    loadCompoundsFromFile,
    syncCompoundCollection,
    syncCompoundsFromFile
};

if (require.main === module) {
    require("../config/loadEnv");

    (async () => {
        try {
            await connectDB();
            const result = await syncCompoundsFromFile();
            console.log(`Synced ${result.count} compounds from ${result.source}.`);
            process.exit(0);
        } catch (error) {
            console.error("Compound sync failed:", error);
            process.exit(1);
        }
    })();
}
