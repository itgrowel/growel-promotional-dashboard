IF OBJECT_ID(N'dbo.signup_requests', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.signup_requests (
        signup_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_signup_requests_id DEFAULT NEWID() PRIMARY KEY,
        email NVARCHAR(254) NOT NULL UNIQUE,
        display_name NVARCHAR(120) NOT NULL,
        password_hash NVARCHAR(300) NOT NULL,
        region NVARCHAR(80) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_signup_requests_created_at DEFAULT SYSUTCDATETIME()
    );
END;
GO
