-- Corrigir badge do Mensal Start
UPDATE public.merchant_credit_products SET badge_text = 'EVOLUÇÃO' WHERE slug = 'mensal-start';

-- Remover Semestral Pro+ e Anual Max (desativar)
UPDATE public.merchant_credit_products SET is_active = false WHERE slug IN ('semestral-pro', 'anual-max');

-- Verificar resultado
SELECT name, badge_text, is_active, sort_order FROM public.merchant_credit_products WHERE is_active = true ORDER BY sort_order;
