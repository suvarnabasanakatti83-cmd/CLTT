class RequestValidationError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = "RequestValidationError";
        this.statusCode = 400;
        this.details = details;
    }
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectDangerousKeys(value, path = "payload") {
    if (Array.isArray(value)) {
        value.forEach((entry, index) => rejectDangerousKeys(entry, `${path}[${index}]`));
        return;
    }

    if (!isPlainObject(value)) {
        return;
    }

    for (const [key, nestedValue] of Object.entries(value)) {
        if (
            key.startsWith("$") ||
            key.includes(".") ||
            key === "__proto__" ||
            key === "constructor" ||
            key === "prototype"
        ) {
            throw new RequestValidationError(`Unsafe field "${path}.${key}" is not allowed.`);
        }

        rejectDangerousKeys(nestedValue, `${path}.${key}`);
    }
}

function ensurePlainObject(value, fieldName) {
    if (!isPlainObject(value)) {
        throw new RequestValidationError(`${fieldName} must be a JSON object.`);
    }

    rejectDangerousKeys(value, fieldName);
    return value;
}

function assertAllowedKeys(value, allowedKeys, fieldName) {
    const objectValue = ensurePlainObject(value, fieldName);
    const unexpectedKeys = Object.keys(objectValue).filter((key) => !allowedKeys.includes(key));

    if (unexpectedKeys.length > 0) {
        throw new RequestValidationError(
            `Unexpected field(s) in ${fieldName}: ${unexpectedKeys.join(", ")}.`
        );
    }

    return objectValue;
}

function requireString(value, fieldName, options = {}) {
    if (typeof value !== "string") {
        throw new RequestValidationError(`${fieldName} must be a string.`);
    }

    const normalized = options.trim === false ? value : value.trim();

    if (!options.allowEmpty && normalized.length === 0) {
        throw new RequestValidationError(`${fieldName} is required.`);
    }

    if (options.minLength && normalized.length < options.minLength) {
        throw new RequestValidationError(`${fieldName} must be at least ${options.minLength} characters long.`);
    }

    if (options.maxLength && normalized.length > options.maxLength) {
        throw new RequestValidationError(`${fieldName} must be at most ${options.maxLength} characters long.`);
    }

    if (options.pattern && !options.pattern.test(normalized)) {
        throw new RequestValidationError(options.patternMessage || `${fieldName} is invalid.`);
    }

    return normalized;
}

function optionalString(value, fieldName, options = {}) {
    if (value === undefined || value === null || value === "") {
        return options.defaultValue === undefined ? undefined : options.defaultValue;
    }

    return requireString(value, fieldName, { ...options, allowEmpty: false });
}

function requireEnum(value, fieldName, allowedValues) {
    const normalized = requireString(value, fieldName, { maxLength: 100 });

    if (!allowedValues.includes(normalized)) {
        throw new RequestValidationError(`${fieldName} must be one of: ${allowedValues.join(", ")}.`);
    }

    return normalized;
}

function requireEmail(value, fieldName = "email") {
    const email = requireString(value, fieldName, {
        maxLength: 254,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        patternMessage: "Please enter a valid email address."
    });

    return email.toLowerCase();
}

function requireMobile(value, fieldName = "mobile") {
    const mobile = requireString(value, fieldName, {
        minLength: 10,
        maxLength: 20,
        pattern: /^[+\d][\d\s()-]{8,19}$/,
        patternMessage: `${fieldName} must be a valid mobile number.`
    });

    const digits = mobile.replace(/\D+/g, "");
    if (digits.length < 10 || digits.length > 15) {
        throw new RequestValidationError(`${fieldName} must contain between 10 and 15 digits.`);
    }

    return mobile;
}

function requireDateString(value, fieldName) {
    const normalized = requireString(value, fieldName, {
        pattern: /^\d{4}-\d{2}-\d{2}$/,
        patternMessage: `${fieldName} must be in YYYY-MM-DD format.`
    });

    const date = new Date(`${normalized}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
        throw new RequestValidationError(`${fieldName} must be a valid date.`);
    }

    return normalized;
}

function requirePassword(value, fieldName = "password") {
    return requireString(value, fieldName, {
        minLength: 8,
        maxLength: 72,
        trim: false
    });
}

function normalizeStringArray(value, fieldName, options = {}) {
    if (!Array.isArray(value)) {
        throw new RequestValidationError(`${fieldName} must be an array.`);
    }

    const normalized = value.map((entry, index) =>
        requireString(entry, `${fieldName}[${index}]`, {
            minLength: options.minLength || 1,
            maxLength: options.maxLength || 50
        })
    );

    if (!options.allowDuplicates) {
        const uniqueValues = Array.from(new Set(normalized));
        if (uniqueValues.length !== normalized.length) {
            throw new RequestValidationError(`${fieldName} must not contain duplicate values.`);
        }
    }

    if (options.minItems && normalized.length < options.minItems) {
        throw new RequestValidationError(`${fieldName} must contain at least ${options.minItems} item(s).`);
    }

    if (options.maxItems && normalized.length > options.maxItems) {
        throw new RequestValidationError(`${fieldName} must contain at most ${options.maxItems} item(s).`);
    }

    return normalized;
}

function requireNumber(value, fieldName, options = {}) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new RequestValidationError(`${fieldName} must be a valid number.`);
    }

    if (options.integer && !Number.isInteger(value)) {
        throw new RequestValidationError(`${fieldName} must be an integer.`);
    }

    if (options.min !== undefined && value < options.min) {
        throw new RequestValidationError(`${fieldName} must be at least ${options.min}.`);
    }

    if (options.max !== undefined && value > options.max) {
        throw new RequestValidationError(`${fieldName} must be at most ${options.max}.`);
    }

    return value;
}

function ensureJsonSafe(value, fieldName, depth = 0) {
    if (depth > 20) {
        throw new RequestValidationError(`${fieldName} is too deeply nested.`);
    }

    if (value === null) {
        return null;
    }

    if (["string", "number", "boolean"].includes(typeof value)) {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map((entry, index) => ensureJsonSafe(entry, `${fieldName}[${index}]`, depth + 1));
    }

    if (isPlainObject(value)) {
        rejectDangerousKeys(value, fieldName);

        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, ensureJsonSafe(entry, `${fieldName}.${key}`, depth + 1)])
        );
    }

    throw new RequestValidationError(`${fieldName} must contain only JSON-safe values.`);
}

function normalizeCompoundPayload(value) {
    const body = assertAllowedKeys(value, ["name", "formula", "inputs", "type", "conditions", "process", "video"], "body");

    const payload = {
        name: requireString(body.name, "name", { minLength: 2, maxLength: 120 }),
        formula: requireString(body.formula, "formula", {
            minLength: 1,
            maxLength: 50,
            pattern: /^[A-Za-z0-9()+\-.[\]\s]+$/,
            patternMessage: "formula contains unsupported characters."
        }),
        inputs: normalizeStringArray(body.inputs, "inputs", {
            minItems: 1,
            maxItems: 200,
            allowDuplicates: true,
            maxLength: 10
        })
    };

    if (body.type !== undefined) {
        payload.type = requireString(body.type, "type", { maxLength: 50 }).toLowerCase();
    }

    if (body.conditions !== undefined) {
        const conditions = assertAllowedKeys(body.conditions, ["temperature", "pressure"], "conditions");
        payload.conditions = {};

        if (conditions.temperature !== undefined) {
            payload.conditions.temperature = requireString(conditions.temperature, "conditions.temperature", { maxLength: 100 });
        }

        if (conditions.pressure !== undefined) {
            payload.conditions.pressure = requireString(conditions.pressure, "conditions.pressure", { maxLength: 100 });
        }
    }

    if (body.process !== undefined) {
        const process = assertAllowedKeys(body.process, ["description", "steps"], "process");
        payload.process = {};

        if (process.description !== undefined) {
            payload.process.description = requireString(process.description, "process.description", { maxLength: 1000 });
        }

        if (process.steps !== undefined) {
            payload.process.steps = normalizeStringArray(process.steps, "process.steps", {
                minItems: 1,
                maxItems: 20,
                maxLength: 300,
                allowDuplicates: true
            });
        }
    }

    if (body.video !== undefined) {
        payload.video = requireString(body.video, "video", {
            maxLength: 500,
            pattern: /^https?:\/\/.+/i,
            patternMessage: "video must be a valid http(s) URL."
        });
    }

    return payload;
}

function normalizeBulkCompoundsPayload(value) {
    const body = assertAllowedKeys(value, ["compounds"], "body");

    if (!Array.isArray(body.compounds)) {
        throw new RequestValidationError("compounds must be an array.");
    }

    if (body.compounds.length === 0 || body.compounds.length > 500) {
        throw new RequestValidationError("compounds must contain between 1 and 500 entries.");
    }

    return body.compounds.map((compound, index) => {
        try {
            return normalizeCompoundPayload(compound);
        } catch (error) {
            if (error instanceof RequestValidationError) {
                throw new RequestValidationError(`Invalid compound at index ${index}: ${error.message}`);
            }

            throw error;
        }
    });
}

function normalizeElementPayload(value) {
    const body = assertAllowedKeys(
        value,
        ["name", "symbol", "atomicNumber", "atomicMass", "aliases", "category", "stateAtRoomTemp"],
        "element"
    );

    const payload = {
        name: requireString(body.name, "element.name", { minLength: 1, maxLength: 120 }),
        symbol: requireString(body.symbol, "element.symbol", {
            minLength: 1,
            maxLength: 3,
            pattern: /^[A-Za-z]{1,3}$/,
            patternMessage: "element.symbol must contain only letters."
        }),
        atomicNumber: requireNumber(body.atomicNumber, "element.atomicNumber", {
            integer: true,
            min: 1,
            max: 118
        }),
        aliases: body.aliases === undefined
            ? []
            : normalizeStringArray(body.aliases, "element.aliases", {
                minItems: 1,
                maxItems: 25,
                maxLength: 120,
                allowDuplicates: false
            })
    };

    if (body.atomicMass !== undefined && body.atomicMass !== null) {
        payload.atomicMass = requireNumber(body.atomicMass, "element.atomicMass", {
            min: 0.0001,
            max: 400
        });
    }

    if (body.category !== undefined) {
        payload.category = requireEnum(body.category, "element.category", [
            "alkali metal",
            "alkaline earth metal",
            "transition metal",
            "post-transition metal",
            "metalloid",
            "nonmetal",
            "halogen",
            "noble gas",
            "lanthanide",
            "actinide",
            "unknown"
        ]);
    }

    if (body.stateAtRoomTemp !== undefined) {
        payload.stateAtRoomTemp = requireEnum(body.stateAtRoomTemp, "element.stateAtRoomTemp", [
            "solid",
            "liquid",
            "gas",
            "unknown"
        ]);
    }

    return payload;
}

function normalizeBulkElementsPayload(value) {
    const body = assertAllowedKeys(value, ["elements"], "body");
    let entries;

    if (Array.isArray(body.elements)) {
        entries = body.elements;
    } else if (isPlainObject(body.elements)) {
        entries = Object.entries(body.elements).map(([name, element]) => ({ name, ...element }));
    } else {
        throw new RequestValidationError("elements must be an array or object map.");
    }

    if (entries.length === 0 || entries.length > 200) {
        throw new RequestValidationError("elements must contain between 1 and 200 entries.");
    }

    return entries.map((element, index) => {
        try {
            return normalizeElementPayload(element);
        } catch (error) {
            if (error instanceof RequestValidationError) {
                throw new RequestValidationError(`Invalid element at index ${index}: ${error.message}`);
            }

            throw error;
        }
    });
}

function normalizeSheetPayload(value) {
    const body = assertAllowedKeys(value, ["name", "data"], "body");

    return {
        name: requireString(body.name, "name", { minLength: 1, maxLength: 100 }),
        data: ensureJsonSafe(body.data, "data")
    };
}

function normalizeFeedbackPayload(value) {
    const body = assertAllowedKeys(
        value,
        [
            "overallExperience",
            "easeOfUse",
            "chemicalAccuracy",
            "speedRating",
            "learningValue",
            "futureUsage",
            "recommendation",
            "suggestions"
        ],
        "body"
    );

    return {
        overallExperience: requireEnum(body.overallExperience, "overallExperience", ["Excellent", "Good", "Average", "Poor"]),
        easeOfUse: requireEnum(body.easeOfUse, "easeOfUse", ["Very Easy", "Easy", "Neutral", "Difficult", "Very Difficult"]),
        chemicalAccuracy: requireEnum(body.chemicalAccuracy, "chemicalAccuracy", ["Yes", "No", "Not Sure"]),
        speedRating: requireEnum(body.speedRating, "speedRating", ["Excellent", "Good", "Average", "Poor"]),
        learningValue: requireEnum(body.learningValue, "learningValue", [
            "Strongly Agree",
            "Agree",
            "Neutral",
            "Disagree",
            "Strongly Disagree"
        ]),
        futureUsage: requireEnum(body.futureUsage, "futureUsage", ["Definitely", "Maybe", "No"]),
        recommendation: requireEnum(body.recommendation, "recommendation", ["Yes", "No"]),
        suggestions: optionalString(body.suggestions, "suggestions", { maxLength: 2000, defaultValue: "" }) || ""
    };
}

module.exports = {
    RequestValidationError,
    assertAllowedKeys,
    ensureJsonSafe,
    ensurePlainObject,
    isPlainObject,
    normalizeBulkCompoundsPayload,
    normalizeBulkElementsPayload,
    normalizeCompoundPayload,
    normalizeElementPayload,
    normalizeFeedbackPayload,
    normalizeSheetPayload,
    normalizeStringArray,
    optionalString,
    rejectDangerousKeys,
    requireEmail,
    requireMobile,
    requireEnum,
    requireDateString,
    requireNumber,
    requirePassword,
    requireString
};
