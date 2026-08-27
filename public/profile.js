document.addEventListener("DOMContentLoaded", async () => {
    const auth = window.ChemLabAuth;
    const user = await auth.hydrateSession();
    if (!user) {
        window.location.replace("/register");
        return;
    }

    const form = document.getElementById("profile-form");
    const messageEl = document.getElementById("profile-message");
    const submitButton = document.getElementById("profile-submit");

    function setMessage(message, type = "") {
        messageEl.textContent = message || "";
        messageEl.className = `auth-message${type ? ` ${type}` : ""}`;
    }

    function setSubmitState(isBusy) {
        submitButton.disabled = isBusy;
        submitButton.classList.toggle("is-loading", isBusy);
        submitButton.textContent = isBusy ? "Saving..." : "Save Profile";
    }

    function setFieldError(name, message) {
        const errorEl = form.querySelector(`[data-error-for="${name}"]`);
        const field = form.elements[name];

        if (errorEl) {
            errorEl.textContent = message || "";
            errorEl.className = `field-message${message ? " error" : ""}`;
        }

        if (field) {
            field.classList.toggle("has-error", Boolean(message));
        }
    }

    function clearFieldErrors() {
        form.querySelectorAll("[data-error-for]").forEach((item) => {
            item.textContent = "";
            item.className = "field-message";
        });
        form.querySelectorAll(".has-error").forEach((item) => item.classList.remove("has-error"));
    }

    function validateField(field) {
        const value = String(field.value || "").trim();
        if (!value) {
            return "";
        }

        if (field.name === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            return "Enter a valid email address.";
        }

        if (field.name === "mobile") {
            const digits = value.replace(/\D+/g, "");
            if (digits.length < 10 || digits.length > 15) {
                return "Enter a valid phone number.";
            }
        }

        if (field.name === "fullName" && value.length < 2) {
            return "Full name must be at least 2 characters.";
        }

        if (field.name === "pincode" && !/^[A-Za-z0-9- ]+$/.test(value)) {
            return "Pincode contains unsupported characters.";
        }

        return "";
    }

    function formatDate(value) {
        if (!value) {
            return "";
        }

        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
    }

    function populateProfile(profileUser) {
        form.elements.fullName.value = profileUser.fullName || profileUser.name || "";
        form.elements.email.value = profileUser.email || "";
        form.elements.mobile.value = profileUser.mobile || "";
        form.elements.dateOfBirth.value = formatDate(profileUser.dateOfBirth);
        form.elements.gender.value = profileUser.gender || "";
        form.elements.profession.value = profileUser.profession || "";
        form.elements.country.value = profileUser.address?.country || "";
        form.elements.state.value = profileUser.address?.state || "";
        form.elements.district.value = profileUser.address?.district || "";
        form.elements.city.value = profileUser.address?.city || "";
        form.elements.villageTown.value = profileUser.address?.villageTown || "";
        form.elements.pincode.value = profileUser.address?.pincode || "";
    }

    populateProfile(user);

    form.addEventListener("input", (event) => {
        if (event.target.matches("input, select")) {
            setFieldError(event.target.name, validateField(event.target));
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearFieldErrors();

        const fields = Array.from(form.querySelectorAll("input, select"));
        let isValid = true;
        fields.forEach((field) => {
            const message = validateField(field);
            setFieldError(field.name, message);
            if (message) {
                isValid = false;
            }
        });

        if (!isValid) {
            setMessage("Review the highlighted fields before saving.", "error");
            return;
        }

        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        setSubmitState(true);
        setMessage("Saving profile...");

        try {
            const response = await auth.authFetch("/api/auth/profile", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (!response.ok) {
                setMessage(result.message || "Profile update failed.", "error");
                return;
            }

            auth.setSession(result.user);
            populateProfile(result.user);
            setMessage(result.message || "Profile updated successfully.", "success");
        } catch (error) {
            console.error(error);
            setMessage("Unable to connect to the server.", "error");
        } finally {
            setSubmitState(false);
        }
    });
});
