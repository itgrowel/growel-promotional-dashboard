IF COL_LENGTH(N'dbo.materials', N'language') IS NULL
    ALTER TABLE dbo.materials ADD language NVARCHAR(30) NULL;
GO

UPDATE dbo.materials
SET
    language = CASE name
        WHEN N'Brochures (Hindi)' THEN N'Hindi'
        WHEN N'Brochures (English)' THEN N'English'
        WHEN N'Brochures (Bengali)' THEN N'Bengali'
        WHEN N'Brochures (Marathi)' THEN N'Marathi'
        ELSE NULL
    END,
    name = N'Brochures'
WHERE name IN (
    N'Brochures (Multi-language)',
    N'Brochures (Hindi)',
    N'Brochures (English)',
    N'Brochures (Bengali)',
    N'Brochures (Marathi)'
);
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_materials_language'
      AND parent_object_id = OBJECT_ID(N'dbo.materials')
)
    ALTER TABLE dbo.materials
        ADD CONSTRAINT CK_materials_language
        CHECK (language IS NULL OR language IN (N'Hindi', N'English', N'Bengali', N'Marathi'));
GO
