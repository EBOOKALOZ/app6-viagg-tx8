-- ═══════════════════════════════════════════════════════════════
-- REGRA GLOBAL — IA Operacional: estatísticas de profissionais
-- para o chat responder com dados vivos, por camada de permissão.
-- SOMENTE AGREGADOS — nunca CPF/RG/endereço/telefone/e-mail/PIX/
-- dados bancários (LGPD). Bloco extra apenas para admins.
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Sistema nervoso: cadastros de profissionais viram eventos ─
DROP TRIGGER IF EXISTS orion_ev_cad_motoboy ON motoboy_profiles;
CREATE TRIGGER orion_ev_cad_motoboy AFTER INSERT ON motoboy_profiles
  FOR EACH ROW EXECUTE FUNCTION orion_tg_evento('profissional_cadastrado');

DROP TRIGGER IF EXISTS orion_ev_cad_driver ON driver_profiles;
CREATE TRIGGER orion_ev_cad_driver AFTER INSERT ON driver_profiles
  FOR EACH ROW EXECUTE FUNCTION orion_tg_evento('profissional_cadastrado');

-- ── 2. Estatísticas agregadas para o chat (todas as camadas) ────
CREATE OR REPLACE FUNCTION ia_stats_profissionais(p_pergunta text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nome text; v_norm text;
  v_base jsonb; v_cidade jsonb; v_admin jsonb;
  v_self_total bigint; v_self_ok bigint;
BEGIN
  -- cidade citada na pergunta (casa contra os 5.571 municípios)
  IF length(coalesce(p_pergunta,'')) >= 4 THEN
    SELECT m.nome, m.nome_norm INTO v_nome, v_norm
    FROM orion_municipios m
    WHERE length(m.nome_norm) >= 4
      AND orion_norm(p_pergunta) LIKE '%' || m.nome_norm || '%'
    ORDER BY length(m.nome_norm) DESC LIMIT 1;
  END IF;

  -- Camada PÚBLICA: disponibilidade de serviço (agregados, sem dados pessoais)
  v_base := jsonb_build_object(
    'motoboys_total',  (SELECT count(*) FROM motoboy_profiles),
    'motoboys_online', (SELECT count(*) FROM motoboy_profiles WHERE is_online),
    'motoristas_mototaxi_total',  (SELECT count(*) FROM driver_profiles),
    'motoristas_mototaxi_online', (SELECT count(*) FROM driver_profiles WHERE is_online),
    'cadastros_hoje',
      (SELECT count(*) FROM motoboy_profiles WHERE created_at >= date_trunc('day', now())) +
      (SELECT count(*) FROM driver_profiles  WHERE created_at >= date_trunc('day', now())),
    'cadastros_7d',
      (SELECT count(*) FROM motoboy_profiles WHERE created_at >= now() - interval '7 days') +
      (SELECT count(*) FROM driver_profiles  WHERE created_at >= now() - interval '7 days'),
    'entregas_hoje',
      (SELECT count(*) FROM service_orders
       WHERE created_at >= date_trunc('day', now())
         AND status::text IN ('delivered','completed','finished')),
    'cidades_com_profissionais',
      (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT initcap(orion_norm(t.cidade)) AS cidade, count(*) AS profissionais
        FROM (SELECT cidade FROM motoboy_profiles
              UNION ALL SELECT cidade FROM driver_profiles) t
        WHERE coalesce(t.cidade,'') <> ''
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10) x)
  );

  IF v_norm IS NOT NULL THEN
    v_cidade := jsonb_build_object(
      'cidade', v_nome,
      'motoboys_total',  (SELECT count(*) FROM motoboy_profiles  WHERE orion_norm(cidade) = v_norm),
      'motoboys_online', (SELECT count(*) FROM motoboy_profiles  WHERE orion_norm(cidade) = v_norm AND is_online),
      'motoristas_total',  (SELECT count(*) FROM driver_profiles WHERE orion_norm(cidade) = v_norm),
      'motoristas_online', (SELECT count(*) FROM driver_profiles WHERE orion_norm(cidade) = v_norm AND is_online));
    v_base := v_base || jsonb_build_object('cidade', v_cidade);
  END IF;

  -- Camada ADMIN: indicadores de gestão (aprovações, documentos)
  IF mp_is_admin() THEN
    SELECT count(*), count(*) FILTER (WHERE coalesce(selfie_status,'') IN ('approved','aprovada'))
      INTO v_self_total, v_self_ok FROM driver_profiles;
    v_admin := jsonb_build_object(
      'aprovacao_pendente', (SELECT count(*) FROM driver_profiles
                             WHERE coalesce(selfie_status,'') NOT IN ('approved','aprovada')),
      'cnh_vencida', (SELECT count(*) FROM driver_profiles WHERE cnh_validade < current_date),
      'taxa_aprovacao_pct', CASE WHEN v_self_total > 0
                                 THEN round(100.0 * v_self_ok / v_self_total, 1) ELSE NULL END);
    v_base := v_base || jsonb_build_object('admin', v_admin);
  END IF;

  RETURN v_base;
END; $$;

GRANT EXECUTE ON FUNCTION ia_stats_profissionais(text) TO anon, authenticated;
