require("../config/loadEnv");

const mongoose = require("mongoose");
const { connectDB } = require("../database");
const { restoreBackup } = require("../utils/backupRestore");

async function run() {
    await connectDB();
    const targetPath = await restoreBackup(process.argv[2]);
    console.log(`Restore completed from ${targetPath}`);
    await mongoose.disconnect();
    process.exit(0);
}

run().catch(async (error) => {
    console.error("Restore failed:", error);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
});
