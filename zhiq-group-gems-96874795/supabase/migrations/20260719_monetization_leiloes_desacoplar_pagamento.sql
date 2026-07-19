-- ════════════════════════════════════════════════════════════════════════════
-- ORION-MONETIZATION LEILÕES v1.0 — Desacoplamento do pagamento do produto
--
-- DECISÃO OFICIAL PERMANENTE: a plataforma NÃO intermedia o pagamento do produto.
-- O pagamento é DIRETO entre comprador e vendedor (PIX/dinheiro/transferência/
-- cartão/etc.). A receita da plataforma vem EXCLUSIVAMENTE dos Pacotes de
-- Divulgação (créditos do vendedor, via orion_auction_charge). Os 6% são
-- precificação de pacote, NÃO comissão sobre a venda.
--
-- Esta migration ADEQUA o Sistema de Arremates ao modelo — SOMENTE remove a
-- intermediação financeira do PRODUTO. A máquina de estados de pagamento DIRETO
-- (aguardando_contato → contato_liberado → pagamento_informado_comprador →
-- pagamento_confirmado_vendedor → preparando_entrega → entregue → recebido →
-- concluido) é mantida como está (fluxo oficial do ciclo, sem dinheiro no PAY).
--
-- Ações (idempotentes):
--  (1) REMOVE arremate_pay_wallet (FASE B1) — única função que movia dinheiro do
--      PRODUTO (customer_wallet → platform_escrow). Não ligada a nenhuma tela.
--  (2) REVERTE 'auction' do CHECK de pay_escrow_holds — PAY volta a ficar
--      dedicado só ao realmente intermediado (corridas/entregas/fretes/créditos).
--  (3) REMOVE resíduos de um desenho intermediado anterior que não pertencem ao
--      modelo direto: arremate_confirm_payment e a aresta aguardando_pagamento→pago
--      (estados 'aguardando_pagamento'/'pago' não existem no fluxo direto vigente).
--
-- PRESERVA: FASE A (estados/eventos/integridade) na forma do fluxo DIRETO atual,
-- orion_auction_charge (créditos do vendedor = pacote = receita), settlement
-- (registro), Pacotes de Divulgação, RLS, HOTFIX A.0. Reversível.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── (1) Remover a intermediação financeira do produto (B1) ─────────────────
DROP FUNCTION IF EXISTS public.arremate_pay_wallet(uuid);

-- ─── (3) Remover resíduos do desenho intermediado (não pertencem ao modelo direto)
DROP FUNCTION IF EXISTS public.arremate_confirm_payment(uuid, text);
DELETE FROM public.orion_arremate_transitions
 WHERE estado_de = 'aguardando_pagamento' AND estado_para = 'pago';

-- ─── (2) PAY dedicado só ao intermediado: retirar 'auction' do escrow ───────
DO $esc$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pay_escrow_holds WHERE service_type = 'auction') THEN
    ALTER TABLE public.pay_escrow_holds DROP CONSTRAINT IF EXISTS pay_escrow_holds_service_type_check;
    ALTER TABLE public.pay_escrow_holds ADD CONSTRAINT pay_escrow_holds_service_type_check
      CHECK (service_type = ANY (ARRAY['delivery','ride','mototaxi','freight','credit_purchase']));
  END IF;
END $esc$;

-- ─── VERIFICAÇÃO (invariantes do modelo) ────────────────────────────────────
SELECT
  -- nenhuma função de leilão/arremate move dinheiro do PRODUTO
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.proname LIKE '%auction%' OR p.proname LIKE '%arremate%')
      AND (pg_get_functiondef(p.oid) ILIKE '%customer_wallet%'
        OR pg_get_functiondef(p.oid) ILIKE '%platform_escrow%'
        OR pg_get_functiondef(p.oid) ILIKE '%pay_post_transaction%')) AS fns_movem_dinheiro_produto_deve_0,
  -- arremate_pay_wallet removida
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='arremate_pay_wallet') AS pay_wallet_deve_0,
  -- 0 ordens PAY e 0 holds de produto de leilão
  (SELECT count(*)::int FROM pay_payment_orders WHERE product_type ILIKE '%auction%' OR product_type='auction_settlement') AS ordens_leilao_deve_0,
  (SELECT count(*)::int FROM pay_escrow_holds WHERE service_type='auction') AS holds_leilao_deve_0,
  -- receita = créditos do vendedor: orion_auction_charge presente
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='orion_auction_charge') AS charge_creditos_deve_1,
  -- escrow sem auction
  (pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname='pay_escrow_holds_service_type_check')) NOT ILIKE '%auction%')::int AS escrow_sem_auction_deve_1;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (só se reverter a decisão de monetização — recriar a intermediação):
--   -- recriar arremate_pay_wallet a partir de 20260719_arremate_fase_b1_pay_wallet.sql
--   -- re-adicionar 'auction' ao CHECK de pay_escrow_holds
--   -- (arremate_confirm_payment e a aresta aguardando_pagamento→pago eram de um
--   --  desenho intermediado descartado — NÃO recriar)
-- ════════════════════════════════════════════════════════════════════════════
