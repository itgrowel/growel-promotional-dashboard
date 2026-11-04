import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ChevronRight, CircleCheck, ClipboardCheck, Clock3, PackageCheck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, } from "recharts";
import { AppShell } from "@/components/AppShell";
import { getCurrentRole, getSqlUser } from "@/lib/local-demo-auth";
import { getLocalDemoPermission, useLocalDemoPermission } from "@/lib/local-demo-permissions";
import { getMaterialIcon } from "@/lib/material-icons";
import { formatRequestMaterials, useSampleMaterials, useSampleRequests } from "@/lib/sample-operations";
export const Route = createFileRoute("/_authenticated/")({
    beforeLoad: () => {
        const role = getCurrentRole();
        if (role && !getLocalDemoPermission(role, "viewDashboard")) {
            throw redirect({
                to: getLocalDemoPermission(role, "createRequests") || getLocalDemoPermission(role, "approveRequests")
                    ? "/requests"
                    : "/approvals",
            });
        }
    },
    head: () => ({
        meta: [
            { title: "Dashboard — Growel Promotional" },
            { name: "description", content: "Monitor inventory value, issued materials, approvals, and stock alerts." },
            { property: "og:title", content: "Dashboard — Growel Promotional" },
            { property: "og:description", content: "A clear operational view of inventory, approvals, and stock levels." },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary_large_image" },
        ],
    }),
    component: Index,
});

function formatCurrency(value) {
    return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function createMonthlyDashboardData(requests, canViewValues) {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, index) => {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
        return {
            key: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`,
            month: monthDate.toLocaleDateString("en-IN", { month: "short" }),
            requested: 0,
            dispatched: 0,
        };
    });
    const monthsByKey = new Map(months.map((month) => [month.key, month]));

    for (const request of requests) {
        const date = new Date(request.date);
        if (Number.isNaN(date.getTime())) continue;
        const month = monthsByKey.get(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
        if (!month) continue;
        const amount = canViewValues ? Number(request.value || 0) : 1;
        month.requested += amount;
        if (["Dispatched", "Received"].includes(request.status)) month.dispatched += amount;
    }

    return months;
}

function Index() {
    const requests = useSampleRequests();
    const materials = useSampleMaterials();
    const localDemoRole = getCurrentRole();
    if (localDemoRole === "executive") {
        const executiveRequests = requests.filter((request) => request.createdByRole === "executive" || request.role === "Executive");
        return <ExecutiveDashboard requests={executiveRequests} />;
    }
    if (["rm", "avp", "gm"].includes(localDemoRole)) {
        return <ManagerDashboard requests={requests} role={localDemoRole} />;
    }
    const canViewValues = ["admin", "hr"].includes(localDemoRole);
    const pendingApprovals = requests.filter((request) => ["Approved", "Under Packing"].includes(request.status));
    const lowStockMaterials = materials.filter((material) => material.stock <= material.minimum);
    const inventoryValue = materials.reduce((total, material) => total + material.stock * Number(material.unitValue || 0), 0);
    const issuedValue = requests
        .filter((request) => ["Dispatched", "Received"].includes(request.status))
        .reduce((total, request) => total + Number(request.value || 0), 0);
    const chartData = createMonthlyDashboardData(requests, canViewValues);
    const metrics = [
        canViewValues
            ? { label: "Inventory value", value: formatCurrency(inventoryValue), note: "Remaining stock × unit value", tone: "positive" }
            : { label: "Units in stock", value: materials.reduce((total, material) => total + material.stock, 0).toLocaleString("en-IN"), note: `${materials.length} materials`, tone: "positive" },
        canViewValues
            ? { label: "Issued value", value: formatCurrency(issuedValue), note: "Dispatched or received requests", tone: "neutral" }
            : { label: "Total requests", value: String(requests.length), note: "Requests available to your role", tone: "neutral" },
        { label: "Pending approvals", value: String(requests.filter((request) => ["Pending Approval", "Revised"].includes(request.status)).length), note: "Awaiting manager review", tone: "warning" },
        { label: "Low stock items", value: String(lowStockMaterials.length), note: `${lowStockMaterials.filter((material) => material.stock === 0).length} out of stock`, tone: "danger" },
    ];
    const displayName = getSqlUser()?.displayName || (localDemoRole ? `${localDemoRole[0].toUpperCase()}${localDemoRole.slice(1)}` : "Team");
    return (<AppShell>
      <div className="mb-6">
        <p className="text-xs font-bold uppercase text-primary">Overview</p>
        <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Good morning, {displayName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Live inventory and request activity from your workspace.</p>
      </div>

      <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (<article key={metric.label} className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase text-muted-foreground">{metric.label}</p>
            <p className="mt-3 text-2xl font-extrabold md:text-[28px]">{metric.value}</p>
            <p className={`mt-2 text-xs font-semibold ${metric.tone === "positive" ? "text-success" : metric.tone === "warning" ? "text-warning" : metric.tone === "danger" ? "text-destructive" : "text-muted-foreground"}`}>{metric.note}</p>
          </article>))}
      </section>

      <section className="mt-5 rounded-lg border border-border bg-card p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-base font-bold">{canViewValues ? "Request Value vs Dispatched Value" : "Requests vs Dispatched Requests"}</h2><p className="mt-1 text-xs text-muted-foreground">Monthly activity · last 6 months</p></div>
          <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground">
            <span className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-chart-procurement"/>{canViewValues ? "Request value" : "Requests"}</span>
            <span className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-chart-issuance"/>{canViewValues ? "Dispatched value" : "Dispatched"}</span>
          </div>
        </div>
        <div className="mt-6 h-64 w-full md:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={5}>
              <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="4 4"/>
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} dy={10}/>
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(value) => canViewValues ? `₹${value / 1000}k` : value} width={48}/>
              <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ borderColor: "var(--border)", borderRadius: "8px", fontSize: "12px" }} formatter={(value) => [canViewValues ? formatCurrency(Number(value)) : Number(value), ""]}/>
              <Bar dataKey="requested" name={canViewValues ? "Request value" : "Requests"} fill="var(--chart-procurement)" radius={[4, 4, 0, 0]}/>
              <Bar dataKey="dispatched" name={canViewValues ? "Dispatched value" : "Dispatched"} fill="var(--chart-issuance)" radius={[4, 4, 0, 0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between"><div><h2 className="text-base font-bold">Pending Approvals</h2><p className="mt-1 text-xs text-muted-foreground">Approved requests waiting for packing or dispatch</p></div><Link to="/approvals" className="flex items-center gap-1 text-xs font-bold text-primary hover:underline">View all <ChevronRight className="size-4"/></Link></div>
          <div className="mt-5 space-y-3">
            {pendingApprovals.slice(0, 3).map((request) => (<Link to="/approvals" key={request.id} className="flex w-full items-center gap-3 rounded-md border border-border bg-muted/45 p-3.5 text-left transition hover:border-primary/30 hover:bg-secondary">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-secondary text-primary"><ClipboardCheck className="size-4"/></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{request.id}</span><span className="block truncate text-xs text-muted-foreground">Area: {request.region} · {request.status}</span></span>
                {canViewValues && <span className="text-sm font-bold">{formatCurrency(Number(request.value || 0))}</span>}<ChevronRight className="size-4 text-muted-foreground"/>
              </Link>))}
            {pendingApprovals.length === 0 && <p className="rounded-md bg-muted/45 p-4 text-sm text-muted-foreground">No requests are waiting in the approval workflow.</p>}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between"><div><h2 className="text-base font-bold">Stock Alerts</h2><p className="mt-1 text-xs text-muted-foreground">Items at or below minimum level</p></div><Link to="/materials" className="flex items-center gap-1 text-xs font-bold text-primary hover:underline">View all <ChevronRight className="size-4"/></Link></div>
          <div className="mt-5 space-y-3">
            {lowStockMaterials.slice(0, 3).map((material) => {
                const MaterialIcon = getMaterialIcon(material);
                return (<div key={material.id} className={`flex items-center gap-3 rounded-md border border-border p-3.5 ${material.stock === 0 ? "bg-danger-soft" : "bg-warning-soft"}`}><span className={`grid size-9 shrink-0 place-items-center rounded-md bg-card ${material.stock === 0 ? "text-destructive" : "text-warning"}`}><MaterialIcon className="size-4" aria-hidden="true"/></span><span className="flex-1"><span className="block text-sm font-bold">{material.name}</span><span className="text-xs text-muted-foreground">{material.stock} {material.unit} · Minimum: {material.minimum}</span></span><span className={`rounded-full bg-card px-2.5 py-1 text-[10px] font-bold ${material.stock === 0 ? "text-destructive" : "text-warning"}`}>{material.stock === 0 ? "Out of stock" : "Low stock"}</span></div>);
            })}
            {lowStockMaterials.length === 0 && <p className="rounded-md bg-muted/45 p-4 text-sm text-muted-foreground">No materials are at or below their minimum stock level.</p>}
          </div>
        </section>
      </div>
    </AppShell>);
}

function ManagerDashboard({ requests, role }) {
    const needsReview = requests.filter((request) => ["Pending Approval", "Revised"].includes(request.status));
    const inFulfillment = requests.filter((request) => ["Approved", "Under Packing"].includes(request.status));
    const dispatched = requests.filter((request) => ["Dispatched", "Received"].includes(request.status));
    const roleLabel = { rm: "Regional Manager", avp: "Assistant Vice President", gm: "General Manager" }[role];

    return (
        <AppShell>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-bold uppercase text-primary">Manager workspace · {role.toUpperCase()}</p>
                    <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">{roleLabel} dashboard</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Review request progress and follow the approval-to-dispatch workflow.</p>
                </div>
                <Link to="/requests" className="inline-flex h-10 items-center gap-2 rounded-md bg-success px-4 text-sm font-bold text-white transition hover:brightness-95">
                    View requests <ChevronRight className="size-4" />
                </Link>
            </div>

            <section aria-label="Request workflow summary" className="grid gap-4 sm:grid-cols-3">
                {[
                    { label: "Needs review", value: needsReview.length, note: "Pending approval or revision", icon: Clock3, tone: "text-warning" },
                    { label: "In fulfillment", value: inFulfillment.length, note: "Approved or being packed", icon: ClipboardCheck, tone: "text-primary" },
                    { label: "Dispatched / received", value: dispatched.length, note: "Delivery progress", icon: CircleCheck, tone: "text-success" },
                ].map((metric) => {
                    const Icon = metric.icon;
                    return (
                        <article key={metric.label} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-bold uppercase text-muted-foreground">{metric.label}</p>
                                <Icon className={`size-5 ${metric.tone}`} aria-hidden="true" />
                            </div>
                            <p className="mt-3 text-2xl font-extrabold">{metric.value}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>
                        </article>
                    );
                })}
            </section>

            <section aria-label="Requests needing review" className="mt-5 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
                    <div>
                        <h2 className="font-bold">Requests needing review</h2>
                        <p className="mt-1 text-xs text-muted-foreground">Requests currently pending approval or returned for revision.</p>
                    </div>
                    <Link to="/requests" className="text-xs font-bold text-primary hover:underline">Open request register</Link>
                </div>
                <div className="divide-y divide-border">
                    {needsReview.slice(0, 5).map((request) => (
                        <article key={request.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-secondary text-primary">
                                    <ClipboardCheck className="size-4" aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                    <p className="font-bold">{request.id} <span className="ml-2 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{request.status}</span></p>
                                    <p className="mt-1 truncate text-sm text-muted-foreground">{request.requester} · {request.region} · {formatRequestMaterials(request)}</p>
                                </div>
                            </div>
                            <Link to="/requests" className="text-sm font-bold text-primary hover:underline">Review requests</Link>
                        </article>
                    ))}
                    {needsReview.length === 0 && (
                        <p className="p-5 text-sm text-muted-foreground">No requests are waiting for review.</p>
                    )}
                </div>
                <div className="border-t border-border bg-muted/30 px-5 py-3">
                    <Link to="/approvals" className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
                        Track packing and dispatch <ChevronRight className="size-4" />
                    </Link>
                </div>
            </section>
        </AppShell>
    );
}

function ExecutiveDashboard({ requests }) {
    const canCreateRequests = useLocalDemoPermission(getCurrentRole(), "createRequests");
    const inProgressCount = requests.filter((request) => !["Received", "Dispatched"].includes(request.status)).length;
    const dispatchedCount = requests.filter((request) => request.status === "Dispatched").length;

    return (
        <AppShell>
            <div className="mb-6">
                <p className="text-xs font-bold uppercase text-primary">Executive workspace</p>
                <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">My dashboard</h1>
                <p className="mt-1 text-sm text-muted-foreground">Create material requests and track their approval and delivery status.</p>
            </div>
            <div className="mb-5 grid gap-4 sm:grid-cols-3">
                <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase text-muted-foreground">My requests</p>
                    <p className="mt-3 text-2xl font-extrabold">{requests.length}</p>
                </article>
                <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase text-muted-foreground">In progress</p>
                    <p className="mt-3 text-2xl font-extrabold">{inProgressCount}</p>
                </article>
                <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Dispatched</p>
                    <p className="mt-3 text-2xl font-extrabold">{dispatchedCount}</p>
                </article>
            </div>
            <section aria-label="My requests and approval status" className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
                    <div>
                        <h2 className="font-bold">Request status</h2>
                        <p className="mt-1 text-xs text-muted-foreground">Your request and delivery progress</p>
                    </div>
                    {canCreateRequests && <Link to="/requests" className="inline-flex h-10 items-center gap-2 rounded-md bg-success px-4 text-sm font-bold text-white transition hover:brightness-95">
                        Create request <ChevronRight className="size-4" />
                    </Link>}
                </div>
                <div className="divide-y divide-border">
                    {requests.map((request) => (
                        <article key={request.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                                    <ClipboardCheck className="size-5" aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                    <p className="font-bold">{request.id} <span className="ml-2 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{request.status}</span></p>
                                    <p className="mt-1 truncate text-sm text-muted-foreground">{formatRequestMaterials(request)} · {request.region}</p>
                                </div>
                            </div>
                            {request.status === "Received" ? (
                                <span className="text-sm font-semibold text-success">Received {request.receivedAt ? `· ${request.receivedAt}` : ""}</span>
                            ) : request.status === "Dispatched" ? (
                                <Link to="/approvals" className="inline-flex h-10 items-center gap-2 rounded-md bg-success px-4 text-sm font-bold text-white transition hover:brightness-95">
                                    Acknowledge in Approvals <PackageCheck className="size-4" />
                                </Link>
                            ) : request.status === "Approved" ? (
                                <span className="text-sm text-muted-foreground">Manager approved · awaiting HR</span>
                            ) : request.status === "Under Packing" ? (
                                <span className="text-sm text-muted-foreground">HR is packing this request</span>
                            ) : (
                                <span className="text-sm text-muted-foreground">{request.status === "Revised" ? "Needs updates before manager review" : "Awaiting manager approval"}</span>
                            )}
                        </article>
                    ))}
                    {requests.length === 0 && (
                        <div className="px-5 py-12 text-center">
                            <p className="font-semibold">No requests yet</p>
                            <p className="mt-1 text-sm text-muted-foreground">Create a request to track its approval and delivery here.</p>
                        </div>
                    )}
                </div>
            </section>
        </AppShell>
    );
}
