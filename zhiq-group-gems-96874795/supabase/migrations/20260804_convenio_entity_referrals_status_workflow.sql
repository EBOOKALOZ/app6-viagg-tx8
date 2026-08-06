-- ═══════════════════════════════════════════════════════════════════════════
-- Comando Convênio · Painel de Indicações do Gestor (fecha o achado M4 da
-- auditoria de 2026-08-04): workflow de status de convenio_entity_referrals.
--
-- ADITIVA e retrocompatível — NÃO altera nada homologado no P1:
--   • Estende o CHECK de status com 2 estados novos do funil do Gestor:
--       'documentacao_pendente'  (aguardando documentos da entidade)
--       'convertido_convenio'    (indicação virou convênio firmado)
--     Estados existentes ('novo', 'em_analise', 'contatado', 'aprovado',
--     'recusado') permanecem válidos; nenhuma linha existente viola o novo
--     CHECK (é um superconjunto do anterior).
--   • A policy pública de INSERT (WITH CHECK status = 'novo') continua
--     intacta; visitante segue só podendo criar indicação como 'novo'.
--   • Auditoria automática (trg_convenio_audit) já cobre a tabela — mudanças
--     de status feitas pelo painel são registradas sem trabalho adicional.
--
-- Projeto: broifhfqmnzqoongtokm — idempotente; aplicar via SQL Editor ou
-- supabase db query --file — NUNCA supabase db push.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Remove o(s) CHECK(s) de status atual(is) pelo conteúdo, não pelo nome —
-- robusto mesmo se o nome auto-gerado divergir entre ambientes.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.convenio_entity_referrals'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.convenio_entity_referrals DROP CONSTRAINT %I;', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.convenio_entity_referrals
  ADD CONSTRAINT convenio_entity_referrals_status_check CHECK (status IN (
    'novo', 'em_analise', 'contatado', 'documentacao_pendente',
    'aprovado', 'recusado', 'convertido_convenio'
  ));

COMMENT ON CONSTRAINT convenio_entity_referrals_status_check ON public.convenio_entity_referrals IS
'Funil do Painel de Indicações do Gestor: novo → em_analise → contatado → documentacao_pendente → aprovado/recusado → convertido_convenio.';

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ convenio_entity_referrals: CHECK de status estendido (documentacao_pendente, convertido_convenio); INSERT público e auditoria inalterados.';
END $$;
