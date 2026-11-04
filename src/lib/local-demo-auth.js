const LOCAL_DEMO_SESSION_KEY = "growel-local-demo-role";
const LEGACY_LOCAL_DEMO_SESSION_KEY = "growel-local-demo-admin";
const SQL_SESSION_KEY = "growel-sql-user";
export const LOCAL_DEMO_ROLES = ["executive", "rm", "avp", "gm", "hr", "admin"];

export function isLocalDemoSession() {
    return getLocalDemoRole() !== null;
}

export function getCurrentRole() {
    return getLocalDemoRole() || getSqlUser()?.role || null;
}

export function getLocalDemoRole() {
    if (!import.meta.env.DEV || typeof window === "undefined") return null;
    const role = window.sessionStorage.getItem(LOCAL_DEMO_SESSION_KEY);
    if (LOCAL_DEMO_ROLES.includes(role)) return role;
    return window.sessionStorage.getItem(LEGACY_LOCAL_DEMO_SESSION_KEY) === "active" ? "admin" : null;
}

export function startLocalDemoSession(role = "admin") {
    if (!import.meta.env.DEV || typeof window === "undefined") {
        throw new Error("Local role demo is only available in development.");
    }
    if (!LOCAL_DEMO_ROLES.includes(role)) throw new Error("Choose a valid demo role.");

    window.sessionStorage.removeItem(LEGACY_LOCAL_DEMO_SESSION_KEY);
    window.sessionStorage.setItem(LOCAL_DEMO_SESSION_KEY, role);
}

export function clearLocalDemoSession() {
    if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(LOCAL_DEMO_SESSION_KEY);
        window.sessionStorage.removeItem(LEGACY_LOCAL_DEMO_SESSION_KEY);
    }
}

export function getSqlUser() {
    if (typeof window === "undefined" || isLocalDemoSession()) return null;
    try {
        const user = JSON.parse(window.sessionStorage.getItem(SQL_SESSION_KEY) || "null");
        if (user && typeof user.id === "string" && typeof user.role === "string") return user;
        return null;
    }
    catch (error) {
        console.error("Could not read the cached SQL account.", error);
        return null;
    }
}

export function setSqlUser(user) {
    if (typeof window === "undefined") throw new Error("SQL sign-in is only available in a browser.");
    window.sessionStorage.removeItem(LOCAL_DEMO_SESSION_KEY);
    window.sessionStorage.removeItem(LEGACY_LOCAL_DEMO_SESSION_KEY);
    window.sessionStorage.setItem(SQL_SESSION_KEY, JSON.stringify(user));
}

export function clearSqlUser() {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(SQL_SESSION_KEY);
}

export function isSupabaseConfigured() {
    return Boolean(
        import.meta.env.VITE_SUPABASE_URL &&
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    );
}
