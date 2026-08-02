-- Comando Convênio · FASE 1 — correção P0: REVOKE de SELECT concedido a
-- `anon` por default privilege do projeto (ALTER DEFAULT PRIVILEGES dispara
-- em todo CREATE TABLE novo). RLS já bloqueava a leitura de dados (nenhuma
-- policy casava com anon → 0 linhas), mas o GRANT de tabela deixava as 8
-- tabelas administrativas + a view de dashboard respondendo 200 (vazio) em
-- vez de 401/403 para anon — superfície desnecessária e frágil: bastaria uma
-- policy futura mal escopada para vazar dados reais.
--
-- Mantém o GRANT de anon apenas nas 3 tabelas com policy pública de
-- transparência (convenio_campaigns, convenio_donations, convenio_accountability),
-- que dependem dele para a página pública /medprev funcionar.
--
-- Projeto: broifhfqmnzqoongtokm — aplicar via SQL Editor — NUNCA supabase db push

BEGIN;

REVOKE SELECT ON public.convenio_entities            FROM anon;
REVOKE SELECT ON public.convenio_agreements           FROM anon;
REVOKE SELECT ON public.convenio_agreement_history    FROM anon;
REVOKE SELECT ON public.convenio_financial_records    FROM anon;
REVOKE SELECT ON public.convenio_audit_log            FROM anon;
REVOKE SELECT ON public.convenio_messages             FROM anon;
REVOKE SELECT ON public.convenio_ai_notes             FROM anon;
REVOKE SELECT ON public.convenio_settings             FROM anon;
REVOKE SELECT ON public.convenio_dashboard_stats      FROM anon;

COMMIT;

SELECT table_name, grantee
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name LIKE 'convenio%' AND grantee = 'anon'
ORDER BY table_name;
