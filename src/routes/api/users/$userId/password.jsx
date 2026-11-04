import { createFileRoute } from "@tanstack/react-router";
import { apiErrorResponse, readJsonBody } from "@/server/api-response";
import { requireUser, resetUserPassword } from "@/server/sql-auth";

export const Route = createFileRoute("/api/users/$userId/password")({
    server: {
        handlers: {
            PUT: async ({ request, params }) => {
                try {
                    const user = await requireUser(request);
                    if (user.role !== "admin") throw new Error("Forbidden. Only an Admin can reset passwords.");
                    const body = await readJsonBody(request);
                    await resetUserPassword(params.userId, body.password);
                    return Response.json({ reset: true }, { headers: { "Cache-Control": "no-store" } });
                }
                catch (error) {
                    return apiErrorResponse(error);
                }
            },
        },
    },
});
