import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CalendarDays, Check, ClipboardCheck, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequestQuantityRevision } from "@/components/RequestQuantityRevision";
import { getCurrentRole, getSqlUser, isLocalDemoSession } from "@/lib/local-demo-auth";
import { getLocalDemoPermission, useLocalDemoPermission } from "@/lib/local-demo-permissions";
import { addSampleRequest, formatMaterialName, formatRequestMaterials, getRequestMaterialItems, useSampleMaterials, useSampleRequests, updateSampleRequest } from "@/lib/sample-operations";

export const Route = createFileRoute("/_authenticated/requests")({
    validateSearch: (search) => ({ q: typeof search.q === "string" ? search.q : "" }),
    beforeLoad: () => {
        const role = getCurrentRole();
        if (role && !getLocalDemoPermission(role, "createRequests") && !getLocalDemoPermission(role, "approveRequests")) {
            throw redirect({ to: "/approvals" });
        }
    },
    head: () => ({
        meta: [
            { title: "Requests — Growel Promotional" },
            { name: "description", content: "Browse and approve sample promotional material requests." },
            { property: "robots", content: "noindex, nofollow" },
        ],
    }),
    component: RequestsPage,
});

function StatusPill({ status }) {
    const styles = status === "Received"
        ? "bg-success-soft text-success"
        : status === "Revised"
        ? "bg-secondary text-primary"
        : status === "Approved" || status === "Under Packing" || status === "Dispatched"
            ? "bg-success-soft text-success"
            : "bg-warning-soft text-warning";
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${styles}`}>
            <span className="size-1.5 rounded-full bg-current" />
            {status}
        </span>
    );
}

function RequestsPage() {
    const { q } = Route.useSearch();
    const requests = useSampleRequests();
    const materials = useSampleMaterials();
    const demoRole = getCurrentRole();
    const sqlUser = getSqlUser();
    const localDemo = isLocalDemoSession();
    const executiveDemo = demoRole === "executive";
    const executiveRequest = executiveDemo || sqlUser?.role === "executive";
    const requesterName = sqlUser?.displayName || (localDemo ? `Demo ${demoRole === "executive" ? "Executive" : "Admin"}` : "");
    const requesterRole = sqlUser?.role || demoRole || "";
    const hrRequester = requesterRole.toLowerCase() === "hr";
    const requesterRegion = sqlUser?.region || (localDemo ? "Demo Region" : "");
    const assignedAuthority = sqlUser
        ? sqlUser.approvalAuthorityRole?.toLowerCase() || ""
        : "rm";
    const profileReady = !sqlUser || (
        Boolean(sqlUser.region?.trim()) &&
        (hrRequester || ["rm", "avp", "gm"].includes(assignedAuthority))
    );
    const managerDemo = ["rm", "avp", "gm"].includes(demoRole);
    const hrDemo = demoRole === "hr";
    const canViewRequestValues = ["admin", "hr"].includes(demoRole);
    const canCreateRequests = useLocalDemoPermission(demoRole, "createRequests");
    const hasApprovePermission = useLocalDemoPermission(demoRole, "approveRequests");
    const canApproveRequests = managerDemo && hasApprovePermission;
    const visibleRequests = executiveDemo
        ? requests.filter((request) => request.createdByRole === "executive" || request.role === "Executive")
        : requests;
    const availableMaterials = materials.filter((material) => material.stock > 0);
    const [search, setSearch] = useState(q);
    const [errorMessage, setErrorMessage] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [revisingRequestId, setRevisingRequestId] = useState("");
    const [materialLines, setMaterialLines] = useState([{ id: 0, materialId: "", quantity: "" }]);
    const nextMaterialLineId = useRef(1);
    useEffect(() => setSearch(q), [q]);
    const filteredRequests = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return visibleRequests;
        return visibleRequests.filter((request) =>
            [request.id, request.requester, request.region, request.material, request.status, request.purpose || ""]
                .some((value) => value.toLowerCase().includes(query)),
        );
    }, [visibleRequests, search]);

    async function createRequest(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        setErrorMessage("");
        try {
            if (!canCreateRequests) throw new Error("Your demo role does not have permission to create requests.");
            const requestedMaterials = executiveRequest
                ? materialLines.map((line) => {
                    const selectedMaterial = availableMaterials.find((material) => material.id === line.materialId);
                    const quantity = Number(line.quantity);
                    if (!selectedMaterial) throw new Error("Choose an in-stock material for every request item.");
                    if (!Number.isInteger(quantity) || quantity < 1) throw new Error(`Enter a whole-number quantity for ${selectedMaterial.name}.`);
                    if (quantity > selectedMaterial.stock) throw new Error(`Only ${selectedMaterial.stock} ${selectedMaterial.unit} of ${selectedMaterial.name} are currently available.`);
                    return { material: selectedMaterial.name, language: selectedMaterial.language || null, items: quantity, unit: selectedMaterial.unit };
                })
                : (() => {
                    const materialId = formData.get("material");
                    const selectedMaterial = availableMaterials.find((material) => material.id === materialId);
                    const quantity = Number(formData.get("items"));
                    if (!selectedMaterial) throw new Error("Choose a material that is currently in stock.");
                    if (quantity > selectedMaterial.stock) throw new Error(`Only ${selectedMaterial.stock} ${selectedMaterial.unit} of ${selectedMaterial.name} are currently available.`);
                    return [{ material: selectedMaterial.name, language: selectedMaterial.language || null, items: quantity, unit: selectedMaterial.unit }];
                })();
            if (new Set(requestedMaterials.map((item) => `${item.material}:${item.language || ""}`)).size !== requestedMaterials.length) {
                throw new Error("Each material can only be added once to a request.");
            }
            const totalItems = requestedMaterials.reduce((sum, item) => sum + item.items, 0);
            const requestValue = requestedMaterials.reduce((sum, item) => {
                const material = availableMaterials.find((entry) => entry.name === item.material && (entry.language || null) === (item.language || null));
                return sum + (material?.unitValue || 0) * item.items;
            }, 0);
            await addSampleRequest({
                requester: sqlUser?.displayName || (executiveDemo ? "Demo Executive" : "Demo Admin"),
                role: sqlUser?.role || (executiveDemo ? "Executive" : "Admin"),
                ...(executiveDemo ? { createdByRole: "executive" } : {}),
                requestedAuthorityRole: assignedAuthority || (localDemo ? "rm" : ""),
                region: sqlUser?.region || (localDemo ? "Demo Region" : ""),
                materialItems: requestedMaterials,
                material: requestedMaterials.map((item) => item.language ? `${item.material} (${item.language})` : item.material).join(", "),
                items: totalItems,
                value: requestValue,
                date: new Date(`${formData.get("date")}T00:00:00`).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                }),
                purpose: formData.get("purpose").trim(),
            });
            form.reset();
            setMaterialLines([{ id: nextMaterialLineId.current++, materialId: "", quantity: "" }]);
            setShowForm(false);
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "The request could not be created.");
        }
    }

    async function approveRequest(requestId) {
        setErrorMessage("");
        try {
            if (!canApproveRequests) throw new Error("Your demo role does not have permission to approve requests.");
            await updateSampleRequest(requestId, {
                status: "Approved",
                approvedByRole: demoRole,
                approvedAt: new Date().toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                }),
            });
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "The request could not be approved.");
        }
    }

    async function saveRevisedQuantities(request, materialItems) {
        setErrorMessage("");
        try {
            if (!canApproveRequests || !["Pending Approval", "Revised"].includes(request.status)) {
                throw new Error("Only the assigned RM, GM, or AVP can revise a request awaiting manager review.");
            }
            const revisionNumber = Number(request.revisionNumber || 0) + 1;
            await updateSampleRequest(request.id, {
                status: "Revised",
                materialItems,
                material: materialItems.map((item) => item.material).join(", "),
                items: materialItems.reduce((sum, item) => sum + item.items, 0),
                revisedByRole: demoRole,
                revisedForRole: demoRole,
                revisionNumber,
                revisedAt: new Date().toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                }),
            });
            setRevisingRequestId("");
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "The request quantities could not be revised.");
            throw error;
        }
    }

    return (
        <AppShell>
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <p className="text-xs font-bold uppercase text-primary">Procurement</p>
                    <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Requests</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{executiveRequest ? "Create requests and track their approval and delivery status." : managerDemo ? "Review Executive requests; approved requests move to HR for packing and dispatch." : hrDemo ? "Track manager-approved requests and prepare them for packing and dispatch." : "Review the request register and follow requests through fulfillment."}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {canCreateRequests && <button type="button" onClick={() => { setErrorMessage(""); setShowForm((open) => !open); }} aria-expanded={showForm} className="inline-flex h-11 items-center gap-2 rounded-md bg-success px-4 text-sm font-bold text-white transition hover:brightness-95">
                        {showForm ? <X className="size-4" /> : <Plus className="size-4" />}
                        {showForm ? "Cancel" : "New request"}
                    </button>}
                    {!executiveDemo && (
                        <Link to="/approvals" className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-bold transition hover:bg-muted">
                            <ClipboardCheck className="size-4" /> View approvals
                        </Link>
                    )}
                </div>
            </div>

            {showForm && canCreateRequests && (
                <form onSubmit={createRequest} className="mt-5 rounded-lg border border-border bg-card p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <h2 className="font-bold">Enter request details</h2>
                            <p className="mt-1 text-xs text-muted-foreground">New requests start as Pending Approval and use available stock only.</p>
                        </div>
                    </div>
                    {errorMessage && <p role="alert" className="mt-4 rounded-md bg-danger-soft px-4 py-3 text-sm font-semibold text-destructive">{errorMessage}</p>}
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <label className="space-y-2 text-sm font-semibold">Requester name
                            <input
                                value={requesterName}
                                readOnly
                                className="h-11 w-full rounded-md border border-input bg-muted px-3 font-normal text-muted-foreground outline-none"
                            />
                        </label>
                        <label className="space-y-2 text-sm font-semibold">Role / designation
                            <input
                                value={requesterRole ? requesterRole.toUpperCase() : "Not assigned"}
                                readOnly
                                className="h-11 w-full rounded-md border border-input bg-muted px-3 font-normal text-muted-foreground outline-none"
                            />
                        </label>
                        <label className="space-y-2 text-sm font-semibold">Area / region
                            <input
                                value={requesterRegion}
                                readOnly
                                aria-describedby={!profileReady ? "request-profile-help" : undefined}
                                className="h-11 w-full rounded-md border border-input bg-muted px-3 font-normal text-muted-foreground outline-none"
                            />
                        </label>
                        {!hrRequester && (
                            <label className="space-y-2 text-sm font-semibold">Approving authority
                                <input
                                    value={assignedAuthority ? assignedAuthority.toUpperCase() : "Not assigned"}
                                    readOnly
                                    aria-describedby={!profileReady ? "request-profile-help" : undefined}
                                    className="h-11 w-full rounded-md border border-input bg-muted px-3 font-normal text-muted-foreground outline-none"
                                />
                            </label>
                        )}
                        {!profileReady && (
                            <p id="request-profile-help" role="alert" className="self-end text-sm font-semibold text-destructive sm:col-span-2 lg:col-span-3">
                                Your employee profile is missing an area/region or approving authority. Ask an Admin to update it before submitting requests.
                            </p>
                        )}
                        {executiveRequest ? (
                            <fieldset className="space-y-3 sm:col-span-2 lg:col-span-3">
                                <legend className="text-sm font-semibold">Materials requested</legend>
                                {materialLines.map((line) => {
                                    const selectedElsewhere = new Set(materialLines.filter((other) => other.id !== line.id).map((other) => other.materialId));
                                    return (
                                        <div key={line.id} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,0.5fr)_auto]">
                                            <label className="space-y-2 text-sm font-semibold">Material
                                                <select
                                                    required
                                                    value={line.materialId}
                                                    onChange={(event) => setMaterialLines((current) => current.map((item) => item.id === line.id ? { ...item, materialId: event.target.value } : item))}
                                                    className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                                                >
                                                    <option value="" disabled>Select material</option>
                                                    {availableMaterials.filter((material) => !selectedElsewhere.has(material.id)).map((material) => (
                                                        <option key={material.id} value={material.id}>{formatMaterialName(material)} · {material.stock} {material.unit} available</option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label className="space-y-2 text-sm font-semibold">Quantity
                                                <input
                                                    type="number"
                                                    min="1"
                                                    step="1"
                                                    required
                                                    value={line.quantity}
                                                    onChange={(event) => setMaterialLines((current) => current.map((item) => item.id === line.id ? { ...item, quantity: event.target.value } : item))}
                                                    className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                                                />
                                            </label>
                                            <button
                                                type="button"
                                                aria-label="Remove material"
                                                disabled={materialLines.length === 1}
                                                onClick={() => setMaterialLines((current) => current.filter((item) => item.id !== line.id))}
                                                className="mt-6 grid size-11 place-items-center rounded-md border border-border text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                                <Trash2 className="size-4" aria-hidden="true" />
                                            </button>
                                        </div>
                                    );
                                })}
                                <button
                                    type="button"
                                    disabled={materialLines.length >= availableMaterials.length}
                                    onClick={() => setMaterialLines((current) => [...current, { id: nextMaterialLineId.current++, materialId: "", quantity: "" }])}
                                    className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Plus className="size-4" /> Add another material
                                </button>
                                {availableMaterials.length === 0 && <p role="alert" className="text-sm font-semibold text-destructive">There are no in-stock materials available to request.</p>}
                            </fieldset>
                        ) : (
                            <>
                                <label className="space-y-2 text-sm font-semibold">Material
                                    <select name="material" required defaultValue="" className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                                        <option value="" disabled>Select material</option>
                                        {availableMaterials.map((material) => <option key={material.id} value={material.id}>{formatMaterialName(material)} · {material.stock} {material.unit} available</option>)}
                                    </select>
                                </label>
                                {availableMaterials.length === 0 && <p role="alert" className="text-sm font-semibold text-destructive sm:col-span-2">There are no in-stock materials available to request.</p>}
                                <label className="space-y-2 text-sm font-semibold">Quantity
                                    <input name="items" type="number" min="1" step="1" required className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                                </label>
                            </>
                        )}
                        <label className="space-y-2 text-sm font-semibold">Request date
                            <input name="date" type="date" required defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)} className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                        </label>
                        <label className="space-y-2 text-sm font-semibold sm:col-span-2">Purpose / notes
                            <textarea name="purpose" required maxLength={500} rows={2} placeholder="What are the materials needed for?" className="w-full rounded-md border border-input bg-card px-3 py-2 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                        </label>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <button type="submit" disabled={!profileReady} className="h-10 rounded-md bg-success px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">Submit request</button>
                        <button type="button" onClick={() => setShowForm(false)} className="h-10 rounded-md border border-border bg-card px-4 text-sm font-bold hover:bg-muted">Cancel</button>
                    </div>
                </form>
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        aria-label="Search sample requests"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search requests, people, materials, regions..."
                        className="h-11 w-full rounded-md border border-input bg-card pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                    />
                </label>
                <div className="flex h-11 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm text-muted-foreground">
                    <CalendarDays className="size-4" /> Sample records
                </div>
            </div>

            {errorMessage && <p role="alert" className="mt-4 rounded-md bg-danger-soft px-4 py-3 text-sm font-semibold text-destructive">{errorMessage}</p>}

            <section aria-label="Sample requests" className="mt-5 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
                    <div>
                        <h2 className="font-bold">Request register</h2>
                        <p className="mt-1 text-xs text-muted-foreground">{executiveRequest ? "Track review and delivery status for your requests." : managerDemo ? "Approve pending requests to send them to HR for fulfillment." : "Requests move to HR fulfillment after manager approval."}</p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{filteredRequests.length} {executiveRequest ? "my requests" : "sample requests"}</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1200px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/60">
                                {["Request ID", "Requester", "Role", "Region", "Approver", "Material", "Items", ...(canViewRequestValues ? ["Value"] : []), "Request date", "Purpose", "Status", "Action"].map((heading) => (
                                    <th key={heading} className="px-4 py-3.5 text-[11px] font-bold uppercase text-muted-foreground">{heading}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRequests.map((request) => (
                                <tr key={request.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                                    <td className="px-4 py-4 font-bold text-primary">{request.id}</td>
                                    <td className="px-4 py-4 font-semibold">{request.requester}</td>
                                    <td className="px-4 py-4 text-muted-foreground">{request.role}</td>
                                    <td className="px-4 py-4 text-muted-foreground">{request.region}</td>
                                    <td className="px-4 py-4 text-muted-foreground">{request.requestedAuthorityRole?.toUpperCase() || "—"}</td>
                                    <td className="max-w-64 px-4 py-4">{formatRequestMaterials(request)}</td>
                                    <td className="px-4 py-4">{getRequestMaterialItems(request).reduce((sum, item) => sum + Number(item.items || 0), 0)}</td>
                                    {canViewRequestValues && <td className="px-4 py-4 font-semibold">₹{Number(request.value || 0).toLocaleString("en-IN")}</td>}
                                    <td className="px-4 py-4 text-muted-foreground">{request.date}</td>
                                    <td className="max-w-48 px-4 py-4 text-muted-foreground" title={request.purpose || ""}>{request.purpose || "—"}</td>
                                    <td className="px-4 py-4"><StatusPill status={request.status} /></td>
                                    <td className="px-4 py-4">
                                        {executiveRequest ? (
                                            <Link to="/approvals" className="text-xs font-semibold text-primary hover:underline">
                                                {request.status === "Dispatched" ? "Acknowledge in approvals" : "View approval status"}
                                            </Link>
                                        ) : canApproveRequests && (request.status === "Pending Approval" || request.status === "Revised") && (!request.revisedForRole || request.revisedForRole === demoRole) ? (
                                            <div className="flex flex-col items-start gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => approveRequest(request.id)}
                                                    className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-md bg-success px-3 text-xs font-bold text-white transition hover:brightness-95"
                                                >
                                                    <Check className="size-4" /> Approve request
                                                </button>
                                                {request.role === "Executive" || request.createdByRole === "executive" ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setRevisingRequestId((current) => current === request.id ? "" : request.id)}
                                                        className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-md border border-border bg-card px-3 text-xs font-bold transition hover:bg-muted"
                                                    >
                                                        <Pencil className="size-3.5" /> Revise quantities
                                                    </button>
                                                ) : null}
                                            </div>
                                        ) : canApproveRequests && request.status === "Revised" && request.revisedByRole === "hr" ? (
                                            <span className="text-xs text-muted-foreground">Awaiting {request.revisedForRole?.toUpperCase() || "manager"} review</span>
                                        ) : request.status === "Approved" ? (
                                            <Link to="/approvals" className="text-xs font-bold text-primary hover:underline">{managerDemo ? "Approved · sent to HR" : "In HR fulfillment"}</Link>
                                        ) : request.status === "Pending Approval" || request.status === "Revised" ? (
                                            <span className="text-xs text-muted-foreground">Awaiting manager review</span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">Processing</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredRequests.filter((request) => request.id === revisingRequestId).map((request) => (
                                <tr key={`${request.id}-revision`} className="border-b border-border bg-muted/20">
                                    <td colSpan={canViewRequestValues ? 11 : 10} className="px-5 py-4">
                                        <RequestQuantityRevision
                                            request={request}
                                            onCancel={() => setRevisingRequestId("")}
                                            onSave={(materialItems) => saveRevisedQuantities(request, materialItems)}
                                        />
                                    </td>
                                </tr>
                            ))}
                            {filteredRequests.length === 0 && (
                                <tr><td colSpan={canViewRequestValues ? 11 : 10} className="px-5 py-12 text-center text-sm text-muted-foreground">No sample requests match your search.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Sample data only · Changes are stored in this browser.</p>
            </section>
        </AppShell>
    );
}
