-- Seed multiple properties for UI verification
DO $$
DECLARE
    v_user_id UUID;
    v_listing_id UUID;
BEGIN
    -- Get the first available user (or yours if possible)
    SELECT id INTO v_user_id FROM auth.users LIMIT 1;
    
    IF v_user_id IS NULL THEN
        RAISE NOTICE 'No users found in auth.users. Please log in first.';
        RETURN;
    END IF;

    -- Property 1: Chácara
    v_listing_id := gen_random_uuid();
    INSERT INTO public.real_estate_listings (
        id, owner_user_id, title, description, property_type, operation_type,
        price_brl, total_area_m2, public_location, status
    ) VALUES (
        v_listing_id, v_user_id, 'Linda Chácara com Pomar e Riacho', 
        'Excelente oportunidade de lazer e sossego. Localizada a apenas 20min do centro.',
        'chacara', 'sale', 450000.00, 2500, 'Testo Salto, Blumenau - SC', 'published'
    );
    
    INSERT INTO public.real_estate_media (
        listing_id, owner_user_id, original_storage_path, thumb_masked_storage_path, moderation_status, sort_order
    ) VALUES (
        v_listing_id, v_user_id, 'seed/chacara_orig.jpg', 'seed/chacara_thumb.jpg', 'approved', 1
    );

    -- Property 2: Terreno
    v_listing_id := gen_random_uuid();
    INSERT INTO public.real_estate_listings (
        id, owner_user_id, title, description, property_type, operation_type,
        price_brl, total_area_m2, public_location, status
    ) VALUES (
        v_listing_id, v_user_id, 'Lote Urbano - Loteamento Novo Horizonte', 
        'Lote pronto para construir, cercado e com toda infraestrutura.',
        'lote', 'sale', 185000.00, 360, 'Itoupava Central, Blumenau - SC', 'published'
    );

    -- Property 3: Fazenda
    v_listing_id := gen_random_uuid();
    INSERT INTO public.real_estate_listings (
        id, owner_user_id, title, description, property_type, operation_type,
        price_brl, total_area_m2, public_location, status
    ) VALUES (
        v_listing_id, v_user_id, 'Fazenda Vale do Ouro - 50 Hectares', 
        'Área produtiva com pastagem e reserva legal preservada.',
        'fazenda', 'sale', 3200000.00, 500000, 'Vila Itoupava, Blumenau - SC', 'published'
    );
END $$;
