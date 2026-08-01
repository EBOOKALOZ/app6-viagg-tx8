-- ============================================================
-- REGISTRY CROSS-TABLE DE LINKS ATIVOS (2026-08-01)
--
-- Regra nova do produto: um mesmo grupo (link) não pode estar ativo
-- em mais de um cadastro no sistema TODO, independente do perfil
-- (Motoboy/Moto-Táxi cadastram em whatsapp_groups; Motorista em
-- driver_whatsapp_groups). Hoje a exclusividade só existe DENTRO de
-- whatsapp_groups (índice único parcial uq_whatsapp_groups_link_ativo).
--
-- Esta migration cria a tabela central que os triggers de validação
-- (migration 20260801_enforce_group_validity_min60.sql) vão manter
-- sincronizada via UPSERT. O UNIQUE(link_normalized) é o que garante
-- a exclusividade cross-table de forma atômica (Postgres serializa/
-- rejeita concorrentes na mesma transação do INSERT/UPDATE de origem).
--
-- ATENÇÃO: motoboy_whatsapp_groups (tabela legada, usada só pela
-- feature de incentivos/corridas grátis em useMotoboyExpansion.ts)
-- fica DE FORA deste registry por decisão de escopo — não é o
-- cadastro "oficial" de grupo do motoboy, é um registro paralelo mais
-- simples e mais antigo que não participa da exclusividade cross-perfil.
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.active_group_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_normalized text NOT NULL,
  source_table   text NOT NULL CHECK (source_table IN ('whatsapp_groups', 'driver_whatsapp_groups')),
  source_id      uuid NOT NULL,
  owner_user_id  uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_active_group_links_link UNIQUE (link_normalized),
  CONSTRAINT uq_active_group_links_source UNIQUE (source_table, source_id)
);

CREATE INDEX IF NOT EXISTS idx_active_group_links_link ON public.active_group_links (link_normalized);
CREATE INDEX IF NOT EXISTS idx_active_group_links_owner ON public.active_group_links (owner_user_id);

ALTER TABLE public.active_group_links ENABLE ROW LEVEL SECURITY;

-- Sem escrita direta por usuário comum: só os triggers (SECURITY DEFINER)
-- escrevem aqui. Admin pode ler para auditoria/debug do painel.
DROP POLICY IF EXISTS active_group_links_admin_read ON public.active_group_links;
CREATE POLICY active_group_links_admin_read ON public.active_group_links
  FOR SELECT USING (public.mp_is_admin());

REVOKE ALL ON public.active_group_links FROM anon, authenticated;
GRANT SELECT ON public.active_group_links TO authenticated;

-- ── Popular a partir do estado atual (snapshot) ────────────────────
-- whatsapp_groups: todo grupo ativo hoje.
INSERT INTO public.active_group_links (link_normalized, source_table, source_id, owner_user_id)
SELECT lower(trim(g.group_link)), 'whatsapp_groups', g.id, g.owner_user_id
  FROM public.whatsapp_groups g
 WHERE g.is_active = true
   AND g.group_link IS NOT NULL
   AND trim(g.group_link) <> ''
ON CONFLICT (link_normalized) DO NOTHING;

-- driver_whatsapp_groups: todo grupo com status='ativo' hoje. Se um
-- link já foi registrado pela whatsapp_groups acima, este é ignorado
-- (ON CONFLICT DO NOTHING) — colisão legada entre tabelas fica
-- registrada só para o primeiro; precisaria de correção manual pontual
-- se existir (não fabricamos essa verificação aqui, sem acesso a
-- banco vivo nesta sessão).
INSERT INTO public.active_group_links (link_normalized, source_table, source_id, owner_user_id)
SELECT lower(trim(d.link)), 'driver_whatsapp_groups', d.id, d.user_id
  FROM public.driver_whatsapp_groups d
 WHERE d.status = 'ativo'
   AND d.link IS NOT NULL
   AND trim(d.link) <> ''
ON CONFLICT (link_normalized) DO NOTHING;
