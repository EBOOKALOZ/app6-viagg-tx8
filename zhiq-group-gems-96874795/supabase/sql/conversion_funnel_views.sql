-- FUNIL DE CONVERSÃO DO MARKETPLACE
-- Views analíticas baseadas em eventos existentes
-- Executar no Supabase SQL Editor

-- ============================================
-- VIEW 1: Funil agregado por dia (últimos 90 dias)
-- ============================================
CREATE OR REPLACE VIEW v_conversion_funnel_daily AS
SELECT
  date_trunc('day', created_at) as funnel_date,
  -- Etapa 1: Visualização de produto (marketplace)
  COUNT(DISTINCT CASE WHEN event_type = 'product_click' OR event_type = 'view' THEN id END) as product_views,
  -- Etapa 2: Entrada na loja
  COUNT(DISTINCT CASE WHEN event_type = 'store_view' THEN id END) as store_entries,
  -- Etapa 3: Clique em produto dentro da loja (usamos product_click + metadata para diferenciar? Tratamos como product_click adicional)
  COUNT(DISTINCT CASE WHEN event_type = 'product_click' AND (metadata->>'context' = 'inside_store' OR metadata->>'source' = 'store_page') THEN id END) as in_store_product_clicks,
  -- Etapa 4: Clique em comprar
  COUNT(DISTINCT CASE WHEN event_type = 'buy_click' THEN id END) as buy_clicks,
  -- Etapa 5: Finalização de pedido (intenção de compra submetida)
  COUNT(DISTINCT CASE WHEN event_type = 'intention_submitted' OR (event_type = 'purchase_completed' AND source_type = 'online_payment') THEN id END) as orders_finished,
  -- Etapa 6: Perguntar sobre produto (leads)
  COUNT(DISTINCT CASE WHEN event_type IN ('whatsapp_click', 'message_request', 'contact_seller') THEN id END) as product_questions
FROM (
  -- Union de múltiplas tabelas de eventos
  SELECT id, created_at, event_type, metadata FROM m1_billing_events
  WHERE created_at >= now() - interval '90 days'
  UNION ALL
  SELECT id, created_at, event_type, metadata FROM product_interest_events
  WHERE created_at >= now() - interval '90 days'
  UNION ALL
  SELECT id, created_at, 'intention_submitted' as event_type, '{}'::jsonb as metadata FROM purchase_intention_events
  WHERE created_at >= now() - interval '90 days'
  UNION ALL
  SELECT id, created_at, interest_type as event_type, '{}'::jsonb as metadata FROM advertiser_contact_intentions
  WHERE created_at >= now() - interval '90 days'
) combined_events
GROUP BY date_trunc('day', created_at)
ORDER BY funnel_date DESC;

-- ============================================
-- VIEW 2: Funil consolidado (total geral)
-- ============================================
CREATE OR REPLACE VIEW v_conversion_funnel_summary AS
SELECT
  -- Contadores brutos
  COUNT(DISTINCT CASE WHEN event_type IN ('product_click', 'view') THEN id END) as total_product_views,
  COUNT(DISTINCT CASE WHEN event_type = 'store_view' THEN id END) as total_store_entries,
  COUNT(DISTINCT CASE WHEN event_type = 'product_click' AND (metadata->>'context' = 'inside_store' OR metadata->>'source' = 'store_page') THEN id END) as total_in_store_clicks,
  COUNT(DISTINCT CASE WHEN event_type = 'buy_click' THEN id END) as total_buy_clicks,
  COUNT(DISTINCT CASE WHEN event_type IN ('intention_submitted', 'purchase_completed') THEN id END) as total_orders_finished,
  COUNT(DISTINCT CASE WHEN event_type IN ('whatsapp_click', 'message_request', 'contact_seller') THEN id END) as total_product_questions,
  -- Taxas de conversão (porcentagem)
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN event_type IN ('product_click', 'view') THEN id END) > 0 
    THEN ROUND(COUNT(DISTINCT CASE WHEN event_type = 'store_view' THEN id END) * 100.0 / 
               COUNT(DISTINCT CASE WHEN event_type IN ('product_click', 'view') THEN id END), 2)
    ELSE 0 
  END as view_to_store_rate,
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN event_type = 'store_view' THEN id END) > 0 
    THEN ROUND(COUNT(DISTINCT CASE WHEN event_type = 'product_click' AND (metadata->>'context' = 'inside_store' OR metadata->>'source' = 'store_page') THEN id END) * 100.0 / 
               COUNT(DISTINCT CASE WHEN event_type = 'store_view' THEN id END), 2)
    ELSE 0 
  END as store_to_product_rate,
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN event_type = 'product_click' AND (metadata->>'context' = 'inside_store' OR metadata->>'source' = 'store_page') THEN id END) > 0 
    THEN ROUND(COUNT(DISTINCT CASE WHEN event_type = 'buy_click' THEN id END) * 100.0 / 
               COUNT(DISTINCT CASE WHEN event_type = 'product_click' AND (metadata->>'context' = 'inside_store' OR metadata->>'source' = 'store_page') THEN id END), 2)
    ELSE 0 
  END as product_to_buy_rate,
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN event_type = 'buy_click' THEN id END) > 0 
    THEN ROUND(COUNT(DISTINCT CASE WHEN event_type IN ('intention_submitted', 'purchase_completed') THEN id END) * 100.0 / 
               COUNT(DISTINCT CASE WHEN event_type = 'buy_click' THEN id END), 2)
    ELSE 0 
  END as buy_to_order_rate,
  -- Conversão total: product_view → order_finished
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN event_type IN ('product_click', 'view') THEN id END) > 0 
    THEN ROUND(COUNT(DISTINCT CASE WHEN event_type IN ('intention_submitted', 'purchase_completed') THEN id END) * 100.0 / 
               COUNT(DISTINCT CASE WHEN event_type IN ('product_click', 'view') THEN id END), 2)
    ELSE 0 
  END as overall_conversion_rate
FROM (
  SELECT id, event_type, metadata FROM m1_billing_events WHERE created_at >= now() - interval '90 days'
  UNION ALL
  SELECT id, event_type, metadata FROM product_interest_events WHERE created_at >= now() - interval '90 days'
  UNION ALL
  SELECT id, 'intention_submitted' as event_type, '{}'::jsonb as metadata FROM purchase_intention_events WHERE created_at >= now() - interval '90 days'
  UNION ALL
  SELECT id, interest_type as event_type, '{}'::jsonb as metadata FROM advertiser_contact_intentions WHERE created_at >= now() - interval '90 days'
) combined_events;

-- ============================================
-- VIEW 3: Funil por loja (top 50 lojas)
-- ============================================
CREATE OR REPLACE VIEW v_funnel_by_store AS
SELECT
  s.id as store_id,
  s.store_name,
  s.city,
  s.state,
  -- Eventos da loja
  COUNT(DISTINCT CASE WHEN e.event_type IN ('store_view') THEN e.id END) as store_views_count,
  COUNT(DISTINCT CASE WHEN e.event_type = 'product_click' THEN e.id END) as product_clicks_count,
  COUNT(DISTINCT CASE WHEN e.event_type = 'buy_click' THEN e.id END) as buy_clicks_count,
  COUNT(DISTINCT CASE WHEN e.event_type = 'intention_submitted' OR e.event_type='purchase_completed' THEN e.id END) as orders_count,
  COUNT(DISTINCT CASE WHEN e.event_type IN ('whatsapp_click', 'message_request', 'contact_seller') THEN e.id END) as questions_count,
  -- Taxas locais
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN e.event_type IN ('store_view') THEN e.id END) > 0 
    THEN ROUND(COUNT(DISTINCT CASE WHEN e.event_type = 'product_click' THEN e.id END) * 100.0 / 
               COUNT(DISTINCT CASE WHEN e.event_type IN ('store_view') THEN e.id END), 2)
    ELSE 0 
  END as store_view_to_product_rate,
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN e.event_type = 'product_click' THEN e.id END) > 0 
    THEN ROUND(COUNT(DISTINCT CASE WHEN e.event_type = 'buy_click' THEN e.id END) * 100.0 / 
               COUNT(DISTINCT CASE WHEN e.event_type = 'product_click' THEN e.id END), 2)
    ELSE 0 
  END as product_to_buy_rate,
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN e.event_type = 'buy_click' THEN e.id END) > 0 
    THEN ROUND(COUNT(DISTINCT CASE WHEN e.event_type IN ('intention_submitted', 'purchase_completed') THEN e.id END) * 100.0 / 
               COUNT(DISTINCT CASE WHEN e.event_type = 'buy_click' THEN e.id END), 2)
    ELSE 0 
  END as buy_to_order_rate
FROM stores s
LEFT JOIN (
  SELECT store_id::uuid as store_ref, id, event_type, metadata FROM m1_billing_events WHERE created_at >= now() - interval '90 days'
  UNION ALL
  SELECT store_id, id, event_type, metadata FROM product_interest_events WHERE created_at >= now() - interval '90 days'
  UNION ALL
  SELECT store_id, id, 'intention_submitted' as event_type, '{}'::jsonb FROM purchase_intention_events WHERE created_at >= now() - interval '90 days'
  UNION ALL
  SELECT advertiser_user_id as store_ref, id, interest_type as event_type, '{}'::jsonb FROM advertiser_contact_intentions WHERE created_at >= now() - interval '90 days'
) e ON e.store_ref = s.id OR (e.store_ref IS NULL AND FALSE)
GROUP BY s.id, s.store_name, s.city, s.state
ORDER BY store_views_count DESC NULLS LAST
LIMIT 50;

-- ============================================
-- VIEW 4: Funil por produto (top 100 produtos)
-- ============================================
CREATE OR REPLACE VIEW v_funnel_by_product AS
SELECT
  p.id as product_id,
  p.title as product_name,
  p.city,
  p.state,
  -- Eventos do produto
  COUNT(DISTINCT CASE WHEN e.event_type IN ('view','product_click') THEN e.id END) as product_views,
  COUNT(DISTINCT CASE WHEN e.event_type = 'buy_click' THEN e.id END) as buy_clicks,
  COUNT(DISTINCT CASE WHEN e.event_type IN ('intention_submitted','purchase_completed') THEN e.id END) as orders_finished,
  COUNT(DISTINCT CASE WHEN e.event_type IN ('whatsapp_click','message_request','contact_seller') THEN e.id END) as questions_count,
  -- Taxas
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN e.event_type IN ('view','product_click') THEN e.id END) > 0 
    THEN ROUND(COUNT(DISTINCT CASE WHEN e.event_type = 'buy_click' THEN e.id END) * 100.0 / 
               COUNT(DISTINCT CASE WHEN e.event_type IN ('view','product_click') THEN e.id END), 2)
    ELSE 0 
  END as view_to_buy_rate,
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN e.event_type = 'buy_click' THEN e.id END) > 0 
    THEN ROUND(COUNT(DISTINCT CASE WHEN e.event_type IN ('intention_submitted','purchase_completed') THEN e.id END) * 100.0 / 
               COUNT(DISTINCT CASE WHEN e.event_type = 'buy_click' THEN e.id END), 2)
    ELSE 0 
  END as buy_to_order_rate
FROM product_listings p
LEFT JOIN (
  SELECT 
    product_id, 
    id, 
    event_type, 
    metadata,
    -- Pegar store_id do evento se disponível para join com product_listings
    (metadata->>'store_id')::uuid as event_store_id
  FROM m1_billing_events 
  WHERE created_at >= now() - interval '90 days' AND product_id IS NOT NULL
  UNION ALL
  SELECT 
    product_id, 
    id, 
    event_type, 
    metadata,
    store_id as event_store_id
  FROM product_interest_events 
  WHERE created_at >= now() - interval '90 days' AND product_id IS NOT NULL
  UNION ALL
  SELECT 
    item.product_id as product_id,
    e.id,
    'intention_submitted' as event_type,
    '{}'::jsonb as metadata,
    i.store_id as event_store_id
  FROM purchase_intention_items item
  JOIN purchase_intentions i ON i.id = item.intention_id
  JOIN purchase_intention_events e ON e.intention_id = i.id AND e.created_at >= now() - interval '90 days'
) e ON e.product_id = p.id
GROUP BY p.id, p.title, p.city, p.state
ORDER BY product_views DESC NULLS LAST
LIMIT 100;

-- ============================================
-- VIEW 5: Funil por categoria
-- ============================================
CREATE OR REPLACE VIEW v_funnel_by_category AS
SELECT
  c.id as category_id,
  c.name as category_name,
  -- Eventos totais da categoria
  COUNT(DISTINCT CASE WHEN e.event_type IN ('view','product_click') THEN e.id END) as product_views,
  COUNT(DISTINCT CASE WHEN e.event_type = 'buy_click' THEN e.id END) as buy_clicks,
  COUNT(DISTINCT CASE WHEN e.event_type IN ('intention_submitted','purchase_completed') THEN e.id END) as orders_finished,
  COUNT(DISTINCT CASE WHEN e.event_type IN ('whatsapp_click','message_request','contact_seller') THEN e.id END) as questions_count,
  -- Calculo de taxa
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN e.event_type IN ('view','product_click') THEN e.id END) > 0 
    THEN ROUND(COUNT(DISTINCT CASE WHEN e.event_type = 'buy_click' THEN e.id END) * 100.0 / 
               COUNT(DISTINCT CASE WHEN e.event_type IN ('view','product_click') THEN e.id END), 2)
    ELSE 0 
  END as view_to_buy_rate
FROM categories c
LEFT JOIN merchant_products mp ON mp.category_id = c.id
LEFT JOIN (
  SELECT 
    p.category_id,
    pe.id, pe.event_type, pe.metadata
  FROM m1_billing_events pe
  JOIN product_listings p ON p.id = pe.product_id
  WHERE pe.created_at >= now() - interval '90 days'
  UNION ALL
  SELECT 
    p.category_id,
    pie.id, pie.event_type, pie.metadata
  FROM product_interest_events pie
  JOIN product_listings p ON p.id = pie.product_id
  WHERE pie.created_at >= now() - interval '90 days'
  UNION ALL
  SELECT 
    p.category_id,
    e.id, 'intention_submitted' as event_type, '{}'::jsonb as metadata
  FROM purchase_intention_events e
  JOIN purchase_intention_items i ON i.intention_id = e.intention_id
  JOIN product_listings p ON p.id = i.product_id
  WHERE e.created_at >= now() - interval '90 days'
) e ON e.category_id = c.id
GROUP BY c.id, c.name
ORDER BY product_views DESC NULLS LAST;

-- ============================================
-- VIEW 6: Eventos por hora do dia (heatmap data)
-- ============================================
CREATE OR REPLACE VIEW v_funnel_hourly AS
SELECT
  EXTRACT(HOUR FROM created_at) as hour_of_day,
  event_type,
  COUNT(*) as event_count,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT session_id) as unique_sessions
FROM (
  SELECT created_at, event_type, user_id, session_id FROM m1_billing_events WHERE created_at >= now() - interval '30 days'
  UNION ALL
  SELECT created_at, event_type, user_id, session_id FROM product_interest_events WHERE created_at >= now() - interval '30 days'
  UNION ALL
  SELECT created_at, 'intention_submitted' as event_type, user_id, session_id FROM purchase_intention_events WHERE created_at >= now() - interval '30 days'
  UNION ALL
  SELECT created_at, interest_type as event_type, NULL as user_id, session_id FROM advertiser_contact_intentions WHERE created_at >= now() - interval '30 days'
) combined
GROUP BY EXTRACT(HOUR FROM created_at), event_type
ORDER BY hour_of_day, event_type;

-- ============================================
-- VIEW 7: Perguntas sobre produtos (ask_about_product)
-- ============================================
CREATE OR REPLACE VIEW v_product_questions_analytics AS
SELECT
  pl.id as product_id,
  pl.title as product_name,
  COUNT(DISTINCT aci.id) as total_questions,
  COUNT(DISTINCT CASE WHEN aci.status = 'unlocked' THEN aci.id END) as questions_unlocked,
  COUNT(DISTINCT CASE WHEN aci.status = 'converted' THEN aci.id END) as questions_converted,
  -- Taxa de conversão lead → venda
  CASE 
    WHEN COUNT(DISTINCT aci.id) > 0 
    THEN ROUND(COUNT(DISTINCT CASE WHEN aci.status = 'converted' THEN aci.id END) * 100.0 / 
               COUNT(DISTINCT aci.id), 2)
    ELSE 0 
  END as question_to_sale_rate,
  -- Última pergunta
  MAX(aci.created_at) as last_question_at
FROM product_listings pl
LEFT JOIN advertiser_contact_intentions aci ON aci.listing_id = pl.id AND aci.interest_type IN ('whatsapp_click', 'message_request', 'proposal')
WHERE aci.created_at >= now() - interval '90 days' OR aci.id IS NULL
GROUP BY pl.id, pl.title
ORDER BY total_questions DESC NULLS LAST
LIMIT 100;

-- ============================================
-- VIEW 8: Insights — Gaps de conversão
-- ============================================
CREATE OR REPLACE VIEW v_conversion_gaps AS
-- Produtos com muitos views mas poucas compras
SELECT 
  'product' as entity_type,
  p.id as entity_id,
  p.title as entity_name,
  'high_view_low_conversion' as gap_type,
  product_views,
  buy_clicks,
  orders_finished,
  CASE 
    WHEN product_views > 100 AND buy_clicks > 0 
    THEN ROUND((product_views - buy_clicks) * 100.0 / product_views, 2)
    ELSE 0 
  END as drop_percent
FROM (
  SELECT 
    pl.id,
    pl.title,
    COUNT(DISTINCT CASE WHEN e.event_type IN ('view','product_click') THEN e.id END) as product_views,
    COUNT(DISTINCT CASE WHEN e.event_type = 'buy_click' THEN e.id END) as buy_clicks,
    COUNT(DISTINCT CASE WHEN e.event_type IN ('intention_submitted','purchase_completed') THEN e.id END) as orders_finished
  FROM product_listings pl
  LEFT JOIN (
    SELECT product_id, id, event_type FROM m1_billing_events WHERE created_at >= now() - interval '30 days'
    UNION ALL
    SELECT product_id, id, event_type FROM product_interest_events WHERE created_at >= now() - interval '30 days'
  ) e ON e.product_id = pl.id
  GROUP BY pl.id, pl.title
  HAVING COUNT(DISTINCT CASE WHEN e.event_type IN ('view','product_click') THEN e.id END) > 100
) p
WHERE (product_views > 0 AND (buy_clicks::float / product_views) < 0.05) -- menos de 5% conversão
   OR (buy_clicks > 0 AND orders_finished = 0)
ORDER BY drop_percent DESC
LIMIT 20;

-- ============================================
-- INSTRUÇÕES:
-- Execute este SQL no Supabase SQL Editor
-- As views consumirão dados de múltiplas tabelas de eventos existentes
-- ============================================
