document.addEventListener("DOMContentLoaded", async () => {
    const auth = window.ChemLabAuth;
    const messageEl = document.getElementById("admin-message");
    const usersBody = document.getElementById("admin-users-body");
    const analyticsCards = document.getElementById("analytics-cards");

    function setMessage(message, type = "") {
        messageEl.textContent = message || "";
        messageEl.className = `auth-message${type ? ` ${type}` : ""}`;
    }

    try {
        const meResponse = await auth.authFetch("/api/auth/me");
        if (!meResponse.ok) {
            auth.logout("/login");
            return;
        }

        const meResult = await meResponse.json();
        if (!auth.isPrivilegedUser(meResult.user)) {
            window.location.replace("/dashboard");
            return;
        }

        auth.setSession(meResult.user);
        document.getElementById("admin-name").textContent = meResult.user.name || "Admin";
        document.getElementById("admin-role").textContent = meResult.user.role || "admin";
    } catch (error) {
        console.error(error);
        auth.logout("/login");
        return;
    }

    async function loadOverview() {
        const response = await auth.authFetch("/api/admin/analytics/overview");
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Unable to load overview.");
        }

        analyticsCards.innerHTML = "";
        const cards = [
            ["Active Users", result.activeUsers],
            ["Online Users", result.onlineUsers],
            ["Total Searches", result.totalSearches],
            ["Suspicious Logins", result.suspiciousLoginAttempts],
            ["Failed API Requests", result.failedApiRequests],
            ["Revenue", result.revenue?.formatted || "INR 0"]
        ];

        cards.forEach(([label, value]) => {
            const card = document.createElement("article");
            card.className = "status-card";
            card.innerHTML = `<div class="status-label">${label}</div><div class="status-value">${value}</div>`;
            analyticsCards.appendChild(card);
        });
    }

    async function loadUsers(filter = "all") {
        const response = await auth.authFetch(`/api/admin/users?filter=${encodeURIComponent(filter)}`);
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Unable to load users.");
        }

        usersBody.innerHTML = "";
        result.items.forEach((user) => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${user.fullName}<br><span class="table-meta">${user.email}</span></td>
                <td>${(user.subscription?.plan || "platinum").toUpperCase()}</td>
                <td>${(user.subscription?.status || "inactive").replace(/_/g, " ")}</td>
                <td>${user.subscription?.paymentStatus || "pending"}</td>
                <td>${user.lastDevice || "Unknown"}</td>
                <td>${user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</td>
            `;
            usersBody.appendChild(row);
        });
    }

    document.querySelectorAll("[data-filter]").forEach((button) => {
        button.addEventListener("click", async () => {
            try {
                await loadUsers(button.dataset.filter);
            } catch (error) {
                console.error(error);
                setMessage(error.message, "error");
            }
        });
    });

    document.getElementById("admin-logout-button").addEventListener("click", () => auth.logout("/login"));

    try {
        await loadOverview();
        await loadUsers("all");
    } catch (error) {
        console.error(error);
        setMessage(error.message, "error");
    }
});
