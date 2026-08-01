-- ============================================================
-- DRIVER_WHATSAPP_GROUPS: evolução ao padrão robusto (2026-08-01)
--
-- Hoje driver_whatsapp_groups (Motorista) é uma tabela simples: sem
-- members_count, sem exclusividade, sem trigger de validação — bem
-- mais fraca que whatsapp_groups (Motoboy/Moto-Táxi). A nova regra de
-- negócio (piso de 60 membros + exclusividade cross-perfil) exige
-- equipará-la.
--
-- A coluna `status` (CHECK em_analise/ativo/inativo/rejeitado) É
-- MANTIDA e passa a ser espelhada por trigger a partir de
-- validation_status + is_active (migration
-- 20260801_enforce_group_validity_min60.sql) — preserva compatibi-
-- lidade com src/components/driver/DriverWhatsAppGroups.tsx, que lê
-- `status` hoje.
--
-- Legado: linhas existentes não têm members_count real (a plataforma
-- nunca coletou esse dado para Motorista). Não fabricamos um número —
-- members_count fica NULL e todo legado com status='ativo' é
-- reclassificado como validation_status='aguardando_qualificacao'
-- (força requalificação real com o dado correto, em vez de herdar uma
-- aprovação que nunca foi validada pelo piso novo, ou reprovar sem
-- nenhuma base). Isso é consistente com o mesmo raciocínio já usado
-- na migration 20260712_radar_minimo_91_membros.sql para
-- whatsapp_groups (que reclassificou legado abaixo do piso).
--
-- Idempotente.
-- ============================================================

ALTER TABLE public.driver_whatsapp_groups
  ADD COLUMN IF NOT EXISTS members_count integer,
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'aguardando_qualificacao',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS valid_for_commission boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invalid_reason text,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS group_whatsapp_id text,
  ADD COLUMN IF NOT EXISTS group_hash text,
  ADD COLUMN IF NOT EXISTS admin_phone text;

-- Backfill: is_active espelha o status atual; todo legado 'ativo' vira
-- aguardando_qualificacao (sem members_count real para validar contra
-- o piso novo). Demais status mantêm validation_status default.
UPDATE public.driver_whatsapp_groups
   SET is_active = (status = 'ativo'),
       validation_status = CASE
         WHEN status = 'ativo' THEN 'aguardando_qualificacao'
         WHEN status = 'rejeitado' THEN 'reprovado'
         ELSE 'aguardando_qualificacao'
       END,
       invalid_reason = CASE
         WHEN status = 'ativo' THEN 'Aguardando qualificação: informe a quantidade de membros (mínimo 60)'
         ELSE invalid_reason
       END
 WHERE validation_status = 'aguardando_qualificacao'; -- só toca linhas ainda não migradas (idempotente)
