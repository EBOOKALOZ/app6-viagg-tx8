-- Verificar ENUMs existentes
SELECT typname FROM pg_type WHERE typtype = 'e' AND typname LIKE 'shc_%';
