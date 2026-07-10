-- ============================================================
-- RADAR IA — centro de inteligência de grupos (2026-07-11)
--
-- Arquitetura em 2 camadas:
--  • MOTOR DE SCORE (SQL, determinístico, set-based): pontua 0-100,
--    classifica, calcula potencial comercial e recomenda — roda para
--    1 grupo (trigger) ou para TODOS de uma vez (reprocesso). Escala
--    a milhões de linhas (uma UPDATE…FROM, sem loop por grupo).
--  • CAMADA IA (edge radar-ia, Anthropic): explica o score em
--    linguagem natural e refina a recomendação; usa as decisões
--    manuais do admin (radar_admin_decisions) como aprendizado.
--
-- Novos critérios entram como colunas do JSONB `factors` — sem
-- alterar schema. Leitura do painel: RPCs SECURITY DEFINER gated por
-- mp_is_admin(). Idempotente.
-- ============================================================

-- ── 1. Score por grupo (1:1 com whatsapp_groups) ───────────────────
CREATE TABLE IF NOT EXISTS public.radar_group_scores (
  group_id      uuid PRIMARY KEY REFERENCES public.whatsapp_groups(id) ON DELETE CASCADE,
  score         integer NOT NULL DEFAULT 0,
  classification text NOT NULL DEFAULT 'Regular',
  commercial_potential integer NOT NULL DEFAULT 0,
  recommendation text NOT NULL DEFAULT 'revisao_manual',
  factors       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_explanation text,
  ai_analyzed_at timestamptz,
  engine        text NOT NULL DEFAULT 'rules-v1',
  analyzed_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.radar_group_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS radar_scores_owner_read ON public.radar_group_scores;
CREATE POLICY radar_scores_owner_read ON public.radar_group_scores
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.whatsapp_groups g
             WHERE g.id = group_id AND g.owner_user_id = auth.uid())
  );

-- ── 2. Decisões do admin (aprendizado contínuo) ────────────────────
CREATE TABLE IF NOT EXISTS public.radar_admin_decisions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES public.whatsapp_groups(id) ON DELETE CASCADE,
  decision   text NOT NULL CHECK (decision IN ('aprovar','rejeitar','arquivar','revisar')),
  admin_id   uuid,
  notes      text,
  score_at_decision integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.radar_admin_decisions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_radar_scores_class ON public.radar_group_scores (classification);
CREATE INDEX IF NOT EXISTS idx_wa_groups_city ON public.whatsapp_groups (city_name, state_code);
CREATE INDEX IF NOT EXISTS idx_wa_groups_owner ON public.whatsapp_groups (owner_user_id);

-- ── 3. MOTOR DE SCORE (set-based; p_group_id NULL = todos) ─────────
CREATE OR REPLACE FUNCTION public.radar_score_groups(p_group_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH base AS (
    SELECT g.id,
      -- fatores individuais (0-100 no total)
      LEAST(30, GREATEST(0, COALESCE(g.members_count,0)) / 10)           AS f_membros,
      CASE WHEN g.latitude IS NOT NULL AND g.longitude IS NOT NULL
           THEN 20 ELSE 0 END                                            AS f_local,
      CASE WHEN g.last_posted_at > now() - interval '30 days' THEN 15
           WHEN g.last_posted_at > now() - interval '60 days' THEN 7
           ELSE 0 END                                                    AS f_atividade,
      CASE WHEN g.validation_status='approved' AND g.is_active AND g.is_valid
           THEN 15 ELSE 0 END                                            AS f_validade,
      (CASE WHEN NULLIF(TRIM(g.group_name),'')  IS NOT NULL THEN 3 ELSE 0 END
       + CASE WHEN NULLIF(TRIM(g.city_name),'')  IS NOT NULL THEN 3 ELSE 0 END
       + CASE WHEN NULLIF(TRIM(g.state_code),'') IS NOT NULL THEN 2 ELSE 0 END
       + CASE WHEN NULLIF(TRIM(g.neighborhood),'') IS NOT NULL THEN 2 ELSE 0 END) AS f_cadastro,
      CASE WHEN g.created_at < now() - interval '30 days' AND g.is_active
           THEN 10 ELSE 0 END                                            AS f_antiguidade,
      -- sinais de problema
      (g.group_link IS NULL OR g.group_link !~* 'chat\.whatsapp\.com/')  AS link_invalido,
      COALESCE(g.members_count,0) > 5000                                 AS membros_implausiveis,
      (g.last_posted_at IS NULL OR g.last_posted_at < now() - interval '60 days') AS abandonado,
      EXISTS (SELECT 1 FROM public.whatsapp_groups d
               WHERE d.id <> g.id
                 AND lower(trim(d.group_link)) = lower(trim(g.group_link))) AS duplicado,
      g.members_count, g.city_name
    FROM public.whatsapp_groups g
    WHERE p_group_id IS NULL OR g.id = p_group_id
  ),
  city_density AS (
    SELECT lower(trim(city_name)) AS cidade, COUNT(*) AS grupos_na_cidade
      FROM public.whatsapp_groups WHERE city_name IS NOT NULL GROUP BY 1
  ),
  calc AS (
    SELECT b.id,
      CASE
        WHEN b.link_invalido THEN LEAST(10, b.f_cadastro)
        WHEN b.membros_implausiveis THEN 15
        ELSE LEAST(100, b.f_membros + b.f_local + b.f_atividade
                        + b.f_validade + b.f_cadastro + b.f_antiguidade)
      END AS score,
      -- potencial comercial: membros (peso 60) + cidade pouco atendida (40)
      LEAST(100,
        LEAST(60, GREATEST(0, COALESCE(b.members_count,0)) / 8)
        + CASE WHEN COALESCE(cd.grupos_na_cidade,0) <= 2 THEN 40
               WHEN cd.grupos_na_cidade <= 5 THEN 25
               WHEN cd.grupos_na_cidade <= 15 THEN 12
               ELSE 5 END
      ) AS potencial,
      b.link_invalido, b.membros_implausiveis, b.abandonado, b.duplicado,
      jsonb_build_object(
        'membros', b.f_membros, 'localizacao', b.f_local,
        'atividade', b.f_atividade, 'validade', b.f_validade,
        'cadastro_completo', b.f_cadastro, 'antiguidade', b.f_antiguidade,
        'link_invalido', b.link_invalido, 'duplicado', b.duplicado,
        'abandonado', b.abandonado, 'membros_implausiveis', b.membros_implausiveis
      ) AS factors
    FROM base b
    LEFT JOIN city_density cd ON cd.cidade = lower(trim(b.city_name))
  )
  INSERT INTO public.radar_group_scores AS s
    (group_id, score, classification, commercial_potential, recommendation, factors, engine, analyzed_at)
  SELECT c.id, c.score,
    CASE WHEN c.link_invalido OR c.membros_implausiveis THEN 'Suspeito'
         WHEN c.score >= 90 THEN 'Excelente'
         WHEN c.score >= 75 THEN 'Muito Bom'
         WHEN c.score >= 60 THEN 'Bom'
         WHEN c.score >= 40 THEN 'Regular'
         WHEN c.score >= 20 THEN 'Baixo Potencial'
         ELSE 'Suspeito' END,
    c.potencial,
    CASE WHEN c.link_invalido THEN 'link_invalido'
         WHEN c.duplicado THEN 'grupo_duplicado'
         WHEN c.membros_implausiveis THEN 'grupo_suspeito'
         WHEN c.abandonado THEN 'grupo_abandonado'
         WHEN c.score >= 85 THEN 'aprovar_automatico'
         WHEN c.potencial >= 80 THEN 'alto_potencial'
         WHEN c.score < 40 THEN 'baixa_qualidade'
         ELSE 'enviar_revisao' END,
    c.factors, 'rules-v1', now()
  FROM calc c
  ON CONFLICT (group_id) DO UPDATE SET
    score = EXCLUDED.score,
    classification = EXCLUDED.classification,
    commercial_potential = EXCLUDED.commercial_potential,
    recommendation = EXCLUDED.recommendation,
    factors = EXCLUDED.factors,
    engine = EXCLUDED.engine,
    analyzed_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- ── 4. Trigger: novo/alterado → repontua na hora ───────────────────
CREATE OR REPLACE FUNCTION public.tg_radar_rescore()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.radar_score_groups(NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_radar_rescore ON public.whatsapp_groups;
CREATE TRIGGER trg_radar_rescore
  AFTER INSERT OR UPDATE ON public.whatsapp_groups
  FOR EACH ROW EXECUTE FUNCTION public.tg_radar_rescore();

-- ── 5. RPCs do painel (admin only) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.radar_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN NOT public.mp_is_admin() THEN NULL ELSE (
    SELECT jsonb_build_object(
      'total',        COUNT(*),
      'ativos',       COUNT(*) FILTER (WHERE g.is_active),
      'inativos',     COUNT(*) FILTER (WHERE NOT g.is_active),
      'aprovados',    COUNT(*) FILTER (WHERE g.validation_status = 'approved'),
      'pendentes',    COUNT(*) FILTER (WHERE g.validation_status = 'pending'),
      'rejeitados',   COUNT(*) FILTER (WHERE g.validation_status NOT IN ('approved','pending')),
      'membros',      COALESCE(SUM(g.members_count), 0),
      'novos_dia',    COUNT(*) FILTER (WHERE g.created_at > now() - interval '1 day'),
      'novos_semana', COUNT(*) FILTER (WHERE g.created_at > now() - interval '7 days'),
      'novos_mes',    COUNT(*) FILTER (WHERE g.created_at > now() - interval '30 days'),
      'cidades',      COUNT(DISTINCT lower(trim(g.city_name))) FILTER (WHERE g.city_name IS NOT NULL),
      'score_medio',  COALESCE(ROUND(AVG(s.score)), 0)
    ) FROM public.whatsapp_groups g
      LEFT JOIN public.radar_group_scores s ON s.group_id = g.id
  ) END
$$;

CREATE OR REPLACE FUNCTION public.radar_list_groups(p_limit int DEFAULT 300)
RETURNS TABLE (
  id uuid, group_name text, group_link text, city_name text, state_code text,
  neighborhood text, members_count int, is_active boolean, validation_status text,
  invalid_reason text, created_at timestamptz, last_posted_at timestamptz,
  owner_user_id uuid, owner_name text, profile_kind text,
  score int, classification text, commercial_potential int,
  recommendation text, ai_explanation text, factors jsonb
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, g.group_name, g.group_link, g.city_name, g.state_code,
         g.neighborhood, g.members_count, g.is_active, g.validation_status,
         g.invalid_reason, g.created_at, g.last_posted_at,
         g.owner_user_id, p.name,
         -- moto-táxi compartilha o cadastro de motoboy (despacho unificado);
         -- o rótulo distinto vem quando houver tabela própria
         CASE WHEN EXISTS (SELECT 1 FROM public.driver_profiles  m WHERE m.user_id = g.owner_user_id) THEN 'motorista'
              WHEN EXISTS (SELECT 1 FROM public.motoboy_profiles m WHERE m.user_id = g.owner_user_id) THEN 'motoboy'
              ELSE 'outro' END,
         COALESCE(s.score, 0), COALESCE(s.classification, '—'),
         COALESCE(s.commercial_potential, 0),
         COALESCE(s.recommendation, 'sem_analise'), s.ai_explanation, s.factors
    FROM public.whatsapp_groups g
    LEFT JOIN public.radar_group_scores s ON s.group_id = g.id
    LEFT JOIN public.profiles p ON p.id = g.owner_user_id
   WHERE public.mp_is_admin()
   ORDER BY COALESCE(s.score, 0) DESC, g.created_at DESC
   LIMIT LEAST(COALESCE(p_limit, 300), 1000)
$$;

CREATE OR REPLACE FUNCTION public.radar_territory()
RETURNS TABLE (
  city_name text, state_code text, grupos bigint, membros bigint,
  score_medio numeric, potencial_medio numeric, situacao text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.city_name, MAX(g.state_code), COUNT(*), COALESCE(SUM(g.members_count),0),
         ROUND(AVG(s.score),1), ROUND(AVG(s.commercial_potential),1),
         CASE WHEN COUNT(*) <= 1 THEN 'descoberta'
              WHEN COUNT(*) <= 5 THEN 'em_crescimento'
              WHEN COUNT(*) <= 20 THEN 'consolidada'
              ELSE 'saturada' END
    FROM public.whatsapp_groups g
    LEFT JOIN public.radar_group_scores s ON s.group_id = g.id
   WHERE public.mp_is_admin() AND g.city_name IS NOT NULL
   GROUP BY g.city_name
   ORDER BY COUNT(*) DESC
$$;

CREATE OR REPLACE FUNCTION public.radar_ranking()
RETURNS TABLE (
  owner_user_id uuid, owner_name text, profile_kind text,
  grupos bigint, aprovados bigint, rejeitados bigint,
  score_medio numeric, membros bigint, desde timestamptz,
  confiabilidade numeric, nivel text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH agg AS (
    SELECT g.owner_user_id,
           COUNT(*) AS grupos,
           COUNT(*) FILTER (WHERE g.validation_status = 'approved') AS aprovados,
           COUNT(*) FILTER (WHERE g.validation_status NOT IN ('approved','pending')) AS rejeitados,
           ROUND(AVG(s.score),1) AS score_medio,
           COALESCE(SUM(g.members_count),0) AS membros,
           MIN(g.created_at) AS desde
      FROM public.whatsapp_groups g
      LEFT JOIN public.radar_group_scores s ON s.group_id = g.id
     GROUP BY g.owner_user_id
  )
  SELECT a.owner_user_id, p.name,
         CASE WHEN EXISTS (SELECT 1 FROM public.driver_profiles  m WHERE m.user_id = a.owner_user_id) THEN 'motorista'
              WHEN EXISTS (SELECT 1 FROM public.motoboy_profiles m WHERE m.user_id = a.owner_user_id) THEN 'motoboy'
              ELSE 'outro' END,
         a.grupos, a.aprovados, a.rejeitados, a.score_medio, a.membros, a.desde,
         ROUND(100.0 * a.aprovados / NULLIF(a.grupos,0), 1) AS confiabilidade,
         CASE WHEN a.score_medio >= 85 AND a.grupos >= 5 THEN 'Ouro'
              WHEN a.score_medio >= 70 AND a.grupos >= 3 THEN 'Prata'
              WHEN a.grupos >= 1 THEN 'Bronze'
              ELSE '—' END AS nivel
    FROM agg a
    LEFT JOIN public.profiles p ON p.id = a.owner_user_id
   WHERE public.mp_is_admin()
   ORDER BY a.score_medio DESC NULLS LAST, a.grupos DESC
$$;

-- Decisão do admin (grava o aprendizado + aplica o efeito no grupo)
CREATE OR REPLACE FUNCTION public.radar_admin_decide(
  p_group_id uuid, p_decision text, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_score int;
BEGIN
  IF NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT score INTO v_score FROM public.radar_group_scores WHERE group_id = p_group_id;

  INSERT INTO public.radar_admin_decisions (group_id, decision, admin_id, notes, score_at_decision)
  VALUES (p_group_id, p_decision, auth.uid(), p_notes, v_score);

  IF p_decision = 'aprovar' THEN
    UPDATE public.whatsapp_groups SET validation_status = 'approved', is_active = true WHERE id = p_group_id;
  ELSIF p_decision = 'rejeitar' THEN
    UPDATE public.whatsapp_groups SET validation_status = 'rejected', is_active = false,
      invalid_reason = COALESCE(p_notes, 'Rejeitado pelo RADAR IA/admin') WHERE id = p_group_id;
  ELSIF p_decision = 'arquivar' THEN
    UPDATE public.whatsapp_groups SET is_active = false WHERE id = p_group_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'decision', p_decision);
END $$;

CREATE OR REPLACE FUNCTION public.radar_reprocess_all()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN public.radar_score_groups(NULL);
END $$;

REVOKE ALL ON FUNCTION public.radar_score_groups(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.radar_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.radar_list_groups(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.radar_territory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.radar_ranking() TO authenticated;
GRANT EXECUTE ON FUNCTION public.radar_admin_decide(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.radar_reprocess_all() TO authenticated;

-- ── 6. Pontuação inicial de todo o histórico ───────────────────────
SELECT public.radar_score_groups(NULL);
