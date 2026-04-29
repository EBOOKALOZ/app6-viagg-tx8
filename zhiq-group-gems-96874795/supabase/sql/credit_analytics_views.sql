-- CREDIT ANALYTICS VIEWS
-- Execute no Supabase SQL Editor (pgadmin ou supabase dashboard)
-- Estas views são necessárias para a página Admin Marketplace Products

-- ============================================
-- VIEW 1: Vendas diárias de pacotes (últimos 90 dias)
-- ============================================
CREATE OR REPLACE VIEW v_package_sales_daily AS
SELECT
  date_trunc('day', cp.created_at) as sale_date,
  COUNT(DISTINCT cp.id) as total_orders,
  COUNT(DISTINCT cp.store_id) as unique_buyers,
  SUM(cp.credits_granted) as total_credits_sold,
  SUM(cp.amount_paid) as total_revenue_cents,
  AVG(cp.amount_paid) as avg_order_value_cents,
  p.name as top_package_name,
  COUNT(cp.id) FILTER (WHERE cp.product_name = p.name) as package_count
FROM credit_purchases cp
LEFT JOIN merchant_credit_products p ON p.name = cp.product_name
WHERE cp.status = 'paid' AND cp.created_at >= now() - interval '90 days'
GROUP BY date_trunc('day', cp.created_at), p.name
ORDER BY sale_date DESC;

-- ============================================
-- VIEW 2: Resumo de vendas por pacote
-- ============================================
CREATE OR REPLACE VIEW v_package_sales_summary AS
SELECT
  p.id,
  p.name,
  p.slug,
  p.product_type,
  p.price_brl,
  p.credits_amount,
  p.is_active,
  COUNT(DISTINCT cp.id) as total_sales,
  SUM(cp.credits_granted) as total_credits_sold,
  SUM(cp.amount_paid) as total_revenue_cents,
  COUNT(DISTINCT cp.store_id) as unique_buyers,
  MAX(cp.created_at) as last_sale_at,
  CASE 
    WHEN COUNT(cp.id) > 0 THEN SUM(cp.amount_paid) / COUNT(cp.id)
    ELSE 0 
  END as avg_ticket_cents
FROM merchant_credit_products p
LEFT JOIN credit_purchases cp ON cp.product_name = p.name AND cp.status = 'paid'
GROUP BY p.id, p.name, p.slug, p.product_type, p.price_brl, p.credits_amount, p.is_active
ORDER BY total_sales DESC NULLS LAST;

-- ============================================
-- VIEW 3: Uso de créditos por loja
-- ============================================
CREATE OR REPLACE VIEW v_store_credit_usage AS
SELECT
  s.id as store_id,
  COALESCE(s.store_name, s.name) as store_name,
  u.name as owner_name,
  u.city,
  u.state,
  u.bairro,
  COUNT(DISTINCT l.id) as total_transactions,
  SUM(CASE WHEN l.entry_type = 'debit' THEN l.amount ELSE 0 END) as total_credits_used,
  SUM(CASE WHEN l.entry_type = 'credit' THEN l.amount ELSE 0 END) as total_credits_acquired,
  b.available_credits,
  MAX(l.created_at) as last_usage_at
FROM stores s
JOIN users u ON u.id = s.owner_id
LEFT JOIN merchant_credit_balances b ON b.store_id = s.id
LEFT JOIN merchant_credit_ledger l ON l.store_id = s.id
GROUP BY s.id, s.store_name, s.name, u.name, u.city, u.state, u.bairro, b.available_credits
ORDER BY total_credits_used DESC NULLS LAST;

-- ============================================
-- VIEW 4: Uso de créditos por hora do dia (últimos 30 dias)
-- ============================================
CREATE OR REPLACE VIEW v_hourly_credit_usage AS
SELECT
  EXTRACT(HOUR FROM l.created_at) as hour_of_day,
  COUNT(*) as transaction_count,
  SUM(CASE WHEN l.entry_type = 'debit' THEN l.amount ELSE 0 END) as credits_used,
  COUNT(DISTINCT l.store_id) as active_stores,
  CASE 
    WHEN COUNT(*) > 0 THEN SUM(CASE WHEN l.entry_type='debit' THEN l.amount ELSE 0 END) / COUNT(*)
    ELSE 0 
  END as avg_credits_per_tx
FROM merchant_credit_ledger l
WHERE l.created_at >= now() - interval '30 days'
GROUP BY EXTRACT(HOUR FROM l.created_at)
ORDER BY hour_of_day;

-- ============================================
-- VIEW 5: Top 50 lojas por uso de créditos
-- ============================================
CREATE OR REPLACE VIEW v_top_stores_by_credit_usage AS
SELECT
  s.id as store_id,
  COALESCE(s.store_name, s.name) as store_name,
  s.city,
  s.state,
  b.available_credits,
  used_stats.total_used,
  used_stats.transaction_count,
  used_stats.last_usage,
  purchased_stats.total_purchased
FROM stores s
LEFT JOIN merchant_credit_balances b ON b.store_id = s.id
LEFT JOIN (
  SELECT 
    store_id,
    SUM(CASE WHEN entry_type='debit' THEN amount ELSE 0 END) as total_used,
    COUNT(*) as transaction_count,
    MAX(created_at) as last_usage
  FROM merchant_credit_ledger
  GROUP BY store_id
) used_stats ON used_stats.store_id = s.id
LEFT JOIN (
  SELECT 
    store_id,
    SUM(credits_granted) as total_purchased
  FROM credit_purchases
  WHERE status = 'paid'
  GROUP BY store_id
) purchased_stats ON purchased_stats.store_id = s.id
ORDER BY used_stats.total_used DESC NULLS LAST
LIMIT 50;

-- ============================================
-- VIEW 6: Uso por categoria de produto (estimado)
-- ============================================
CREATE OR REPLACE VIEW v_category_credit_usage AS
SELECT
  c.id as category_id,
  c.name as category_name,
  COUNT(DISTINCT p.id) as products_count,
  COUNT(DISTINCT p.store_id) as stores_count,
  COALESCE(SUM(CASE 
    WHEN l.reason_code IN ('cesta1_purchase_intention', 'm1_product_click', 'm1_buy_click') 
    THEN l.amount ELSE 0 
  END), 0) as credits_consumed,
  ROUND(
    CASE 
      WHEN (SELECT COALESCE(SUM(amount),0) FROM merchant_credit_ledger WHERE entry_type='debit') > 0
      THEN (COALESCE(SUM(CASE WHEN l.entry_type='debit' THEN l.amount ELSE 0 END), 0) * 100.0) / 
           (SELECT COALESCE(SUM(amount),0) FROM merchant_credit_ledger WHERE entry_type='debit')
      ELSE 0 
    END, 2
  ) as usage_percent
FROM categories c
LEFT JOIN merchant_products p ON p.category_id = c.id
LEFT JOIN merchant_credit_ledger l ON l.metadata->>'product_id' = p.id::text
GROUP BY c.id, c.name
ORDER BY credits_consumed DESC NULLS LAST;

-- ============================================
-- VIEW 7: Vendas por dia da semana
-- ============================================
CREATE OR REPLACE VIEW v_weekday_sales AS
SELECT
  EXTRACT(DOW FROM cp.created_at) as day_of_week,
  COUNT(*) as sales_count,
  SUM(cp.credits_granted) as credits_sold,
  SUM(cp.amount_paid) as revenue_cents
FROM credit_purchases cp
WHERE cp.status = 'paid' AND cp.created_at >= now() - interval '90 days'
GROUP BY EXTRACT(DOW FROM cp.created_at)
ORDER BY day_of_week;

-- ============================================
-- VIEW 8: Package performance (vendas + uso)
-- ============================================
CREATE OR REPLACE VIEW v_package_performance AS
SELECT
  p.id,
  p.name,
  p.product_type,
  p.price_brl,
  p.credits_amount,
  p.is_active,
  p.sort_order,
  COUNT(DISTINCT cp.id) as total_sales,
  SUM(cp.credits_granted) as total_credits_sold,
  SUM(cp.amount_paid) as total_revenue_cents,
  COUNT(DISTINCT cp.store_id) as unique_buyers,
  MAX(cp.created_at) as last_sale_at,
  CASE WHEN COUNT(cp.id) > 0 THEN SUM(cp.amount_paid) / COUNT(cp.id) ELSE 0 END as avg_ticket_cents,
  -- Estimativa de uso (aproximado)
  COALESCE(SUM(CASE WHEN l.entry_type='debit' THEN l.amount ELSE 0 END), 0) as estimated_credits_used,
  CASE 
    WHEN SUM(cp.credits_granted) > 0 
    THEN ROUND((COALESCE(SUM(CASE WHEN l.entry_type='debit' THEN l.amount ELSE 0 END), 0) * 100.0) / 
                SUM(cp.credits_granted), 2)
    ELSE 0 
  END as usage_rate_percent
FROM merchant_credit_products p
LEFT JOIN credit_purchases cp ON cp.product_name = p.name AND cp.status = 'paid'
LEFT JOIN merchant_credit_ledger l ON l.store_id IN (
  SELECT store_id FROM credit_purchases WHERE product_name = p.name AND status = 'paid'
)
GROUP BY p.id, p.name, p.product_type, p.price_brl, p.credits_amount, p.is_active, p.sort_order
ORDER BY total_sales DESC NULLS LAST;

-- ============================================
-- INSTRUÇÕES:
-- 1. Abra o Supabase Dashboard -> SQL Editor
-- 2. Cole todo este conteúdo
-- 3. Execute (Ctrl+Enter)
-- 4. Verifique as views foram criadas com:
--    SELECT * FROM v_package_sales_summary LIMIT 5;
-- ============================================
