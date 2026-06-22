-- ═══════════════════════════════════════════════════════════════
-- Salvar o Perfil Operacional do motoboy (tela /motoboy/profile) via
-- RPC SECURITY DEFINER. Evita depender das policies de RLS de
-- motoboy_profiles no caminho de escrita do cliente — mesmo erro já
-- visto e contornado em complete_motoboy_onboarding: "new row
-- violates row-level security policy for table motoboy_profiles".
-- ═══════════════════════════════════════════════════════════════

create or replace function public.update_motoboy_operational_profile(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
  v_has_region boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'motoboy_profiles' and column_name = 'region_id'
  ) into v_has_region;

  update public.motoboy_profiles set
    whatsapp = p_fields->>'whatsapp',
    cpf_cnpj = p_fields->>'cpf_cnpj',
    cidade = p_fields->>'cidade',
    estado = p_fields->>'estado',
    bairro = p_fields->>'bairro',
    veiculo_placa = p_fields->>'veiculo_placa',
    veiculo_marca = p_fields->>'veiculo_marca',
    veiculo_modelo = p_fields->>'veiculo_modelo',
    veiculo_ano = nullif(p_fields->>'veiculo_ano', '')::int,
    veiculo_cor = p_fields->>'veiculo_cor',
    capacidade_bag = nullif(p_fields->>'capacidade_bag', ''),
    capacidade_garupa = nullif(p_fields->>'capacidade_garupa', ''),
    latitude_residencia = nullif(p_fields->>'latitude_residencia', '')::double precision,
    longitude_residencia = nullif(p_fields->>'longitude_residencia', '')::double precision,
    endereco_residencia = p_fields->>'endereco_residencia',
    updated_at = now()
  where user_id = v_uid
  returning * into v_row;

  if not found then
    if v_has_region then
      insert into public.motoboy_profiles (
        user_id, whatsapp, cpf_cnpj, cidade, estado, bairro,
        veiculo_placa, veiculo_marca, veiculo_modelo, veiculo_ano, veiculo_cor,
        capacidade_bag, capacidade_garupa,
        latitude_residencia, longitude_residencia, endereco_residencia,
        region_id
      )
      values (
        v_uid,
        p_fields->>'whatsapp', p_fields->>'cpf_cnpj', p_fields->>'cidade', p_fields->>'estado', p_fields->>'bairro',
        p_fields->>'veiculo_placa', p_fields->>'veiculo_marca', p_fields->>'veiculo_modelo',
        nullif(p_fields->>'veiculo_ano', '')::int, p_fields->>'veiculo_cor',
        nullif(p_fields->>'capacidade_bag', ''), nullif(p_fields->>'capacidade_garupa', ''),
        nullif(p_fields->>'latitude_residencia', '')::double precision, nullif(p_fields->>'longitude_residencia', '')::double precision, p_fields->>'endereco_residencia',
        'fe784974-f428-45a0-8d67-c09bdb33c5ca'
      )
      returning * into v_row;
    else
      insert into public.motoboy_profiles (
        user_id, whatsapp, cpf_cnpj, cidade, estado, bairro,
        veiculo_placa, veiculo_marca, veiculo_modelo, veiculo_ano, veiculo_cor,
        capacidade_bag, capacidade_garupa,
        latitude_residencia, longitude_residencia, endereco_residencia
      )
      values (
        v_uid,
        p_fields->>'whatsapp', p_fields->>'cpf_cnpj', p_fields->>'cidade', p_fields->>'estado', p_fields->>'bairro',
        p_fields->>'veiculo_placa', p_fields->>'veiculo_marca', p_fields->>'veiculo_modelo',
        nullif(p_fields->>'veiculo_ano', '')::int, p_fields->>'veiculo_cor',
        nullif(p_fields->>'capacidade_bag', ''), nullif(p_fields->>'capacidade_garupa', ''),
        nullif(p_fields->>'latitude_residencia', '')::double precision, nullif(p_fields->>'longitude_residencia', '')::double precision, p_fields->>'endereco_residencia'
      )
      returning * into v_row;
    end if;
  end if;

  -- Mantém profiles.cidade/estado em sincronia (painel admin de distribuição
  -- regional lê daqui, não de motoboy_profiles).
  update public.profiles
  set
    cidade = coalesce(p_fields->>'cidade', cidade),
    estado = coalesce(p_fields->>'estado', estado)
  where id = v_uid;

  return to_jsonb(v_row);
end;
$$;

grant execute on function public.update_motoboy_operational_profile(jsonb) to authenticated;
