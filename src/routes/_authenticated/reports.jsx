import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { getCurrentRole } from "@/lib/local-demo-auth";
import { downloadReportExcel, downloadReportPdf } from "@/lib/report-exports";
import { isSqlSession } from "@/lib/sql-api";
import { useSampleRequests } from "@/lib/sample-operations";

export const Route = createFileRoute("/_authenticated/reports")({
    beforeLoad: () => {
        if (getCurrentRole() === "executive") throw redirect({ to: "/" });
    },
    head: () => ({
        meta: [
            { title: "Reports — Growel Promotional" },
            { name: "description", content: "Review sample procurement and fulfillment reports." },
            { property: "robots", content: "noindex, nofollow" },
        ],
    }),
    component: ReportsPage,
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STATUS_COLORS = ["var(--warning)", "var(--chart-procurement)", "var(--success)", "var(--chart-issuance)"];

function getRequestDate(request) {
    const date = new Date(request.date);
    return Number.isNaN(date.getTime()) ? null : date;
}

function ReportsPage() {
    const requests = useSampleRequests();
    const role = getCurrentRole();
    const liveSqlReport = isSqlSession();
    const canViewValues = ["admin", "hr"].includes(role);
    const [selectedYear, setSelectedYear] = useState("all");
    const [exporting, setExporting] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const years = [...new Set(requests.map((request) => getRequestDate(request)?.getFullYear()).filter(Boolean))]
        .sort((first, second) => second - first);
    const filteredRequests = useMemo(
        () => selectedYear === "all"
            ? requests
            : requests.filter((request) => getRequestDate(request)?.getFullYear() === Number(selectedYear)),
        [requests, selectedYear],
    );
    const totalValue = filteredRequests.reduce((sum, request) => sum + Number(request.value || 0), 0);
    const dispatchedCount = filteredRequests.filter((request) => request.status === "Dispatched" || request.status === "Received").length;
    const workflowStatuses = ["Pending Approval", "Approved", "Under Packing", "Dispatched"];
    const statusData = workflowStatuses
        .map((status) => ({ status, count: filteredRequests.filter((request) => request.status === status).length }))
        .filter((entry) => entry.count > 0);
    const regions = [...new Set(filteredRequests.map((request) => request.region))];
    const regionalData = regions.map((region) => {
        const regionalRequests = filteredRequests.filter((request) => request.region === region);
        return {
            region,
            requests: regionalRequests.length,
            value: regionalRequests.reduce((sum, request) => sum + Number(request.value || 0), 0),
        };
    });
    const monthlyData = MONTHS.map((month, monthIndex) => {
        const monthlyRequests = filteredRequests.filter((request) => getRequestDate(request)?.getMonth() === monthIndex);
        return {
            month,
            requests: monthlyRequests.length,
            procurement: monthlyRequests.reduce((sum, request) => sum + Number(request.value || 0), 0),
            issuance: monthlyRequests
                .filter((request) => request.status === "Dispatched" || request.status === "Received")
                .reduce((sum, request) => sum + Number(request.value || 0), 0),
        };
    });

    async function exportReport(format) {
        setErrorMessage("");
        setExporting(format);
        try {
            const fileYear = selectedYear === "all" ? "all-years" : selectedYear;
            if (format === "excel") {
                downloadReportExcel(filteredRequests, regionalData, fileYear, canViewValues);
            }
            else {
                await downloadReportPdf(filteredRequests, fileYear, canViewValues);
            }
        }
        catch (error) {
            console.error(`Could not export the ${format} report.`, error);
            setErrorMessage(`Could not create the ${format.toUpperCase()} report. Please try again.`);
        }
        finally {
            setExporting("");
        }
    }

    return (
        <AppShell>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-bold uppercase text-primary">Insights</p>
                    <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Reports</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{liveSqlReport ? "Procurement and fulfillment activity." : "Sample procurement and fulfillment activity."}</p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                    <label className="space-y-1 text-xs font-bold uppercase text-muted-foreground">Report year
                        <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)} className="block h-10 min-w-32 rounded-md border border-input bg-card px-3 text-sm font-medium normal-case text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                            <option value="all">All years</option>
                            {years.map((year) => <option key={year} value={year}>{year}</option>)}
                        </select>
                    </label>
                    <button type="button" onClick={() => void exportReport("excel")} disabled={exporting !== ""} className="h-10 rounded-md border border-border bg-card px-3 text-sm font-bold transition hover:bg-muted disabled:opacity-50">
                        {exporting === "excel" ? "Preparing..." : "Download Excel"}
                    </button>
                    <button type="button" onClick={() => void exportReport("pdf")} disabled={exporting !== ""} className="h-10 rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                        {exporting === "pdf" ? "Preparing..." : "Download PDF"}
                    </button>
                </div>
            </div>
            {errorMessage && <p role="alert" className="mb-4 rounded-md bg-danger-soft px-4 py-3 text-sm font-semibold text-destructive">{errorMessage}</p>}
            <aside role="note" className="mb-5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                {liveSqlReport
                    ? <><span className="font-bold text-primary">Live report.</span>{" "}Figures use requests loaded from SQL Server.</>
                    : <><span className="font-bold text-primary">Sample report.</span>{" "}Figures use fictional records from this browser and are for testing only.</>}{" "}
                Downloads include the selected year.
            </aside>

            <section aria-label="Report summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                    [liveSqlReport ? "Requests" : "Sample requests", filteredRequests.length, "Across all workflow stages"],
                    ...(canViewValues ? [["Request value", `₹${totalValue.toLocaleString("en-IN")}`, "Sample requested value"]] : []),
                    ["Dispatched", dispatchedCount, "Requests dispatched or received"],
                    ["Approval queue", filteredRequests.filter((request) => request.status === "Approved" || request.status === "Under Packing").length, "Awaiting pack or dispatch"],
                ].map(([label, value, note]) => (
                    <article key={label} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                        <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
                        <p className="mt-3 text-2xl font-extrabold">{value}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{note}</p>
                    </article>
                ))}
            </section>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
                <section aria-labelledby="monthly-report-title" className="rounded-lg border border-border bg-card p-5 shadow-sm">
                    <h2 id="monthly-report-title" className="font-bold">{canViewValues ? "Monthly procurement vs issuance" : "Monthly requests"}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Based on the selected year</p>
                    <div className="mt-5 h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={monthlyData} barGap={5}>
                                <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="4 4" />
                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(value) => canViewValues ? `₹${value / 1000}k` : value} width={48} />
                                <Tooltip formatter={(value, name) => [canViewValues ? `₹${Number(value).toLocaleString("en-IN")}` : value, name]} />
                                {canViewValues ? <>
                                    <Bar dataKey="procurement" name="Requested" fill="var(--chart-procurement)" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="issuance" name="Dispatched / received" fill="var(--chart-issuance)" radius={[4, 4, 0, 0]} />
                                </> : <Bar dataKey="requests" name="Requests" fill="var(--chart-procurement)" radius={[4, 4, 0, 0]} />}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                <section aria-labelledby="status-report-title" className="rounded-lg border border-border bg-card p-5 shadow-sm">
                    <h2 id="status-report-title" className="font-bold">Requests by status</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Counts for the selected year</p>
                    <div className="mt-5 grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                        <div className="h-60">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={statusData} dataKey="count" nameKey="status" innerRadius={58} outerRadius={88} paddingAngle={3}>
                                        {statusData.map((entry, index) => <Cell key={entry.status} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <ul className="space-y-3">
                            {statusData.map((entry, index) => (
                                <li key={entry.status} className="flex items-center justify-between gap-3 text-sm">
                                    <span className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ backgroundColor: STATUS_COLORS[index % STATUS_COLORS.length] }} />{entry.status}</span>
                                    <span className="font-bold">{entry.count}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>
            </div>

            <section aria-labelledby="regional-report-title" className="mt-5 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <div className="border-b border-border p-5">
                    <h2 id="regional-report-title" className="font-bold">Regional request summary</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Aggregated request totals by destination for the selected year</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[400px] text-left text-sm">
                        <thead><tr className="border-b border-border bg-muted/60">
                            {["Region", "Requests", ...(canViewValues ? ["Request value"] : [])].map((item) => <th key={item} className="px-5 py-3 text-[11px] font-bold uppercase text-muted-foreground">{item}</th>)}
                        </tr></thead>
                        <tbody>{regionalData.map((region) => (
                            <tr key={region.region} className="border-b border-border last:border-0">
                                <td className="px-5 py-4 font-semibold">{region.region}</td>
                                <td className="px-5 py-4">{region.requests}</td>
                                {canViewValues && <td className="px-5 py-4 font-semibold">₹{region.value.toLocaleString("en-IN")}</td>}
                            </tr>
                        ))}</tbody>
                    </table>
                    {regionalData.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted-foreground">No requests found for the selected year.</p>}
                </div>
            </section>
        </AppShell>
    );
}
