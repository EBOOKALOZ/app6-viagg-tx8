-- ═══════════════════════════════════════════════════════════════
-- ORION MOBILITY 360° — Fase 1
-- Centro de inteligência dos profissionais (motoboy / moto-táxi /
-- motorista): dashboard executivo, ORION SCORE 0-1000 explicável,
-- antifraude v1 (duplicidades/documentos) e alertas.
-- Aplicada via Management API em 2026-07-13. Idempotente.
-- CPF NUNCA sai em claro: sempre mascarado (LGPD).
-- ═══════════════════════════════════════════════════════════════

-- Registro do índice no catálogo versionado
INSERT INTO orion_indices (sigla, versao, nome, formula, fonte) VALUES
  ('OSCORE', 1, 'ORION SCORE do Profissional',
   'Base 300 + tempo de plataforma (5/dia, cap 150) + entregas concluídas (15 cada, cap 300) - cancelamentos atribuídos (30 cada) + online agora (50) + grupos válidos (20 cada, cap 100) + CNH válida (+100) / vencida (-100). Clamp 0-1000. Níveis: <300 Bronze, <450 Prata, <600 Ouro, <700 Diamante, <800 Elite, <900 Black, <950 Titanium, >=950 Infinity.',
   'motoboy_profiles + driver_profiles + service_orders + whatsapp_groups + profiles')
ON CONFLICT (sigla, versao) DO UPDATE SET formula = EXCLUDED.formula, fonte = EXCLUDED.fonte;

-- ── 1. ORION SCORE por profissional (explicável) ───────────────
CREATE OR REPLACE FUNCTION orion_score_profissionais()
RETURNS TABLE (
  user_id uuid, nome text, categoria text, cidade text, is_online boolean,
  score int, nivel text, breakdown jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION: acesso restrito a administradores'; END IF;
  RETURN QUERY
  WITH profs AS (
    SELECT mp.user_id AS uid, 'motoboy'::text AS cat, mp.is_online AS online,
           mp.created_at, mp.cidade AS cid, NULL::date AS cnh_val
    FROM motoboy_profiles mp
    UNION ALL
    SELECT dp.user_id, 'motorista/moto-táxi', dp.is_online, dp.created_at,
           dp.cidade, dp.cnh_validade
    FROM driver_profiles dp
  ),
  entregas AS (
    SELECT x.uid, count(*) FILTER (WHERE x.st IN ('delivered','completed','finished')) AS ok,
           count(*) FILTER (WHERE x.st ILIKE '%cancel%') AS canc
    FROM (
      SELECT coalesce(so.motoboy_id, so.courier_id) AS uid, so.status::text AS st
      FROM service_orders so WHERE coalesce(so.motoboy_id, so.courier_id) IS NOT NULL
    ) x GROUP BY x.uid
  ),
  grp AS (
    SELECT wg.owner_user_id AS uid, count(*) AS n
    FROM whatsapp_groups wg WHERE wg.valid_for_commission GROUP BY 1
  ),
  calc AS (
    SELECT p.uid, p.cat, p.online, p.cid,
      least(150, (extract(epoch FROM (now() - p.created_at)) / 86400 * 5))::int AS pts_tempo,
      least(300, coalesce(e.ok,0) * 15)::int      AS pts_entregas,
      (coalesce(e.canc,0) * 30)::int              AS pts_cancel,
      CASE WHEN p.online THEN 50 ELSE 0 END       AS pts_online,
      least(100, coalesce(g.n,0) * 20)::int       AS pts_grupos,
      CASE WHEN p.cnh_val IS NULL THEN 0
           WHEN p.cnh_val >= current_date THEN 100 ELSE -100 END AS pts_cnh,
      coalesce(e.ok,0) AS n_entregas, coalesce(e.canc,0) AS n_cancel
    FROM profs p
    LEFT JOIN entregas e ON e.uid = p.uid
    LEFT JOIN grp g ON g.uid = p.uid
  )
  SELECT c.uid, coalesce(pr.name, 'Profissional'), c.cat, c.cid, coalesce(c.online,false),
    greatest(0, least(1000, 300 + c.pts_tempo + c.pts_entregas - c.pts_cancel
                              + c.pts_online + c.pts_grupos + c.pts_cnh))::int AS sc,
    CASE
      WHEN 300 + c.pts_tempo + c.pts_entregas - c.pts_cancel + c.pts_online + c.pts_grupos + c.pts_cnh >= 950 THEN 'Infinity'
      WHEN 300 + c.pts_tempo + c.pts_entregas - c.pts_cancel + c.pts_online + c.pts_grupos + c.pts_cnh >= 900 THEN 'Titanium'
      WHEN 300 + c.pts_tempo + c.pts_entregas - c.pts_cancel + c.pts_online + c.pts_grupos + c.pts_cnh >= 800 THEN 'Black'
      WHEN 300 + c.pts_tempo + c.pts_entregas - c.pts_cancel + c.pts_online + c.pts_grupos + c.pts_cnh >= 700 THEN 'Elite'
      WHEN 300 + c.pts_tempo + c.pts_entregas - c.pts_cancel + c.pts_online + c.pts_grupos + c.pts_cnh >= 600 THEN 'Diamante'
      WHEN 300 + c.pts_tempo + c.pts_entregas - c.pts_cancel + c.pts_online + c.pts_grupos + c.pts_cnh >= 450 THEN 'Ouro'
      WHEN 300 + c.pts_tempo + c.pts_entregas - c.pts_cancel + c.pts_online + c.pts_grupos + c.pts_cnh >= 300 THEN 'Prata'
      ELSE 'Bronze'
    END,
    jsonb_build_object(
      'base', 300, 'tempo_plataforma', c.pts_tempo, 'entregas', c.pts_entregas,
      'entregas_qtd', c.n_entregas, 'cancelamentos', -c.pts_cancel,
      'cancelamentos_qtd', c.n_cancel, 'online_agora', c.pts_online,
      'grupos', c.pts_grupos, 'cnh', c.pts_cnh,
      'indice', 'OSCORE v1 (ver orion_indices)')
  FROM calc c
  LEFT JOIN profiles pr ON pr.id = c.uid
  ORDER BY 6 DESC;
END; $$;

-- ── 2. Dashboard executivo Mobility ────────────────────────────
CREATE OR REPLACE FUNCTION orion_mobility_dashboard()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION: acesso restrito a administradores'; END IF;
  SELECT jsonb_build_object(
    'motoboys', jsonb_build_object(
      'total', (SELECT count(*) FROM motoboy_profiles),
      'online', (SELECT count(*) FROM motoboy_profiles WHERE is_online)),
    'motoristas_mototaxi', jsonb_build_object(
      'total', (SELECT count(*) FROM driver_profiles),
      'online', (SELECT count(*) FROM driver_profiles WHERE is_online),
      'cnh_vencida', (SELECT count(*) FROM driver_profiles WHERE cnh_validade < current_date),
      'cnh_vence_30d', (SELECT count(*) FROM driver_profiles
                        WHERE cnh_validade BETWEEN current_date AND current_date + 30),
      'selfie_pendente', (SELECT count(*) FROM driver_profiles
                          WHERE coalesce(selfie_status,'') NOT IN ('approved','aprovada'))),
    'operacao_30d', jsonb_build_object(
      'pedidos', (SELECT count(*) FROM service_orders WHERE created_at >= now() - interval '30 days'),
      'concluidos', (SELECT count(*) FROM service_orders
                     WHERE created_at >= now() - interval '30 days'
                       AND status::text IN ('delivered','completed','finished')),
      'cancelados', (SELECT count(*) FROM service_orders
                     WHERE created_at >= now() - interval '30 days'
                       AND status::text ILIKE '%cancel%'),
      'corridas_motorista', (SELECT count(*) FROM motorista_corridas
                             WHERE created_at >= now() - interval '30 days'))
  ) INTO r;
  RETURN r;
END; $$;

-- ── 3. Antifraude v1 (duplicidades + documentos; CPF mascarado) ─
CREATE OR REPLACE FUNCTION orion_fraude_scan()
RETURNS TABLE (gravidade text, tipo text, descricao text, recomendacao text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION: acesso restrito a administradores'; END IF;

  -- CPF repetido entre motoboys
  RETURN QUERY
  SELECT 'alta', 'cpf_duplicado_motoboy',
    'CPF ' || left(x.doc, 3) || '.***.***-** usado em ' || x.n || ' cadastros de motoboy.',
    'Revisar os cadastros e suspender os duplicados até validação manual.'
  FROM (
    SELECT coalesce(nullif(cpf,''), nullif(cpf_cnpj,'')) AS doc, count(*) AS n
    FROM motoboy_profiles
    WHERE coalesce(nullif(cpf,''), nullif(cpf_cnpj,'')) IS NOT NULL
    GROUP BY 1 HAVING count(*) > 1
  ) x;

  -- CPF/CNPJ repetido entre motoristas
  RETURN QUERY
  SELECT 'alta', 'cpf_duplicado_motorista',
    'Documento ' || left(x.doc, 3) || '.***.***-** usado em ' || x.n || ' cadastros de motorista/moto-táxi.',
    'Revisar os cadastros e suspender os duplicados até validação manual.'
  FROM (
    SELECT cpf_cnpj AS doc, count(*) AS n FROM driver_profiles
    WHERE coalesce(cpf_cnpj,'') <> '' GROUP BY 1 HAVING count(*) > 1
  ) x;

  -- Mesmo documento nas duas categorias
  RETURN QUERY
  SELECT 'media', 'documento_multicategoria',
    'Documento ' || left(mp.doc, 3) || '.***.***-** cadastrado como motoboy E motorista (perfis distintos).',
    'Verificar se é o mesmo titular operando nas duas categorias (pode ser legítimo).'
  FROM (SELECT DISTINCT coalesce(nullif(cpf,''), nullif(cpf_cnpj,'')) AS doc, user_id FROM motoboy_profiles) mp
  JOIN (SELECT DISTINCT cpf_cnpj AS doc, user_id FROM driver_profiles) dp
    ON dp.doc = mp.doc AND dp.user_id <> mp.user_id
  WHERE coalesce(mp.doc,'') <> '';

  -- CNH vencida
  RETURN QUERY
  SELECT 'alta', 'cnh_vencida',
    'Motorista ' || coalesce(pr.name,'(sem nome)') || ' com CNH vencida desde ' || to_char(dp.cnh_validade,'DD/MM/YYYY') || '.',
    'Bloquear novas corridas até renovação do documento.'
  FROM driver_profiles dp LEFT JOIN profiles pr ON pr.id = dp.user_id
  WHERE dp.cnh_validade < current_date;

  -- Selfie não aprovada
  RETURN QUERY
  SELECT 'media', 'selfie_pendente',
    'Motorista ' || coalesce(pr.name,'(sem nome)') || ' com verificação de selfie "' || coalesce(dp.selfie_status,'não enviada') || '".',
    'Concluir a verificação de identidade antes de liberar operação plena.'
  FROM driver_profiles dp LEFT JOIN profiles pr ON pr.id = dp.user_id
  WHERE coalesce(dp.selfie_status,'') NOT IN ('approved','aprovada');
END; $$;

-- ── 4. Alertas Mobility (documentos + cobertura ao vivo) ───────
CREATE OR REPLACE FUNCTION orion_mobility_alertas()
RETURNS TABLE (severidade text, mensagem text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION: acesso restrito a administradores'; END IF;

  RETURN QUERY
  SELECT 'media',
    'CNH de ' || coalesce(pr.name,'(sem nome)') || ' vence em ' ||
    (dp.cnh_validade - current_date) || ' dia(s) (' || to_char(dp.cnh_validade,'DD/MM/YYYY') || ').'
  FROM driver_profiles dp LEFT JOIN profiles pr ON pr.id = dp.user_id
  WHERE dp.cnh_validade BETWEEN current_date AND current_date + 30;

  IF NOT EXISTS (SELECT 1 FROM motoboy_profiles WHERE is_online)
     AND EXISTS (SELECT 1 FROM service_orders
                 WHERE created_at >= now() - interval '24 hours') THEN
    RETURN QUERY SELECT 'alta',
      'Nenhum motoboy online agora, mas houve pedidos nas últimas 24h — risco de demanda sem atendimento.';
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION orion_score_profissionais()  TO authenticated;
GRANT EXECUTE ON FUNCTION orion_mobility_dashboard()   TO authenticated;
GRANT EXECUTE ON FUNCTION orion_fraude_scan()          TO authenticated;
GRANT EXECUTE ON FUNCTION orion_mobility_alertas()     TO authenticated;
