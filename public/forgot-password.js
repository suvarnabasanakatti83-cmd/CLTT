document.addEventListener("DOMContentLoaded", () => {
    const forgotForm = document.getElementById("forgot-form");
    const verifyForm = document.getElementById("verify-form");
    const resetForm = document.getElementById("reset-form");
    const messageEl = document.getElementById("reset-message");
    const forgotEmail = document.getElementById("forgot-email");
    const verifyEmail = document.getElementById("verify-email");
    const forgotButton = forgotForm.querySelector("button[type='submit']");
    const verifyButton = verifyForm.querySelector("button[type='submit']");
    const resetButton = resetForm.querySelector("button[type='submit']");

    let resetToken = "";

    function setMessage(message, type) {
        messageEl.textContent = message || "";
        messageEl.className = `auth-message${type ? ` ${type}` : ""}`;
    }

    async function postJson(url, payload) {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        return { response, result };
    }

    function setButtonState(button, isBusy, busyLabel, idleLabel) {
        button.disabled = isBusy;
        button.classList.toggle("is-loading", isBusy);
        button.textContent = isBusy ? busyLabel : idleLabel;
    }

    forgotForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        setButtonState(forgotButton, true, "Sending...", "Send OTP");
        setMessage("Sending OTP...", "");

        try {
            const email = forgotEmail.value.trim();
            const { response, result } = await postJson("/api/auth/forgot-password", { email });
            setMessage(result.message || "If that email exists, an OTP has been sent.", response.ok ? "success" : "error");
            verifyEmail.value = email;
        } catch (error) {
            console.error(error);
            setMessage("Unable to connect to the server.", "error");
        } finally {
            setButtonState(forgotButton, false, "", "Send OTP");
        }
    });

    verifyForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        setButtonState(verifyButton, true, "Verifying...", "Verify OTP");
        setMessage("Verifying OTP...", "");

        try {
            const payload = Object.fromEntries(new FormData(verifyForm).entries());
            const { response, result } = await postJson("/api/auth/verify-otp", payload);
            if (!response.ok) {
                setMessage(result.message || "OTP verification failed.", "error");
                return;
            }

            resetToken = result.resetToken || "";
            setMessage(result.message || "OTP verified.", "success");
        } catch (error) {
            console.error(error);
            setMessage("Unable to connect to the server.", "error");
        } finally {
            setButtonState(verifyButton, false, "", "Verify OTP");
        }
    });

    resetForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!resetToken) {
            setMessage("Verify your OTP before resetting the password.", "error");
            return;
        }

        setButtonState(resetButton, true, "Resetting...", "Reset Password");
        setMessage("Resetting password...", "");

        try {
            const newPassword = document.getElementById("new-password").value;
            const { response, result } = await postJson("/api/auth/reset-password", {
                resetToken,
                newPassword
            });

            if (!response.ok) {
                setMessage(result.message || "Password reset failed.", "error");
                return;
            }

            setMessage(result.message || "Password reset successful.", "success");
            window.location.replace("/register?reset=success");
        } catch (error) {
            console.error(error);
            setMessage("Unable to connect to the server.", "error");
        } finally {
            setButtonState(resetButton, false, "", "Reset Password");
        }
    });
});
