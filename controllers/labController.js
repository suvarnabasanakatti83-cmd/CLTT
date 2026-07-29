const mongoose = require("mongoose");
const Element = require("../models/Element");
const { Compound, Feedback, Sheet, createCompoundInputSignature } = require("../database");
const { syncCompoundCollection, syncCompoundsFromFile } = require("../utils/compoundSync");
const { logAuditEvent } = require("../utils/auditLogger");
const { syncElementsCollection, syncElementsFromFile } = require("../utils/elementSync");
const { clearFormulaCaches, resolveChemicalInputs } = require("../utils/formulaEngine");
const {
    RequestValidationError,
    assertAllowedKeys,
    normalizeBulkCompoundsPayload,
    normalizeBulkElementsPayload,
    normalizeCompoundPayload,
    normalizeFeedbackPayload,
    normalizeSheetPayload,
    requireString
} = require("../utils/validation");

function handleControllerError(res, error, fallbackMessage) {
    if (error instanceof RequestValidationError) {
        return res.status(400).json({
            message: error.message,
            details: error.details
        });
    }

    if (error?.name === "ValidationError") {
        return res.status(400).json({
            message: "Validation failed.",
            details: Object.fromEntries(
                Object.entries(error.errors || {}).map(([field, entry]) => [field, entry.message])
            )
        });
    }

    if (error?.code === 11000) {
        return res.status(409).json({
            message: "A record with the same unique field already exists.",
            details: error.keyValue || {}
        });
    }

    if (error?.name === "StrictModeError") {
        return res.status(400).json({ message: error.message });
    }

    console.error(fallbackMessage, error);
    return res.status(500).json({ message: fallbackMessage });
}

function parseLimit(value, defaultLimit = 200, maxLimit = 500) {
    if (value === undefined) {
        return defaultLimit;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxLimit) {
        throw new RequestValidationError(`limit must be an integer between 1 and ${maxLimit}.`);
    }

    return parsed;
}

function parsePage(value, defaultPage = 1) {
    if (value === undefined) {
        return defaultPage;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new RequestValidationError("page must be a positive integer.");
    }

    return parsed;
}

function parseInputsFromBody(body) {
    const payload = assertAllowedKeys(body, ["inputs"], "body");

    if (Array.isArray(payload.inputs)) {
        if (payload.inputs.length === 0 || payload.inputs.length > 200) {
            throw new RequestValidationError("inputs must contain between 1 and 200 entries.");
        }

        return payload.inputs.map((value, index) =>
            requireString(value, `inputs[${index}]`, { minLength: 1, maxLength: 200 })
        );
    }

    if (typeof payload.inputs === "string") {
        return payload.inputs
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
    }

    throw new RequestValidationError("inputs must be an array of strings or a comma-separated string.");
}

function buildPagedResponse(items, total, page, limit) {
    return {
        items,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit))
        }
    };
}

async function getCompounds(req, res) {
    try {
        const query = assertAllowedKeys(req.query, ["limit", "page", "q", "includeMeta"], "query");
        const limit = parseLimit(query.limit, 200, 500);
        const page = parsePage(query.page, 1);
        const skip = (page - 1) * limit;
        const searchValue = query.q ? requireString(query.q, "q", { maxLength: 120 }).toLowerCase() : null;
        const filter = searchValue
            ? {
                $or: [
                    { normalizedName: searchValue },
                    { formula: new RegExp(searchValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }
                ]
            }
            : {};

        const [items, total] = await Promise.all([
            Compound.find(filter)
                .sort({ formula: 1 })
                .skip(skip)
                .limit(limit)
                .select("-normalizedName -inputSignature")
                .lean(),
            Compound.countDocuments(filter)
        ]);

        if (query.page !== undefined || query.includeMeta === "true") {
            return res.json(buildPagedResponse(items, total, page, limit));
        }

        return res.json(items);
    } catch (error) {
        return handleControllerError(res, error, "Error fetching compounds.");
    }
}

async function addCompound(req, res) {
    try {
        const payload = normalizeCompoundPayload(req.body);
        const existingCompound = await Compound.findOne({ formula: payload.formula }).select("_id").lean();
        if (existingCompound) {
            return res.status(409).json({ message: "A compound with this formula already exists." });
        }

        const compound = await Compound.create(payload);
        clearFormulaCaches();
        await logAuditEvent("compound.create", req, { formula: compound.formula, name: compound.name });

        return res.status(201).json({ status: "created", compound });
    } catch (error) {
        return handleControllerError(res, error, "Error adding compound.");
    }
}

async function getCompoundByFormula(req, res) {
    try {
        const formula = requireString(req.params.formula, "formula", { maxLength: 50 });
        const compound = await Compound.findOne({ formula }).select("-normalizedName -inputSignature").lean();

        if (!compound) {
            return res.status(404).json({ message: "Compound not found." });
        }

        return res.json(compound);
    } catch (error) {
        return handleControllerError(res, error, "Error finding compound.");
    }
}

async function bulkInsertCompounds(req, res) {
    try {
        const query = assertAllowedKeys(req.query, ["source"], "query");

        if (query.source === "file") {
            const result = await syncCompoundsFromFile();
            await logAuditEvent("compound.bulk_sync.file", req, {
                count: result.count,
                removedDuplicateEntries: result.removedDuplicateEntries
            });

            return res.json({
                status: "file sync success",
                count: result.count,
                removedDuplicateEntries: result.removedDuplicateEntries
            });
        }

        const compounds = normalizeBulkCompoundsPayload(req.body);
        const result = await syncCompoundCollection(compounds);
        await logAuditEvent("compound.bulk_sync", req, {
            count: result.count,
            removedDuplicateEntries: result.removedDuplicateEntries
        });

        return res.json({
            status: "bulk sync success",
            count: result.count,
            removedDuplicateEntries: result.removedDuplicateEntries
        });
    } catch (error) {
        return handleControllerError(res, error, "Bulk insert failed.");
    }
}

async function smartSearch(req, res) {
    try {
        const query = assertAllowedKeys(req.query, ["inputs"], "query");

        if (query.inputs === undefined) {
            return res.json([]);
        }

        const inputs = requireString(query.inputs, "inputs", { maxLength: 4000 })
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);

        if (inputs.length === 0) {
            return res.json([]);
        }

        if (inputs.length > 50) {
            throw new RequestValidationError("inputs may contain at most 50 comma-separated values.");
        }

        const resolution = await resolveChemicalInputs(inputs);
        if (!resolution.matched) {
            await logAuditEvent("formula.search.nomatch", req, {
                inputs,
                formula: resolution.formula,
                unresolvedInputs: resolution.unresolvedInputs
            });
            return res.json([]);
        }

        const compounds = await Compound.find({
            $or: [
                { formula: resolution.formula },
                { inputSignature: createCompoundInputSignature(resolution.resolvedSymbols) },
                { inputs: mongoose.trusted({ $all: resolution.resolvedSymbols }) }
            ]
        })
            .sort({ formula: 1 })
            .select("-normalizedName -inputSignature")
            .lean();

        await logAuditEvent("formula.search", req, {
            inputs,
            formula: resolution.formula,
            compoundName: compounds[0]?.name || "No Match",
            matched: compounds.length > 0
        });

        return res.json(compounds);
    } catch (error) {
        return handleControllerError(res, error, "Search failed.");
    }
}

async function resolveFormula(req, res) {
    try {
        const inputs = parseInputsFromBody(req.body);
        const resolution = await resolveChemicalInputs(inputs);
        await logAuditEvent("formula.resolve", req, {
            inputs,
            formula: resolution.formula,
            compoundName: resolution.name,
            matched: resolution.matched,
            unresolvedInputs: resolution.unresolvedInputs
        });

        return res.json(resolution);
    } catch (error) {
        return handleControllerError(res, error, "Formula generation failed.");
    }
}

async function getElements(req, res) {
    try {
        const query = assertAllowedKeys(req.query, ["limit", "page", "includeMeta", "includeAtomicNumber"], "query");
        const limit = parseLimit(query.limit, 200, 300);
        const page = parsePage(query.page, 1);
        const skip = (page - 1) * limit;
        const includeAtomicNumber = query.includeAtomicNumber === "true" && ["admin", "superadmin"].includes(req.user?.role);
        const projection = includeAtomicNumber
            ? "name symbol atomicNumber aliases category stateAtRoomTemp"
            : "name symbol aliases category stateAtRoomTemp";

        const [items, total] = await Promise.all([
            Element.find()
                .sort({ atomicNumber: 1 })
                .skip(skip)
                .limit(limit)
                .select(projection)
                .lean(),
            Element.countDocuments()
        ]);

        if (query.page !== undefined || query.includeMeta === "true") {
            return res.json(buildPagedResponse(items, total, page, limit));
        }

        return res.json(items);
    } catch (error) {
        return handleControllerError(res, error, "Error fetching elements.");
    }
}

async function bulkInsertElements(req, res) {
    try {
        const query = assertAllowedKeys(req.query, ["source"], "query");
        const result = query.source === "file"
            ? await syncElementsFromFile()
            : await syncElementsCollection(normalizeBulkElementsPayload(req.body));

        clearFormulaCaches();
        await logAuditEvent(query.source === "file" ? "element.bulk_sync.file" : "element.bulk_upsert", req, {
            count: result.count,
            removedDuplicateEntries: result.removedDuplicateEntries
        });

        return res.json({
            message: "Elements saved successfully",
            count: result.count,
            removedDuplicateEntries: result.removedDuplicateEntries
        });
    } catch (error) {
        return handleControllerError(res, error, "Unable to save elements.");
    }
}

async function saveSheet(req, res) {
    try {
        const payload = normalizeSheetPayload(req.body);

        await Sheet.findOneAndUpdate(
            { name: payload.name, userId: req.user.id },
            {
                name: payload.name,
                data: payload.data,
                userId: req.user.id
            },
            {
                upsert: true,
                new: true,
                runValidators: true,
                setDefaultsOnInsert: true,
                context: "query"
            }
        );
        await logAuditEvent("sheet.save", req, { name: payload.name });

        return res.json({ status: "saved" });
    } catch (error) {
        return handleControllerError(res, error, "Unable to save sheet.");
    }
}

async function loadSheet(req, res) {
    try {
        const name = requireString(req.params.name, "name", { maxLength: 100 });
        const sheet = await Sheet.findOne({ name, userId: req.user.id }).lean();
        return res.json(sheet || {});
    } catch (error) {
        return handleControllerError(res, error, "Unable to load sheet.");
    }
}

async function deleteSheet(req, res) {
    try {
        const name = requireString(req.params.name, "name", { maxLength: 100 });
        const result = await Sheet.deleteOne({ name, userId: req.user.id });
        await logAuditEvent("sheet.delete", req, {
            name,
            deletedCount: result.deletedCount || 0
        });

        return res.json({ status: "deleted", deletedCount: result.deletedCount || 0 });
    } catch (error) {
        return handleControllerError(res, error, "Unable to delete sheet.");
    }
}

async function submitFeedback(req, res) {
    try {
        const payload = normalizeFeedbackPayload(req.body);
        const feedback = await Feedback.create({
            ...payload,
            userId: req.user.id
        });

        await logAuditEvent("feedback.submit", req, { feedbackId: String(feedback._id) });

        return res.status(201).json({
            message: "Feedback saved successfully.",
            feedback: {
                id: String(feedback._id),
                createdAt: feedback.createdAt
            }
        });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({
                message: "Feedback has already been submitted for this account."
            });
        }

        return handleControllerError(res, error, "Unable to save feedback.");
    }
}

module.exports = {
    addCompound,
    bulkInsertCompounds,
    bulkInsertElements,
    deleteSheet,
    getCompoundByFormula,
    getCompounds,
    getElements,
    loadSheet,
    resolveFormula,
    saveSheet,
    smartSearch,
    submitFeedback
};
