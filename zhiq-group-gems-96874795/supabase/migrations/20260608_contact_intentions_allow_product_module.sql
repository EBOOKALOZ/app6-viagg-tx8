/*
  Permite o valor 'product' em advertiser_contact_intentions.listing_module.
  Antes a check constraint só aceitava 'real_estate' e 'vehicles'.
  Necessário pra RPC register_product_inquiry funcionar
  (perguntas vindas do /mercado).
*/

ALTER TABLE public.advertiser_contact_intentions
  DROP CONSTRAINT IF EXISTS advertiser_contact_intentions_listing_module_check;

ALTER TABLE public.advertiser_contact_intentions
  ADD CONSTRAINT advertiser_contact_intentions_listing_module_check
  CHECK (listing_module IN ('real_estate', 'vehicles', 'product'));

SELECT pg_notify('pgrst', 'reload schema');
