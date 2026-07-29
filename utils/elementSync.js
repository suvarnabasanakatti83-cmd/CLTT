const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Element = require("../models/Element");
const { normalizeElementPayload } = require("./validation");

const ELEMENT_FILE_PATH = path.join(__dirname, "..", "public", "elements.json");

function loadElementsFromFile(filePath = ELEMENT_FILE_PATH) {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || !Array.isArray(parsed.elements)) {
        throw new Error("elements.json must contain an elements array.");
    }

    return parsed.elements;
}

function dedupeElements(elements) {
    const byAtomicNumber = new Map();

    elements.forEach((element, index) => {
        const normalized = normalizeElementPayload(element);

        if (byAtomicNumber.has(normalized.atomicNumber)) {
            throw new Error(`Duplicate atomicNumber ${normalized.atomicNumber} detected in elements payload at index ${index}.`);
        }

        byAtomicNumber.set(normalized.atomicNumber, normalized);
    });

    const normalizedElements = Array.from(byAtomicNumber.values()).sort(
        (left, right) => left.atomicNumber - right.atomicNumber
    );

    if (normalizedElements.length !== 118) {
        throw new Error(`elements.json must contain exactly 118 unique elements. Found ${normalizedElements.length}.`);
    }

    for (let atomicNumber = 1; atomicNumber <= 118; atomicNumber += 1) {
        if (!byAtomicNumber.has(atomicNumber)) {
            throw new Error(`elements.json is missing atomicNumber ${atomicNumber}.`);
        }
    }

    return normalizedElements;
}

async function removeDuplicateDatabaseEntries() {
    const elements = await Element.find()
        .sort({ atomicNumber: 1, createdAt: 1, _id: 1 })
        .select("_id atomicNumber name symbol")
        .lean();

    const seenAtomicNumbers = new Map();
    const seenNames = new Map();
    const seenSymbols = new Map();
    const duplicateIds = [];

    elements.forEach((element) => {
        const normalizedName = String(element.name || "").trim().toLowerCase();
        const normalizedSymbol = String(element.symbol || "").trim().toLowerCase();

        if (
            seenAtomicNumbers.has(element.atomicNumber) ||
            seenNames.has(normalizedName) ||
            seenSymbols.has(normalizedSymbol)
        ) {
            duplicateIds.push(element._id);
            return;
        }

        seenAtomicNumbers.set(element.atomicNumber, element._id);
        seenNames.set(normalizedName, element._id);
        seenSymbols.set(normalizedSymbol, element._id);
    });

    if (duplicateIds.length === 0) {
        return 0;
    }

    const result = await Element.deleteMany({ _id: { $in: duplicateIds } });
    return result.deletedCount || 0;
}

async function syncElementsCollection(elements) {
    const normalizedElements = dedupeElements(elements);
    const removedDuplicateEntries = await removeDuplicateDatabaseEntries();
    const preparedElements = [];

    for (const element of normalizedElements) {
        const document = new Element(element);
        await document.validate();
        const prepared = document.toObject({ depopulate: true, versionKey: false });
        delete prepared._id;
        delete prepared.createdAt;
        delete prepared.updatedAt;
        preparedElements.push(prepared);
    }

    const bulkOperations = preparedElements.map((element) => ({
        updateOne: {
            filter: {
                $or: [
                    { atomicNumber: element.atomicNumber },
                    { name: element.name }
                ]
            },
            update: {
                $set: element
            },
            upsert: true
        }
    }));

    await Element.bulkWrite(bulkOperations, {
        ordered: false
    });

    await Element.deleteMany({
        atomicNumber: mongoose.trusted({ $nin: preparedElements.map((element) => element.atomicNumber) })
    });

    return {
        count: preparedElements.length,
        removedDuplicateEntries
    };
}

async function syncElementsFromFile(filePath = ELEMENT_FILE_PATH) {
    const elements = loadElementsFromFile(filePath);
    const result = await syncElementsCollection(elements);

    return {
        ...result,
        source: filePath
    };
}

module.exports = {
    ELEMENT_FILE_PATH,
    dedupeElements,
    loadElementsFromFile,
    removeDuplicateDatabaseEntries,
    syncElementsCollection,
    syncElementsFromFile
};
