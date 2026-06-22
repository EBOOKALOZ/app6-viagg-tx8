-- ═══════════════════════════════════════════════════════════════
-- Completar onboarding do motoboy via RPC SECURITY DEFINER.
-- Evita depender de policies de RLS em motoboy_profiles/profiles no
-- caminho de escrita do cliente (estava bloqueando com "new row
-- violates row-level security policy for table motoboy_profiles").
-- ═══════════════════════════════════════════════════════════════

create or replace function public.complete_motoboy_onboarding(
  p_whatsapp text,
  p_cidade text,
  p_estado text,
  p_veiculo_modelo text,
  p_veiculo_placa text,
  p_veiculo_cor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  update public.motoboy_profiles
  set
    whatsapp = p_whatsapp,
    cidade = p_cidade,
    estado = p_estado,
    veiculo_modelo = p_veiculo_modelo,
    veiculo_placa = upper(p_veiculo_placa),
    veiculo_cor = p_veiculo_cor
  where user_id = v_uid;

  if not found then
    insert into public.motoboy_profiles (
      user_id, whatsapp, cidade, estado,
      veiculo_modelo, veiculo_placa, veiculo_cor,
      is_approved, is_online
    )
    values (
      v_uid, p_whatsapp, p_cidade, p_estado,
      p_veiculo_modelo, upper(p_veiculo_placa), p_veiculo_cor,
      true, true
    );
  end if;

  update public.profiles
  set cidade = p_cidade, estado = p_estado, whatsapp = p_whatsapp
  where id = v_uid;

  perform public.complete_profile_onboarding('motoboy');

  return jsonb_build_object('success', true);
exception
  when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;
