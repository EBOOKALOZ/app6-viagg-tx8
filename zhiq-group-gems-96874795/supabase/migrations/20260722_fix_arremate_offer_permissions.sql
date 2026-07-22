-- ════════════════════════════════════════════════════════════════════════════
-- FIX: Permissões para envio de Oferta Direta (Arremate) para visitantes / anon
-- Permite que visitantes sem cadastro enviem propostas com Nome + WhatsApp via RPC
-- sem violar políticas de Row-Level Security (RLS).
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Conceder permissão de execução da função RPC para visitantes (anon e authenticated)
GRANT EXECUTE ON FUNCTION public.submit_arremate_offer(uuid, integer, text) TO anon, authenticated;

-- 2. Sobrecarga da função para aceitar 5 parâmetros (com nome e whatsapp do cliente)
CREATE OR REPLACE FUNCTION public.submit_arremate_offer(
  p_listing_id uuid,
  p_amount_cents integer,
  p_message text DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_customer_whatsapp text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_listing record;
  v_offer_id uuid;
  v_user_id uuid := auth.uid();
  v_store_owner uuid;
  v_final_note text;
BEGIN
  -- Buscar listing
  SELECT * INTO v_listing
  FROM public.auction_listings
  WHERE id = p_listing_id;

  IF v_listing IS NULL OR v_listing.listing_type != 'arremate' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Arremate não encontrado');
  END IF;

  IF v_listing.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Arremate não está ativo');
  END IF;

  -- Verificar se não é o dono da loja (via merchant_stores.user_id)
  SELECT user_id INTO v_store_owner
  FROM public.merchant_stores
  WHERE id = v_listing.store_id;

  IF v_store_owner IS NOT NULL AND v_store_owner = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Você não pode enviar oferta no próprio arremate');
  END IF;

  -- Montar nota com os dados de contato do cliente (se fornecidos)
  v_final_note := COALESCE(p_message, '');
  IF p_customer_name IS NOT NULL OR p_customer_whatsapp IS NOT NULL THEN
    IF v_final_note != '' THEN
      v_final_note := v_final_note || ' — ';
    END IF;
    v_final_note := v_final_note || 'Contato: ' || COALESCE(p_customer_name, 'Anônimo') || ' (' || COALESCE(p_customer_whatsapp, 'N/A') || ')';
  END IF;

  -- Inserir oferta em modo SECURITY DEFINER (ignora RLS com segurança e validação)
  INSERT INTO public.arremate_offers (
    arremate_listing_id,
    customer_user_id,
    offer_amount,
    quantity,
    note,
    status
  ) VALUES (
    p_listing_id,
    v_user_id,
    p_amount_cents / 100.0,
    1,
    NULLIF(v_final_note, ''),
    'pending'
  )
  RETURNING id INTO v_offer_id;

  -- Registrar evento
  BEGIN
    INSERT INTO public.auction_events (auction_listing_id, event_type, event_payload)
    VALUES (
      p_listing_id,
      'offer_sent',
      jsonb_build_object(
        'offer_id', v_offer_id,
        'amount_cents', p_amount_cents,
        'user_id', v_user_id,
        'customer_name', p_customer_name,
        'customer_whatsapp', p_customer_whatsapp
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('success', true, 'offer_id', v_offer_id);
END;
$fn$;

-- Conceder permissão na nova sobrecarga para todos os visitantes
GRANT EXECUTE ON FUNCTION public.submit_arremate_offer(uuid, integer, text, text, text) TO anon, authenticated;

-- 3. Política RLS para permitir insert direto como fallback se necessário
DO $rls$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'arremate_offers' AND policyname = 'arremate_offers_insert_anon_policy'
  ) THEN
    CREATE POLICY arremate_offers_insert_anon_policy ON public.arremate_offers
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (true);
  END IF;
END $rls$;
