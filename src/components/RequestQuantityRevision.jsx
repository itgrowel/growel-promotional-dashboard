import { useState } from "react";
import { getRequestMaterialItems } from "@/lib/sample-operations";

export function RequestQuantityRevision({ request, onCancel, onSave }) {
    const [quantities, setQuantities] = useState(() =>
        getRequestMaterialItems(request).map((item) => String(item.items)),
    );
    const [errorMessage, setErrorMessage] = useState("");

    function submitRevision(event) {
        event.preventDefault();
        setErrorMessage("");
        try {
            const materialItems = getRequestMaterialItems(request).map((item, index) => {
                const quantity = Number(quantities[index]);
                if (!Number.isInteger(quantity) || quantity < 1) {
                    throw new Error(`Enter a whole-number quantity of at least 1 for ${item.material}.`);
                }
                return { ...item, items: quantity };
            });
            onSave(materialItems);
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "The revised quantities could not be saved.");
        }
    }

    return (
        <form onSubmit={submitRevision} className="space-y-4">
            <fieldset className="space-y-3">
                <legend className="text-sm font-bold">Revise requested quantities</legend>
                {getRequestMaterialItems(request).map((item, index) => (
                    <label key={`${item.material}-${index}`} className="grid items-center gap-3 text-sm font-semibold sm:grid-cols-[minmax(0,1fr)_10rem]">
                        <span>{item.material} <span className="font-normal text-muted-foreground">({item.unit || "units"})</span></span>
                        <input
                            aria-label={`Revised quantity for ${item.material}`}
                            type="number"
                            min="1"
                            step="1"
                            required
                            value={quantities[index]}
                            onChange={(event) => setQuantities((current) => current.map((quantity, quantityIndex) =>
                                quantityIndex === index ? event.target.value : quantity,
                            ))}
                            className="h-10 w-full rounded-md border border-input bg-card px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                        />
                    </label>
                ))}
            </fieldset>
            {errorMessage && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm font-semibold text-destructive">{errorMessage}</p>}
            <div className="flex flex-wrap gap-2">
                <button type="submit" className="h-10 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90">Save revised quantities</button>
                <button type="button" onClick={onCancel} className="h-10 rounded-md border border-border bg-card px-4 text-sm font-bold hover:bg-muted">Cancel</button>
            </div>
        </form>
    );
}
