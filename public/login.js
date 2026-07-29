document.addEventListener("DOMContentLoaded", async () => {
    const auth = window.ChemLabAuth;
    const existingUser = await auth.hydrateSession();
    if (existingUser) {
        window.location.replace(auth.getDefaultRoute(existingUser));
        return;
    }

    const form = document.getElementById("login-form");
    const messageEl = document.getElementById("form-message");
    const submitButton = document.getElementById("login-submit");
    const passwordInput = document.getElementById("password");
    const togglePassword = document.getElementById("toggle-password");
    const params = new URLSearchParams(window.location.search);

    function setMessage(message, type = "") {
        messageEl.textContent = message || "";
        messageEl.className = `auth-message${type ? ` ${type}` : ""}`;
    }

    function setSubmitState(isBusy) {
        submitButton.disabled = isBusy;
        submitButton.classList.toggle("is-loading", isBusy);
        submitButton.textContent = isBusy ? "Logging in..." : "Login";
    }

    if (params.get("registered") === "exists") {
        setMessage("This account is already registered. Please log in.", "success");
    } else if (params.get("registered") === "success") {
        setMessage("Registration successful. Please log in.", "success");
    } else if (params.get("reset") === "success") {
        setMessage("Password reset complete. Please sign in.", "success");
    }

    togglePassword.addEventListener("click", () => {
        const hidden = passwordInput.type === "password";
        passwordInput.type = hidden ? "text" : "password";
        togglePassword.textContent = hidden ? "Hide" : "Show";
        togglePassword.setAttribute("aria-label", `${hidden ? "Hide" : "Show"} password`);
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const formData = new FormData(form);
        const email = String(formData.get("email") || "").trim();
        const mobile = String(formData.get("mobile") || "").trim();
        const password = String(formData.get("password") || "");

        if (!email && !mobile) {
            setMessage("Enter your registered email address or mobile number.", "error");
            return;
        }

        if (!password) {
            setMessage("Enter your password.", "error");
            return;
        }

        setSubmitState(true);
        setMessage("Checking your account...", "");

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "same-origin",
                body: JSON.stringify({
                    identifier: email || mobile,
                    email,
                    mobile,
                    password
                })
            });
            const result = await response.json();

            if (!response.ok && response.status !== 403) {
                setMessage(result.message || "Login failed.", "error");
                return;
            }

            if (result.user) {
                localStorage.setItem("cltt_registered_account", "true");
                auth.setSession(result.user);
            }

            setMessage(result.message || "Login successful.", response.ok ? "success" : "");
            window.location.replace(result.redirectTo || auth.getDefaultRoute(result.user));
        } catch (error) {
            console.error(error);
            setMessage("Unable to connect to the server.", "error");
        } finally {
            setSubmitState(false);
        }
    });
});
