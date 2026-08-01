-- ============================================================
-- TRANSFERÊNCIA DE GRUPO ENTRE PROFISSIONAIS — ADMIN (2026-08-01)
--
-- Regra nova do produto: administradores podem transferir um grupo de
-- um profissional para outro, mediante registro em auditoria. Nenhuma
-- transferência pode ocorrer sem liberar o vínculo anterior.
--
-- Hoje não existe nenhuma RPC de transferência — o único caminho era
-- indireto (dono desativa, outro cadastra do zero, perde histórico).
--
-- Esta RPC troca o dono diretamente numa única transação: o UPDATE
-- dispara o trigger de validação (enforce_group_validity /
-- enforce_group_validity_driver), que já revalida o piso de membros e
-- atualiza o registry (active_group_links) via
-- ON CONFLICT (source_table, source_id) DO UPDATE — troca o
-- owner_user_id no mesmo UPSERT, sem precisar desativar-depois-ativar
-- em dois passos. O vínculo anterior é liberado automaticamente pelo
-- próprio mecanismo do registry (não sobra ninguém "dono" duas vezes).
--
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_transfer_group(
  p_source_table text,
  p_group_id     uuid,
  p_to_user_id   uuid,
  p_notes        text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_user_id uuid;
  v_members      integer;
BEGIN
  IF NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem transferir grupos.';
  END IF;

  IF p_source_table NOT IN ('whatsapp_groups', 'driver_whatsapp_groups') THEN
    RAISE EXCEPTION 'Tabela de origem inválida: %', p_source_table;
  END IF;

  IF p_source_table = 'whatsapp_groups' THEN
    SELECT owner_user_id, members_count INTO v_from_user_id, v_members
      FROM public.whatsapp_groups WHERE id = p_group_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Grupo não encontrado em whatsapp_groups: %', p_group_id;
    END IF;

    UPDATE public.whatsapp_groups
       SET owner_user_id = p_to_user_id
     WHERE id = p_group_id;

  ELSIF p_source_table = 'driver_whatsapp_groups' THEN
    SELECT user_id, members_count INTO v_from_user_id, v_members
      FROM public.driver_whatsapp_groups WHERE id = p_group_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Grupo não encontrado em driver_whatsapp_groups: %', p_group_id;
    END IF;

    UPDATE public.driver_whatsapp_groups
       SET user_id = p_to_user_id
     WHERE id = p_group_id;
  END IF;

  INSERT INTO public.group_validation_audit_log
    (source_table, source_id, owner_user_id, members_count_at_check, validation_result, reason, triggered_by)
  VALUES (
    p_source_table, p_group_id, p_to_user_id, v_members, 'aprovado',
    format('Transferência de %s para %s. Notas: %s', v_from_user_id, p_to_user_id, COALESCE(p_notes, '-')),
    'admin'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'source_table', p_source_table,
    'group_id', p_group_id,
    'from_user_id', v_from_user_id,
    'to_user_id', p_to_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_transfer_group(text, uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_transfer_group(text, uuid, uuid, text) TO authenticated;
