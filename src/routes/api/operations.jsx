import { createFileRoute } from "@tanstack/react-router";
import { apiErrorResponse, readJsonBody } from "@/server/api-response";
import { requireUser } from "@/server/sql-auth";
import { addEmployee, addMaterial, createRequest, deleteMaterial, listOperations, updateMaterial, updateRequest } from "@/server/sql-operations";

export const Route = createFileRoute("/api/operations")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                try {
                    const user = await requireUser(request);
                    const collection = new URL(request.url).searchParams.get("collection");
                    return Response.json(await listOperations(user, collection), { headers: { "Cache-Control": "no-store" } });
                }
                catch (error) {
                    return apiErrorResponse(error);
                }
            },
            POST: async ({ request }) => {
                try {
                    const user = await requireUser(request);
                    const body = await readJsonBody(request);
                    let result;
                    if (body.collection === "requests") result = await createRequest(user, body);
                    else if (body.collection === "materials") result = await addMaterial(user, body);
                    else if (body.collection === "employees") result = await addEmployee(user, body);
                    else throw new Error("Choose a valid operations collection.");
                    return Response.json(result, { status: 201 });
                }
                catch (error) {
                    return apiErrorResponse(error);
                }
            },
            PATCH: async ({ request }) => {
                try {
                    const user = await requireUser(request);
                    const body = await readJsonBody(request);
                    if (body.collection === "materials") {
                        if (typeof body.materialId !== "string" || !body.materialId) throw new Error("Material ID is required.");
                        return Response.json(await updateMaterial(user, body.materialId, body));
                    }
                    if (typeof body.requestId !== "string" || !body.requestId) throw new Error("Request ID is required.");
                    return Response.json(await updateRequest(user, body.requestId, body));
                }
                catch (error) {
                    return apiErrorResponse(error);
                }
            },
            DELETE: async ({ request }) => {
                try {
                    const user = await requireUser(request);
                    const url = new URL(request.url);
                    if (url.searchParams.get("collection") !== "materials") throw new Error("Choose a valid operations collection.");
                    const materialId = url.searchParams.get("materialId");
                    if (!materialId) throw new Error("Material ID is required.");
                    return Response.json(await deleteMaterial(user, materialId));
                }
                catch (error) {
                    return apiErrorResponse(error);
                }
            },
        },
    },
});
