SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('shc_modules', 'shc_corrections')
ORDER BY table_name, ordinal_position;
