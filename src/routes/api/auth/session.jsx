import { createFileRoute } from "@tanstack/react-router";
import { apiErrorResponse } from "@/server/api-response";
import { getAuthenticatedUser } from "@/server/sql-auth";

export const Route = createFileRoute("/api/auth/session")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                try {
                    const user = await getAuthenticatedUser(request);
                    if (!user) return Response.json({ user: null }, { status: 401, headers: { "Cache-Control": "no-store" } });
                    return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
                }
                catch (error) {
                    return apiErrorResponse(error);
                }
            },
        },
    },
});
