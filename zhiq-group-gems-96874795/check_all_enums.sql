-- Verificar todos os valores de todos os ENUMs SHC
SELECT t.typname, e.enumlabel
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname LIKE 'shc_%'
ORDER BY t.typname, e.enumsortorder;

-- Verificar o status padrão da tabela shc_modules
SELECT column_name, column_default, data_type, udt_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='shc_modules';
