import { createFileRoute } from "@tanstack/react-router";
import { apiErrorResponse, readJsonBody } from "@/server/api-response";
import { submitSignup } from "@/server/sql-auth";

export const Route = createFileRoute("/api/auth/signup")({
    server: {
        handlers: {
            POST: async ({ request }) => {
                try {
                    const body = await readJsonBody(request);
                    await submitSignup(body);
                    return Response.json(
                        { message: "Sign-up submitted. An Admin must approve your account before you can sign in." },
                        { status: 201, headers: { "Cache-Control": "no-store" } },
                    );
                }
                catch (error) {
                    return apiErrorResponse(error);
                }
            },
        },
    },
});
