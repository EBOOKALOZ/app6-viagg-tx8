-- ═══════════════════════════════════════════════════════════════
-- RIDV v2 — Revisão manual por administrador (RPC SECURITY DEFINER)
--
-- Problema: o trigger de blindagem (handle_ridv_v2_universal_queue)
-- reverte QUALQUER mudança de moderation_status feita pelo front —
-- inclusive a de um admin. Sem créditos de IA, todo anúncio novo cai
-- em 'pending_ai_analysis'/'manual_review' e fica invisível para
-- sempre, sem caminho de aprovação humana.
--
-- Solução:
--   1) Trigger passa a aceitar um override transacional
--      (GUC ridv.manual_override='on'), que SÓ as RPCs daqui ligam.
--   2) ridv_manual_review(tabela, id, decisao, motivo): admin aprova
--      ('manual_approved' → entra nas views públicas) ou rejeita
--      ('blocked'), com auditoria em ridv_decisions_log + evento ORION.
--   3) ridv_fila_revisao(): lista os anúncios pendentes das 9 tabelas.
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- 1) Trigger de blindagem com override transacional auditado
CREATE OR REPLACE FUNCTION public.handle_ridv_v2_universal_queue()
RETURNS trigger AS $$
BEGIN
  -- service_role (Edge Functions / IA) e as RPCs de revisão manual
  -- (que ligam ridv.manual_override apenas durante o UPDATE) passam direto
  IF current_setting('role', true) = 'service_role'
     OR current_setting('ridv.manual_override', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.moderation_status := 'pending_ai_analysis';
    NEW.ai_status := 'queued';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status AND OLD.moderation_status IS NOT NULL THEN
      NEW.moderation_status := OLD.moderation_status;
    END IF;
    IF NEW.ai_status IS DISTINCT FROM OLD.ai_status AND OLD.ai_status IS NOT NULL THEN
      NEW.ai_status := OLD.ai_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2) RPC de decisão manual (só admin)
CREATE OR REPLACE FUNCTION public.ridv_manual_review(
  p_tabela  text,
  p_id      uuid,
  p_decisao text,               -- 'aprovar' | 'rejeitar'
  p_motivo  text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tabelas   text[] := ARRAY['real_estate_listings','vehicle_listings','travel_listings',
                              'freight_listings','service_listings','product_listings',
                              'advertiser_listings','marketplace_products','auction_listings'];
  v_categoria text;
  v_status    text;
  v_rows      int;
BEGIN
  IF NOT mp_is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem revisar anúncios';
  END IF;
  IF NOT (p_tabela = ANY (v_tabelas)) THEN
    RAISE EXCEPTION 'Tabela inválida: %', p_tabela;
  END IF;
  IF p_decisao NOT IN ('aprovar','rejeitar') THEN
    RAISE EXCEPTION 'Decisão inválida: % (use aprovar/rejeitar)', p_decisao;
  END IF;

  v_status := CASE WHEN p_decisao = 'aprovar' THEN 'manual_approved' ELSE 'blocked' END;
  v_categoria := CASE p_tabela
    WHEN 'real_estate_listings' THEN 'real_estate'
    WHEN 'vehicle_listings'     THEN 'vehicle'
    WHEN 'travel_listings'      THEN 'travel'
    WHEN 'freight_listings'     THEN 'freight'
    WHEN 'service_listings'     THEN 'service'
    WHEN 'auction_listings'     THEN 'auction'
    ELSE 'product'
  END;

  -- override transacional: o trigger de blindagem deixa esta escrita passar
  PERFORM set_config('ridv.manual_override', 'on', true);
  EXECUTE format(
    'UPDATE public.%I SET moderation_status = $1, ai_status = ''manual'',
            moderation_reason = coalesce($2, moderation_reason),
            reviewed_by = $3, reviewed_at = now()
     WHERE id = $4', p_tabela)
  USING v_status, p_motivo, auth.uid(), p_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('ridv.manual_override', 'off', true);

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Anúncio % não encontrado em %', p_id, p_tabela;
  END IF;

  -- auditoria
  INSERT INTO public.ridv_decisions_log
    (listing_id, category, content_type, status, reason, verdict, ai_provider,
     reviewed_by, reviewed_at, metadata)
  VALUES
    (p_id, v_categoria, 'text',
     CASE WHEN p_decisao = 'aprovar' THEN 'approved' ELSE 'blocked' END,
     coalesce(p_motivo, 'Revisão manual por administrador'),
     'manual', 'human/manual-review', auth.uid(), now(),
     jsonb_build_object('tabela', p_tabela, 'decisao', p_decisao));

  -- evento no sistema nervoso ORION (best-effort)
  BEGIN
    INSERT INTO public.orion_eventos (tipo, origem, dados)
    VALUES ('anuncio_revisado_manual', 'ridv_manual_review',
            jsonb_build_object('tabela', p_tabela, 'listing_id', p_id,
                               'decisao', p_decisao, 'status', v_status));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'tabela', p_tabela, 'id', p_id,
                            'novo_status', v_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ridv_manual_review(text, uuid, text, text) TO authenticated;

-- 3) Fila de revisão manual (só admin) — varre as 9 tabelas
CREATE OR REPLACE FUNCTION public.ridv_fila_revisao(p_limite int DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tabelas   text[] := ARRAY['real_estate_listings','vehicle_listings','travel_listings',
                              'freight_listings','service_listings','product_listings',
                              'advertiser_listings','marketplace_products','auction_listings'];
  t           text;
  col_titulo  text;
  col_cidade  text;
  col_criado  text;
  parte       jsonb;
  resultado   jsonb := '[]'::jsonb;
BEGIN
  IF NOT mp_is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem ver a fila de revisão';
  END IF;

  FOREACH t IN ARRAY v_tabelas LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t);

    -- colunas variam por módulo: detecta título/cidade/criação disponíveis
    col_titulo := NULL; col_cidade := NULL; col_criado := NULL;
    SELECT column_name INTO col_titulo FROM information_schema.columns
     WHERE table_schema='public' AND table_name=t
       AND column_name = ANY (ARRAY['title','name','property_type','model'])
     ORDER BY array_position(ARRAY['title','name','property_type','model'], column_name) LIMIT 1;
    SELECT column_name INTO col_cidade FROM information_schema.columns
     WHERE table_schema='public' AND table_name=t
       AND column_name = ANY (ARRAY['city','cidade'])
     ORDER BY array_position(ARRAY['city','cidade'], column_name) LIMIT 1;
    SELECT column_name INTO col_criado FROM information_schema.columns
     WHERE table_schema='public' AND table_name=t
       AND column_name = ANY (ARRAY['created_at','criado_em'])
     ORDER BY array_position(ARRAY['created_at','criado_em'], column_name) LIMIT 1;

    EXECUTE format(
      'SELECT coalesce(jsonb_agg(jsonb_build_object(
         ''tabela'', %L, ''id'', x.id, ''titulo'', %s, ''cidade'', %s,
         ''status'', x.moderation_status, ''ai_status'', x.ai_status,
         ''motivo'', x.moderation_reason, ''criado_em'', %s)), ''[]''::jsonb)
       FROM (SELECT * FROM public.%I
             WHERE moderation_status IN (''pending_ai_analysis'',''manual_review'')
             LIMIT %s) x',
      t,
      CASE WHEN col_titulo IS NULL THEN 'NULL' ELSE format('x.%I::text', col_titulo) END,
      CASE WHEN col_cidade IS NULL THEN 'NULL' ELSE format('x.%I::text', col_cidade) END,
      CASE WHEN col_criado IS NULL THEN 'NULL' ELSE format('x.%I', col_criado) END,
      t, p_limite)
    INTO parte;

    resultado := resultado || parte;
  END LOOP;

  RETURN resultado;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ridv_fila_revisao(int) TO authenticated;
