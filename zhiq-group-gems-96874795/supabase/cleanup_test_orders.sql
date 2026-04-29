-- ═══ LIMPAR PEDIDOS DE TESTE ═══

-- 1. Remover itens dos pedidos de teste
DELETE FROM public.purchase_intention_items
WHERE intention_id IN (
    SELECT id FROM public.purchase_intentions
    WHERE customer_name = 'Teste Final'
);

-- 2. Remover os pedidos de teste
DELETE FROM public.purchase_intentions
WHERE customer_name = 'Teste Final';
