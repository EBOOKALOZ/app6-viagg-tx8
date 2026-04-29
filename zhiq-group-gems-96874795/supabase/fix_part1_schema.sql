-- ═══ PARTE 1/3: SCHEMA FIXES ═══
-- Cole e rode esta parte primeiro

ALTER TABLE public.store_cart_items ADD COLUMN IF NOT EXISTS product_title TEXT;
ALTER TABLE public.store_cart_items ADD COLUMN IF NOT EXISTS product_image_url TEXT;
ALTER TABLE public.store_cart_items ADD COLUMN IF NOT EXISTS product_price NUMERIC;
ALTER TABLE public.store_cart_items ADD COLUMN IF NOT EXISTS customer_note TEXT;

ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS cart_id UUID;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS store_id UUID;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS customer_whatsapp TEXT;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS customer_note TEXT;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS total_items INTEGER DEFAULT 0;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS checkout_mode TEXT DEFAULT 'in_store';
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'not_applicable';
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS credits_charged INTEGER DEFAULT 0;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS visitor_id UUID;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS platform_fee_percent NUMERIC DEFAULT 3;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS platform_fee_amount NUMERIC DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.purchase_intention_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    intention_id UUID NOT NULL,
    product_id UUID,
    product_title TEXT,
    product_image_url TEXT,
    unit_price NUMERIC DEFAULT 0,
    quantity INTEGER DEFAULT 1,
    subtotal NUMERIC DEFAULT 0,
    customer_note TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

DROP POLICY IF EXISTS "store_carts_select_by_session" ON public.store_carts;
CREATE POLICY "store_carts_select_by_session" ON public.store_carts FOR SELECT USING (true);
DROP POLICY IF EXISTS "store_carts_select_own" ON public.store_carts;
