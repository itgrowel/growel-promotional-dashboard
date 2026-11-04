import { getSqlPool, sql } from "../src/server/sql-database.js";
import { hashPassword } from "../src/server/sql-auth.js";

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const displayName = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!email || !displayName || !password) {
    console.error("Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, and BOOTSTRAP_ADMIN_PASSWORD for this one-time command.");
    process.exitCode = 1;
}
else {
    let pool;
    try {
        const passwordHash = await hashPassword(password);
        pool = await getSqlPool();
        const existingAdmin = await pool.request().query(`
            SELECT COUNT_BIG(*) AS admin_count
            FROM dbo.user_roles
            WHERE role_id = N'admin'
        `);
        if (existingAdmin.recordset[0].admin_count > 0) {
            throw new Error("An Admin account already exists. Use the Admin panel to manage accounts.");
        }
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            const inserted = await new sql.Request(transaction)
                .input("email", sql.NVarChar(254), email)
                .input("displayName", sql.NVarChar(120), displayName)
                .input("passwordHash", sql.NVarChar(300), passwordHash)
                .query(`
                    INSERT INTO dbo.users (email, display_name, password_hash)
                    OUTPUT INSERTED.user_id
                    VALUES (@email, @displayName, @passwordHash)
                `);
            await new sql.Request(transaction)
                .input("userId", sql.UniqueIdentifier, inserted.recordset[0].user_id)
                .query("INSERT INTO dbo.user_roles (user_id, role_id) VALUES (@userId, N'admin')");
            const employeeSequence = await new sql.Request(transaction)
                .query("SELECT NEXT VALUE FOR dbo.request_number_sequence AS next_value");
            const employeeCode = `EMP-${String(employeeSequence.recordset[0].next_value).padStart(6, "0")}`;
            await new sql.Request(transaction)
                .input("userId", sql.UniqueIdentifier, inserted.recordset[0].user_id)
                .input("email", sql.NVarChar(254), email)
                .input("displayName", sql.NVarChar(120), displayName)
                .input("employeeCode", sql.NVarChar(30), employeeCode)
                .query(`
                    INSERT INTO dbo.employees (employee_code, display_name, email, role_name, region, user_id)
                    VALUES (@employeeCode, @displayName, @email, N'ADMIN', N'Unassigned', @userId)
                `);
            await transaction.commit();
        }
        catch (error) {
            await transaction.rollback();
            throw error;
        }
        console.log(`Created the initial Admin account for ${email}.`);
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : "Could not create the initial Admin account.");
        process.exitCode = 1;
    }
    finally {
        if (pool) await pool.close();
    }
}
