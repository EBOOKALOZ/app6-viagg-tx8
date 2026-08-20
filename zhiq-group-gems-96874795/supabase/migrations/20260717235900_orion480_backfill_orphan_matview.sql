-- ORION-480: materialized view órfã (criada manualmente em produção), reconstruída por introspecção read-only.
-- Posicionada antes de 20260718_orion_* (primeira referência via CREATE INDEX). No-op em produção.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.orion_auction_intel_mv_daily AS
 SELECT (created_at)::date AS dia,
    count(*) AS leiloes_criados,
    count(*) FILTER (WHERE (lower(COALESCE(status, ''::text)) = ANY (ARRAY['ended'::text, 'encerrado'::text, 'closed'::text, 'settled'::text]))) AS encerrados,
    count(*) FILTER (WHERE (winner_user_id IS NOT NULL)) AS com_vencedor,
    count(*) FILTER (WHERE (lower(COALESCE(status, ''::text)) = 'active'::text)) AS ativos,
    COALESCE(sum(starting_bid), (0)::numeric) AS soma_precos_iniciais,
    COALESCE(sum(current_bid), (0)::numeric) AS soma_precos_atuais,
    COALESCE(sum(total_bids), (0)::bigint) AS total_lances
   FROM auction_listings l
  GROUP BY ((created_at)::date);
