import { getSqlPool, sql } from "./sql-database.js";
import { createUser, requirePermission } from "./sql-auth.js";

const VALID_ROLES = ["rm", "avp", "gm"];
const DATE_FORMAT = { day: "2-digit", month: "short", year: "numeric" };

async function nextSequenceCode(pool, prefix) {
    const result = await pool.request().query("SELECT NEXT VALUE FOR dbo.request_number_sequence AS next_value");
    return `${prefix}-${String(result.recordset[0].next_value).padStart(6, "0")}`;
}

function formatDate(value) {
    if (!value) return null;
    return new Date(value).toLocaleDateString("en-IN", DATE_FORMAT);
}

function mapMaterial(row, includeValue) {
    return {
        id: row.material_code,
        name: row.name,
        category: row.category,
        ...(row.language ? { language: row.language } : {}),
        unit: row.unit,
        stock: row.stock,
        minimum: row.minimum_stock,
        ...(includeValue ? { unitValue: Number(row.unit_value) } : {}),
    };
}

function mapEmployee(row) {
    return {
        id: row.employee_code,
        accountId: row.account_id,
        hasLogin: Boolean(row.account_id),
        loginEnabled: row.account_id ? Boolean(row.login_enabled) : false,
        name: row.display_name,
        email: row.email,
        role: row.role_name,
        region: row.region,
        approvalAuthorityRole: row.approval_authority_role || "",
        status: row.status?.toLowerCase() === "active" ? "Active" : "Inactive",
    };
}

async function mapRequests(pool, requestResult, includeValue) {
    if (!requestResult.length) return [];
    const request = pool.request();
    const parameters = requestResult.map((row, index) => {
        request.input(`requestId${index}`, sql.NVarChar(40), row.request_id);
        return `@requestId${index}`;
    });
    const itemsResult = await request.query(`
        SELECT request_id, material_name, quantity, unit
        FROM dbo.request_items
        WHERE request_id IN (${parameters.join(",")})
        ORDER BY request_item_id
    `);
    const itemsByRequest = new Map();
    for (const item of itemsResult.recordset) {
        if (!itemsByRequest.has(item.request_id)) itemsByRequest.set(item.request_id, []);
        itemsByRequest.get(item.request_id).push({
            material: item.material_name,
            items: item.quantity,
            unit: item.unit,
        });
    }

    return requestResult.map((row) => {
        const materialItems = itemsByRequest.get(row.request_id) || [];
        return {
            id: row.request_id,
            requester: row.requester_name,
            requesterUserId: row.requester_user_id,
            role: row.requester_role,
            createdByRole: row.requester_role.toLowerCase() === "executive" ? "executive" : undefined,
            region: row.region,
            requestedAuthorityRole: row.requested_authority_role,
            items: materialItems.reduce((sum, item) => sum + item.items, 0),
            ...(includeValue ? { value: Number(row.value) } : {}),
            status: row.status,
            date: formatDate(row.request_date),
            material: materialItems.map((item) => item.material).join(", "),
            materialItems,
            purpose: row.purpose,
            approvedByRole: row.approved_by_role,
            approvedAt: formatDate(row.approved_at),
            revisedByRole: row.revised_by_role,
            revisedForRole: row.revised_for_role,
            revisionNumber: row.revision_number,
            revisedAt: formatDate(row.revised_at),
            transportType: row.transport_type,
            vehicleNumber: row.vehicle_number,
            driverName: row.driver_name,
            courierCompany: row.courier_company,
            trackingNumber: row.tracking_number,
            gatePassNumber: row.gate_pass_number,
            dispatchedAt: formatDate(row.dispatched_at),
            receivedAt: formatDate(row.received_at),
        };
    });
}

export async function listOperations(user, collection) {
    const pool = await getSqlPool();
    if (collection === "materials") {
        const result = await pool.request().query(`
            SELECT material_code, name, category, language, unit, stock, minimum_stock, unit_value
            FROM dbo.materials ORDER BY name
        `);
        return result.recordset.map((row) => mapMaterial(row, ["admin", "hr"].includes(user.role)));
    }
    if (collection === "employees") {
        if (user.role !== "admin") await requirePermission(user, "manageEmployees");
        const result = await pool.request().query(`
            SELECT
                COALESCE(e.employee_code, N'USR-' + CONVERT(NVARCHAR(36), u.user_id)) AS employee_code,
                COALESCE(e.display_name, u.display_name) AS display_name,
                COALESCE(e.email, u.email) AS email,
                COALESCE(r.role_id, e.role_name) AS role_name,
                COALESCE(e.region, N'Unassigned') AS region,
                e.approval_authority_role,
                COALESCE(e.status, CASE WHEN u.is_active = 1 THEN N'Active' ELSE N'Inactive' END) AS status,
                u.user_id AS account_id,
                u.is_active AS login_enabled
            FROM dbo.employees e
            FULL OUTER JOIN dbo.users u
                ON e.user_id = u.user_id OR (e.user_id IS NULL AND e.email = u.email)
            LEFT JOIN dbo.user_roles ur ON ur.user_id = u.user_id
            LEFT JOIN dbo.roles r ON r.role_id = ur.role_id
            ORDER BY COALESCE(e.display_name, u.display_name)
        `);
        return result.recordset.map(mapEmployee);
    }
    if (collection !== "requests") throw new Error("Choose a valid operations collection.");

    const allowed = await pool.request()
        .input("roleId", sql.NVarChar(30), user.role)
        .query("SELECT permission_key FROM dbo.role_permissions WHERE role_id = @roleId AND is_enabled = 1");
    const granted = new Set(allowed.recordset.map((row) => row.permission_key));
    if (!["createRequests", "approveRequests", "dispatchRequests"].some((key) => granted.has(key))) {
        throw new Error("Forbidden. Your role cannot access requests.");
    }

    const request = pool.request();
    let filter = "";
    if (user.role === "executive") {
        request.input("userId", sql.UniqueIdentifier, user.id);
        filter = "WHERE requester_user_id = @userId";
    }
    else if (VALID_ROLES.includes(user.role)) {
        request.input("roleId", sql.NVarChar(30), user.role);
        filter = "WHERE requested_authority_role = @roleId";
    }
    else if (user.role === "hr") {
        filter = "WHERE status IN (N'Approved', N'Under Packing', N'Dispatched')";
    }
    const result = await request.query(`
        SELECT * FROM dbo.requests ${filter} ORDER BY created_at DESC
    `);
    return mapRequests(pool, result.recordset, ["admin", "hr"].includes(user.role));
}

function validateMaterials(items) {
    if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
        throw new Error("A request must contain between 1 and 50 material items.");
    }
    const names = new Set();
    return items.map((item) => {
        const materialLabel = typeof item.material === "string" ? item.material.trim() : "";
        const brochureMatch = /^Brochures \((Hindi|English|Bengali|Marathi)\)$/i.exec(materialLabel);
        const materialName = brochureMatch ? "Brochures" : materialLabel;
        const language = typeof item.language === "string" && item.language.trim()
            ? item.language.trim()
            : brochureMatch?.[1] || "";
        const quantity = Number(item.items);
        const unit = typeof item.unit === "string" && item.unit.trim() ? item.unit.trim() : "units";
        if (!materialName || materialName.length > 120 || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000000) {
            throw new Error("Enter a material name and a whole-number quantity greater than zero for every item.");
        }
        if (language && (materialName.toLowerCase() !== "brochures" || !["Hindi", "English", "Bengali", "Marathi"].includes(language))) {
            throw new Error("Choose a valid brochure language.");
        }
        const materialKey = `${materialName.toLowerCase()}:${language.toLowerCase()}`;
        if (names.has(materialKey)) throw new Error("Each material can only be added once to a request.");
        names.add(materialKey);
        return { material: materialName, language: language || null, items: quantity, unit };
    });
}

async function insertRequestItems(transaction, requestId, materialItems) {
    let totalValue = 0;
    for (const item of materialItems) {
        const materialResult = await new sql.Request(transaction)
            .input("materialName", sql.NVarChar(120), item.material)
            .input("language", sql.NVarChar(30), item.language)
            .query("SELECT TOP (1) material_id, unit, stock, unit_value FROM dbo.materials WHERE name = @materialName AND ISNULL(language, N'') = ISNULL(@language, N'') ORDER BY material_id");
        const material = materialResult.recordset[0];
        if (!material) throw new Error(`Material "${item.material}" is not available in the SQL Server inventory.`);
        if (item.items > material.stock) throw new Error(`Only ${material.stock} ${material.unit} of ${item.material} are currently available.`);
        totalValue += Number(material.unit_value) * item.items;
        await new sql.Request(transaction)
            .input("requestId", sql.NVarChar(40), requestId)
            .input("materialId", sql.UniqueIdentifier, material.material_id)
            .input("materialName", sql.NVarChar(120), item.language ? `${item.material} (${item.language})` : item.material)
            .input("quantity", sql.Int, item.items)
            .input("unit", sql.NVarChar(30), material.unit)
            .query(`
                INSERT INTO dbo.request_items (request_id, material_id, material_name, quantity, unit)
                VALUES (@requestId, @materialId, @materialName, @quantity, @unit)
            `);
    }
    return totalValue;
}

export async function createRequest(user, data) {
    await requirePermission(user, "createRequests");
    if (user.role !== "executive" && user.role !== "admin") {
        throw new Error("Only Executive or Admin roles can create requests.");
    }
    const materialItems = validateMaterials(data.materialItems);
    const region = typeof user.region === "string" ? user.region.trim() : "";
    const purpose = typeof data.purpose === "string" ? data.purpose.trim() : "";
    const authorityRole = typeof user.approvalAuthorityRole === "string"
        ? user.approvalAuthorityRole.trim().toLowerCase()
        : "";
    if (!region || region.length > 80 || !purpose || purpose.length > 500) throw new Error("Region and purpose are required.");
    if (!VALID_ROLES.includes(authorityRole)) throw new Error("Ask an Admin to assign an approving authority to your employee profile.");
    const assignedRole = authorityRole;
    const pool = await getSqlPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const nextNumber = await new sql.Request(transaction).query("SELECT NEXT VALUE FOR dbo.request_number_sequence AS request_number");
        const requestId = `PR-${new Date().getFullYear()}-${String(nextNumber.recordset[0].request_number).padStart(6, "0")}`;
        await new sql.Request(transaction)
            .input("requestId", sql.NVarChar(40), requestId)
            .input("userId", sql.UniqueIdentifier, user.id)
            .input("requesterName", sql.NVarChar(120), user.displayName)
            .input("requesterRole", sql.NVarChar(60), user.role)
            .input("region", sql.NVarChar(80), region)
            .input("authorityRole", sql.NVarChar(30), assignedRole)
            .input("value", sql.Decimal(18, 2), 0)
            .input("requestDate", sql.Date, data.date ? new Date(data.date) : new Date())
            .input("purpose", sql.NVarChar(500), purpose)
            .query(`
                INSERT INTO dbo.requests (
                    request_id, requester_user_id, requester_name, requester_role, region,
                    requested_authority_role, status, value, request_date, purpose
                )
                VALUES (@requestId, @userId, @requesterName, @requesterRole, @region,
                    @authorityRole, N'Pending Approval', @value, @requestDate, @purpose)
            `);
        const requestTotal = await insertRequestItems(transaction, requestId, materialItems);
        await new sql.Request(transaction)
            .input("requestId", sql.NVarChar(40), requestId)
            .input("value", sql.Decimal(18, 2), requestTotal)
            .query("UPDATE dbo.requests SET value = @value WHERE request_id = @requestId");
        await transaction.commit();
        return { id: requestId };
    }
    catch (error) {
        await transaction.rollback();
        throw error;
    }
}

async function getRequest(transaction, requestId) {
    const result = await new sql.Request(transaction)
        .input("requestId", sql.NVarChar(40), requestId)
        .query("SELECT * FROM dbo.requests WITH (UPDLOCK, ROWLOCK) WHERE request_id = @requestId");
    return result.recordset[0] || null;
}

async function deductDispatchedInventory(transaction, requestId) {
    const requestItems = await new sql.Request(transaction)
        .input("requestId", sql.NVarChar(40), requestId)
        .query(`
            SELECT material_id, SUM(quantity) AS quantity
            FROM dbo.request_items
            WHERE request_id = @requestId
            GROUP BY material_id
            ORDER BY material_id
        `);
    if (!requestItems.recordset.length || requestItems.recordset.some((item) => !item.material_id)) {
        throw new Error("Request items are not linked to inventory. Revise the request items before dispatch.");
    }

    for (const item of requestItems.recordset) {
        const updateResult = await new sql.Request(transaction)
            .input("materialId", sql.UniqueIdentifier, item.material_id)
            .input("quantity", sql.Int, item.quantity)
            .query(`
                UPDATE dbo.materials
                SET stock = stock - @quantity
                WHERE material_id = @materialId AND stock >= @quantity
            `);
        if (updateResult.rowsAffected[0] !== 1) {
            const materialResult = await new sql.Request(transaction)
                .input("materialId", sql.UniqueIdentifier, item.material_id)
                .query("SELECT name, language, stock FROM dbo.materials WHERE material_id = @materialId");
            const material = materialResult.recordset[0];
            if (!material) throw new Error("A requested inventory item no longer exists.");
            const label = material.language ? `${material.name} (${material.language})` : material.name;
            throw new Error(`Not enough ${label} in stock to dispatch: ${material.stock} available, ${item.quantity} requested.`);
        }
    }
}

export async function updateRequest(user, requestId, data) {
    const action = data.action;
    const pool = await getSqlPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const request = await getRequest(transaction, requestId);
        if (!request) throw new Error("Request not found.");
        const allowed = await new sql.Request(transaction)
            .input("roleId", sql.NVarChar(30), user.role)
            .input("permissionKey", sql.NVarChar(50), action === "approve" || action === "revise-manager"
                ? "approveRequests"
                : action === "receive" ? "createRequests" : "dispatchRequests")
            .query("SELECT is_enabled FROM dbo.role_permissions WHERE role_id = @roleId AND permission_key = @permissionKey");
        if (!allowed.recordset[0]?.is_enabled) throw new Error("Forbidden. Your role cannot perform this request action.");
        if (user.role === "executive" && request.requester_user_id !== user.id) throw new Error("Forbidden. You can only update your own requests.");

        const manager = VALID_ROLES.includes(user.role);
        const isAssignedManager = manager && request.requested_authority_role === user.role;
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        let query;
        let dispatchDetails = null;
        if (action === "approve") {
            if (!isAssignedManager || !["Pending Approval", "Revised"].includes(request.status)) throw new Error("This request is not awaiting your approval.");
            query = `
                UPDATE dbo.requests SET status = N'Approved', approved_by_role = @roleId,
                    approved_at = @today, updated_at = SYSUTCDATETIME()
                WHERE request_id = @requestId
            `;
        }
        else if (action === "revise-manager" || action === "revise-hr") {
            const isManagerRevision = action === "revise-manager" && isAssignedManager && ["Pending Approval", "Revised"].includes(request.status);
            const isHrRevision = action === "revise-hr" && user.role === "hr" && ["Approved", "Under Packing"].includes(request.status);
            if (!isManagerRevision && !isHrRevision) throw new Error("This request cannot be revised by your role in its current state.");
            const materialItems = validateMaterials(data.materialItems);
            await new sql.Request(transaction)
                .input("requestId", sql.NVarChar(40), requestId)
                .query("DELETE FROM dbo.request_items WHERE request_id = @requestId");
            const requestTotal = await insertRequestItems(transaction, requestId, materialItems);
            await new sql.Request(transaction)
                .input("requestId", sql.NVarChar(40), requestId)
                .input("value", sql.Decimal(18, 2), requestTotal)
                .query("UPDATE dbo.requests SET value = @value WHERE request_id = @requestId");
            query = `
                UPDATE dbo.requests
                SET status = N'Revised',
                    revised_by_role = @roleId,
                    revised_for_role = CASE WHEN @roleId = N'hr' THEN approved_by_role ELSE @roleId END,
                    revision_number = revision_number + 1,
                    revised_at = @today,
                    updated_at = SYSUTCDATETIME()
                WHERE request_id = @requestId
            `;
        }
        else if (action === "pack") {
            if (user.role !== "hr" || request.status !== "Approved") throw new Error("Only HR can start packing for an approved request.");
            query = "UPDATE dbo.requests SET status = N'Under Packing', updated_at = SYSUTCDATETIME() WHERE request_id = @requestId";
        }
        else if (action === "dispatch") {
            if (user.role !== "hr" || request.status !== "Under Packing") throw new Error("Only HR can dispatch a request that is under packing.");
            if (!["Vehicle", "Courier"].includes(data.transportType)) throw new Error("Choose Vehicle or Courier transport.");
            dispatchDetails = {
                vehicleNumber: typeof data.vehicleNumber === "string" ? data.vehicleNumber.trim() : "",
                driverName: typeof data.driverName === "string" ? data.driverName.trim() : "",
                courierCompany: typeof data.courierCompany === "string" ? data.courierCompany.trim() : "",
                trackingNumber: typeof data.trackingNumber === "string" ? data.trackingNumber.trim() : "",
            };
            if (dispatchDetails.vehicleNumber.length > 30 || dispatchDetails.driverName.length > 120 ||
                dispatchDetails.courierCompany.length > 120 || dispatchDetails.trackingNumber.length > 120) {
                throw new Error("Transport details exceed the allowed field length.");
            }
            if (data.transportType === "Vehicle" && !dispatchDetails.vehicleNumber) throw new Error("Enter the vehicle number.");
            if (data.transportType === "Courier" && (!dispatchDetails.courierCompany || !dispatchDetails.trackingNumber)) throw new Error("Enter the courier company and tracking number.");
            query = `
                UPDATE dbo.requests SET status = N'Dispatched', transport_type = @transportType,
                    vehicle_number = @vehicleNumber, driver_name = @driverName,
                    courier_company = @courierCompany, tracking_number = @trackingNumber,
                    gate_pass_number = COALESCE(gate_pass_number, @gatePassNumber),
                    dispatched_at = @today, updated_at = SYSUTCDATETIME()
                WHERE request_id = @requestId
            `;
        }
        else if (action === "receive") {
            if (user.role !== "executive" || request.requester_user_id !== user.id || request.status !== "Dispatched") {
                throw new Error("Only the requesting Executive can acknowledge a dispatched request.");
            }
            query = "UPDATE dbo.requests SET status = N'Received', received_at = @today, updated_at = SYSUTCDATETIME() WHERE request_id = @requestId";
        }
        else {
            throw new Error("Choose a valid request action.");
        }

        const update = new sql.Request(transaction)
            .input("requestId", sql.NVarChar(40), requestId)
            .input("roleId", sql.NVarChar(30), user.role)
            .input("today", sql.Date, today);
        if (action === "dispatch") {
            update
                .input("transportType", sql.NVarChar(20), data.transportType)
                .input("vehicleNumber", sql.NVarChar(30), dispatchDetails.vehicleNumber || null)
                .input("driverName", sql.NVarChar(120), dispatchDetails.driverName || null)
                .input("courierCompany", sql.NVarChar(120), dispatchDetails.courierCompany || null)
                .input("trackingNumber", sql.NVarChar(120), dispatchDetails.trackingNumber || null)
                .input("gatePassNumber", sql.NVarChar(50), `GP-${requestId.replace(/\D/g, "")}`);
        }
        await update.query(query);
        if (action === "dispatch") await deductDispatchedInventory(transaction, requestId);
        await transaction.commit();
        return { id: requestId, status: action === "approve" ? "Approved" : action.startsWith("revise") ? "Revised" : action === "pack" ? "Under Packing" : action === "dispatch" ? "Dispatched" : "Received" };
    }
    catch (error) {
        await transaction.rollback();
        throw error;
    }
}

export async function addMaterial(user, data) {
    await requirePermission(user, "manageMaterials");
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const category = typeof data.category === "string" ? data.category.trim() : "";
    const language = typeof data.language === "string" ? data.language.trim() : "";
    const unit = typeof data.unit === "string" ? data.unit.trim() : "";
    const stock = Number(data.stock);
    const minimum = Number(data.minimum);
    const unitValue = Number(data.unitValue);
    if (!name || !category || !unit || name.length > 120 || category.length > 80 || unit.length > 30) throw new Error("Material name, category, and unit are required.");
    if (language && (name.toLowerCase() !== "brochures" || !["Hindi", "English", "Bengali", "Marathi"].includes(language))) {
        throw new Error("Choose a valid language for brochures.");
    }
    if (![stock, minimum, unitValue].every(Number.isFinite) || !Number.isInteger(stock) || !Number.isInteger(minimum) || stock < 0 || minimum < 0 || unitValue < 0) throw new Error("Enter valid non-negative stock, minimum, and value amounts.");
    const pool = await getSqlPool();
    const materialCode = await nextSequenceCode(pool, "MAT");
    const result = await pool.request()
        .input("materialCode", sql.NVarChar(30), materialCode)
        .input("name", sql.NVarChar(120), name)
        .input("category", sql.NVarChar(80), category)
        .input("language", sql.NVarChar(30), language || null)
        .input("unit", sql.NVarChar(30), unit)
        .input("stock", sql.Int, stock)
        .input("minimum", sql.Int, minimum)
        .input("unitValue", sql.Decimal(18, 2), unitValue)
        .query(`
            INSERT INTO dbo.materials (material_code, name, category, language, unit, stock, minimum_stock, unit_value)
            OUTPUT INSERTED.material_code AS id
            VALUES (@materialCode, @name, @category, @language, @unit, @stock, @minimum, @unitValue)
        `);
    return { id: result.recordset[0].id };
}

export async function updateMaterial(user, materialCode, data) {
    await requirePermission(user, "manageMaterials");
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const category = typeof data.category === "string" ? data.category.trim() : "";
    const language = typeof data.language === "string" ? data.language.trim() : "";
    const unit = typeof data.unit === "string" ? data.unit.trim() : "";
    const stock = Number(data.stock);
    const minimum = Number(data.minimum);
    const unitValue = data.unitValue == null ? null : Number(data.unitValue);
    if (!materialCode || materialCode.length > 30) throw new Error("Material ID is required.");
    if (!name || !category || !unit || name.length > 120 || category.length > 80 || unit.length > 30) {
        throw new Error("Material name, category, and unit are required.");
    }
    if (language && (name.toLowerCase() !== "brochures" || !["Hindi", "English", "Bengali", "Marathi"].includes(language))) {
        throw new Error("Choose a valid language for brochures.");
    }
    if (![stock, minimum].every(Number.isFinite) || !Number.isInteger(stock) || !Number.isInteger(minimum) || stock < 0 || minimum < 0 ||
        (unitValue !== null && (!Number.isFinite(unitValue) || unitValue < 0))) {
        throw new Error("Enter valid non-negative stock, minimum, and value amounts.");
    }

    const pool = await getSqlPool();
    const result = await pool.request()
        .input("materialCode", sql.NVarChar(30), materialCode)
        .input("name", sql.NVarChar(120), name)
        .input("category", sql.NVarChar(80), category)
        .input("language", sql.NVarChar(30), language || null)
        .input("unit", sql.NVarChar(30), unit)
        .input("stock", sql.Int, stock)
        .input("minimum", sql.Int, minimum)
        .input("unitValue", sql.Decimal(18, 2), unitValue)
        .query(`
            UPDATE dbo.materials
            SET name = @name, category = @category, language = @language,
                unit = @unit, stock = @stock, minimum_stock = @minimum,
                unit_value = COALESCE(@unitValue, unit_value)
            OUTPUT INSERTED.material_code AS id
            WHERE material_code = @materialCode
        `);
    if (!result.recordset[0]) throw new Error("Material not found.");
    return { id: result.recordset[0].id };
}

export async function deleteMaterial(user, materialCode) {
    await requirePermission(user, "manageMaterials");
    if (!materialCode || materialCode.length > 30) throw new Error("Material ID is required.");

    const pool = await getSqlPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    let finished = false;
    try {
        const materialResult = await new sql.Request(transaction)
            .input("materialCode", sql.NVarChar(30), materialCode)
            .query("SELECT material_id FROM dbo.materials WITH (UPDLOCK, HOLDLOCK) WHERE material_code = @materialCode");
        const material = materialResult.recordset[0];
        if (!material) throw new Error("Material not found.");

        const requestResult = await new sql.Request(transaction)
            .input("materialId", sql.UniqueIdentifier, material.material_id)
            .query("SELECT TOP (1) request_id FROM dbo.request_items WHERE material_id = @materialId");
        if (requestResult.recordset.length) {
            await transaction.rollback();
            finished = true;
            throw new Error("This material is used in request history and cannot be deleted.");
        }

        await new sql.Request(transaction)
            .input("materialCode", sql.NVarChar(30), materialCode)
            .query("DELETE FROM dbo.materials WHERE material_code = @materialCode");
        await transaction.commit();
        finished = true;
        return { id: materialCode };
    }
    catch (error) {
        if (!finished) await transaction.rollback();
        throw error;
    }
}

export async function addEmployee(user, data) {
    if (user.role !== "admin") throw new Error("Forbidden. Only an Admin can create an employee login.");
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    const role = typeof data.role === "string" ? data.role.trim() : "";
    const region = typeof data.region === "string" ? data.region.trim() : "";
    if (!name || !email || !role || name.length > 120 || email.length > 254 || role.length > 30 || region.length > 80) {
        throw new Error("Name, valid email, role, and region are required.");
    }
    return createUser({
        displayName: name,
        email,
        password: data.password,
        role: role.toLowerCase(),
        region,
        approvalAuthorityRole: data.approvalAuthorityRole,
    }, user.id);
}

export async function updateEmployeeSettings(user, employeeId, data) {
    if (user.role?.toLowerCase() !== "admin") {
        throw new Error("Forbidden. Only an Admin can update employee access and status.");
    }
    if (!data || typeof data !== "object" || !["Active", "Inactive"].includes(data.status)) {
        throw new Error("Employee status must be Active or Inactive.");
    }
    const approvalAuthorityRole = typeof data.approvalAuthorityRole === "string"
        ? data.approvalAuthorityRole.trim().toLowerCase()
        : "";
    const region = typeof data.region === "string" ? data.region.trim() : "";
    if (!region || region.length > 80) {
        throw new Error("Enter an area or region of at most 80 characters.");
    }
    if (!["rm", "avp", "gm"].includes(approvalAuthorityRole)) {
        throw new Error("Choose a valid approving authority.");
    }
    const accountId = typeof data.accountId === "string" && data.accountId ? data.accountId : null;
    if (accountId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)) {
        throw new Error("Employee login ID is invalid.");
    }
    if (accountId && typeof data.loginEnabled !== "boolean") {
        throw new Error("Choose whether employee login access is enabled or disabled.");
    }
    if (!accountId && data.loginEnabled !== null) {
        throw new Error("An employee without a login cannot have login access changed.");
    }

    const pool = await getSqlPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const employeeResult = await new sql.Request(transaction)
            .input("employeeCode", sql.NVarChar(50), employeeId)
            .query(`
                SELECT TOP (1) employee_code, email, user_id
                FROM dbo.employees WITH (UPDLOCK, ROWLOCK)
                WHERE employee_code = @employeeCode
            `);
        let employee = employeeResult.recordset[0];
        if (!employee && accountId) {
            const existingEmployee = await new sql.Request(transaction)
                .input("accountId", sql.UniqueIdentifier, accountId)
                .query("SELECT TOP (1) employee_code, email, user_id FROM dbo.employees WITH (UPDLOCK, ROWLOCK) WHERE user_id = @accountId");
            employee = existingEmployee.recordset[0];
        }
        let account;
        if (accountId) {
            const accountResult = await new sql.Request(transaction)
                .input("accountId", sql.UniqueIdentifier, accountId)
                .query(`
                    SELECT u.user_id, u.email, u.display_name, r.display_name AS role_name
                    FROM dbo.users u
                    LEFT JOIN dbo.user_roles ur ON ur.user_id = u.user_id
                    LEFT JOIN dbo.roles r ON r.role_id = ur.role_id
                    WHERE u.user_id = @accountId
                `);
            account = accountResult.recordset[0];
            if (!account) throw new Error("Employee login not found.");
            if (employee?.user_id && String(employee.user_id).toLowerCase() !== accountId.toLowerCase()) {
                throw new Error("The selected login does not belong to this employee.");
            }
            if (employee && !employee.user_id) {
                if (employee.email.toLowerCase() !== account.email.toLowerCase()) {
                    throw new Error("The selected login does not belong to this employee.");
                }
                await new sql.Request(transaction)
                    .input("employeeCode", sql.NVarChar(30), employee.employee_code)
                    .input("accountId", sql.UniqueIdentifier, accountId)
                    .query("UPDATE dbo.employees SET user_id = @accountId WHERE employee_code = @employeeCode AND user_id IS NULL");
                employee.user_id = accountId;
            }
        }
        if (!employee && accountId) {
            const sequence = await new sql.Request(transaction)
                .query("SELECT NEXT VALUE FOR dbo.request_number_sequence AS next_value");
            const employeeCode = `EMP-${String(sequence.recordset[0].next_value).padStart(6, "0")}`;
            const createdEmployee = await new sql.Request(transaction)
                .input("employeeCode", sql.NVarChar(30), employeeCode)
                .input("accountId", sql.UniqueIdentifier, accountId)
                .input("email", sql.NVarChar(254), account.email)
                .input("displayName", sql.NVarChar(120), account.display_name)
                .input("roleName", sql.NVarChar(60), account.role_name || "Employee")
                .input("region", sql.NVarChar(80), region)
                .input("approvalAuthorityRole", sql.NVarChar(30), approvalAuthorityRole)
                .query(`
                    INSERT INTO dbo.employees (
                        employee_code, display_name, email, role_name, region, user_id, approval_authority_role
                    )
                    OUTPUT INSERTED.employee_code, INSERTED.user_id
                    VALUES (@employeeCode, @displayName, @email, @roleName, @region, @accountId, @approvalAuthorityRole)
                `);
            employee = createdEmployee.recordset[0];
        }
        if (!employee) throw new Error("Employee not found.");

        if (accountId) {
            const userResult = await new sql.Request(transaction)
                .input("accountId", sql.UniqueIdentifier, accountId)
                .input("enabled", sql.Bit, data.loginEnabled)
                .query("UPDATE dbo.users SET is_active = @enabled OUTPUT INSERTED.user_id WHERE user_id = @accountId");
            if (userResult.recordset.length === 0) throw new Error("Employee login not found.");
            await new sql.Request(transaction)
                .input("employeeCode", sql.NVarChar(30), employee.employee_code)
                .input("status", sql.NVarChar(30), data.status)
                .input("approvalAuthorityRole", sql.NVarChar(30), approvalAuthorityRole)
                .input("region", sql.NVarChar(80), region)
                .query("UPDATE dbo.employees SET status = @status, approval_authority_role = @approvalAuthorityRole, region = @region WHERE employee_code = @employeeCode");
        }
        else {
            await new sql.Request(transaction)
                .input("employeeCode", sql.NVarChar(30), employee.employee_code)
                .input("status", sql.NVarChar(30), data.status)
                .input("approvalAuthorityRole", sql.NVarChar(30), approvalAuthorityRole)
                .input("region", sql.NVarChar(80), region)
                .query("UPDATE dbo.employees SET status = @status, approval_authority_role = @approvalAuthorityRole, region = @region WHERE employee_code = @employeeCode");
        }
        await transaction.commit();
        return {
            id: employee.employee_code,
            status: data.status,
            loginEnabled: accountId ? data.loginEnabled : null,
            region,
            approvalAuthorityRole,
        };
    }
    catch (error) {
        await transaction.rollback();
        throw error;
    }
}
