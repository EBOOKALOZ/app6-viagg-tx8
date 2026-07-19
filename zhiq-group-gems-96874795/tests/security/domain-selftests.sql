-- ============================================================
-- ORION-HARDENING — Selftests de DOMÍNIO (Leilão/Arremate · Reputação/ALC)
-- Base permanente (FASE 2 · ETAPA 3). Agrega os selftests vivos do banco e
-- RAISE se algum domínio regredir. Rodar após qualquer migration de domínio.
-- ============================================================
DO $$
DECLARE v jsonb; v_txt text;
BEGIN
  -- LEILÃO/ARREMATE — segurança (RLS + anon sem DML + regra de comissão ativa)
  v := public.auction_security_selftest();
  IF COALESCE((v->>'pass_geral')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'DOM-LEILAO FALHOU: auction_security_selftest pass_geral<>true → %', v;
  END IF;
  IF COALESCE((v#>>'{anon_sem_dml,grants_dml_anon}')::int, -1) <> 0 THEN
    RAISE EXCEPTION 'DOM-LEILAO FALHOU: anon com DML no domínio leilão → %', v#>'{anon_sem_dml}';
  END IF;

  -- REPUTAÇÃO/ALC (AI-74) — 14/14 esperado; EXECUTE anon em rep_* = 0
  v := public.rep_selftest();
  v_txt := v->>'score';
  IF v_txt IS DISTINCT FROM '14/14' THEN
    RAISE EXCEPTION 'DOM-REPUTACAO FALHOU: rep_selftest score=% (esperado 14/14)', v_txt;
  END IF;

  RAISE NOTICE 'SELFTESTS DE DOMÍNIO OK: leilao(pass_geral+anon_dml=0) reputacao(%)', v_txt;
  -- NOTA: aeo_selftest (AI-70) NÃO é incluído aqui — depende de orion_auction_finalize_log,
  -- tabela ausente por DRIFT pré-existente (P2, documentado no HOTFIX A.0). Reabilitar
  -- este check quando o drift for corrigido.
END $$;
