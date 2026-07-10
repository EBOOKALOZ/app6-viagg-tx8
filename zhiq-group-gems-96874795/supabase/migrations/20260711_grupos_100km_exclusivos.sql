-- ============================================================
-- GRUPOS WHATSAPP: RAIO DE 100 KM + EXCLUSIVIDADE (2026-07-11)
--
-- Regras novas (pedido do produto):
--  1. O profissional só pode vincular grupos DENTRO de um raio de
--     100 km da base dele (residência do cadastro). Fora → recusado
--     na hora, com a distância na mensagem.
--  2. Um grupo (link) ativo é EXCLUSIVO de um profissional. Só quando
--     o dono atual sai (desativa) é que outro pode vincular o mesmo
--     grupo. Garantido por índice único parcial + mensagem amigável
--     no trigger.
--  3. Localização confirmada passa a ser requisito para o grupo
--     CONTAR na comissão (sem coords → não conta, com motivo claro).
--     Regras já existentes mantidas: aprovado + ativo + 90+ membros
--     + postagem nos últimos 30 dias.
--
-- Estado no momento: 5 grupos, todos INATIVOS, 0 contando — sem
-- legado a preservar. Idempotente.
-- ============================================================

-- Coordenadas do grupo (o front geocodifica a cidade/bairro no cadastro)
ALTER TABLE public.whatsapp_groups
  ADD COLUMN IF NOT EXISTS latitude  double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

-- Exclusividade à prova de corrida: 1 link ativo por vez na plataforma
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_groups_link_ativo
  ON public.whatsapp_groups (lower(trim(group_link)))
  WHERE is_active = true AND group_link IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_group_validity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_approved     boolean;
  v_is_active       boolean;
  v_has_members     boolean;
  v_posted_recently boolean;
  v_has_coords      boolean;
  v_base_lat        double precision;
  v_base_lng        double precision;
  v_dist            numeric;
BEGIN
  -- ── REGRA 0a: EXCLUSIVIDADE — um link só pode estar ativo com UM
  --    profissional. Liberou (desativou), outro pode usar.
  IF COALESCE(NEW.is_active, false)
     AND NEW.group_link IS NOT NULL AND trim(NEW.group_link) <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.whatsapp_groups g
       WHERE g.id IS DISTINCT FROM NEW.id
         AND g.is_active = true
         AND lower(trim(g.group_link)) = lower(trim(NEW.group_link))
    ) THEN
      RAISE EXCEPTION 'Este grupo já está ativo com outro profissional. Ele só fica disponível se o profissional atual sair (desativar o grupo).';
    END IF;
  END IF;

  -- ── REGRA 0b: RAIO DE 100 KM da base do profissional (residência do
  --    cadastro). Com as duas coordenadas conhecidas e distância > 100 km,
  --    o vínculo é RECUSADO (não é área de atuação dele).
  SELECT mp.latitude_residencia, mp.longitude_residencia
    INTO v_base_lat, v_base_lng
    FROM public.motoboy_profiles mp
   WHERE mp.user_id = NEW.owner_user_id
   LIMIT 1;

  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL
     AND v_base_lat IS NOT NULL AND v_base_lng IS NOT NULL THEN
    v_dist := 6371 * acos(LEAST(1.0,
        cos(radians(v_base_lat)) * cos(radians(NEW.latitude))
        * cos(radians(NEW.longitude) - radians(v_base_lng))
        + sin(radians(v_base_lat)) * sin(radians(NEW.latitude))));
    IF v_dist > 100 THEN
      RAISE EXCEPTION 'Grupo fora da sua área de atuação: ~% km da sua base (limite: 100 km).', round(v_dist);
    END IF;
  END IF;

  -- ── Regras originais de validade ──
  v_is_approved     := (NEW.validation_status = 'approved');
  v_is_active       := COALESCE(NEW.is_active, false);
  v_has_members     := COALESCE(NEW.members_count, 0) >= 90;
  v_posted_recently := (
    NEW.last_posted_at IS NOT NULL
    AND (now() - NEW.last_posted_at) <= INTERVAL '30 days'
  );
  v_has_coords      := (NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL);

  -- REGRA 1: Se não aprovado, forçar tudo inativo
  IF NOT v_is_approved THEN
    NEW.is_active := false;
    NEW.is_valid := false;
    NEW.valid_for_commission := false;
    RETURN NEW;
  END IF;

  -- REGRA 2: Se aprovado mas não ativo, não é válido
  IF NOT v_is_active THEN
    NEW.is_valid := false;
    NEW.valid_for_commission := false;
    RETURN NEW;
  END IF;

  -- REGRA 3: Aprovado + Ativo → is_valid = true
  NEW.is_valid := true;

  -- REGRA 4: valid_for_commission exige TODAS as condições:
  --   approved + active + 90+ membros + postou em 30 dias + LOCALIZAÇÃO
  --   confirmada (dentro do raio — fora nem chega aqui, é recusado acima)
  NEW.valid_for_commission := (v_has_members AND v_posted_recently AND v_has_coords);

  -- Motivo claro quando o grupo não conta (aparece na lista do motoboy)
  IF NOT NEW.valid_for_commission THEN
    NEW.invalid_reason := CASE
      WHEN NOT v_has_members     THEN 'Grupo precisa de 90+ membros para contar na comissão'
      WHEN NOT v_posted_recently THEN 'Sem postagem nos últimos 30 dias'
      WHEN NOT v_has_coords      THEN 'Localização do grupo não confirmada'
      ELSE NEW.invalid_reason
    END;
  ELSE
    NEW.invalid_reason := NULL;
  END IF;

  RETURN NEW;
END;
$function$;
