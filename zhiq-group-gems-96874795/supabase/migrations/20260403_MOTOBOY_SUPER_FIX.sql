-- ═════════════════════════════════════════════════════════════
-- MIGRATION: 20260403_MOTOBOY_SUPER_FIX.sql
-- DESC: Fix para "Erro de Conexão" ao aceitar entrega/corrida
-- e conflitos de coluna motoboy_id / professional_uid
-- ═════════════════════════════════════════════════════════════

-- 1. DROP FUNCTIONS ANTIGAS PARA EVITAR CONFLITO DE ASSINATURA
DROP FUNCTION IF EXISTS public.accept_delivery_offer(uuid);
DROP FUNCTION IF EXISTS public.accept_ride(uuid);
DROP FUNCTION IF EXISTS public.reject_delivery_offer(uuid);
DROP FUNCTION IF EXISTS public.ensure_motoboy_profile(uuid);
DROP FUNCTION IF EXISTS public.update_motoboy_presence(double precision, double precision);

-- 2. GARANTIR PERFIL MOTOBOY (FIX PERMISSÕES)
CREATE OR REPLACE FUNCTION public.ensure_motoboy_profile(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.motoboy_profiles (user_id, is_approved, is_online)
    VALUES (p_user_id, true, true)
    ON CONFLICT (user_id) DO UPDATE SET is_approved = true, is_online = true;
    RETURN jsonb_build_object('ok', true, 'user_id', p_user_id);
END; $$;

-- 3. ATUALIZAR PRESENÇA (FIX ERRO 400 SE LAT/LNG NULL)
CREATE OR REPLACE FUNCTION public.update_motoboy_presence(p_lat double precision, p_lng double precision)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
    PERFORM public.ensure_motoboy_profile(v_user_id);
    INSERT INTO public.motoboy_presence (motoboy_id, lat, lng, last_seen)
    VALUES (v_user_id, COALESCE(p_lat, 0), COALESCE(p_lng, 0), now())
    ON CONFLICT (motoboy_id) DO UPDATE SET 
        lat = COALESCE(p_lat, motoboy_presence.lat), 
        lng = COALESCE(p_lng, motoboy_presence.lng),
        last_seen = now();
    RETURN jsonb_build_object('ok', true);
END; $$;

-- 4. ACEITAR ENTREGA (ATOMIC ACCEPT)
CREATE OR REPLACE FUNCTION public.accept_delivery_offer(p_offer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_offer RECORD;
BEGIN
    -- 1. Buscar a oferta e travar linha
    SELECT * INTO v_offer FROM public.delivery_offers WHERE id = p_offer_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'Oferta não encontrada.');
    END IF;

    IF v_offer.status != 'pending' AND v_offer.status != 'open' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'Esta oferta já foi assumida ou expirou.');
    END IF;

    -- 2. Marcar como aceita
    UPDATE public.delivery_offers 
    SET status = 'accepted', 
        motoboy_id = v_user_id, 
        professional_uid = v_user_id, -- Sincroniza ambas colunas
        updated_at = now() 
    WHERE id = p_offer_id;

    -- 3. Atualizar o pedido principal (service_orders)
    UPDATE public.service_orders
    SET status = 'accepted',
        professional_id = v_user_id,
        accepted_at = now(),
        updated_at = now()
    WHERE id = v_offer.delivery_order_id;

    -- 4. Cancelar outras ofertas pendentes para este mesmo pedido
    UPDATE public.delivery_offers
    SET status = 'cancelled', updated_at = now()
    WHERE delivery_order_id = v_offer.delivery_order_id 
      AND id != p_offer_id 
      AND status = 'pending';

    RETURN jsonb_build_object('ok', true, 'order_id', v_offer.delivery_order_id);
END; $$;

-- 5. REJEITAR ENTREGA
CREATE OR REPLACE FUNCTION public.reject_delivery_offer(p_offer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.delivery_offers 
    SET status = 'rejected', updated_at = now() 
    WHERE id = p_offer_id AND motoboy_id = auth.uid();
    RETURN jsonb_build_object('ok', true);
END; $$;

-- 6. ACEITAR CORRIDA (MOTO-TAXI / CARRO)
CREATE OR REPLACE FUNCTION public.accept_ride(p_ride_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_ride_table text;
    v_found boolean := false;
BEGIN
    -- Tenta na tabela de Moto-Taxi
    UPDATE public.moto_taxi_corridas
    SET status = 'aceito', moto_taxi_id = v_user_id, updated_at = now()
    WHERE id = p_ride_id AND (status = 'pesquisando' OR status = 'pendente')
    RETURNING true INTO v_found;

    IF NOT v_found THEN
        -- Tenta na tabela de Carro
        UPDATE public.motorista_corridas
        SET status = 'aceito', motorista_id = v_user_id, updated_at = now()
        WHERE id = p_ride_id AND (status = 'pendente' OR status = 'reserva')
        RETURNING true INTO v_found;
    END IF;

    IF v_found THEN
        RETURN jsonb_build_object('ok', true);
    ELSE
        RETURN jsonb_build_object('ok', false, 'reason', 'Corrida não disponível ou já aceita.');
    END IF;
END; $$;

-- 7. GARANTIR RLS (PERMISSÕES)
ALTER TABLE public.delivery_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Motoboys can see their own offers" ON public.delivery_offers;
CREATE POLICY "Motoboys can see their own offers" ON public.delivery_offers
    FOR SELECT USING (auth.uid() = motoboy_id OR auth.uid() = professional_uid);

DROP POLICY IF EXISTS "Motoboys can update their own offers" ON public.delivery_offers;
CREATE POLICY "Motoboys can update their own offers" ON public.delivery_offers
    FOR UPDATE USING (auth.uid() = motoboy_id OR auth.uid() = professional_uid);

-- 8. GARANTIR REALTIME NO BANCO
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'delivery_offers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_offers;
  END IF;
END $$;
