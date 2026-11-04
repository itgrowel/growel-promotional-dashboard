IF COL_LENGTH(N'dbo.signup_requests', N'requested_role') IS NULL
    ALTER TABLE dbo.signup_requests ADD requested_role NVARCHAR(30) NOT NULL
        CONSTRAINT DF_signup_requests_requested_role DEFAULT N'executive';
GO

IF COL_LENGTH(N'dbo.signup_requests', N'approval_authority_role') IS NULL
    ALTER TABLE dbo.signup_requests ADD approval_authority_role NVARCHAR(30) NULL;
GO

IF COL_LENGTH(N'dbo.employees', N'approval_authority_role') IS NULL
    ALTER TABLE dbo.employees ADD approval_authority_role NVARCHAR(30) NULL;
GO
