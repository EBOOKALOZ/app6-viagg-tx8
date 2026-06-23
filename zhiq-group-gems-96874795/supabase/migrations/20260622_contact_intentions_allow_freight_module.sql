/*
  Permite o valor 'freight' em advertiser_contact_intentions.listing_module.
  Necessário pro fluxo de interesse/mensagem do novo módulo Fretes & Transportes
  (register_contact_intention / unlock_freight_intention).
*/

ALTER TABLE public.advertiser_contact_intentions
  DROP CONSTRAINT IF EXISTS advertiser_contact_intentions_listing_module_check;

ALTER TABLE public.advertiser_contact_intentions
  ADD CONSTRAINT advertiser_contact_intentions_listing_module_check
  CHECK (listing_module IN ('real_estate', 'vehicles', 'product', 'services', 'freight'));

SELECT pg_notify('pgrst', 'reload schema');
