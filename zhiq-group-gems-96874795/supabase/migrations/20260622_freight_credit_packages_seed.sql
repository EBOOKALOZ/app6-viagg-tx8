-- ═══════════════════════════════════════════════════════════════════════════
-- Pacotes de crédito de FRETES (category='freight'), espelhando exatamente os
-- 3 níveis já validados de Serviços (mesmos créditos/preços, renomeados),
-- + a linha de benefício do "Destacar anúncio" (15cr), exclusivo de Fretes.
-- Sem isso, /anunciante/fretes/creditos fica sem nenhum pacote pra vender.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.real_estate_credit_packages
  (name, slug, category, credits_amount, credits_bonus, price_brl,
   package_type, badge_text, button_label, description, features_json,
   is_featured, is_recommended, is_active, sort_order)
select * from (values
  (
    'FRETES UNO', 'fretes-uno-' || extract(epoch from now())::bigint, 'freight',
    120, 0, 39.90, 'standard', 'FRETES uno', 'Selecionar',
    E'\nBenefícios do Plano',
    jsonb_build_array(
      '✅ Divulgação gratuita do seu anúncio.',
      '📦 Adquira pacotes de créditos apenas quando precisar.',
      '⏳ Todos os pacotes possuem validade de 30 dias.',
      '🛡️ Proteção automática contra cliques inválidos.',
      'Ao adquirir pacotes, os créditos ficarão disponíveis e pontuados em seu painel de visitas e interessados.',
      '🔹 06 créditos serão descontados quando um usuário clicar em seu anúncio.',
      '🔹 09 créditos serão descontados quando um usuário clicar no botão INTERESSE.',
      '🔹 12 créditos serão descontados quando você optar por desbloquear o WhatsApp do cliente interessado.',
      '⭐ 15 créditos serão descontados quando você optar por destacar seu anúncio por 7 dias.',
      '📊 Todos os consumos serão registrados em seu painel, permitindo o acompanhamento detalhado dos créditos utilizados e do saldo disponível.',
      '💳 Os créditos serão descontados automaticamente conforme a utilização dos serviços contratados através dos pacotes adquiridos.'
    ),
    false, false, true, 1
  ),
  (
    'FRETES INTERMEDIÁRIO', 'fretes-intermediario-' || (extract(epoch from now())::bigint + 1), 'freight',
    190, 0, 69.90, 'standard', 'FRETES INTERMEDIÁRIO', 'Selecionar',
    E'\nBenefício do Plano',
    jsonb_build_array(
      '✅ Divulgação gratuita do seu anúncio.',
      '📦 Adquira pacotes de créditos apenas quando precisar.',
      '⏳ Todos os pacotes possuem validade de 30 dias.',
      '🛡️ Proteção automática contra cliques inválidos.',
      'Ao adquirir pacotes, os créditos ficarão disponíveis e pontuados em seu painel de visitas e interessados.',
      '🔹 06 créditos serão descontados quando um usuário clicar em seu anúncio.',
      '🔹 09 créditos serão descontados quando um usuário clicar no botão INTERESSE.',
      '🔹 12 créditos serão descontados quando você optar por desbloquear o WhatsApp do cliente interessado.',
      '⭐ 15 créditos serão descontados quando você optar por destacar seu anúncio por 7 dias.',
      '📊 Todos os consumos serão registrados em seu painel, permitindo o acompanhamento detalhado dos créditos utilizados e do saldo disponível.',
      '💳 Os créditos serão descontados automaticamente conforme a utilização dos serviços contratados através dos pacotes adquiridos.'
    ),
    false, false, true, 2
  ),
  (
    'FRETES PROFISSIONAL', 'fretes-profissional-' || (extract(epoch from now())::bigint + 2), 'freight',
    240, 0, 110.00, 'standard', 'FRETES PROFISSIONAL', 'Selecionar',
    E'\nBenefícios do plano',
    jsonb_build_array(
      'Benefícios',
      '✅ Divulgação gratuita do seu anúncio.',
      '📦 Adquira pacotes de créditos apenas quando precisar.',
      '⏳ Todos os pacotes possuem validade de 30 dias.',
      '🛡️ Proteção automática contra cliques inválidos.',
      'Ao adquirir pacotes, os créditos ficarão disponíveis e pontuados em seu painel de visitas e interessados.',
      '🔹 06 créditos serão descontados quando um usuário clicar em seu anúncio.',
      '🔹 09 créditos serão descontados quando um usuário clicar no botão INTERESSE.',
      '🔹 12 créditos serão descontados quando você optar por desbloquear o WhatsApp do cliente interessado.',
      '⭐ 15 créditos serão descontados quando você optar por destacar seu anúncio por 7 dias.',
      '📊 Todos os consumos serão registrados em seu painel, permitindo o acompanhamento detalhado dos créditos utilizados e do saldo disponível.',
      '💳 Os créditos serão descontados automaticamente conforme a utilização dos serviços contratados através dos pacotes adquiridos.'
    ),
    false, false, true, 3
  )
) as v(name, slug, category, credits_amount, credits_bonus, price_brl,
       package_type, badge_text, button_label, description, features_json,
       is_featured, is_recommended, is_active, sort_order)
where not exists (
  select 1 from public.real_estate_credit_packages where category = 'freight'
);

select pg_notify('pgrst', 'reload schema');
