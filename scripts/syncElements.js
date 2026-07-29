require("../config/loadEnv");

const mongoose = require("mongoose");
const { connectDB } = require("../database");
const { syncElementsFromFile } = require("../utils/elementSync");

async function run() {
    await connectDB();
    const result = await syncElementsFromFile();
    console.log(`Synced ${result.count} elements from ${result.source}. Removed duplicates: ${result.removedDuplicateEntries}`);
    await mongoose.disconnect();
    process.exit(0);
}

run().catch(async (error) => {
    console.error("Element sync failed:", error);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
});
