const Element = require("../models/Element");
const { Compound, createCompoundInputSignature } = require("../database");
const { TtlCache } = require("./cache");

const catalogCache = new TtlCache(60 * 1000, 5);
const formulaResultCache = new TtlCache(5 * 60 * 1000, 1000);

function normalizeLookupToken(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function normalizeFormulaKey(value) {
    return String(value || "")
        .trim()
        .replace(/\s+/g, "")
        .toUpperCase();
}

function splitInputEntry(value) {
    const normalized = String(value || "").trim();
    if (!normalized) {
        return [];
    }

    return normalized
        .split("+")
        .map((part) => part.trim())
        .filter(Boolean);
}

function parseFormulaToSymbols(formula, elementsBySymbol) {
    const matches = String(formula || "").match(/[A-Z][a-z]?\d*/g);
    if (!matches) {
        return [];
    }

    const symbols = [];

    for (const match of matches) {
        const symbol = match.match(/[A-Z][a-z]?/)[0];
        const count = Number(match.match(/\d+/)?.[0] || 1);

        if (!elementsBySymbol.has(symbol)) {
            return [];
        }

        for (let index = 0; index < count; index += 1) {
            symbols.push(symbol);
        }
    }

    return symbols;
}

async function loadCatalog() {
    const cachedCatalog = catalogCache.get("catalog");
    if (cachedCatalog) {
        return cachedCatalog;
    }

    const [elements, compounds] = await Promise.all([
        Element.find()
            .sort({ atomicNumber: 1 })
            .select("name symbol atomicNumber aliases normalizedName normalizedSymbol normalizedAliases")
            .lean(),
        Compound.find()
            .select("name formula inputs inputSignature type conditions process video normalizedName")
            .lean()
    ]);

    const catalog = {
        elements,
        compounds,
        elementsBySymbol: new Map(),
        compoundsByFormula: new Map(),
        compoundsByName: new Map(),
        compoundInputsBySignature: new Map(),
        elementLookup: new Map()
    };

    elements.forEach((element) => {
        catalog.elementsBySymbol.set(element.symbol, element);

        const terms = new Set([
            normalizeLookupToken(element.name),
            normalizeLookupToken(element.symbol),
            ...(Array.isArray(element.aliases) ? element.aliases.map((alias) => normalizeLookupToken(alias)) : []),
            ...(Array.isArray(element.normalizedAliases)
                ? element.normalizedAliases.map((alias) => normalizeLookupToken(alias))
                : [])
        ]);

        terms.forEach((term) => {
            if (term) {
                catalog.elementLookup.set(term, element);
            }
        });
    });

    compounds.forEach((compound) => {
        catalog.compoundsByFormula.set(normalizeFormulaKey(compound.formula), compound);
        catalog.compoundsByName.set(normalizeLookupToken(compound.name), compound);
        catalog.compoundInputsBySignature.set(compound.inputSignature, compound);
    });

    catalogCache.set("catalog", catalog);
    return catalog;
}

function flattenRequestedInputs(inputs) {
    return inputs.flatMap((value) => splitInputEntry(value));
}

function resolveSingleToken(token, catalog) {
    const normalizedToken = normalizeLookupToken(token);
    if (!normalizedToken) {
        return { symbols: [], matched: true };
    }

    const compoundByName = catalog.compoundsByName.get(normalizedToken);
    if (compoundByName) {
        return { symbols: [...compoundByName.inputs], matched: true, compound: compoundByName };
    }

    const formulaKey = normalizeFormulaKey(token);
    const compoundByFormula = catalog.compoundsByFormula.get(formulaKey);
    if (compoundByFormula) {
        return { symbols: [...compoundByFormula.inputs], matched: true, compound: compoundByFormula };
    }

    const directElement = catalog.elementLookup.get(normalizedToken);
    if (directElement) {
        return { symbols: [directElement.symbol], matched: true };
    }

    if (/^[A-Z][a-z]?\d*(?:[A-Z][a-z]?\d*)*$/.test(String(token || "").trim())) {
        const parsedSymbols = parseFormulaToSymbols(String(token || "").trim(), catalog.elementsBySymbol);
        if (parsedSymbols.length > 0) {
            return { symbols: parsedSymbols, matched: true };
        }
    }

    return { symbols: [], matched: false, unresolvedInput: token };
}

function buildFormula(symbols) {
    const counts = new Map();
    symbols.forEach((symbol) => {
        counts.set(symbol, (counts.get(symbol) || 0) + 1);
    });

    return Array.from(counts.keys())
        .map((symbol) => `${symbol}${counts.get(symbol) > 1 ? counts.get(symbol) : ""}`)
        .join("");
}

async function resolveChemicalInputs(inputs) {
    const normalizedInputArray = Array.isArray(inputs) ? inputs : [inputs];
    const flattenedInputs = flattenRequestedInputs(normalizedInputArray);
    const cacheKey = flattenedInputs.map((value) => normalizeLookupToken(value)).join("|");

    const cachedResult = formulaResultCache.get(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }

    const catalog = await loadCatalog();
    const resolvedSymbols = [];
    const unresolvedInputs = [];

    flattenedInputs.forEach((token) => {
        const resolved = resolveSingleToken(token, catalog);
        resolvedSymbols.push(...resolved.symbols);

        if (!resolved.matched && resolved.unresolvedInput) {
            unresolvedInputs.push(resolved.unresolvedInput);
        }
    });

    if (resolvedSymbols.length === 0 || unresolvedInputs.length > 0) {
        const noMatchResult = {
            formula: unresolvedInputs.length > 0 ? "No Match" : "Invalid",
            name: "No Match",
            matched: false,
            unresolvedInputs,
            inputs: flattenedInputs,
            resolvedSymbols: []
        };

        formulaResultCache.set(cacheKey, noMatchResult);
        return noMatchResult;
    }

    const formula = buildFormula(resolvedSymbols);
    const inputSignature = createCompoundInputSignature(resolvedSymbols);
    const matchedCompound =
        catalog.compoundsByFormula.get(normalizeFormulaKey(formula)) ||
        catalog.compoundInputsBySignature.get(inputSignature) ||
        null;
    const displayFormula = matchedCompound?.formula || formula;

    const result = {
        formula: displayFormula,
        name: matchedCompound?.name || "No Match",
        matched: Boolean(matchedCompound),
        inputs: flattenedInputs,
        resolvedSymbols,
        unresolvedInputs: [],
        compound: matchedCompound
            ? {
                formula: matchedCompound.formula,
                name: matchedCompound.name,
                type: matchedCompound.type || null,
                conditions: matchedCompound.conditions || {},
                process: matchedCompound.process || {},
                video: matchedCompound.video || null
            }
            : null
    };

    formulaResultCache.set(cacheKey, result);
    return result;
}

function clearFormulaCaches() {
    catalogCache.clear();
    formulaResultCache.clear();
}

module.exports = {
    clearFormulaCaches,
    loadCatalog,
    normalizeFormulaKey,
    normalizeLookupToken,
    resolveChemicalInputs
};
