-- ============================================================
-- MONITORAMENTO CONTÍNUO DE GRUPOS (2026-08-01)
--
-- Regra nova do produto: se um grupo cair abaixo de 60 participantes,
-- ficar inativo/inválido, ou não postar há muito tempo, o sistema
-- deve remover sua pontuação, recalcular a comissão e notificar o
-- profissional.
--
-- Esta migration entrega a RPC que faz essa reavaliação (varre
-- whatsapp_groups e driver_whatsapp_groups, reescreve os campos via
-- UPDATE — que passa pelos triggers de validação já existentes,
-- então cada mudança já gera a linha de auditoria correspondente e já
-- recalcula valid_for_commission/status).
--
-- ATENÇÃO — NÃO agenda via pg_cron: não há confirmação de que a
-- extensão pg_cron está habilitada neste projeto Supabase (não
-- verificável nesta sessão, sem acesso a psql/Postgres). Agendar às
-- cegas poderia falhar silenciosamente ou nunca rodar. Por ora, esta
-- RPC é exposta para chamada sob demanda pelo admin — mesmo padrão já
-- usado hoje pelo botão "Analisar com IA" do Radar IA
-- (radar_reprocess_all). Se o usuário confirmar que pg_cron está
-- disponível, agendar esta chamada é um passo futuro separado
-- (ex.: SELECT cron.schedule('grupos-reavaliacao', '0 3 * * *',
-- 'SELECT public.radar_reavaliar_grupos()')), fora do escopo desta
-- mudança de regras de negócio.
--
-- Notificação ao profissional: este projeto não expôs nesta
-- investigação um sistema de notificação push/e-mail genérico
-- reaproveitável para grupos — a RPC deixa o registro em
-- group_validation_audit_log (fonte para qualquer tela ler o motivo
-- da mudança) e o invalid_reason já visível nas telas de listagem de
-- grupo de cada perfil; conectar a um canal de notificação ativo
-- (push/e-mail) é trabalho adicional não coberto aqui.
--
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.radar_reavaliar_grupos(p_source_table text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_tmp   integer;
BEGIN
  IF NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem executar a reavaliação.';
  END IF;

  IF p_source_table IS NULL OR p_source_table = 'whatsapp_groups' THEN
    -- Toca (UPDATE no-op funcional, só para reexecutar o trigger) todo
    -- grupo aprovado/ativo que caiu abaixo do piso ou está sem postar
    -- há 60+ dias — o trigger enforce_group_validity() já recalcula
    -- validation_status/valid_for_commission/invalid_reason e grava
    -- auditoria.
    UPDATE public.whatsapp_groups
       SET updated_at = now()
     WHERE is_active = true
       AND validation_status IN ('approved', 'aguardando_qualificacao')
       AND (
         COALESCE(members_count, 0) < public.min_group_members()
         OR last_posted_at IS NULL
         OR last_posted_at < now() - INTERVAL '60 days'
       );
    GET DIAGNOSTICS v_tmp = ROW_COUNT;
    v_count := v_count + v_tmp;
  END IF;

  IF p_source_table IS NULL OR p_source_table = 'driver_whatsapp_groups' THEN
    UPDATE public.driver_whatsapp_groups
       SET updated_at = now()
     WHERE is_active = true
       AND validation_status IN ('approved', 'aguardando_qualificacao')
       AND COALESCE(members_count, 0) < public.min_group_members();
    GET DIAGNOSTICS v_tmp = ROW_COUNT;
    v_count := v_count + v_tmp;
  END IF;

  -- Recalcula comissão de todos os donos tocados nesta execução
  IF p_source_table IS NULL OR p_source_table = 'whatsapp_groups' THEN
    PERFORM public.recalc_user_commission(owner_user_id)
      FROM public.whatsapp_groups
     WHERE updated_at > now() - INTERVAL '1 minute'
     GROUP BY owner_user_id;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.radar_reavaliar_grupos(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.radar_reavaliar_grupos(text) TO authenticated;
