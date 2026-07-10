-- ============================================================
-- MP: public key com fallback na linha LEGADA (2026-07-10)
--
-- Bug real: "MP 400: Card Token not found" na recarga por cartão.
-- Causa: o front tokenizava com a public key do .env (app A), mas a
-- edge payments-charge implantada (v33, pré-FASE 1) cobra com o
-- access_token da tabela legada payment_gateways (app B). Token de
-- cartão criado num app não existe no outro → MP nega.
--
-- Conserto: mp_get_checkout_public_config agora resolve a public key
-- na MESMA ordem em que a edge resolve o access_token:
--   1. Config central FASE 1 (Vault) — quando estiver preenchida;
--   2. Linha ativa de payment_gateways (credentials->>'public_key').
-- O front de recarga passou a chamar esta RPC antes de montar o Brick
-- (VITE_ vira último fallback). Par sempre casado, sem tocar na edge.
--
-- Segurança: expõe SOMENTE public_key (pública por natureza — vai em
-- todo navegador). Nenhum outro campo de credentials sai daqui.
--
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

create or replace function public.mp_get_checkout_public_config()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_env public.payment_gateway_mode;
  v_pk text;
begin
  select active_environment into v_env from public.mp_gateway_config where id = true;

  -- 1. Config central (Vault), se preenchida
  if v_env is not null then
    select vs.decrypted_secret into v_pk
      from public.mp_gateway_credentials c
      join vault.decrypted_secrets vs on vs.id = c.secret_id
     where c.environment = v_env and c.field_name = 'public_key';
  end if;

  -- 2. Fallback: linha legada ativa (mesma fonte do access_token da edge)
  if v_pk is null or trim(v_pk) = '' then
    select nullif(trim(g.credentials->>'public_key'), ''),
           coalesce(v_env, case when g.mode = 'production'
                                then 'production'::public.payment_gateway_mode
                                else 'sandbox'::public.payment_gateway_mode end)
      into v_pk, v_env
      from public.payment_gateways g
     where g.is_active = true and g.provider_code = 'mercadopago'
     limit 1;
  end if;

  return jsonb_build_object(
    'environment', coalesce(v_env, 'sandbox')::text,
    'public_key', v_pk
  );
end $$;

grant execute on function public.mp_get_checkout_public_config() to anon, authenticated, service_role;
