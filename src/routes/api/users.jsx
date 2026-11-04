import { createFileRoute } from "@tanstack/react-router";
import { apiErrorResponse, readJsonBody } from "@/server/api-response";
import { createUser, listUsers, requireUser } from "@/server/sql-auth";

export const Route = createFileRoute("/api/users")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                try {
                    const user = await requireUser(request);
                    if (user.role !== "admin") throw new Error("Forbidden. Only an Admin can manage user accounts.");
                    return Response.json(await listUsers(), { headers: { "Cache-Control": "no-store" } });
                }
                catch (error) {
                    return apiErrorResponse(error);
                }
            },
            POST: async ({ request }) => {
                try {
                    const user = await requireUser(request);
                    if (user.role !== "admin") throw new Error("Forbidden. Only an Admin can create user accounts.");
                    const body = await readJsonBody(request);
                    return Response.json(await createUser(body, user.id), { status: 201 });
                }
                catch (error) {
                    return apiErrorResponse(error);
                }
            },
        },
    },
});
