-- ═══════════════════════════════════════════════════════════════════════════
-- Ajusta o custo de desbloqueio de WhatsApp de SERVIÇOS pra 12 créditos —
-- mesma regra já praticada em Imóveis e Veículos (clique=6, interesse=9,
-- desbloqueio=12). O seed anterior (20260621_unlock_service_intention.sql)
-- criou a regra com 9 créditos; aqui ela é corrigida pro valor padrão da
-- plataforma.
-- ═══════════════════════════════════════════════════════════════════════════

update public.merchant_credit_usage_rules
set credits_cost = 12
where feature_code = 'service_unlock_whatsapp';

select pg_notify('pgrst', 'reload schema');
