import { createFileRoute } from "@tanstack/react-router";
import { apiErrorResponse, readJsonBody } from "@/server/api-response";
import { getSessionCookie, signIn } from "@/server/sql-auth";

export const Route = createFileRoute("/api/auth/login")({
    server: {
        handlers: {
            POST: async ({ request }) => {
                try {
                    const body = await readJsonBody(request);
                    if (typeof body.email !== "string" || typeof body.password !== "string") {
                        throw new Error("Enter your email address and password.");
                    }
                    const { user, token } = await signIn(body.email, body.password);
                    return Response.json({ user }, {
                        headers: { "Set-Cookie": getSessionCookie(token, request), "Cache-Control": "no-store" },
                    });
                }
                catch (error) {
                    return apiErrorResponse(error);
                }
            },
        },
    },
});
