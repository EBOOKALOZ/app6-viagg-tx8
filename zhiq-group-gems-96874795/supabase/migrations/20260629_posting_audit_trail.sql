-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: posting_audit_trail
-- Objetivo: Sistema de auditoria operacional das postagens
-- Projeto:  broifhfqmnzqoongtokm
-- Data:     2026-06-29
--
-- ATENÇÃO: Rodar manualmente no SQL Editor do Supabase.
-- NUNCA usar `supabase db push`.
--
-- Este arquivo é IDEMPOTENTE — pode ser executado múltiplas vezes
-- sem efeitos colaterais.
-- ═══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- 1. Adicionar colunas de auditoria à tabela posting_history
--    (colunas novas; as existentes não são tocadas)
-- ────────────────────────────────────────────────────────────────
ALTER TABLE posting_history
  ADD COLUMN IF NOT EXISTS profile_type  TEXT,            -- postador | motoboy | mototaxi | driver | system
  ADD COLUMN IF NOT EXISTS platform      TEXT DEFAULT 'whatsapp', -- whatsapp | telegram | facebook | instagram
  ADD COLUMN IF NOT EXISTS started_at    TIMESTAMPTZ,     -- quando a tentativa de postagem foi iniciada
  ADD COLUMN IF NOT EXISTS elapsed_ms    INT,             -- tempo total de execução em milissegundos
  ADD COLUMN IF NOT EXISTS error_code    TEXT,            -- código específico de erro (ex: 4xx, RATE_LIMIT)
  ADD COLUMN IF NOT EXISTS group_name    TEXT,            -- nome do grupo (desnormalizado para consultas rápidas)
  ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 1;   -- número de tentativas

COMMENT ON COLUMN posting_history.profile_type  IS 'Perfil que realizou a postagem: postador | motoboy | mototaxi | driver | system';
COMMENT ON COLUMN posting_history.platform      IS 'Plataforma de destino: whatsapp | telegram | facebook | instagram';
COMMENT ON COLUMN posting_history.started_at    IS 'Timestamp do início da tentativa de postagem';
COMMENT ON COLUMN posting_history.elapsed_ms    IS 'Tempo total de execução em milissegundos';
COMMENT ON COLUMN posting_history.error_code    IS 'Código de erro retornado pela API ou sistema';
COMMENT ON COLUMN posting_history.group_name    IS 'Nome do grupo desnormalizado para exibição rápida';
COMMENT ON COLUMN posting_history.attempt_count IS 'Número total de tentativas para esta postagem';

-- ────────────────────────────────────────────────────────────────
-- 2. Índices adicionais em posting_history (só para as novas colunas)
-- ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_posting_history_profile_type ON posting_history (profile_type);
CREATE INDEX IF NOT EXISTS idx_posting_history_platform     ON posting_history (platform);
CREATE INDEX IF NOT EXISTS idx_posting_history_started_at   ON posting_history (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_posting_history_final_status ON posting_history (final_status);

-- ────────────────────────────────────────────────────────────────
-- 3. Tabela posting_timeline_events
--    Linha do tempo detalhada de cada postagem (opcional, mas recomendada)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posting_timeline_events (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  posting_history_id  UUID        REFERENCES posting_history(id) ON DELETE CASCADE,
  posting_lot_id      UUID        REFERENCES posting_lots(id)    ON DELETE CASCADE,
  event_type          TEXT        NOT NULL,    -- queued | processing | group_selected | sent | error | retry | cancelled | completed
  event_label         TEXT        NOT NULL,    -- texto legível para exibição
  event_detail        TEXT,                    -- detalhes adicionais
  metadata            JSONB       DEFAULT '{}'::jsonb,
  actor_user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_profile       TEXT,                    -- postador | motoboy | mototaxi | driver | system | glm
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE posting_timeline_events IS 'Linha do tempo por postagem — rastreamento passo a passo do ciclo de vida operacional';

CREATE INDEX IF NOT EXISTS idx_timeline_posting_history_id ON posting_timeline_events (posting_history_id);
CREATE INDEX IF NOT EXISTS idx_timeline_posting_lot_id     ON posting_timeline_events (posting_lot_id);
CREATE INDEX IF NOT EXISTS idx_timeline_created_at         ON posting_timeline_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_event_type         ON posting_timeline_events (event_type);

-- ────────────────────────────────────────────────────────────────
-- 4. RLS para posting_timeline_events
-- ────────────────────────────────────────────────────────────────
ALTER TABLE posting_timeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_timeline_events"       ON posting_timeline_events;
DROP POLICY IF EXISTS "auth_read_own_timeline_events"   ON posting_timeline_events;
DROP POLICY IF EXISTS "auth_insert_timeline_events"     ON posting_timeline_events;

CREATE POLICY "admin_all_timeline_events"
  ON posting_timeline_events FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "auth_read_own_timeline_events"
  ON posting_timeline_events FOR SELECT
  TO authenticated
  USING (actor_user_id = auth.uid());

CREATE POLICY "auth_insert_timeline_events"
  ON posting_timeline_events FOR INSERT
  TO authenticated
  WITH CHECK (actor_user_id = auth.uid() OR actor_user_id IS NULL);

-- ────────────────────────────────────────────────────────────────
-- 5. Trigger: ao marcar posting_lots.status = 'posted',
--    cria automaticamente um evento de auditoria.
--    Registro automático sem nenhuma ação do usuário.
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_auto_audit_lot_posted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só dispara quando status muda para 'posted' ou 'confirmed'
  IF (NEW.status IN ('posted', 'confirmed'))
     AND (OLD.status IS NULL OR OLD.status NOT IN ('posted', 'confirmed'))
  THEN
    INSERT INTO posting_timeline_events (
      posting_lot_id,
      event_type,
      event_label,
      event_detail,
      actor_user_id,
      actor_profile,
      metadata
    ) VALUES (
      NEW.id,
      'completed',
      'Lote postado com sucesso',
      CONCAT('Loja: ', COALESCE(NEW.store_name, '?'), ' | Cidade: ', COALESCE(NEW.target_city, '?')),
      NEW.operator_user_id,
      'postador',
      jsonb_build_object(
        'store_name',  NEW.store_name,
        'target_city', NEW.target_city,
        'lot_number',  NEW.lot_number,
        'items_count', NEW.items_count
      )
    );
  END IF;

  -- Se status muda para 'cancelled' ou 'expired'
  IF (NEW.status IN ('cancelled', 'expired'))
     AND (OLD.status NOT IN ('cancelled', 'expired'))
  THEN
    INSERT INTO posting_timeline_events (
      posting_lot_id,
      event_type,
      event_label,
      actor_user_id,
      actor_profile,
      metadata
    ) VALUES (
      NEW.id,
      NEW.status,
      CASE WHEN NEW.status = 'cancelled' THEN 'Lote cancelado' ELSE 'Lote expirado' END,
      NEW.operator_user_id,
      'system',
      jsonb_build_object('previous_status', OLD.status)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_lot_posted ON posting_lots;
CREATE TRIGGER trg_audit_lot_posted
  AFTER UPDATE ON posting_lots
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_audit_lot_posted();

-- ────────────────────────────────────────────────────────────────
-- 6. View: posting_audit_full_view
--    Para o painel administrativo de auditoria
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW posting_audit_full_view AS
SELECT
  ph.id,
  ph.created_at,
  ph.started_at,
  ph.posted_at,
  COALESCE(ph.final_status, ph.status, 'unknown')                   AS final_status,
  COALESCE(ph.profile_type, 'postador')                             AS profile_type,
  COALESCE(ph.platform, 'whatsapp')                                 AS platform,
  ph.attempt_count,
  ph.elapsed_ms,
  -- Grupo
  ph.whatsapp_group_id,
  COALESCE(ph.group_name, wg.name, wg.group_name, '—')             AS group_name,
  -- Campanha
  ph.campaign_queue_id,
  COALESCE(ph.title, ph.campaign_title, cq.title, '—')             AS campaign_title,
  COALESCE(ph.campaign_type, cq.campaign_type, '—')                AS campaign_type,
  -- Mensagem / Resultado
  ph.message_text,
  ph.execution_notes,
  ph.error_message,
  ph.error_code,
  ph.proof_url,
  ph.proof_type,
  -- Operador
  ph.operator_user_id,
  COALESCE(p.display_name, p.full_name, p.email, '—')              AS operator_name
FROM posting_history ph
LEFT JOIN whatsapp_groups  wg ON wg.id  = ph.whatsapp_group_id
LEFT JOIN campaign_queue   cq ON cq.id  = ph.campaign_queue_id
LEFT JOIN profiles         p  ON p.id   = ph.operator_user_id;

-- ────────────────────────────────────────────────────────────────
-- 7. View: posting_audit_group_stats
--    Estatísticas por grupo (para histórico do grupo)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW posting_audit_group_stats AS
SELECT
  ph.whatsapp_group_id,
  COALESCE(ph.group_name, wg.name, wg.group_name, ph.whatsapp_group_id::text) AS group_name,
  COUNT(*)                                                                      AS total_postings,
  COUNT(*) FILTER (
    WHERE COALESCE(ph.final_status, ph.status) IN ('sent','posted','confirmed','success')
  )                                                                             AS success_count,
  COUNT(*) FILTER (
    WHERE COALESCE(ph.final_status, ph.status) IN ('error','failed','failure')
  )                                                                             AS error_count,
  ROUND(
    COUNT(*) FILTER (
      WHERE COALESCE(ph.final_status, ph.status) IN ('sent','posted','confirmed','success')
    )::numeric / NULLIF(COUNT(*), 0) * 100, 1
  )                                                                             AS success_rate_pct,
  MAX(ph.posted_at)                                                             AS last_posted_at,
  MIN(ph.created_at)                                                            AS first_posted_at,
  ROUND(AVG(ph.elapsed_ms))                                                    AS avg_elapsed_ms
FROM posting_history ph
LEFT JOIN whatsapp_groups wg ON wg.id = ph.whatsapp_group_id
WHERE ph.whatsapp_group_id IS NOT NULL
GROUP BY ph.whatsapp_group_id,
         COALESCE(ph.group_name, wg.name, wg.group_name, ph.whatsapp_group_id::text);

-- ────────────────────────────────────────────────────────────────
-- 8. View: posting_audit_operator_stats
--    Estatísticas por operador e perfil
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW posting_audit_operator_stats AS
SELECT
  ph.operator_user_id,
  COALESCE(p.display_name, p.full_name, p.email, ph.operator_user_id::text) AS operator_name,
  COALESCE(ph.profile_type, 'postador')                                       AS profile_type,
  COUNT(*)                                                                     AS total_postings,
  COUNT(*) FILTER (
    WHERE COALESCE(ph.final_status, ph.status) IN ('sent','posted','confirmed','success')
  )                                                                            AS success_count,
  COUNT(*) FILTER (
    WHERE COALESCE(ph.final_status, ph.status) IN ('error','failed','failure')
  )                                                                            AS error_count,
  ROUND(AVG(ph.elapsed_ms))                                                   AS avg_elapsed_ms,
  MAX(ph.posted_at)                                                            AS last_posted_at
FROM posting_history ph
LEFT JOIN profiles p ON p.id = ph.operator_user_id
WHERE ph.operator_user_id IS NOT NULL
GROUP BY ph.operator_user_id,
         COALESCE(p.display_name, p.full_name, p.email, ph.operator_user_id::text),
         COALESCE(ph.profile_type, 'postador');

-- ────────────────────────────────────────────────────────────────
-- 9. Permissões de leitura nas views para usuários autenticados
-- ────────────────────────────────────────────────────────────────
GRANT SELECT ON posting_audit_full_view        TO authenticated;
GRANT SELECT ON posting_audit_group_stats      TO authenticated;
GRANT SELECT ON posting_audit_operator_stats   TO authenticated;

-- ────────────────────────────────────────────────────────────────
-- Verificação final: listar objetos criados
-- ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✅ Migration posting_audit_trail concluída com sucesso.';
  RAISE NOTICE '   - Colunas adicionadas a posting_history: profile_type, platform, started_at, elapsed_ms, error_code, group_name, attempt_count';
  RAISE NOTICE '   - Tabela criada: posting_timeline_events';
  RAISE NOTICE '   - Trigger criado: trg_audit_lot_posted (auto-registro ao marcar lote como postado)';
  RAISE NOTICE '   - Views criadas: posting_audit_full_view, posting_audit_group_stats, posting_audit_operator_stats';
END $$;
