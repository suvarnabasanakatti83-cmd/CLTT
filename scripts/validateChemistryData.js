const { loadCompoundsFromFile } = require("../utils/compoundSync");

const KNOWN_COMPOUNDS = new Map([
    ["H2O2", "Hydrogen Peroxide"],
    ["CH4", "Methane"],
    ["CaO", "Calcium Oxide"],
    ["H2SO4", "Sulfuric Acid"],
    ["HNO3", "Nitric Acid"],
    ["NaCl", "Sodium Chloride"]
]);

function parseFormulaSymbols(formula) {
    const value = String(formula || "").trim();
    const symbols = [];
    const stack = [];
    let index = 0;

    while (index < value.length) {
        const char = value[index];

        if (char === "(") {
            stack.push(char);
            index += 1;
            continue;
        }

        if (char === ")") {
            if (stack.pop() !== "(") {
                return [];
            }

            index += 1;
            while (/\d/.test(value[index] || "")) {
                index += 1;
            }
            continue;
        }

        if (/[A-Z]/.test(char)) {
            let token = char;
            index += 1;

            if (/[a-z]/.test(value[index] || "")) {
                token += value[index];
                index += 1;
            }

            while (/\d/.test(value[index] || "")) {
                index += 1;
            }

            symbols.push(token);
            continue;
        }

        return [];
    }

    return stack.length === 0 ? symbols : [];
}

function validateChemistryData(compounds = loadCompoundsFromFile()) {
    const errors = [];
    const formulaSet = new Set();
    const nameSet = new Set();

    if (compounds.length !== 592) {
        errors.push(`Expected 592 compounds, found ${compounds.length}.`);
    }

    compounds.forEach((compound, index) => {
        const label = `compound[${index}]`;
        const formula = String(compound.formula || "").trim();
        const name = String(compound.name || "").trim();

        if (!formula || parseFormulaSymbols(formula).length === 0) {
            errors.push(`${label} has an invalid formula: ${formula || "<empty>"}.`);
        }

        if (!name || !/^[A-Z0-9][A-Za-z0-9(),+\-\s]+$/.test(name)) {
            errors.push(`${label} has an invalid chemical name: ${name || "<empty>"}.`);
        }

        if (name !== name.replace(/\s+/g, " ")) {
            errors.push(`${label} has inconsistent spacing in name: ${name}.`);
        }

        const normalizedName = name.toLowerCase();
        if (formulaSet.has(formula)) {
            errors.push(`Duplicate formula detected: ${formula}.`);
        }

        if (nameSet.has(normalizedName)) {
            errors.push(`Duplicate chemical name detected: ${name}.`);
        }

        formulaSet.add(formula);
        nameSet.add(normalizedName);
    });

    for (const [formula, expectedName] of KNOWN_COMPOUNDS) {
        const compound = compounds.find((entry) => entry.formula === formula);
        if (!compound) {
            errors.push(`Missing known compound ${formula}.`);
        } else if (compound.name !== expectedName) {
            errors.push(`${formula} should be named ${expectedName}, found ${compound.name}.`);
        }
    }

    return {
        valid: errors.length === 0,
        count: compounds.length,
        errors
    };
}

if (require.main === module) {
    const result = validateChemistryData();

    if (!result.valid) {
        console.error(`Chemistry data validation failed with ${result.errors.length} issue(s):`);
        result.errors.forEach((error) => console.error(`- ${error}`));
        process.exit(1);
    }

    console.log(`Chemistry data validation passed for ${result.count} compounds.`);
}

module.exports = {
    KNOWN_COMPOUNDS,
    parseFormulaSymbols,
    validateChemistryData
};
