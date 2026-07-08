-- ============================================================
-- MÓDULO CADASTRO DE VEÍCULO (motorista / moto-táxi)
--
-- Tabela dedicada driver_vehicles: cada profissional pode ter 1+ veículos,
-- mas APENAS UM ativo (o que recebe chamadas). Fotos em bucket próprio.
-- Owner-only (RLS). RPC set_active_vehicle troca o ativo atomicamente.
--
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.driver_vehicles (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_type           text NOT NULL CHECK (vehicle_type IN ('carro','moto')),
  brand                  text NOT NULL,
  model                  text NOT NULL,
  manufacture_year       int  NOT NULL CHECK (manufacture_year BETWEEN 1950 AND 2100),
  plate                  text NOT NULL,
  color                  text NOT NULL,
  air_conditioning       boolean NOT NULL DEFAULT false,
  passenger_capacity     int  NOT NULL DEFAULT 1 CHECK (passenger_capacity BETWEEN 1 AND 8),
  accessible             boolean NOT NULL DEFAULT false,
  accessibility_features text[] NOT NULL DEFAULT '{}',
  observations           text,
  front_photo            text,
  rear_photo             text,
  side_photo             text,
  interior_photo         text,
  active                 boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Apenas UM veículo ativo por motorista (índice único parcial).
CREATE UNIQUE INDEX IF NOT EXISTS driver_vehicles_one_active
  ON public.driver_vehicles (driver_id) WHERE active;

CREATE INDEX IF NOT EXISTS driver_vehicles_driver_idx ON public.driver_vehicles (driver_id);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.tg_driver_vehicles_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_driver_vehicles_touch ON public.driver_vehicles;
CREATE TRIGGER trg_driver_vehicles_touch
  BEFORE UPDATE ON public.driver_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.tg_driver_vehicles_touch();

-- ── RLS: dono gerencia os próprios; qualquer autenticado lê veículo ATIVO
--    (para o passageiro escolher por acessibilidade, no futuro). ──────────
ALTER TABLE public.driver_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_vehicles_owner_all ON public.driver_vehicles;
CREATE POLICY driver_vehicles_owner_all ON public.driver_vehicles
  FOR ALL USING (driver_id = auth.uid()) WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS driver_vehicles_read_active ON public.driver_vehicles;
CREATE POLICY driver_vehicles_read_active ON public.driver_vehicles
  FOR SELECT USING (active = true);

-- ── RPC: ativa um veículo e desativa os demais do mesmo dono (atômico) ──
CREATE OR REPLACE FUNCTION public.set_active_vehicle(p_vehicle_id uuid)
RETURNS public.driver_vehicles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.driver_vehicles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — requer autenticação' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.driver_vehicles WHERE id = p_vehicle_id AND driver_id = v_uid) THEN
    RAISE EXCEPTION 'Veículo % não é seu ou não existe', p_vehicle_id USING ERRCODE = '42501';
  END IF;

  UPDATE public.driver_vehicles SET active = false WHERE driver_id = v_uid AND active;
  UPDATE public.driver_vehicles SET active = true WHERE id = p_vehicle_id
    RETURNING * INTO v_row;
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.set_active_vehicle(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_active_vehicle(uuid) TO authenticated, service_role;

-- ── Storage: bucket público de fotos de veículo ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('driver-vehicles', 'driver-vehicles', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage: leitura pública; escrita só na própria pasta (uid/…).
DROP POLICY IF EXISTS driver_vehicles_photos_read ON storage.objects;
CREATE POLICY driver_vehicles_photos_read ON storage.objects
  FOR SELECT USING (bucket_id = 'driver-vehicles');

DROP POLICY IF EXISTS driver_vehicles_photos_write ON storage.objects;
CREATE POLICY driver_vehicles_photos_write ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'driver-vehicles'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS driver_vehicles_photos_update ON storage.objects;
CREATE POLICY driver_vehicles_photos_update ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'driver-vehicles'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS driver_vehicles_photos_delete ON storage.objects;
CREATE POLICY driver_vehicles_photos_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'driver-vehicles'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
