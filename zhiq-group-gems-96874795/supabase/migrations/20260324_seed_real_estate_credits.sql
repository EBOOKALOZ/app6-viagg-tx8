-- =========================================================
-- SEED CREDITOS IMÓVEIS
-- =========================================================

INSERT INTO public.real_estate_credit_packages (name, slug, package_type, credits_amount, bonus_credits, price_brl, is_featured, description)
VALUES 
  ('Pacote Inicial', 'pacote-inicial', 'avulso', 10, 0, 49.90, false, 'Ideal para quem está começando a anunciar terrenos e chácaras.'),
  ('Pacote Profissional', 'pacote-profissional', 'avulso', 35, 5, 149.90, true, 'O melhor custo-benefício para corretores e imobiliárias locais.'),
  ('Pacote Premium', 'pacote-premium', 'avulso', 100, 20, 399.90, false, 'Para grandes incorporadoras e alta demanda de captação.')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  credits_amount = EXCLUDED.credits_amount,
  bonus_credits = EXCLUDED.bonus_credits,
  price_brl = EXCLUDED.price_brl,
  is_featured = EXCLUDED.is_featured,
  description = EXCLUDED.description;
