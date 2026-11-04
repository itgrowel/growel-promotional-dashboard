import { createFileRoute, redirect } from "@tanstack/react-router";
import { PackageOpen, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { getCurrentRole } from "@/lib/local-demo-auth";
import { getLocalDemoPermission } from "@/lib/local-demo-permissions";
import { getMaterialIcon } from "@/lib/material-icons";
import { addSampleMaterial, deleteSampleMaterial, updateSampleMaterial, useSampleMaterials } from "@/lib/sample-operations";

const MATERIAL_OPTIONS = [
    { name: "Pens", category: "Stationery" },
    { name: "Keychains", category: "Accessories" },
    { name: "Brochures", category: "Printed Materials" },
    { name: "T-Shirts", category: "Apparel" },
    { name: "Umbrellas", category: "Utility Items" },
];
const BROCHURE_LANGUAGES = ["Hindi", "English", "Bengali", "Marathi"];

export const Route = createFileRoute("/_authenticated/materials")({
    validateSearch: (search) => ({ q: typeof search.q === "string" ? search.q : "" }),
    beforeLoad: () => {
        const role = getCurrentRole();
        if (role && !getLocalDemoPermission(role, "manageMaterials")) throw redirect({ to: "/" });
    },
    head: () => ({
        meta: [
            { title: "Materials — Growel Promotional" },
            { name: "description", content: "Browse sample promotional materials and stock levels." },
            { property: "robots", content: "noindex, nofollow" },
        ],
    }),
    component: MaterialsPage,
});

function MaterialsPage() {
    const { q } = Route.useSearch();
    const materials = useSampleMaterials();
    const canViewValues = ["admin", "hr"].includes(getCurrentRole());
    const [search, setSearch] = useState(q);
    const [showForm, setShowForm] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [materialPreset, setMaterialPreset] = useState("custom");
    const [editingMaterial, setEditingMaterial] = useState(null);
    useEffect(() => setSearch(q), [q]);
    const filteredMaterials = useMemo(() => {
        const query = search.trim().toLowerCase();
        return query
            ? materials.filter((material) => [material.name, material.category, material.id].some((value) => value.toLowerCase().includes(query)))
            : materials;
    }, [materials, search]);
    const lowStockCount = materials.filter((material) => material.stock <= material.minimum).length;
    const inventoryValue = materials.reduce((total, material) => total + material.stock * Number(material.unitValue || 0), 0);

    async function handleSubmit(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        const selectedMaterial = MATERIAL_OPTIONS[Number(materialPreset)];
        const name = selectedMaterial?.name ?? formData.get("name").trim();
        const language = formData.get("language") || null;
        setErrorMessage("");
        try {
            const material = {
                name,
                category: selectedMaterial ? selectedMaterial.category : formData.get("category").trim(),
                language: name.toLowerCase() === "brochures" ? language : null,
                unit: formData.get("unit").trim(),
                stock: Number(formData.get("stock")),
                minimum: Number(formData.get("minimum")),
                ...(canViewValues ? { unitValue: Number(formData.get("unitValue")) } : {}),
            };
            if (material.name.toLowerCase() === "brochures" && !material.language) {
                throw new Error("Choose a language for brochures.");
            }
            await addSampleMaterial(material);
            form.reset();
            setMaterialPreset("custom");
            setShowForm(false);
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Could not save the material.");
        }
    }

    function startEditing(material) {
        setErrorMessage("");
        setEditingMaterial(material);
    }

    function cancelForm() {
        setMaterialPreset("custom");
        setEditingMaterial(null);
        setShowForm(false);
        setErrorMessage("");
    }

    async function handleDelete(material) {
        const label = material.language ? `${material.name} (${material.language})` : material.name;
        if (!window.confirm(`Delete ${label}? Materials used in request history cannot be deleted.`)) return;
        setErrorMessage("");
        try {
            await deleteSampleMaterial(material.id);
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Could not delete the material.");
        }
    }

    return (
        <AppShell>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div className="flex items-center gap-3">
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                        <PackageOpen className="size-7 stroke-[2.5]" aria-hidden="true" />
                    </span>
                    <div>
                    <p className="text-xs font-bold uppercase text-primary">Inventory</p>
                    <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Materials</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Sample promotional stock and reorder levels.</p>
                    </div>
                </div>
                <button type="button" onClick={() => showForm ? cancelForm() : (setErrorMessage(""), setMaterialPreset("custom"), setEditingMaterial(null), setShowForm(true))} aria-expanded={showForm} className="inline-flex h-10 items-center gap-2 rounded-md bg-success px-4 text-sm font-bold text-white transition hover:brightness-95">
                    {showForm ? <X className="size-4" /> : <Plus className="size-4" />}
                    {showForm ? "Cancel" : "Add material"}
                </button>
            </div>
            {errorMessage && !showForm && <p role="alert" className="mb-5 rounded-md bg-danger-soft px-4 py-3 text-sm font-semibold text-destructive">{errorMessage}</p>}
            <aside role="note" className="mb-5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                <span className="font-bold text-primary">Sample inventory.</span>{" "}
                Stock figures are fictional and are not connected to a warehouse.
            </aside>
            {showForm && (
                <form key="new-material" onSubmit={handleSubmit} className="mb-5 rounded-lg border border-border bg-card p-5 shadow-sm">
                    <h2 className="font-bold">Enter material details</h2>
                    {errorMessage && <p role="alert" className="mt-3 rounded-md bg-danger-soft px-4 py-3 text-sm font-semibold text-destructive">{errorMessage}</p>}
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <label className="space-y-2 text-sm font-semibold">Material type
                            <select value={materialPreset} onChange={(event) => setMaterialPreset(event.target.value)} className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                                <option value="custom">Other (custom)</option>
                                {MATERIAL_OPTIONS.map((material, index) => <option key={material.name} value={String(index)}>{material.name} — {material.category}</option>)}
                            </select>
                        </label>
                        {materialPreset === "custom" && <>
                            <label className="space-y-2 text-sm font-semibold">Custom material name
                                <input name="name" required maxLength={120} className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                            </label>
                            <label className="space-y-2 text-sm font-semibold">Custom category
                                <input name="category" required maxLength={80} placeholder="e.g. Accessories" className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                            </label>
                        </>}
                        {MATERIAL_OPTIONS[Number(materialPreset)]?.name === "Brochures" && (
                            <label className="space-y-2 text-sm font-semibold">Brochure language
                                <select name="language" required defaultValue="" className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                                    <option value="" disabled>Select a language</option>
                                    {BROCHURE_LANGUAGES.map((language) => <option key={language} value={language}>{language}</option>)}
                                </select>
                            </label>
                        )}
                        <label className="space-y-2 text-sm font-semibold">Unit
                            <input name="unit" required maxLength={20} placeholder="e.g. Nos, Set" className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                        </label>
                        <label className="space-y-2 text-sm font-semibold">In stock
                            <input name="stock" type="number" min="0" step="1" required className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                        </label>
                        <label className="space-y-2 text-sm font-semibold">Minimum stock
                            <input name="minimum" type="number" min="0" step="1" required className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                        </label>
                        {canViewValues && <label className="space-y-2 text-sm font-semibold">Unit value (₹)
                            <input name="unitValue" type="number" min="0" step="0.01" required className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                        </label>}
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <button type="submit" className="h-10 rounded-md bg-success px-4 text-sm font-bold text-white transition hover:brightness-95">Save material</button>
                        <button type="button" onClick={cancelForm} className="h-10 rounded-md border border-border bg-card px-4 text-sm font-bold hover:bg-muted">Cancel</button>
                    </div>
                </form>
            )}
            <section aria-label="Inventory summary" className={`mb-5 grid gap-4 ${canViewValues ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3"}`}>
                {[
                    ["Material types", materials.length],
                    ["Units in stock", materials.reduce((sum, material) => sum + material.stock, 0).toLocaleString("en-IN")],
                    ["Low / out of stock", lowStockCount],
                    ...(canViewValues ? [["Current inventory value", `₹${inventoryValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`]] : []),
                ].map(([label, value]) => (
                    <article key={label} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                        <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
                        <p className="mt-3 text-2xl font-extrabold">{value}</p>
                    </article>
                ))}
            </section>
            <label className="relative block">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input aria-label="Search materials" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search materials or categories..." className="h-11 w-full rounded-md border border-input bg-card pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </label>
            <section aria-label="Sample materials" className="mt-5 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <div className="flex items-center gap-3 border-b border-border p-5">
                    <span className="grid size-9 place-items-center rounded-md bg-secondary text-primary"><PackageOpen className="size-5 stroke-[2.5]" aria-hidden="true" /></span>
                    <div><h2 className="font-bold">Material stock register</h2><p className="mt-1 text-xs text-muted-foreground">Stock value is calculated from remaining quantity × unit value.</p></div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                        <thead><tr className="border-b border-border bg-muted/60">{["Material", "Unit", "In stock", "Minimum", ...(canViewValues ? ["Unit value", "Stock value"] : []), "Stock status", "Actions"].map((heading) => <th key={heading} className="px-5 py-3.5 text-[11px] font-bold uppercase text-muted-foreground">{heading}</th>)}</tr></thead>
                        <tbody>{filteredMaterials.map((material) => {
                            const outOfStock = material.stock === 0;
                            const lowStock = material.stock <= material.minimum;
                            const MaterialIcon = getMaterialIcon(material);
                            return (
                                <Fragment key={material.id}>
                                <tr className="border-b border-border last:border-0">
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-secondary text-primary">
                                                <MaterialIcon className="size-5" aria-hidden="true" />
                                            </span>
                                            <span>
                                                <span className="block font-bold">{material.name} <span className="font-normal text-muted-foreground">· {material.category}</span></span>
                                                {material.language && <span className="block text-xs text-muted-foreground">{material.language}</span>}
                                                <span className="text-xs text-muted-foreground">{material.id}</span>
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4">{material.unit}</td>
                                    <td className={`px-5 py-4 font-bold ${lowStock ? "text-destructive" : ""}`}>{material.stock}</td>
                                    <td className="px-5 py-4">{material.minimum}</td>
                                    {canViewValues && <td className="px-5 py-4">₹{Number(material.unitValue || 0).toLocaleString("en-IN")}</td>}
                                    {canViewValues && <td className="px-5 py-4 font-semibold">₹{(material.stock * Number(material.unitValue || 0)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>}
                                    <td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${outOfStock ? "bg-danger-soft text-destructive" : lowStock ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}>{outOfStock ? "Out of stock" : lowStock ? "Low stock" : "In stock"}</span></td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-2">
                                            <button type="button" onClick={() => startEditing(material)} aria-label={`Edit ${material.name}`} title="Edit material" className="grid size-9 place-items-center rounded-md border border-border text-primary transition hover:bg-secondary">
                                                <Pencil className="size-4" aria-hidden="true" />
                                            </button>
                                            <button type="button" onClick={() => handleDelete(material)} aria-label={`Delete ${material.name}`} title="Delete material" className="grid size-9 place-items-center rounded-md border border-border text-destructive transition hover:bg-danger-soft">
                                                <Trash2 className="size-4" aria-hidden="true" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                {editingMaterial?.id === material.id && (
                                    <tr>
                                        <td colSpan={canViewValues ? 8 : 6} className="border-b border-border bg-muted/30 p-4 sm:p-5">
                                            <MaterialEditForm
                                                key={material.id}
                                                material={material}
                                                canViewValues={canViewValues}
                                                onCancel={() => setEditingMaterial(null)}
                                                onSave={async (updates) => {
                                                    await updateSampleMaterial(material.id, updates);
                                                    setEditingMaterial(null);
                                                }}
                                            />
                                        </td>
                                    </tr>
                                )}
                                </Fragment>
                            );
                        })}</tbody>
                    </table>
                    {filteredMaterials.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted-foreground">No sample materials match your search.</p>}
                </div>
            </section>
        </AppShell>
    );
}

function MaterialEditForm({ material, canViewValues, onCancel, onSave }) {
    const [errorMessage, setErrorMessage] = useState("");

    async function handleSubmit(event) {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const name = formData.get("name").trim();
        const language = formData.get("language") || null;
        if (name.toLowerCase() === "brochures" && !language) {
            setErrorMessage("Choose a language for brochures.");
            return;
        }

        setErrorMessage("");
        try {
            await onSave({
                name,
                category: formData.get("category").trim(),
                language: name.toLowerCase() === "brochures" ? language : null,
                unit: formData.get("unit").trim(),
                stock: Number(formData.get("stock")),
                minimum: Number(formData.get("minimum")),
                ...(canViewValues ? { unitValue: Number(formData.get("unitValue")) } : {}),
            });
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Could not update the material.");
        }
    }

    return (
        <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <h3 className="font-bold">Edit {material.name}</h3>
            {errorMessage && <p role="alert" className="mt-3 rounded-md bg-danger-soft px-4 py-3 text-sm font-semibold text-destructive">{errorMessage}</p>}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="space-y-2 text-sm font-semibold">Material name
                    <input name="name" required maxLength={120} defaultValue={material.name} className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </label>
                <label className="space-y-2 text-sm font-semibold">Category
                    <input name="category" required maxLength={80} defaultValue={material.category} className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </label>
                {material.name.toLowerCase() === "brochures" && (
                    <label className="space-y-2 text-sm font-semibold">Brochure language
                        <select name="language" required defaultValue={material.language || ""} className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                            <option value="" disabled>Select a language</option>
                            {BROCHURE_LANGUAGES.map((language) => <option key={language} value={language}>{language}</option>)}
                        </select>
                    </label>
                )}
                <label className="space-y-2 text-sm font-semibold">Unit
                    <input name="unit" required maxLength={20} defaultValue={material.unit} className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </label>
                <label className="space-y-2 text-sm font-semibold">In stock
                    <input name="stock" type="number" min="0" step="1" required defaultValue={material.stock} className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </label>
                <label className="space-y-2 text-sm font-semibold">Minimum stock
                    <input name="minimum" type="number" min="0" step="1" required defaultValue={material.minimum} className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </label>
                {canViewValues && <label className="space-y-2 text-sm font-semibold">Unit value (₹)
                    <input name="unitValue" type="number" min="0" step="0.01" required defaultValue={material.unitValue ?? 0} className="h-11 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </label>}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
                <button type="submit" className="h-10 rounded-md bg-success px-4 text-sm font-bold text-white transition hover:brightness-95">Save changes</button>
                <button type="button" onClick={onCancel} className="h-10 rounded-md border border-border bg-card px-4 text-sm font-bold hover:bg-muted">Cancel</button>
            </div>
        </form>
    );
}
