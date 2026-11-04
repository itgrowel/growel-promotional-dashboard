import { getSqlUser, isLocalDemoSession } from "@/lib/local-demo-auth";

export function isSqlSession() {
    return !isLocalDemoSession() && getSqlUser() !== null;
}

export async function sqlApiRequest(path, options = {}) {
    const response = await fetch(path, {
        ...options,
        credentials: "same-origin",
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers,
        },
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
        const error = new Error(result?.error || `The server returned HTTP ${response.status}.`);
        error.status = response.status;
        throw error;
    }
    return result;
}
