const test = require("node:test");
const assert = require("node:assert/strict");
const { loadCompoundsFromFile } = require("../utils/compoundSync");
const { validateChemistryData } = require("../scripts/validateChemistryData");

test("compound catalog preserves critical formula order and accepted names", () => {
    const compounds = loadCompoundsFromFile();
    const byFormula = new Map(compounds.map((compound) => [compound.formula, compound]));

    assert.equal(byFormula.get("H2O2")?.name, "Hydrogen Peroxide");
    assert.deepEqual(byFormula.get("H2O2")?.inputs, ["H", "H", "O", "O"]);
    assert.equal(byFormula.get("CH4")?.name, "Methane");
    assert.deepEqual(byFormula.get("CH4")?.inputs, ["C", "H", "H", "H", "H"]);
    assert.equal(byFormula.get("CaO")?.name, "Calcium Oxide");
    assert.deepEqual(byFormula.get("CaO")?.inputs, ["Ca", "O"]);
    assert.equal(byFormula.get("H2SO4")?.name, "Sulfuric Acid");
    assert.deepEqual(byFormula.get("H2SO4")?.inputs, ["H", "H", "S", "O", "O", "O", "O"]);
});

test("compound catalog passes automated data integrity checks", () => {
    const result = validateChemistryData();
    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true);
    assert.equal(result.count, 592);
});
