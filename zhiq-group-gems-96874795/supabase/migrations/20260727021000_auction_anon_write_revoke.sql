-- ============================================================================
-- LEILÕES — Revogação de escrita anônima (achado da 1ª rodada SHC v2.0)
-- As tabelas criadas por 20260723_auction_enterprise_baseline_oficial.sql
-- (auction_categories, auction_images, auction_proxy_bids, auction_bid_rate)
-- nasceram com os grants DEFAULT do Supabase (anon com INSERT/UPDATE/DELETE/
-- TRUNCATE), tendo a RLS como única barreira. Contrato SHC: anon nunca tem
-- privilégio de escrita em tabela de negócio (defesa em profundidade).
-- Varredura completa do módulo. Idempotente.
-- ============================================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.auction_listings, public.auction_bids, public.auction_watchers,
     public.auction_events, public.auction_categories, public.auction_images,
     public.auction_proxy_bids, public.auction_bid_rate,
     public.auction_conversion_metrics, public.arremate_listings,
     public.arremate_offers, public.orion_alc_deals,
     public.orion_arremate_messages, public.orion_arremate_transitions,
     public.auction_media, public.auction_questions, public.auction_reports,
     public.auction_fraud_alerts, public.store_badges, public.auction_ai_insights
  FROM anon;

REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON public.auction_listings, public.auction_bids, public.auction_watchers,
     public.auction_events, public.auction_categories, public.auction_images,
     public.auction_proxy_bids, public.auction_bid_rate,
     public.auction_conversion_metrics, public.arremate_listings,
     public.arremate_offers, public.orion_alc_deals,
     public.orion_arremate_messages, public.orion_arremate_transitions,
     public.auction_media, public.auction_questions, public.auction_reports,
     public.auction_fraud_alerts, public.store_badges, public.auction_ai_insights
  FROM authenticated;
