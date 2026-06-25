-- Pacotes de crédito de VIAGENS (category='travel').
insert into public.real_estate_credit_packages
  (name, slug, category, credits_amount, credits_bonus, price_brl,
   package_type, badge_text, button_label, description, features_json,
   is_featured, is_recommended, is_active, sort_order)
select * from (values
  (
    'VIAGENS UNO', 'viagens-uno-' || extract(epoch from now())::bigint, 'travel',
    120, 0, 39.90, 'standard', 'VIAGENS UNO', 'Selecionar',
    E'\nBenefícios do Plano',
    jsonb_build_array(
      '✅ Divulgação gratuita do seu anúncio.',
      '📦 Adquira pacotes de créditos apenas quando precisar.',
      '⏳ Todos os pacotes possuem validade de 30 dias.',
      '🛡️ Proteção automática contra cliques inválidos.',
      '🔹 06 créditos serão descontados quando um usuário clicar em seu anúncio.',
      '🔹 09 créditos serão descontados quando um usuário clicar no botão INTERESSE.',
      '🔹 12 créditos serão descontados quando você optar por desbloquear o WhatsApp do cliente.',
      '⭐ 15 créditos serão descontados quando você optar por destacar seu anúncio por 7 dias.',
      '📊 Todos os consumos serão registrados em seu painel.'
    ),
    false, false, true, 1
  ),
  (
    'VIAGENS INTERMEDIÁRIO', 'viagens-intermediario-' || (extract(epoch from now())::bigint + 1), 'travel',
    190, 0, 69.90, 'standard', 'VIAGENS INTERMEDIÁRIO', 'Selecionar',
    E'\nBenefícios do Plano',
    jsonb_build_array(
      '✅ Divulgação gratuita do seu anúncio.',
      '📦 Adquira pacotes de créditos apenas quando precisar.',
      '⏳ Todos os pacotes possuem validade de 30 dias.',
      '🛡️ Proteção automática contra cliques inválidos.',
      '🔹 06 créditos serão descontados quando um usuário clicar em seu anúncio.',
      '🔹 09 créditos serão descontados quando um usuário clicar no botão INTERESSE.',
      '🔹 12 créditos serão descontados quando você optar por desbloquear o WhatsApp do cliente.',
      '⭐ 15 créditos serão descontados quando você optar por destacar seu anúncio por 7 dias.',
      '📊 Todos os consumos serão registrados em seu painel.'
    ),
    false, false, true, 2
  ),
  (
    'VIAGENS PROFISSIONAL', 'viagens-profissional-' || (extract(epoch from now())::bigint + 2), 'travel',
    240, 0, 110.00, 'standard', 'VIAGENS PROFISSIONAL', 'Selecionar',
    E'\nBenefícios do Plano',
    jsonb_build_array(
      '✅ Divulgação gratuita do seu anúncio.',
      '📦 Adquira pacotes de créditos apenas quando precisar.',
      '⏳ Todos os pacotes possuem validade de 30 dias.',
      '🛡️ Proteção automática contra cliques inválidos.',
      '🔹 06 créditos serão descontados quando um usuário clicar em seu anúncio.',
      '🔹 09 créditos serão descontados quando um usuário clicar no botão INTERESSE.',
      '🔹 12 créditos serão descontados quando você optar por desbloquear o WhatsApp do cliente.',
      '⭐ 15 créditos serão descontados quando você optar por destacar seu anúncio por 7 dias.',
      '📊 Todos os consumos serão registrados em seu painel.'
    ),
    false, false, true, 3
  )
) as v(name, slug, category, credits_amount, credits_bonus, price_brl,
       package_type, badge_text, button_label, description, features_json,
       is_featured, is_recommended, is_active, sort_order)
where not exists (
  select 1 from public.real_estate_credit_packages where category = 'travel'
);

select pg_notify('pgrst', 'reload schema');
