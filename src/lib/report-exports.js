import { strToU8, zipSync } from "fflate";

function encodeZipFiles(files) {
    return Object.fromEntries(Object.entries(files).map(([name, value]) => [
        name,
        typeof value === "string" ? strToU8(value) : encodeZipFiles(value),
    ]));
}

function xmlEscape(value) {
    const text = [...String(value ?? "")]
        .filter((character) => {
            const code = character.charCodeAt(0);
            return code === 9 || code === 10 || code === 13 || code >= 32;
        })
        .join("");
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function columnName(index) {
    let name = "";
    let current = index;
    while (current > 0) {
        const remainder = (current - 1) % 26;
        name = String.fromCharCode(65 + remainder) + name;
        current = Math.floor((current - 1) / 26);
    }
    return name;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function worksheetXml(rows) {
    const sheetRows = rows.map((row, rowIndex) => {
        const cells = row.map((value, columnIndex) => {
            const reference = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
            if (typeof value === "number" && Number.isFinite(value)) {
                return `<c r="${reference}"><v>${value}</v></c>`;
            }
            return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
        }).join("");
        return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join("");
    const lastColumn = columnName(Math.max(1, ...rows.map((row) => row.length)));
    const lastRow = Math.max(1, rows.length);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${lastColumn}${lastRow}"/><sheetData>${sheetRows}</sheetData>
</worksheet>`;
}

function downloadXlsx(rows, regions, year, includeValue) {
    const requestHeaders = ["Request date", "Request ID", "Requester", "Role", "Region", "Materials", "Items", "Status"];
    if (includeValue) requestHeaders.push("Request value (INR)");
    const requestRows = rows.map((request) => {
        const result = [
            request.date,
            request.id,
            request.requester,
            request.role,
            request.region,
            request.material,
            request.items,
            request.status,
        ];
        if (includeValue) result.push(Number(request.value || 0));
        return result;
    });
    const workbookFiles = {
        "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
        "_rels": {
            ".rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
        },
        "xl": {
            "workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Requests" sheetId="1" r:id="rId1"/><sheet name="Regional summary" sheetId="2" r:id="rId2"/></sheets>
</workbook>`,
            "_rels": {
                "workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`,
            },
            "worksheets": {
                "sheet1.xml": worksheetXml([requestHeaders, ...requestRows]),
                "sheet2.xml": worksheetXml([
                    ["Region", "Request count", ...(includeValue ? ["Request value (INR)"] : [])],
                    ...regions.map((region) => [
                        region.region,
                        region.requests,
                        ...(includeValue ? [region.value] : []),
                    ]),
                ]),
            },
        },
    };
    const blob = new Blob([zipSync(encodeZipFiles(workbookFiles))], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    downloadBlob(blob, `growel-requests-${year}.xlsx`);
}

function downloadPdf(rows, year, includeValue) {
    return import("jspdf").then(({ jsPDF }) => {
        const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        const headers = ["Date", "Request ID", "Requester", "Role", "Region", "Materials", "Items", "Status"];
        if (includeValue) headers.push("Value (INR)");
        const records = rows.map((request) => {
            const record = [
                request.date,
                request.id,
                request.requester,
                request.role,
                request.region,
                request.material,
                String(request.items),
                request.status,
            ];
            if (includeValue) record.push(Number(request.value || 0).toLocaleString("en-IN"));
            return record;
        });
        const margin = 28;
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const tableWidth = pageWidth - margin * 2;
        const columnWidth = tableWidth / headers.length;
        const lineHeight = 8;
        let y;

        function drawHeader(isFirstPage) {
            if (isFirstPage) {
                pdf.setFontSize(16);
                pdf.text("Growel request report", margin, 30);
                pdf.setFontSize(9);
                pdf.text(`Year: ${year}  |  Filtered requests: ${rows.length}`, margin, 45);
                y = 66;
            }
            else {
                y = margin;
            }
            pdf.setFontSize(7);
            pdf.setFont("helvetica", "bold");
            headers.forEach((header, index) => pdf.text(header, margin + index * columnWidth + 2, y));
            y += 6;
            pdf.setLineWidth(0.5);
            pdf.line(margin, y, pageWidth - margin, y);
            y += 10;
            pdf.setFont("helvetica", "normal");
        }

        drawHeader(true);
        for (const record of records) {
            const wrapped = record.map((value) => pdf.splitTextToSize(String(value ?? ""), columnWidth - 5));
            const rowHeight = Math.max(12, ...wrapped.map((lines) => lines.length * lineHeight));
            if (y + rowHeight > pageHeight - margin) {
                pdf.addPage();
                drawHeader(false);
            }
            wrapped.forEach((lines, index) => pdf.text(lines, margin + index * columnWidth + 2, y));
            y += rowHeight + 4;
            pdf.setDrawColor(220);
            pdf.line(margin, y, pageWidth - margin, y);
            y += 5;
        }
        downloadBlob(pdf.output("blob"), `growel-requests-${year}.pdf`);
    });
}

export function downloadReportExcel(rows, regions, year, includeValue) {
    downloadXlsx(rows, regions, year, includeValue);
}

export function downloadReportPdf(rows, year, includeValue) {
    return downloadPdf(rows, year, includeValue);
}
