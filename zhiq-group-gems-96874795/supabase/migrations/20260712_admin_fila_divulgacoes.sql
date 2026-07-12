-- ============================================================
-- FILA INTELIGENTE DE DIVULGAÇÕES — visão ADMIN transparente (2026-07-12)
-- Fonte única: campaign_queue (+ targets/lojas/perfis). Somente leitura.
-- Ordenação: patrocinada > pacote > gratuita_diaria > organica,
-- depois priority DESC, depois entrada mais recente. Gate: mp_is_admin().
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_fila_divulgacoes()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(sub.item ORDER BY sub.ord, sub.prio DESC, sub.criado DESC)
    FROM (
      SELECT
        CASE cq.origem
          WHEN 'patrocinada' THEN 0
          WHEN 'pacote' THEN 1
          WHEN 'gratuita_diaria' THEN 2
          ELSE 3
        END AS ord,
        cq.priority AS prio,
        cq.created_at AS criado,
        jsonb_build_object(
          'id', cq.id,
          'codigo', upper(left(cq.id::text, 8)),
          'titulo', COALESCE(cq.title, 'Sem título'),
          'imagem', cq.media_url,
          'anunciante', COALESCE(ms.nome_loja, ms.store_name, pcria.name, 'Anunciante'),
          'categoria', COALESCE(cq.campaign_type, '—'),
          'cidade', cq.target_city,
          'tipo', cq.origem,
          'prioridade', cq.priority,
          'motivo_prioridade',
            CASE cq.origem
              WHEN 'patrocinada'     THEN '⭐ Anúncio patrocinado — prioridade máxima'
              WHEN 'pacote'          THEN '💳 Divulgação de pacote pago'
              WHEN 'gratuita_diaria' THEN '🎁 Divulgação gratuita do dia'
              ELSE '📢 Conteúdo orgânico'
            END
            || CASE WHEN cq.target_city IS NOT NULL
                    THEN ' · segmentada para ' || cq.target_city ELSE '' END
            || CASE WHEN cq.created_at > now() - interval '48 hours'
                    THEN ' · recente' ELSE '' END,
          'entrada', cq.created_at,
          'status_bruto', cq.status,
          'status',
            CASE
              WHEN cq.status IN ('cancelled','expired') THEN 'Expirada'
              WHEN cq.status IN ('posted','publicada','concluida','done')
                   OR (COALESCE(tg.total,0) > 0 AND COALESCE(tg.postados,0) >= tg.total) THEN 'Concluída'
              WHEN COALESCE(tg.postados,0) > 0 THEN 'Em postagem'
              WHEN COALESCE(tg.reservados,0) > 0 THEN 'Reservada'
              WHEN cq.status = 'active' THEN 'Em preparação'
              ELSE 'Aguardando'
            END,
          'grupos_previstos', COALESCE(tg.total, 0),
          'grupos_concluidos', COALESCE(tg.postados, 0),
          'profissional', pop.name,
          'reserva_expira', tg.reserva_expira
        ) AS item
      FROM public.campaign_queue cq
      LEFT JOIN public.merchant_stores ms ON ms.id = cq.merchant_store_id
      LEFT JOIN public.profiles pcria ON pcria.id = cq.created_by_user_id
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE t.status IN ('posted','confirmed','success','done'))::int AS postados,
               count(*) FILTER (WHERE t.status IN ('claimed','reserved')
                                  AND (t.claimed_until IS NULL OR t.claimed_until > now()))::int AS reservados,
               max(t.claimed_until) FILTER (WHERE t.status IN ('claimed','reserved')) AS reserva_expira,
               (array_agg(COALESCE(t.operator_user_id, t.claimed_by)
                          ORDER BY t.claimed_at DESC NULLS LAST)
                FILTER (WHERE COALESCE(t.operator_user_id, t.claimed_by) IS NOT NULL))[1] AS operador
        FROM public.campaign_posting_targets t
        WHERE t.campaign_queue_id = cq.id
      ) tg ON true
      LEFT JOIN public.profiles pop ON pop.id = COALESCE(tg.operador, cq.operator_user_id)
    ) sub
  ), '[]'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_fila_divulgacoes() TO authenticated;
