-- Verificar os valores do enum shc_status
SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'shc_status') ORDER BY enumsortorder;
