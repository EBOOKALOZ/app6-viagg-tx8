-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-04 — FINANCE AI v1.0
--
-- Cérebro financeiro CONSULTIVO: monitora, concilia, audita, pontua
-- fraude, prevê e alerta. REGRA ABSOLUTA (regras-financeiras + spec):
-- NENHUMA escrita em pay_* / carteiras / ledger — toda RPC daqui só
-- faz SELECT no motor pay; escreve apenas nas tabelas próprias
-- orion_finance_* e emite eventos finance_* no sistema nervoso.
-- Receita SEMPRE soma as 3 fontes (pay_payment_orders pagas +
-- promotion_purchases + comissões no ledger) — somar só platform_main
-- subestima (regra congelada).
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- ── Tabelas próprias (únicas escritas do módulo) ──
CREATE TABLE IF NOT EXISTS public.orion_finance_divergencias (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL,
  gravidade    text NOT NULL DEFAULT 'atencao',   -- informativo|atencao|critico
  chave        text NOT NULL,                     -- idempotência da detecção
  descricao    text,
  evidencias   jsonb DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'aberta',    -- aberta|resolvida|ignorada
  detectada_em timestamptz NOT NULL DEFAULT now(),
  resolvida_em timestamptz,
  resolvida_por uuid,
  nota_resolucao text,
  CONSTRAINT orion_fin_div_unica UNIQUE (tipo, chave)
);
ALTER TABLE public.orion_finance_divergencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ofd_admin ON public.orion_finance_divergencias;
CREATE POLICY ofd_admin ON public.orion_finance_divergencias
  FOR SELECT TO authenticated USING (mp_is_admin());

CREATE TABLE IF NOT EXISTS public.orion_finance_alertas (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo      text NOT NULL,
  severidade text NOT NULL DEFAULT 'informativo', -- informativo|atencao|critico
  titulo    text NOT NULL,
  dados     jsonb DEFAULT '{}'::jsonb,
  chave_dia text NOT NULL,                        -- anti-spam: 1 alerta/tipo/dia
  status    text NOT NULL DEFAULT 'aberto',
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_fin_alerta_unico UNIQUE (tipo, chave_dia)
);
ALTER TABLE public.orion_finance_alertas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ofa_admin ON public.orion_finance_alertas;
CREATE POLICY ofa_admin ON public.orion_finance_alertas
  FOR SELECT TO authenticated USING (mp_is_admin());

CREATE TABLE IF NOT EXISTS public.orion_finance_snapshots (
  dia   date PRIMARY KEY,
  kpis  jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orion_finance_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ofs_admin ON public.orion_finance_snapshots;
CREATE POLICY ofs_admin ON public.orion_finance_snapshots
  FOR SELECT TO authenticated USING (mp_is_admin());

CREATE OR REPLACE FUNCTION public.orion_finance_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'finance_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END; $$;

-- ─────────────────────────────────────────────
-- CONCILIAÇÃO (somente SELECT em pay_*; grava só divergências próprias)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_finance_conciliar()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_novas int := 0; v_tot int;
BEGIN
  -- contexto interno (cron/postgres) e service_role passam; usuário exige admin
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  -- 1) Ordem PAGA sem nenhum lançamento no ledger (pagou e não creditou)
  INSERT INTO orion_finance_divergencias (tipo, gravidade, chave, descricao, evidencias)
  SELECT 'pagamento_sem_credito', 'critico', o.id::text,
         format('Ordem paga (R$ %s, %s) sem lançamento no ledger', o.amount, coalesce(o.product_type,'?')),
         jsonb_build_object('order_id', o.id, 'amount', o.amount, 'product_type', o.product_type,
                            'provider_payment_id', o.provider_payment_id, 'paid_at', o.paid_at)
  FROM pay_payment_orders o
  WHERE o.status = 'paid'
    AND NOT EXISTS (SELECT 1 FROM pay_ledger_entries l WHERE l.reference_id = o.id)
    AND NOT EXISTS (SELECT 1 FROM pay_ledger_entries l2 WHERE l2.metadata->>'payment_order_id' = o.id::text)
  ON CONFLICT (tipo, chave) DO NOTHING;
  GET DIAGNOSTICS v_tot = ROW_COUNT; v_novas := v_novas + v_tot;

  -- 2) provider_payment_id repetido em ordens pagas (pagamento duplicado)
  INSERT INTO orion_finance_divergencias (tipo, gravidade, chave, descricao, evidencias)
  SELECT 'pagamento_duplicado', 'critico', d.provider_payment_id,
         format('%s ordens pagas com o MESMO pagamento do gateway (%s)', d.n, d.provider_payment_id),
         jsonb_build_object('provider_payment_id', d.provider_payment_id, 'ordens', d.ids)
  FROM (SELECT provider_payment_id, count(*) n, jsonb_agg(id) ids
        FROM pay_payment_orders
        WHERE status = 'paid' AND provider_payment_id IS NOT NULL
        GROUP BY 1 HAVING count(*) > 1) d
  ON CONFLICT (tipo, chave) DO NOTHING;
  GET DIAGNOSTICS v_tot = ROW_COUNT; v_novas := v_novas + v_tot;

  -- 3) Webhook duplicado (mesmo provider_event_id mais de uma vez)
  INSERT INTO orion_finance_divergencias (tipo, gravidade, chave, descricao, evidencias)
  SELECT 'webhook_duplicado', 'atencao', w.provider_event_id,
         format('Evento do gateway recebido %s vezes', w.n),
         jsonb_build_object('provider_event_id', w.provider_event_id, 'n', w.n)
  FROM (SELECT provider_event_id, count(*) n FROM pay_payment_events
        WHERE provider_event_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1) w
  ON CONFLICT (tipo, chave) DO NOTHING;
  GET DIAGNOSTICS v_tot = ROW_COUNT; v_novas := v_novas + v_tot;

  -- 4) Saldo da conta ≠ último balance_after do ledger (quebra de partida dobrada)
  INSERT INTO orion_finance_divergencias (tipo, gravidade, chave, descricao, evidencias)
  SELECT 'saldo_inconsistente', 'critico', a.id::text,
         format('Conta %s/%s: saldo atual R$ %s ≠ último lançamento R$ %s',
                a.owner_type, a.account_type, a.current_balance, u.balance_after),
         jsonb_build_object('account_id', a.id, 'owner_type', a.owner_type,
                            'saldo_conta', a.current_balance, 'saldo_ledger', u.balance_after)
  FROM pay_financial_accounts a
  JOIN LATERAL (SELECT balance_after FROM pay_ledger_entries l
                WHERE l.account_id = a.id ORDER BY l.created_at DESC, l.id DESC LIMIT 1) u ON true
  WHERE a.current_balance IS DISTINCT FROM u.balance_after
  ON CONFLICT (tipo, chave) DO NOTHING;
  GET DIAGNOSTICS v_tot = ROW_COUNT; v_novas := v_novas + v_tot;

  -- 5) Carteira negativa
  INSERT INTO orion_finance_divergencias (tipo, gravidade, chave, descricao, evidencias)
  SELECT 'carteira_negativa', 'critico', a.id::text,
         format('Conta %s com disponível negativo: R$ %s', a.owner_type, a.available_balance),
         jsonb_build_object('account_id', a.id, 'owner_type', a.owner_type,
                            'available', a.available_balance, 'current', a.current_balance)
  FROM pay_financial_accounts a WHERE a.available_balance < 0
  ON CONFLICT (tipo, chave) DO NOTHING;
  GET DIAGNOSTICS v_tot = ROW_COUNT; v_novas := v_novas + v_tot;

  -- 6) Lançamento órfão (sem conta)
  INSERT INTO orion_finance_divergencias (tipo, gravidade, chave, descricao, evidencias)
  SELECT 'lancamento_orfao', 'critico', l.id::text,
         'Lançamento no ledger apontando para conta inexistente',
         jsonb_build_object('entry_id', l.id, 'account_id', l.account_id, 'amount', l.amount)
  FROM pay_ledger_entries l
  LEFT JOIN pay_financial_accounts a ON a.id = l.account_id
  WHERE a.id IS NULL
  ON CONFLICT (tipo, chave) DO NOTHING;
  GET DIAGNOSTICS v_tot = ROW_COUNT; v_novas := v_novas + v_tot;

  -- 7) Webhook parado (evento não processado há mais de 30 min)
  INSERT INTO orion_finance_divergencias (tipo, gravidade, chave, descricao, evidencias)
  SELECT 'webhook_nao_processado', 'atencao', e.id::text,
         format('Webhook %s sem processamento desde %s (retries: %s)',
                coalesce(e.provider_event_type,'?'), e.created_at, e.retry_count),
         jsonb_build_object('event_id', e.id, 'tipo', e.provider_event_type,
                            'erro', e.processing_error, 'retries', e.retry_count)
  FROM pay_payment_events e
  WHERE e.processed = false AND e.created_at < now() - interval '30 minutes'
  ON CONFLICT (tipo, chave) DO NOTHING;
  GET DIAGNOSTICS v_tot = ROW_COUNT; v_novas := v_novas + v_tot;

  IF v_novas > 0 THEN
    PERFORM orion_finance_emit('finance_reconciliation',
      jsonb_build_object('novas_divergencias', v_novas));
  END IF;

  RETURN jsonb_build_object('ok', true, 'novas_divergencias', v_novas,
    'abertas_total', (SELECT count(*) FROM orion_finance_divergencias WHERE status = 'aberta'));
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_finance_conciliar() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- ANTIFRAUDE (heurísticas read-only; score 0–100 + evidências)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_finance_fraude()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_suspeitos jsonb;
BEGIN
  -- contexto interno (cron/postgres) e service_role passam; usuário exige admin
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  SELECT coalesce(jsonb_agg(s ORDER BY (s->>'score')::int DESC), '[]') INTO v_suspeitos FROM (
    SELECT jsonb_build_object(
      'payer_owner_id', x.payer_owner_id,
      'score', least(100, x.rajada * 30 + x.estornos * 25 + x.duplicadas * 35),
      'confianca', CASE WHEN x.rajada + x.estornos + x.duplicadas >= 3 THEN 'alta'
                        WHEN x.rajada + x.estornos + x.duplicadas = 2 THEN 'media' ELSE 'baixa' END,
      'motivo', concat_ws('; ',
        CASE WHEN x.rajada > 0 THEN format('%s rajada(s) de 3+ compras em 1h', x.rajada) END,
        CASE WHEN x.estornos > 0 THEN format('%s estorno(s)/cancelamento(s) em 30d', x.estornos) END,
        CASE WHEN x.duplicadas > 0 THEN format('%s pagamento(s) duplicado(s)', x.duplicadas) END),
      'evidencias', x.ev,
      'recomendacao', 'Revisar manualmente; NENHUMA ação automática será tomada (Finance AI é consultivo).')
      AS s
    FROM (
      SELECT o.payer_owner_id,
        (SELECT count(*) FROM (
           SELECT date_trunc('hour', o2.created_at) h, count(*) n
           FROM pay_payment_orders o2
           WHERE o2.payer_owner_id = o.payer_owner_id AND o2.created_at > now() - interval '30 days'
           GROUP BY 1 HAVING count(*) >= 3) r) AS rajada,
        (SELECT count(*) FROM pay_payment_orders o3
         WHERE o3.payer_owner_id = o.payer_owner_id
           AND o3.status::text IN ('refunded','cancelled','chargeback')
           AND o3.created_at > now() - interval '30 days') AS estornos,
        (SELECT count(*) FROM (
           SELECT provider_payment_id FROM pay_payment_orders o4
           WHERE o4.payer_owner_id = o.payer_owner_id AND o4.status = 'paid'
             AND o4.provider_payment_id IS NOT NULL
           GROUP BY 1 HAVING count(*) > 1) d) AS duplicadas,
        (SELECT jsonb_agg(jsonb_build_object('order', o5.id, 'status', o5.status,
                 'amount', o5.amount, 'quando', o5.created_at) ORDER BY o5.created_at DESC)
         FROM (SELECT * FROM pay_payment_orders o6
               WHERE o6.payer_owner_id = o.payer_owner_id
               ORDER BY o6.created_at DESC LIMIT 5) o5) AS ev
      FROM pay_payment_orders o
      WHERE o.created_at > now() - interval '30 days'
      GROUP BY o.payer_owner_id
    ) x
    WHERE x.rajada > 0 OR x.estornos >= 2 OR x.duplicadas > 0
  ) q(s);

  IF jsonb_array_length(v_suspeitos) > 0 THEN
    PERFORM orion_finance_emit('finance_fraud_detected',
      jsonb_build_object('suspeitos', jsonb_array_length(v_suspeitos)));
  END IF;

  RETURN jsonb_build_object('ok', true, 'suspeitos', v_suspeitos);
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_finance_fraude() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- DASHBOARD + PREVISÕES + INSIGHTS + CUSTOS DE IA (tudo read-only)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_finance_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_media7 numeric;
BEGIN
  IF session_user <> 'postgres' AND NOT mp_is_admin() AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;

  SELECT coalesce(avg(dia_total), 0) INTO v_media7 FROM (
    SELECT paid_at::date, sum(amount) dia_total FROM pay_payment_orders
    WHERE status = 'paid' AND paid_at > now() - interval '7 days' GROUP BY 1) m;

  RETURN jsonb_build_object(
    -- Receita (3 fontes — NUNCA somar só platform_main)
    'receita', jsonb_build_object(
      'ordens_pagas_total',  (SELECT coalesce(sum(amount),0) FROM pay_payment_orders WHERE status='paid'),
      'ordens_pagas_hoje',   (SELECT coalesce(sum(amount),0) FROM pay_payment_orders WHERE status='paid' AND paid_at::date=current_date),
      'ordens_pagas_mes',    (SELECT coalesce(sum(amount),0) FROM pay_payment_orders WHERE status='paid' AND paid_at>date_trunc('month',now())),
      'promocao_total',      (SELECT coalesce(sum(amount_brl),0) FROM promotion_purchases WHERE status IN ('paid','approved')),
      'comissoes_plataforma',(SELECT coalesce(sum(l.amount),0) FROM pay_ledger_entries l
                              JOIN pay_financial_accounts a ON a.id=l.account_id
                              WHERE a.owner_type='platform' AND l.direction='credit'),
      'por_produto', (SELECT coalesce(jsonb_agg(jsonb_build_object('produto',coalesce(product_type,'?'),'n',n,'total',t) ORDER BY t DESC),'[]')
                      FROM (SELECT product_type, count(*) n, sum(amount) t FROM pay_payment_orders
                            WHERE status='paid' GROUP BY 1 ORDER BY t DESC LIMIT 8) pp)),
    'carteiras', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',owner_type,'contas',n,'saldo',s,'disponivel',d,'reservado',r) ORDER BY s DESC),'[]')
                  FROM (SELECT owner_type, count(*) n, sum(current_balance) s,
                               sum(available_balance) d, sum(reserved_balance) r
                        FROM pay_financial_accounts GROUP BY 1) w),
    'saques', jsonb_build_object(
      'solicitados', (SELECT count(*) FROM pay_payout_requests),
      'pendentes',   (SELECT count(*) FROM pay_payout_requests WHERE status::text NOT IN ('paid','completed','rejected','cancelled'))),
    'serie_30d', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',d,'receita',t,'ordens',n) ORDER BY d),'[]')
                  FROM (SELECT paid_at::date d, sum(amount) t, count(*) n FROM pay_payment_orders
                        WHERE status='paid' AND paid_at > now() - interval '30 days' GROUP BY 1) s30),
    'previsao', jsonb_build_object(
      'base', 'média móvel 7 dias das ordens pagas',
      'diaria',  round(v_media7, 2),
      'semanal', round(v_media7 * 7, 2),
      'mensal',  round(v_media7 * 30, 2),
      'anual',   round(v_media7 * 365, 2),
      'ticket_medio_30d', (SELECT round(coalesce(avg(amount),0),2) FROM pay_payment_orders
                           WHERE status='paid' AND paid_at > now() - interval '30 days'),
      'nota', 'Projeção estatística simples — refinará com histórico (aprendizado contínuo)'),
    'insights', jsonb_build_object(
      'modulo_maior_receita', (SELECT product_type FROM pay_payment_orders WHERE status='paid'
                               GROUP BY 1 ORDER BY sum(amount) DESC LIMIT 1),
      'pacote_promocao_mais_vendido', (SELECT package_name FROM promotion_purchases
                                       GROUP BY 1 ORDER BY count(*) DESC LIMIT 1),
      'horarios_com_mais_vendas', (SELECT coalesce(jsonb_agg(jsonb_build_object('hora',h,'n',n) ORDER BY n DESC),'[]')
                                   FROM (SELECT extract(hour FROM paid_at)::int h, count(*) n
                                         FROM pay_payment_orders WHERE status='paid' AND paid_at IS NOT NULL
                                         GROUP BY 1 ORDER BY n DESC LIMIT 5) hh),
      'nota', 'Receita por cidade requer cidade nas ordens (pendência declarada)'),
    'custos_ia', jsonb_build_object(
      'total_usd', (SELECT coalesce(sum(custo_estimado),0) FROM orion_ai_log),
      'hoje_usd',  (SELECT coalesce(sum(custo_estimado),0) FROM orion_ai_log WHERE criado_em::date=current_date),
      'por_modulo',(SELECT coalesce(jsonb_agg(jsonb_build_object('modulo',module,'usd',c,'chamadas',n) ORDER BY c DESC),'[]')
                    FROM (SELECT module, sum(custo_estimado) c, count(*) n FROM orion_ai_log GROUP BY 1) cm),
      'por_modelo',(SELECT coalesce(jsonb_agg(jsonb_build_object('modelo',model,'usd',c) ORDER BY c DESC),'[]')
                    FROM (SELECT model, sum(custo_estimado) c FROM orion_ai_log WHERE model IS NOT NULL GROUP BY 1) cd)),
    'divergencias', jsonb_build_object(
      'abertas', (SELECT count(*) FROM orion_finance_divergencias WHERE status='aberta'),
      'criticas',(SELECT count(*) FROM orion_finance_divergencias WHERE status='aberta' AND gravidade='critico'),
      'lista', (SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.detectada_em DESC),'[]')
                FROM (SELECT * FROM orion_finance_divergencias WHERE status='aberta'
                      ORDER BY detectada_em DESC LIMIT 30) d)),
    'alertas', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.criado_em DESC),'[]')
                FROM (SELECT * FROM orion_finance_alertas WHERE status='aberto'
                      ORDER BY criado_em DESC LIMIT 20) a),
    'snapshots', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'kpis',kpis) ORDER BY dia),'[]')
                  FROM (SELECT * FROM orion_finance_snapshots ORDER BY dia DESC LIMIT 30) sn),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_finance_dashboard() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- Resolver divergência/alerta (admin; só nas tabelas próprias)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_finance_resolver(p_tipo text, p_id uuid, p_nota text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  IF p_tipo = 'divergencia' THEN
    UPDATE orion_finance_divergencias
       SET status='resolvida', resolvida_em=now(), resolvida_por=auth.uid(), nota_resolucao=p_nota
     WHERE id = p_id;
  ELSIF p_tipo = 'alerta' THEN
    UPDATE orion_finance_alertas SET status='resolvido' WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'tipo inválido';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'registro não encontrado'; END IF;
  PERFORM orion_finance_emit('finance_audit',
    jsonb_build_object('acao','resolucao_manual','tipo',p_tipo,'id',p_id,'nota',p_nota));
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_finance_resolver(text, uuid, text) TO authenticated;

-- ─────────────────────────────────────────────
-- TICK (cron horário): conciliar + regras de alerta + snapshot do dia
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_finance_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje numeric; v_media7 numeric; v_ia_hoje numeric; v_ia_media numeric; v_kpis jsonb;
BEGIN
  PERFORM orion_finance_conciliar();

  -- alerta: divergência crítica aberta
  INSERT INTO orion_finance_alertas (tipo, severidade, titulo, dados, chave_dia)
  SELECT 'divergencia_critica', 'critico',
         format('%s divergência(s) crítica(s) de conciliação em aberto', count(*)),
         jsonb_build_object('n', count(*)), current_date::text
  FROM orion_finance_divergencias WHERE status='aberta' AND gravidade='critico'
  HAVING count(*) > 0
  ON CONFLICT (tipo, chave_dia) DO NOTHING;

  -- alerta: queda de faturamento (após 18h, hoje < 50% da média 7d)
  SELECT coalesce(sum(amount),0) INTO v_hoje FROM pay_payment_orders
   WHERE status='paid' AND paid_at::date = current_date;
  SELECT coalesce(avg(t),0) INTO v_media7 FROM (
    SELECT paid_at::date d, sum(amount) t FROM pay_payment_orders
    WHERE status='paid' AND paid_at > now() - interval '8 days'
      AND paid_at::date < current_date GROUP BY 1) m;
  IF extract(hour FROM now() AT TIME ZONE 'America/Cuiaba') >= 18
     AND v_media7 > 0 AND v_hoje < v_media7 * 0.5 THEN
    INSERT INTO orion_finance_alertas (tipo, severidade, titulo, dados, chave_dia)
    VALUES ('queda_faturamento', 'atencao',
      format('Faturamento de hoje (R$ %s) abaixo de 50%% da média 7d (R$ %s)', v_hoje, round(v_media7,2)),
      jsonb_build_object('hoje', v_hoje, 'media7', v_media7), current_date::text)
    ON CONFLICT (tipo, chave_dia) DO NOTHING;
  END IF;

  -- alerta: custo de IA anormal (hoje > 3x média 7d e > US$1)
  SELECT coalesce(sum(custo_estimado),0) INTO v_ia_hoje FROM orion_ai_log WHERE criado_em::date=current_date;
  SELECT coalesce(avg(t),0) INTO v_ia_media FROM (
    SELECT criado_em::date, sum(custo_estimado) t FROM orion_ai_log
    WHERE criado_em > now() - interval '8 days' AND criado_em::date < current_date GROUP BY 1) m2;
  IF v_ia_hoje > 1 AND v_ia_media > 0 AND v_ia_hoje > v_ia_media * 3 THEN
    INSERT INTO orion_finance_alertas (tipo, severidade, titulo, dados, chave_dia)
    VALUES ('custo_ia_anormal', 'atencao',
      format('Custo de IA hoje (US$ %s) > 3x média (US$ %s)', round(v_ia_hoje,4), round(v_ia_media,4)),
      jsonb_build_object('hoje', v_ia_hoje, 'media', v_ia_media), current_date::text)
    ON CONFLICT (tipo, chave_dia) DO NOTHING;
  END IF;

  -- snapshot diário (upsert — série para previsões e aprendizado)
  v_kpis := jsonb_build_object(
    'receita_dia', v_hoje,
    'receita_promocao_total', (SELECT coalesce(sum(amount_brl),0) FROM promotion_purchases WHERE status IN ('paid','approved')),
    'saldo_por_tipo', (SELECT coalesce(jsonb_object_agg(owner_type, s),'{}') FROM
      (SELECT owner_type, sum(current_balance) s FROM pay_financial_accounts GROUP BY 1) w),
    'custo_ia_dia_usd', v_ia_hoje,
    'divergencias_abertas', (SELECT count(*) FROM orion_finance_divergencias WHERE status='aberta'));
  INSERT INTO orion_finance_snapshots (dia, kpis) VALUES (current_date, v_kpis)
  ON CONFLICT (dia) DO UPDATE SET kpis = excluded.kpis, criado_em = now();

  BEGIN
    INSERT INTO orion_aprendizado (evento, detalhes)
    VALUES ('finance_snapshot', v_kpis || jsonb_build_object('dia', current_date));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  PERFORM orion_finance_emit('finance_report_generated',
    jsonb_build_object('dia', current_date, 'receita_dia', v_hoje));
END; $$;

DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_finance_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_finance_tick', '12 * * * *', 'SELECT public.orion_finance_tick()');
END $$;
