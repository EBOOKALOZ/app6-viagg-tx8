-- ============================================================
-- PERFIS DE NEGÓCIO POR MÓDULO ("Minha X" + "Aparência da X") · 2026-07-22
-- Problema: só o lojista tem "Minha Loja"/"Aparência da Loja"
--   (merchant_stores.appearance). Os demais módulos (imóveis,
--   veículos, leilões, arremates, fretes, viagens) não têm perfil
--   editável nem personalização visual.
-- Decisão: replicar o MESMO modelo do lojista numa tabela única
--   advertiser_module_profiles (1 linha por user_id × module_key)
--   com identidade (nome/logo/banner/descrição/contatos) +
--   appearance JSONB — escrita SÓ via RPC (front nunca escreve
--   direto), leitura pública (páginas públicas refletem na hora).
-- merchant_stores NÃO é alterada (lojista permanece intacto).
-- Idempotente. Aplicar via SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- 1) Tabela
CREATE TABLE IF NOT EXISTS public.advertiser_module_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  module_key    text NOT NULL,
  display_name  text,
  description   text,
  logo_url      text,
  banner_url    text,
  cover_url     text,
  opening_hours text,
  whatsapp      text,
  phone         text,
  instagram     text,
  facebook      text,
  site          text,
  email         text,
  city          text,
  state         text,
  appearance    jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT advertiser_module_profiles_module_chk CHECK (
    module_key IN ('imobiliaria','revenda','leiloes','arremates','empresa_fretes','agencia_turismo')
  ),
  CONSTRAINT advertiser_module_profiles_user_module_uk UNIQUE (user_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_amp_user_module
  ON public.advertiser_module_profiles (user_id, module_key);

-- 2) RLS: leitura pública (vitrines/páginas de detalhe usam),
--    escrita SOMENTE via RPC SECURITY DEFINER (sem policy de write).
ALTER TABLE public.advertiser_module_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS amp_public_read ON public.advertiser_module_profiles;
CREATE POLICY amp_public_read ON public.advertiser_module_profiles
  FOR SELECT USING (true);

-- 3) RPC de identidade — upsert parcial (só chaves presentes no patch)
CREATE OR REPLACE FUNCTION public.upsert_business_profile(p_module text, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.advertiser_module_profiles;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  IF p_module IS NULL OR p_module NOT IN
     ('imobiliaria','revenda','leiloes','arremates','empresa_fretes','agencia_turismo') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_module');
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
  END IF;
  IF length(p_patch::text) > 20000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'payload_too_large');
  END IF;

  INSERT INTO public.advertiser_module_profiles (user_id, module_key)
  VALUES (v_uid, p_module)
  ON CONFLICT (user_id, module_key) DO NOTHING;

  UPDATE public.advertiser_module_profiles t SET
    display_name  = CASE WHEN p_patch ? 'display_name'  THEN left(nullif(trim(p_patch->>'display_name'), ''), 120)  ELSE t.display_name  END,
    description   = CASE WHEN p_patch ? 'description'   THEN left(nullif(trim(p_patch->>'description'), ''), 2000)  ELSE t.description   END,
    logo_url      = CASE WHEN p_patch ? 'logo_url'      THEN left(nullif(trim(p_patch->>'logo_url'), ''), 600)      ELSE t.logo_url      END,
    banner_url    = CASE WHEN p_patch ? 'banner_url'    THEN left(nullif(trim(p_patch->>'banner_url'), ''), 600)    ELSE t.banner_url    END,
    cover_url     = CASE WHEN p_patch ? 'cover_url'     THEN left(nullif(trim(p_patch->>'cover_url'), ''), 600)     ELSE t.cover_url     END,
    opening_hours = CASE WHEN p_patch ? 'opening_hours' THEN left(nullif(trim(p_patch->>'opening_hours'), ''), 300) ELSE t.opening_hours END,
    whatsapp      = CASE WHEN p_patch ? 'whatsapp'      THEN left(regexp_replace(coalesce(p_patch->>'whatsapp',''), '\D', '', 'g'), 15)  ELSE t.whatsapp END,
    phone         = CASE WHEN p_patch ? 'phone'         THEN left(regexp_replace(coalesce(p_patch->>'phone',''), '\D', '', 'g'), 15)     ELSE t.phone    END,
    instagram     = CASE WHEN p_patch ? 'instagram'     THEN left(nullif(trim(p_patch->>'instagram'), ''), 60)      ELSE t.instagram     END,
    facebook      = CASE WHEN p_patch ? 'facebook'      THEN left(nullif(trim(p_patch->>'facebook'), ''), 600)      ELSE t.facebook      END,
    site          = CASE WHEN p_patch ? 'site'          THEN left(nullif(trim(p_patch->>'site'), ''), 600)          ELSE t.site          END,
    email         = CASE WHEN p_patch ? 'email'         THEN left(nullif(trim(p_patch->>'email'), ''), 120)         ELSE t.email         END,
    city          = CASE WHEN p_patch ? 'city'          THEN left(nullif(trim(p_patch->>'city'), ''), 120)          ELSE t.city          END,
    state         = CASE WHEN p_patch ? 'state'         THEN left(nullif(trim(p_patch->>'state'), ''), 60)          ELSE t.state         END,
    updated_at    = now()
  WHERE t.user_id = v_uid AND t.module_key = p_module
  RETURNING t.* INTO v_row;

  RETURN jsonb_build_object('success', true, 'profile', to_jsonb(v_row));
END;
$$;

-- 4) RPC de aparência — mesmo contrato do set_store_appearance do lojista
--    (objeto JSON ≤ 20 KB; NULL = restaurar visual padrão da plataforma).
--    Determinístico: sempre a linha (auth.uid(), p_module).
CREATE OR REPLACE FUNCTION public.set_business_appearance(p_module text, p_appearance jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  IF p_module IS NULL OR p_module NOT IN
     ('imobiliaria','revenda','leiloes','arremates','empresa_fretes','agencia_turismo') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_module');
  END IF;
  IF p_appearance IS NOT NULL THEN
    IF jsonb_typeof(p_appearance) <> 'object' THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
    END IF;
    IF length(p_appearance::text) > 20000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'payload_too_large');
    END IF;
  END IF;

  INSERT INTO public.advertiser_module_profiles (user_id, module_key)
  VALUES (v_uid, p_module)
  ON CONFLICT (user_id, module_key) DO NOTHING;

  UPDATE public.advertiser_module_profiles
  SET appearance = p_appearance, updated_at = now()
  WHERE user_id = v_uid AND module_key = p_module
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'profile_id', v_id,
    'cleared', p_appearance IS NULL);
END;
$$;

-- 5) Permissões explícitas (padrão do projeto)
REVOKE ALL ON FUNCTION public.upsert_business_profile(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.upsert_business_profile(text, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_business_appearance(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_business_appearance(text, jsonb) TO authenticated, service_role;

-- ============================================================
-- VERIFICAÇÃO (deve retornar 1 linha: tabela=1, rpcs=2)
-- ============================================================
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'advertiser_module_profiles') AS tabela,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('upsert_business_profile','set_business_appearance')) AS rpcs;
