-- ══════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260405_PICKUP_CODE_SYSTEM.sql
--
-- OBJETIVO:
--   Implementar o sistema de código de retirada para confirmar que o
--   motoboy correto está retirando o pedido na loja.
--
-- FLUXO:
--   1. Ao criar um pedido (service_orders), gera-se um código de 4 dígitos
--   2. O merchant vê o código no painel de despacho
--   3. O motoboy digita o código ao chegar na loja
--   4. O sistema valida e avança o status para 'in_progress'
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. Adicionar pickup_code em service_orders ────────────────────────
ALTER TABLE public.service_orders 
  ADD COLUMN IF NOT EXISTS pickup_code text;

-- Backfill: gerar código para pedidos existentes sem código
UPDATE public.service_orders
SET pickup_code = LPAD((FLOOR(RANDOM() * 9000) + 1000)::text, 4, '0')
WHERE pickup_code IS NULL;

-- ── 2. Trigger para auto-gerar código ao INSERT ───────────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_generate_pickup_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pickup_code IS NULL OR TRIM(NEW.pickup_code) = '' THEN
    NEW.pickup_code := LPAD((FLOOR(RANDOM() * 9000) + 1000)::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_pickup_code ON public.service_orders;
CREATE TRIGGER trigger_auto_pickup_code
  BEFORE INSERT ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_generate_pickup_code();

-- ── 3. RPC: validate_pickup_code ──────────────────────────────────────
-- Valida o código digitado pelo motoboy e, se correto, avança o pedido
-- de 'accepted' para 'in_progress' (retirada confirmada).
CREATE OR REPLACE FUNCTION public.validate_pickup_code(
  p_order_id uuid,
  p_code     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order RECORD;
BEGIN
  -- Buscar o pedido
  SELECT id, status, pickup_code, courier_id
  INTO v_order
  FROM public.service_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Pedido não encontrado.');
  END IF;

  -- Garantir que é o motoboy correto ou que não há restrição
  IF v_order.courier_id IS NOT NULL AND v_order.courier_id != auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Você não é o motoboy desta entrega.');
  END IF;

  -- Verificar status válido para validar retirada
  IF v_order.status NOT IN ('accepted', 'searching', 'awaiting_professional') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'Pedido não está aguardando retirada (status: ' || v_order.status || ').'
    );
  END IF;

  -- Validar o código (case-insensitive, trim, aceita letras e números)
  IF UPPER(TRIM(v_order.pickup_code)) != UPPER(TRIM(p_code)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Código inválido. Verifique com o lojista.');
  END IF;

  -- ✅ Código correto → avançar para in_progress
  UPDATE public.service_orders
  SET
    status     = 'in_progress',
    updated_at = now()
  WHERE id = p_order_id;

  -- Atualizar courier_id se não estava preenchido
  UPDATE public.service_orders
  SET courier_id = auth.uid()
  WHERE id = p_order_id AND courier_id IS NULL;

  RETURN jsonb_build_object('ok', true, 'message', 'Retirada confirmada!');
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_pickup_code(uuid, text) TO authenticated;

-- ── 4. RPC helper: get_order_pickup_code (apenas merchant) ───────────
-- Permite o merchant buscar o código do pedido ativo
CREATE OR REPLACE FUNCTION public.get_order_pickup_code(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT id, pickup_code, merchant_id, status
  INTO v_order
  FROM public.service_orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Pedido não encontrado.');
  END IF;

  -- Apenas o merchant dono do pedido pode ver o código
  IF v_order.merchant_id != auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Acesso não autorizado.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'pickup_code', v_order.pickup_code,
    'status', v_order.status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_pickup_code(uuid) TO authenticated;

-- ── 5. Verificação ────────────────────────────────────────────────────
SELECT 
  id,
  status,
  pickup_code,
  created_at
FROM public.service_orders
WHERE created_at > now() - interval '24 hours'
ORDER BY created_at DESC
LIMIT 10;
