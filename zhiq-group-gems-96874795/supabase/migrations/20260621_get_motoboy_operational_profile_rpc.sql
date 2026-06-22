-- ═══════════════════════════════════════════════════════════════
-- Leitura do Perfil Operacional do motoboy via RPC SECURITY DEFINER.
-- A leitura direta de motoboy_profiles pelo cliente estava voltando
-- vazia (mesma causa-raiz do bloqueio de RLS já visto na escrita),
-- fazendo a tela parecer "apagada" mesmo com o dado salvo no banco.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.get_motoboy_operational_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
begin
  if v_uid is null then
    return null;
  end if;

  select * into v_row
  from public.motoboy_profiles
  where user_id = v_uid;

  if not found then
    return null;
  end if;

  return to_jsonb(v_row);
end;
$$;

grant execute on function public.get_motoboy_operational_profile() to authenticated;
