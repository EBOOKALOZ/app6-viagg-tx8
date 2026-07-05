-- ============================================================
-- M58.1 · Grants dos datasets p/ o Painel Executivo
-- Projeto: broifhfqmnzqoongtokm
-- Data: 2026-07-04
-- EXECUTAR: SQL Editor — após a 20260704_063 (fila de deploy)
-- ============================================================
-- Escopo MÍNIMO: apenas GRANT EXECUTE p/ authenticated em 4
-- datasets que JÁ possuem guarda interna is_admin() (provada na
-- CTF6). Sem elas, um admin logado via JWT recebe erro de ACL
-- antes da guarda rodar — o Executive Dashboard (M58.1) precisa
-- chamá-las pelo cliente. Mesmo padrão do cio_alert_dashboard.
-- ZERO mudanças de assinatura, corpo, contrato ou regra.
-- ============================================================

DO $$
BEGIN
  IF to_regprocedure('public.cio_authorize(text)') IS NULL THEN
    RAISE EXCEPTION 'M58.1 BLOQUEADA — aplicar 20260704_063 antes';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.cio_operational_dataset() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cio_noc_dataset() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cio_health_executive() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cio_governance_dataset() TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- VERIFICAÇÃO
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE f TEXT; v_anon INT; v JSONB;
BEGIN
  FOREACH f IN ARRAY ARRAY['cio_operational_dataset()','cio_noc_dataset()',
    'cio_health_executive()','cio_governance_dataset()'] LOOP
    IF NOT has_function_privilege('authenticated', ('public.'||f)::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'M58.1 ERRO: authenticated sem EXECUTE em %', f; END IF;
    IF has_function_privilege('anon', ('public.'||f)::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'M58.1 ERRO: anon com EXECUTE em %', f; END IF;
  END LOOP;
  SELECT COUNT(*) INTO v_anon
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND (p.proname LIKE 'cio_%' OR p.proname LIKE 'motor_%')
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_anon > 0 THEN
    RAISE EXCEPTION 'M58.1 ERRO: % funções expostas a anon', v_anon; END IF;
  v := public.cio_semantic_validate();
  IF NOT (v->>'aprovado')::boolean THEN
    RAISE EXCEPTION 'M58.1 ERRO: catálogo reprovado: %', v->'issues'; END IF;

  RAISE NOTICE 'M58.1 ✓ 4 datasets com EXECUTE p/ authenticated (guarda is_admin interna decide) — OK';
  RAISE NOTICE 'M58.1 ✓ anon segue 100%% fora; contratos e corpos intocados — OK';
END $$;
