import { useSyncExternalStore } from "react";
import { getSqlUser, isLocalDemoSession } from "@/lib/local-demo-auth";

export const LOCAL_DEMO_PERMISSIONS_KEY = "growel-local-demo-permissions-v1";
const CHANGE_EVENT = "growel-local-demo-permissions-change";
const ROLES = ["executive", "rm", "avp", "gm", "hr", "admin"];
const PERMISSION_KEYS = [
    "viewDashboard",
    "createRequests",
    "approveRequests",
    "manageEmployees",
    "manageMaterials",
    "dispatchRequests",
    "managePermissions",
];

export const DEFAULT_LOCAL_DEMO_PERMISSIONS = {
    executive: { viewDashboard: true, createRequests: true, approveRequests: false, manageEmployees: false, manageMaterials: false, dispatchRequests: false, managePermissions: false },
    rm: { viewDashboard: true, createRequests: true, approveRequests: true, manageEmployees: false, manageMaterials: false, dispatchRequests: false, managePermissions: false },
    avp: { viewDashboard: true, createRequests: true, approveRequests: true, manageEmployees: false, manageMaterials: false, dispatchRequests: false, managePermissions: false },
    gm: { viewDashboard: true, createRequests: true, approveRequests: true, manageEmployees: false, manageMaterials: false, dispatchRequests: false, managePermissions: false },
    hr: { viewDashboard: true, createRequests: false, approveRequests: true, manageEmployees: true, manageMaterials: false, dispatchRequests: true, managePermissions: false },
    admin: { viewDashboard: true, createRequests: true, approveRequests: true, manageEmployees: true, manageMaterials: true, dispatchRequests: true, managePermissions: true },
};

const DEFAULT_SNAPSHOT = JSON.stringify(DEFAULT_LOCAL_DEMO_PERMISSIONS);

function isPermissionMatrix(value) {
    return value && typeof value === "object" && ROLES.every((role) =>
        value[role] && PERMISSION_KEYS.every((permission) => typeof value[role][permission] === "boolean"),
    );
}

function applyFixedRoleLimits(matrix) {
    return {
        ...matrix,
        ...Object.fromEntries(["executive", "rm", "avp", "gm"].map((role) => [
            role,
            { ...matrix[role], manageEmployees: false, manageMaterials: false },
        ])),
    };
}

function getSnapshot() {
    if (typeof window === "undefined") return DEFAULT_SNAPSHOT;
    try {
        return window.localStorage.getItem(LOCAL_DEMO_PERMISSIONS_KEY) || DEFAULT_SNAPSHOT;
    }
    catch (error) {
        console.error("Could not read local demo permissions.", error);
        return DEFAULT_SNAPSHOT;
    }
}

function subscribe(callback) {
    if (typeof window === "undefined") return () => {};
    const handleStorage = (event) => {
        if (event.key === LOCAL_DEMO_PERMISSIONS_KEY || event.key === null) callback();
    };
    window.addEventListener(CHANGE_EVENT, callback);
    window.addEventListener("storage", handleStorage);
    return () => {
        window.removeEventListener(CHANGE_EVENT, callback);
        window.removeEventListener("storage", handleStorage);
    };
}

function parsePermissionSnapshot(snapshot) {
    try {
        const parsed = JSON.parse(snapshot);
        if (!isPermissionMatrix(parsed)) throw new Error("Saved role permissions have an invalid format.");
        return applyFixedRoleLimits(parsed);
    }
    catch (error) {
        console.error("Could not parse local demo permissions.", error);
        return DEFAULT_LOCAL_DEMO_PERMISSIONS;
    }
}

export function getLocalDemoPermissionMatrix() {
    return parsePermissionSnapshot(getSnapshot());
}

export function getLocalDemoPermission(role, permission) {
    if (!role) return true;
    if (!isLocalDemoSession()) {
        const sqlPermission = getSqlUser()?.permissions?.[permission];
        if (typeof sqlPermission === "boolean") return sqlPermission;
    }
    return getLocalDemoPermissionMatrix()[role]?.[permission] ?? false;
}

export function useLocalDemoPermission(role, permission) {
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_SNAPSHOT);
    if (role && !isLocalDemoSession()) {
        const sqlPermission = getSqlUser()?.permissions?.[permission];
        if (typeof sqlPermission === "boolean") return sqlPermission;
    }
    return role ? parsePermissionSnapshot(snapshot)[role]?.[permission] ?? false : true;
}

export function saveLocalDemoPermissionMatrix(matrix) {
    if (!isPermissionMatrix(matrix)) throw new Error("Role permissions have an invalid format.");
    if (typeof window === "undefined") throw new Error("Local demo permissions can only be saved in a browser.");
    try {
        window.localStorage.setItem(LOCAL_DEMO_PERMISSIONS_KEY, JSON.stringify(applyFixedRoleLimits(matrix)));
        window.dispatchEvent(new Event(CHANGE_EVENT));
    }
    catch (error) {
        console.error("Could not save local demo permissions.", error);
        throw new Error("Could not save permissions. Check browser storage and try again.", { cause: error });
    }
}
