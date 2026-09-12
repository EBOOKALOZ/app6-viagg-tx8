-- ============================================================================
-- Migration: fix_auction_bid_rate_pkey
-- Data: 2026-09-10
-- Objetivo: Corrigir a PK de auction_bid_rate para incluir window_start,
--           permitindo que o ON CONFLICT (listing_id, user_id, window_start)
--           na RPC place_auction_bid (v4, 20260728) funcione corretamente.
--
-- ESTADO ATUAL VERIFICADO NO STAGING (2026-09-10):
--   PK:  auction_bid_rate_pkey = (listing_id, user_id)
--   UK:  auction_bid_rate_uk   = NÃO EXISTE (DO block do 20260728 não criou)
--   FKs: NENHUMA referenciando auction_bid_rate
--   Dependências de auction_bid_rate_pkey: NENHUMA (sem FKs, sem views mat.)
--   Registros: 57 rows, ZERO duplicatas em (listing_id, user_id, window_start)
--
-- MUDANÇA:
--   DROP PK (listing_id, user_id)  → sem CASCADE (não há dependências)
--   ADD PK  (listing_id, user_id, window_start)
--
-- NOTA: NÃO usamos CASCADE porque verificamos que não há dependências.
--       Se houvesse, o DROP falharia de forma segura, sinalizando que
--       há algo inesperado a ser investigado antes de prosseguir.
-- ============================================================================

BEGIN;

-- 1. Verificação de segurança: aborta se existirem FKs apontando para a PK
DO $$
DECLARE
  v_fk_count int;
BEGIN
  SELECT count(*) INTO v_fk_count
  FROM pg_constraint c
  WHERE c.confrelid = (SELECT oid FROM pg_class WHERE relname = 'auction_bid_rate')
    AND c.contype = 'f';
  IF v_fk_count > 0 THEN
    RAISE EXCEPTION 'ABORTADO: existem % FK(s) referenciando auction_bid_rate. Investigue antes de dropar a PK.', v_fk_count;
  END IF;
END $$;

-- 2. Verificação de segurança: aborta se existirem duplicatas na nova PK
DO $$
DECLARE
  v_dup_count int;
BEGIN
  SELECT count(*) INTO v_dup_count FROM (
    SELECT listing_id, user_id, window_start
    FROM public.auction_bid_rate
    GROUP BY listing_id, user_id, window_start
    HAVING count(*) > 1
  ) dupes;
  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'ABORTADO: existem % grupo(s) de duplicatas em (listing_id, user_id, window_start). Limpe antes de recriar a PK.', v_dup_count;
  END IF;
END $$;

-- 3. Remove a PK antiga (sem CASCADE — falha se houver dependência inesperada)
ALTER TABLE public.auction_bid_rate DROP CONSTRAINT IF EXISTS auction_bid_rate_pkey;

-- 4. Remove a UK redundante (se existir — no staging atual NÃO existe)
ALTER TABLE public.auction_bid_rate DROP CONSTRAINT IF EXISTS auction_bid_rate_uk;

-- 5. Cria a nova PK composta
ALTER TABLE public.auction_bid_rate ADD PRIMARY KEY (listing_id, user_id, window_start);

-- 6. Verificação pós-migração
DO $$
DECLARE
  v_pk_cols text;
BEGIN
  SELECT string_agg(a.attname, ', ' ORDER BY array_position(i.indkey, a.attnum))
  INTO v_pk_cols
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = 'public.auction_bid_rate'::regclass AND i.indisprimary;

  IF v_pk_cols IS DISTINCT FROM 'listing_id, user_id, window_start' THEN
    RAISE EXCEPTION 'VERIFICAÇÃO FALHOU: PK esperada (listing_id, user_id, window_start), encontrada (%)', v_pk_cols;
  END IF;

  RAISE NOTICE 'OK: PK de auction_bid_rate agora é (%)', v_pk_cols;
END $$;

COMMIT;
