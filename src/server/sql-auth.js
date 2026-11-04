import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getSqlPool, sql } from "./sql-database.js";

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = "growel_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const SIGNUP_EMAIL_DOMAIN = "growelfeeds.com";

function getSessionSecret() {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
        throw Object.assign(
            new Error("SESSION_SECRET must be set to a random value of at least 32 characters."),
            { statusCode: 500 },
        );
    }
    return secret;
}

function createToken(payload) {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const unsigned = `${header}.${body}`;
    const signature = createHmac("sha256", getSessionSecret()).update(unsigned).digest("base64url");
    return `${unsigned}.${signature}`;
}

function verifyToken(token) {
    if (typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expected = createHmac("sha256", getSessionSecret()).update(`${header}.${body}`).digest();
    let received;
    try {
        received = Buffer.from(signature, "base64url");
    }
    catch {
        return null;
    }
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    try {
        const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
        return typeof payload.sub === "string" && payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
    }
    catch {
        return null;
    }
}

function getCookie(request, name) {
    const cookieHeader = request.headers.get("cookie") || "";
    for (const cookie of cookieHeader.split(";")) {
        const separator = cookie.indexOf("=");
        if (separator < 0) continue;
        if (cookie.slice(0, separator).trim() === name) {
            try {
                return decodeURIComponent(cookie.slice(separator + 1).trim());
            }
            catch {
                return null;
            }
        }
    }
    return null;
}

export function getSessionCookie(token, request) {
    const secure = process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:";
    return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(request) {
    const secure = process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:";
    return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}

export async function hashPassword(password) {
    if (typeof password !== "string" || password.length < 12 || password.length > 200) {
        throw new Error("Password must be between 12 and 200 characters.");
    }
    const salt = randomBytes(16);
    const derivedKey = await scrypt(password, salt, 64);
    return `scrypt$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

async function verifyPassword(password, storedHash) {
    if (typeof password !== "string" || typeof storedHash !== "string") return false;
    const [algorithm, saltValue, keyValue] = storedHash.split("$");
    if (algorithm !== "scrypt" || !saltValue || !keyValue) return false;
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(keyValue, "base64url");
    const actual = await scrypt(password, salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function mapUser(row) {
    return {
        id: row.user_id,
        email: row.email,
        displayName: row.display_name,
        role: row.role_id,
        region: row.region || "",
        approvalAuthorityRole: row.approval_authority_role || "",
        permissions: row.permissions || {},
    };
}

export async function signIn(email, password) {
    const pool = await getSqlPool();
    const result = await pool.request()
        .input("email", sql.NVarChar(254), email.trim().toLowerCase())
        .query(`
            SELECT u.user_id, u.email, u.display_name, u.password_hash, r.role_id,
                e.region, e.approval_authority_role
            FROM dbo.users u
            INNER JOIN dbo.user_roles ur ON ur.user_id = u.user_id
            INNER JOIN dbo.roles r ON r.role_id = ur.role_id
            LEFT JOIN dbo.employees e ON e.user_id = u.user_id
            WHERE u.email = @email AND u.is_active = 1
        `);
    const row = result.recordset[0];
    if (!row || !await verifyPassword(password, row.password_hash)) {
        throw new Error("Unauthorized. The email or password is incorrect.");
    }
    const user = mapUser(row);
    const now = Math.floor(Date.now() / 1000);
    return {
        user,
        token: createToken({ sub: user.id, iat: now, exp: now + SESSION_TTL_SECONDS }),
    };
}

export async function getAuthenticatedUser(request) {
    const token = getCookie(request, COOKIE_NAME);
    const claims = verifyToken(token);
    if (!claims) return null;

    const pool = await getSqlPool();
    const result = await pool.request()
        .input("userId", sql.UniqueIdentifier, claims.sub)
        .query(`
            SELECT u.user_id, u.email, u.display_name, r.role_id,
                e.region, e.approval_authority_role
            FROM dbo.users u
            INNER JOIN dbo.user_roles ur ON ur.user_id = u.user_id
            INNER JOIN dbo.roles r ON r.role_id = ur.role_id
            LEFT JOIN dbo.employees e ON e.user_id = u.user_id
            WHERE u.user_id = @userId AND u.is_active = 1
        `);
    if (!result.recordset[0]) return null;
    const user = mapUser(result.recordset[0]);
    const permissions = await pool.request()
        .input("roleId", sql.NVarChar(30), user.role)
        .query("SELECT permission_key, is_enabled FROM dbo.role_permissions WHERE role_id = @roleId");
    user.permissions = Object.fromEntries(permissions.recordset.map((row) => [row.permission_key, Boolean(row.is_enabled)]));
    return user;
}

export async function requireUser(request) {
    const user = await getAuthenticatedUser(request);
    if (!user) throw new Error("Unauthorized. Sign in to continue.");
    return user;
}

export async function requirePermission(user, permissionKey) {
    const pool = await getSqlPool();
    const result = await pool.request()
        .input("roleId", sql.NVarChar(30), user.role)
        .input("permissionKey", sql.NVarChar(50), permissionKey)
        .query("SELECT is_enabled FROM dbo.role_permissions WHERE role_id = @roleId AND permission_key = @permissionKey");
    if (!result.recordset[0]?.is_enabled) {
        throw new Error("Forbidden. Your role does not have permission to perform this action.");
    }
}

export async function createUser({ email, displayName, password, role, region, approvalAuthorityRole }, assignedBy) {
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedName = typeof displayName === "string" ? displayName.trim() : "";
    const validRoles = ["executive", "rm", "avp", "gm", "hr", "admin"];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
        throw new Error("Enter a valid email address.");
    }
    if (!normalizedEmail.endsWith(`@${SIGNUP_EMAIL_DOMAIN}`)) {
        throw new Error(`Only @${SIGNUP_EMAIL_DOMAIN} accounts can be created.`);
    }
    if (!normalizedName || normalizedName.length > 120) throw new Error("Display name is required and must be at most 120 characters.");
    if (!validRoles.includes(role)) throw new Error("Choose a valid user role.");
    const employeeRegion = typeof region === "string" ? region.trim() : "";
    if (!employeeRegion || employeeRegion.length > 80) throw new Error("Enter an area or region of at most 80 characters.");
    const authorityRole = role === "hr"
        ? ""
        : typeof approvalAuthorityRole === "string" ? approvalAuthorityRole.trim().toLowerCase() : "";
    if (authorityRole && !["rm", "avp", "gm"].includes(authorityRole)) {
        throw new Error("Choose a valid approving authority.");
    }
    if (role === "executive" && !authorityRole) {
        throw new Error("Choose an approving authority for Executive accounts.");
    }
    const passwordHash = await hashPassword(password);
    const pool = await getSqlPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const insertUser = await new sql.Request(transaction)
            .input("email", sql.NVarChar(254), normalizedEmail)
            .input("displayName", sql.NVarChar(120), normalizedName)
            .input("passwordHash", sql.NVarChar(300), passwordHash)
            .query(`
                INSERT INTO dbo.users (email, display_name, password_hash)
                OUTPUT INSERTED.user_id
                VALUES (@email, @displayName, @passwordHash)
            `);
        const userId = insertUser.recordset[0].user_id;
        await new sql.Request(transaction)
            .input("userId", sql.UniqueIdentifier, userId)
            .input("roleId", sql.NVarChar(30), role)
            .input("assignedBy", sql.UniqueIdentifier, assignedBy)
            .query("INSERT INTO dbo.user_roles (user_id, role_id, assigned_by) VALUES (@userId, @roleId, @assignedBy)");
        const employeeSequence = await new sql.Request(transaction)
            .query("SELECT NEXT VALUE FOR dbo.request_number_sequence AS next_value");
        const employeeCode = `EMP-${String(employeeSequence.recordset[0].next_value).padStart(6, "0")}`;
        await new sql.Request(transaction)
            .input("userId", sql.UniqueIdentifier, userId)
            .input("email", sql.NVarChar(254), normalizedEmail)
            .input("displayName", sql.NVarChar(120), normalizedName)
            .input("employeeCode", sql.NVarChar(30), employeeCode)
            .input("roleName", sql.NVarChar(60), role.toUpperCase())
            .input("region", sql.NVarChar(80), employeeRegion)
            .input("approvalAuthorityRole", sql.NVarChar(30), authorityRole || null)
            .query(`
                IF EXISTS (SELECT 1 FROM dbo.employees WHERE email = @email AND user_id IS NULL)
                    UPDATE dbo.employees
                    SET user_id = @userId, display_name = @displayName, role_name = @roleName,
                        region = @region, approval_authority_role = @approvalAuthorityRole
                    WHERE email = @email AND user_id IS NULL;
                ELSE
                    INSERT INTO dbo.employees (
                        employee_code, display_name, email, role_name, region, user_id, approval_authority_role
                    )
                    VALUES (
                        @employeeCode,
                        @displayName, @email, @roleName, @region, @userId, @approvalAuthorityRole
                    );
            `);
        await transaction.commit();
        return { id: userId, email: normalizedEmail, displayName: normalizedName, role };
    }
    catch (error) {
        await transaction.rollback();
        if (error.number === 2627 || error.number === 2601) throw new Error("An account with this email already exists.");
        throw error;
    }
}

export async function submitSignup({ email, displayName, password, region, requestedRole, approvalAuthorityRole }) {
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedName = typeof displayName === "string" ? displayName.trim() : "";
    const normalizedRegion = typeof region === "string" ? region.trim() : "";
    const requestedRoleValue = typeof requestedRole === "string" ? requestedRole.trim().toLowerCase() : "";
    const authorityRole = requestedRoleValue === "hr"
        ? ""
        : typeof approvalAuthorityRole === "string" ? approvalAuthorityRole.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254 ||
        !normalizedEmail.endsWith(`@${SIGNUP_EMAIL_DOMAIN}`)) {
        throw new Error(`Sign-up is available only to valid @${SIGNUP_EMAIL_DOMAIN} email addresses.`);
    }
    if (!normalizedName || normalizedName.length > 120) {
        throw new Error("Enter your full name (up to 120 characters).");
    }
    if (!normalizedRegion || normalizedRegion.length > 80) {
        throw new Error("Enter your area or region (up to 80 characters).");
    }
    if (!["executive", "rm", "avp", "gm", "hr"].includes(requestedRoleValue)) {
        throw new Error("Choose the role you are requesting.");
    }
    if (requestedRoleValue !== "hr" && !["rm", "avp", "gm"].includes(authorityRole)) {
        throw new Error("Choose an approving authority.");
    }

    const passwordHash = await hashPassword(password);
    const pool = await getSqlPool();
    try {
        await pool.request()
            .input("email", sql.NVarChar(254), normalizedEmail)
            .input("displayName", sql.NVarChar(120), normalizedName)
            .input("passwordHash", sql.NVarChar(300), passwordHash)
            .input("region", sql.NVarChar(80), normalizedRegion || null)
            .input("requestedRole", sql.NVarChar(30), requestedRoleValue)
            .input("approvalAuthorityRole", sql.NVarChar(30), authorityRole)
            .query(`
                IF EXISTS (SELECT 1 FROM dbo.users WHERE email = @email)
                    THROW 50001, 'An account with this email already exists.', 1;
                INSERT INTO dbo.signup_requests (
                    email, display_name, password_hash, region, requested_role, approval_authority_role
                )
                VALUES (
                    @email, @displayName, @passwordHash, @region, @requestedRole, @approvalAuthorityRole
                )
            `);
    }
    catch (error) {
        if (error.number === 2627 || error.number === 2601 || error.number === 50001) {
            throw new Error("An account or sign-up request with this email already exists.");
        }
        throw error;
    }
    return { submitted: true };
}

export async function listSignupRequests() {
    const pool = await getSqlPool();
    const result = await pool.request().query(`
        SELECT signup_id, email, display_name, region, requested_role, approval_authority_role, created_at
        FROM dbo.signup_requests
        ORDER BY created_at
    `);
    return result.recordset.map((row) => ({
        id: row.signup_id,
        email: row.email,
        displayName: row.display_name,
        region: row.region || "",
        requestedRole: row.requested_role,
        approvalAuthorityRole: row.approval_authority_role || "",
        createdAt: row.created_at,
    }));
}

export async function approveSignup(signupId, role, region, approvalAuthorityRole, assignedBy) {
    const validRoles = ["executive", "rm", "avp", "gm", "hr", "admin"];
    if (!validRoles.includes(role)) throw new Error("Choose a valid user role.");
    const employeeRegion = typeof region === "string" ? region.trim() : "";
    if (!employeeRegion || employeeRegion.length > 80) throw new Error("Enter an assigned area or region.");
    const authorityRole = typeof approvalAuthorityRole === "string" ? approvalAuthorityRole.trim().toLowerCase() : "";
    if (authorityRole && !["rm", "avp", "gm"].includes(authorityRole)) {
        throw new Error("Choose a valid approving authority.");
    }
    if (role === "executive" && !authorityRole) {
        throw new Error("Choose an approving authority for Executive accounts.");
    }

    const pool = await getSqlPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const signupResult = await new sql.Request(transaction)
            .input("signupId", sql.UniqueIdentifier, signupId)
            .query("SELECT * FROM dbo.signup_requests WITH (UPDLOCK, ROWLOCK) WHERE signup_id = @signupId");
        const signup = signupResult.recordset[0];
        if (!signup) throw new Error("Pending sign-up not found.");

        const insertUser = await new sql.Request(transaction)
            .input("email", sql.NVarChar(254), signup.email)
            .input("displayName", sql.NVarChar(120), signup.display_name)
            .input("passwordHash", sql.NVarChar(300), signup.password_hash)
            .query(`
                INSERT INTO dbo.users (email, display_name, password_hash)
                OUTPUT INSERTED.user_id
                VALUES (@email, @displayName, @passwordHash)
            `);
        const userId = insertUser.recordset[0].user_id;
        await new sql.Request(transaction)
            .input("userId", sql.UniqueIdentifier, userId)
            .input("roleId", sql.NVarChar(30), role)
            .input("assignedBy", sql.UniqueIdentifier, assignedBy)
            .query("INSERT INTO dbo.user_roles (user_id, role_id, assigned_by) VALUES (@userId, @roleId, @assignedBy)");
        const employeeSequence = await new sql.Request(transaction)
            .query("SELECT NEXT VALUE FOR dbo.request_number_sequence AS next_value");
        const employeeCode = `EMP-${String(employeeSequence.recordset[0].next_value).padStart(6, "0")}`;
        await new sql.Request(transaction)
            .input("userId", sql.UniqueIdentifier, userId)
            .input("email", sql.NVarChar(254), signup.email)
            .input("displayName", sql.NVarChar(120), signup.display_name)
            .input("employeeCode", sql.NVarChar(30), employeeCode)
            .input("roleName", sql.NVarChar(60), role.toUpperCase())
            .input("region", sql.NVarChar(80), employeeRegion)
            .input("approvalAuthorityRole", sql.NVarChar(30), authorityRole || null)
            .query(`
                IF EXISTS (SELECT 1 FROM dbo.employees WHERE email = @email AND user_id IS NULL)
                    UPDATE dbo.employees
                    SET user_id = @userId, display_name = @displayName, role_name = @roleName,
                        region = @region, approval_authority_role = @approvalAuthorityRole
                    WHERE email = @email AND user_id IS NULL;
                ELSE
                    INSERT INTO dbo.employees (
                        employee_code, display_name, email, role_name, region, user_id, approval_authority_role
                    )
                    VALUES (
                        @employeeCode, @displayName, @email, @roleName, @region, @userId, @approvalAuthorityRole
                    );
            `);
        await new sql.Request(transaction)
            .input("signupId", sql.UniqueIdentifier, signupId)
            .query("DELETE FROM dbo.signup_requests WHERE signup_id = @signupId");
        await transaction.commit();
        return { id: userId, email: signup.email, displayName: signup.display_name, role };
    }
    catch (error) {
        await transaction.rollback();
        if (error.number === 2627 || error.number === 2601) throw new Error("An account with this email already exists.");
        throw error;
    }
}

export async function rejectSignup(signupId) {
    const pool = await getSqlPool();
    const result = await pool.request()
        .input("signupId", sql.UniqueIdentifier, signupId)
        .query("DELETE FROM dbo.signup_requests WHERE signup_id = @signupId");
    if (result.rowsAffected[0] === 0) throw new Error("Pending sign-up not found.");
}

export async function resetUserPassword(userId, password) {
    const passwordHash = await hashPassword(password);
    const pool = await getSqlPool();
    const result = await pool.request()
        .input("userId", sql.UniqueIdentifier, userId)
        .input("passwordHash", sql.NVarChar(300), passwordHash)
        .query("UPDATE dbo.users SET password_hash = @passwordHash WHERE user_id = @userId AND is_active = 1");
    if (result.rowsAffected[0] === 0) throw new Error("Active user account not found.");
}

export async function listUsers() {
    const pool = await getSqlPool();
    const result = await pool.request().query(`
        SELECT u.user_id, u.email, u.display_name, u.is_active, r.role_id, u.created_at
        FROM dbo.users u
        INNER JOIN dbo.user_roles ur ON ur.user_id = u.user_id
        INNER JOIN dbo.roles r ON r.role_id = ur.role_id
        ORDER BY u.display_name
    `);
    return result.recordset.map((row) => ({
        id: row.user_id,
        email: row.email,
        displayName: row.display_name,
        role: row.role_id,
        active: row.is_active,
        createdAt: row.created_at,
    }));
}
