-- ORION-540: Configuração de imagens dinâmicas por categoria (Mercado Local / Admin)
-- Idempotente para replay em ambientes novos e CI.
-- Depende de: public.is_admin() (20260727030000), public.update_updated_at_column() (20260104192057).

CREATE TABLE IF NOT EXISTS public.admin_dynamic_category_config (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    category_name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    fixed_image_url TEXT,
    selection_criteria TEXT NOT NULL DEFAULT 'newest',
    rotation_frequency TEXT NOT NULL DEFAULT 'daily',
    current_dynamic_url TEXT,
    last_rotated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_dynamic_category_config ENABLE ROW LEVEL SECURITY;

-- TRUNCATE não passa por RLS: revogar de roles de aplicação (padrão ORION para tabela nova)
REVOKE TRUNCATE ON public.admin_dynamic_category_config FROM anon, authenticated;

-- Leitura pública: as imagens de categoria aparecem em páginas públicas (Mercado Local)
DROP POLICY IF EXISTS "Anyone can view dynamic category configs" ON public.admin_dynamic_category_config;
CREATE POLICY "Anyone can view dynamic category configs"
ON public.admin_dynamic_category_config
FOR SELECT
USING (true);

-- Escrita restrita a admin via função canônica (JWT OU user_roles OU profiles.is_admin)
DROP POLICY IF EXISTS "Admins can manage dynamic category configs" ON public.admin_dynamic_category_config;
CREATE POLICY "Admins can manage dynamic category configs"
ON public.admin_dynamic_category_config
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS trg_admin_dynamic_category_config_updated_at ON public.admin_dynamic_category_config;
CREATE TRIGGER trg_admin_dynamic_category_config_updated_at
BEFORE UPDATE ON public.admin_dynamic_category_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.update_dynamic_category_images()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_config RECORD;
    v_new_url TEXT;
BEGIN
    -- Gate: chamadas com JWT de usuário exigem admin; contexto sem JWT
    -- (service_role / job interno) passa direto.
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission denied: admin required'
            USING ERRCODE = '42501';
    END IF;

    FOR v_config IN
        SELECT * FROM public.admin_dynamic_category_config
        WHERE is_active = true AND fixed_image_url IS NULL
    LOOP
        v_new_url := NULL;

        -- Try to find an image in merchant_marketing_products for this category
        IF v_config.selection_criteria = 'random' THEN
            SELECT image_url INTO v_new_url
            FROM public.merchant_marketing_products
            WHERE category ILIKE '%' || v_config.category_name || '%'
              AND is_active = true
              AND image_url IS NOT NULL
              AND image_url != ''
            ORDER BY random()
            LIMIT 1;
        ELSE
            -- Default to newest
            SELECT image_url INTO v_new_url
            FROM public.merchant_marketing_products
            WHERE category ILIKE '%' || v_config.category_name || '%'
              AND is_active = true
              AND image_url IS NOT NULL
              AND image_url != ''
            ORDER BY created_at DESC
            LIMIT 1;
        END IF;

        IF v_new_url IS NULL THEN
            SELECT logo_url INTO v_new_url
            FROM public.merchant_stores
            WHERE categoria_id IN (SELECT id FROM public.categorias_loja WHERE nome ILIKE '%' || v_config.category_name || '%')
              AND logo_url IS NOT NULL
              AND logo_url != ''
            ORDER BY created_at DESC
            LIMIT 1;
        END IF;

        -- Update the config if found
        IF v_new_url IS NOT NULL THEN
            UPDATE public.admin_dynamic_category_config
            SET current_dynamic_url = v_new_url,
                last_rotated_at = now()
            WHERE id = v_config.id;
        END IF;
    END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_dynamic_category_images() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_dynamic_category_images() TO authenticated, service_role;
