-- ============================================================
-- RADAR IA — DUPLICIDADE POR NOME+CIDADE + NORMALIZAÇÃO (2026-07-12)
--
-- Auditoria: mesmo profissional cadastrou 3 vezes "ARIPUANA/aripuana"
-- com LINKS diferentes — a exclusividade (por link) não pega e os 3
-- aprovavam, inflando a escada de comissão.
--
-- Conserto no MOTOR (fonte única):
--  • duplicado = mesmo link normalizado OU mesmo (nome+cidade)
--    normalizados de outro grupo ATIVO mais antigo — o ORIGINAL (mais
--    antigo) continua valendo; os posteriores são vetados pela IA
--    ('IA: grupo duplicado') e saem de Aprovados e da comissão.
--  • Normalização na escrita: nome/cidade com trim + espaços colapsados.
--
-- Reprocesso ao final aplica o veto no histórico e recalcula comissões.
-- Idempotente.
-- ============================================================

-- ── 1. Motor de score: detecção de duplicidade ampliada ────────────
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
      (g.group_link IS NULL OR g.group_link !~* 'chat\.whatsapp\.com/')  AS link_invalido,
      COALESCE(g.members_count,0) > 5000                                 AS membros_implausiveis,
      (g.last_posted_at IS NULL OR g.last_posted_at < now() - interval '60 days') AS abandonado,
      -- DUPLICADO: mesmo link OU mesmo nome+cidade (normalizados) de um
      -- grupo ATIVO mais antigo — o original permanece, o clone é vetado.
      EXISTS (
        SELECT 1 FROM public.whatsapp_groups d
         WHERE d.id <> g.id
           AND d.is_active = true
           AND d.created_at < g.created_at
           AND (
             lower(trim(d.group_link)) = lower(trim(g.group_link))
             OR (
               lower(trim(d.group_name)) = lower(trim(g.group_name))
               AND lower(trim(COALESCE(d.city_name,''))) = lower(trim(COALESCE(g.city_name,'')))
             )
           )
      ) AS duplicado,
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
    c.factors, 'rules-v2-dedup', now()
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

-- ── 2. Normalização na escrita (trim + espaços colapsados) ─────────
--     (adicionada no início do enforce_group_validity via wrapper leve:
--      o corpo atual permanece a régua — só normalizamos os textos)
CREATE OR REPLACE FUNCTION public.tg_normalize_group_text()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.group_name := NULLIF(regexp_replace(trim(COALESCE(NEW.group_name,'')), '\s+', ' ', 'g'), '');
  NEW.city_name  := NULLIF(regexp_replace(trim(COALESCE(NEW.city_name ,'')), '\s+', ' ', 'g'), '');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_normalize_group_text ON public.whatsapp_groups;
CREATE TRIGGER trg_normalize_group_text
  BEFORE INSERT OR UPDATE ON public.whatsapp_groups
  FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_group_text();

-- ── 3. Reprocesso: pontua, aplica vetos e recalcula comissões ──────
SELECT public.radar_score_groups(NULL);
SELECT public.radar_apply_ia_verdict(NULL);
DO $$
DECLARE v_user uuid;
BEGIN
  FOR v_user IN SELECT DISTINCT owner_user_id FROM public.whatsapp_groups LOOP
    PERFORM public.recalc_user_commission(v_user);
  END LOOP;
END $$;
