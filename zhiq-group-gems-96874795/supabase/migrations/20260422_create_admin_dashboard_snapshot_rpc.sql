-- RPC: admin_get_dashboard_snapshot_rpc
-- Retorna snapshot unificado do marketplace para o painel admin
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_snapshot_rpc(
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Garante que apenas admins possam chamar (via RLS ou chamada direta)
  -- A verificação de permissão deve ser feita no código (AuthContext)

  SELECT jsonb_build_object(
    'stores', jsonb_build_object(
      'total_stores',                  (SELECT COUNT(*) FROM stores WHERE created_at <= p_to),
      'active_stores',                 (SELECT COUNT(*) FROM stores WHERE is_active = true AND created_at <= p_to),
      'stores_with_products',          (SELECT COUNT(DISTINCT s.id) FROM stores s JOIN products p ON p.store_id = s.id WHERE p.is_active = true AND s.created_at <= p_to),
      'active_recently_stores',        (SELECT COUNT(*) FROM stores WHERE is_active = true AND created_at >= (p_to - INTERVAL '7 days')),
      'growth_new_stores_pct',         COALESCE((
        SELECT ROUND((
          (COUNT(*) FILTER (WHERE created_at >= (p_to - INTERVAL '30 days'))::NUMERIC -
           COUNT(*) FILTER (WHERE created_at >= (p_to - INTERVAL '60 days') AND created_at < (p_to - INTERVAL '30 days'))::NUMERIC
        ) / NULLIF(COUNT(*) FILTER (WHERE created_at >= (p_to - INTERVAL '60 days') AND created_at < (p_to - INTERVAL '30 days'))::NUMERIC, 0) * 100, 2)
        FROM stores
        WHERE created_at < p_to
      ), 0)
    ),
    'products', jsonb_build_object(
      'total_products',            (SELECT COUNT(*) FROM products WHERE created_at <= p_to),
      'new_products',              (SELECT COUNT(*) FROM products WHERE created_at BETWEEN (p_to - INTERVAL '30 days') AND p_to),
      'used_products',             (SELECT COUNT(*) FROM products WHERE is_used = true AND created_at <= p_to),
      'avg_products_per_store',    COALESCE((
        SELECT ROUND(AVG(cnt)::NUMERIC, 2)
        FROM (
          SELECT store_id, COUNT(*) as cnt
          FROM products
          WHERE created_at <= p_to
          GROUP BY store_id
        ) s
      ), 0),
      'growth_products_pct',       COALESCE((
        SELECT ROUND((
          (COUNT(*) FILTER (WHERE created_at >= (p_to - INTERVAL '30 days'))::NUMERIC -
           COUNT(*) FILTER (WHERE created_at >= (p_to - INTERVAL '60 days') AND created_at < (p_to - INTERVAL '30 days'))::NUMERIC
        ) / NULLIF(COUNT(*) FILTER (WHERE created_at >= (p_to - INTERVAL '60 days') AND created_at < (p_to - INTERVAL '30 days'))::NUMERIC, 0) * 100, 2)
        FROM products
        WHERE created_at < p_to
      ), 0),
      'growth_new_pct',            COALESCE((
        SELECT ROUND((
          (COUNT(*) FILTER (WHERE created_at >= (p_to - INTERVAL '30 days'))::NUMERIC -
           COUNT(*) FILTER (WHERE created_at >= (p_to - INTERVAL '60 days') AND created_at < (p_to - INTERVAL '30 days'))::NUMERIC
        ) / NULLIF(COUNT(*) FILTER (WHERE created_at >= (p_to - INTERVAL '60 days') AND created_at < (p_to - INTERVAL '30 days'))::NUMERIC, 0) * 100, 2)
        FROM products
        WHERE created_at < p_to
      ), 0),
      'growth_used_pct',           COALESCE((
        SELECT ROUND((
          (COUNT(*) FILTER (WHERE created_at >= (p_to - INTERVAL '30 days') AND is_used = true)::NUMERIC -
           COUNT(*) FILTER (WHERE created_at >= (p_to - INTERVAL '60 days') AND created_at < (p_to - INTERVAL '30 days') AND is_used = true)::NUMERIC
        ) / NULLIF(COUNT(*) FILTER (WHERE created_at >= (p_to - INTERVAL '60 days') AND created_at < (p_to - INTERVAL '30 days') AND is_used = true)::NUMERIC, 0) * 100, 2)
        FROM products
        WHERE created_at < p_to
      ), 0)
    ),
    'listings', jsonb_build_object(
      'total_auctions',            (SELECT COUNT(*) FROM auction_listings WHERE created_at <= p_to),
      'active_auctions',           (SELECT COUNT(*) FROM auction_listings WHERE status IN ('active','approved') AND ends_at > p_to AND created_at <= p_to),
      'total_arremates',           (SELECT COUNT(*) FROM auction_listings WHERE status = 'sold' AND sold_at <= p_to),
      'active_arremates',          (SELECT COUNT(*) FROM auction_listings WHERE status = 'sold' AND sold_at >= (p_to - INTERVAL '30 days')),
      'growth_auctions_pct',       COALESCE((
        SELECT ROUND((
          (COUNT(*) FILTER (WHERE created_at >= (p_to - INTERVAL '30 days'))::NUMERIC -
           COUNT(*) FILTER (WHERE created_at >= (p_to - INTERVAL '60 days') AND created_at < (p_to - INTERVAL '30 days'))::NUMERIC
        ) / NULLIF(COUNT(*) FILTER (WHERE created_at >= (p_to - INTERVAL '60 days') AND created_at < (p_to - INTERVAL '30 days'))::NUMERIC, 0) * 100, 2)
        FROM auction_listings
        WHERE created_at < p_to
      ), 0),
      'growth_arremates_pct',      COALESCE((
        SELECT ROUND((
          (COUNT(*) FILTER (WHERE status = 'sold' AND sold_at >= (p_to - INTERVAL '30 days'))::NUMERIC -
           COUNT(*) FILTER (WHERE status = 'sold' AND sold_at >= (p_to - INTERVAL '60 days') AND sold_at < (p_to - INTERVAL '30 days'))::NUMERIC
        ) / NULLIF(COUNT(*) FILTER (WHERE status = 'sold' AND sold_at >= (p_to - INTERVAL '60 days') AND sold_at < (p_to - INTERVAL '30 days'))::NUMERIC, 0) * 100, 2)
        FROM auction_listings
        WHERE sold_at < p_to
      ), 0)
    ),
    'credits', jsonb_build_object(
      'total_purchases',           COALESCE((
        SELECT COUNT(*)
        FROM credit_purchases
        WHERE status = 'completed' AND created_at <= p_to
      ), 0),
      'total_value',               COALESCE((
        SELECT COALESCE(SUM(amount_brl), 0)
        FROM credit_purchases
        WHERE status = 'completed' AND created_at <= p_to
      ), 0),
      'period_purchases',          COALESCE((
        SELECT COUNT(*)
        FROM credit_purchases
        WHERE status = 'completed' AND created_at BETWEEN p_from AND p_to
      ), 0),
      'period_value',              COALESCE((
        SELECT COALESCE(SUM(amount_brl), 0)
        FROM credit_purchases
        WHERE status = 'completed' AND created_at BETWEEN p_from AND p_to
      ), 0),
      'growth_purchases_pct',      COALESCE((
        SELECT ROUND((
          (COUNT(*) FILTER (WHERE created_at >= (p_to - INTERVAL '30 days'))::NUMERIC -
           COUNT(*) FILTER (WHERE created_at >= (p_to - INTERVAL '60 days') AND created_at < (p_to - INTERVAL '30 days'))::NUMERIC
        ) / NULLIF(COUNT(*) FILTER (WHERE created_at >= (p_to - INTERVAL '60 days') AND created_at < (p_to - INTERVAL '30 days'))::NUMERIC, 0) * 100, 2)
        FROM credit_purchases
        WHERE status = 'completed' AND created_at < p_to
      ), 0),
      'growth_value_pct',          COALESCE((
        SELECT ROUND((
          (COALESCE(SUM(amount_brl), 0) FILTER (WHERE created_at >= (p_to - INTERVAL '30 days'))::NUMERIC -
           COALESCE(SUM(amount_brl), 0) FILTER (WHERE created_at >= (p_to - INTERVAL '60 days') AND created_at < (p_to - INTERVAL '30 days'))::NUMERIC
        ) / NULLIF(COALESCE(SUM(amount_brl), 0) FILTER (WHERE created_at >= (p_to - INTERVAL '60 days') AND created_at < (p_to - INTERVAL '30 days'))::NUMERIC, 0) * 100, 2)
        FROM credit_purchases
        WHERE status = 'completed' AND created_at < p_to
      ), 0),
      'top_packages',              COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'package_name', cp.name,
          'count', cnt,
          'total_value', total_value
        ))
        FROM (
          SELECT cp.id, cp.name, COUNT(cp.id) as cnt, COALESCE(SUM(cp.price_brl), 0) as total_value
          FROM credit_purchases cp
          JOIN credit_purchase_items cpi ON cpi.purchase_id = cp.id
          WHERE cp.status = 'completed' AND cp.created_at BETWEEN p_from AND p_to
          GROUP BY cp.id, cp.name
          ORDER BY cnt DESC
          LIMIT 5
        ) cp
      ), '[]'::jsonb),
      'top_buying_stores',         COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'store_name', s.name,
          'total_purchases', cnt,
          'total_spent', total_spent
        ))
        FROM (
          SELECT s.id, s.name, COUNT(cp.id) as cnt, COALESCE(SUM(cp.total_amount_brl), 0) as total_spent
          FROM stores s
          JOIN credit_purchases cp ON cp.store_id = s.id
          WHERE cp.status = 'completed' AND cp.created_at BETWEEN p_from AND p_to
          GROUP BY s.id, s.name
          ORDER BY total_spent DESC
          LIMIT 5
        ) s
      ), '[]'::jsonb),
      'top_credit_usage_categories', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'category', category,
          'usage_count', cnt
        ))
        FROM (
          SELECT p.category, COUNT(*) as cnt
          FROM credit_purchase_items cpi
          JOIN products p ON p.id = cpi.product_id
          JOIN credit_purchases cp ON cp.id = cpi.purchase_id
          WHERE cp.status = 'completed' AND cp.created_at BETWEEN p_from AND p_to
          GROUP BY p.category
          ORDER BY cnt DESC
          LIMIT 5
        ) cat
      ), '[]'::jsonb)
    ),
    'market_intelligence', jsonb_build_object(
      'top_search_terms',          COALESCE((
        SELECT jsonb_agg(jsonb_build_object('term', term, 'count', cnt))
        FROM (
          SELECT search_term as term, COUNT(*) as cnt
          FROM search_history
          WHERE searched_at BETWEEN p_from AND p_to
          GROUP BY search_term
          ORDER BY cnt DESC
          LIMIT 10
        ) sh
      ), '[]'::jsonb),
      'top_visited_stores',        COALESCE((
        SELECT jsonb_agg(jsonb_build_object('store_name', s.name, 'visit_count', cnt))
        FROM (
          SELECT s.id, s.name, COUNT(v.id) as cnt
          FROM store_visits v
          JOIN stores s ON s.id = v.store_id
          WHERE v.visited_at BETWEEN p_from AND p_to
          GROUP BY s.id, s.name
          ORDER BY cnt DESC
          LIMIT 10
        ) s
      ), '[]'::jsonb),
      'top_viewed_products',       COALESCE((
        SELECT jsonb_agg(jsonb_build_object('product_name', p.name, 'view_count', cnt))
        FROM (
          SELECT p.id, p.name, COUNT(v.id) as cnt
          FROM product_views v
          JOIN products p ON p.id = v.product_id
          WHERE v.viewed_at BETWEEN p_from AND p_to
          GROUP BY p.id, p.name
          ORDER BY cnt DESC
          LIMIT 10
        ) p
      ), '[]'::jsonb),
      'top_categories',            COALESCE((
        SELECT jsonb_agg(jsonb_build_object('category', cat, 'access_count', cnt))
        FROM (
          SELECT p.category as cat, COUNT(*) as cnt
          FROM product_views v
          JOIN products p ON p.id = v.product_id
          WHERE v.viewed_at BETWEEN p_from AND p_to
          GROUP BY p.category
          ORDER BY cnt DESC
          LIMIT 10
        ) pc
      ), '[]'::jsonb)
    ),
    'profit', jsonb_build_object(
      'total_gross',               COALESCE((
        SELECT COALESCE(SUM(amount_brl), 0)
        FROM credit_purchases
        WHERE status = 'completed' AND created_at <= p_to
      ), 0),
      'total_net',                 COALESCE((
        SELECT COALESCE(SUM(amount_brl - fee_amount_brl), 0)
        FROM credit_purchases
        WHERE status = 'completed' AND created_at <= p_to
      ), 0),
      'commission_revenue',        COALESCE((
        SELECT COALESCE(SUM(fee_amount_brl), 0)
        FROM credit_purchases
        WHERE status = 'completed' AND created_at <= p_to
      ), 0),
      'credits_revenue',           COALESCE((
        SELECT COALESCE(SUM(amount_brl - fee_amount_brl), 0)
        FROM credit_purchases
        WHERE status = 'completed' AND created_at <= p_to
      ), 0),
      'growth_gross_pct',          COALESCE((
        SELECT ROUND((
          (COALESCE(SUM(amount_brl), 0) FILTER (WHERE created_at >= (p_to - INTERVAL '30 days'))::NUMERIC -
           COALESCE(SUM(amount_brl), 0) FILTER (WHERE created_at >= (p_to - INTERVAL '60 days') AND created_at < (p_to - INTERVAL '30 days'))::NUMERIC
        ) / NULLIF(COALESCE(SUM(amount_brl), 0) FILTER (WHERE created_at >= (p_to - INTERVAL '60 days') AND created_at < (p_to - INTERVAL '30 days'))::NUMERIC, 0) * 100, 2)
        FROM credit_purchases
        WHERE status = 'completed' AND created_at < p_to
      ), 0),
      'growth_net_pct',            COALESCE((
        SELECT ROUND((
          (COALESCE(SUM(amount_brl - fee_amount_brl), 0) FILTER (WHERE created_at >= (p_to - INTERVAL '30 days'))::NUMERIC -
           COALESCE(SUM(amount_brl - fee_amount_brl), 0) FILTER (WHERE created_at >= (p_to - INTERVAL '60 days') AND created_at < (p_to - INTERVAL '30 days'))::NUMERIC
        ) / NULLIF(COALESCE(SUM(amount_brl - fee_amount_brl), 0) FILTER (WHERE created_at >= (p_to - INTERVAL '60 days') AND created_at < (p_to - INTERVAL '30 days'))::NUMERIC, 0) * 100, 2)
        FROM credit_purchases
        WHERE status = 'completed' AND created_at < p_to
      ), 0),
      'margin_pct',                COALESCE((
        SELECT CASE
          WHEN total_gross = 0 THEN 0
          ELSE ROUND((total_net / total_gross) * 100, 2)
        END
        FROM (
          SELECT COALESCE(SUM(amount_brl), 0) as total_gross
          FROM credit_purchases
          WHERE status = 'completed' AND created_at <= p_to
        ) tg
      ), 0),
      'other_revenue',             COALESCE((
        SELECT COALESCE(SUM(amount_brl), 0)
        FROM other_revenue
        WHERE created_at BETWEEN p_from AND p_to
      ), 0)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Permissão para usuários autenticados executarem (segurança adicional via app)
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_snapshot_rpc(timestamptz, timestamptz) TO authenticated;

-- Comentário
COMMENT ON FUNCTION public.admin_get_dashboard_snapshot_rpc(timestamptz, timestamptz) IS 'Retorna snapshot unificado com KPIs do marketplace para painel admin (stores, products, listings, credits, market_intelligence, profit)';