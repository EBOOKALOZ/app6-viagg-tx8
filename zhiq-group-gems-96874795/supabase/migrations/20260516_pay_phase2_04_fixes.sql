-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGG-TX8 — FASE 2 / SQL 04 / Correções de bugs sistêmicos (prod)
--
-- 1) real_estate_credit_purchases não tinha coluna expires_at, mas o checkout
--    mandava esse campo → PostgREST 400 em toda compra. Coluna adicionada.
-- 2) ensure_advertiser_account inseria id=auth.uid() e NUNCA setava user_id
--    (NOT NULL) → "null value in column user_id" sempre que o fluxo de
--    anunciante tentava criar a conta. Reescrita: seta user_id, guarda
--    auth.uid() nulo e usa ON CONFLICT (user_id).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.real_estate_credit_purchases
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.ensure_advertiser_account(
  p_full_name text DEFAULT NULL::text,
  p_whatsapp  text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  INSERT INTO public.advertiser_accounts (user_id, email, full_name, whatsapp, status, updated_at)
  VALUES (
    v_uid,
    (SELECT email FROM auth.users WHERE id = v_uid),
    p_full_name, p_whatsapp, 'active', now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = COALESCE(EXCLUDED.full_name, public.advertiser_accounts.full_name),
        whatsapp  = COALESCE(EXCLUDED.whatsapp,  public.advertiser_accounts.whatsapp),
        updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$function$;
