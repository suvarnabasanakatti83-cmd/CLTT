require("../config/loadEnv");

const mongoose = require("mongoose");
const { connectDB } = require("../database");
const { createBackup } = require("../utils/backupRestore");

async function run() {
    await connectDB();
    const filePath = await createBackup();
    console.log(`Backup written to ${filePath}`);
    await mongoose.disconnect();
    process.exit(0);
}

run().catch(async (error) => {
    console.error("Backup failed:", error);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
});
