-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGG-TX8 — FASE 2 / SQL 02 / merchant_credit_products: sincroniza colunas
-- legadas duplicadas.
--
-- A tabela carrega DOIS grupos para o mesmo dado:
--   legado (NOT NULL, sem default): credits_amount, bonus_credits, price_brl
--   novo   (nullable, default 0):   credits_base,  credits_bonus,  price_cents
--
-- O app escreve o grupo novo; o legado quebrava por NOT NULL no insert e
-- ficava defasado no update. Em vez de remendar cada caller, um trigger
-- BEFORE INSERT/UPDATE mantém os dois grupos coerentes (fonte = quem veio
-- preenchido, preferindo o grupo novo).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_mcp_sync_legacy_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Créditos: grupo novo manda; cai pro legado; senão 0.
  NEW.credits_amount := COALESCE(NEW.credits_base, NEW.credits_amount, 0);
  NEW.bonus_credits  := COALESCE(NEW.credits_bonus, NEW.bonus_credits, 0);
  NEW.credits_base   := COALESCE(NEW.credits_base, NEW.credits_amount, 0);
  NEW.credits_bonus  := COALESCE(NEW.credits_bonus, NEW.bonus_credits, 0);

  -- Preço: se veio price_cents (>0) ele manda; senão deriva de price_brl.
  IF NEW.price_cents IS NOT NULL AND NEW.price_cents > 0 THEN
    NEW.price_brl := ROUND((NEW.price_cents / 100.0)::numeric, 2);
  ELSIF NEW.price_brl IS NOT NULL AND NEW.price_brl > 0 THEN
    NEW.price_cents := ROUND(NEW.price_brl * 100)::int;
  ELSE
    NEW.price_brl   := COALESCE(NEW.price_brl, 0);
    NEW.price_cents := COALESCE(NEW.price_cents, 0);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mcp_sync_legacy ON public.merchant_credit_products;
CREATE TRIGGER trg_mcp_sync_legacy
  BEFORE INSERT OR UPDATE ON public.merchant_credit_products
  FOR EACH ROW EXECUTE FUNCTION public.fn_mcp_sync_legacy_columns();

-- Backfill: alinha linhas já existentes que estejam divergentes.
UPDATE public.merchant_credit_products
SET credits_amount = COALESCE(credits_base, credits_amount, 0),
    bonus_credits  = COALESCE(credits_bonus, bonus_credits, 0),
    credits_base   = COALESCE(credits_base, credits_amount, 0),
    credits_bonus  = COALESCE(credits_bonus, bonus_credits, 0),
    price_brl      = CASE
                       WHEN price_cents IS NOT NULL AND price_cents > 0
                         THEN ROUND((price_cents / 100.0)::numeric, 2)
                       ELSE COALESCE(price_brl, 0)
                     END,
    price_cents    = CASE
                       WHEN (price_cents IS NULL OR price_cents = 0)
                            AND price_brl IS NOT NULL AND price_brl > 0
                         THEN ROUND(price_brl * 100)::int
                       ELSE COALESCE(price_cents, 0)
                     END;
