IF SCHEMA_ID(N'dbo') IS NULL
    EXEC(N'CREATE SCHEMA dbo');
GO

IF OBJECT_ID(N'dbo.roles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.roles (
        role_id NVARCHAR(30) NOT NULL PRIMARY KEY,
        display_name NVARCHAR(80) NOT NULL UNIQUE
    );
END;
GO

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.users (
        user_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_users_user_id DEFAULT NEWID() PRIMARY KEY,
        email NVARCHAR(254) NOT NULL,
        display_name NVARCHAR(120) NOT NULL,
        password_hash NVARCHAR(300) NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_users_is_active DEFAULT 1,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_users_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_users_email UNIQUE (email)
    );
END;
GO

IF OBJECT_ID(N'dbo.signup_requests', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.signup_requests (
        signup_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_signup_requests_id DEFAULT NEWID() PRIMARY KEY,
        email NVARCHAR(254) NOT NULL UNIQUE,
        display_name NVARCHAR(120) NOT NULL,
        password_hash NVARCHAR(300) NOT NULL,
        region NVARCHAR(80) NULL,
        requested_role NVARCHAR(30) NOT NULL CONSTRAINT DF_signup_requests_requested_role DEFAULT N'executive',
        approval_authority_role NVARCHAR(30) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_signup_requests_created_at DEFAULT SYSUTCDATETIME()
    );
END;
GO

IF COL_LENGTH(N'dbo.signup_requests', N'requested_role') IS NULL
    ALTER TABLE dbo.signup_requests ADD requested_role NVARCHAR(30) NOT NULL
        CONSTRAINT DF_signup_requests_requested_role DEFAULT N'executive';
GO

IF COL_LENGTH(N'dbo.signup_requests', N'approval_authority_role') IS NULL
    ALTER TABLE dbo.signup_requests ADD approval_authority_role NVARCHAR(30) NULL;
GO

IF OBJECT_ID(N'dbo.user_roles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.user_roles (
        user_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        role_id NVARCHAR(30) NOT NULL,
        assigned_by UNIQUEIDENTIFIER NULL,
        assigned_at DATETIME2 NOT NULL CONSTRAINT DF_user_roles_assigned_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_user_roles_users FOREIGN KEY (user_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_user_roles_roles FOREIGN KEY (role_id) REFERENCES dbo.roles(role_id),
        CONSTRAINT FK_user_roles_assigned_by FOREIGN KEY (assigned_by) REFERENCES dbo.users(user_id)
    );
END;
GO

IF OBJECT_ID(N'dbo.role_permissions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.role_permissions (
        role_id NVARCHAR(30) NOT NULL,
        permission_key NVARCHAR(50) NOT NULL,
        is_enabled BIT NOT NULL,
        CONSTRAINT PK_role_permissions PRIMARY KEY (role_id, permission_key),
        CONSTRAINT FK_role_permissions_roles FOREIGN KEY (role_id) REFERENCES dbo.roles(role_id)
    );
END;
GO

IF OBJECT_ID(N'dbo.employees', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.employees (
        employee_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_employees_id DEFAULT NEWID() PRIMARY KEY,
        employee_code NVARCHAR(30) NOT NULL UNIQUE,
        display_name NVARCHAR(120) NOT NULL,
        email NVARCHAR(254) NOT NULL,
        role_name NVARCHAR(60) NOT NULL,
        region NVARCHAR(80) NOT NULL,
        status NVARCHAR(30) NOT NULL CONSTRAINT DF_employees_status DEFAULT N'Active',
        user_id UNIQUEIDENTIFIER NULL,
        approval_authority_role NVARCHAR(30) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_employees_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_employees_email UNIQUE (email),
        CONSTRAINT FK_employees_users FOREIGN KEY (user_id) REFERENCES dbo.users(user_id)
    );
END;
GO

IF COL_LENGTH(N'dbo.employees', N'approval_authority_role') IS NULL
    ALTER TABLE dbo.employees ADD approval_authority_role NVARCHAR(30) NULL;
GO

IF OBJECT_ID(N'dbo.materials', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.materials (
        material_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_materials_id DEFAULT NEWID() PRIMARY KEY,
        material_code NVARCHAR(30) NOT NULL UNIQUE,
        name NVARCHAR(120) NOT NULL,
        category NVARCHAR(80) NOT NULL,
        language NVARCHAR(30) NULL,
        unit NVARCHAR(30) NOT NULL,
        stock INT NOT NULL,
        minimum_stock INT NOT NULL,
        unit_value DECIMAL(18, 2) NOT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_materials_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_materials_stock CHECK (stock >= 0),
        CONSTRAINT CK_materials_minimum CHECK (minimum_stock >= 0),
        CONSTRAINT CK_materials_value CHECK (unit_value >= 0),
        CONSTRAINT CK_materials_language CHECK (language IS NULL OR language IN (N'Hindi', N'English', N'Bengali', N'Marathi'))
    );
END;
GO

IF OBJECT_ID(N'dbo.requests', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.requests (
        request_id NVARCHAR(40) NOT NULL PRIMARY KEY,
        requester_user_id UNIQUEIDENTIFIER NOT NULL,
        requester_name NVARCHAR(120) NOT NULL,
        requester_role NVARCHAR(60) NOT NULL,
        region NVARCHAR(80) NOT NULL,
        requested_authority_role NVARCHAR(30) NOT NULL,
        status NVARCHAR(30) NOT NULL,
        value DECIMAL(18, 2) NOT NULL,
        request_date DATE NOT NULL,
        purpose NVARCHAR(500) NOT NULL,
        approved_by_role NVARCHAR(30) NULL,
        approved_at DATE NULL,
        revised_by_role NVARCHAR(30) NULL,
        revised_for_role NVARCHAR(30) NULL,
        revision_number INT NOT NULL CONSTRAINT DF_requests_revision_number DEFAULT 0,
        revised_at DATE NULL,
        transport_type NVARCHAR(20) NULL,
        vehicle_number NVARCHAR(30) NULL,
        driver_name NVARCHAR(120) NULL,
        courier_company NVARCHAR(120) NULL,
        tracking_number NVARCHAR(120) NULL,
        gate_pass_number NVARCHAR(50) NULL,
        dispatched_at DATE NULL,
        received_at DATE NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_requests_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_requests_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_requests_requester FOREIGN KEY (requester_user_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_requests_approver_role FOREIGN KEY (requested_authority_role) REFERENCES dbo.roles(role_id),
        CONSTRAINT FK_requests_approved_role FOREIGN KEY (approved_by_role) REFERENCES dbo.roles(role_id),
        CONSTRAINT FK_requests_revised_by_role FOREIGN KEY (revised_by_role) REFERENCES dbo.roles(role_id),
        CONSTRAINT FK_requests_revised_for_role FOREIGN KEY (revised_for_role) REFERENCES dbo.roles(role_id),
        CONSTRAINT CK_requests_value CHECK (value >= 0),
        CONSTRAINT CK_requests_revision CHECK (revision_number >= 0)
    );
END;
GO

IF OBJECT_ID(N'dbo.request_number_sequence', N'SO') IS NULL
    EXEC(N'CREATE SEQUENCE dbo.request_number_sequence AS INT START WITH 1 INCREMENT BY 1');
GO

IF OBJECT_ID(N'dbo.request_items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.request_items (
        request_item_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_request_items_id DEFAULT NEWID() PRIMARY KEY,
        request_id NVARCHAR(40) NOT NULL,
        material_id UNIQUEIDENTIFIER NULL,
        material_name NVARCHAR(120) NOT NULL,
        quantity INT NOT NULL,
        unit NVARCHAR(30) NOT NULL,
        CONSTRAINT FK_request_items_requests FOREIGN KEY (request_id) REFERENCES dbo.requests(request_id) ON DELETE CASCADE,
        CONSTRAINT FK_request_items_materials FOREIGN KEY (material_id) REFERENCES dbo.materials(material_id),
        CONSTRAINT CK_request_items_quantity CHECK (quantity > 0)
    );
END;
GO

MERGE dbo.roles AS target
USING (VALUES
    (N'executive', N'Executive'),
    (N'rm', N'Regional Manager'),
    (N'avp', N'Assistant Vice President'),
    (N'gm', N'General Manager'),
    (N'hr', N'HR'),
    (N'admin', N'Admin')
) AS source(role_id, display_name)
ON target.role_id = source.role_id
WHEN MATCHED THEN UPDATE SET display_name = source.display_name
WHEN NOT MATCHED THEN INSERT (role_id, display_name) VALUES (source.role_id, source.display_name);
GO

MERGE dbo.role_permissions AS target
USING (VALUES
    (N'executive', N'viewDashboard', 1), (N'executive', N'createRequests', 1), (N'executive', N'approveRequests', 0), (N'executive', N'manageEmployees', 0), (N'executive', N'manageMaterials', 0), (N'executive', N'dispatchRequests', 0), (N'executive', N'managePermissions', 0),
    (N'rm', N'viewDashboard', 1), (N'rm', N'createRequests', 0), (N'rm', N'approveRequests', 1), (N'rm', N'manageEmployees', 0), (N'rm', N'manageMaterials', 0), (N'rm', N'dispatchRequests', 0), (N'rm', N'managePermissions', 0),
    (N'avp', N'viewDashboard', 1), (N'avp', N'createRequests', 0), (N'avp', N'approveRequests', 1), (N'avp', N'manageEmployees', 0), (N'avp', N'manageMaterials', 0), (N'avp', N'dispatchRequests', 0), (N'avp', N'managePermissions', 0),
    (N'gm', N'viewDashboard', 1), (N'gm', N'createRequests', 0), (N'gm', N'approveRequests', 1), (N'gm', N'manageEmployees', 0), (N'gm', N'manageMaterials', 0), (N'gm', N'dispatchRequests', 0), (N'gm', N'managePermissions', 0),
    (N'hr', N'viewDashboard', 1), (N'hr', N'createRequests', 0), (N'hr', N'approveRequests', 0), (N'hr', N'manageEmployees', 1), (N'hr', N'manageMaterials', 1), (N'hr', N'dispatchRequests', 1), (N'hr', N'managePermissions', 0),
    (N'admin', N'viewDashboard', 1), (N'admin', N'createRequests', 1), (N'admin', N'approveRequests', 1), (N'admin', N'manageEmployees', 1), (N'admin', N'manageMaterials', 1), (N'admin', N'dispatchRequests', 1), (N'admin', N'managePermissions', 1)
) AS source(role_id, permission_key, is_enabled)
ON target.role_id = source.role_id AND target.permission_key = source.permission_key
WHEN NOT MATCHED THEN INSERT (role_id, permission_key, is_enabled) VALUES (source.role_id, source.permission_key, source.is_enabled);
GO
