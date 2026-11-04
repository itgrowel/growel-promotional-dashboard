import { createFileRoute, redirect } from "@tanstack/react-router";
import { Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { getCurrentRole, isLocalDemoSession } from "@/lib/local-demo-auth";
import { DEFAULT_LOCAL_DEMO_PERMISSIONS, LOCAL_DEMO_PERMISSIONS_KEY, saveLocalDemoPermissionMatrix } from "@/lib/local-demo-permissions";
import { sqlApiRequest } from "@/lib/sql-api";

const ROLES = [
    { id: "executive", name: "Executive", description: "Raises material requests and confirms receipt." },
    { id: "rm", name: "RM", description: "Regional Manager; reviews assigned requests." },
    { id: "avp", name: "AVP", description: "Assistant Vice President; reviews assigned requests." },
    { id: "gm", name: "GM", description: "General Manager; reviews assigned requests." },
    { id: "hr", name: "HR", description: "Manages employee records and dispatch workflow." },
    { id: "admin", name: "Admin", description: "Configures the demo workspace." },
];
const PERMISSIONS = [
    { id: "viewDashboard", label: "View dashboard" },
    { id: "createRequests", label: "Create material requests" },
    { id: "approveRequests", label: "Approve assigned requests" },
    { id: "manageEmployees", label: "Manage employees" },
    { id: "manageMaterials", label: "Manage materials" },
    { id: "dispatchRequests", label: "Pack and dispatch requests" },
    { id: "managePermissions", label: "Manage role permissions" },
];
function isPermissionMatrix(value) {
    return value && typeof value === "object" && ROLES.every(({ id }) =>
        value[id] && PERMISSIONS.every(({ id: permissionId }) => typeof value[id][permissionId] === "boolean"),
    );
}

export const Route = createFileRoute("/_authenticated/admin-permissions")({
    beforeLoad: () => {
        if (getCurrentRole() !== "admin") throw redirect({ to: "/" });
    },
    head: () => ({
        meta: [
            { title: "Admin permissions — Growel Promotional" },
            { name: "description", content: "Configure simulated role permissions in local demo mode." },
            { property: "robots", content: "noindex, nofollow" },
        ],
    }),
    component: AdminPermissionsPage,
});

function AdminPermissionsPage() {
    const [permissions, setPermissions] = useState(DEFAULT_LOCAL_DEMO_PERMISSIONS);
    const [ready, setReady] = useState(false);
    const [message, setMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const localDemo = isLocalDemoSession();

    useEffect(() => {
        let active = true;
        if (!localDemo) {
            void sqlApiRequest("/api/permissions").then((matrix) => {
                if (!active) return;
                if (!isPermissionMatrix(matrix)) throw new Error("The server returned an invalid permission matrix.");
                setPermissions(matrix);
            }).catch((error) => {
                console.error("Could not load SQL role permissions.", error);
                if (active) setErrorMessage(error instanceof Error ? error.message : "Could not load role permissions.");
            }).finally(() => {
                if (active) setReady(true);
            });
            return () => { active = false; };
        }
        try {
            const stored = window.localStorage.getItem(LOCAL_DEMO_PERMISSIONS_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (!isPermissionMatrix(parsed)) throw new Error("Saved role permissions have an invalid format.");
                setPermissions({
                    ...parsed,
                    ...Object.fromEntries(["executive", "rm", "avp", "gm"].map((roleId) => [
                        roleId,
                        { ...parsed[roleId], manageEmployees: false, manageMaterials: false },
                    ])),
                });
            }
        }
        catch (error) {
            console.error("Could not load local demo permissions.", error);
            setErrorMessage(error instanceof Error ? error.message : "Could not load saved permissions.");
        }
        finally {
            setReady(true);
        }
        return () => { active = false; };
    }, [localDemo]);

    function setPermission(roleId, permissionId, enabled) {
        setMessage("");
        setPermissions((current) => ({
            ...current,
            [roleId]: {
                ...current[roleId],
                [permissionId]: enabled,
            },
        }));
    }

    async function savePermissions() {
        setErrorMessage("");
        setMessage("");
        try {
            if (localDemo) {
                saveLocalDemoPermissionMatrix(permissions);
                setMessage("Demo permissions saved and applied to matching local demo sessions.");
            }
            else {
                await sqlApiRequest("/api/permissions", {
                    method: "PUT",
                    body: JSON.stringify(permissions),
                });
                setMessage("Role permissions saved to SQL Server.");
            }
        }
        catch (error) {
            console.error("Could not save local demo permissions.", error);
            setErrorMessage(error instanceof Error ? error.message : "Could not save role permissions.");
        }
    }

    return (
        <AppShell>
            <div className="mb-6 flex items-center gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                    <ShieldCheck className="size-7" aria-hidden="true" />
                </span>
                <div>
                    <p className="text-xs font-bold uppercase text-primary">Administration</p>
                    <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Permission control panel</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Configure the workspace role permissions.</p>
                </div>
            </div>

            <aside role="note" className="mb-5 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm">
                <span className="font-bold text-warning">{localDemo ? "Demo controls only." : "Server-enforced permissions."}</span>{" "}
                {localDemo ? "These settings apply to matching local demo role sessions in this browser." : "These permissions are stored in SQL Server and checked by the API before protected actions."}
            </aside>

            {errorMessage && <p role="alert" className="mb-4 rounded-md bg-danger-soft px-4 py-3 text-sm font-semibold text-destructive">{errorMessage}</p>}
            {message && <p role="status" className="mb-4 rounded-md bg-success-soft px-4 py-3 text-sm font-semibold text-success">{message}</p>}

            <section aria-label="Role permission settings" className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
                    <div>
                        <h2 className="font-bold">Role permissions</h2>
                        <p className="mt-1 text-xs text-muted-foreground">Toggle the sample capabilities assigned to each role.</p>
                    </div>
                    <button type="button" onClick={savePermissions} disabled={!ready} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                        <Save className="size-4" /> Save permissions
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[850px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/60">
                                <th scope="col" className="px-5 py-3.5 text-[11px] font-bold uppercase text-muted-foreground">Role</th>
                                {PERMISSIONS.map((permission) => (
                                    <th key={permission.id} scope="col" className="max-w-28 px-3 py-3.5 text-center text-[11px] font-bold uppercase text-muted-foreground">{permission.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {ROLES.map((role) => (
                                <tr key={role.id} className="border-b border-border last:border-0">
                                    <th scope="row" className="min-w-52 px-5 py-4 text-left">
                                        <span className="block font-bold">{role.name}</span>
                                        <span className="mt-1 block text-xs font-normal text-muted-foreground">{role.description}</span>
                                    </th>
                                    {PERMISSIONS.map((permission) => (
                                        <td key={permission.id} className="px-3 py-4 text-center">
                                            <input
                                                type="checkbox"
                                                aria-label={`${role.name}: ${permission.label}`}
                                                checked={permissions[role.id][permission.id]}
                                                onChange={(event) => setPermission(role.id, permission.id, event.currentTarget.checked)}
                                                disabled={["executive", "rm", "avp", "gm"].includes(role.id) && ["manageEmployees", "manageMaterials"].includes(permission.id)}
                                                className="size-4 accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </AppShell>
    );
}
