-- ============================================================================
-- ORION-AI-41 — FRAUD DETECTION AI v1.0
-- ============================================================================
-- Fraud Intelligence Engine oficial do ORION (2o modulo do Security Ecosystem;
--   complementa o AI-24 Security, que le sinais tecnicos, e o AI-40 Cyber Defense
--   (construido em 17-07, mesma data, em paralelo): casos alta/critica sao
--   espelhados na base comum orion_cyber_events via fraud_bridge_cyber()).
--
-- Missao: identificar/correlacionar/classificar tentativas de fraude com
--   EVIDENCIA REAL. Nenhuma classificacao por suposicao. Recomenda, NUNCA
--   bloqueia sozinho (acoes de alto impacto = aprovacao humana).
--
-- Fontes reais validadas no banco (07-17): profiles (cpf/cpf_cnpj/whatsapp/
--   telefone/email), device_tokens, pay_payment_orders (149), pay_payment_events
--   (118), credit_purchases (32), marketplace_product_click_events (240, 67 com
--   advertiser_account_id no metadata), advertiser_contact_intentions (142),
--   advertiser_accounts (8), moto_taxi_corridas/motorista_corridas/
--   motoboy_passenger_rides/delivery_orders (0 — detectores prontos, dados
--   chegam depois).
--
-- LACUNAS DECLARADAS (nunca inventa): cupons/cashback NAO existem no banco;
--   avaliacoes (reviews) NAO existem; carteira (wallet_transactions vazia,
--   esquema nao validado) — detector dedicado aguarda esquema; catalogo de
--   anuncios e por vertical (products global vazia) — dup/preco por vertical
--   aguarda consolidacao; GPS de entrega exige telemetria do app (front).
--
-- Anti-colisao: tabelas orion_fraud_*, funcoes fraud_*/detect_fraud, chave
--   fraud_detection, painel /admin/orion-fraud. AI-24 usa sec_*/orion_security_*
--   (sec_fraud e so agregador do Trust — sem sobreposicao).
--
-- Idempotente (dedupe_key + upsert; scan incremental 30d, nunca recalcula
--   historico). Acoes IMUTAVEIS (REVOKE UPDATE/DELETE; rollback = linha
--   compensatoria). SECURITY DEFINER + guarda. ROLLBACK manual ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_fraud_events (
  fraud_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  detected_at     timestamptz NOT NULL DEFAULT now(),
  tipo            text        NOT NULL,   -- documento_duplicado|telefone_duplicado|...
  categoria       text        NOT NULL,   -- conta|marketplace|delivery|financeiro|usuario|ia
  entidade_tipo   text        NOT NULL,   -- user|documento|telefone|dispositivo|pagamento|loja|visitante|corrida|par
  entidade_id     text        NOT NULL,
  user_id         uuid,
  merchant_id     uuid,
  delivery_id     uuid,
  order_id        uuid,
  severity        text        NOT NULL DEFAULT 'baixa',  -- baixa|media|alta|critica
  fraud_score     integer     NOT NULL DEFAULT 0,   -- FS 0-100
  financial_risk  integer     NOT NULL DEFAULT 0,   -- FR 0-100
  trust_impact    integer     NOT NULL DEFAULT 0,   -- penalidade FT 0-100
  confidence      integer     NOT NULL DEFAULT 0,   -- FC 0-100
  valor_envolvido numeric     NOT NULL DEFAULT 0,
  evidencias      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status          text        NOT NULL DEFAULT 'detectada', -- detectada|em_analise|confirmada|falso_positivo|resolvida
  dedupe_key      text        NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_fraud_events IS
  'ORION-AI-41: eventos de fraude com EVIDENCIA obrigatoria. dedupe_key garante idempotencia (scan incremental, nunca recalcula historico).';
CREATE INDEX IF NOT EXISTS ix_orion_fraud_ev_det  ON public.orion_fraud_events (detected_at DESC);
CREATE INDEX IF NOT EXISTS ix_orion_fraud_ev_cat  ON public.orion_fraud_events (categoria, status);
CREATE INDEX IF NOT EXISTS ix_orion_fraud_ev_user ON public.orion_fraud_events (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.orion_fraud_patterns (
  pattern_key       text        PRIMARY KEY,          -- = tipo
  descricao         text        NOT NULL,
  frequencia        integer     NOT NULL DEFAULT 0,
  risco             integer     NOT NULL DEFAULT 0,   -- FS medio do padrao
  ia_responsavel    text        NOT NULL DEFAULT 'fraud_detection',
  ultima_ocorrencia timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_fraud_patterns IS 'ORION-AI-41: padroes de fraude agregados dos eventos reais (frequencia/risco/ultima ocorrencia).';

CREATE TABLE IF NOT EXISTS public.orion_fraud_actions (
  action_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fraud_id    bigint REFERENCES public.orion_fraud_events(fraud_id),
  acao        text        NOT NULL,   -- revisao_manual|validacao_adicional|monitoramento|alerta_admin|marcacao_status|rollback
  motivo      text        NOT NULL,
  politica    text        NOT NULL DEFAULT 'fraud_politica_v1',
  resultado   text        NOT NULL DEFAULT 'pendente', -- pendente|aplicada|revertida
  rollback_de bigint,                 -- linha compensatoria aponta a acao revertida
  operador    text        NOT NULL DEFAULT 'fraud_detection', -- ia|admin uuid
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_fraud_actions IS 'ORION-AI-41: trilha de acoes IMUTAVEL (append-only; rollback = linha compensatoria, nunca apaga).';
CREATE INDEX IF NOT EXISTS ix_orion_fraud_act_fraud ON public.orion_fraud_actions (fraud_id);

CREATE TABLE IF NOT EXISTS public.orion_fraud_statistics (
  dia                    date        PRIMARY KEY,
  fraudes_detectadas     integer     NOT NULL DEFAULT 0,
  fraudes_confirmadas    integer     NOT NULL DEFAULT 0,
  falsos_positivos       integer     NOT NULL DEFAULT 0,
  em_analise             integer     NOT NULL DEFAULT 0,
  perdas_evitadas        numeric     NOT NULL DEFAULT 0,  -- ELP (estimativa declarada: valor envolvido em casos alta/critica tratados)
  tempo_medio_resposta_s integer     NOT NULL DEFAULT 0,  -- deteccao -> 1a acao
  fpr                    numeric     NOT NULL DEFAULT 0,  -- falsos positivos / detectadas
  fdr                    numeric     NOT NULL DEFAULT 0,  -- confirmadas / detectadas
  updated_at             timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_fraud_statistics IS 'ORION-AI-41: estatisticas diarias (FPR/FDR/ELP). ELP = estimativa DECLARADA, nao perda contabil.';

-- ----------------------------------------------------------------------------
-- 2) RLS (leitura admin) + IMUTABILIDADE das acoes
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_fraud_events','orion_fraud_patterns','orion_fraud_actions','orion_fraud_statistics'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
  END LOOP;
END$$;

-- default grants do projeto dao ALL (incl. TRUNCATE, que ignora RLS) — trava total:
REVOKE ALL ON public.orion_fraud_events, public.orion_fraud_patterns,
             public.orion_fraud_actions, public.orion_fraud_statistics FROM anon, authenticated;
GRANT SELECT ON public.orion_fraud_events, public.orion_fraud_patterns,
               public.orion_fraud_actions, public.orion_fraud_statistics TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) EVENT BUS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fraud_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'fraud_detection', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- ----------------------------------------------------------------------------
-- 4) REGISTRO idempotente (upsert por dedupe_key; nunca rebaixa status tratado)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fraud_register(text,text,text,text,int,int,int,int,numeric,jsonb,text,uuid,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION public.fraud_register(
  p_tipo text, p_categoria text, p_entidade_tipo text, p_entidade_id text,
  p_fs bigint, p_fr bigint, p_ft bigint, p_fc bigint, p_valor numeric, p_evid jsonb, p_dedupe text,
  p_user uuid DEFAULT NULL, p_merchant uuid DEFAULT NULL, p_delivery uuid DEFAULT NULL, p_order uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sev text;
BEGIN
  v_sev := CASE WHEN p_fs >= 80 THEN 'critica' WHEN p_fs >= 60 THEN 'alta' WHEN p_fs >= 40 THEN 'media' ELSE 'baixa' END;
  INSERT INTO public.orion_fraud_events
    (tipo, categoria, entidade_tipo, entidade_id, user_id, merchant_id, delivery_id, order_id,
     severity, fraud_score, financial_risk, trust_impact, confidence, valor_envolvido, evidencias, dedupe_key)
  VALUES (p_tipo, p_categoria, p_entidade_tipo, p_entidade_id, p_user, p_merchant, p_delivery, p_order,
     v_sev, least(p_fs,100)::int, least(p_fr,100)::int, least(p_ft,100)::int, least(p_fc,100)::int, coalesce(p_valor,0), coalesce(p_evid,'{}'::jsonb), p_dedupe)
  ON CONFLICT (dedupe_key) DO UPDATE SET
     fraud_score=excluded.fraud_score, financial_risk=excluded.financial_risk, trust_impact=excluded.trust_impact,
     confidence=excluded.confidence, valor_envolvido=excluded.valor_envolvido, evidencias=excluded.evidencias,
     severity=excluded.severity, updated_at=now();
END$$;

-- ----------------------------------------------------------------------------
-- 5) MOTOR — fraud_scan: detectores com EVIDENCIA real (janela 30d, incremental)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fraud_scan(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trace text := coalesce(p_trace,'fraud_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_ini timestamptz := now() - interval '30 days';
  r record; v_n int := 0;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'fraud_scan: acesso negado (somente admin/service)';
  END IF;

  -- ===== CONTAS =====
  -- D1 documento duplicado (cpf/cpf_cnpj normalizado; mascarado na evidencia)
  FOR r IN
    SELECT regexp_replace(coalesce(cpf,cpf_cnpj),'\D','','g') doc, array_agg(id) ids, count(*) n
    FROM public.profiles
    WHERE length(regexp_replace(coalesce(cpf,cpf_cnpj,''),'\D','','g')) >= 11
    GROUP BY 1 HAVING count(*) > 1
  LOOP
    PERFORM public.fraud_register('documento_duplicado','conta','documento', left(r.doc,3)||'***',
      least(60+r.n*10,100), 30, 60, least(50+r.n*15,100), 0,
      jsonb_build_object('documento_mascarado',left(r.doc,3)||'***'||right(r.doc,2),'contas',to_jsonb(r.ids),'quantidade',r.n,
        'criterio','mesmo CPF/CNPJ normalizado em >1 perfil'),
      'doc:'||md5(r.doc), r.ids[1]);
    v_n := v_n+1;
  END LOOP;

  -- D2 telefone duplicado (whatsapp/telefone normalizados)
  FOR r IN
    SELECT tel, array_agg(DISTINCT id) ids, count(DISTINCT id) n FROM (
      SELECT id, regexp_replace(coalesce(whatsapp,''),'\D','','g') tel FROM public.profiles
      UNION ALL
      SELECT id, regexp_replace(coalesce(telefone,''),'\D','','g') FROM public.profiles
    ) x WHERE length(tel) >= 10 GROUP BY tel HAVING count(DISTINCT id) > 1
  LOOP
    PERFORM public.fraud_register('telefone_duplicado','conta','telefone', left(r.tel,4)||'***',
      least(45+r.n*10,100), 20, 40, least(45+r.n*15,100), 0,
      jsonb_build_object('telefone_mascarado',left(r.tel,4)||'****'||right(r.tel,2),'contas',to_jsonb(r.ids),'quantidade',r.n,
        'criterio','mesmo telefone/whatsapp normalizado em >1 perfil'),
      'tel:'||md5(r.tel), r.ids[1]);
    v_n := v_n+1;
  END LOOP;

  -- D3 e-mail descartavel (lista conhecida de dominios)
  FOR r IN
    SELECT id, email, split_part(lower(email),'@',2) dom FROM public.profiles
    WHERE split_part(lower(coalesce(email,'')),'@',2) IN
      ('mailinator.com','tempmail.com','temp-mail.org','guerrillamail.com','10minutemail.com','yopmail.com',
       'sharklasers.com','trashmail.com','getnada.com','dispostable.com','maildrop.cc','mohmal.com')
  LOOP
    PERFORM public.fraud_register('email_descartavel','conta','user', r.id::text,
      55, 25, 50, 90, 0,
      jsonb_build_object('dominio',r.dom,'criterio','dominio de e-mail descartavel conhecido'),
      'mail:'||r.id, r.id);
    v_n := v_n+1;
  END LOOP;

  -- D4 dispositivo compartilhado (mesmo token de device em >1 conta)
  FOR r IN
    SELECT token, array_agg(DISTINCT user_id) ids, count(DISTINCT user_id) n
    FROM public.device_tokens GROUP BY token HAVING count(DISTINCT user_id) > 1
  LOOP
    PERFORM public.fraud_register('dispositivo_compartilhado','conta','dispositivo', left(md5(r.token),8),
      least(40+r.n*10,100), 15, 35, least(60+r.n*10,100), 0,
      jsonb_build_object('device_hash',md5(r.token),'contas',to_jsonb(r.ids),'quantidade',r.n,
        'criterio','mesmo device token registrado em >1 usuario'),
      'dev:'||md5(r.token), r.ids[1]);
    v_n := v_n+1;
  END LOOP;

  -- ===== MARKETPLACE =====
  -- D5 auto-clique (anunciante clica no proprio anuncio; consumo/metrica inflada)
  FOR r IN
    SELECT aa.user_id uid, count(*) n, sum(coalesce(e.credits_charged,0)) cred, max(e.created_at) ult
    FROM public.marketplace_product_click_events e
    JOIN public.advertiser_accounts aa ON aa.id = nullif(e.metadata->>'advertiser_account_id','')::uuid
    WHERE e.created_at > v_ini AND e.visitor_user_id = aa.user_id
    GROUP BY aa.user_id HAVING count(*) >= 3
  LOOP
    PERFORM public.fraud_register('auto_clique','marketplace','user', r.uid::text,
      least(50+r.n*5,100), 35, 55, least(55+r.n*5,100), 0,
      jsonb_build_object('cliques_proprios',r.n,'creditos_envolvidos',r.cred,'ultimo',r.ult,
        'criterio','visitor_user_id = dono do anuncio (metadata.advertiser_account_id) em >=3 cliques/30d'),
      'selfclick:'||r.uid||':'||to_char(now(),'IYYY-IW'), r.uid, r.uid);
    v_n := v_n+1;
  END LOOP;

  -- D6 auto-interesse (contato com o proprio telefone do anunciante)
  FOR r IN
    SELECT aci.advertiser_user_id uid, count(*) n, max(aci.created_at) ult
    FROM public.advertiser_contact_intentions aci
    JOIN public.profiles p ON p.id = aci.advertiser_user_id
    WHERE aci.created_at > v_ini
      AND length(regexp_replace(coalesce(aci.visitor_phone,''),'\D','','g')) >= 10
      AND regexp_replace(coalesce(aci.visitor_phone,''),'\D','','g')
          IN (regexp_replace(coalesce(p.whatsapp,''),'\D','','g'), regexp_replace(coalesce(p.telefone,''),'\D','','g'))
    GROUP BY aci.advertiser_user_id
  LOOP
    PERFORM public.fraud_register('auto_interesse','marketplace','user', r.uid::text,
      least(65+r.n*10,100), 40, 60, 90, 0,
      jsonb_build_object('contatos_proprios',r.n,'ultimo',r.ult,
        'criterio','telefone do visitante = telefone do proprio anunciante (aci)'),
      'selfaci:'||r.uid, r.uid, r.uid);
    v_n := v_n+1;
  END LOOP;

  -- D7 spam de interesse (mesmo telefone gera muitos contatos em 24h)
  FOR r IN
    SELECT regexp_replace(visitor_phone,'\D','','g') tel, count(*) n,
           count(DISTINCT advertiser_user_id) alvos, max(created_at) ult
    FROM public.advertiser_contact_intentions
    WHERE created_at > now() - interval '24 hours'
      AND length(regexp_replace(coalesce(visitor_phone,''),'\D','','g')) >= 10
    GROUP BY 1 HAVING count(*) >= 5
  LOOP
    PERFORM public.fraud_register('interesse_spam','marketplace','telefone', left(r.tel,4)||'***',
      least(40+r.n*5,100), 20, 30, least(50+r.n*5,100), 0,
      jsonb_build_object('contatos_24h',r.n,'anunciantes_distintos',r.alvos,'ultimo',r.ult,
        'criterio','>=5 intencoes de contato do mesmo telefone em 24h'),
      'acispam:'||md5(r.tel)||':'||to_char(now(),'YYYY-MM-DD'));
    v_n := v_n+1;
  END LOOP;

  -- ===== FINANCEIRO =====
  -- D8 pagamentos identicos em rajada (mesmo pagador+valor, >=3 em 15min)
  FOR r IN
    SELECT payer_owner_id uid, amount, to_timestamp(floor(extract(epoch FROM created_at)/900)*900) bucket,
           count(*) n, array_agg(id) ords
    FROM public.pay_payment_orders
    WHERE created_at > v_ini AND payer_owner_id IS NOT NULL
    GROUP BY 1,2,3 HAVING count(*) >= 3
  LOOP
    PERFORM public.fraud_register('pagamentos_identicos','financeiro','user', r.uid::text,
      least(55+r.n*8,100), least(50+r.n*10,100), 45, least(60+r.n*8,100), r.amount*r.n,
      jsonb_build_object('quantidade',r.n,'valor_unitario',r.amount,'janela','15min','ordens',to_jsonb(r.ords),
        'criterio','>=3 ordens do mesmo pagador com mesmo valor na mesma janela de 15min'),
      'paydup:'||r.uid||':'||r.amount||':'||to_char(r.bucket,'YYYYMMDDHH24MI'), r.uid, NULL, NULL, r.ords[1]);
    v_n := v_n+1;
  END LOOP;

  -- D9 estornos/chargebacks repetitivos por pagador (30d)
  FOR r IN
    SELECT o.payer_owner_id uid, count(*) n, sum(o.amount) total, max(e.created_at) ult
    FROM public.pay_payment_events e
    JOIN public.pay_payment_orders o ON o.id = e.payment_order_id
    WHERE e.created_at > v_ini AND o.payer_owner_id IS NOT NULL
      AND (e.provider_event_type ~* 'refund|charge.?back|cancel' OR e.status::text ~* 'refund|charged_back|cancel')
    GROUP BY 1 HAVING count(*) >= 2
  LOOP
    PERFORM public.fraud_register('estornos_repetitivos','financeiro','user', r.uid::text,
      least(50+r.n*10,100), least(55+r.n*10,100), 50, least(55+r.n*10,100), coalesce(r.total,0),
      jsonb_build_object('eventos_estorno_30d',r.n,'valor_total',r.total,'ultimo',r.ult,
        'criterio','>=2 eventos refund/chargeback/cancel do gateway p/ o mesmo pagador em 30d'),
      'refund:'||r.uid||':'||to_char(now(),'IYYY-IW'), r.uid);
    v_n := v_n+1;
  END LOOP;

  -- D10 compra de creditos suspeita (>=3 na mesma hora, ou paga com valor <= 0)
  FOR r IN
    SELECT store_id, date_trunc('hour', created_at) h, count(*) n, sum(coalesce(amount,amount_paid,0)) total
    FROM public.credit_purchases WHERE created_at > v_ini
    GROUP BY 1,2 HAVING count(*) >= 3
  LOOP
    PERFORM public.fraud_register('creditos_rajada','financeiro','loja', r.store_id::text,
      least(45+r.n*8,100), least(45+r.n*8,100), 35, least(50+r.n*8,100), coalesce(r.total,0),
      jsonb_build_object('compras_na_hora',r.n,'valor_total',r.total,'hora',r.h,
        'criterio','>=3 compras de credito da mesma loja na mesma hora'),
      'credburst:'||r.store_id||':'||to_char(r.h,'YYYYMMDDHH24'), NULL, r.store_id);
    v_n := v_n+1;
  END LOOP;

  FOR r IN
    SELECT id, store_id, coalesce(amount,amount_paid,0) v, credits, status, created_at
    FROM public.credit_purchases
    WHERE created_at > v_ini AND lower(coalesce(status,'')) IN ('paid','approved') AND coalesce(amount,amount_paid,0) <= 0
  LOOP
    PERFORM public.fraud_register('credito_pago_sem_valor','financeiro','pagamento', r.id::text,
      85, 90, 70, 95, 0,
      jsonb_build_object('compra',r.id,'creditos',r.credits,'valor',r.v,'status',r.status,'em',r.created_at,
        'criterio','compra de creditos com status pago e valor <= 0'),
      'credzero:'||r.id, NULL, r.store_id);
    v_n := v_n+1;
  END LOOP;

  -- ===== DELIVERY / CORRIDAS (tabelas hoje vazias; detectores prontos) =====
  -- D11 velocidade impossivel (>120 km/h medio na corrida)
  FOR r IN
    SELECT id, moto_taxi_id, passenger_id, estimated_km,
           extract(epoch FROM (finished_at-started_at)) seg
    FROM public.moto_taxi_corridas
    WHERE created_at > v_ini AND finished_at IS NOT NULL AND started_at IS NOT NULL
      AND finished_at > started_at AND coalesce(estimated_km,0) > 0
      AND estimated_km / nullif(extract(epoch FROM (finished_at-started_at))/3600.0,0) > 120
  LOOP
    PERFORM public.fraud_register('velocidade_impossivel','delivery','corrida', r.id::text,
      80, 60, 65, 85, 0,
      jsonb_build_object('km',r.estimated_km,'duracao_s',r.seg,
        'velocidade_kmh',round((r.estimated_km/nullif(r.seg/3600.0,0))::numeric,1),
        'criterio','velocidade media > 120 km/h entre started_at e finished_at'),
      'speed:'||r.id, r.passenger_id, NULL, r.moto_taxi_id, r.id);
    v_n := v_n+1;
  END LOOP;

  -- D12 corrida instantanea (finalizada <60s apos aceite com km >= 1)
  FOR r IN
    SELECT id, moto_taxi_id, passenger_id, estimated_km,
           extract(epoch FROM (finished_at-accepted_at)) seg
    FROM public.moto_taxi_corridas
    WHERE created_at > v_ini AND finished_at IS NOT NULL AND accepted_at IS NOT NULL
      AND extract(epoch FROM (finished_at-accepted_at)) < 60 AND coalesce(estimated_km,0) >= 1
  LOOP
    PERFORM public.fraud_register('corrida_instantanea','delivery','corrida', r.id::text,
      75, 55, 60, 85, 0,
      jsonb_build_object('km',r.estimated_km,'segundos_apos_aceite',r.seg,
        'criterio','corrida >=1km finalizada em <60s apos o aceite (entrega ficticia)'),
      'instant:'||r.id, r.passenger_id, NULL, r.moto_taxi_id, r.id);
    v_n := v_n+1;
  END LOOP;

  -- D13 cancelamentos em massa (>=5/24h por passageiro)
  FOR r IN
    SELECT passenger_id uid, count(*) n
    FROM public.moto_taxi_corridas
    WHERE canceled_at > now() - interval '24 hours'
    GROUP BY 1 HAVING count(*) >= 5
  LOOP
    PERFORM public.fraud_register('cancelamento_massa','delivery','user', r.uid::text,
      least(45+r.n*6,100), 25, 40, least(55+r.n*5,100), 0,
      jsonb_build_object('cancelamentos_24h',r.n,'criterio','>=5 corridas canceladas em 24h pelo mesmo passageiro'),
      'cancel:'||r.uid||':'||to_char(now(),'YYYY-MM-DD'), r.uid);
    v_n := v_n+1;
  END LOOP;

  -- D14 conluio passageiro x condutor (>=5 corridas do mesmo par no mesmo dia)
  FOR r IN
    SELECT passenger_id, moto_taxi_id, finished_at::date dia, count(*) n, sum(coalesce(net_amount,0)) total
    FROM public.moto_taxi_corridas
    WHERE finished_at > v_ini
    GROUP BY 1,2,3 HAVING count(*) >= 5
  LOOP
    PERFORM public.fraud_register('conluio_par','delivery','par', r.passenger_id||'+'||r.moto_taxi_id,
      least(55+r.n*7,100), least(50+r.n*8,100), 55, least(55+r.n*6,100), coalesce(r.total,0),
      jsonb_build_object('corridas_no_dia',r.n,'dia',r.dia,'valor',r.total,
        'criterio','mesmo par passageiro+condutor com >=5 corridas concluidas no mesmo dia'),
      'collusion:'||r.passenger_id||':'||r.moto_taxi_id||':'||to_char(r.dia,'YYYYMMDD'), r.passenger_id, NULL, r.moto_taxi_id);
    v_n := v_n+1;
  END LOOP;

  -- ===== USUARIOS / AUTOMACAO =====
  -- D15 automacao de cliques (>=30 cliques na mesma hora por visitante)
  FOR r IN
    SELECT CASE WHEN visitor_user_id IS NOT NULL THEN 'user:'||visitor_user_id ELSE 'anon:'||coalesce(anon_id::text,'?') END vk,
           max(visitor_user_id::text) uid, date_trunc('hour', created_at) h, count(*) n
    FROM public.marketplace_product_click_events
    WHERE created_at > v_ini AND (anon_id IS NOT NULL OR visitor_user_id IS NOT NULL)
    GROUP BY 1,3 HAVING count(*) >= 30
  LOOP
    PERFORM public.fraud_register('automacao_cliques','usuario','visitante', r.vk,
      least(50+r.n,100), 20, 45, least(60+r.n/2,100), 0,
      jsonb_build_object('cliques_na_hora',r.n,'hora',r.h,
        'criterio','>=30 cliques do mesmo visitante na mesma hora (padrao de bot)'),
      'autoclick:'||md5(r.vk)||':'||to_char(r.h,'YYYYMMDDHH24'), r.uid::uuid);
    v_n := v_n+1;
  END LOOP;

  -- D16 mudanca brusca de padrao (hoje >= 10x a media diaria de 30d, min 20)
  FOR r IN
    WITH hist AS (
      SELECT CASE WHEN visitor_user_id IS NOT NULL THEN 'user:'||visitor_user_id ELSE 'anon:'||coalesce(anon_id::text,'?') END vk,
             max(visitor_user_id::text) uid,
             count(*) FILTER (WHERE created_at::date = current_date) hoje,
             count(*) FILTER (WHERE created_at::date < current_date) antes,
             greatest(count(DISTINCT created_at::date) FILTER (WHERE created_at::date < current_date),1) dias
      FROM public.marketplace_product_click_events WHERE created_at > v_ini
      GROUP BY 1)
    SELECT vk, uid, hoje, round(antes::numeric/dias,1) media FROM hist
    WHERE hoje >= 20 AND antes > 0 AND hoje >= 10*(antes::numeric/dias)
  LOOP
    PERFORM public.fraud_register('mudanca_brusca','usuario','visitante', r.vk,
      60, 20, 40, 70, 0,
      jsonb_build_object('eventos_hoje',r.hoje,'media_diaria_30d',r.media,
        'criterio','atividade de hoje >= 10x a media diaria historica (minimo 20 eventos)'),
      'burst:'||md5(r.vk)||':'||to_char(now(),'YYYY-MM-DD'), r.uid::uuid);
    v_n := v_n+1;
  END LOOP;

  -- ===== IA / ALGORITMOS =====
  -- D17 exploracao de ranking (mesmo visitante x mesmo anuncio >=15 cliques/24h)
  FOR r IN
    SELECT CASE WHEN visitor_user_id IS NOT NULL THEN 'user:'||visitor_user_id ELSE 'anon:'||coalesce(anon_id::text,'?') END vk,
           max(visitor_user_id::text) uid, product_id, count(*) n
    FROM public.marketplace_product_click_events
    WHERE created_at > now() - interval '24 hours' AND product_id IS NOT NULL
    GROUP BY 1,3 HAVING count(*) >= 15
  LOOP
    PERFORM public.fraud_register('exploracao_ranking','ia','visitante', r.vk,
      least(55+r.n*2,100), 25, 50, least(60+r.n*2,100), 0,
      jsonb_build_object('produto',r.product_id,'cliques_24h',r.n,
        'criterio','>=15 cliques do mesmo visitante no mesmo anuncio em 24h (inflar ranking/recomendacao AI-35)'),
      'rankexp:'||md5(r.vk)||':'||r.product_id||':'||to_char(now(),'YYYY-MM-DD'), r.uid::uuid);
    v_n := v_n+1;
  END LOOP;

  PERFORM public.fraud_emit('fraud.scan', jsonb_build_object('deteccoes',v_n,'trace',v_trace));
  RETURN jsonb_build_object('ok',true,'deteccoes',v_n,'trace',v_trace,
    'lacunas_declaradas', jsonb_build_array('cupons/cashback: sem tabelas no banco','reviews: sem tabela',
      'carteira: esquema nao validado/vazio','dup de anuncio por vertical: aguarda consolidacao de catalogo',
      'GPS delivery: exige telemetria do app'));
END$$;

-- ----------------------------------------------------------------------------
-- 6) detect_fraud(tipo, id) — score sob demanda p/ pedidos/pagamentos/usuarios
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_fraud(p_tipo text, p_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; v_fs int; v_fr int; v_ft int; v_fc int; v_n int;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'detect_fraud: acesso negado (somente admin/service)';
  END IF;
  SELECT count(*), coalesce(max(fraud_score),0), coalesce(max(financial_risk),0),
         coalesce(max(trust_impact),0), coalesce(round(avg(confidence))::int,0)
    INTO v_n, v_fs, v_fr, v_ft, v_fc
  FROM public.orion_fraud_events
  WHERE status NOT IN ('falso_positivo','resolvida')
    AND (entidade_id = p_id OR user_id::text = p_id OR merchant_id::text = p_id OR order_id::text = p_id)
    AND (p_tipo IS NULL OR entidade_tipo = p_tipo OR categoria = p_tipo);
  v := jsonb_build_object(
    'entidade', jsonb_build_object('tipo',p_tipo,'id',p_id),
    'eventos_ativos', v_n,
    'fraud_score', v_fs, 'financial_risk', v_fr,
    'trust_score', greatest(0,100-v_ft), 'confidence', v_fc,
    'risco', CASE WHEN v_fs>=80 THEN 'critico' WHEN v_fs>=60 THEN 'alto' WHEN v_fs>=40 THEN 'medio' ELSE 'baixo' END,
    'acao_recomendada', CASE WHEN v_fs>=80 THEN 'revisao_manual'
                             WHEN v_fs>=60 THEN 'validacao_adicional'
                             WHEN v_fs>=40 THEN 'monitoramento' ELSE 'nenhuma' END,
    'eventos', (SELECT coalesce(jsonb_agg(jsonb_build_object('fraud_id',fraud_id,'tipo',tipo,'severity',severity,
        'fraud_score',fraud_score,'status',status,'evidencias',evidencias,'detected_at',detected_at) ORDER BY fraud_score DESC),'[]'::jsonb)
      FROM public.orion_fraud_events
      WHERE (entidade_id = p_id OR user_id::text = p_id OR merchant_id::text = p_id OR order_id::text = p_id)
        AND (p_tipo IS NULL OR entidade_tipo = p_tipo OR categoria = p_tipo)),
    'nota', 'toda classificacao tem evidencia; acoes de alto impacto exigem aprovacao humana');
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 7) RESPOSTA por politica (recomenda/alerta; NUNCA bloqueia sozinho)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fraud_respond()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_a int := 0;
BEGIN
  FOR r IN
    SELECT e.* FROM public.orion_fraud_events e
    WHERE e.status = 'detectada' AND e.severity IN ('critica','alta')
      AND NOT EXISTS (SELECT 1 FROM public.orion_fraud_actions a WHERE a.fraud_id = e.fraud_id)
  LOOP
    INSERT INTO public.orion_fraud_actions (fraud_id, acao, motivo, politica, resultado, operador)
    VALUES (r.fraud_id,
      CASE WHEN r.severity='critica' THEN 'revisao_manual' ELSE 'validacao_adicional' END,
      r.tipo||' FS='||r.fraud_score||' ('||r.categoria||')', 'fraud_politica_v1', 'aplicada', 'fraud_detection');
    UPDATE public.orion_fraud_events SET status='em_analise', updated_at=now() WHERE fraud_id=r.fraud_id;
    IF NOT EXISTS (SELECT 1 FROM public.orion_ai_alerts WHERE tipo='fraud:'||r.tipo AND dia=current_date) THEN
      INSERT INTO public.orion_ai_alerts (tipo, severidade, mensagem, valor, threshold, dia)
      VALUES ('fraud:'||r.tipo, CASE WHEN r.severity='critica' THEN 'critico' ELSE 'atencao' END,
              'AI-41: '||r.tipo||' ('||r.categoria||') FS='||r.fraud_score||' entidade='||r.entidade_id,
              r.fraud_score, 60, current_date);
    END IF;
    v_a := v_a+1;
  END LOOP;
  IF v_a > 0 THEN PERFORM public.fraud_emit('fraud.respond', jsonb_build_object('acoes',v_a)); END IF;
  PERFORM public.fraud_bridge_cyber();
  RETURN jsonb_build_object('ok',true,'acoes',v_a);
END$$;

-- ponte Security Ecosystem: espelha casos alta/critica na base comum do AI-40
-- (orion_cyber_events; idempotente por dedupe 'fraud:<id>'; defensiva se AI-40 ausente)
CREATE OR REPLACE FUNCTION public.fraud_bridge_cyber()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v int := 0;
BEGIN
  INSERT INTO public.orion_cyber_events (dedupe_key, origem, tipo, severidade, modulo, descricao, evidencias, confianca, score, user_id)
  SELECT 'fraud:'||e.fraud_id, 'fraud_detection', 'fraud:'||e.tipo, e.severity, e.categoria,
         'AI-41 '||e.tipo||' FS='||e.fraud_score||' entidade='||e.entidade_id,
         e.evidencias, e.confidence, e.fraud_score, e.user_id
  FROM public.orion_fraud_events e
  WHERE e.severity IN ('alta','critica') AND e.status IN ('detectada','em_analise')
    AND NOT EXISTS (SELECT 1 FROM public.orion_cyber_events c WHERE c.dedupe_key='fraud:'||e.fraud_id);
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN 0;
END$$;

-- marcacao humana (confirmada/falso_positivo/resolvida) — auditada
CREATE OR REPLACE FUNCTION public.fraud_mark(p_fraud_id bigint, p_status text, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'fraud_mark: somente admin';
  END IF;
  IF p_status NOT IN ('em_analise','confirmada','falso_positivo','resolvida') THEN
    RAISE EXCEPTION 'fraud_mark: status invalido %', p_status;
  END IF;
  UPDATE public.orion_fraud_events SET status=p_status, updated_at=now() WHERE fraud_id=p_fraud_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'fraud_mark: evento % nao existe', p_fraud_id; END IF;
  INSERT INTO public.orion_fraud_actions (fraud_id, acao, motivo, politica, resultado, operador)
  VALUES (p_fraud_id, 'marcacao_status', coalesce(p_motivo,'marcado como '||p_status), 'revisao_humana', 'aplicada', coalesce(auth.uid()::text,'admin'));
  PERFORM public.fraud_emit('fraud.mark', jsonb_build_object('fraud_id',p_fraud_id,'status',p_status));
  RETURN jsonb_build_object('ok',true,'fraud_id',p_fraud_id,'status',p_status);
END$$;

-- rollback de acao automatizada (linha compensatoria; nada e apagado)
CREATE OR REPLACE FUNCTION public.fraud_action_rollback(p_action_id bigint, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'fraud_action_rollback: somente admin';
  END IF;
  SELECT * INTO r FROM public.orion_fraud_actions WHERE action_id=p_action_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'acao % nao existe', p_action_id; END IF;
  IF EXISTS (SELECT 1 FROM public.orion_fraud_actions WHERE rollback_de=p_action_id) THEN
    RETURN jsonb_build_object('ok',false,'motivo','acao ja revertida');
  END IF;
  INSERT INTO public.orion_fraud_actions (fraud_id, acao, motivo, politica, resultado, rollback_de, operador)
  VALUES (r.fraud_id, 'rollback', coalesce(p_motivo,'rollback da acao '||p_action_id), r.politica, 'aplicada', p_action_id, coalesce(auth.uid()::text,'admin'));
  UPDATE public.orion_fraud_events SET status='detectada', updated_at=now()
   WHERE fraud_id=r.fraud_id AND status='em_analise';
  PERFORM public.fraud_emit('fraud.rollback', jsonb_build_object('action_id',p_action_id));
  RETURN jsonb_build_object('ok',true,'revertida',p_action_id);
END$$;

-- ----------------------------------------------------------------------------
-- 8) PADROES + ESTATISTICAS (rollups idempotentes)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fraud_patterns_rollup()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.orion_fraud_patterns (pattern_key, descricao, frequencia, risco, ia_responsavel, ultima_ocorrencia, updated_at)
  SELECT tipo, max(coalesce(evidencias->>'criterio','')), count(*), round(avg(fraud_score))::int,
         'fraud_detection', max(detected_at), now()
  FROM public.orion_fraud_events GROUP BY tipo
  ON CONFLICT (pattern_key) DO UPDATE SET descricao=excluded.descricao, frequencia=excluded.frequencia,
    risco=excluded.risco, ultima_ocorrencia=excluded.ultima_ocorrencia, updated_at=now();
$$;

CREATE OR REPLACE FUNCTION public.fraud_statistics_rollup()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.orion_fraud_statistics
    (dia, fraudes_detectadas, fraudes_confirmadas, falsos_positivos, em_analise,
     perdas_evitadas, tempo_medio_resposta_s, fpr, fdr, updated_at)
  SELECT current_date,
    count(*) FILTER (WHERE detected_at::date=current_date),
    count(*) FILTER (WHERE status='confirmada' AND updated_at::date=current_date),
    count(*) FILTER (WHERE status='falso_positivo' AND updated_at::date=current_date),
    count(*) FILTER (WHERE status='em_analise'),
    coalesce(sum(valor_envolvido) FILTER (WHERE severity IN ('alta','critica')
      AND status IN ('em_analise','confirmada') AND detected_at::date=current_date),0),
    coalesce((SELECT round(avg(extract(epoch FROM (a.created_at-e.detected_at))))::int
       FROM public.orion_fraud_actions a JOIN public.orion_fraud_events e ON e.fraud_id=a.fraud_id
       WHERE a.created_at::date=current_date AND a.operador='fraud_detection'),0),
    round(coalesce(count(*) FILTER (WHERE status='falso_positivo')::numeric / nullif(count(*),0),0),4),
    round(coalesce(count(*) FILTER (WHERE status='confirmada')::numeric / nullif(count(*),0),0),4),
    now()
  FROM public.orion_fraud_events
  ON CONFLICT (dia) DO UPDATE SET fraudes_detectadas=excluded.fraudes_detectadas,
    fraudes_confirmadas=excluded.fraudes_confirmadas, falsos_positivos=excluded.falsos_positivos,
    em_analise=excluded.em_analise, perdas_evitadas=excluded.perdas_evitadas,
    tempo_medio_resposta_s=excluded.tempo_medio_resposta_s, fpr=excluded.fpr, fdr=excluded.fdr, updated_at=now();
$$;

-- ----------------------------------------------------------------------------
-- 9) PAINEIS (leitura agregada)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fraud_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'fs_medio', (SELECT coalesce(round(avg(fraud_score))::int,0) FROM public.orion_fraud_events WHERE status NOT IN ('falso_positivo','resolvida')),
    'fr_medio', (SELECT coalesce(round(avg(financial_risk))::int,0) FROM public.orion_fraud_events WHERE status NOT IN ('falso_positivo','resolvida')),
    'ft_medio', (SELECT greatest(0,100-coalesce(round(avg(trust_impact))::int,0)) FROM public.orion_fraud_events WHERE status NOT IN ('falso_positivo','resolvida')),
    'fc_medio', (SELECT coalesce(round(avg(confidence))::int,0) FROM public.orion_fraud_events WHERE status NOT IN ('falso_positivo','resolvida')),
    'fraudes_hoje', (SELECT count(*) FROM public.orion_fraud_events WHERE detected_at::date=current_date),
    'em_analise', (SELECT count(*) FROM public.orion_fraud_events WHERE status='em_analise'),
    'confirmadas', (SELECT count(*) FROM public.orion_fraud_events WHERE status='confirmada'),
    'falsos_positivos', (SELECT count(*) FROM public.orion_fraud_events WHERE status='falso_positivo'),
    'criticas_abertas', (SELECT count(*) FROM public.orion_fraud_events WHERE severity='critica' AND status IN ('detectada','em_analise')),
    'perdas_evitadas_30d', (SELECT coalesce(sum(perdas_evitadas),0) FROM public.orion_fraud_statistics WHERE dia > current_date-30),
    'fpr', (SELECT coalesce(fpr,0) FROM public.orion_fraud_statistics WHERE dia=current_date),
    'fdr', (SELECT coalesce(fdr,0) FROM public.orion_fraud_statistics WHERE dia=current_date),
    'tendencia_7d', (SELECT count(*) FROM public.orion_fraud_events WHERE detected_at > now()-interval '7 days'),
    'tendencia_7d_anterior', (SELECT count(*) FROM public.orion_fraud_events WHERE detected_at BETWEEN now()-interval '14 days' AND now()-interval '7 days'),
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.fraud_panel(p_categoria text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'categoria', p_categoria,
    'total', (SELECT count(*) FROM public.orion_fraud_events WHERE categoria=p_categoria),
    'abertas', (SELECT count(*) FROM public.orion_fraud_events WHERE categoria=p_categoria AND status IN ('detectada','em_analise')),
    'por_tipo', (SELECT coalesce(jsonb_object_agg(tipo,n),'{}'::jsonb) FROM
      (SELECT tipo, count(*) n FROM public.orion_fraud_events WHERE categoria=p_categoria GROUP BY tipo) x),
    'valor_envolvido', (SELECT coalesce(sum(valor_envolvido),0) FROM public.orion_fraud_events WHERE categoria=p_categoria AND status NOT IN ('falso_positivo')),
    'eventos', (SELECT coalesce(jsonb_agg(jsonb_build_object('fraud_id',fraud_id,'tipo',tipo,'entidade',entidade_id,
        'severity',severity,'fs',fraud_score,'fc',confidence,'status',status,'valor',valor_envolvido,
        'evidencias',evidencias,'em',detected_at) ORDER BY fraud_score DESC, detected_at DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_fraud_events WHERE categoria=p_categoria ORDER BY fraud_score DESC, detected_at DESC LIMIT 25) e));
$$;

CREATE OR REPLACE FUNCTION public.fraud_heatmap()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'por_cidade', (SELECT coalesce(jsonb_object_agg(coalesce(p.cidade,'(sem cidade)'),n),'{}'::jsonb) FROM
      (SELECT e.user_id, count(*) n FROM public.orion_fraud_events e WHERE e.user_id IS NOT NULL GROUP BY 1) x
      JOIN public.profiles p ON p.id=x.user_id),
    'por_estado', (SELECT coalesce(jsonb_object_agg(coalesce(p.estado,'(sem estado)'),n),'{}'::jsonb) FROM
      (SELECT e.user_id, count(*) n FROM public.orion_fraud_events e WHERE e.user_id IS NOT NULL GROUP BY 1) x
      JOIN public.profiles p ON p.id=x.user_id),
    'por_categoria', (SELECT coalesce(jsonb_object_agg(categoria,n),'{}'::jsonb) FROM
      (SELECT categoria, count(*) n FROM public.orion_fraud_events GROUP BY 1) x),
    'por_hora', (SELECT coalesce(jsonb_object_agg(h,n),'{}'::jsonb) FROM
      (SELECT extract(hour FROM detected_at)::int h, count(*) n FROM public.orion_fraud_events GROUP BY 1) x),
    'nota', 'cidade/estado via perfil do usuario envolvido; eventos sem user_id ficam fora do mapa (DECLARADO)');
$$;

CREATE OR REPLACE FUNCTION public.fraud_ranking()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'padroes', (SELECT coalesce(jsonb_agg(jsonb_build_object('padrao',pattern_key,'descricao',descricao,
        'frequencia',frequencia,'risco',risco,'ultima',ultima_ocorrencia) ORDER BY frequencia DESC),'[]'::jsonb)
      FROM public.orion_fraud_patterns),
    'reincidentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'eventos',n,'fs_max',fs) ORDER BY n DESC),'[]'::jsonb)
      FROM (SELECT user_id, count(*) n, max(fraud_score) fs FROM public.orion_fraud_events
            WHERE user_id IS NOT NULL AND status NOT IN ('falso_positivo') GROUP BY 1 HAVING count(*)>1 ORDER BY n DESC LIMIT 10) x),
    'lojas_em_analise', (SELECT coalesce(jsonb_agg(jsonb_build_object('merchant_id',merchant_id,'eventos',n) ORDER BY n DESC),'[]'::jsonb)
      FROM (SELECT merchant_id, count(*) n FROM public.orion_fraud_events
            WHERE merchant_id IS NOT NULL AND status='em_analise' GROUP BY 1 ORDER BY n DESC LIMIT 10) x),
    'tipos', (SELECT coalesce(jsonb_object_agg(tipo,n),'{}'::jsonb) FROM
      (SELECT tipo, count(*) n FROM public.orion_fraud_events GROUP BY 1) x));
$$;

CREATE OR REPLACE FUNCTION public.fraud_metrics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'eventos', (SELECT count(*) FROM public.orion_fraud_events),
    'padroes', (SELECT count(*) FROM public.orion_fraud_patterns),
    'acoes', (SELECT count(*) FROM public.orion_fraud_actions),
    'dias_com_estatistica', (SELECT count(*) FROM public.orion_fraud_statistics),
    'eventos_bus', (SELECT count(*) FROM public.orion_eventos WHERE origem='fraud_detection'),
    'estatisticas_7d', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'detectadas',fraudes_detectadas,
        'confirmadas',fraudes_confirmadas,'fp',falsos_positivos,'elp',perdas_evitadas,'resposta_s',tempo_medio_resposta_s) ORDER BY dia DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_fraud_statistics ORDER BY dia DESC LIMIT 7) x),
    'acoes_recentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('action_id',action_id,'fraud_id',fraud_id,'acao',acao,
        'motivo',motivo,'resultado',resultado,'rollback_de',rollback_de,'operador',operador,'em',created_at) ORDER BY action_id DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_fraud_actions ORDER BY action_id DESC LIMIT 15) x));
$$;

CREATE OR REPLACE FUNCTION public.fraud_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'overview', public.fraud_overview(),
    'conta', public.fraud_panel('conta'),
    'marketplace', public.fraud_panel('marketplace'),
    'delivery', public.fraud_panel('delivery'),
    'financeiro', public.fraud_panel('financeiro'),
    'usuario', public.fraud_panel('usuario'),
    'ia', public.fraud_panel('ia'),
    'heatmap', public.fraud_heatmap(),
    'ranking', public.fraud_ranking(),
    'metrics', public.fraud_metrics(),
    'lacunas', jsonb_build_array(
      'cupons/cashback: nao existem tabelas no banco (DECLARADO)',
      'avaliacoes falsas: sem tabela de reviews (DECLARADO)',
      'carteira: wallet_transactions vazia, esquema nao validado (DECLARADO)',
      'anuncio duplicado/preco por vertical: aguarda consolidacao de catalogo (DECLARADO)',
      'GPS de entrega: exige telemetria do app (DECLARADO)',
      'integracao AI-40: casos alta/critica espelhados em orion_cyber_events (fraud_bridge_cyber)'));
$$;

CREATE OR REPLACE FUNCTION public.fraud_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.fraud_summary();
  PERFORM public.fraud_emit('fraud.score', jsonb_build_object('fs_medio', v->'overview'->'fs_medio'));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 10) TICK */2 (motor incremental: scan -> respond -> rollups)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_fraud_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fraud_scan('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
  PERFORM public.fraud_respond();
  PERFORM public.fraud_patterns_rollup();
  PERFORM public.fraud_statistics_rollup();
END$$;

-- ----------------------------------------------------------------------------
-- 11) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.fraud_scan(text)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.detect_fraud(text,text)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fraud_respond()                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fraud_mark(bigint,text,text)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fraud_action_rollback(bigint,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fraud_patterns_rollup()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fraud_statistics_rollup()          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fraud_overview()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fraud_panel(text)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fraud_heatmap()                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fraud_ranking()                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fraud_metrics()                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fraud_summary()                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fraud_dashboard()                  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 12) PROMPT REGISTRY (5 prompts GPT-5-mini via AI-00 Gateway)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('fraud.explain',
 'Voce e o ORION Fraud Detection (AI-41). Explique a fraude detectada usando SOMENTE as evidencias fornecidas (tipo, criterio, contagens, valores). Nunca acuse sem evidencia; diga o que foi observado e por que dispara o padrao. Portugues claro para operacao.',
 'ORION-AI-41 seed');
SELECT public.orion_ai_prompt_set('fraud.false_positive',
 'Voce e o ORION Fraud Detection (AI-41). Analise se o caso pode ser falso positivo: contraste as evidencias com explicacoes legitimas plausiveis (teste interno, familia compartilhando telefone/dispositivo, retentativa de pagamento). Conclua com recomendacao de marcacao e o que verificar.',
 'ORION-AI-41 seed');
SELECT public.orion_ai_prompt_set('fraud.evidence',
 'Voce e o ORION Fraud Detection (AI-41). Liste e explique cada evidencia do caso em linguagem simples, citando os numeros reais (quantidades, valores, janelas de tempo). Nunca invente dados fora do JSON de evidencias.',
 'ORION-AI-41 seed');
SELECT public.orion_ai_prompt_set('fraud.action',
 'Voce e o ORION Fraud Detection (AI-41). Sugira a acao proporcional a severidade (observar, monitorar, validacao adicional, revisao manual). Acoes de alto impacto (bloqueio, estorno) SEMPRE dependem de aprovacao humana — voce recomenda, nunca executa.',
 'ORION-AI-41 seed');
SELECT public.orion_ai_prompt_set('fraud.financial_report',
 'Voce e o ORION Fraud Detection (AI-41). Gere um relatorio financeiro executivo das fraudes do periodo: total detectado, confirmado, falsos positivos, perdas evitadas (ELP e uma ESTIMATIVA declarada), padroes mais caros. Somente numeros fornecidos.',
 'ORION-AI-41 seed');

-- ----------------------------------------------------------------------------
-- 13) MODEL PREF + CRON */2
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('fraud_detection','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_fraud_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_fraud_tick');
    PERFORM cron.schedule('orion_fraud_tick','*/2 * * * *','SELECT public.orion_fraud_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_fraud_tick');
--   DROP FUNCTION IF EXISTS public.orion_fraud_tick, public.fraud_dashboard, public.fraud_summary,
--     public.fraud_metrics, public.fraud_ranking, public.fraud_heatmap, public.fraud_panel(text),
--     public.fraud_overview, public.fraud_statistics_rollup, public.fraud_patterns_rollup,
--     public.fraud_action_rollback(bigint,text), public.fraud_mark(bigint,text,text), public.fraud_respond,
--     public.detect_fraud(text,text), public.fraud_scan(text),
--     public.fraud_register(text,text,text,text,bigint,bigint,bigint,bigint,numeric,jsonb,text,uuid,uuid,uuid,uuid),
--     public.fraud_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.orion_fraud_statistics, public.orion_fraud_actions,
--     public.orion_fraud_patterns, public.orion_fraud_events;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='fraud_detection';
--   DELETE FROM public.orion_ai_prompts WHERE chave LIKE 'fraud.%';
-- ============================================================================
