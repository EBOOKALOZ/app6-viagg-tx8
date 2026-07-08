-- ════════════════════════════════════════════════════════════════════════
-- GATE de verificação — rodar ANTES das migrations de despacho (20260708_*).
-- Confere que as tabelas-alvo têm as colunas/valores que os INSERTs assumem.
-- SQL Editor (broifhfqmnzqoongtokm). Só LEITURA — não altera nada.
-- ════════════════════════════════════════════════════════════════════════

-- 1) Colunas das duas tabelas-alvo -----------------------------------------
--    ESPERADO conter:
--    moto_taxi_corridas: passenger_id, status, origin_address, origin_lat,
--      origin_lng, destination_address, destination_lat, destination_lng,
--      estimated_km, estimated_price
--    motorista_corridas: passenger_id, status, origem, destino,
--      distancia_km, valor
SELECT
  'moto_taxi_corridas' AS tabela,
  (SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
     FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'moto_taxi_corridas') AS colunas
UNION ALL
SELECT
  'motorista_corridas',
  (SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
     FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'motorista_corridas');

-- 2) Constraints CHECK de status -------------------------------------------
--    ESPERADO: moto_taxi_corridas permite 'pesquisando';
--              motorista_corridas permite 'pendente'.
SELECT conrelid::regclass AS tabela, conname, pg_get_constraintdef(oid) AS definicao
  FROM pg_constraint
 WHERE conrelid IN ('public.moto_taxi_corridas'::regclass,
                    'public.motorista_corridas'::regclass)
   AND contype = 'c'
 ORDER BY 1, 2;

-- 3) Colunas NOT NULL sem default (as que o INSERT PRECISA preencher) -------
--    Se aparecer alguma coluna NOT NULL fora das que o INSERT já preenche,
--    me avise — ajusto a migration antes de você rodar.
SELECT table_name, column_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('moto_taxi_corridas', 'motorista_corridas')
   AND is_nullable = 'NO'
   AND column_default IS NULL
 ORDER BY table_name, ordinal_position;
