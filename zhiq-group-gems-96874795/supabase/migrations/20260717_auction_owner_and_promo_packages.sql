-- ============================================================================
-- LEILÕES — vínculo de dono + pacotes de divulgação · 2026-07-17
-- ============================================================================
-- (1) Leilões órfãos (owner_user_id/store_id NULL) não aparecem em "MEUS LEILÕES"
--     (o painel filtra por dono). Corrige o existente e adiciona trigger que
--     deriva o dono no INSERT (via store_id -> merchant_stores.user_id, ou auth.uid()).
-- (2) Pacotes de DIVULGAÇÃO de leilões (5/10/30 posts/dia) não apareciam em
--     /admin/promotion-packages: inserir em promotion_packages com profile_type='leiloes'.
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

-- (1a) Corrige leilões órfãos: deriva o dono do produto de origem quando possível.
UPDATE public.auction_listings al
   SET owner_user_id = COALESCE(al.owner_user_id, sub.owner),
       store_id      = COALESCE(al.store_id, sub.store)
  FROM (
    SELECT a.id,
           COALESCE(
             (SELECT ml.user_id FROM public.merchant_products ml WHERE ml.id = a.product_id),
             (SELECT ps.user_id FROM public.promoted_listing_slots ps WHERE ps.listing_id = a.product_id::text LIMIT 1)
           ) AS owner,
           NULL::uuid AS store
    FROM public.auction_listings a
    WHERE a.owner_user_id IS NULL
  ) sub
 WHERE al.id = sub.id AND sub.owner IS NOT NULL;

-- store_id a partir do dono (quando faltar)
UPDATE public.auction_listings al
   SET store_id = ms.id
  FROM public.merchant_stores ms
 WHERE al.store_id IS NULL AND al.owner_user_id IS NOT NULL AND ms.user_id = al.owner_user_id;

-- (1b) Trigger: todo novo leilão recebe um dono (nunca fica órfão).
CREATE OR REPLACE FUNCTION public.auction_set_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_user_id IS NULL THEN
    IF NEW.store_id IS NOT NULL THEN
      SELECT user_id INTO NEW.owner_user_id FROM public.merchant_stores WHERE id = NEW.store_id;
    END IF;
    IF NEW.owner_user_id IS NULL AND auth.uid() IS NOT NULL THEN
      NEW.owner_user_id := auth.uid();
    END IF;
  END IF;
  IF NEW.store_id IS NULL AND NEW.owner_user_id IS NOT NULL THEN
    SELECT id INTO NEW.store_id FROM public.merchant_stores WHERE user_id = NEW.owner_user_id LIMIT 1;
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_auction_set_owner ON public.auction_listings;
CREATE TRIGGER trg_auction_set_owner
  BEFORE INSERT ON public.auction_listings
  FOR EACH ROW EXECUTE FUNCTION public.auction_set_owner();

-- (2) Pacotes de DIVULGAÇÃO de leilões (5/10/30 posts/dia) — profile_type='leiloes'
INSERT INTO public.promotion_packages
  (name, slug, description, color, color_secondary, icon, daily_boosts, price_monthly, period_options, benefits, is_active, is_popular, sort_order, profile_type)
SELECT * FROM (VALUES
  ('Bronze Leilões','leiloes-bronze','Divulgue seu leilão e receba mais lances','#CD7F32','#B87333','🥉',5, 9.90::numeric, ARRAY[7,15,30], ARRAY['5 divulgações por dia nos grupos','Mais participantes no seu leilão','Distribuição ao longo do dia'], true, false, 1, 'leiloes'),
  ('Prata Leilões','leiloes-prata','Mais alcance para o seu leilão','#9E9E9E','#757575','🥈',10, 19.90::numeric, ARRAY[7,15,30], ARRAY['10 divulgações por dia nos grupos','Prioridade na vitrine de leilões','Relatório de desempenho'], true, true, 2, 'leiloes'),
  ('Ouro Leilões','leiloes-ouro','Máxima exposição para o seu leilão','#FFD700','#FFA500','🥇',30, 39.90::numeric, ARRAY[7,15,30], ARRAY['30 divulgações por dia nos grupos','Selo Patrocinado na vitrine','Máxima prioridade e relatórios avançados'], true, false, 3, 'leiloes')
) v(name, slug, description, color, color_secondary, icon, daily_boosts, price_monthly, period_options, benefits, is_active, is_popular, sort_order, profile_type)
WHERE NOT EXISTS (SELECT 1 FROM public.promotion_packages WHERE profile_type = 'leiloes');

-- Verificação
SELECT
  (SELECT count(*) FROM public.auction_listings WHERE owner_user_id IS NULL) AS orfaos_restantes,
  (SELECT count(*) FROM public.promotion_packages WHERE profile_type='leiloes') AS pacotes_leiloes,
  (SELECT count(*) FROM pg_trigger WHERE tgname='trg_auction_set_owner') AS trigger_ok;
