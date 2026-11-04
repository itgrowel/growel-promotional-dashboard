import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, PackageCheck, Pencil, Truck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequestQuantityRevision } from "@/components/RequestQuantityRevision";
import { createGatePassPdf } from "@/lib/gate-pass-pdf";
import { getCurrentRole } from "@/lib/local-demo-auth";
import { getLocalDemoPermission, useLocalDemoPermission } from "@/lib/local-demo-permissions";
import { formatRequestMaterials, updateSampleRequest, useSampleRequests } from "@/lib/sample-operations";

export const Route = createFileRoute("/_authenticated/approvals")({
    beforeLoad: () => {
        const role = getCurrentRole();
        if (role && role !== "executive" &&
            !getLocalDemoPermission(role, "approveRequests") &&
            !getLocalDemoPermission(role, "dispatchRequests")) {
            throw redirect({ to: "/" });
        }
    },
    head: () => ({
        meta: [
            { title: "Approvals — Growel Promotional" },
            { name: "description", content: "Pack approved sample requests and prepare dispatch gate passes." },
            { property: "robots", content: "noindex, nofollow" },
        ],
    }),
    component: ApprovalsPage,
});

function formatCurrency(value) {
    return `₹${Number(value).toLocaleString("en-IN")}`;
}

function StatusPill({ status }) {
    const styles = status === "Received" || status === "Dispatched"
        ? "bg-success-soft text-success"
        : status === "Under Packing"
            ? "bg-secondary text-primary"
            : "bg-warning-soft text-warning";
    return <span className={`rounded-full px-3 py-1 text-xs font-bold ${styles}`}>{status}</span>;
}

function ApprovalsPage() {
    const requests = useSampleRequests();
    const demoRole = getCurrentRole();
    const executiveDemo = demoRole === "executive";
    const managerDemo = ["rm", "avp", "gm"].includes(demoRole);
    const hrDemo = demoRole === "hr";
    const adminDemo = demoRole === "admin";
    const canViewRequestValues = hrDemo || adminDemo;
    const hasDispatchPermission = useLocalDemoPermission(demoRole, "dispatchRequests");
    const canManageFulfillment = hrDemo && hasDispatchPermission;
    const canViewGatePass = hrDemo || adminDemo;
    const approvals = useMemo(
        () => executiveDemo
            ? requests.filter((request) => request.createdByRole === "executive" || request.role === "Executive")
            : requests.filter((request) => ["Approved", "Under Packing", "Dispatched"].includes(request.status)),
        [requests, executiveDemo],
    );
    const [dispatchingId, setDispatchingId] = useState("");
    const [revisingRequestId, setRevisingRequestId] = useState("");
    const [transportType, setTransportType] = useState("Vehicle");
    const [vehicleNumber, setVehicleNumber] = useState("");
    const [driverName, setDriverName] = useState("");
    const [courierCompany, setCourierCompany] = useState("");
    const [trackingNumber, setTrackingNumber] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [gatePass, setGatePass] = useState(null);
    const [pdfUrl, setPdfUrl] = useState("");

    async function acknowledgeReceipt(requestId) {
        setErrorMessage("");
        try {
            const request = requests.find((entry) => entry.id === requestId);
            if (!executiveDemo || request?.status !== "Dispatched") {
                throw new Error("Only the Executive can acknowledge a dispatched request.");
            }
            await updateSampleRequest(requestId, {
                status: "Received",
                receivedAt: new Date().toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                }),
            });
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Receipt could not be acknowledged.");
        }
    }

    useEffect(() => () => {
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    }, [pdfUrl]);

    async function moveToPacking(request) {
        setErrorMessage("");
        try {
            if (!canManageFulfillment || request.status !== "Approved") {
                throw new Error("Only HR can move manager-approved requests into packing.");
            }
            await updateSampleRequest(request.id, {
                status: "Under Packing",
                approvedAt: request.approvedAt || new Date().toLocaleDateString("en-IN"),
            });
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "The request could not be moved to packing.");
        }
    }

    async function saveRevisedQuantities(request, materialItems) {
        setErrorMessage("");
        try {
            if (!canManageFulfillment || !["Approved", "Under Packing"].includes(request.status)) {
                throw new Error("Only HR can revise quantities on manager-approved requests.");
            }
            await updateSampleRequest(request.id, {
                status: "Revised",
                materialItems,
                material: materialItems.map((item) => item.material).join(", "),
                items: materialItems.reduce((sum, item) => sum + item.items, 0),
                revisedByRole: "hr",
                revisedForRole: request.approvedByRole || request.requestedAuthorityRole || "",
                revisionNumber: Number(request.revisionNumber || 0) + 1,
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

    function openDispatchForm(request) {
        setErrorMessage("");
        setDispatchingId(request.id);
        setTransportType(request.transportType || "Vehicle");
        setVehicleNumber(request.vehicleNumber || "");
        setDriverName(request.driverName || "");
        setCourierCompany(request.courierCompany || "");
        setTrackingNumber(request.trackingNumber || "");
    }

    function showGatePass(request) {
        try {
            const blob = createGatePassPdf(request);
            const nextUrl = URL.createObjectURL(blob);
            setPdfUrl(nextUrl);
            setGatePass(request);
            setErrorMessage("");
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Could not create the gate pass PDF.");
        }
    }

    async function generateGatePass(event, request) {
        event.preventDefault();
        setErrorMessage("");
        if (!canManageFulfillment || request.status !== "Under Packing") {
            setErrorMessage("Only HR can dispatch requests after they have moved into packing.");
            return;
        }
        const dispatchDetails = transportType === "Vehicle"
            ? { vehicleNumber: vehicleNumber.trim(), driverName: driverName.trim() }
            : { courierCompany: courierCompany.trim(), trackingNumber: trackingNumber.trim() };
        try {
            const dispatchedAt = new Date().toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
            });
            const updatedRequest = await updateSampleRequest(request.id, {
                status: "Dispatched",
                transportType,
                ...dispatchDetails,
                gatePassNumber: request.gatePassNumber || `GP-${request.id.replace(/\D/g, "")}`,
                dispatchedAt,
            });
            setDispatchingId("");
            showGatePass(updatedRequest);
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Could not dispatch the request.");
        }
    }

    return (
        <AppShell>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-bold uppercase text-primary">{executiveDemo ? "Executive workspace" : managerDemo ? "Manager workspace" : hrDemo ? "HR workspace" : "Procurement"}</p>
                    <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">{executiveDemo ? "Approval status" : hrDemo ? "HR packing & dispatch" : managerDemo ? "Approval progress" : "Approvals & dispatch"}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{executiveDemo ? "Track your requests and acknowledge materials after they arrive." : hrDemo ? "Manager-approved requests appear here for packing and dispatch." : managerDemo ? "Track requests after manager approval as HR prepares dispatch." : "Track requests through manager approval and HR fulfillment."}</p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">{approvals.length} {executiveDemo ? "my requests" : hrDemo ? "in HR workflow" : "in workflow"}</span>
            </div>

            {!executiveDemo && (
                <aside role="note" className="mb-5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                    <span className="font-bold text-primary">Sample workflow.</span>{" "}
                    Changes are stored in this browser and do not dispatch real orders.
                </aside>
            )}
            {errorMessage && <p role="alert" className="mb-5 rounded-md bg-danger-soft px-4 py-3 text-sm font-semibold text-destructive">{errorMessage}</p>}

            <section aria-label={executiveDemo ? "My approval status" : "Approved requests"} className="space-y-4">
                {approvals.map((request) => (
                    <article key={request.id} className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                            <div className="flex min-w-0 items-start gap-3">
                                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><PackageCheck className="size-5" /></span>
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="font-bold">{request.id}</h2>
                                        <StatusPill status={request.status} />
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">{request.requester} · {request.role} · {request.region}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{formatRequestMaterials(request)}{canViewRequestValues ? ` · ${formatCurrency(request.value)}` : ""}</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {executiveDemo ? (
                                    request.status === "Dispatched" ? (
                                        <button
                                            type="button"
                                            onClick={() => acknowledgeReceipt(request.id)}
                                            className="inline-flex h-10 items-center gap-2 rounded-md bg-success px-4 text-sm font-bold text-white transition hover:brightness-95"
                                        >
                                            <PackageCheck className="size-4" /> Received
                                        </button>
                                    ) : request.status === "Received" ? (
                                        <span className="text-sm font-semibold text-success">Received {request.receivedAt ? `· ${request.receivedAt}` : ""}</span>
                                    ) : request.status === "Pending Approval" || request.status === "Revised" ? (
                                        <span className="text-sm text-muted-foreground">Awaiting manager approval</span>
                                    ) : request.status === "Approved" ? (
                                        <span className="text-sm text-muted-foreground">Approved by {request.approvedByRole?.toUpperCase() || "manager"} · awaiting HR</span>
                                    ) : request.status === "Under Packing" ? (
                                        <span className="text-sm text-muted-foreground">HR is packing this request</span>
                                    ) : (
                                        <span className="text-sm text-muted-foreground">Awaiting workflow update</span>
                                    )
                                ) : canManageFulfillment && request.status !== "Dispatched" ? (
                                    <>
                                        {["Approved", "Under Packing"].includes(request.status) && (
                                            <button
                                                type="button"
                                                onClick={() => setRevisingRequestId((current) => current === request.id ? "" : request.id)}
                                                className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-bold transition hover:bg-muted"
                                            >
                                                <Pencil className="size-4" /> Revise quantities
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => moveToPacking(request)}
                                            disabled={request.status !== "Approved"}
                                            className="h-10 rounded-md border border-border bg-card px-4 text-sm font-bold transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {request.status === "Under Packing" ? "Under packing" : "Move to packing"}
                                        </button>
                                        {request.status === "Under Packing" && <button
                                            type="button"
                                            onClick={() => openDispatchForm(request)}
                                            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90"
                                        >
                                            <Truck className="size-4" /> Dispatch
                                        </button>}
                                    </>
                                ) : canViewGatePass && request.status === "Dispatched" ? (
                                    <button
                                        type="button"
                                        onClick={() => showGatePass(request)}
                                        className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-bold transition hover:bg-muted"
                                    >
                                        View gate pass
                                    </button>
                                ) : !executiveDemo ? (
                                    <span className="text-sm text-muted-foreground">
                                        {request.status === "Approved" ? "Awaiting HR packing and dispatch" : request.status === "Under Packing" ? "HR is packing this request" : request.status === "Dispatched" ? "Awaiting Executive receipt acknowledgement" : "Request workflow"}
                                    </span>
                                ) : null}
                            </div>
                        </div>

                        {canManageFulfillment && revisingRequestId === request.id && (
                            <div className="border-t border-border bg-muted/25 p-5">
                                <RequestQuantityRevision
                                    request={request}
                                    onCancel={() => setRevisingRequestId("")}
                                    onSave={(materialItems) => saveRevisedQuantities(request, materialItems)}
                                />
                            </div>
                        )}

                        {canManageFulfillment && request.status === "Under Packing" && dispatchingId === request.id && (
                            <form onSubmit={(event) => generateGatePass(event, request)} className="border-t border-border bg-muted/25 p-5">
                                <div className="mb-4">
                                    <h3 className="font-bold">Dispatch details</h3>
                                    <p className="mt-1 text-xs text-muted-foreground">Choose the transport method and enter its details to generate a gate pass.</p>
                                </div>
                                <fieldset>
                                    <legend className="mb-2 text-sm font-semibold">Transport method</legend>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {["Vehicle", "Courier"].map((method) => (
                                            <label key={method} className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm font-semibold ${transportType === method ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                                                <input type="radio" name={`transport-${request.id}`} value={method} checked={transportType === method} onChange={() => setTransportType(method)} />
                                                {method}
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                                {transportType === "Vehicle" ? (
                                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                        <label className="space-y-2 text-sm font-semibold">
                                            Vehicle number
                                            <input required value={vehicleNumber} onChange={(event) => setVehicleNumber(event.target.value)} placeholder="e.g. AP 09 AB 1234" className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                                        </label>
                                        <label className="space-y-2 text-sm font-semibold">
                                            Driver name
                                            <input value={driverName} onChange={(event) => setDriverName(event.target.value)} placeholder="Optional" className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                                        </label>
                                    </div>
                                ) : (
                                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                        <label className="space-y-2 text-sm font-semibold">
                                            Courier company
                                            <input required value={courierCompany} onChange={(event) => setCourierCompany(event.target.value)} placeholder="e.g. Sample Express" className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                                        </label>
                                        <label className="space-y-2 text-sm font-semibold">
                                            Tracking / consignment number
                                            <input required value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} placeholder="Enter tracking number" className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                                        </label>
                                    </div>
                                )}
                                <div className="mt-5 flex flex-wrap gap-2">
                                    <button type="submit" className="h-10 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90">Generate gate pass PDF</button>
                                    <button type="button" onClick={() => setDispatchingId("")} className="h-10 rounded-md border border-border bg-card px-4 text-sm font-bold hover:bg-muted">Cancel</button>
                                </div>
                            </form>
                        )}
                    </article>
                ))}
                {approvals.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border bg-card px-5 py-12 text-center">
                        <PackageCheck className="mx-auto size-8 text-muted-foreground" />
                        <h2 className="mt-3 font-bold">{executiveDemo ? "No requests yet" : "No approved requests yet"}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{executiveDemo ? "Create a request to follow its approval status here." : "Approve a request to add it to this workflow."}</p>
                    </div>
                )}
            </section>

            {gatePass && pdfUrl && (
                <section aria-labelledby="gate-pass-heading" className="mt-8 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-5">
                        <div>
                            <p className="text-xs font-bold uppercase text-primary">Generated document</p>
                            <h2 id="gate-pass-heading" className="mt-1 text-xl font-extrabold">Gate pass · {gatePass.gatePassNumber}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">{gatePass.id} · {gatePass.requester} · {gatePass.region}</p>
                        </div>
                        <a
                            href={pdfUrl}
                            download={`${gatePass.gatePassNumber}.pdf`}
                            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90"
                        >
                            <Download className="size-4" /> Download PDF
                        </a>
                    </div>
                    <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(360px,1.2fr)]">
                        <dl className="grid content-start gap-3 sm:grid-cols-2">
                            {[
                                ["Request", gatePass.id],
                                ["Requester", gatePass.requester],
                                ["Destination", gatePass.region],
                                ["Material / quantity", formatRequestMaterials(gatePass)],
                                ["Transport", gatePass.transportType],
                                ...(gatePass.transportType === "Vehicle"
                                    ? [["Vehicle number", gatePass.vehicleNumber], ["Driver", gatePass.driverName || "Not provided"]]
                                    : [["Courier", gatePass.courierCompany], ["Tracking number", gatePass.trackingNumber]]),
                                ["Dispatch date", gatePass.dispatchedAt],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-md border border-border p-3">
                                    <dt className="text-[11px] font-bold uppercase text-muted-foreground">{label}</dt>
                                    <dd className="mt-1 break-words text-sm font-semibold">{value}</dd>
                                </div>
                            ))}
                        </dl>
                        <article aria-label="Gate pass document preview" className="rounded-md border border-border bg-white p-6 text-slate-900 shadow-sm sm:p-9">
                            <div className="border-t-4 border-blue-800 pt-5">
                                <p className="text-xl font-extrabold tracking-wide text-blue-900">GROWEL PROMOTIONAL</p>
                                <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Material gate pass</p>
                            </div>
                            <div className="mt-6 flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                                <div><p className="text-xs text-slate-500">Gate pass number</p><p className="mt-1 font-bold">{gatePass.gatePassNumber}</p></div>
                                <div className="text-right"><p className="text-xs text-slate-500">Dispatch date</p><p className="mt-1 font-semibold">{gatePass.dispatchedAt}</p></div>
                            </div>
                            <dl className="mt-2">
                                {[
                                    ["Request ID", gatePass.id],
                                    ["Requester", gatePass.requester],
                                    ["Role", gatePass.role],
                                    ["Destination", gatePass.region],
                                    ["Material", gatePass.material],
                                    ["Quantity", `${gatePass.items} units`],
                                    ["Request date", gatePass.date],
                                    ["Transport method", gatePass.transportType],
                                    ...(gatePass.transportType === "Vehicle"
                                        ? [["Vehicle number", gatePass.vehicleNumber], ["Driver", gatePass.driverName || "Not provided"]]
                                        : [["Courier company", gatePass.courierCompany], ["Tracking number", gatePass.trackingNumber]]),
                                ].map(([label, value]) => (
                                    <div key={label} className="grid grid-cols-[minmax(120px,0.8fr)_1.2fr] gap-3 border-b border-slate-100 py-2.5 text-sm">
                                        <dt className="text-slate-500">{label}</dt>
                                        <dd className="break-words font-semibold">{value}</dd>
                                    </div>
                                ))}
                            </dl>
                            <div className="mt-12 grid grid-cols-2 gap-10 text-center text-xs text-slate-500">
                                <div className="border-t border-slate-300 pt-2">Authorized by</div>
                                <div className="border-t border-slate-300 pt-2">Security signature</div>
                            </div>
                            <p className="mt-8 text-center text-[10px] text-slate-400">Sample gate pass · For demonstration only</p>
                        </article>
                    </div>
                </section>
            )}
        </AppShell>
    );
}
