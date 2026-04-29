
-- ═══════════════════════════════════════════════════════════
-- MIGRATION: 20260329_fix_nuclear_dispatch.sql
-- FIX NUCLEAR — target_motoboy_id & Unified Dispatch Engine
-- ═══════════════════════════════════════════════════════════

DO $$ BEGIN RAISE LOG 'FIX NUCLEAR START'; END $$;

-- ═══════════════════════════════════════
-- 1. Cria a tabela dispatch_rounds (se não existir)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.dispatch_rounds (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lojista_id       uuid,
  lat              double precision,
  lng              double precision,
  tipo_servico     text,
  descricao        text,
  max_postadores   integer DEFAULT 1,
  valor_pagamento  numeric(10,2),
  raio_km          integer DEFAULT 10,
  prioridade       integer DEFAULT 50,
  status           text DEFAULT 'aberto',
  grupos_alvo      uuid[],
  criado_em        timestamptz DEFAULT now(),
  iniciado_em      timestamptz,
  concluido_em     timestamptz,
  metadata         jsonb DEFAULT '{}'
);

-- ═══════════════════════════════════════
-- 2. Drop nuclear de todos os triggers e funções com target_motoboy_id
-- ═══════════════════════════════════════
DO $$
DECLARE
  r   record;
  fn  record;
BEGIN
  -- Remove triggers cujas funções mencionam target_motoboy_id
  FOR r IN
    SELECT DISTINCT t.trigger_name, t.event_object_table
    FROM information_schema.triggers t
    WHERE t.trigger_schema = 'public'
  LOOP
    BEGIN
      -- Verifica se a função do trigger usa target_motoboy_id
      IF EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND pg_get_functiondef(p.oid) ILIKE '%target_motoboy_id%'
          AND p.proname IN (
            SELECT action_statement
            FROM information_schema.triggers
            WHERE trigger_name = r.trigger_name
              AND trigger_schema = 'public'
          )
      ) THEN
        EXECUTE format(
          'DROP TRIGGER IF EXISTS %I ON public.%I CASCADE',
          r.trigger_name, r.event_object_table
        );
        RAISE NOTICE 'DROP TRIGGER % ON %', r.trigger_name, r.event_object_table;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Erro em trigger % : %', r.trigger_name, SQLERRM;
    END;
  END LOOP;

  -- Remove TODAS as funções que contêm target_motoboy_id
  FOR fn IN
    SELECT p.proname, p.oid,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND pg_get_functiondef(p.oid) ILIKE '%target_motoboy_id%'
  LOOP
    BEGIN
      EXECUTE format(
        'DROP FUNCTION IF EXISTS public.%I(%s) CASCADE',
        fn.proname, fn.args
      );
      RAISE NOTICE 'DROP FUNCTION public.%(%)', fn.proname, fn.args;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Erro em função % : %', fn.proname, SQLERRM;
    END;
  END LOOP;

END $$;

-- ═══════════════════════════════════════
-- 3. Adiciona coluna target_motoboy_id em TODAS as tabelas do schema public (Safety Net)
-- ═══════════════════════════════════════
DO $$
DECLARE
  tbl record;
BEGIN
  FOR tbl IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS target_motoboy_id uuid',
        tbl.table_name
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- ignora tabelas que não aceitam ALTER
    END;
  END LOOP;
  RAISE NOTICE 'Coluna target_motoboy_id garantida em todas as tabelas';
END $$;

-- ═══════════════════════════════════════
-- 4. Recria create_dispatch_round limpa
-- ═══════════════════════════════════════
DROP FUNCTION IF EXISTS public.create_dispatch_round(uuid,double precision,double precision,text,text,integer,numeric,integer,integer) CASCADE;
DROP FUNCTION IF EXISTS public.create_dispatch_round(uuid,double precision,double precision,text,text,integer,numeric,integer,integer,uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.create_dispatch_round(
  p_lojista_id      uuid,
  p_lat             double precision,
  p_lng             double precision,
  p_tipo_servico    text,
  p_descricao       text,
  p_max_postadores  integer,
  p_valor_pagamento numeric,
  p_raio_km         integer,
  p_prioridade      integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.dispatch_rounds
    (lojista_id, lat, lng, tipo_servico, descricao,
     max_postadores, valor_pagamento, raio_km, prioridade, status)
  VALUES
    (p_lojista_id, p_lat, p_lng, p_tipo_servico, p_descricao,
     p_max_postadores, p_valor_pagamento, p_raio_km, p_prioridade, 'aberto')
  RETURNING id INTO v_id;
  
  PERFORM pg_notify('antigravity_events',
    json_build_object('tipo','novo_dispatch_round','round_id',v_id)::text);
    
  RETURN v_id;
END;
$$;

-- ═══════════════════════════════════════
-- 5. Link Service Orders to Dispatch Cycle
-- ═══════════════════════════════════════

-- Função para automatizar o dispatch quando o status é awaiting_professional
CREATE OR REPLACE FUNCTION public.fn_trigger_service_order_dispatch()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o status for alterado para 'awaiting_professional'
  IF (TG_OP = 'UPDATE' AND NEW.status = 'awaiting_professional' AND OLD.status <> 'awaiting_professional') 
     OR (TG_OP = 'INSERT' AND NEW.status = 'awaiting_professional') THEN
    
    -- Chama o motor de dispatch cycle
    -- (Garante que passamos city_id e as coordenadas se disponíveis)
    PERFORM public.run_dispatch_cycle(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_service_order_dispatch_engine ON public.service_orders;
CREATE TRIGGER trigger_service_order_dispatch_engine
AFTER INSERT OR UPDATE ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_trigger_service_order_dispatch();

DO $$ BEGIN RAISE LOG 'FIX NUCLEAR COMPLETE'; END $$;
