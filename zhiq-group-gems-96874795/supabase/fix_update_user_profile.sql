-- =====================================================================
-- RPC: update_user_profile
-- Atualiza dados pessoais em profiles usando SECURITY DEFINER
-- para contornar problemas de RLS
-- =====================================================================

CREATE OR REPLACE FUNCTION public.update_user_profile(
  p_name text DEFAULT NULL,
  p_cpf text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_estado_civil text DEFAULT NULL,
  p_cidade text DEFAULT NULL,
  p_estado text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_data_nascimento date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result jsonb;
BEGIN
  -- Pega o user_id do token JWT
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado');
  END IF;

  -- Atualiza o perfil
  UPDATE public.profiles
  SET
    name           = COALESCE(p_name, name),
    cpf            = COALESCE(p_cpf, cpf),
    telefone       = COALESCE(p_telefone, telefone),
    estado_civil   = COALESCE(p_estado_civil, estado_civil),
    cidade         = COALESCE(p_cidade, cidade),
    estado         = COALESCE(p_estado, estado),
    avatar_url     = COALESCE(p_avatar_url, avatar_url),
    data_nascimento = COALESCE(p_data_nascimento, data_nascimento),
    updated_at     = now()
  WHERE id = v_user_id;

  -- Se não encontrou linha, insere
  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, name, cpf, telefone, estado_civil, cidade, estado, avatar_url, data_nascimento)
    VALUES (v_user_id, p_name, p_cpf, p_telefone, p_estado_civil, p_cidade, p_estado, p_avatar_url, p_data_nascimento);
  END IF;

  -- Retorna dados atualizados
  SELECT jsonb_build_object(
    'success', true,
    'id', p.id,
    'name', p.name,
    'cpf', p.cpf,
    'telefone', p.telefone,
    'estado_civil', p.estado_civil,
    'cidade', p.cidade,
    'estado', p.estado,
    'data_nascimento', p.data_nascimento
  ) INTO v_result
  FROM public.profiles p
  WHERE p.id = v_user_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_profile(text, text, text, text, text, text, text, date) TO authenticated;
