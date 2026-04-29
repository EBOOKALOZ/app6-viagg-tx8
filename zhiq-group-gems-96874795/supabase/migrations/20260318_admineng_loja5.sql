-- ═══════════════════════════════════════════════════════════
-- LOJA 5 — Premium Administrative Intelligence Layer
-- Migration: 20260318_admineng_loja5
-- Purpose: Read-only analytic views + RPC functions for
--          the Admineng panel. ZERO changes to operational tables.
-- ═══════════════════════════════════════════════════════════

-- ═══════════════════════════════════════
-- 1. SCHEMA
-- ═══════════════════════════════════════
CREATE SCHEMA IF NOT EXISTS admineng;

-- ═══════════════════════════════════════
-- 2. VIEW — admineng.store_360
-- ═══════════════════════════════════════
CREATE OR REPLACE VIEW admineng.store_360 AS
WITH product_stats AS (
    SELECT
        merchant_store_id AS store_id,
        COUNT(*)::int AS product_count,
        COUNT(*) FILTER (WHERE is_active = true)::int AS active_product_count
    FROM public.merchant_marketing_products
    GROUP BY merchant_store_id
),
intention_stats AS (
    SELECT
        store_id,
        COUNT(*)::int AS intention_count,
        COUNT(*) FILTER (WHERE status = 'accepted')::int AS order_count,
        COALESCE(SUM(subtotal), 0)::numeric AS intention_total,
        COALESCE(SUM(subtotal) FILTER (WHERE status = 'accepted'), 0)::numeric AS order_total,
        MAX(created_at) AS last_intention_at
    FROM public.purchase_intentions
    GROUP BY store_id
),
credit_stats AS (
    SELECT
        store_id,
        COALESCE(balance, 0)::int AS credit_balance,
        COALESCE(total_earned, 0)::int AS credits_earned,
        COALESCE(total_spent, 0)::int AS credits_spent
    FROM public.merchant_credit_balances
),
m1_stats AS (
    SELECT
        merchant_store_id AS store_id,
        COUNT(*)::int AS m1_event_count,
        COALESCE(SUM(charged_value), 0)::numeric AS m1_total_charged
    FROM public.m1_billing_events
    GROUP BY merchant_store_id
),
auction_stats AS (
    SELECT
        store_id,
        COUNT(*)::int AS auction_count,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_auction_count
    FROM public.auction_listings
    GROUP BY store_id
),
arremate_stats AS (
    SELECT
        store_id,
        COUNT(*)::int AS arremate_count,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_arremate_count
    FROM public.arremate_listings
    GROUP BY store_id
),
delivery_stats AS (
    SELECT
        merchant_id AS store_id,
        COUNT(*)::int AS delivery_count
    FROM public.delivery_requests
    GROUP BY merchant_id
),
profile_counts AS (
    SELECT
        user_id,
        COUNT(*)::int AS profile_count,
        array_agg(DISTINCT profile_type) AS profile_types
    FROM public.user_profiles
    WHERE user_id IS NOT NULL
    GROUP BY user_id
)
SELECT
    s.id AS store_id,
    s.store_name,
    s.user_id,
    s.status,
    s.created_at,
    s.city,
    s.region AS state,
    s.bairro,
    s.email AS store_email,
    s.phone AS store_phone,
    s.whatsapp,
    s.logo_url,
    s.categoria AS category,
    s.cnpj,

    -- Owner info from profiles
    p.name AS owner_name,
    COALESCE(s.email, p.email) AS owner_email,
    COALESCE(s.phone, p.telefone) AS owner_phone,

    -- Products
    COALESCE(ps.product_count, 0) AS product_count,
    COALESCE(ps.active_product_count, 0) AS active_product_count,

    -- Intentions / Orders
    COALESCE(ist.intention_count, 0) AS intention_count,
    COALESCE(ist.order_count, 0) AS order_count,
    COALESCE(ist.intention_total, 0) AS intention_total,
    COALESCE(ist.order_total, 0) AS order_total,
    ist.last_intention_at,

    -- Credits
    COALESCE(cs.credit_balance, 0) AS credit_balance,
    COALESCE(cs.credits_earned, 0) AS credits_earned,
    COALESCE(cs.credits_spent, 0) AS credits_spent,

    -- M1
    COALESCE(m1.m1_event_count, 0) AS m1_event_count,
    COALESCE(m1.m1_total_charged, 0) AS m1_total_charged,

    -- Auctions
    COALESCE(au.auction_count, 0) AS auction_count,
    COALESCE(au.active_auction_count, 0) AS active_auction_count,

    -- Arremate
    COALESCE(ar.arremate_count, 0) AS arremate_count,
    COALESCE(ar.active_arremate_count, 0) AS active_arremate_count,

    -- Deliveries
    COALESCE(ds.delivery_count, 0) AS delivery_count,

    -- Profile info
    COALESCE(pc.profile_count, 0) AS profile_count,
    COALESCE(pc.profile_types, ARRAY[]::text[]) AS profile_types,

    -- ═══ COMPUTED SIGNALS ═══

    -- Activity badge
    CASE
        WHEN ist.last_intention_at >= NOW() - INTERVAL '3 days' THEN 'quente'
        WHEN ist.last_intention_at >= NOW() - INTERVAL '7 days' THEN 'ativa'
        WHEN ist.last_intention_at >= NOW() - INTERVAL '21 days' THEN 'morna'
        WHEN ist.last_intention_at >= NOW() - INTERVAL '60 days' THEN 'fria'
        WHEN ist.last_intention_at IS NOT NULL THEN 'sem_movimento'
        ELSE 'sem_movimento'
    END AS activity_badge,

    -- Days since last activity
    CASE
        WHEN ist.last_intention_at IS NOT NULL THEN EXTRACT(DAY FROM NOW() - ist.last_intention_at)::int
        ELSE NULL
    END AS days_since_last_activity,

    -- Upgrade signal: active products + low credit balance + has traffic
    (COALESCE(ps.active_product_count, 0) >= 1
     AND COALESCE(cs.credit_balance, 0) <= 5
     AND COALESCE(ist.intention_count, 0) >= 2) AS upgrade_signal,

    -- Churn signal: was active (has intentions) but fria/sem_movimento
    (COALESCE(ist.intention_count, 0) >= 1
     AND COALESCE(ps.product_count, 0) >= 1
     AND (ist.last_intention_at IS NULL OR ist.last_intention_at < NOW() - INTERVAL '30 days'))
    AS churn_signal,

    -- Subscription ready: consistent revenue, multi-product, active
    (COALESCE(ps.active_product_count, 0) >= 3
     AND COALESCE(ist.order_count, 0) >= 3
     AND ist.last_intention_at >= NOW() - INTERVAL '14 days') AS subscription_ready,

    -- Traffic but no conversion
    (COALESCE(ist.intention_count, 0) >= 3
     AND COALESCE(ist.order_count, 0) = 0) AS traffic_no_conversion,

    -- New, no activation
    (s.created_at < NOW() - INTERVAL '7 days'
     AND COALESCE(ps.product_count, 0) = 0) AS new_no_activation,

    -- Multi-profile strategic
    (COALESCE(pc.profile_count, 0) > 1) AS multi_profile_strategic,

    -- Estimated revenue
    (COALESCE(m1.m1_total_charged, 0) + COALESCE(cs.credits_spent, 0) + COALESCE(ist.order_total, 0) * 0.03)::numeric AS estimated_revenue

FROM public.merchant_stores s
LEFT JOIN public.profiles p ON p.id = s.user_id
LEFT JOIN product_stats ps ON ps.store_id = s.id
LEFT JOIN intention_stats ist ON ist.store_id = s.id
LEFT JOIN credit_stats cs ON cs.store_id = s.id
LEFT JOIN m1_stats m1 ON m1.store_id = s.id
LEFT JOIN auction_stats au ON au.store_id = s.id
LEFT JOIN arremate_stats ar ON ar.store_id = s.id
LEFT JOIN delivery_stats ds ON ds.store_id = s.id
LEFT JOIN profile_counts pc ON pc.user_id = s.user_id;

-- ═══════════════════════════════════════
-- 3. VIEW — admineng.account_360
-- ═══════════════════════════════════════
CREATE OR REPLACE VIEW admineng.account_360 AS
WITH user_stores AS (
    SELECT
        user_id,
        COUNT(*)::int AS store_count,
        array_agg(id) AS store_ids,
        array_agg(store_name) AS store_names
    FROM public.merchant_stores
    WHERE user_id IS NOT NULL
    GROUP BY user_id
),
user_profile_types AS (
    SELECT
        user_id,
        COUNT(*)::int AS profile_count,
        array_agg(DISTINCT profile_type) AS profile_types
    FROM public.user_profiles
    WHERE user_id IS NOT NULL
    GROUP BY user_id
)
SELECT
    p.id AS user_id,
    p.name AS user_name,
    p.email,
    p.telefone AS phone,
    p.created_at,

    COALESCE(us.store_count, 0) AS store_count,
    COALESCE(us.store_ids, ARRAY[]::uuid[]) AS store_ids,
    COALESCE(us.store_names, ARRAY[]::text[]) AS store_names,

    COALESCE(upt.profile_count, 0) AS profile_count,
    COALESCE(upt.profile_types, ARRAY[]::text[]) AS profile_types,

    -- Multi-profile flag
    (COALESCE(upt.profile_count, 0) > 1) AS is_multi_profile

FROM public.profiles p
LEFT JOIN user_stores us ON us.user_id = p.id
LEFT JOIN user_profile_types upt ON upt.user_id = p.id
WHERE us.store_count > 0 OR upt.profile_count > 0;

-- ═══════════════════════════════════════
-- 4. FUNCTION — list_stores_360
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION public.list_stores_360(
    p_search TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_activity TEXT DEFAULT NULL,
    p_upgrade BOOLEAN DEFAULT NULL,
    p_churn BOOLEAN DEFAULT NULL,
    p_multi_profile BOOLEAN DEFAULT NULL,
    p_has_auction BOOLEAN DEFAULT NULL,
    p_has_arremate BOOLEAN DEFAULT NULL,
    p_limit INT DEFAULT 500,
    p_offset INT DEFAULT 0
) RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC)
    INTO v_result
    FROM (
        SELECT *
        FROM admineng.store_360 sv
        WHERE
            -- Text search
            (p_search IS NULL OR p_search = '' OR
             sv.store_name ILIKE '%' || p_search || '%' OR
             sv.owner_name ILIKE '%' || p_search || '%' OR
             sv.owner_email ILIKE '%' || p_search || '%' OR
             sv.store_id::text ILIKE '%' || p_search || '%')
            -- City filter
            AND (p_city IS NULL OR p_city = '' OR sv.city = p_city)
            -- Status filter
            AND (p_status IS NULL OR p_status = '' OR sv.status = p_status)
            -- Activity filter
            AND (p_activity IS NULL OR p_activity = '' OR sv.activity_badge = p_activity)
            -- Upgrade signal
            AND (p_upgrade IS NULL OR sv.upgrade_signal = p_upgrade)
            -- Churn signal
            AND (p_churn IS NULL OR sv.churn_signal = p_churn)
            -- Multi-profile
            AND (p_multi_profile IS NULL OR sv.multi_profile_strategic = p_multi_profile)
            -- Has auction
            AND (p_has_auction IS NULL OR (p_has_auction = true AND sv.active_auction_count > 0) OR (p_has_auction = false))
            -- Has arremate
            AND (p_has_arremate IS NULL OR (p_has_arremate = true AND sv.active_arremate_count > 0) OR (p_has_arremate = false))
        ORDER BY sv.created_at DESC
        LIMIT p_limit
        OFFSET p_offset
    ) t;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ═══════════════════════════════════════
-- 5. FUNCTION — get_store_360_json
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_store_360_json(p_store_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_store JSONB;
    v_products JSONB;
    v_intentions JSONB;
    v_credits JSONB;
    v_auctions JSONB;
    v_arremates JSONB;
    v_account JSONB;
BEGIN
    -- Store overview from view
    SELECT row_to_json(sv)::jsonb INTO v_store
    FROM admineng.store_360 sv
    WHERE sv.store_id = p_store_id;

    IF v_store IS NULL THEN
        RETURN jsonb_build_object('error', 'Store not found');
    END IF;

    -- Products (top 50)
    SELECT COALESCE(jsonb_agg(row_to_json(p)::jsonb ORDER BY p.created_at DESC), '[]'::jsonb)
    INTO v_products
    FROM (
        SELECT id, title, price_label, category, condition, is_active, image_url, created_at
        FROM public.merchant_marketing_products
        WHERE merchant_store_id = p_store_id
        ORDER BY created_at DESC
        LIMIT 50
    ) p;

    -- Recent intentions (top 30)
    SELECT COALESCE(jsonb_agg(row_to_json(i)::jsonb ORDER BY i.created_at DESC), '[]'::jsonb)
    INTO v_intentions
    FROM (
        SELECT id, customer_name, customer_whatsapp, subtotal, total_items,
               status, checkout_mode, payment_status, credits_charged,
               platform_fee_amount, created_at
        FROM public.purchase_intentions
        WHERE store_id = p_store_id
        ORDER BY created_at DESC
        LIMIT 30
    ) i;

    -- Credit ledger (top 20)
    SELECT COALESCE(jsonb_agg(row_to_json(c)::jsonb ORDER BY c.created_at DESC), '[]'::jsonb)
    INTO v_credits
    FROM (
        SELECT id, credits, balance_after, reason, rule_applied, created_at
        FROM public.merchant_credit_ledger
        WHERE store_id = p_store_id
        ORDER BY created_at DESC
        LIMIT 20
    ) c;

    -- Auctions (top 20)
    SELECT COALESCE(jsonb_agg(row_to_json(a)::jsonb ORDER BY a.created_at DESC), '[]'::jsonb)
    INTO v_auctions
    FROM (
        SELECT id, title, starting_price, current_bid, status, ends_at, created_at
        FROM public.auction_listings
        WHERE store_id = p_store_id
        ORDER BY created_at DESC
        LIMIT 20
    ) a;

    -- Arremates (top 20)
    SELECT COALESCE(jsonb_agg(row_to_json(ar)::jsonb ORDER BY ar.created_at DESC), '[]'::jsonb)
    INTO v_arremates
    FROM (
        SELECT id, title, asking_price, status, created_at
        FROM public.arremate_listings
        WHERE store_id = p_store_id
        ORDER BY created_at DESC
        LIMIT 20
    ) ar;

    -- Account info
    SELECT row_to_json(a360)::jsonb INTO v_account
    FROM admineng.account_360 a360
    WHERE a360.user_id = (v_store->>'user_id')::uuid;

    RETURN jsonb_build_object(
        'store', v_store,
        'products', v_products,
        'intentions', v_intentions,
        'credits', v_credits,
        'auctions', v_auctions,
        'arremates', v_arremates,
        'account', COALESCE(v_account, '{}'::jsonb)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ═══════════════════════════════════════
-- 6. FUNCTION — get_account_360_json
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_account_360_json(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_account JSONB;
    v_stores JSONB;
BEGIN
    -- Account overview
    SELECT row_to_json(a360)::jsonb INTO v_account
    FROM admineng.account_360 a360
    WHERE a360.user_id = p_user_id;

    IF v_account IS NULL THEN
        RETURN jsonb_build_object('error', 'Account not found');
    END IF;

    -- All stores for this account with store_360 data
    SELECT COALESCE(jsonb_agg(row_to_json(sv)::jsonb ORDER BY sv.created_at DESC), '[]'::jsonb)
    INTO v_stores
    FROM admineng.store_360 sv
    WHERE sv.user_id = p_user_id;

    RETURN jsonb_build_object(
        'account', v_account,
        'stores', v_stores
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ═══════════════════════════════════════
-- 7. GRANTS
-- ═══════════════════════════════════════
GRANT USAGE ON SCHEMA admineng TO authenticated;
GRANT SELECT ON admineng.store_360 TO authenticated;
GRANT SELECT ON admineng.account_360 TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_stores_360 TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_360_json TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_360_json TO authenticated;
