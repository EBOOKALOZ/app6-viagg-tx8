-- ═══════════════════════════════════════════════════════════════════════════
-- ORION — Auditoria Corretiva · Doações & Convênios (fecha P2/P3 da auditoria
-- READ-ONLY de 2026-08-05):
--
--   1. P2 "Total Público Incorreto" — RPC convenio_public_stats(): agregação
--      100% server-side (SUM/COUNT sobre TODOS os registros válidos), elimina
--      o cálculo no cliente baseado em .limit(20). SECURITY DEFINER expõe
--      apenas agregados (nenhuma linha/PII); EXECUTE para anon+authenticated.
--
--   2. P2 "Raised Amount" — convenio_campaigns.raised_amount deixa de ser
--      manual: trigger em convenio_donations mantém o valor como
--      SUM(amount) das doações confirmadas da campanha (INSERT, UPDATE de
--      status/valor/campanha e DELETE), com backfill idempotente. Estorno
--      (confirmada → estornada) subtrai automaticamente.
--
--   3. P3 "Máquina de Estados" — trigger convenio_enforce_status_transition
--      nas 5 tabelas com workflow (agreements, campaigns, donations,
--      accountability, entities). Fail-closed no banco: bloqueia
--      rascunho → encerrado, encerrado → ativo e qualquer salto inválido,
--      inclusive via RPC/REST direta (bypass do frontend). Espelho exato de
--      src/lib/convenio/statusTransitions.ts.
--
-- Projeto: broifhfqmnzqoongtokm — idempotente; aplicar via SQL Editor ou
-- supabase db query --file — NUNCA supabase db push.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Estatísticas públicas agregadas (P2 — Total Público)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.convenio_public_stats()
RETURNS TABLE (
  total_arrecadado      NUMERIC,
  doacoes_confirmadas   BIGINT,
  total_destinado       NUMERIC,
  convenios_beneficiados BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE((SELECT SUM(d.amount) FROM public.convenio_donations d WHERE d.status = 'confirmada'), 0)::NUMERIC,
    (SELECT COUNT(*) FROM public.convenio_donations d WHERE d.status = 'confirmada'),
    COALESCE((SELECT SUM(c.raised_amount) FROM public.convenio_campaigns c WHERE c.status IN ('ativa', 'encerrada')), 0)::NUMERIC,
    (SELECT COUNT(*) FROM public.convenio_campaigns c WHERE c.status = 'ativa');
$$;

COMMENT ON FUNCTION public.convenio_public_stats() IS
'Painel público MedPrev: agregados de doações confirmadas e campanhas públicas. Somente números — nenhuma linha ou PII é exposta.';

REVOKE ALL ON FUNCTION public.convenio_public_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convenio_public_stats() TO anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. raised_amount automático (P2 — Raised Amount + Estorno)
-- ───────────────────────────────────────────────────────────────────────────
-- Recalcula por soma (idempotente, sem drift): a campanha afetada recebe
-- SUM(amount) das doações confirmadas. SECURITY DEFINER para que um INSERT
-- futuro de gateway (anon/service) consiga sincronizar a campanha mesmo sem
-- UPDATE direto em convenio_campaigns.
CREATE OR REPLACE FUNCTION public.convenio_sync_campaign_raised()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign UUID;
BEGIN
  FOR v_campaign IN
    SELECT DISTINCT c_id FROM (
      SELECT CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.campaign_id END AS c_id
      UNION
      SELECT CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.campaign_id END
    ) t WHERE c_id IS NOT NULL
  LOOP
    UPDATE public.convenio_campaigns c
    SET raised_amount = COALESCE((
          SELECT SUM(d.amount) FROM public.convenio_donations d
          WHERE d.campaign_id = c.id AND d.status = 'confirmada'
        ), 0),
        updated_at = now()
    WHERE c.id = v_campaign;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_convenio_sync_campaign_raised ON public.convenio_donations;
CREATE TRIGGER trg_convenio_sync_campaign_raised
  AFTER INSERT OR UPDATE OF status, amount, campaign_id OR DELETE
  ON public.convenio_donations
  FOR EACH ROW EXECUTE FUNCTION public.convenio_sync_campaign_raised();

-- Backfill idempotente: alinha campanhas existentes à soma real.
UPDATE public.convenio_campaigns c
SET raised_amount = sub.total
FROM (
  SELECT c2.id,
         COALESCE((SELECT SUM(d.amount) FROM public.convenio_donations d
                   WHERE d.campaign_id = c2.id AND d.status = 'confirmada'), 0) AS total
  FROM public.convenio_campaigns c2
) sub
WHERE sub.id = c.id AND c.raised_amount IS DISTINCT FROM sub.total;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Máquina de estados fail-closed (P3)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.convenio_enforce_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_allowed TEXT[];
BEGIN
  -- Atualizações que não mudam o status (edições de outros campos, sync de
  -- raised_amount etc.) nunca são bloqueadas.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_allowed := CASE TG_TABLE_NAME
    WHEN 'convenio_agreements' THEN
      CASE OLD.status
        WHEN 'rascunho'      THEN ARRAY['em_aprovacao']
        WHEN 'em_aprovacao'  THEN ARRAY['ativo', 'rascunho']
        WHEN 'ativo'         THEN ARRAY['suspenso', 'encerrado']
        WHEN 'suspenso'      THEN ARRAY['ativo', 'encerrado']
        ELSE ARRAY[]::TEXT[]                                  -- encerrado = terminal
      END
    WHEN 'convenio_campaigns' THEN
      CASE OLD.status
        WHEN 'planejada' THEN ARRAY['ativa']
        WHEN 'ativa'     THEN ARRAY['pausada', 'encerrada']
        WHEN 'pausada'   THEN ARRAY['ativa', 'encerrada']
        ELSE ARRAY[]::TEXT[]                                  -- encerrada = terminal
      END
    WHEN 'convenio_donations' THEN
      CASE OLD.status
        WHEN 'registrada' THEN ARRAY['confirmada', 'estornada']
        WHEN 'confirmada' THEN ARRAY['estornada']
        ELSE ARRAY[]::TEXT[]                                  -- estornada = terminal
      END
    WHEN 'convenio_accountability' THEN
      CASE OLD.status
        WHEN 'rascunho'  THEN ARRAY['publicada']
        WHEN 'publicada' THEN ARRAY['arquivada']
        ELSE ARRAY[]::TEXT[]                                  -- arquivada = terminal
      END
    WHEN 'convenio_entities' THEN
      CASE OLD.status
        WHEN 'em_analise' THEN ARRAY['ativo', 'reprovado']
        WHEN 'ativo'      THEN ARRAY['suspenso', 'encerrado']
        WHEN 'suspenso'   THEN ARRAY['ativo', 'encerrado']
        WHEN 'reprovado'  THEN ARRAY['em_analise']
        ELSE ARRAY[]::TEXT[]                                  -- encerrado = terminal
      END
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (NEW.status = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'CONVENIO_INVALID_STATUS_TRANSITION: % → % não é permitido em %',
      OLD.status, NEW.status, TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.convenio_enforce_status_transition() IS
'Máquina de estados do módulo Doações & Convênios (espelho de src/lib/convenio/statusTransitions.ts). Fail-closed: transição fora do workflow é rejeitada mesmo via REST/RPC direta.';

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'convenio_agreements', 'convenio_campaigns', 'convenio_donations',
    'convenio_accountability', 'convenio_entities'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_convenio_status_transition ON public.%I;', t);
    EXECUTE format(
      'CREATE TRIGGER trg_convenio_status_transition BEFORE UPDATE OF status ON public.%I FOR EACH ROW EXECUTE FUNCTION public.convenio_enforce_status_transition();',
      t
    );
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Imutabilidade da trilha de auditoria (fecha o P1 remanescente da
--    auditoria de 2026-08-03: "audit_log adulterável")
-- ───────────────────────────────────────────────────────────────────────────
-- convenio_audit_log e convenio_agreement_history passam a ser SELECT-only
-- para o Gestor. Só os triggers SECURITY DEFINER (owner postgres, bypass de
-- RLS) escrevem nelas — nenhum papel de aplicação consegue inserir, alterar
-- ou apagar a trilha.
DROP POLICY IF EXISTS convenio_audit_log_gestor_all ON public.convenio_audit_log;
DROP POLICY IF EXISTS convenio_audit_log_gestor_select ON public.convenio_audit_log;
CREATE POLICY convenio_audit_log_gestor_select ON public.convenio_audit_log
  FOR SELECT TO authenticated USING (public.is_gestor_convenio());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.convenio_audit_log FROM anon, authenticated;
GRANT SELECT ON public.convenio_audit_log TO authenticated;

DROP POLICY IF EXISTS convenio_agreement_history_gestor_all ON public.convenio_agreement_history;
DROP POLICY IF EXISTS convenio_agreement_history_gestor_select ON public.convenio_agreement_history;
CREATE POLICY convenio_agreement_history_gestor_select ON public.convenio_agreement_history
  FOR SELECT TO authenticated USING (public.is_gestor_convenio());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.convenio_agreement_history FROM anon, authenticated;
GRANT SELECT ON public.convenio_agreement_history TO authenticated;

-- Hardening: search_path fixado também na função de transição (não referencia
-- tabelas, mas segue o padrão do módulo).
ALTER FUNCTION public.convenio_enforce_status_transition() SET search_path = public, pg_temp;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ Convênio P2/P3: convenio_public_stats() criada (agregados públicos), raised_amount sincronizado por trigger + backfill, máquina de estados ativa em 5 tabelas, trilha de auditoria imutável (SELECT-only).';
END $$;
