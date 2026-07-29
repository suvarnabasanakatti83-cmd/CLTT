require("../config/loadEnv");

const mongoose = require("mongoose");
const { connectDB, syncDatabaseIndexes } = require("../database");
const { syncElementsFromFile } = require("../utils/elementSync");
const { syncCompoundsFromFile } = require("../utils/compoundSync");

async function run() {
    await connectDB();

    const [elementsResult, compoundsResult] = await Promise.all([
        syncElementsFromFile(),
        syncCompoundsFromFile()
    ]);

    await syncDatabaseIndexes();

    console.log(
        JSON.stringify(
            {
                elements: {
                    count: elementsResult.count,
                    removedDuplicateEntries: elementsResult.removedDuplicateEntries
                },
                compounds: {
                    count: compoundsResult.count,
                    removedDuplicateEntries: compoundsResult.removedDuplicateEntries
                }
            },
            null,
            2
        )
    );

    await mongoose.disconnect();
    process.exit(0);
}

run().catch(async (error) => {
    console.error("Migration failed:", error);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
});
