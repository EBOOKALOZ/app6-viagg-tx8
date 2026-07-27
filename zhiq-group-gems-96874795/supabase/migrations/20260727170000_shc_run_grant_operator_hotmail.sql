-- ============================================================================
-- SHC / RLS shc_runs — atribuição de papel via RBAC (auditoria 2026-07-27)
--
-- Causa raiz do "Acesso negado (RLS shc_runs)" no painel: a sessão ativa do
-- navegador era angelo_zanatta@hotmail.com (12921e5d-4632-49b7-82fe-de937f383553),
-- conta SEM is_admin (user_roles/profiles) e SEM papel em user_role_assignments.
-- A conta admin é angelozanatta100@gmail.com (a9bac866-82c1-459f-b066-25fd8032895b),
-- que passa em todos os testes de RLS. As policies e funções estão corretas e
-- NÃO são alteradas aqui.
--
-- Correção de privilégio mínimo: papel 'operator' (concede shc:run — iniciar e
-- atualizar execuções; DELETE continua admin-only) para a conta hotmail.
-- Idempotente e reversível (basta remover a linha de user_role_assignments).
-- ============================================================================

INSERT INTO public.user_role_assignments (user_id, role_id, assigned_by, notes)
SELECT '12921e5d-4632-49b7-82fe-de937f383553'::uuid,
       sr.id,
       'a9bac866-82c1-459f-b066-25fd8032895b'::uuid,
       'shc:run para conta hotmail do administrador — auditoria RLS 2026-07-27'
FROM public.system_roles sr
WHERE sr.name = 'operator'
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_role_assignments ura
    WHERE ura.user_id = '12921e5d-4632-49b7-82fe-de937f383553'::uuid
      AND ura.role_id = sr.id
  );
