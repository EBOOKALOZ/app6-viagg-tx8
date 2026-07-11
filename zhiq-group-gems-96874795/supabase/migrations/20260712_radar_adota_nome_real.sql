-- ============================================================
-- RADAR IA — ADOTA O NOME REAL VERIFICADO + RPC com verificação
-- (2026-07-12)
--
-- Decisão de produto: o nome digitado no cadastro é só um RÓTULO
-- inicial. Quando a verificação confirma o nome REAL do grupo (prévia
-- do convite), a plataforma ADOTA esse nome — exibe a verdade em vez
-- de punir divergência. 'nome_divergente' vira INFORMATIVO (fator),
-- não veto/Suspeito.
--
-- Também: limpa nomes reais gravados com entidades HTML pela versão
-- antiga da edge (Aripuan&#xc3;) — a nova regrava decodificado — e
-- expõe link_status/real_name/photo_url na RPC do painel (modal de
-- relatório completo). Idempotente.
-- ============================================================

-- 1. Limpa real_name com entidades HTML (a nova edge regrava certo)
UPDATE public.whatsapp_groups
   SET real_name = NULL
 WHERE real_name LIKE '%&#%';

-- 2. Motor v4.2: nome_divergente NÃO reprova mais (só informa)
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
      (g.group_link IS NULL OR g.group_link !~* 'chat\.whatsapp\.com/'
       OR g.link_status = 'revogado')                                    AS link_invalido,
      (g.link_status = 'ativo')                                          AS link_verificado,
      (g.real_name IS NOT NULL AND NULLIF(TRIM(g.group_name),'') IS NOT NULL
       AND position(public.radar_norm(g.group_name) in public.radar_norm(g.real_name)) = 0
       AND position(public.radar_norm(g.real_name) in public.radar_norm(g.group_name)) = 0) AS nome_divergente,
      COALESCE(g.members_count,0) > 5000                                 AS membros_implausiveis,
      (g.last_posted_at IS NULL OR g.last_posted_at < now() - interval '60 days') AS abandonado,
      EXISTS (
        SELECT 1 FROM public.whatsapp_groups d
         WHERE d.id <> g.id
           AND d.is_active = true
           AND d.created_at < g.created_at
           AND lower(trim(d.group_link)) = lower(trim(g.group_link))
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
        ELSE LEAST(100,
          b.f_membros + b.f_local + b.f_atividade
          + b.f_validade + b.f_cadastro + b.f_antiguidade
          + CASE WHEN b.link_verificado THEN 5 ELSE 0 END)
      END AS score,
      LEAST(100,
        LEAST(60, GREATEST(0, COALESCE(b.members_count,0)) / 8)
        + CASE WHEN COALESCE(cd.grupos_na_cidade,0) <= 2 THEN 40
               WHEN cd.grupos_na_cidade <= 5 THEN 25
               WHEN cd.grupos_na_cidade <= 15 THEN 12
               ELSE 5 END
      ) AS potencial,
      b.link_invalido, b.link_verificado, b.nome_divergente,
      b.membros_implausiveis, b.abandonado, b.duplicado,
      jsonb_build_object(
        'membros', b.f_membros, 'localizacao', b.f_local,
        'atividade', b.f_atividade, 'validade', b.f_validade,
        'cadastro_completo', b.f_cadastro, 'antiguidade', b.f_antiguidade,
        'link_invalido', b.link_invalido, 'link_verificado', b.link_verificado,
        'nome_divergente', b.nome_divergente, 'duplicado', b.duplicado,
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
    c.factors, 'rules-v4.2-adota-nome-real', now()
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

-- 3. RPC do painel v3: expõe a verificação (modal de relatório)
DROP FUNCTION IF EXISTS public.radar_list_groups(int);
CREATE FUNCTION public.radar_list_groups(p_limit int DEFAULT 300)
RETURNS TABLE (
  id uuid, group_name text, group_link text, city_name text, state_code text,
  neighborhood text, members_count int, is_active boolean, validation_status text,
  invalid_reason text, created_at timestamptz, last_posted_at timestamptz,
  owner_user_id uuid, owner_name text, profile_kind text,
  score int, classification text, commercial_potential int,
  recommendation text, ai_explanation text, factors jsonb,
  analyzed_at timestamptz, status_aprovacao text,
  link_status text, link_verified_at timestamptz, real_name text, photo_url text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, g.group_name, g.group_link, g.city_name, g.state_code,
         g.neighborhood, g.members_count, g.is_active, g.validation_status,
         g.invalid_reason, g.created_at, g.last_posted_at,
         g.owner_user_id, p.name,
         'motoboy'::text,
         COALESCE(s.score, 0), COALESCE(s.classification, '—'),
         COALESCE(s.commercial_potential, 0),
         COALESCE(s.recommendation, 'sem_analise'), s.ai_explanation, s.factors,
         s.analyzed_at,
         CASE
           WHEN g.validation_status = 'approved' AND g.is_active AND g.valid_for_commission
             THEN 'aprovado'
           WHEN g.validation_status = 'pending' THEN 'pendente'
           WHEN NOT g.is_active AND g.validation_status NOT IN ('rejected') THEN 'inativo'
           ELSE 'reprovado'
         END AS status_aprovacao,
         g.link_status, g.link_verified_at, g.real_name, g.photo_url
    FROM public.whatsapp_groups g
    LEFT JOIN public.radar_group_scores s ON s.group_id = g.id
    LEFT JOIN public.profiles p ON p.id = g.owner_user_id
   WHERE public.mp_is_admin()
   ORDER BY COALESCE(s.score, 0) DESC, g.created_at DESC
   LIMIT LEAST(COALESCE(p_limit, 300), 1000)
$$;
GRANT EXECUTE ON FUNCTION public.radar_list_groups(int) TO authenticated;

-- 4. Reprocesso: libera os falsos positivos e recalcula comissões
SELECT public.radar_score_groups(NULL);
SELECT public.radar_apply_ia_verdict(NULL);
DO $$
DECLARE v_user uuid;
BEGIN
  FOR v_user IN SELECT DISTINCT owner_user_id FROM public.whatsapp_groups LOOP
    PERFORM public.recalc_user_commission(v_user);
  END LOOP;
END $$;
