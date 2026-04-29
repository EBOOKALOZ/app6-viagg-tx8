-- =========================================================
-- SEED: PACotes DE VISIBILIDADE PADRÃO (IMOVEIS)
-- =========================================================

-- Garante que o RLS está desativado para o seed ou usamos UPSERT direto
-- Este script assume que o schema e as colunas (button_label, features_json) já existem

INSERT INTO public.real_estate_credit_packages 
(name, slug, package_type, credits_amount, bonus_credits, price_brl, is_featured, is_recommended, is_active, description, badge_text, button_label, features_json)
VALUES 
(
  'Plano Bronze', 
  'plano-bronze', 
  'standard', 
  5, 
  0, 
  49.90, 
  false, 
  false, 
  true, 
  'Ideal para quem está começando e quer testar a plataforma.', 
  null, 
  'Selecionar Bronze', 
  '["5 Créditos para anúncios", "Visibilidade básica no portal", "Suporte via E-mail"]'::jsonb
),
(
  'Plano Ouro', 
  'plano-ouro', 
  'premium', 
  10, 
  2, 
  89.90, 
  true, 
  true, 
  true, 
  'O melhor custo-benefício para corretores e proprietários.', 
  'MAIS VENDIDO', 
  'Selecionar Ouro', 
  '["10 Créditos Base", "2 Créditos Bônus (Total 12)", "Destaque nas buscas", "Suporte Prioritário"]'::jsonb
),
(
  'Plano Platinum', 
  'plano-platinum', 
  'exclusive', 
  20, 
  5, 
  149.90, 
  false, 
  false, 
  true, 
  'Para quem quer dominar o mercado local com máxima exposição.', 
  'PREMIUM', 
  'Selecionar Platinum', 
  '["20 Créditos Base", "5 Créditos Bônus (Total 25)", "Exposição Máxima", "Gestor de conta dedicado"]'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  credits_amount = EXCLUDED.credits_amount,
  bonus_credits = EXCLUDED.bonus_credits,
  price_brl = EXCLUDED.price_brl,
  is_featured = EXCLUDED.is_featured,
  is_recommended = EXCLUDED.is_recommended,
  is_active = EXCLUDED.is_active,
  description = EXCLUDED.description,
  badge_text = EXCLUDED.badge_text,
  button_label = EXCLUDED.button_label,
  features_json = EXCLUDED.features_json;

-- Notificar recarga
NOTIFY pgrst, 'reload schema';
