-- ============================================================================
-- P0-10 — endurecer funções SECURITY DEFINER sem search_path fixo que são
--         executáveis por anon (mitiga search_path hijacking com elevação)
-- ============================================================================
-- Causa raiz:
--   56 funções public.* são SECURITY DEFINER (executam com privilégios do
--   OWNER, tipicamente superusuário no Supabase) SEM "SET search_path" fixo,
--   e têm EXECUTE concedido a anon. Uma função DEFINER sem search_path fixo é
--   vulnerável a search_path hijacking: o chamador cria um objeto malicioso
--   (função/tabela) num schema resolvido antes de 'public' (ou via pg_temp) e
--   a função DEFINER, ao referenciar objetos sem qualificação de schema,
--   executa o objeto do atacante com privilégios do owner — elevação de
--   privilégio a partir de uma sessão anônima. Alvos sensíveis incluem
--   create_reversal, is_financial_admin, toggle_feature_flag/upsert_feature_flag,
--   submit_marketplace_order, update_public_ride_status, wallets, etc.
--
-- Correção (fail-closed, sem alterar a lógica de cada função):
--   ALTER FUNCTION ... SET search_path = public, pg_temp em cada função DEFINER
--   sem search_path executável por anon. Fixa a resolução de nomes ao schema
--   'public' (pg_temp por último, nunca primeiro — evita reintroduzir o vetor
--   via objetos temporários). É o mesmo padrão da is_admin() canônica do
--   projeto. Idempotente e não toca o corpo das funções.
--   Aplicado dinamicamente sobre o alvo REAL no momento da migration (via
--   catálogo), evitando erro de assinatura em overloads.
--
-- Escopo: apenas funções executáveis por anon (vetor anônimo = P0). Endurecer
-- as demais DEFINER sem search_path (só authenticated/service_role) é P1 e
-- pode ser feito com o mesmo padrão depois.
--
-- Idempotente: reexecutar é no-op (as já corrigidas saem do predicado) + guard.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef = true
      AND n.nspname = 'public'
      AND (p.proconfig IS NULL
           OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname NOT LIKE 'st\_%'   -- PostGIS de sistema
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp;',
      r.proname, r.args
    );
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'P0-10: search_path fixado em % função(ões) DEFINER executáveis por anon', v_count;
END $$;

-- Guard fail-closed: não pode restar nenhuma função DEFINER sem search_path
-- executável por anon (exceto PostGIS st_*).
DO $$
DECLARE v_offender text;
BEGIN
  SELECT p.proname INTO v_offender
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosecdef = true
    AND n.nspname = 'public'
    AND (p.proconfig IS NULL
         OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND p.proname NOT LIKE 'st\_%'
  LIMIT 1;
  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION 'P0-10: ainda existe função DEFINER sem search_path executável por anon: %', v_offender;
  END IF;
END $$;

COMMIT;
