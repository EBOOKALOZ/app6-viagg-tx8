/*
  Adiciona campos de localização da residência ao perfil do motoboy
  Inclui também os campos de aceite legal (CNH/EPI + Prestador de Serviços)
*/

ALTER TABLE public.motoboy_profiles
  ADD COLUMN IF NOT EXISTS latitude_residencia  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude_residencia DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS endereco_residencia  TEXT,
  ADD COLUMN IF NOT EXISTS aceite_cnh_epi_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aceite_prestador_at       TIMESTAMPTZ;

COMMENT ON COLUMN public.motoboy_profiles.latitude_residencia  IS 'Latitude da residência do motoboy (confirmada via captcha)';
COMMENT ON COLUMN public.motoboy_profiles.longitude_residencia IS 'Longitude da residência do motoboy (confirmada via captcha)';
COMMENT ON COLUMN public.motoboy_profiles.endereco_residencia  IS 'Endereço completo da residência (de geocode reverso ou busca)';
COMMENT ON COLUMN public.motoboy_profiles.aceite_cnh_epi_at    IS 'Timestamp do aceite dos termos de CNH e EPI (art. 140/162/244 do CTB)';
COMMENT ON COLUMN public.motoboy_profiles.aceite_prestador_at  IS 'Timestamp do aceite como prestador de serviços autônomo (art. 442-B CLT)';

/* Índice geoespacial leve para futuras buscas por proximidade */
CREATE INDEX IF NOT EXISTS idx_motoboy_residencia_geo
  ON public.motoboy_profiles (latitude_residencia, longitude_residencia)
  WHERE latitude_residencia IS NOT NULL AND longitude_residencia IS NOT NULL;
