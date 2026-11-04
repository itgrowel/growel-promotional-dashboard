import { createFileRoute } from "@tanstack/react-router";
import { apiErrorResponse, readJsonBody } from "@/server/api-response";
import { requireUser } from "@/server/sql-auth";
import { updateEmployeeSettings } from "@/server/sql-operations";

export const Route = createFileRoute("/api/employees/$employeeId")({
    server: {
        handlers: {
            PATCH: async ({ request, params }) => {
                try {
                    const user = await requireUser(request);
                    const body = await readJsonBody(request);
                    const result = await updateEmployeeSettings(user, params.employeeId, body);
                    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
                }
                catch (error) {
                    return apiErrorResponse(error);
                }
            },
        },
    },
});
