import { createFileRoute } from "@tanstack/react-router";
import { apiErrorResponse, readJsonBody } from "@/server/api-response";
import { requirePermission, requireUser } from "@/server/sql-auth";
import { getSqlPool, sql } from "@/server/sql-database";

export const Route = createFileRoute("/api/permissions")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                try {
                    const user = await requireUser(request);
                    await requirePermission(user, "managePermissions");
                    const pool = await getSqlPool();
                    const result = await pool.request().query("SELECT role_id, permission_key, is_enabled FROM dbo.role_permissions");
                    const matrix = {};
                    for (const row of result.recordset) {
                        matrix[row.role_id] ||= {};
                        matrix[row.role_id][row.permission_key] = Boolean(row.is_enabled);
                    }
                    return Response.json(matrix, { headers: { "Cache-Control": "no-store" } });
                }
                catch (error) {
                    return apiErrorResponse(error);
                }
            },
            PUT: async ({ request }) => {
                try {
                    const user = await requireUser(request);
                    await requirePermission(user, "managePermissions");
                    const matrix = await readJsonBody(request);
                    const roleIds = ["executive", "rm", "avp", "gm", "hr", "admin"];
                    const permissionKeys = ["viewDashboard", "createRequests", "approveRequests", "manageEmployees", "manageMaterials", "dispatchRequests", "managePermissions"];
                    for (const roleId of roleIds) {
                        if (!matrix[roleId] || permissionKeys.some((key) => typeof matrix[roleId][key] !== "boolean")) {
                            throw new Error("Permission matrix is incomplete or invalid.");
                        }
                    }
                    for (const roleId of ["executive", "rm", "avp", "gm"]) {
                        matrix[roleId].manageEmployees = false;
                        matrix[roleId].manageMaterials = false;
                    }
                    matrix.admin.managePermissions = true;
                    const pool = await getSqlPool();
                    const transaction = new sql.Transaction(pool);
                    await transaction.begin();
                    try {
                        for (const roleId of roleIds) {
                            for (const key of permissionKeys) {
                                await new sql.Request(transaction)
                                    .input("roleId", sql.NVarChar(30), roleId)
                                    .input("permissionKey", sql.NVarChar(50), key)
                                    .input("enabled", sql.Bit, matrix[roleId][key])
                                    .query(`
                                        UPDATE dbo.role_permissions SET is_enabled = @enabled
                                        WHERE role_id = @roleId AND permission_key = @permissionKey
                                    `);
                            }
                        }
                        await transaction.commit();
                    }
                    catch (error) {
                        await transaction.rollback();
                        throw error;
                    }
                    return Response.json({ success: true });
                }
                catch (error) {
                    return apiErrorResponse(error);
                }
            },
        },
    },
});
