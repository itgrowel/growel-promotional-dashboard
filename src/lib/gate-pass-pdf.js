import { getRequestMaterialItems } from "@/lib/sample-operations";

function pdfSafeText(value) {
    return String(value ?? "")
        .normalize("NFKD")
        .replace(/[^\x20-\x7E]/g, "")
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)")
        .slice(0, 100);
}

export function createGatePassPdf(request) {
    const materialItems = getRequestMaterialItems(request);
    const materialFields = materialItems.map((item, index) => [
        materialItems.length > 1 ? `Material ${index + 1}` : "Material",
        `${item.material} - ${item.items} ${item.unit || "units"}`,
    ]);
    const transportDetails = request.transportType === "Vehicle"
        ? [
            ["Vehicle number", request.vehicleNumber],
            ["Driver name", request.driverName || "Not provided"],
        ]
        : [
            ["Courier company", request.courierCompany],
            ["Tracking number", request.trackingNumber],
        ];
    const fields = [
        ["Gate pass number", request.gatePassNumber],
        ["Request ID", request.id],
        ["Requester", request.requester],
        ["Role", request.role],
        ["Destination", request.region],
        ...materialFields,
        ["Request date", request.date],
        ["Dispatch date", request.dispatchedAt],
        ["Transport type", request.transportType],
        ...transportDetails,
    ];
    const commands = [
        "0.12 0.32 0.25 rg",
        "50 728 512 2 re f",
        "0 0 0 rg",
        "BT /F1 23 Tf 50 752 Td (GROWEL PROMOTIONAL) Tj ET",
        "BT /F1 17 Tf 50 688 Td (MATERIAL GATE PASS) Tj ET",
        "BT /F1 10 Tf 50 667 Td (Sample document - for demonstration only) Tj ET",
    ];
    let y = 625;
    const rowSpacing = Math.min(36, 535 / Math.max(fields.length - 1, 1));
    for (const [label, value] of fields) {
        commands.push(`BT /F1 10 Tf 55 ${y} Td (${pdfSafeText(label)}) Tj ET`);
        commands.push(`BT /F1 11 Tf 245 ${y} Td (${pdfSafeText(value)}) Tj ET`);
        commands.push(`0.83 0.87 0.84 RG 55 ${y - 11} m 557 ${y - 11} l S`);
        y -= rowSpacing;
    }
    commands.push("BT /F1 9 Tf 50 54 Td (Authorized by: __________________________) Tj ET");
    commands.push("BT /F1 9 Tf 370 54 Td (Security: ____________________) Tj ET");
    const stream = commands.join("\n");
    const streamLength = new TextEncoder().encode(stream).length;
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`,
    ];

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (const [index, object] of objects.entries()) {
        offsets.push(new TextEncoder().encode(pdf).length);
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    }
    const xrefOffset = new TextEncoder().encode(pdf).length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets.slice(1)) {
        pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return new Blob([pdf], { type: "application/pdf" });
}
