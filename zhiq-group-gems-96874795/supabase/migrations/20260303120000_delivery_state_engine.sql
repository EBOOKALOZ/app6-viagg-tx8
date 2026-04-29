-- Migration: 20260303120000_delivery_state_engine.sql
-- Description: Implementação de RPCs para máquina de estados das entregas e regras operacionais.

-- 1. accept_delivery_order
-- Transita o pedido de 'pending' (ou 'open' em delivery_offers) para 'accepted',
-- vincula o motoboy, e remove a oferta aberta para evitar duplicidade.
CREATE OR REPLACE FUNCTION accept_delivery_order(p_order_id UUID, p_motoboy_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Roda ignorando RLS inicial para poder checkar e dar lock
AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  -- 1. Bloqueio para evitar aceitar 2 corridas simultâneas
  IF EXISTS (
    SELECT 1 FROM delivery_orders 
    WHERE motoboy_id = p_motoboy_id 
    AND status IN ('accepted', 'in_progress', 'picked_up')
  ) THEN
    RAISE EXCEPTION 'Você já possui uma entrega em andamento. Finalize a entrega atual.';
  END IF;

  -- 2. Lock no pedido para verificação atômica
  SELECT status INTO v_current_status
  FROM delivery_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  -- Dependendo da modelagem a ordem nasce como 'pending', verifique o enum. Assume-se 'pending' ou 'awaiting_professional'.
  IF v_current_status NOT IN ('pending', 'awaiting_professional', 'open') THEN
    RAISE EXCEPTION 'Este pedido não está mais disponível para aceite.';
  END IF;

  -- 3. Update atômico do status da Ordem
  UPDATE delivery_orders
  SET 
    status = 'accepted',
    motoboy_id = p_motoboy_id,
    accepted_at = NOW()
  WHERE id = p_order_id;

  -- 4. Invalida as ofertas abertas (mesada de broadcast)
  UPDATE delivery_offers
  SET status = 'accepted'
  WHERE order_id = p_order_id 
  AND status = 'open';

END;
$$;


-- 2. start_delivery_order
-- Transita o pedido para 'in_progress' ou 'picked_up' quando o motoboy avisa que retirou.
CREATE OR REPLACE FUNCTION start_delivery_order(p_order_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  -- Lock
  SELECT status INTO v_current_status
  FROM delivery_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  IF v_current_status != 'accepted' THEN
    RAISE EXCEPTION 'Apenas pedidos aceitos podem ser iniciados (Status atual: %).', v_current_status;
  END IF;

  -- Update
  UPDATE delivery_orders
  SET 
    status = 'in_progress', -- ou 'picked_up'
    pickup_time = NOW() -- caso exista esta coluna
  WHERE id = p_order_id;

END;
$$;


-- 3. complete_delivery_order
-- Transita o pedido de 'in_progress' para 'delivered'. Dispara a "trava de updates".
CREATE OR REPLACE FUNCTION complete_delivery_order(p_order_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status TEXT;
  v_motoboy_id UUID;
  v_store_id UUID;
  v_price NUMERIC;
BEGIN
  -- Lock
  SELECT status, motoboy_id, merchant_id, price 
  INTO v_current_status, v_motoboy_id, v_store_id, v_price
  FROM delivery_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  IF v_current_status NOT IN ('in_progress', 'picked_up') THEN
    RAISE EXCEPTION 'Apenas pedidos em andamento podem ser finalizados (Status atual: %).', v_current_status;
  END IF;

  -- Update da Ordem para 'delivered' (imutável)
  UPDATE delivery_orders
  SET 
    status = 'delivered',
    completed_at = NOW()
  WHERE id = p_order_id;

  -- Aqui o banco poderia opcionalmente invocar o financeiro, ex:
  -- INSERT INTO financial_transactions (user_id, amount, type) VALUES (v_motoboy_id, v_price, 'credit');
  -- Porém, se houver Triggers na tabela delivery_orders ON UPDATE status = 'delivered', eles rodarão automaticamente sob o capô.

END;
$$;
