-- Migração de Insert Básico do Conteúdo LGPD

INSERT INTO public.footer_contents (
  profile_type,
  content_type,
  title,
  content,
  version,
  is_active,
  display_order,
  created_by
)
VALUES (
  'global',
  'lgpd',
  'Lei Geral de Proteção de Dados (LGPD)',
  'A Viagg-TX8 respeita a sua privacidade e está comprometida com a proteção dos dados pessoais de seus usuários, em conformidade com a Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018).

Nosso compromisso é tratar seus dados pessoais com segurança, transparência e apenas para as finalidades para as quais foram coletados.

1. Coleta de Dados
Coletamos informações necessárias para a prestação de nossos serviços de intermediação de entregas...

2. Uso dos Dados
Os dados são utilizados exclusivamente para:
- Viabilizar a coleta e entrega das mercadorias.
- Comunicação de status.
- Segurança e prevenção à fraude.

3. Direitos do Titular
Você tem o direito de solicitar o acesso, correção, atualização ou exclusão dos seus dados a qualquer momento, acessando o menu de opções ou entrando em contato com nosso suporte.',
  1,
  true,
  5,
  null
)
ON CONFLICT DO NOTHING;
