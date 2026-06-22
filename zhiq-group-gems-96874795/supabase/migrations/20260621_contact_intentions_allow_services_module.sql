/*
  Permite o valor 'services' em advertiser_contact_intentions.listing_module.
  Necessário pro fluxo de interesse/mensagem do novo módulo Serviços
  (register_contact_intention / unlock_service_intention).
*/

ALTER TABLE public.advertiser_contact_intentions
  DROP CONSTRAINT IF EXISTS advertiser_contact_intentions_listing_module_check;

ALTER TABLE public.advertiser_contact_intentions
  ADD CONSTRAINT advertiser_contact_intentions_listing_module_check
  CHECK (listing_module IN ('real_estate', 'vehicles', 'product', 'services'));

SELECT pg_notify('pgrst', 'reload schema');
