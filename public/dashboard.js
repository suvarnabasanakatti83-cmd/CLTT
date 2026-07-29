document.addEventListener("DOMContentLoaded", async () => {
    const auth = window.ChemLabAuth;
    if (!auth.requireFullAccess()) {
        return;
    }

    const logoutButton = document.getElementById("logout-button");
    const quitWorkspaceButton = document.getElementById("quit-workspace-button");
    const welcomePanel = document.getElementById("welcome-panel");
    const dismissWelcomeButton = document.getElementById("dismiss-welcome-button");

    function hideWelcomePanel() {
        if (welcomePanel) {
            welcomePanel.classList.add("is-hidden");
        }
    }

    if (dismissWelcomeButton) {
        dismissWelcomeButton.addEventListener("click", hideWelcomePanel);
    }

    window.setTimeout(hideWelcomePanel, 6500);

    function requestLogoutFeedback() {
        if (window.CLTTFeedback?.openForLogout) {
            window.CLTTFeedback.openForLogout();
            return;
        }

        auth.logout("/");
    }

    if (logoutButton) {
        logoutButton.addEventListener("click", requestLogoutFeedback);
    }

    if (quitWorkspaceButton) {
        quitWorkspaceButton.addEventListener("click", requestLogoutFeedback);
    }

    try {
        const response = await auth.authFetch("/api/auth/me");
        if (!response.ok) {
            auth.logout();
            return;
        }

        const result = await response.json();
        if (!result.user || auth.isPrivilegedUser(result.user)) {
            auth.logout("/register");
            return;
        }

        auth.setSession(result.user);

        const nameEl = document.getElementById("user-name");
        const workspaceStatusEl = document.getElementById("workspace-status");

        if (nameEl) {
            nameEl.textContent = result.user.fullName || result.user.name || "Researcher";
        }

        if (workspaceStatusEl) {
            workspaceStatusEl.textContent = "Active";
        }
    } catch (error) {
        console.error("Session restore failed:", error);
        auth.logout();
    }
});
