(function attachChemLabAuth() {
    const USER_KEY = "chem_lab_user";

    function isPrivilegedPreview() {
        const params = new URLSearchParams(window.location.search);
        return params.get("preview") === "admin" || params.get("preview") === "1";
    }

    function getUser() {
        const raw = localStorage.getItem(USER_KEY);
        if (!raw) {
            return null;
        }

        try {
            return JSON.parse(raw);
        } catch (error) {
            localStorage.removeItem(USER_KEY);
            return null;
        }
    }

    function setSession(tokenOrUser, maybeUser) {
        const user = maybeUser || tokenOrUser;
        if (!user) {
            clearSession();
            return;
        }

        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    function clearSession() {
        localStorage.removeItem(USER_KEY);
    }

    function getToken() {
        return null;
    }

    function isPrivilegedUser(user = getUser()) {
        return user?.role === "admin" || user?.role === "superadmin";
    }

    function canAccessDashboard(user = getUser()) {
        return Boolean(user);
    }

    function requiresRenewal(user = getUser()) {
        return false;
    }

    function getDefaultRoute(user = getUser()) {
        if (!user) {
            return "/register";
        }

        if (isPrivilegedUser(user)) {
            return "/admin";
        }

        return "/dashboard";
    }

    async function hydrateSession() {
        try {
            const response = await fetch("/api/auth/me", {
                credentials: "same-origin"
            });

            if (!response.ok) {
                clearSession();
                return null;
            }

            const result = await response.json();
            if (!result.user) {
                clearSession();
                return null;
            }

            setSession(result.user);
            return result.user;
        } catch (error) {
            clearSession();
            return null;
        }
    }

    async function logout(redirectTo = "/") {
        await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "same-origin"
        });

        clearSession();

        if (redirectTo) {
            window.location.replace(redirectTo);
        }
    }

    function requireFullAccess() {
        const user = getUser();
        if (!user) {
            window.location.replace("/register");
            return false;
        }

        if (isPrivilegedUser(user)) {
            window.location.replace("/admin");
            return false;
        }

        return true;
    }

    async function ensureGuestPage() {
        const user = await hydrateSession();
        if (user) {
            window.location.replace(getDefaultRoute(user));
            return true;
        }

        return false;
    }

    async function authFetch(url, options = {}) {
        const response = await fetch(url, { ...options, credentials: "same-origin" });
        if (response.status === 401) {
            clearSession();
        }

        return response;
    }

    function getUserName() {
        const user = getUser();
        return user ? user.name : "";
    }

    window.ChemLabAuth = {
        authFetch,
        canAccessDashboard,
        clearSession,
        ensureGuestPage,
        getDefaultRoute,
        getToken,
        getUser,
        getUserName,
        hydrateSession,
        isPrivilegedPreview,
        isPrivilegedUser,
        logout,
        requireFullAccess,
        setSession
    };
})();
