-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2 · M22: operator_service_categories
-- Catálogo configurável de tipos de serviço por perfil de operador
--
-- Admin pode ativar/desativar tipos via UPDATE — sem deploy.
-- Novos perfis (táxi, transportadora, guincho…) são adicionados com INSERT.
-- Validado pela RPC create_operator_promotional_slot() na M23.
--
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabela de configuração
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.operator_service_categories (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_type  TEXT    NOT NULL,
  service_type  TEXT    NOT NULL,
  label         TEXT    NOT NULL,
  description   TEXT,
  icon          TEXT,   -- emoji ou nome de ícone lucide
  sort_order    INT     NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.operator_service_categories IS
'Tier 2.2: Tipos de serviço disponíveis por perfil de operador. Parametrizável via admin — INSERT/UPDATE sem deploy.';

-- Unique: (profile_type, service_type)
DO $$ BEGIN
  ALTER TABLE public.operator_service_categories
    ADD CONSTRAINT osc_profile_service_unique
    UNIQUE (profile_type, service_type);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.operator_service_categories
    ADD CONSTRAINT osc_profile_type_check
    CHECK (profile_type IN ('driver','motoboy','mototaxi'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_osc_profile_active
  ON public.operator_service_categories (profile_type, sort_order ASC)
  WHERE is_active = true;

-- RLS: leitura pública (authenticated), escrita apenas via admin
ALTER TABLE public.operator_service_categories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'operator_service_categories'
      AND policyname = 'osc_select_authenticated'
  ) THEN
    CREATE POLICY "osc_select_authenticated"
      ON public.operator_service_categories
      FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Seed — Motorista (driver)
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.operator_service_categories
  (profile_type, service_type, label, description, icon, sort_order)
VALUES
  ('driver', 'corridas',    'Corridas',             'Transporte de passageiros em geral',        '🚗', 1),
  ('driver', 'viagens',     'Viagens',              'Viagens intermunicipais e estaduais',       '✈️', 2),
  ('driver', 'transfer',    'Transfer',             'Transfer aeroporto, hotel, evento',         '🏨', 3),
  ('driver', 'fretamento',  'Fretamento',           'Fretamento por horas ou diárias',           '📅', 4),
  ('driver', 'turismo',     'Turismo',              'Passeios e roteiros turísticos',            '🗺️', 5),
  ('driver', 'escolar',     'Escolar',              'Transporte escolar regular',                '🏫', 6),
  ('driver', 'corporativo', 'Corporativo',          'Transporte executivo e empresarial',        '💼', 7),
  ('driver', 'cashback',    'Cashback & Promoções', 'Ofertas especiais e programas de fidelidade','💰', 8)
ON CONFLICT (profile_type, service_type) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Seed — Moto Táxi (mototaxi)
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.operator_service_categories
  (profile_type, service_type, label, description, icon, sort_order)
VALUES
  ('mototaxi', 'corridas',          'Corridas',              'Corridas urbanas rápidas',               '🏍️', 1),
  ('mototaxi', 'corridas_rapidas',  'Corridas Expressas',    'Ponto a ponto em até 10 minutos',        '⚡', 2),
  ('mototaxi', 'corridas_noturnas', 'Corridas Noturnas',     'Atendimento noturno e madrugada',        '🌙', 3),
  ('mototaxi', 'area_cobertura',    'Área de Cobertura',     'Divulgar bairros e regiões atendidos',   '📍', 4),
  ('mototaxi', 'agendamento',       'Agendamento',           'Corridas agendadas com horário fixo',    '🕐', 5),
  ('mototaxi', 'promocao',          'Promoção',              'Tarifas especiais e descontos',          '🎉', 6),
  ('mototaxi', 'indicacao',         'Indique & Ganhe',       'Programa de indicação de clientes',      '👥', 7)
ON CONFLICT (profile_type, service_type) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Seed — Motoboy (motoboy)
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.operator_service_categories
  (profile_type, service_type, label, description, icon, sort_order)
VALUES
  ('motoboy', 'entregas',         'Entregas',               'Entregas expressas de pequenos volumes',  '📦', 1),
  ('motoboy', 'fretes',           'Fretes',                 'Fretes urbanos e intermunicipais',        '🚛', 2),
  ('motoboy', 'servicos_rapidos', 'Serviços Rápidos',       'Coleta e entrega same-day',               '⚡', 3),
  ('motoboy', 'motocomboy',       'Motocomboy',             'Escolta e comboio de veículos',           '🏍️', 4),
  ('motoboy', 'empresas',         'Para Empresas',          'Contratos e parcerias com empresas',      '🏢', 5),
  ('motoboy', 'comercios',        'Para Comércios',         'Parceria com lojas e restaurantes',       '🏪', 6),
  ('motoboy', 'documentos',       'Documentos',             'Entrega de documentos e envelopes',       '📄', 7),
  ('motoboy', 'farmacia',         'Farmácia',               'Entrega de medicamentos',                 '💊', 8),
  ('motoboy', 'promocao',         'Promoção',               'Tarifas especiais e cupons',              '🎉', 9)
ON CONFLICT (profile_type, service_type) DO NOTHING;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M22 — operator_service_categories criada + 24 categorias seed (8 driver, 7 mototaxi, 9 motoboy).';
END $$;
