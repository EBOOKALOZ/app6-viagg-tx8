SELECT jsonb_build_object('q','tabelas_rbac', 'rows', jsonb_agg(c.relname ORDER BY c.relname))
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND (c.relname LIKE '%role%' OR c.relname LIKE '%permission%');
