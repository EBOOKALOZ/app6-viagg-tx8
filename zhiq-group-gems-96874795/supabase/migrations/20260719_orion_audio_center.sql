-- ============================================================
-- ORION-AUDIO-01 — ORION Audio Center v1.0 · 2026-07-19
--
-- Cria a camada de dados do Centro Inteligente de Áudio:
--   · orion_audio_settings  — config de áudio POR USUÁRIO (sincronização entre aparelhos)
--   · orion_audio_presets   — presets personalizados do usuário (manual / teste de som / IA)
--   · orion_audio_events    — telemetria leve (preset aplicado, IA on/off, uso, teste, guarda anti-distorção)
--   · orion_audio_admin_stats() — estatísticas p/ /admin/orion-audio (gated mp_is_admin)
--
-- Decisões: dados 100% por usuário (RLS dono); anon NUNCA lê/escreve;
-- DSP roda no cliente (Web Audio) — banco guarda estado + telemetria.
-- Convenções ORION: evidência/_auditoria, lacunas declaradas, REVOKE EXECUTE FROM PUBLIC,anon.
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- Gate defensivo: avisa (sem abortar) se mp_is_admin não existir neste banco
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'mp_is_admin'
  ) THEN
    RAISE WARNING 'mp_is_admin() não existe — orion_audio_admin_stats negará acesso a todos até existir';
  END IF;
END $$;

-- ── 1) Configuração por usuário ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_audio_settings (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orion_audio_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orion_audio_settings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orion_audio_settings TO authenticated;
GRANT ALL ON public.orion_audio_settings TO service_role;

DROP POLICY IF EXISTS orion_audio_settings_own ON public.orion_audio_settings;
CREATE POLICY orion_audio_settings_own ON public.orion_audio_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 2) Presets personalizados ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_audio_presets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome       text NOT NULL,
  bands      jsonb NOT NULL,                 -- { eq10: number[10], boosters?: {...} }
  origem     text NOT NULL DEFAULT 'manual'
             CHECK (origem IN ('manual','teste_som','ai','importado')),
  criado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, nome)
);

ALTER TABLE public.orion_audio_presets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orion_audio_presets FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orion_audio_presets TO authenticated;
GRANT ALL ON public.orion_audio_presets TO service_role;

DROP POLICY IF EXISTS orion_audio_presets_own ON public.orion_audio_presets;
CREATE POLICY orion_audio_presets_own ON public.orion_audio_presets
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 3) Telemetria leve ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_audio_events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL DEFAULT auth.uid(),
  evento     text NOT NULL,                  -- preset_apply | ai_on | ai_off | uso | teste_som | distortion_guard | panel_open
  detalhes   jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orion_audio_events_evento
  ON public.orion_audio_events (evento, criado_em DESC);

ALTER TABLE public.orion_audio_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orion_audio_events FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.orion_audio_events TO authenticated;
GRANT ALL ON public.orion_audio_events TO service_role;

DROP POLICY IF EXISTS orion_audio_events_ins ON public.orion_audio_events;
CREATE POLICY orion_audio_events_ins ON public.orion_audio_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS orion_audio_events_sel ON public.orion_audio_events;
CREATE POLICY orion_audio_events_sel ON public.orion_audio_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── 4) Estatísticas administrativas ─────────────────────────
CREATE OR REPLACE FUNCTION public.orion_audio_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado: requer admin';
  END IF;

  SELECT jsonb_build_object(
    'usuarios_com_config', (SELECT count(*) FROM orion_audio_settings),
    'ia_ligada',   (SELECT count(*) FROM orion_audio_settings WHERE (config->>'aiSound')::boolean IS TRUE),
    'ia_desligada',(SELECT count(*) FROM orion_audio_settings WHERE (config->>'aiSound')::boolean IS NOT TRUE),
    'dispositivos', COALESCE((
        SELECT jsonb_object_agg(perfil, n) FROM (
          SELECT COALESCE(config->>'deviceProfile','auto') AS perfil, count(*)::bigint AS n
          FROM orion_audio_settings GROUP BY 1 ORDER BY n DESC
        ) d), '{}'::jsonb),
    'preset_mais_usado', (
        SELECT jsonb_build_object('preset', detalhes->>'preset', 'aplicacoes', count(*))
        FROM orion_audio_events WHERE evento = 'preset_apply' AND detalhes ? 'preset'
        GROUP BY detalhes->>'preset' ORDER BY count(*) DESC LIMIT 1),
    'top_presets', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('preset', p, 'aplicacoes', n)) FROM (
          SELECT detalhes->>'preset' AS p, count(*)::bigint AS n
          FROM orion_audio_events WHERE evento = 'preset_apply' AND detalhes ? 'preset'
          GROUP BY 1 ORDER BY n DESC LIMIT 8
        ) t), '[]'::jsonb),
    'presets_personalizados', (SELECT count(*) FROM orion_audio_presets),
    'tempo_uso_minutos', COALESCE((
        SELECT sum((detalhes->>'minutos')::numeric) FROM orion_audio_events WHERE evento = 'uso'), 0),
    'testes_de_som', (SELECT count(*) FROM orion_audio_events WHERE evento = 'teste_som'),
    'guarda_antidistorcao_acionada', (SELECT count(*) FROM orion_audio_events WHERE evento = 'distortion_guard'),
    'eventos_30d', (SELECT count(*) FROM orion_audio_events WHERE criado_em > now() - interval '30 days'),
    '_auditoria', jsonb_build_object(
      'gerado_em', now(),
      'fonte', 'orion_audio_settings + orion_audio_presets + orion_audio_events',
      'lacunas_declaradas', jsonb_build_array(
        'qualidade_do_audio: proxy = acionamentos da guarda anti-distorção (sem medição acústica real)',
        'deteccao_de_dispositivo: melhor esforço do navegador (labels exigem permissão de mídia)'
      )
    )
  ) INTO v;

  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.orion_audio_admin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orion_audio_admin_stats() TO authenticated, service_role;

-- ── 5) Verificação (deve retornar 3 tabelas, 4 policies, 1 função) ──
-- (aplicada em 2026-07-19: tabelas=3, policies=4, funcao=1 ✓)
SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname='public'
     AND tablename IN ('orion_audio_settings','orion_audio_presets','orion_audio_events'))          AS tabelas,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public'
     AND tablename LIKE 'orion_audio_%')                                                            AS policies,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='orion_audio_admin_stats')                              AS funcao;
