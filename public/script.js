const rows = 1000;
const cols = 100;

let table;
let tableContainer;
let tableScrollTop;
let tableScrollTrack;
let currentSheet = "Sheet1";
let sheets = { Sheet1: {} };

let compoundData = [];
let elementLookup = new Map();
const rowDebouncers = new Map();
const rowRequestTokens = new Map();
const formulaCache = new Map();

const authClient = window.ChemLabAuth;
const authFetch = authClient ? authClient.authFetch.bind(authClient) : fetch;

function syncScrollBars() {
    if (!table || !tableContainer || !tableScrollTrack || !tableScrollTop) {
        return;
    }

    tableScrollTrack.style.width = `${table.scrollWidth}px`;
}

function ensureAuthorized(response) {
    if (response.status === 401 && authClient) {
        authClient.logout();
        return false;
    }

    if (response.status === 403 && authClient) {
        authClient.logout("/register");
        return false;
    }

    return true;
}

function showDashboardMessage(message, type = "success") {
    const messageEl = document.getElementById("dashboard-message");
    if (!messageEl) {
        return;
    }

    messageEl.textContent = message;
    messageEl.className = `dashboard-message ${type}`;
    window.clearTimeout(showDashboardMessage.timeoutId);
    showDashboardMessage.timeoutId = window.setTimeout(() => {
        messageEl.textContent = "";
        messageEl.className = "dashboard-message";
    }, 3600);
}

function normalizeElementToken(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function buildElementLookup(elements) {
    const lookup = new Map();

    elements.forEach((element) => {
        const terms = [
            element.name,
            element.symbol,
            ...(Array.isArray(element.aliases) ? element.aliases : [])
        ];

        terms.forEach((term) => {
            const normalized = normalizeElementToken(term);
            if (normalized) {
                lookup.set(normalized, element);
            }
        });
    });

    return lookup;
}

function formatFormulaForDisplay(formula) {
    const subscriptDigits = {
        0: "₀",
        1: "₁",
        2: "₂",
        3: "₃",
        4: "₄",
        5: "₅",
        6: "₆",
        7: "₇",
        8: "₈",
        9: "₉"
    };

    return String(formula || "").replace(/\d/g, (digit) => subscriptDigits[digit] || digit);
}

function getCompoundExplanation(resolution) {
    const description = resolution?.compound?.process?.description;
    if (description) {
        return description;
    }

    const formula = String(resolution?.formula || "").trim();
    const name = String(resolution?.name || "").trim();
    const matchedCompound = compoundData.find((compound) => {
        return String(compound.formula || "").trim() === formula ||
            String(compound.name || "").trim().toLowerCase() === name.toLowerCase();
    });

    return matchedCompound?.process?.description || "No explanation is available for this compound in the current dataset.";
}

function resolveElementCell(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
        return { valid: false, reason: "empty" };
    }

    const element = elementLookup.get(normalizeElementToken(trimmed));
    if (!element) {
        return { valid: false, reason: "invalid", value: trimmed };
    }

    return {
        valid: true,
        symbol: element.symbol,
        label: element.name
    };
}

function addSheet() {
    const name = prompt("Enter sheet name:");
    if (!name) return;
    if (sheets[name]) {
        alert("Sheet already exists!");
        return;
    }

    sheets[name] = {};
    currentSheet = name;
    updateSheetDropdown();
    document.getElementById("current-sheet").innerText = "Current Sheet: " + name;
    createGrid();
}

function updateSheetDropdown() {
    const select = document.getElementById("sheet-select");
    select.innerHTML = "";

    for (const sheet in sheets) {
        const option = document.createElement("option");
        option.value = sheet;
        option.innerText = sheet;
        if (sheet === currentSheet) option.selected = true;
        select.appendChild(option);
    }
}

function rehydrateSheetData() {
    const data = sheets[currentSheet] || {};

    for (const key in data) {
        const [r, c] = key.split("-").map(Number);
        table.rows[r + 1].cells[c + 5].innerText = data[key];
        scheduleCombineRow(r, 0);
    }
}

function switchSheet() {
    const select = document.getElementById("sheet-select");
    currentSheet = select.value;

    document.getElementById("current-sheet").innerText =
        "Current Sheet: " + currentSheet;

    createGrid();
    rehydrateSheetData();
}

async function deleteSheet() {
    const sheetNames = Object.keys(sheets);

    if (sheetNames.length === 1) {
        alert("At least one sheet must exist!");
        return;
    }

    const confirmDelete = confirm(`Delete "${currentSheet}"?`);
    if (!confirmDelete) return;

    const response = await authFetch(`/api/delete/${encodeURIComponent(currentSheet)}`, {
        method: "DELETE"
    });

    if (!ensureAuthorized(response)) return;

    delete sheets[currentSheet];
    currentSheet = Object.keys(sheets)[0];

    updateSheetDropdown();
    document.getElementById("current-sheet").innerText =
        "Current Sheet: " + currentSheet;

    createGrid();
    rehydrateSheetData();
}

async function loadData() {
    try {
        const res = await authFetch(`/api/load/${encodeURIComponent(currentSheet)}`);
        if (!ensureAuthorized(res)) return;

        const data = await res.json();

        if (!data.data) {
            alert("No data found!");
            return;
        }

        sheets[currentSheet] = data.data;
        createGrid();
        rehydrateSheetData();
        showDashboardMessage("Loaded successfully.");
    } catch (err) {
        console.error(err);
        showDashboardMessage("Load failed.", "error");
    }
}

async function saveData() {
    try {
        const res = await authFetch("/api/save", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: currentSheet,
                data: sheets[currentSheet]
            })
        });

        if (!ensureAuthorized(res)) return;

        showDashboardMessage("Saved successfully.");
    } catch (err) {
        console.error(err);
        showDashboardMessage("Save failed.", "error");
    }
}

async function loadCompounds() {
    try {
        const res = await authFetch("/api/compounds");
        if (!ensureAuthorized(res)) return;

        const data = await res.json();
        compoundData = Array.isArray(data) ? data : data.items || [];
    } catch (err) {
        console.error("Compounds load error:", err);
        compoundData = [];
    }
}

async function loadElements() {
    try {
        const res = await authFetch("/api/elements");
        if (!ensureAuthorized(res)) return;

        const data = await res.json();
        const elements = Array.isArray(data) ? data : data.items || [];
        elementLookup = buildElementLookup(elements);
    } catch (err) {
        console.error("Elements API load error:", err);
    }

    if (elementLookup.size > 0) {
        return;
    }

    try {
        const fallbackRes = await fetch("/elements.json");
        const fallbackData = await fallbackRes.json();
        elementLookup = buildElementLookup(fallbackData.elements || []);
    } catch (err) {
        console.error("Elements fallback load error:", err);
        elementLookup = new Map();
    }
}

async function clearSheet() {
    const confirmClear = confirm("Are you sure you want to clear this sheet?");
    if (!confirmClear) return;

    const response = await authFetch(`/api/delete/${encodeURIComponent(currentSheet)}`, {
        method: "DELETE"
    });

    if (!ensureAuthorized(response)) return;

    sheets[currentSheet] = {};

    for (let i = 0; i < rows; i++) {
        const row = table.rows[i + 1];

        for (let c = 1; c <= 4; c++) {
            row.cells[c].innerText = "";
        }

        for (let j = 0; j < cols; j++) {
            row.cells[j + 5].innerText = "";
        }
    }

    showDashboardMessage("Sheet cleared successfully.");
}

function closePopup() {
    const popup = document.getElementById("popup");
    if (popup) {
        popup.style.display = "none";
    }
}

function openVideo() {
    alert("Video integration can be connected when compound video URLs are available.");
}

async function requestFormulaResolution(inputs) {
    const cacheKey = inputs.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean).join("|");
    if (formulaCache.has(cacheKey)) {
        return formulaCache.get(cacheKey);
    }

    const response = await authFetch("/api/formula/resolve", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs })
    });

    if (!ensureAuthorized(response)) {
        return null;
    }

    const resolution = await response.json();
    formulaCache.set(cacheKey, resolution);

    if (formulaCache.size > 500) {
        formulaCache.delete(formulaCache.keys().next().value);
    }

    return resolution;
}

function collectRowInputs(rowIndex) {
    const rowEl = table.rows[rowIndex + 1];
    const values = [];
    const invalidInputs = [];

    for (let j = 0; j < cols; j++) {
        const cell = rowEl.cells[j + 5];
        const value = cell.innerText.trim();
        cell.removeAttribute("title");

        if (value) {
            const resolved = resolveElementCell(value);

            if (resolved.valid) {
                values.push(resolved.symbol);
            } else {
                invalidInputs.push(value);
                cell.title = "Enter exactly one valid element name or symbol.";
            }
        }
    }

    return { values, invalidInputs };
}

function applyRowResolution(rowIndex, resolution) {
    const rowEl = table.rows[rowIndex + 1];
    if (!rowEl) {
        return;
    }

    if (!resolution || resolution.formula === "Invalid") {
        rowEl.cells[1].innerText = "No Match";
        rowEl.cells[2].innerText = "";
        rowEl.cells[3].innerText = "";
        rowEl.cells[4].innerText = "";
        return;
    }

    rowEl.cells[1].innerText = resolution.name || "No Match";
    rowEl.cells[2].innerText = formatFormulaForDisplay(resolution.formula || "");
    rowEl.cells[3].innerText = resolution.compound?.process || "";

    const conditions = resolution.compound?.conditions || {};
    const conditionParts = [conditions.temperature, conditions.pressure].filter(Boolean);
    rowEl.cells[4].innerText = conditionParts.length > 0 ? conditionParts.join(" | ") : "Standard";
}

async function combineRow(rowIndex) {
    const { values: inputs, invalidInputs } = collectRowInputs(rowIndex);
    const rowEl = table.rows[rowIndex + 1];

    if (invalidInputs.length > 0) {
        rowRequestTokens.delete(rowIndex);
        rowEl.cells[1].innerText = "Invalid Element";
        rowEl.cells[2].innerText = "";
        rowEl.cells[3].innerText = "Each input box must contain exactly one valid element name or symbol.";
        rowEl.cells[4].innerText = "";
        return;
    }

    if (!inputs.length) {
        rowRequestTokens.delete(rowIndex);
        for (let cellIndex = 1; cellIndex <= 4; cellIndex += 1) {
            rowEl.cells[cellIndex].innerText = "";
        }
        return;
    }

    const token = `${Date.now()}-${Math.random()}`;
    rowRequestTokens.set(rowIndex, token);

    const resolution = await requestFormulaResolution(inputs);
    if (!resolution || rowRequestTokens.get(rowIndex) !== token) {
        return;
    }

    applyRowResolution(rowIndex, resolution);
}

function scheduleCombineRow(rowIndex, delay = 150) {
    clearTimeout(rowDebouncers.get(rowIndex));
    rowDebouncers.set(
        rowIndex,
        setTimeout(() => {
            combineRow(rowIndex).catch((error) => console.error("Formula resolution error:", error));
        }, delay)
    );
}

async function handleInput() {
    const inputBox = document.getElementById("inputBox");
    const formulaOutput = document.getElementById("formulaOutput");
    const nameOutput = document.getElementById("nameOutput");

    if (!inputBox || !formulaOutput || !nameOutput) {
        return;
    }

    const resolvedInput = resolveElementCell(inputBox.value);
    if (!resolvedInput.valid) {
        formulaOutput.innerText = "Formula: No Match";
        nameOutput.innerText = "Name: Invalid Element";
        return;
    }

    const resolution = await requestFormulaResolution([resolvedInput.symbol]);
    if (!resolution) {
        return;
    }

    formulaOutput.innerText = "Formula: " + formatFormulaForDisplay(resolution.formula || "No Match");
    nameOutput.innerText = "Name: " + (resolution.name || "No Match");
}

function createHeader() {
    const tr = document.createElement("tr");
    const headers = ["SI.NO", "Chemical Name", "Chemical Formula", "Process", "Conditions"];

    headers.forEach((h, index) => {
        const td = document.createElement("td");
        td.innerText = h;
        td.classList.add(index === 0 ? "freeze-left-top" : "freeze-top");
        tr.appendChild(td);
    });

    for (let j = 0; j < cols; j++) {
        const td = document.createElement("td");
        td.innerText = "Input " + (j + 1);
        td.classList.add("freeze-top");
        tr.appendChild(td);
    }

    table.appendChild(tr);
}

function createGrid() {
    table.innerHTML = "";
    createHeader();

    for (let i = 0; i < rows; i++) {
        const tr = document.createElement("tr");

        const si = document.createElement("td");
        si.innerText = i + 1;
        si.classList.add("freeze-left");
        tr.appendChild(si);

        for (let k = 0; k < 4; k++) {
            const td = document.createElement("td");
            tr.appendChild(td);
        }

        for (let j = 0; j < cols; j++) {
            const td = document.createElement("td");
            td.contentEditable = true;
            td.dataset.cell = `${i}-${j}`;

            td.addEventListener("input", () => {
                const value = td.innerText.trim();
                if (value) {
                    sheets[currentSheet][td.dataset.cell] = value;
                } else {
                    delete sheets[currentSheet][td.dataset.cell];
                }

                scheduleCombineRow(i);
            });

            td.addEventListener("keydown", (e) => {
                const [row, col] = td.dataset.cell.split("-").map(Number);

                if (e.key === "ArrowDown" && row + 1 < rows) {
                    e.preventDefault();
                    table.rows[row + 2].cells[col + 5].focus();
                }

                if (e.key === "ArrowUp" && row > 0) {
                    e.preventDefault();
                    table.rows[row].cells[col + 5].focus();
                }

                if (e.key === "ArrowRight" && col + 1 < cols) {
                    e.preventDefault();
                    table.rows[row + 1].cells[col + 6].focus();
                }

                if (e.key === "ArrowLeft" && col > 0) {
                    e.preventDefault();
                    table.rows[row + 1].cells[col + 4].focus();
                }
            });

            tr.appendChild(td);
        }

        table.appendChild(tr);
    }

    syncScrollBars();
}

window.addEventListener("DOMContentLoaded", async () => {
    if (authClient) {
        authClient.requireFullAccess();
    }

    table = document.getElementById("main-table");
    tableContainer = document.getElementById("table-container");
    tableScrollTop = document.getElementById("table-scroll-top");
    tableScrollTrack = document.getElementById("table-scroll-track");

    const userNameEl = document.getElementById("user-name");
    if (userNameEl && authClient) {
        userNameEl.innerText = authClient.getUserName() || "Researcher";
    }

    await loadElements();
    await loadCompounds();
    updateSheetDropdown();
    createGrid();

    if (tableContainer && tableScrollTop) {
        let syncingFromTop = false;
        let syncingFromBottom = false;

        tableScrollTop.addEventListener("scroll", () => {
            if (syncingFromBottom) {
                syncingFromBottom = false;
                return;
            }

            syncingFromTop = true;
            tableContainer.scrollLeft = tableScrollTop.scrollLeft;
        });

        tableContainer.addEventListener("scroll", () => {
            if (syncingFromTop) {
                syncingFromTop = false;
                return;
            }

            syncingFromBottom = true;
            tableScrollTop.scrollLeft = tableContainer.scrollLeft;
        });
    }

    window.addEventListener("resize", syncScrollBars);

    const feedbackButton = document.getElementById("feedback-button");
    const feedbackModal = document.getElementById("feedback-modal");
    const closeFeedbackButton = document.getElementById("close-feedback-button");
    const feedbackForm = document.getElementById("feedback-form");
    const feedbackStatus = document.getElementById("feedback-status");
    const feedbackTitle = document.getElementById("feedback-title");
    const feedbackIntro = document.getElementById("feedback-intro");
    let feedbackAfterSubmit = null;

    function setFeedbackStatus(message, type = "") {
        if (!feedbackStatus) {
            return;
        }

        feedbackStatus.textContent = message;
        feedbackStatus.className = `auth-message ${type}`.trim();
    }

    function configureFeedbackMode(mode = "standard") {
        if (feedbackTitle) {
            feedbackTitle.textContent = mode === "logout" ? "Before You Leave" : "Share your CLTT experience";
        }

        if (feedbackIntro) {
            feedbackIntro.textContent = mode === "logout"
                ? "Thank you for using CLTT. We would appreciate your feedback to improve the platform. Please answer the following questions."
                : "We would appreciate your feedback to improve the platform. Please answer the following questions.";
        }
    }

    function closeFeedbackModal() {
        if (feedbackModal) {
            feedbackModal.hidden = true;
        }
    }

    function openFeedbackModal(mode = "standard", afterSubmit = null) {
        if (!feedbackModal) {
            return;
        }

        feedbackAfterSubmit = typeof afterSubmit === "function" ? afterSubmit : null;
        configureFeedbackMode(mode);
        feedbackModal.hidden = false;
        setFeedbackStatus("");
    }

    if (feedbackButton && feedbackModal) {
        feedbackButton.addEventListener("click", () => openFeedbackModal("standard"));
    }

    window.CLTTFeedback = {
        openForLogout() {
            openFeedbackModal("logout", () => {
                if (authClient) {
                    authClient.logout("/");
                } else {
                    window.location.replace("/");
                }
            });
        }
    };

    if (closeFeedbackButton) {
        closeFeedbackButton.addEventListener("click", closeFeedbackModal);
    }

    if (feedbackModal) {
        feedbackModal.addEventListener("click", (event) => {
            if (event.target === feedbackModal) {
                closeFeedbackModal();
            }
        });
    }

    if (feedbackForm) {
        feedbackForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const submitButton = feedbackForm.querySelector("button[type='submit']");
            const payload = Object.fromEntries(new FormData(feedbackForm).entries());

            try {
                if (submitButton) {
                    submitButton.disabled = true;
                    submitButton.classList.add("is-loading");
                }

                setFeedbackStatus("Saving feedback...", "");
                const response = await authFetch("/api/feedback", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                });

                if (!ensureAuthorized(response)) {
                    return;
                }

                const result = await response.json();
                if (!response.ok && response.status !== 409) {
                    setFeedbackStatus(result.message || "Feedback could not be saved.", "error");
                    return;
                }

                const submittedAt = result.feedback?.createdAt
                    ? new Date(result.feedback.createdAt).toLocaleString()
                    : new Date().toLocaleString();
                feedbackForm.innerHTML = `
                    <div class="success-panel">
                        <div class="eyebrow">Feedback Submitted</div>
                        <h2>Feedback Submitted</h2>
                        <p>Thank you for providing your feedback.</p>
                        <p>Your suggestions help us improve CLTT for all users.</p>
                        <p class="table-meta">Feedback ID: ${result.feedback?.id || "Saved"} | Submitted: ${submittedAt}</p>
                        <button type="button" class="button-muted" id="feedback-thanks-close">Close</button>
                    </div>
                `;

                document.getElementById("feedback-thanks-close")?.addEventListener("click", closeFeedbackModal);
                if (feedbackAfterSubmit) {
                    window.setTimeout(feedbackAfterSubmit, 1400);
                }
            } catch (error) {
                console.error("Feedback submission error:", error);
                setFeedbackStatus("Feedback submission failed.", "error");
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.classList.remove("is-loading");
                }
            }
        });
    }
});

window.handleInput = handleInput;
window.addSheet = addSheet;
window.switchSheet = switchSheet;
window.deleteSheet = deleteSheet;
window.loadData = loadData;
window.saveData = saveData;
window.clearSheet = clearSheet;
window.closePopup = closePopup;
window.openVideo = openVideo;
