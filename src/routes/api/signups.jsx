import { createFileRoute } from "@tanstack/react-router";
import { apiErrorResponse, readJsonBody } from "@/server/api-response";
import { approveSignup, listSignupRequests, rejectSignup, requireUser } from "@/server/sql-auth";

export const Route = createFileRoute("/api/signups")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                try {
                    const user = await requireUser(request);
                    if (user.role !== "admin") throw new Error("Forbidden. Only an Admin can review sign-ups.");
                    return Response.json(await listSignupRequests(), { headers: { "Cache-Control": "no-store" } });
                }
                catch (error) {
                    return apiErrorResponse(error);
                }
            },
            PATCH: async ({ request }) => {
                try {
                    const user = await requireUser(request);
                    if (user.role !== "admin") throw new Error("Forbidden. Only an Admin can review sign-ups.");
                    const body = await readJsonBody(request);
                    if (typeof body.signupId !== "string" || !body.signupId) throw new Error("Sign-up ID is required.");
                    if (body.action === "approve") {
                        if (typeof body.role !== "string") throw new Error("Choose a role for this account.");
                        return Response.json(await approveSignup(
                            body.signupId,
                            body.role,
                            body.region,
                            body.approvalAuthorityRole,
                            user.id,
                        ));
                    }
                    if (body.action === "reject") {
                        await rejectSignup(body.signupId);
                        return Response.json({ rejected: true });
                    }
                    throw new Error("Choose approve or reject.");
                }
                catch (error) {
                    return apiErrorResponse(error);
                }
            },
        },
    },
});
