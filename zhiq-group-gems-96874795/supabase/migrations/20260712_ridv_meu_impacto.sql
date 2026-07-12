-- ============================================================
-- MEU IMPACTO (RIDV) — agregados REAIS do profissional (2026-07-12)
-- Reutiliza: posting_history, campaign_queue(origem), whatsapp_groups,
-- posting_lots (click_count), profiles. Nada novo é gravado.
-- ============================================================
CREATE OR REPLACE FUNCTION public.ridv_meu_impacto()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ok text[] := ARRAY['posted','confirmed','success','done'];
  v_post integer; v_post_mes integer; v_post_mes_ant integer; v_hoje integer; v_semana integer;
  v_empresas integer; v_grupos integer; v_pessoas integer; v_cliques integer;
  v_rank_geral integer; v_rank_cidade integer; v_cidade text; v_streak integer;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false); END IF;

  SELECT count(*),
         count(*) FILTER (WHERE posted_at >= date_trunc('month', now())),
         count(*) FILTER (WHERE posted_at >= date_trunc('month', now()) - interval '1 month'
                            AND posted_at < date_trunc('month', now())),
         count(*) FILTER (WHERE posted_at >= (now() AT TIME ZONE 'America/Cuiaba')::date::timestamp AT TIME ZONE 'America/Cuiaba'),
         count(*) FILTER (WHERE posted_at >= now() - interval '7 days')
    INTO v_post, v_post_mes, v_post_mes_ant, v_hoje, v_semana
  FROM public.posting_history
  WHERE operator_user_id = v_uid AND final_status = ANY(v_ok);

  SELECT count(DISTINCT cq.merchant_store_id) INTO v_empresas
  FROM public.posting_history ph
  JOIN public.campaign_queue cq ON cq.id = ph.campaign_queue_id
  WHERE ph.operator_user_id = v_uid AND ph.final_status = ANY(v_ok)
    AND cq.merchant_store_id IS NOT NULL;

  SELECT count(DISTINCT whatsapp_group_id) INTO v_grupos
  FROM public.posting_history
  WHERE operator_user_id = v_uid AND final_status = ANY(v_ok) AND whatsapp_group_id IS NOT NULL;

  SELECT COALESCE(sum(g.members_count), 0) INTO v_pessoas
  FROM (SELECT DISTINCT whatsapp_group_id FROM public.posting_history
         WHERE operator_user_id = v_uid AND final_status = ANY(v_ok)) x
  JOIN public.whatsapp_groups g ON g.id = x.whatsapp_group_id;

  SELECT COALESCE(sum(click_count), 0) INTO v_cliques
  FROM public.posting_lots WHERE operator_user_id = v_uid AND status = 'posted';

  SELECT cidade INTO v_cidade FROM public.motoboy_profiles WHERE user_id = v_uid;

  SELECT count(*) + 1 INTO v_rank_geral FROM (
    SELECT operator_user_id, count(*) c FROM public.posting_history
     WHERE final_status = ANY(v_ok) AND operator_user_id IS NOT NULL GROUP BY 1) t
  WHERE t.c > v_post;

  SELECT count(*) + 1 INTO v_rank_cidade FROM (
    SELECT ph.operator_user_id, count(*) c
    FROM public.posting_history ph
    JOIN public.motoboy_profiles mp ON mp.user_id = ph.operator_user_id
    WHERE ph.final_status = ANY(v_ok) AND lower(mp.cidade) = lower(COALESCE(v_cidade,''))
    GROUP BY 1) t
  WHERE t.c > v_post;

  WITH dias AS (
    SELECT DISTINCT (posted_at AT TIME ZONE 'America/Cuiaba')::date d
    FROM public.posting_history WHERE operator_user_id = v_uid AND final_status = ANY(v_ok))
  SELECT count(*) INTO v_streak FROM (
    SELECT d, row_number() OVER (ORDER BY d DESC) rn FROM dias) s
  WHERE s.d = ((now() AT TIME ZONE 'America/Cuiaba')::date - (s.rn - 1)::integer);

  RETURN jsonb_build_object(
    'success', true,
    'postagens', v_post, 'postagens_hoje', v_hoje, 'postagens_semana', v_semana,
    'postagens_mes', v_post_mes, 'postagens_mes_anterior', v_post_mes_ant,
    'empresas', v_empresas, 'grupos', v_grupos, 'pessoas', v_pessoas, 'cliques', v_cliques,
    'streak_dias', COALESCE(v_streak, 0),
    'rank_geral', v_rank_geral, 'rank_cidade', v_rank_cidade, 'cidade', v_cidade,
    'por_dia', (SELECT COALESCE(jsonb_agg(jsonb_build_object('d', d::text, 'n', n) ORDER BY d), '[]'::jsonb)
      FROM (SELECT (posted_at AT TIME ZONE 'America/Cuiaba')::date d, count(*) n
              FROM public.posting_history
             WHERE operator_user_id = v_uid AND final_status = ANY(v_ok)
               AND posted_at > now() - interval '14 days' GROUP BY 1) q),
    'melhor_hora', (SELECT to_char(date_trunc('hour', posted_at AT TIME ZONE 'America/Cuiaba'), 'HH24')
      FROM public.posting_history WHERE operator_user_id = v_uid AND final_status = ANY(v_ok)
      GROUP BY 1 ORDER BY count(*) DESC LIMIT 1),
    'cidades', (SELECT COALESCE(jsonb_agg(jsonb_build_object('cidade', c, 'n', n) ORDER BY n DESC), '[]'::jsonb)
      FROM (SELECT COALESCE(g.city_name,'—') c, count(*) n
              FROM public.posting_history ph
              JOIN public.whatsapp_groups g ON g.id = ph.whatsapp_group_id
             WHERE ph.operator_user_id = v_uid AND ph.final_status = ANY(v_ok)
             GROUP BY 1 LIMIT 6) q),
    'timeline', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', ph.id, 'titulo', COALESCE(cq.title, 'Divulgação'),
        'empresa', COALESCE(ms.nome_loja, ms.store_name, '—'),
        'imagem', cq.media_url, 'cidade', COALESCE(g.city_name, cq.target_city),
        'grupo', g.group_name, 'quando', ph.posted_at,
        'origem', COALESCE(cq.origem, 'organica'), 'categoria', COALESCE(cq.campaign_type, '—')
      ) ORDER BY ph.posted_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.posting_history
             WHERE operator_user_id = v_uid AND final_status = ANY(v_ok)
             ORDER BY posted_at DESC LIMIT 15) ph
      LEFT JOIN public.campaign_queue cq ON cq.id = ph.campaign_queue_id
      LEFT JOIN public.merchant_stores ms ON ms.id = cq.merchant_store_id
      LEFT JOIN public.whatsapp_groups g ON g.id = ph.whatsapp_group_id)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.ridv_meu_impacto() TO authenticated;
