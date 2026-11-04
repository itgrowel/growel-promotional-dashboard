import { createFileRoute } from "@tanstack/react-router";
import { clearSessionCookie } from "@/server/sql-auth";

export const Route = createFileRoute("/api/auth/logout")({
    server: {
        handlers: {
            POST: async ({ request }) => Response.json(
                { success: true },
                { headers: { "Set-Cookie": clearSessionCookie(request), "Cache-Control": "no-store" } },
            ),
        },
    },
});
