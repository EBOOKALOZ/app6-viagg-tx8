-- P0-10 — verificar que não existe função DEFINER sem search_path executável por anon
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef = true
  AND n.nspname = 'public'
  AND (p.proconfig IS NULL
       OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
  AND p.proname NOT LIKE 'st\_%';
