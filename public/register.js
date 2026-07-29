document.addEventListener("DOMContentLoaded", async () => {
    const auth = window.ChemLabAuth;
    await auth.ensureGuestPage();

    const DRAFT_KEY = "cltt_registration_draft";
    const AUTOSAVE_DELAY_MS = 350;

    const PROFESSION_SCHEMAS = {
        student: {
            title: "Student Academic Information",
            groups: [
                {
                    heading: "Academic Information",
                    fields: [
                        {
                            name: "educationLevel",
                            label: "Current Education Level",
                            type: "select",
                            options: ["School", "PUC", "Diploma", "Undergraduate", "Postgraduate", "PhD", "Other"]
                        },
                        { name: "currentYearSemester", label: "Current Year/Semester" },
                        { name: "courseName", label: "Course Name" },
                        { name: "branchSpecialization", label: "Branch/Specialization" },
                        { name: "institutionName", label: "Institution/College/University Name" },
                        { name: "institutionAddress", label: "Institution Address" },
                        { name: "studentId", label: "Student ID", optional: true }
                    ]
                },
                {
                    heading: "Laboratory Interest",
                    fields: [
                        { name: "chemistryFieldInterest", label: "Chemistry Field of Interest" },
                        { name: "researchInterest", label: "Research Interest" },
                        {
                            name: "laboratoryExperienceLevel",
                            label: "Laboratory Experience Level",
                            type: "select",
                            options: ["Beginner", "Intermediate", "Advanced"]
                        }
                    ]
                }
            ]
        },
        teacher: {
            title: "Teacher Professional Information",
            groups: [
                {
                    heading: "Teaching Profile",
                    fields: [
                        {
                            name: "teacherType",
                            label: "Teacher Type",
                            type: "select",
                            options: ["School Teacher", "Lecturer", "Professor", "Tutor", "Coaching Faculty", "Lab Trainer"]
                        },
                        { name: "subjectTeaching", label: "Subject Teaching" },
                        { name: "institutionName", label: "Institution/College/School Name" },
                        { name: "department", label: "Department" },
                        { name: "yearsExperience", label: "Years of Experience", type: "number", min: "0" },
                        { name: "qualification", label: "Qualification" },
                        { name: "researchArea", label: "Research Area", optional: true }
                    ]
                }
            ]
        },
        lab_technician: {
            title: "Laboratory Technician Information",
            groups: [
                {
                    heading: "Laboratory Profile",
                    fields: [
                        { name: "laboratoryName", label: "Laboratory Name" },
                        {
                            name: "laboratoryType",
                            label: "Laboratory Type",
                            type: "select",
                            options: ["Research Lab", "Diagnostic Lab", "Industrial Lab", "Academic Lab", "Quality Control Lab"]
                        },
                        { name: "designation", label: "Designation" },
                        { name: "specialization", label: "Specialization" },
                        { name: "yearsExperience", label: "Years of Experience", type: "number", min: "0" },
                        { name: "equipmentExpertise", label: "Equipment Expertise" },
                        { name: "certificationDetails", label: "Certification Details" },
                        { name: "shiftType", label: "Shift Type" }
                    ]
                }
            ]
        },
        researcher: {
            title: "Researcher Information",
            groups: [
                {
                    heading: "Research Profile",
                    fields: [
                        { name: "researchDomain", label: "Research Domain" },
                        { name: "currentResearchTopic", label: "Current Research Topic" },
                        { name: "researchInstitution", label: "Institution/Research Center" },
                        { name: "publicationsCount", label: "Publications Count", type: "number", min: "0" },
                        { name: "researchExperience", label: "Research Experience" },
                        { name: "fundingOrganization", label: "Funding Organization", optional: true },
                        { name: "laboratoryType", label: "Laboratory Type" },
                        { name: "researchArea", label: "Research Area" },
                        { name: "collaborationInterest", label: "Collaboration Interest" },
                        { name: "scientificToolsUsed", label: "Scientific Tools Used" }
                    ]
                }
            ]
        },
        chemist: {
            title: "Chemist Practice Information",
            groups: [
                {
                    heading: "Chemistry Practice",
                    fields: [
                        { name: "chemistrySpecialization", label: "Chemistry Specialization" },
                        { name: "industryType", label: "Industry Type" },
                        { name: "currentOrganization", label: "Current Organization" },
                        { name: "yearsPractice", label: "Years of Practice", type: "number", min: "0" },
                        { name: "certifications", label: "Certifications" },
                        { name: "laboratoryAccessType", label: "Laboratory Access Type" },
                        { name: "instrumentExperience", label: "Instrument Experience" }
                    ]
                }
            ]
        },
        industry_professional: {
            title: "Industry Professional Information",
            groups: [
                {
                    heading: "Industry Profile",
                    fields: [
                        { name: "companyName", label: "Company Name" },
                        { name: "industrySector", label: "Industry Sector" },
                        { name: "jobRole", label: "Job Role" },
                        { name: "department", label: "Department" },
                        { name: "yearsExperience", label: "Years of Experience", type: "number", min: "0" },
                        { name: "industrialProcessExpertise", label: "Industrial Process Expertise" },
                        { name: "safetyCertification", label: "Safety Certification" }
                    ]
                }
            ]
        }
    };

    const PROFESSION_LABELS = {
        student: "Student",
        teacher: "Teacher",
        lab_technician: "Lab Technician",
        researcher: "Researcher",
        chemist: "Chemist",
        industry_professional: "Industry Professional"
    };

    const form = document.getElementById("register-form");
    const messageEl = document.getElementById("form-message");
    const registerSubmit = document.getElementById("register-submit");
    const accountContinue = document.getElementById("account-continue");
    const saveDraftButton = document.getElementById("save-draft-button");
    const draftStatus = document.getElementById("draft-status");
    const progressCopy = document.getElementById("profile-progress-copy");
    const progressBar = document.getElementById("profile-progress-bar");
    const profileSection = document.getElementById("profile-section");
    const professionSection = document.getElementById("profession-section");
    const professionSelect = document.getElementById("profession");
    const professionFields = document.getElementById("profession-fields");

    let autosaveTimer = null;
    let accountCompleted = false;
    let profileCompleted = false;

    function setMessage(target, message, type = "") {
        if (!target) {
            return;
        }

        target.textContent = message || "";
        target.className = target.id === "form-message"
            ? `auth-message${type ? ` ${type}` : ""}`
            : `field-message${type ? ` ${type}` : ""}`;
    }

    function postJson(url, payload) {
        return fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify(payload)
        }).then(async (response) => ({ response, result: await response.json() }));
    }

    function setSubmitState(isBusy, label) {
        registerSubmit.disabled = isBusy;
        registerSubmit.classList.toggle("is-loading", isBusy);
        registerSubmit.textContent = label;
    }

    function setFieldError(name, message) {
        const errorEl = form.querySelector(`[data-error-for="${name}"]`);
        const field = form.elements[name];

        if (errorEl) {
            setMessage(errorEl, message, message ? "error" : "");
        }

        if (field) {
            field.classList.toggle("has-error", Boolean(message));
        }
    }

    function clearFieldErrors() {
        form.querySelectorAll("[data-error-for]").forEach((item) => setMessage(item, ""));
        form.querySelectorAll(".has-error").forEach((item) => item.classList.remove("has-error"));
    }

    function isStrongPassword(value) {
        return /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
    }

    function validateField(field) {
        const value = String(field.value || "").trim();
        const label = field.closest(".field-cluster")?.querySelector("label")?.textContent || field.name;

        if (field.required && !value) {
            return `${label} is required.`;
        }

        if (field.name === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            return "Enter a valid email address.";
        }

        if (field.name === "mobile" && value && value.replace(/\D+/g, "").length < 10) {
            return "Enter a valid phone number.";
        }

        if (field.name === "password" && value) {
            if (value.length < 8) {
                return "Password must be at least 8 characters.";
            }

            if (!isStrongPassword(value)) {
                return "Use uppercase, lowercase, number, and symbol for a strong password.";
            }
        }

        if (field.name === "confirmPassword" && value !== form.elements.password.value) {
            return "Passwords must match.";
        }

        if ((field.type === "number" || field.min) && value && Number(value) < Number(field.min || 0)) {
            return `${label} must be ${field.min || 0} or greater.`;
        }

        return "";
    }

    function validateFields(fields, showErrors = true) {
        let valid = true;

        fields.forEach((field) => {
            const message = validateField(field);
            if (showErrors) {
                setFieldError(field.name, message);
            }

            if (message) {
                valid = false;
            }
        });

        return valid;
    }

    function getAccountFields() {
        return ["fullName", "email", "mobile", "password", "confirmPassword"]
            .map((name) => form.elements[name])
            .filter(Boolean);
    }

    function getRequiredProfileFields() {
        return Array.from(form.querySelectorAll("input[required], select[required]"));
    }

    function getAdditionalProfileFields() {
        return [
            "dateOfBirth",
            "gender",
            "profession",
            "country",
            "state",
            "district",
            "city",
            "villageTown",
            "pincode"
        ].map((name) => form.elements[name]).filter(Boolean);
    }

    function getVisibleDynamicFields() {
        return Array.from(professionFields.querySelectorAll("input, select"));
    }

    function getDraftData() {
        const data = {};
        new FormData(form).forEach((value, key) => {
            if (key !== "password" && key !== "confirmPassword") {
                data[key] = value;
            }
        });
        return data;
    }

    function saveDraft(manual = false) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(getDraftData()));
        draftStatus.textContent = manual ? "Draft saved" : "Autosaved";
    }

    function scheduleAutosave() {
        clearTimeout(autosaveTimer);
        draftStatus.textContent = "Autosaving...";
        autosaveTimer = window.setTimeout(() => saveDraft(false), AUTOSAVE_DELAY_MS);
    }

    function restoreDraft() {
        try {
            const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
            Object.entries(draft).forEach(([key, value]) => {
                if (form.elements[key]) {
                    form.elements[key].value = value;
                }
            });

            if (draft.profession) {
                renderProfessionFields(draft.profession);
                Object.entries(draft).forEach(([key, value]) => {
                    if (form.elements[key]) {
                        form.elements[key].value = value;
                    }
                });
            }

            if (Object.keys(draft).length) {
                accountCompleted = validateFields(getAccountFields(), false);
                profileCompleted = accountCompleted && validateFields(getAdditionalProfileFields(), false);
                profileSection.dataset.stepHidden = String(!accountCompleted);
                professionSection.dataset.stepHidden = String(!profileCompleted);
                draftStatus.textContent = "Draft restored";
            }
        } catch (error) {
            console.warn("Draft restore skipped:", error);
            draftStatus.textContent = "Autosave ready";
        }
    }

    function createField(field) {
        const wrapper = document.createElement("div");
        wrapper.className = "field-cluster";

        const label = document.createElement("label");
        label.htmlFor = `dynamic-${field.name}`;
        label.textContent = field.optional ? `${field.label} (optional)` : field.label;
        wrapper.appendChild(label);

        let input;
        if (field.type === "select") {
            input = document.createElement("select");
            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = `Select ${field.label.toLowerCase()}`;
            input.appendChild(placeholder);
            field.options.forEach((option) => {
                const item = document.createElement("option");
                item.value = option;
                item.textContent = option;
                input.appendChild(item);
            });
        } else {
            input = document.createElement("input");
            input.type = field.type || "text";
            input.placeholder = field.label;
            if (field.min) {
                input.min = field.min;
            }
        }

        input.id = `dynamic-${field.name}`;
        input.name = `profession_${field.name}`;
        input.required = !field.optional;
        wrapper.appendChild(input);

        const error = document.createElement("p");
        error.className = "field-message";
        error.dataset.errorFor = input.name;
        wrapper.appendChild(error);

        return wrapper;
    }

    function renderProfessionFields(profession) {
        const schema = PROFESSION_SCHEMAS[profession];
        professionFields.innerHTML = "";

        if (!schema) {
            professionFields.className = "profession-fields empty-profession";
            professionFields.innerHTML = `
                <div class="feature-item">
                    <strong>Waiting for profession</strong>
                    <span>Your profession card will expand here with laboratory-specific fields.</span>
                </div>
            `;
            return;
        }

        professionFields.className = "profession-fields is-expanded";

        const card = document.createElement("article");
        card.className = "profession-card";

        const title = document.createElement("div");
        title.className = "profession-card-head";
        title.innerHTML = `<strong>${schema.title}</strong><span>${PROFESSION_LABELS[profession]}</span>`;
        card.appendChild(title);

        schema.groups.forEach((group) => {
            const groupEl = document.createElement("div");
            groupEl.className = "profession-group";

            const heading = document.createElement("div");
            heading.className = "section-heading";
            heading.textContent = group.heading;
            groupEl.appendChild(heading);

            const grid = document.createElement("div");
            grid.className = "form-grid two-column";
            group.fields.forEach((field) => grid.appendChild(createField(field)));
            groupEl.appendChild(grid);
            card.appendChild(groupEl);
        });

        professionFields.appendChild(card);
    }

    function updateProgress() {
        const fields = getRequiredProfileFields().filter((field) => !field.closest("[data-step-hidden='true']"));
        const completed = fields.filter((field) => !validateField(field)).length;
        const percent = fields.length ? Math.round((completed / fields.length) * 100) : 0;

        progressCopy.textContent = `${percent}%`;
        progressBar.style.width = `${percent}%`;
        registerSubmit.disabled = !accountCompleted || !profileCompleted || percent < 100;
    }

    function unlockProfileIfReady() {
        const ready = validateFields(getAccountFields(), true);
        accountCompleted = ready;
        profileSection.dataset.stepHidden = String(!ready);

        if (ready) {
            setMessage(messageEl, "Account details validated. Continue with Additional Profile Information.", "success");
            profileSection.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
            setMessage(messageEl, "Complete the account fields before continuing.", "error");
        }

        updateProgress();
    }

    function syncProfessionVisibility(showErrors = false) {
        profileCompleted = accountCompleted && validateFields(getAdditionalProfileFields(), showErrors);
        professionSection.dataset.stepHidden = String(!profileCompleted);
        if (profileCompleted && professionSelect.value && !getVisibleDynamicFields().length) {
            renderProfessionFields(professionSelect.value);
        }
        updateProgress();
    }

    function getFriendlyError(result, fallbackMessage) {
        const message = String(result?.message || "").trim();
        if (/duplicate|already exists/i.test(message)) {
            return message;
        }
        return message || fallbackMessage;
    }

    function buildRegistrationPayload() {
        const formData = new FormData(form);
        const professionDetails = {};
        getVisibleDynamicFields().forEach((field) => {
            professionDetails[field.name.replace(/^profession_/, "")] = field.value;
        });

        return {
            fullName: formData.get("fullName"),
            dateOfBirth: formData.get("dateOfBirth"),
            gender: formData.get("gender"),
            profession: PROFESSION_LABELS[formData.get("profession")] || formData.get("profession"),
            mobile: formData.get("mobile"),
            email: formData.get("email"),
            country: formData.get("country"),
            state: formData.get("state"),
            district: formData.get("district"),
            city: formData.get("city"),
            villageTown: formData.get("villageTown"),
            pincode: formData.get("pincode"),
            professionDetails,
            password: formData.get("password")
        };
    }

    form.addEventListener("input", (event) => {
        if (event.target.matches("input, select")) {
            setFieldError(event.target.name, validateField(event.target));
            scheduleAutosave();
            if (getAdditionalProfileFields().includes(event.target)) {
                syncProfessionVisibility(false);
            }
            updateProgress();
        }
    });

    form.addEventListener("change", (event) => {
        if (event.target === professionSelect) {
            if (validateFields(getAdditionalProfileFields(), false)) {
                renderProfessionFields(professionSelect.value);
            }
            scheduleAutosave();
            syncProfessionVisibility(false);
        }
    });

    document.querySelectorAll("[data-toggle-password]").forEach((button) => {
        button.addEventListener("click", () => {
            const input = document.getElementById(button.dataset.togglePassword);
            const hidden = input.type === "password";
            input.type = hidden ? "text" : "password";
            button.textContent = hidden ? "Hide" : "Show";
            button.setAttribute("aria-label", `${hidden ? "Hide" : "Show"} ${input.name}`);
        });
    });

    accountContinue.addEventListener("click", unlockProfileIfReady);
    saveDraftButton.addEventListener("click", () => saveDraft(true));

    restoreDraft();
    updateProgress();

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (registerSubmit.disabled) {
            setMessage(messageEl, "Complete all mandatory profile fields before opening the workspace.", "error");
            return;
        }

        clearFieldErrors();
        const requiredFields = getRequiredProfileFields();
        if (!validateFields(getAdditionalProfileFields(), true) || !validateFields(requiredFields, true)) {
            setMessage(messageEl, "Review the highlighted fields before continuing.", "error");
            return;
        }

        const payload = buildRegistrationPayload();
        setSubmitState(true, "Creating Account...");
        setMessage(messageEl, "Creating your laboratory account and opening your CLTT workspace...");

        try {
            const { response, result } = await postJson("/api/auth/register", payload);
            if (!response.ok) {
                setMessage(messageEl, getFriendlyError(result, "Registration failed."), "error");
                return;
            }

            localStorage.removeItem(DRAFT_KEY);
            auth.setSession(result.user);
            setSubmitState(true, "Opening Workspace...");
            setMessage(messageEl, result.message || "Profile completed. Redirecting to your workspace...", "success");
            window.location.replace(result.redirectTo || "/dashboard");
        } catch (error) {
            console.error(error);
            setMessage(messageEl, "Unable to connect to the server. Please try again.", "error");
        } finally {
            if (!messageEl.classList.contains("success")) {
                setSubmitState(false, "Complete Profile and Continue");
                updateProgress();
            }
        }
    });
});
