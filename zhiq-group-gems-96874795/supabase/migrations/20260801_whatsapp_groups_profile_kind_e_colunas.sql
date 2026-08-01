-- ============================================================
-- WHATSAPP_GROUPS: profile_kind (Motoboy/Moto-Táxi) + colunas de
-- identificação do grupo (2026-08-01)
--
-- Achado da investigação: /mototaxi/groups e /mototaxi/grupos usam o
-- MESMO componente do Motoboy (MotoboyGroupsContent.tsx), que grava
-- em whatsapp_groups sem NENHUMA coluna que diga se o grupo é de um
-- Motoboy ou de um Moto-Táxi — os dois perfis são distintos
-- (ProtectedRoute requiredProfile) mas o cadastro fica indistinguível
-- no banco. Esta migration adiciona profile_kind para resolver isso;
-- o frontend passa a gravar profile_kind = activeProfile no insert
-- (ver MotoboyGroupsContent.tsx).
--
-- Legado: não há dado histórico para inferir corretamente quais
-- linhas existentes são de fato mototaxi — todo legado recebe o
-- default 'motoboy'. Limitação conhecida e documentada; qualquer
-- grupo de Moto-Táxi cadastrado antes desta migration ficará marcado
-- como motoboy até correção manual pontual, se necessário.
--
-- Também adiciona group_whatsapp_id, group_hash, admin_phone — campos
-- pedidos pela regra de exclusividade "por ID/hash/telefone do admin".
-- Ficam opcionais/nullable: não há integração com WhatsApp Business
-- API/Baileys neste projeto hoje, então não há fonte automática para
-- preenchê-los. A checagem de duplicidade automatizada CONTINUA via
-- group_link normalizado (único dado confiável disponível).
--
-- Idempotente.
-- ============================================================

ALTER TABLE public.whatsapp_groups
  ADD COLUMN IF NOT EXISTS profile_kind text NOT NULL DEFAULT 'motoboy',
  ADD COLUMN IF NOT EXISTS group_whatsapp_id text,
  ADD COLUMN IF NOT EXISTS group_hash text,
  ADD COLUMN IF NOT EXISTS admin_phone text;

ALTER TABLE public.whatsapp_groups
  DROP CONSTRAINT IF EXISTS whatsapp_groups_profile_kind_check;
ALTER TABLE public.whatsapp_groups
  ADD CONSTRAINT whatsapp_groups_profile_kind_check
  CHECK (profile_kind IN ('motoboy', 'mototaxi'));

CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_profile_kind ON public.whatsapp_groups (profile_kind);
