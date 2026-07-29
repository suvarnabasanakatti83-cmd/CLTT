const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const AuditLog = require("../models/AuditLog");
const User = require("../models/User");
const Element = require("../models/Element");
const UserSession = require("../models/UserSession");
const VerificationChallenge = require("../models/VerificationChallenge");
const { Compound, Experiment, Reaction, Sheet } = require("../database");
const { clearFormulaCaches } = require("./formulaEngine");

const DEFAULT_BACKUP_DIR = path.join(__dirname, "..", "backups");
const COLLECTIONS = [
    ["users", User],
    ["elements", Element],
    ["compounds", Compound],
    ["reactions", Reaction],
    ["experiments", Experiment],
    ["sheets", Sheet],
    ["auditlogs", AuditLog],
    ["usersessions", UserSession],
    ["verificationchallenges", VerificationChallenge]
];

async function createBackup(options = {}) {
    const backupDir = options.backupDir || DEFAULT_BACKUP_DIR;
    await fs.promises.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(backupDir, options.fileName || `backup-${timestamp}.json`);
    const data = {
        metadata: {
            createdAt: new Date().toISOString(),
            database: mongoose.connection.name
        },
        collections: {}
    };

    for (const [name, model] of COLLECTIONS) {
        data.collections[name] = await model.find().lean();
    }

    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
    return filePath;
}

async function findLatestBackup(backupDir = DEFAULT_BACKUP_DIR) {
    const entries = await fs.promises.readdir(backupDir);
    const backupFiles = entries.filter((entry) => entry.endsWith(".json")).sort().reverse();

    if (backupFiles.length === 0) {
        throw new Error("No backup files were found.");
    }

    return path.join(backupDir, backupFiles[0]);
}

async function restoreBackup(filePath) {
    const targetPath = filePath ? path.resolve(filePath) : await findLatestBackup();
    const raw = await fs.promises.readFile(targetPath, "utf8");
    const backup = JSON.parse(raw);

    for (const [name, model] of COLLECTIONS) {
        const documents = Array.isArray(backup.collections?.[name]) ? backup.collections[name] : [];
        await model.deleteMany({});

        if (documents.length > 0) {
            await model.insertMany(documents, { ordered: false });
        }
    }

    clearFormulaCaches();

    return targetPath;
}

module.exports = {
    DEFAULT_BACKUP_DIR,
    createBackup,
    findLatestBackup,
    restoreBackup
};
