import { createFileRoute, redirect } from "@tanstack/react-router";
import { Check, Plus, Save, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { getCurrentRole, getSqlUser, isLocalDemoSession, setSqlUser } from "@/lib/local-demo-auth";
import { getLocalDemoPermission } from "@/lib/local-demo-permissions";
import { sqlApiRequest } from "@/lib/sql-api";
import { addSampleEmployee, refreshSampleEmployees, useSampleEmployees } from "@/lib/sample-operations";

export const Route = createFileRoute("/_authenticated/employees")({
    validateSearch: (search) => ({ q: typeof search.q === "string" ? search.q : "" }),
    beforeLoad: () => {
        const role = getCurrentRole();
        if (role && role.toLowerCase() !== "admin" && !getLocalDemoPermission(role, "manageEmployees")) throw redirect({ to: "/" });
    },
    head: () => ({
        meta: [
            { title: "Employees — Growel Promotional" },
            { name: "description", content: "Browse fictional employee directory records." },
            { property: "robots", content: "noindex, nofollow" },
        ],
    }),
    component: EmployeesPage,
});

function EmployeeSettingsRow({ employee, onSave, onResetPassword, saving }) {
    const [loginAccess, setLoginAccess] = useState(employee.loginEnabled ? "enabled" : "disabled");
    const [status, setStatus] = useState(employee.status === "Active" ? "Active" : "Inactive");
    const [region, setRegion] = useState(employee.region || "");
    const [approvalAuthorityRole, setApprovalAuthorityRole] = useState(employee.approvalAuthorityRole || "rm");
    const [resetFormOpen, setResetFormOpen] = useState(false);

    useEffect(() => {
        setLoginAccess(employee.loginEnabled ? "enabled" : "disabled");
        setStatus(employee.status === "Active" ? "Active" : "Inactive");
        setRegion(employee.region || "");
        setApprovalAuthorityRole(employee.approvalAuthorityRole || "rm");
    }, [employee.loginEnabled, employee.status, employee.region, employee.approvalAuthorityRole]);

    return (
        <>
            <tr className="border-b border-border last:border-0">
                <td className="px-5 py-4"><span className="block font-bold">{employee.name}</span><span className="text-xs text-muted-foreground">{employee.id}</span></td>
                <td className="px-5 py-4 text-muted-foreground">{employee.email}</td>
                <td className="px-5 py-4">{employee.role?.toUpperCase()}</td>
                <td className="px-5 py-4">
                    <input
                        aria-label={`Area or region for ${employee.name}`}
                        value={region}
                        maxLength={80}
                        required
                        onChange={(event) => setRegion(event.target.value)}
                        className="h-10 min-w-36 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    />
                </td>
                <td className="px-5 py-4">
                    <select
                        aria-label={`Approving authority for ${employee.name}`}
                        value={approvalAuthorityRole}
                        onChange={(event) => setApprovalAuthorityRole(event.target.value)}
                        className="h-10 min-w-28 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    >
                        <option value="rm">RM</option>
                        <option value="avp">AVP</option>
                        <option value="gm">GM</option>
                    </select>
                </td>
                <td className="px-5 py-4">
                    <select
                        aria-label={`Login access for ${employee.name}`}
                        value={employee.hasLogin ? loginAccess : "no-login"}
                        disabled={!employee.hasLogin}
                        onChange={(event) => setLoginAccess(event.target.value)}
                        className="h-10 min-w-28 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-muted"
                    >
                        {employee.hasLogin
                            ? <><option value="enabled">Enable</option><option value="disabled">Disable</option></>
                            : <option value="no-login">No login</option>}
                    </select>
                </td>
                <td className="px-5 py-4">
                    <select
                        aria-label={`Employee status for ${employee.name}`}
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        className="h-10 min-w-28 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                    </select>
                </td>
                <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={!employee.hasLogin}
                            aria-expanded={resetFormOpen}
                            onClick={() => setResetFormOpen((open) => !open)}
                            className="inline-flex h-10 items-center whitespace-nowrap rounded-md border border-border bg-card px-3 text-sm font-bold transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {resetFormOpen ? "Cancel reset" : "Reset password"}
                        </button>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => onSave(employee, status, employee.hasLogin ? loginAccess === "enabled" : null, approvalAuthorityRole, region)}
                            className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
                        >
                            <Save className="size-4" /> {saving ? "Saving..." : "Save"}
                        </button>
                    </div>
                </td>
            </tr>
            {resetFormOpen && employee.hasLogin && (
                <tr className="border-b border-border bg-muted/30">
                    <td colSpan={8} className="px-5 py-4">
                        <form onSubmit={async (event) => {
                            const didReset = await onResetPassword(event, employee);
                            if (didReset) setResetFormOpen(false);
                        }} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto_auto] lg:items-end">
                            <p className="text-sm font-bold sm:col-span-2 lg:col-span-4">Reset password for {employee.name}</p>
                            <label className="space-y-2 text-sm font-semibold">New password
                                <input name="newPassword" type="password" required minLength={12} maxLength={200} autoComplete="new-password" className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                            </label>
                            <label className="space-y-2 text-sm font-semibold">Confirm password
                                <input name="confirmPassword" type="password" required minLength={12} maxLength={200} autoComplete="new-password" className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                            </label>
                            <button type="submit" className="h-11 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90">Reset password</button>
                            <button type="button" onClick={() => setResetFormOpen(false)} className="h-11 rounded-md border border-border bg-card px-4 text-sm font-bold transition hover:bg-muted">Cancel</button>
                        </form>
                    </td>
                </tr>
            )}
        </>
    );
}

function EmployeesPage() {
    const { q } = Route.useSearch();
    const employees = useSampleEmployees();
    const [search, setSearch] = useState(q);
    const [showForm, setShowForm] = useState(false);
    const [signupRequests, setSignupRequests] = useState([]);
    const [signupRoles, setSignupRoles] = useState({});
    const [savingEmployeeId, setSavingEmployeeId] = useState("");
    const [accountMessage, setAccountMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const localDemo = isLocalDemoSession();
    const role = getCurrentRole();
    const canCreateAccounts = !localDemo && role?.toLowerCase() === "admin";
    const canAddEmployees = localDemo || canCreateAccounts;
    useEffect(() => {
        if (!canCreateAccounts) return;
        let active = true;
        void sqlApiRequest("/api/signups").then((requests) => {
            if (active) setSignupRequests(requests);
        }).catch((error) => {
            if (active) setErrorMessage(error instanceof Error ? error.message : "Could not load pending sign-ups.");
        });
        return () => { active = false; };
    }, [canCreateAccounts]);
    useEffect(() => setSearch(q), [q]);
    const filteredEmployees = useMemo(() => {
        const query = search.trim().toLowerCase();
        return query
            ? employees.filter((employee) => [employee.name, employee.email, employee.role, employee.region].some((value) => value.toLowerCase().includes(query)))
            : employees;
    }, [employees, search]);

    async function handleSubmit(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        setErrorMessage("");
        setAccountMessage("");
        try {
            await addSampleEmployee({
                name: formData.get("name").trim(),
                email: formData.get("email").trim(),
                role: formData.get("role").trim(),
                region: formData.get("region").trim(),
                approvalAuthorityRole: formData.get("approvalAuthorityRole"),
                ...(canCreateAccounts ? { password: formData.get("password") } : {}),
                status: formData.get("status"),
            });
            form.reset();
            setShowForm(false);
            if (canCreateAccounts) setAccountMessage("Employee and login created. Share the temporary password securely.");
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Could not add the employee.");
        }
    }

    async function handleSignupReview(form, signup, action) {
        const formData = new FormData(form);
        const role = formData.get("role");
        setErrorMessage("");
        setAccountMessage("");
        try {
            await sqlApiRequest("/api/signups", {
                method: "PATCH",
                body: JSON.stringify({
                    signupId: signup.id,
                    action,
                    role,
                    region: formData.get("region"),
                    approvalAuthorityRole: role === "hr" ? "" : formData.get("approvalAuthorityRole"),
                }),
            });
            setSignupRequests(await sqlApiRequest("/api/signups"));
            if (action === "approve") await refreshSampleEmployees();
            setAccountMessage(action === "approve"
                ? `Approved ${signup.email}. Share sign-in instructions securely.`
                : `Rejected the sign-up request for ${signup.email}.`);
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Could not review the sign-up request.");
        }
    }

    async function handlePasswordReset(event, employee) {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        const password = formData.get("newPassword");
        setErrorMessage("");
        setAccountMessage("");
        if (password !== formData.get("confirmPassword")) {
            setErrorMessage("The passwords do not match.");
            return;
        }
        try {
            await sqlApiRequest(`/api/users/${encodeURIComponent(employee.accountId)}/password`, {
                method: "PUT",
                body: JSON.stringify({ password }),
            });
            form.reset();
            setAccountMessage(`Password reset for ${employee.email}. Share the new password securely.`);
            return true;
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Could not reset the password.");
            return false;
        }
    }

    async function handleSaveEmployeeSettings(employee, status, loginEnabled, approvalAuthorityRole, region) {
        setErrorMessage("");
        setAccountMessage("");
        setSavingEmployeeId(employee.id);
        try {
            await sqlApiRequest(`/api/employees/${encodeURIComponent(employee.id)}`, {
                method: "PATCH",
                body: JSON.stringify({
                    accountId: employee.accountId || null,
                    loginEnabled,
                    status,
                    approvalAuthorityRole,
                    region,
                }),
            });
            await refreshSampleEmployees();
            const currentUser = getSqlUser();
            if (currentUser && employee.accountId === currentUser.id) {
                setSqlUser({ ...currentUser, region, approvalAuthorityRole });
            }
            setAccountMessage(`Saved profile and access settings for ${employee.name}.`);
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Could not save employee settings.");
        }
        finally {
            setSavingEmployeeId("");
        }
    }

    return (
        <AppShell>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-bold uppercase text-primary">People</p>
                    <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Employees</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{localDemo ? "Sample directory of promotional operations staff." : "Manage employee profiles, login access, and pending sign-ups."}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {canAddEmployees && <button type="button" onClick={() => { setErrorMessage(""); setShowForm((open) => !open); }} aria-expanded={showForm} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90">
                        {showForm ? <X className="size-4" /> : <Plus className="size-4" />}
                        {showForm ? "Cancel" : canCreateAccounts ? "Add employee & login" : "Add employee"}
                    </button>}
                </div>
            </div>
            {localDemo ? <aside role="note" className="mb-5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                <span className="font-bold text-primary">Fictional employee data.</span>{" "}
                These example profiles do not represent real staff or accounts.
                {role === "admin" && " The Admin demo cannot reset real passwords; sign in with your SQL-backed Admin account to manage user passwords."}
            </aside> : <aside role="note" className="mb-5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">Employee records and account roles are stored in SQL Server. Passwords are stored as salted, one-way hashes.</aside>}
            {accountMessage && <p role="status" className="mb-4 rounded-md bg-success-soft px-4 py-3 text-sm font-semibold text-success">{accountMessage}</p>}
            {errorMessage && <p role="alert" className="mb-4 rounded-md bg-danger-soft px-4 py-3 text-sm font-semibold text-destructive">{errorMessage}</p>}
            {showForm && (
                <form onSubmit={handleSubmit} className="mb-5 rounded-lg border border-border bg-card p-5 shadow-sm">
                    <h2 className="font-bold">{canCreateAccounts ? "Create employee and login" : "Enter employee details"}</h2>
                    {canCreateAccounts && <p className="mt-1 text-xs text-muted-foreground">This creates one employee record and its login together. Use a @growelfeeds.com email.</p>}
                    {errorMessage && <p role="alert" className="mt-3 rounded-md bg-danger-soft px-4 py-3 text-sm font-semibold text-destructive">{errorMessage}</p>}
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <label className="space-y-2 text-sm font-semibold">Full name
                            <input name="name" required maxLength={100} autoComplete="name" className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                        </label>
                        <label className="space-y-2 text-sm font-semibold">Email
                            <input name="email" type="email" required maxLength={254} autoComplete="email" pattern={canCreateAccounts ? "^[^@\\s]+@growelfeeds\\.com$" : undefined} title={canCreateAccounts ? "Use a @growelfeeds.com email address." : undefined} placeholder={canCreateAccounts ? "name@growelfeeds.com" : undefined} className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                        </label>
                        <label className="space-y-2 text-sm font-semibold">Role
                            {canCreateAccounts
                                ? <select name="role" required defaultValue="executive" className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                                    <option value="executive">Executive</option>
                                    <option value="rm">RM</option>
                                    <option value="avp">AVP</option>
                                    <option value="gm">GM</option>
                                    <option value="hr">HR</option>
                                    <option value="admin">Admin</option>
                                </select>
                                : <input name="role" required maxLength={60} className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />}
                        </label>
                        {canCreateAccounts && <label className="space-y-2 text-sm font-semibold">Approving authority
                            <select name="approvalAuthorityRole" required defaultValue="rm" className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                        <option value="rm">RM · Regional Manager</option>
                        <option value="avp">AVP · Assistant Vice President</option>
                        <option value="gm">GM · General Manager</option>
                            </select>
                        </label>}
                        <label className="space-y-2 text-sm font-semibold">Region
                            <input name="region" required maxLength={80} className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                        </label>
                        {canCreateAccounts && <label className="space-y-2 text-sm font-semibold">Temporary password
                            <input name="password" type="password" required minLength={12} maxLength={200} autoComplete="new-password" className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                        </label>}
                        {!canCreateAccounts && <label className="space-y-2 text-sm font-semibold">Status
                            <select name="status" defaultValue="Active" className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                            </select>
                        </label>}
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <button type="submit" className="h-10 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90">{canCreateAccounts ? "Create employee & login" : "Save employee"}</button>
                        <button type="button" onClick={() => setShowForm(false)} className="h-10 rounded-md border border-border bg-card px-4 text-sm font-bold hover:bg-muted">Cancel</button>
                    </div>
                </form>
            )}
            <section aria-label="Employee summary" className="mb-5 grid gap-4 sm:grid-cols-3">
                {[
                    [localDemo ? "Sample employees" : "Employees", employees.length],
                    ["Active", employees.filter((employee) => employee.status === "Active").length],
                    ["Regions represented", new Set(employees.map((employee) => employee.region)).size],
                ].map(([label, value]) => (
                    <article key={label} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                        <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
                        <p className="mt-3 text-2xl font-extrabold">{value}</p>
                    </article>
                ))}
            </section>
            <label className="relative block">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input aria-label="Search employees" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employees, roles, or regions..." className="h-11 w-full rounded-md border border-input bg-card pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </label>
            <section aria-label="Sample employee directory" className="mt-5 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <div className="flex items-center gap-3 border-b border-border p-5">
                    <span className="grid size-9 place-items-center rounded-md bg-secondary text-primary"><Users className="size-4" /></span>
                    <div><h2 className="font-bold">Employee directory</h2><p className="mt-1 text-xs text-muted-foreground">{localDemo ? "Sample records for interface testing" : "Employee profiles and login access in one directory"}</p></div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px] text-left text-sm">
                        <thead><tr className="border-b border-border bg-muted/60">{["Employee", "Email", "Role", "Region", ...(canCreateAccounts ? ["Approving authority", "Login access", "Status", "Actions"] : ["Status"])].map((heading, index) => <th key={`${heading}-${index}`} className="px-5 py-3.5 text-[11px] font-bold uppercase text-muted-foreground">{heading}</th>)}</tr></thead>
                        <tbody>{filteredEmployees.map((employee) => canCreateAccounts ? (
                            <EmployeeSettingsRow
                                key={employee.id}
                                employee={employee}
                                onSave={handleSaveEmployeeSettings}
                                onResetPassword={handlePasswordReset}
                                saving={savingEmployeeId === employee.id}
                            />
                        ) : (
                            <tr key={employee.id} className="border-b border-border last:border-0">
                                <td className="px-5 py-4"><span className="block font-bold">{employee.name}</span><span className="text-xs text-muted-foreground">{employee.id}</span></td>
                                <td className="px-5 py-4 text-muted-foreground">{employee.email}</td>
                                <td className="px-5 py-4">{employee.role?.toUpperCase()}</td>
                                <td className="px-5 py-4">{employee.region}</td>
                                <td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${employee.status === "Active" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}>{employee.status}</span></td>
                            </tr>
                        ))}</tbody>
                    </table>
                    {filteredEmployees.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted-foreground">No employees match your search.</p>}
                </div>
            </section>
            {canCreateAccounts && (
                <section aria-label="Pending sign-up requests" className="mt-5 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                    <div className="border-b border-border p-5">
                        <h2 className="font-bold">Pending sign-ups</h2>
                        <p className="mt-1 text-xs text-muted-foreground">Review requested role, region, and approving authority before access is granted.</p>
                    </div>
                    <div className="divide-y divide-border">
                        {signupRequests.map((signup) => (
                            <form key={signup.id} onSubmit={(event) => { event.preventDefault(); void handleSignupReview(event.currentTarget, signup, "approve"); }} className="grid gap-3 p-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(8rem,0.7fr)_minmax(8rem,0.7fr)_minmax(8rem,0.7fr)_minmax(8rem,0.7fr)_auto] lg:items-end">
                                <div className="min-w-0 text-sm">
                                    <p className="font-bold">{signup.displayName}</p>
                                    <p className="break-all text-muted-foreground">{signup.email}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Requested: {signup.requestedRole?.toUpperCase() || "EXECUTIVE"}
                                        {signup.requestedRole !== "hr" && ` · Authority: ${signup.approvalAuthorityRole?.toUpperCase() || "RM"}`}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">Submitted {new Date(signup.createdAt).toLocaleDateString()}</p>
                                </div>
                                <label className="space-y-2 text-sm font-semibold">Assign role
                                    <select
                                        name="role"
                                        required
                                        value={signupRoles[signup.id] || signup.requestedRole || "executive"}
                                        onChange={(event) => setSignupRoles((roles) => ({ ...roles, [signup.id]: event.target.value }))}
                                        className="h-10 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                                    >
                                        <option value="executive">Executive</option>
                                        <option value="rm">RM</option>
                                        <option value="avp">AVP</option>
                                        <option value="gm">GM</option>
                                        <option value="hr">HR</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </label>
                                <label className="space-y-2 text-sm font-semibold">Assign region
                                    <input name="region" required defaultValue={signup.region} maxLength={80} placeholder="Region required" className="h-10 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                                </label>
                                {(signupRoles[signup.id] || signup.requestedRole || "executive") !== "hr" && (
                                    <label className="space-y-2 text-sm font-semibold">Approving authority
                                        <select name="approvalAuthorityRole" required defaultValue={signup.approvalAuthorityRole || "rm"} className="h-10 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                                            <option value="rm">RM</option>
                                            <option value="avp">AVP</option>
                                            <option value="gm">GM</option>
                                        </select>
                                    </label>
                                )}
                                <div className="flex gap-2">
                                    <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-md bg-success px-3 text-sm font-bold text-white"><Check className="size-4" /> Approve</button>
                                    <button type="button" onClick={(event) => {
                                        void handleSignupReview(event.currentTarget.form, signup, "reject");
                                    }} className="h-10 rounded-md border border-border px-3 text-sm font-bold hover:bg-muted">Reject</button>
                                </div>
                            </form>
                        ))}
                        {signupRequests.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted-foreground">No pending sign-ups.</p>}
                    </div>
                </section>
            )}
        </AppShell>
    );
}
