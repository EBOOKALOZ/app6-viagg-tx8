-- ═══════════════════════════════════════════════════════════════
-- ORION OS — Centro de Inteligência Operacional (Fase 1)
-- Editor Manual de diretrizes (versão/autor/aprovação/rollback),
-- Eventos Operacionais com vigência, Painel Nacional, Índice de
-- Cobertura classificado, Crescimento 30d e Oferta×Demanda.
-- Banco da plataforma = única fonte oficial (nada é duplicado).
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. EDITOR MANUAL: diretrizes operacionais versionadas ──────
CREATE TABLE IF NOT EXISTS orion_diretrizes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave       text NOT NULL,                -- agrupa as versões da mesma diretriz
  versao      int  NOT NULL DEFAULT 1,
  tipo        text NOT NULL CHECK (tipo IN
              ('regra','objetivo','prioridade','campanha','meta','politica','cronograma','acao')),
  titulo      text NOT NULL,
  conteudo    text NOT NULL,                -- texto usado pela IA como contexto autorizado
  comentario  text,
  status      text NOT NULL DEFAULT 'rascunho'
              CHECK (status IN ('rascunho','aprovada','arquivada')),
  autor       uuid,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  aprovado_em timestamptz,
  aprovado_por uuid,
  UNIQUE (chave, versao)
);
ALTER TABLE orion_diretrizes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orion_dir_admin ON orion_diretrizes;
CREATE POLICY orion_dir_admin ON orion_diretrizes
  FOR ALL TO authenticated USING (mp_is_admin()) WITH CHECK (mp_is_admin());

-- Salvar = sempre NOVA VERSÃO (histórico completo, nunca sobrescreve)
CREATE OR REPLACE FUNCTION orion_diretriz_salvar(
  p_chave text, p_tipo text, p_titulo text, p_conteudo text, p_comentario text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_chave text; v_versao int; v_id uuid;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION OS: acesso restrito a administradores'; END IF;
  v_chave := coalesce(nullif(trim(p_chave),''),
             lower(regexp_replace(orion_norm(p_titulo), '[^a-z0-9]+', '-', 'g')));
  SELECT coalesce(max(versao),0) + 1 INTO v_versao FROM orion_diretrizes WHERE chave = v_chave;
  INSERT INTO orion_diretrizes (chave, versao, tipo, titulo, conteudo, comentario, autor)
  VALUES (v_chave, v_versao, p_tipo, p_titulo, p_conteudo, p_comentario, auth.uid())
  RETURNING id INTO v_id;
  PERFORM orion_emitir_evento('diretriz_criada', 'orion_os',
    jsonb_build_object('chave', v_chave, 'versao', v_versao, 'tipo', p_tipo));
  RETURN v_id;
END; $$;

-- Aprovar: vira a única versão ativa da chave (anteriores → arquivadas)
CREATE OR REPLACE FUNCTION orion_diretriz_aprovar(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_chave text;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION OS: acesso restrito a administradores'; END IF;
  SELECT chave INTO v_chave FROM orion_diretrizes WHERE id = p_id;
  IF v_chave IS NULL THEN RAISE EXCEPTION 'ORION OS: diretriz não encontrada'; END IF;
  UPDATE orion_diretrizes SET status = 'arquivada'
   WHERE chave = v_chave AND status = 'aprovada' AND id <> p_id;
  UPDATE orion_diretrizes
     SET status = 'aprovada', aprovado_em = now(), aprovado_por = auth.uid()
   WHERE id = p_id;
  PERFORM orion_emitir_evento('diretriz_aprovada', 'orion_os', jsonb_build_object('id', p_id, 'chave', v_chave));
END; $$;

-- Rollback: copia uma versão antiga como NOVA versão já aprovada (auditável)
CREATE OR REPLACE FUNCTION orion_diretriz_rollback(p_chave text, p_versao int)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old orion_diretrizes%ROWTYPE; v_novo uuid;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION OS: acesso restrito a administradores'; END IF;
  SELECT * INTO v_old FROM orion_diretrizes WHERE chave = p_chave AND versao = p_versao;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'ORION OS: versão não encontrada'; END IF;
  v_novo := orion_diretriz_salvar(v_old.chave, v_old.tipo, v_old.titulo, v_old.conteudo,
    'Rollback para a versão ' || p_versao);
  PERFORM orion_diretriz_aprovar(v_novo);
  RETURN v_novo;
END; $$;

-- Diretrizes ativas (contexto autorizado da IA)
CREATE OR REPLACE FUNCTION orion_diretrizes_ativas()
RETURNS TABLE (chave text, versao int, tipo text, titulo text, conteudo text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION OS: acesso restrito a administradores'; END IF;
  RETURN QUERY
  SELECT d.chave, d.versao, d.tipo, d.titulo, d.conteudo
  FROM orion_diretrizes d WHERE d.status = 'aprovada'
  ORDER BY d.tipo, d.titulo;
END; $$;

-- ── 2. EVENTOS OPERACIONAIS (vigência influencia a IA) ─────────
CREATE TABLE IF NOT EXISTS orion_eventos_operacionais (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo       text NOT NULL CHECK (tipo IN
             ('expansao','promocao','campanha','mudanca_regra','feriado',
              'evento_local','festival','show','esportivo','feira','outro')),
  titulo     text NOT NULL,
  cidade     text,
  uf         text,
  inicio     date NOT NULL,
  fim        date NOT NULL,
  descricao  text,
  criado_por uuid,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  CHECK (fim >= inicio)
);
ALTER TABLE orion_eventos_operacionais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orion_evop_admin ON orion_eventos_operacionais;
CREATE POLICY orion_evop_admin ON orion_eventos_operacionais
  FOR ALL TO authenticated USING (mp_is_admin()) WITH CHECK (mp_is_admin());

CREATE OR REPLACE FUNCTION orion_eventos_op_ativos()
RETURNS TABLE (id uuid, tipo text, titulo text, cidade text, uf text, inicio date, fim date, descricao text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION OS: acesso restrito a administradores'; END IF;
  RETURN QUERY
  SELECT e.id, e.tipo, e.titulo, e.cidade, e.uf, e.inicio, e.fim, e.descricao
  FROM orion_eventos_operacionais e
  WHERE current_date BETWEEN e.inicio AND e.fim
  ORDER BY e.inicio;
END; $$;

-- ── 3. PAINEL NACIONAL ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION orion_os_nacional()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION OS: acesso restrito a administradores'; END IF;
  SELECT jsonb_build_object(
    'profissionais',
      (SELECT count(*) FROM motoboy_profiles) + (SELECT count(*) FROM driver_profiles),
    'usuarios', (SELECT count(*) FROM profiles),
    'lojistas', (SELECT count(*) FROM merchant_stores),
    'cidades_com_presenca', (SELECT count(*) FROM orion_presenca_cidades()),
    'estados_com_presenca',
      (SELECT count(DISTINCT m.uf) FROM orion_presenca_cidades() p
        JOIN orion_municipios m ON m.nome_norm = p.cidade_norm),
    'entregas_total', (SELECT count(*) FROM service_orders
                       WHERE status::text IN ('delivered','completed','finished')),
    'corridas_total', (SELECT count(*) FROM motorista_corridas),
    'pedidos_total', (SELECT count(*) FROM service_orders),
    'crescimento', jsonb_build_object(
      'cadastros_hoje',
        (SELECT count(*) FROM motoboy_profiles WHERE created_at >= date_trunc('day', now())) +
        (SELECT count(*) FROM driver_profiles  WHERE created_at >= date_trunc('day', now())) +
        (SELECT count(*) FROM profiles         WHERE created_at >= date_trunc('day', now())),
      'cadastros_7d',
        (SELECT count(*) FROM motoboy_profiles WHERE created_at >= now() - interval '7 days') +
        (SELECT count(*) FROM driver_profiles  WHERE created_at >= now() - interval '7 days') +
        (SELECT count(*) FROM profiles         WHERE created_at >= now() - interval '7 days'),
      'cadastros_30d',
        (SELECT count(*) FROM motoboy_profiles WHERE created_at >= now() - interval '30 days') +
        (SELECT count(*) FROM driver_profiles  WHERE created_at >= now() - interval '30 days') +
        (SELECT count(*) FROM profiles         WHERE created_at >= now() - interval '30 days')),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
  ) INTO r;
  RETURN r;
END; $$;

-- ── 4. ÍNDICE DE COBERTURA (classificado) ──────────────────────
CREATE OR REPLACE FUNCTION orion_os_cobertura()
RETURNS TABLE (
  cidade text, uf text, populacao integer,
  motoboys bigint, motoristas bigint, lojas bigint, usuarios bigint,
  demanda_dia numeric, capacidade_dia numeric, indice numeric, classe text, justificativa text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION OS: acesso restrito a administradores'; END IF;
  RETURN QUERY
  WITH pres AS (
    SELECT p.cidade_norm, p.motoboys, p.lojas, p.usuarios,
      (SELECT count(*) FROM driver_profiles dp WHERE orion_norm(dp.cidade) = p.cidade_norm) AS motoristas
    FROM orion_presenca_cidades() p
  ), base AS (
    SELECT coalesce(m.nome, initcap(pr.cidade_norm)) AS nm, m.uf AS suf, m.populacao AS pop,
      pr.motoboys AS mb, pr.motoristas AS mt, pr.lojas AS lj, pr.usuarios AS us,
      round(pr.lojas * 6 + coalesce(m.populacao,0) / 50000.0, 1) AS dem,
      (pr.motoboys + pr.motoristas) * 12.0 AS cap
    FROM pres pr
    LEFT JOIN orion_municipios m ON m.nome_norm = pr.cidade_norm
  )
  SELECT b.nm, b.suf, b.pop, b.mb, b.mt, b.lj, b.us, b.dem, b.cap,
    CASE WHEN b.dem > 0 THEN round(b.cap / b.dem, 2) ELSE NULL END,
    CASE
      WHEN b.dem > 0 AND b.cap = 0        THEN 'Crítica'
      WHEN b.dem = 0                       THEN 'Boa'
      WHEN b.cap / b.dem >= 1.5            THEN 'Excelente'
      WHEN b.cap / b.dem >= 1.0            THEN 'Boa'
      WHEN b.cap / b.dem >= 0.6            THEN 'Regular'
      ELSE 'Baixa'
    END,
    'Demanda estimada ' || b.dem || ' pedidos/dia (' || b.lj || ' loja(s) × 6 + população/50 mil); capacidade '
      || b.cap || '/dia (' || (b.mb + b.mt) || ' profissional(is) × 12). IOD v1 (orion_indices).'
  FROM base b
  ORDER BY b.dem DESC NULLS LAST;
END; $$;

-- ── 5. CRESCIMENTO 30d (série diária para gráfico) ─────────────
CREATE OR REPLACE FUNCTION orion_os_crescimento()
RETURNS TABLE (dia date, cadastros_profissionais bigint, cadastros_usuarios bigint, pedidos bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION OS: acesso restrito a administradores'; END IF;
  RETURN QUERY
  SELECT d.dia::date,
    (SELECT count(*) FROM motoboy_profiles WHERE created_at::date = d.dia) +
    (SELECT count(*) FROM driver_profiles  WHERE created_at::date = d.dia),
    (SELECT count(*) FROM profiles         WHERE created_at::date = d.dia),
    (SELECT count(*) FROM service_orders   WHERE created_at::date = d.dia)
  FROM generate_series(current_date - 29, current_date, interval '1 day') AS d(dia)
  ORDER BY 1;
END; $$;

-- ── 6. OFERTA × DEMANDA (tempo real + picos) ───────────────────
CREATE OR REPLACE FUNCTION orion_os_oferta_demanda()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_online bigint; v_media numeric; v_cap numeric; r jsonb;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION OS: acesso restrito a administradores'; END IF;
  SELECT (SELECT count(*) FROM motoboy_profiles WHERE is_online) +
         (SELECT count(*) FROM driver_profiles WHERE is_online) INTO v_online;
  SELECT round(count(*) / 30.0, 2) INTO v_media
  FROM service_orders WHERE created_at >= now() - interval '30 days';
  v_cap := v_online * 12.0;
  SELECT jsonb_build_object(
    'profissionais_online', v_online,
    'capacidade_dia', v_cap,
    'solicitacoes_media_dia', v_media,
    'utilizacao_pct', CASE WHEN v_cap > 0 THEN round(100 * v_media / v_cap, 1) ELSE NULL END,
    'horarios_pico', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
       SELECT extract(hour FROM created_at)::int AS hora, count(*) AS pedidos
       FROM service_orders WHERE created_at >= now() - interval '30 days'
       GROUP BY 1 ORDER BY 2 DESC LIMIT 3) x),
    'pedidos_hoje', (SELECT count(*) FROM service_orders WHERE created_at >= date_trunc('day', now())),
    'premissas', 'Capacidade = 12 atendimentos/dia por profissional online (heurística v1). Tempo médio de espera entra quando houver carimbo de aceite nos pedidos.',
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
  ) INTO r;
  RETURN r;
END; $$;

-- ── 7. FIX: orion_norm agora faz trim (cadastros com espaço no fim
--        criavam cidade "duplicada" na presença/cobertura) ────────
CREATE OR REPLACE FUNCTION orion_norm(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fx$
  SELECT trim(lower(translate(coalesce(t,''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')));
$fx$;

GRANT EXECUTE ON FUNCTION orion_diretriz_salvar(text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION orion_diretriz_aprovar(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION orion_diretriz_rollback(text,int) TO authenticated;
GRANT EXECUTE ON FUNCTION orion_diretrizes_ativas()         TO authenticated;
GRANT EXECUTE ON FUNCTION orion_eventos_op_ativos()         TO authenticated;
GRANT EXECUTE ON FUNCTION orion_os_nacional()               TO authenticated;
GRANT EXECUTE ON FUNCTION orion_os_cobertura()              TO authenticated;
GRANT EXECUTE ON FUNCTION orion_os_crescimento()            TO authenticated;
GRANT EXECUTE ON FUNCTION orion_os_oferta_demanda()         TO authenticated;
