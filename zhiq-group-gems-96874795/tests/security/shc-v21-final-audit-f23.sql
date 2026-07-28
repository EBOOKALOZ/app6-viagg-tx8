-- AUDITORIA FINAL SHC v2.1 — Fases 2 (segurança), 3 (RLS), 7 (banco). Somente leitura. Saída única JSON.
SELECT jsonb_build_object(
'tabelas_shc', (
  SELECT jsonb_agg(jsonb_build_object('table', c.relname, 'rls', c.relrowsecurity, 'forced', c.relforcerowsecurity) ORDER BY c.relname)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'shc\_%'),
'policies_shc', (
  SELECT jsonb_agg(jsonb_build_object('t', tablename, 'p', policyname, 'cmd', cmd, 'roles', roles::text, 'qual', qual, 'check', with_check) ORDER BY tablename, cmd, policyname)
  FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'shc\_%'),
'policies_duplicadas', (
  SELECT jsonb_agg(jsonb_build_object('t', tablename, 'cmd', cmd, 'n', n, 'pols', pols)) FROM (
    SELECT tablename, cmd, count(*) n, array_agg(policyname)::text pols
    FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'shc\_%' AND permissive='PERMISSIVE'
    GROUP BY tablename, cmd HAVING count(*) > 1) d),
'funcoes_criticas', (
  SELECT jsonb_agg(jsonb_build_object('fn', p.proname, 'args', pg_get_function_identity_arguments(p.oid),
    'secdef', p.prosecdef, 'owner', pg_get_userbyid(p.proowner),
    'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
    'auth', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    'svc', has_function_privilege('service_role', p.oid, 'EXECUTE')))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('has_permission','is_admin','shc_run_module_audit')),
'src_has_permission', (
  SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='has_permission' LIMIT 1),
'src_is_admin', (
  SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='is_admin' AND pg_get_function_identity_arguments(p.oid)='' LIMIT 1),
'system_roles', (SELECT jsonb_agg(to_jsonb(r)) FROM public.system_roles r),
'role_permissions_shc', (SELECT jsonb_agg(to_jsonb(rp)) FROM public.role_permissions rp WHERE rp::text ILIKE '%shc%'),
'system_permissions_shc', (SELECT jsonb_agg(to_jsonb(p)) FROM public.system_permissions p WHERE p::text ILIKE '%shc%'),
'user_role_assignments', (
  SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT ura.*, u.email FROM public.user_role_assignments ura
    LEFT JOIN auth.users u ON u.id = ura.user_id) x),
'user_roles_all', (
  SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT ur.*, u.email FROM public.user_roles ur
    LEFT JOIN auth.users u ON u.id = ur.user_id) x),
'table_grants_shc', (
  SELECT jsonb_agg(jsonb_build_object('t', c.relname,
    'anon_sel', has_table_privilege('anon', c.oid, 'SELECT'),
    'auth_sel', has_table_privilege('authenticated', c.oid, 'SELECT'),
    'auth_ins', has_table_privilege('authenticated', c.oid, 'INSERT'),
    'auth_upd', has_table_privilege('authenticated', c.oid, 'UPDATE'),
    'auth_del', has_table_privilege('authenticated', c.oid, 'DELETE')) ORDER BY c.relname)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'shc\_%'),
'funcoes_shc_todas', (
  SELECT jsonb_agg(jsonb_build_object('fn', p.proname, 'args', pg_get_function_identity_arguments(p.oid),
    'secdef', p.prosecdef,
    'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
    'auth', has_function_privilege('authenticated', p.oid, 'EXECUTE')))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE 'shc\_%')
) AS audit;
