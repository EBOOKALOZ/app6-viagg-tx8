-- ============================================================
-- RADAR IA: usar profile_kind REAL em vez de 'motoboy' hardcoded (2026-08-01)
--
-- Desde 20260712_radar_ia_motoboy_profile_fix.sql, radar_list_groups()
-- e radar_ranking() fixavam profile_kind = 'motoboy'::text com o
-- comentário "grupos da tabela whatsapp_groups são exclusivos do
-- perfil Motoboy" — isso deixou de ser verdade: a migration
-- 20260801_whatsapp_groups_profile_kind_e_colunas.sql adicionou a
-- coluna profile_kind (motoboy|mototaxi) e o formulário
-- (MotoboyGroupsContent.tsx, compartilhado pelos dois perfis) agora
-- grava o valor real no insert. Esta migration troca o literal fixo
-- pela coluna de verdade, sem mudar mais nada nas duas funções.
--
-- CORREÇÃO (aplicada em produção): a primeira tentativa desta
-- migration falhou com 42P13 "cannot change return type of existing
-- function" — radar_list_groups() já tinha sido evoluída em produção
-- (fora do escopo desta auditoria) com 6 colunas extras não previstas
-- no arquivo original (analyzed_at, status_aprovacao, link_status,
-- link_verified_at, real_name, photo_url), usadas por
-- AdminGruposAprovados.tsx. Esta versão preserva TODAS as colunas
-- vivas e só troca 'motoboy'::text por g.profile_kind — não remove
-- nada que o painel admin já consome.
--
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.radar_list_groups(p_limit int DEFAULT 300)
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
         g.profile_kind,
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

CREATE OR REPLACE FUNCTION public.radar_ranking()
RETURNS TABLE (
  owner_user_id uuid, owner_name text, profile_kind text,
  grupos bigint, aprovados bigint, rejeitados bigint,
  score_medio numeric, membros bigint, desde timestamptz,
  confiabilidade numeric, nivel text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH agg AS (
    SELECT g.owner_user_id,
           -- profile_kind pode variar por linha em teoria; usa o mais
           -- recente cadastrado por esse dono como representativo.
           (ARRAY_AGG(g.profile_kind ORDER BY g.created_at DESC))[1] AS profile_kind,
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
         a.profile_kind,
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

GRANT EXECUTE ON FUNCTION public.radar_list_groups(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.radar_ranking() TO authenticated;
