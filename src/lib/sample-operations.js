import { useEffect, useSyncExternalStore } from "react";
import { getSqlUser } from "@/lib/local-demo-auth";
import { isSqlSession, sqlApiRequest } from "@/lib/sql-api";

const STORAGE_KEY = "growel-sample-operations-v1";
const MATERIALS_STORAGE_KEY = "growel-sample-materials-v1";
const EMPLOYEES_STORAGE_KEY = "growel-sample-employees-v1";
const CHANGE_EVENT = "growel-sample-operations-change";
const SQL_STORAGE_KEYS = {
    requests: "growel-sql-requests-v1",
    materials: "growel-sql-materials-v1",
    employees: "growel-sql-employees-v1",
};

export const SAMPLE_REQUESTS = [
    { id: "PR-2024-001", requester: "Ravi", role: "Executive", region: "Andhra Pradesh", items: 20, value: 50000, status: "Pending Approval", date: "02 Sep 2026", material: "Promotional Kits" },
    { id: "PR-2024-002", requester: "Srinivas", role: "AVP", region: "Orissa", items: 50, value: 70000, status: "Pending Approval", date: "02 Sep 2026", material: "Branded Bottles" },
    { id: "PR-2024-003", requester: "Nayudu", role: "GM", region: "North", items: 100, value: 32000, status: "Revised", date: "02 Sep 2026", material: "Pens" },
    { id: "PR-2024-004", requester: "Ramana", role: "Executive", region: "Bihar", items: 70, value: 45000, status: "Under Packing", date: "03 Sep 2026", material: "Caps", approvedAt: "03 Sep 2026" },
    { id: "PR-2024-005", requester: "Gosh", role: "Executive", region: "North", items: 10, value: 18000, status: "Dispatched", date: "04 Sep 2026", material: "Pens", approvedAt: "03 Sep 2026", transportType: "Courier", courierCompany: "Sample Express", trackingNumber: "DEMO123456", gatePassNumber: "GP-2024005", dispatchedAt: "04 Sep 2026" },
    { id: "PR-2024-006", requester: "Rohan Mehta", role: "Executive", region: "West", items: 30, value: 28000, status: "Pending Approval", date: "05 Sep 2026", material: "Promotional Kits" },
    { id: "PR-2024-007", requester: "Ankur", role: "RM", region: "Orissa", items: 200, value: 85000, status: "Pending Approval", date: "06 Sep 2026", material: "Branded Bottles" },
];

export function getRequestMaterialItems(request) {
    if (Array.isArray(request.materialItems) && request.materialItems.length > 0) {
        return request.materialItems;
    }
    return [{ material: request.material, items: request.items, unit: "units" }];
}

export function formatMaterialName(material) {
    return material.language ? `${material.name} (${material.language})` : material.name;
}

export function formatRequestMaterials(request) {
    return getRequestMaterialItems(request)
        .map((item) => `${item.language ? `${item.material} (${item.language})` : item.material} (${item.items} ${item.unit || "units"})`)
        .join(", ");
}

const SAMPLE_MATERIALS = [
    { id: "MAT-001", name: "Promotional Kits", category: "Kits", unit: "Set", stock: 145, minimum: 25, unitValue: 850 },
    { id: "MAT-002", name: "Branded Bottles", category: "Drinkware", unit: "Nos", stock: 82, minimum: 30, unitValue: 420 },
    { id: "MAT-003", name: "Caps", category: "Apparel", unit: "Nos", stock: 0, minimum: 20, unitValue: 280 },
    { id: "MAT-004", name: "Pens", category: "Stationery", unit: "Nos", stock: 3, minimum: 50, unitValue: 35 },
    { id: "MAT-005", name: "Desk Calendars", category: "Stationery", unit: "Nos", stock: 210, minimum: 40, unitValue: 95 },
    { id: "MAT-006", name: "T-Shirts", category: "Apparel", unit: "Nos", stock: 64, minimum: 20, unitValue: 650 },
];

const SAMPLE_EMPLOYEES = [
    { id: "EMP-001", name: "Ravi Kumar", email: "ravi.kumar@example.test", role: "Executive", region: "Andhra Pradesh", status: "Active" },
    { id: "EMP-002", name: "Srinivas Rao", email: "srinivas.rao@example.test", role: "AVP", region: "Orissa", status: "Active" },
    { id: "EMP-003", name: "Nayudu Prasad", email: "nayudu.prasad@example.test", role: "GM", region: "North", status: "Active" },
    { id: "EMP-004", name: "Ramana Reddy", email: "ramana.reddy@example.test", role: "Executive", region: "Bihar", status: "Active" },
    { id: "EMP-005", name: "Rohan Mehta", email: "rohan.mehta@example.test", role: "Executive", region: "West", status: "Inactive" },
    { id: "EMP-006", name: "Ankur Sharma", email: "ankur.sharma@example.test", role: "RM", region: "Orissa", status: "Active" },
];

const INITIAL_SNAPSHOT = JSON.stringify(SAMPLE_REQUESTS);
const INITIAL_MATERIALS_SNAPSHOT = JSON.stringify(SAMPLE_MATERIALS);
const INITIAL_EMPLOYEES_SNAPSHOT = JSON.stringify(SAMPLE_EMPLOYEES);

function getSnapshotForKey(storageKey, initialSnapshot) {
    if (typeof window === "undefined") return initialSnapshot;
    try {
        return window.localStorage.getItem(storageKey) ?? initialSnapshot;
    }
    catch (error) {
        console.error(`Could not read ${storageKey} from local storage.`, error);
        return initialSnapshot;
    }
}

function getSnapshot() {
    return getSnapshotForKey(isSqlSession() ? SQL_STORAGE_KEYS.requests : STORAGE_KEY, isSqlSession() ? "[]" : INITIAL_SNAPSHOT);
}

function readCollection(storageKey, initialSnapshot, label) {
    try {
        const collection = JSON.parse(getSnapshotForKey(storageKey, initialSnapshot));
        if (!Array.isArray(collection)) throw new Error(`${label} data must be an array.`);
        return label === "materials" ? normalizeLegacyMaterials(collection) : collection;
    }
    catch (error) {
        console.error(`Could not parse sample ${label} from local storage.`, error);
        return JSON.parse(initialSnapshot);
    }
}

function normalizeLegacyMaterials(materials) {
    return materials.map((material) => {
        const match = /^Brochures \((Hindi|English|Bengali|Marathi)\)$/i.exec(material.name);
        if (match) return { ...material, name: "Brochures", language: match[1] };
        if (material.name === "Brochures (Multi-language)") return { ...material, name: "Brochures" };
        return material;
    });
}

function subscribe(callback) {
    if (typeof window === "undefined") return () => {};
    window.addEventListener(CHANGE_EVENT, callback);
    window.addEventListener("storage", callback);
    return () => {
        window.removeEventListener(CHANGE_EVENT, callback);
        window.removeEventListener("storage", callback);
    };
}

function useSampleCollection(storageKey, initialSnapshot, label) {
    const sqlMode = isSqlSession();
    const collectionName = storageKey === STORAGE_KEY ? "requests" : storageKey === MATERIALS_STORAGE_KEY ? "materials" : "employees";
    const effectiveKey = sqlMode ? SQL_STORAGE_KEYS[collectionName] : storageKey;
    const effectiveInitialSnapshot = sqlMode ? "[]" : initialSnapshot;
    const snapshot = useSyncExternalStore(
        subscribe,
        () => getSnapshotForKey(effectiveKey, effectiveInitialSnapshot),
        () => effectiveInitialSnapshot,
    );
    useEffect(() => {
        if (!sqlMode) return;
        const sqlUser = getSqlUser();
        if (collectionName === "employees" &&
            sqlUser?.role?.toLowerCase() !== "admin" &&
            !sqlUser?.permissions?.manageEmployees) {
            window.localStorage.setItem(effectiveKey, "[]");
            window.dispatchEvent(new Event(CHANGE_EVENT));
            return;
        }
        let active = true;
        void sqlApiRequest(`/api/operations?collection=${collectionName}`).then((records) => {
            if (!active) return;
            window.localStorage.setItem(effectiveKey, JSON.stringify(records));
            window.dispatchEvent(new Event(CHANGE_EVENT));
        }).catch((error) => {
            if (!active) return;
            console.error(`Could not load SQL ${label}.`, error);
            window.dispatchEvent(new CustomEvent("growel-api-error", {
                detail: `Could not load ${label} from the server: ${error.message}`,
            }));
        });
        return () => { active = false; };
    }, [effectiveKey, label, collectionName, sqlMode]);
    try {
        const collection = JSON.parse(snapshot);
        if (!Array.isArray(collection)) throw new Error(`${label} data must be an array.`);
        return label === "materials" ? normalizeLegacyMaterials(collection) : collection;
    }
    catch (error) {
        console.error(`Could not parse sample ${label} from local storage.`, error);
        return JSON.parse(initialSnapshot);
    }
}

async function addSampleRecord(storageKey, initialSnapshot, label, prefix, record) {
    if (isSqlSession()) {
        const collection = storageKey === MATERIALS_STORAGE_KEY ? "materials" : "employees";
        const created = await sqlApiRequest("/api/operations", {
            method: "POST",
            body: JSON.stringify({ collection, ...record }),
        });
        const records = await sqlApiRequest(`/api/operations?collection=${collection}`);
        window.localStorage.setItem(SQL_STORAGE_KEYS[collection], JSON.stringify(records));
        window.dispatchEvent(new Event(CHANGE_EVENT));
        return created;
    }
    const collection = readCollection(storageKey, initialSnapshot, label);
    const nextNumber = collection.reduce((highest, item) => {
        const number = Number(item.id.match(/\d+$/)?.[0] || 0);
        return Math.max(highest, number);
    }, 0) + 1;
    const newRecord = { id: `${prefix}-${String(nextNumber).padStart(3, "0")}`, ...record };
    if (typeof window === "undefined") throw new Error(`Sample ${label} can only be added in a browser.`);
    try {
        window.localStorage.setItem(storageKey, JSON.stringify([...collection, newRecord]));
        window.dispatchEvent(new Event(CHANGE_EVENT));
    }
    catch (error) {
        console.error(`Could not save sample ${label}.`, error);
        throw new Error(`Could not save the ${label}. Check browser storage and try again.`, { cause: error });
    }
    return newRecord;
}

export function useSampleRequests() {
    return useSampleCollection(STORAGE_KEY, INITIAL_SNAPSHOT, "requests");
}

export function updateSampleRequest(requestId, update) {
    if (isSqlSession()) {
        const current = getSqlCacheRequest(requestId);
        const values = typeof update === "function" ? update(current) : update;
        const action = values.status === "Approved" ? "approve"
            : values.status === "Revised" ? (values.revisedByRole === "hr" ? "revise-hr" : "revise-manager")
                : values.status === "Under Packing" ? "pack"
                    : values.status === "Dispatched" ? "dispatch"
                        : values.status === "Received" ? "receive" : null;
        if (!action) throw new Error("Choose a valid request workflow update.");
        return sqlApiRequest("/api/operations", {
            method: "PATCH",
            body: JSON.stringify({ requestId, ...values, action }),
        }).then(async () => {
            const [requests, materials] = await Promise.all([
                sqlApiRequest("/api/operations?collection=requests"),
                ...(action === "dispatch" ? [sqlApiRequest("/api/operations?collection=materials")] : []),
            ]);
            window.localStorage.setItem(SQL_STORAGE_KEYS.requests, JSON.stringify(requests));
            if (action === "dispatch") window.localStorage.setItem(SQL_STORAGE_KEYS.materials, JSON.stringify(materials));
            window.dispatchEvent(new Event(CHANGE_EVENT));
            const updated = requests.find((request) => request.id === requestId);
            return updated || { ...current, ...values, id: requestId };
        });
    }
    const requests = JSON.parse(getSnapshot());
    const index = requests.findIndex((request) => request.id === requestId);
    if (index < 0) throw new Error(`Sample request "${requestId}" was not found.`);
    const updates = typeof update === "function" ? update(requests[index]) : update;
    const nextRequests = requests.slice();
    nextRequests[index] = {
        ...requests[index],
        ...updates,
    };
    if (typeof window === "undefined") throw new Error("Sample requests can only be updated in a browser.");
    try {
        if (requests[index].status !== "Dispatched" && nextRequests[index].status === "Dispatched") {
            const materials = readCollection(MATERIALS_STORAGE_KEY, INITIAL_MATERIALS_SNAPSHOT, "materials");
            const nextMaterials = materials.map((material) => ({ ...material }));
            const quantitiesByMaterial = new Map();
            for (const item of getRequestMaterialItems(nextRequests[index])) {
                const materialLabel = String(item.material || "").trim();
                const brochureMatch = /^Brochures \((Hindi|English|Bengali|Marathi)\)$/i.exec(materialLabel);
                const materialName = brochureMatch ? "Brochures" : materialLabel;
                const language = item.language || brochureMatch?.[1] || null;
                const material = nextMaterials.find((entry) =>
                    entry.name.toLowerCase() === materialName.toLowerCase() &&
                    (entry.language || null) === language,
                );
                if (!material) throw new Error(`Material "${materialLabel}" is not available in inventory.`);
                quantitiesByMaterial.set(material.id, (quantitiesByMaterial.get(material.id) || 0) + Number(item.items));
            }
            for (const [materialId, quantity] of quantitiesByMaterial) {
                const material = nextMaterials.find((entry) => entry.id === materialId);
                if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Request contains an invalid material quantity.");
                if (quantity > material.stock) {
                    throw new Error(`Not enough ${material.name} in stock to dispatch: ${material.stock} available, ${quantity} requested.`);
                }
                material.stock -= quantity;
            }
            window.localStorage.setItem(MATERIALS_STORAGE_KEY, JSON.stringify(nextMaterials));
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRequests));
        window.dispatchEvent(new Event(CHANGE_EVENT));
    }
    catch (error) {
        console.error("Could not save sample request changes.", error);
        throw new Error("Could not save the sample request. Check browser storage and try again.", { cause: error });
    }
    return nextRequests[index];
}

function getSqlCacheRequest(requestId) {
    const requests = JSON.parse(getSnapshot());
    const request = requests.find((entry) => entry.id === requestId);
    if (!request) throw new Error(`Request "${requestId}" is not loaded from the server.`);
    return request;
}

export async function addSampleRequest(request) {
    if (isSqlSession()) {
        const created = await sqlApiRequest("/api/operations", {
            method: "POST",
            body: JSON.stringify({ collection: "requests", ...request }),
        });
        const requests = await sqlApiRequest("/api/operations?collection=requests");
        window.localStorage.setItem(SQL_STORAGE_KEYS.requests, JSON.stringify(requests));
        window.dispatchEvent(new Event(CHANGE_EVENT));
        return requests.find((entry) => entry.id === created.id) || created;
    }
    const requests = JSON.parse(getSnapshot());
    if (!Array.isArray(requests)) throw new Error("Sample request data must be an array.");
    const nextNumber = requests.reduce((highest, item) => {
        const number = Number(item.id.match(/\d+$/)?.[0] || 0);
        return Math.max(highest, number);
    }, 0) + 1;
    const requestYear = new Date().getFullYear();
    const newRequest = {
        id: `PR-${requestYear}-${String(nextNumber).padStart(3, "0")}`,
        ...request,
        status: "Pending Approval",
    };
    if (typeof window === "undefined") throw new Error("Sample requests can only be added in a browser.");
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...requests, newRequest]));
        window.dispatchEvent(new Event(CHANGE_EVENT));
    }
    catch (error) {
        console.error("Could not save sample request.", error);
        throw new Error("Could not save the request. Check browser storage and try again.", { cause: error });
    }
    return newRequest;
}

export function getSampleMaterials() {
    const key = isSqlSession() ? SQL_STORAGE_KEYS.materials : MATERIALS_STORAGE_KEY;
    return readCollection(key, isSqlSession() ? "[]" : INITIAL_MATERIALS_SNAPSHOT, "materials");
}

export function getSampleEmployees() {
    const key = isSqlSession() ? SQL_STORAGE_KEYS.employees : EMPLOYEES_STORAGE_KEY;
    return readCollection(key, isSqlSession() ? "[]" : INITIAL_EMPLOYEES_SNAPSHOT, "employees");
}

export function useSampleMaterials() {
    return useSampleCollection(MATERIALS_STORAGE_KEY, INITIAL_MATERIALS_SNAPSHOT, "materials");
}

export function useSampleEmployees() {
    return useSampleCollection(EMPLOYEES_STORAGE_KEY, INITIAL_EMPLOYEES_SNAPSHOT, "employees");
}

export function addSampleMaterial(material) {
    return addSampleRecord(MATERIALS_STORAGE_KEY, INITIAL_MATERIALS_SNAPSHOT, "material", "MAT", material);
}

export async function updateSampleMaterial(materialId, updates) {
    if (isSqlSession()) {
        await sqlApiRequest("/api/operations", {
            method: "PATCH",
            body: JSON.stringify({ collection: "materials", materialId, ...updates }),
        });
        const materials = await sqlApiRequest("/api/operations?collection=materials");
        window.localStorage.setItem(SQL_STORAGE_KEYS.materials, JSON.stringify(materials));
        window.dispatchEvent(new Event(CHANGE_EVENT));
        return materials.find((material) => material.id === materialId);
    }

    const materials = readCollection(MATERIALS_STORAGE_KEY, INITIAL_MATERIALS_SNAPSHOT, "materials");
    const index = materials.findIndex((material) => material.id === materialId);
    if (index < 0) throw new Error("Material not found.");
    const nextMaterials = materials.slice();
    nextMaterials[index] = { ...materials[index], ...updates };
    try {
        window.localStorage.setItem(MATERIALS_STORAGE_KEY, JSON.stringify(nextMaterials));
        window.dispatchEvent(new Event(CHANGE_EVENT));
    }
    catch (error) {
        console.error("Could not update sample material.", error);
        throw new Error("Could not update the material. Check browser storage and try again.", { cause: error });
    }
    return nextMaterials[index];
}

export async function deleteSampleMaterial(materialId) {
    if (isSqlSession()) {
        await sqlApiRequest(`/api/operations?collection=materials&materialId=${encodeURIComponent(materialId)}`, {
            method: "DELETE",
        });
        const materials = await sqlApiRequest("/api/operations?collection=materials");
        window.localStorage.setItem(SQL_STORAGE_KEYS.materials, JSON.stringify(materials));
        window.dispatchEvent(new Event(CHANGE_EVENT));
        return;
    }

    const materials = readCollection(MATERIALS_STORAGE_KEY, INITIAL_MATERIALS_SNAPSHOT, "materials");
    const material = materials.find((entry) => entry.id === materialId);
    if (!material) throw new Error("Material not found.");
    const materialLabels = [material.name, material.language ? `${material.name} (${material.language})` : null]
        .filter(Boolean)
        .map((name) => name.toLowerCase());
    const requests = readCollection(STORAGE_KEY, INITIAL_SNAPSHOT, "requests");
    const isInRequestHistory = requests.some((request) =>
        getRequestMaterialItems(request).some((item) => materialLabels.includes(String(item.material).toLowerCase())),
    );
    if (isInRequestHistory) throw new Error("This material is used in request history and cannot be deleted.");

    try {
        window.localStorage.setItem(MATERIALS_STORAGE_KEY, JSON.stringify(materials.filter((entry) => entry.id !== materialId)));
        window.dispatchEvent(new Event(CHANGE_EVENT));
    }
    catch (error) {
        console.error("Could not delete sample material.", error);
        throw new Error("Could not delete the material. Check browser storage and try again.", { cause: error });
    }
}

export function addSampleEmployee(employee) {
    return addSampleRecord(EMPLOYEES_STORAGE_KEY, INITIAL_EMPLOYEES_SNAPSHOT, "employee", "EMP", employee);
}

export async function refreshSampleEmployees() {
    if (!isSqlSession()) return getSampleEmployees();
    const employees = await sqlApiRequest("/api/operations?collection=employees");
    window.localStorage.setItem(SQL_STORAGE_KEYS.employees, JSON.stringify(employees));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return employees;
}
