import { createFileRoute } from "@tanstack/react-router";
import { getSqlPool } from "@/server/sql-database";
import { apiErrorResponse } from "@/server/api-response";

export const Route = createFileRoute("/api/health")({
    server: {
        handlers: {
            GET: async () => {
                try {
                    const pool = await getSqlPool();
                    await pool.request().query("SELECT 1 AS healthy");
                    return Response.json({ status: "ok", database: "connected" });
                }
                catch (error) {
                    return apiErrorResponse(error);
                }
            },
        },
    },
});
