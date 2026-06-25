-- Permite o valor 'travel' em advertiser_contact_intentions.listing_module.
ALTER TABLE public.advertiser_contact_intentions
  DROP CONSTRAINT IF EXISTS advertiser_contact_intentions_listing_module_check;

ALTER TABLE public.advertiser_contact_intentions
  ADD CONSTRAINT advertiser_contact_intentions_listing_module_check
  CHECK (listing_module IN ('real_estate', 'vehicles', 'product', 'services', 'freight', 'travel'));

SELECT pg_notify('pgrst', 'reload schema');
