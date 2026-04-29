-- ═══ ENHANCE ORDER DATA: Add buyer location + fix subtotal ═══

-- 1. Add customer location columns to purchase_intentions
ALTER TABLE public.purchase_intentions
ADD COLUMN IF NOT EXISTS customer_bairro TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS customer_city TEXT DEFAULT '';

-- 2. Ensure purchase_intention_items has product_image_url and unit_price  
ALTER TABLE public.purchase_intention_items
ADD COLUMN IF NOT EXISTS product_image_url TEXT,
ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0;

-- 3. Update subtotals for existing purchase_intentions that have R$ 0,00
-- This recalculates based on items
UPDATE public.purchase_intentions pi
SET subtotal = COALESCE((
    SELECT SUM(COALESCE(pii.unit_price, 0) * COALESCE(pii.quantity, 1))
    FROM public.purchase_intention_items pii
    WHERE pii.intention_id = pi.id
), 0),
total_items = COALESCE((
    SELECT SUM(COALESCE(pii.quantity, 1))
    FROM public.purchase_intention_items pii
    WHERE pii.intention_id = pi.id
), 0)
WHERE pi.subtotal = 0 OR pi.subtotal IS NULL;
