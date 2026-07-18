-- ════════════════════════════════════════════════════════════════════════════
-- ORION-AI-74 — Trust & Reputation AI v1.0
-- Chave técnica: trust_reputation · Namespace: orion_rep_* · Painel: /admin/orion-trust-center
--
-- NÃO COLIDE com o AI-20 (`trust` / orion_trust_*): o AI-20 é a camada de
-- confiança por ENTIDADE (account/merchant/listing/buyer). O AI-74 é a camada
-- de REPUTAÇÃO POR USUÁRIO do marketplace+leilões (Trust Score 0-100, selos,
-- verificações, dashboard do usuário) e REUSA AI-20/41/42/ALC como fontes.
--
-- Filosofia (convenções congeladas do ecossistema):
--   · READ-ONLY sobre o domínio — escreve SOMENTE em orion_rep_*
--   · Explicável: todo score com fatores + _auditoria (n + fontes + lacunas)
--   · RECOMENDA, nunca executa/bloqueia · Idempotente · Histórico imutável
--   · RLS + REVOKE ALL/GRANT SELECT + REVOKE EXECUTE FROM PUBLIC, anon
--
-- Fontes REAIS (sondadas em produção 2026-07-18):
--   profiles, auth.users, pay_payment_orders (status ENUM→::text),
--   orion_alc_deals/ratings/disputes (estrutura viva; ratings/disputes n=0 DECLARADO),
--   auction_bids, orion_auction_settlements, arremate_offers,
--   advertiser_listings+advertiser_accounts, product_listings,
--   advertiser_contact_intentions, support_tickets,
--   orion_fraud_events (AI-41: severity critica/alta/media; aberto = status NOT IN
--   ('falso_positivo','resolvida','descartada')), orion_identity_profiles (AI-42).
-- LACUNAS DECLARADAS (nunca inventadas): confirmação facial (sem fonte),
--   taxa/tempo de resposta de mensagens (sem fonte), devoluções (sem fonte),
--   AutoBid AI-72 e Dynamic Pricing AI-73 (descoberta futura — hoje ausentes/vazios).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. TABELAS ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.orion_rep_scores (
  user_id       uuid PRIMARY KEY,
  trust_score   numeric(5,2) NOT NULL CHECK (trust_score >= 0 AND trust_score <= 100),
  nivel         text NOT NULL,
  sub_scores    jsonb NOT NULL DEFAULT '{}'::jsonb,
  fatores       jsonb NOT NULL DEFAULT '[]'::jsonb,
  fatores_positivos jsonb NOT NULL DEFAULT '[]'::jsonb,
  fatores_negativos jsonb NOT NULL DEFAULT '[]'::jsonb,
  papeis        jsonb NOT NULL DEFAULT '{}'::jsonb,
  _auditoria    jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orion_rep_history (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL,
  dia         date NOT NULL DEFAULT current_date,
  trust_score numeric(5,2) NOT NULL,
  nivel       text NOT NULL,
  sub_scores  jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dia)
);

CREATE TABLE IF NOT EXISTS public.orion_rep_events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL,
  tipo       text NOT NULL,
  detalhes   jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL UNIQUE,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orion_rep_badges_catalog (
  badge_key  text PRIMARY KEY,
  nome       text NOT NULL,
  descricao  text NOT NULL,
  icone      text NOT NULL DEFAULT '🏅',
  regra      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo      boolean NOT NULL DEFAULT true,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orion_rep_badges (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid NOT NULL,
  badge_key    text NOT NULL REFERENCES public.orion_rep_badges_catalog(badge_key),
  evidencia    jsonb NOT NULL DEFAULT '{}'::jsonb,
  concedido_em timestamptz NOT NULL DEFAULT now(),
  revogado_em  timestamptz,
  UNIQUE (user_id, badge_key)
);

CREATE TABLE IF NOT EXISTS public.orion_rep_verifications (
  user_id       uuid PRIMARY KEY,
  email         jsonb NOT NULL DEFAULT '{}'::jsonb,
  telefone      jsonb NOT NULL DEFAULT '{}'::jsonb,
  documento     jsonb NOT NULL DEFAULT '{}'::jsonb,
  facial        jsonb NOT NULL DEFAULT '{}'::jsonb,
  identidade    jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orion_rep_recommendations (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid NOT NULL,
  tipo         text NOT NULL,
  titulo       text NOT NULL,
  motivo       jsonb NOT NULL DEFAULT '{}'::jsonb,
  prioridade   text NOT NULL DEFAULT 'media',
  status       text NOT NULL DEFAULT 'aberta',
  dedupe_key   text NOT NULL UNIQUE,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz
);

CREATE TABLE IF NOT EXISTS public.orion_rep_alerts (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid,
  tipo       text NOT NULL,
  severidade text NOT NULL DEFAULT 'media',
  titulo     text NOT NULL,
  detalhes   jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL UNIQUE,
  status     text NOT NULL DEFAULT 'aberto',
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orion_rep_audit_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  executado_em  timestamptz NOT NULL DEFAULT now(),
  origem        text NOT NULL DEFAULT 'tick',
  duracao_ms    integer,
  usuarios      integer,
  alertas       integer,
  badges        integer,
  recomendacoes integer,
  detalhes      jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS orion_rep_history_user_idx ON public.orion_rep_history (user_id, dia DESC);
CREATE INDEX IF NOT EXISTS orion_rep_alerts_status_idx ON public.orion_rep_alerts (status, criado_em DESC);
CREATE INDEX IF NOT EXISTS orion_rep_recs_user_idx ON public.orion_rep_recommendations (user_id, status);

-- ─── 2. RLS + GRANTS ────────────────────────────────────────────────────────

DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_rep_scores','orion_rep_history','orion_rep_events',
    'orion_rep_badges_catalog','orion_rep_badges','orion_rep_verifications',
    'orion_rep_recommendations','orion_rep_alerts','orion_rep_audit_log']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $rls$;

-- próprias linhas OU admin
DO $pol$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_rep_scores','orion_rep_history','orion_rep_events',
    'orion_rep_badges','orion_rep_verifications','orion_rep_recommendations']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS rep_select_own_or_admin ON public.%I', t);
    EXECUTE format($f$CREATE POLICY rep_select_own_or_admin ON public.%I FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin))$f$, t);
  END LOOP;
END $pol$;

DROP POLICY IF EXISTS rep_catalog_select_all ON public.orion_rep_badges_catalog;
CREATE POLICY rep_catalog_select_all ON public.orion_rep_badges_catalog
  FOR SELECT TO authenticated USING (true);

DO $pol2$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_rep_alerts','orion_rep_audit_log']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS rep_select_admin ON public.%I', t);
    EXECUTE format($f$CREATE POLICY rep_select_admin ON public.%I FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin))$f$, t);
  END LOOP;
END $pol2$;

-- ─── 3. CATÁLOGO DE SELOS (10, spec AI-74) ──────────────────────────────────

INSERT INTO public.orion_rep_badges_catalog (badge_key, nome, descricao, icone, regra) VALUES
 ('vendedor_verificado',  'Vendedor Verificado',     'Documento + e-mail confirmados e ao menos 1 anúncio ativo',                      '🛡️', '{"doc":true,"email":true,"anuncios_min":1}'),
 ('comprador_verificado', 'Comprador Verificado',    'Documento + e-mail confirmados e ao menos 1 pagamento aprovado',                 '✅', '{"doc":true,"email":true,"pagamentos_min":1}'),
 ('pagador_pontual',      'Pagador Pontual',         'Pelo menos 3 pagamentos com taxa de aprovação ≥ 90%',                            '⏰', '{"pagos_min":3,"taxa_min":0.9}'),
 ('entrega_confiavel',    'Entrega Confiável',       'Pelo menos 3 negociações concluídas como vendedor sem disputa',                  '📦', '{"deals_seller_min":3,"disputas":0}'),
 ('top_vendedor',         'Top Vendedor',            'Subscore vendedor ≥ 85 com 5+ vendas concluídas',                                '🏆', '{"sub_vendedor_min":85,"vendas_min":5}'),
 ('top_comprador',        'Top Comprador',           'Subscore comprador ≥ 85 com 5+ compras concluídas',                              '🥇', '{"sub_comprador_min":85,"compras_min":5}'),
 ('especialista_leiloes', 'Especialista em Leilões', '10+ lances e 2+ arremates honrados (pagamento confirmado)',                      '🔨', '{"lances_min":10,"arremates_honrados_min":2}'),
 ('alta_reputacao',       'Alta Reputação',          'Trust Score ≥ 80 mantido por 7+ dias',                                           '⭐', '{"score_min":80,"dias_min":7}'),
 ('excelente_atendimento','Excelente Atendimento',   'Avaliação média ≥ 4,5 com 3+ avaliações recebidas',                              '💬', '{"stars_min":4.5,"avaliacoes_min":3}'),
 ('negociacao_segura',    'Negociação Segura',       'Sem fraude e sem disputa, score ≥ 65 e 1+ negociação concluída',                 '🤝', '{"fraude":0,"disputas":0,"score_min":65,"deals_min":1}')
ON CONFLICT (badge_key) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, regra = EXCLUDED.regra, ativo = true;

-- ─── 4. NÍVEL ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rep_nivel(p_score numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN p_score >= 95 THEN 'elite'
    WHEN p_score >= 80 THEN 'excelente'
    WHEN p_score >= 65 THEN 'confiavel'
    WHEN p_score >= 50 THEN 'regular'
    WHEN p_score >= 30 THEN 'atencao'
    ELSE 'alto_risco' END
$fn$;

-- ─── 5. MOTOR: cálculo por usuário ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rep_compute_user(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  -- perfil
  v_created_at timestamptz; v_avatar text; v_cidade text; v_nome text;
  v_completo boolean; v_termos boolean; v_cpf text; v_cpf_cnpj text;
  v_whatsapp text; v_telefone text;
  -- auth
  v_email_conf timestamptz; v_phone_conf timestamptz;
  -- identidade AI-42
  v_identity_score numeric; v_identity_nivel text;
  -- financeiro
  v_paid int; v_failed int; v_pending int; v_valor_pago numeric;
  -- comprador
  v_deals_b_concl int; v_deals_b_cancel int; v_stars_avg numeric; v_stars_n int;
  -- vendedor
  v_ads_total int; v_ads_qual int; v_aci_total int; v_aci_unlock int;
  v_deals_s_concl int; v_deals_s_cancel int;
  -- leilão
  v_bids int; v_settl_winner int; v_settl_honrados int; v_settl_seller int;
  v_disputas_abertas int;
  -- risco
  v_fraude_aberta int; v_fraude_impacto numeric; v_tickets_30d int;
  -- montagem
  v_months numeric; v_pontos numeric; v_poss numeric;
  s_cadastro numeric; s_verif numeric; s_fin numeric := NULL; s_comprador numeric := NULL;
  s_vendedor numeric := NULL; s_leilao numeric := NULL; s_risco numeric;
  v_num numeric := 0; v_den numeric := 0;
  v_score numeric; v_nivel text; v_nivel_old text;
  v_fatores jsonb := '[]'::jsonb; v_ausentes jsonb := '[]'::jsonb;
  v_pos jsonb := '[]'::jsonb; v_neg jsonb := '[]'::jsonb;
BEGIN
  SELECT p.created_at, p.avatar_url, p.cidade, p.name, coalesce(p.profile_complete,false),
         coalesce(p.terms_accepted,false), p.cpf, p.cpf_cnpj, p.whatsapp, p.telefone
    INTO v_created_at, v_avatar, v_cidade, v_nome, v_completo, v_termos, v_cpf, v_cpf_cnpj, v_whatsapp, v_telefone
    FROM profiles p WHERE p.id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'erro', 'perfil não encontrado'); END IF;

  SELECT u.email_confirmed_at, u.phone_confirmed_at INTO v_email_conf, v_phone_conf
    FROM auth.users u WHERE u.id = p_user_id;

  SELECT i.identity_score, i.nivel_confianca INTO v_identity_score, v_identity_nivel
    FROM orion_identity_profiles i WHERE i.user_id = p_user_id LIMIT 1;

  -- customer: payer_owner_id = user · merchant_store: created_by = dono da loja
  -- platform (institucional) EXCLUÍDO da reputação pessoal por design
  SELECT count(*) FILTER (WHERE o.status::text = 'paid')::int,
         count(*) FILTER (WHERE o.status::text = 'failed')::int,
         count(*) FILTER (WHERE o.status::text IN ('pending','waiting_payment'))::int,
         coalesce(sum(o.amount) FILTER (WHERE o.status::text = 'paid'), 0)
    INTO v_paid, v_failed, v_pending, v_valor_pago
    FROM pay_payment_orders o
   WHERE (o.payer_owner_type::text = 'customer' AND o.payer_owner_id = p_user_id)
      OR (o.payer_owner_type::text = 'merchant_store' AND o.created_by = p_user_id);

  SELECT count(*) FILTER (WHERE d.concluded_at IS NOT NULL)::int,
         count(*) FILTER (WHERE d.canceled_at IS NOT NULL)::int
    INTO v_deals_b_concl, v_deals_b_cancel
    FROM orion_alc_deals d WHERE d.buyer_user_id = p_user_id;

  SELECT round(avg(r.stars)::numeric, 2), count(*)::int
    INTO v_stars_avg, v_stars_n
    FROM orion_alc_ratings r WHERE r.ratee_user_id = p_user_id;

  SELECT count(*)::int,
         count(*) FILTER (WHERE l.cover_image_url IS NOT NULL AND length(coalesce(l.description,'')) >= 40)::int
    INTO v_ads_total, v_ads_qual
    FROM (
      SELECT al.cover_image_url, al.description
        FROM advertiser_listings al
        JOIN advertiser_accounts aa ON aa.id = al.advertiser_account_id
       WHERE aa.user_id = p_user_id
      UNION ALL
      SELECT pl.cover_image_url, pl.description
        FROM product_listings pl WHERE pl.owner_user_id = p_user_id
    ) l;

  SELECT count(*)::int, count(*) FILTER (WHERE a.unlock_paid_at IS NOT NULL)::int
    INTO v_aci_total, v_aci_unlock
    FROM advertiser_contact_intentions a WHERE a.advertiser_user_id = p_user_id;

  SELECT count(*) FILTER (WHERE d.concluded_at IS NOT NULL)::int,
         count(*) FILTER (WHERE d.canceled_at IS NOT NULL)::int
    INTO v_deals_s_concl, v_deals_s_cancel
    FROM orion_alc_deals d WHERE d.seller_user_id = p_user_id;

  SELECT count(*)::int INTO v_bids FROM auction_bids b WHERE b.user_id = p_user_id;

  SELECT count(*)::int, count(*) FILTER (WHERE s.pagamento_ok)::int
    INTO v_settl_winner, v_settl_honrados
    FROM orion_auction_settlements s WHERE s.winner_user_id = p_user_id;

  SELECT count(*)::int INTO v_settl_seller
    FROM orion_auction_settlements s WHERE s.seller_user_id = p_user_id;

  SELECT count(*)::int INTO v_disputas_abertas
    FROM orion_alc_disputes dp
    JOIN orion_alc_deals dd ON dd.id = dp.deal_id
   WHERE dp.decided_at IS NULL
     AND (dd.buyer_user_id = p_user_id OR dd.seller_user_id = p_user_id)
     AND dp.opened_by_user_id IS DISTINCT FROM p_user_id;

  SELECT count(*)::int, coalesce(sum(coalesce(f.trust_impact,15)), 0)
    INTO v_fraude_aberta, v_fraude_impacto
    FROM orion_fraud_events f
   WHERE f.user_id = p_user_id
     AND f.status NOT IN ('falso_positivo','resolvida','descartada');

  SELECT count(*)::int INTO v_tickets_30d
    FROM support_tickets t WHERE t.user_id = p_user_id AND t.created_at >= now() - interval '30 days';

  -- ── Pilar 1: cadastro (peso 15, sempre presente) ──
  v_months := least(extract(epoch FROM (now() - v_created_at)) / 2592000.0, 12);
  s_cadastro := round( (v_months / 12.0) * 40
    + (((v_avatar IS NOT NULL)::int + (v_cidade IS NOT NULL)::int + (v_nome IS NOT NULL)::int + v_completo::int) / 4.0) * 40
    + v_termos::int * 20, 2);

  -- ── Pilar 2: verificação (peso 20, sempre presente; facial INDISPONÍVEL declarado) ──
  v_pontos := 0; v_poss := 80; -- email 30 + doc 30 + telefone 20; identidade +20 quando existir
  IF v_email_conf IS NOT NULL THEN v_pontos := v_pontos + 30; END IF;
  IF coalesce(v_cpf, v_cpf_cnpj) IS NOT NULL AND length(coalesce(v_cpf, v_cpf_cnpj, '')) >= 11 THEN v_pontos := v_pontos + 30; END IF;
  IF v_phone_conf IS NOT NULL THEN v_pontos := v_pontos + 20;
  ELSIF coalesce(v_whatsapp, v_telefone) IS NOT NULL THEN v_pontos := v_pontos + 12; END IF;
  IF v_identity_score IS NOT NULL THEN
    v_poss := v_poss + 20;
    v_pontos := v_pontos + (least(greatest(v_identity_score,0),100) / 100.0) * 20;
  END IF;
  s_verif := round(v_pontos / v_poss * 100, 2);

  -- ── Pilar 3: financeiro (peso 20, presente se houver ordens decididas) ──
  IF (v_paid + v_failed) > 0 THEN
    s_fin := round( (v_paid::numeric / (v_paid + v_failed)) * 70
      + (least(v_valor_pago, 1000) / 1000.0) * 30, 2);
  END IF;

  -- ── Pilar 4: comprador (peso 10) ──
  IF (v_deals_b_concl + v_deals_b_cancel) > 0 OR v_stars_n > 0 THEN
    v_pontos := 0; v_poss := 0;
    IF (v_deals_b_concl + v_deals_b_cancel) > 0 THEN
      v_poss := v_poss + 60;
      v_pontos := v_pontos + (v_deals_b_concl::numeric / (v_deals_b_concl + v_deals_b_cancel)) * 60;
    END IF;
    IF v_stars_n > 0 THEN
      v_poss := v_poss + 40;
      v_pontos := v_pontos + (v_stars_avg / 5.0) * 40;
    END IF;
    s_comprador := round(v_pontos / v_poss * 100, 2);
  END IF;

  -- ── Pilar 5: vendedor (peso 10) ──
  IF v_ads_total > 0 OR (v_deals_s_concl + v_deals_s_cancel) > 0 THEN
    v_pontos := 0; v_poss := 0;
    IF v_ads_total > 0 THEN
      v_poss := v_poss + 50;
      v_pontos := v_pontos + (v_ads_qual::numeric / v_ads_total) * 50;
    END IF;
    IF v_aci_total > 0 THEN
      v_poss := v_poss + 30;
      v_pontos := v_pontos + (v_aci_unlock::numeric / v_aci_total) * 30;
    END IF;
    IF (v_deals_s_concl + v_deals_s_cancel) > 0 THEN
      v_poss := v_poss + 20;
      v_pontos := v_pontos + (v_deals_s_concl::numeric / (v_deals_s_concl + v_deals_s_cancel)) * 20;
    END IF;
    IF v_poss > 0 THEN s_vendedor := round(v_pontos / v_poss * 100, 2); END IF;
  END IF;

  -- ── Pilar 6: leilão (peso 10) ──
  IF v_bids > 0 OR v_settl_winner > 0 OR v_settl_seller > 0 THEN
    v_pontos := 0; v_poss := 30;
    v_pontos := (least(v_bids, 10) / 10.0) * 30;
    IF v_settl_winner > 0 THEN
      v_poss := v_poss + 50;
      v_pontos := v_pontos + (v_settl_honrados::numeric / v_settl_winner) * 50;
    END IF;
    v_poss := v_poss + 20;
    IF v_disputas_abertas = 0 THEN v_pontos := v_pontos + 20; END IF;
    s_leilao := round(v_pontos / v_poss * 100, 2);
  END IF;

  -- ── Pilar 7: risco (peso 15, sempre presente; começa em 100 e desconta) ──
  s_risco := 100;
  IF v_fraude_aberta > 0 THEN s_risco := s_risco - least(v_fraude_impacto, 80); END IF;
  s_risco := s_risco - least(v_disputas_abertas * 20, 40);
  IF v_tickets_30d >= 3 THEN s_risco := s_risco - 10; END IF;
  s_risco := greatest(round(s_risco, 2), 0);

  -- ── Agregação com redistribuição de peso (pilar sem base sai do denominador) ──
  v_num := s_cadastro * 15 + s_verif * 20 + s_risco * 15;
  v_den := 15 + 20 + 15;
  IF s_fin      IS NOT NULL THEN v_num := v_num + s_fin * 20;      v_den := v_den + 20; ELSE v_ausentes := v_ausentes || '"financeiro"'::jsonb; END IF;
  IF s_comprador IS NOT NULL THEN v_num := v_num + s_comprador * 10; v_den := v_den + 10; ELSE v_ausentes := v_ausentes || '"comprador"'::jsonb; END IF;
  IF s_vendedor IS NOT NULL THEN v_num := v_num + s_vendedor * 10; v_den := v_den + 10; ELSE v_ausentes := v_ausentes || '"vendedor"'::jsonb; END IF;
  IF s_leilao   IS NOT NULL THEN v_num := v_num + s_leilao * 10;   v_den := v_den + 10; ELSE v_ausentes := v_ausentes || '"leilao"'::jsonb; END IF;
  v_score := round(v_num / v_den, 2);
  v_nivel := rep_nivel(v_score);

  -- ── Fatores explicáveis ──
  v_fatores := jsonb_build_array(
    jsonb_build_object('pilar','cadastro','subscore',s_cadastro,'peso',15,'presente',true,
      'evidencia', jsonb_build_object('meses_conta', round(v_months,1), 'perfil_completo', v_completo, 'termos_aceitos', v_termos), 'fonte','profiles'),
    jsonb_build_object('pilar','verificacao','subscore',s_verif,'peso',20,'presente',true,
      'evidencia', jsonb_build_object('email_confirmado', v_email_conf IS NOT NULL, 'documento', coalesce(v_cpf, v_cpf_cnpj) IS NOT NULL,
        'telefone_informado', coalesce(v_whatsapp, v_telefone) IS NOT NULL, 'telefone_confirmado', v_phone_conf IS NOT NULL,
        'identity_score_ai42', v_identity_score, 'facial','INDISPONIVEL — sem fonte de dados'), 'fonte','auth.users + profiles + orion_identity_profiles'),
    jsonb_build_object('pilar','financeiro','subscore',s_fin,'peso',20,'presente',s_fin IS NOT NULL,
      'evidencia', jsonb_build_object('pagos',v_paid,'falhos',v_failed,'pendentes',v_pending,'valor_pago',v_valor_pago), 'fonte','pay_payment_orders'),
    jsonb_build_object('pilar','comprador','subscore',s_comprador,'peso',10,'presente',s_comprador IS NOT NULL,
      'evidencia', jsonb_build_object('deals_concluidos',v_deals_b_concl,'deals_cancelados',v_deals_b_cancel,'avaliacao_media',v_stars_avg,'avaliacoes_n',v_stars_n), 'fonte','orion_alc_deals + orion_alc_ratings'),
    jsonb_build_object('pilar','vendedor','subscore',s_vendedor,'peso',10,'presente',s_vendedor IS NOT NULL,
      'evidencia', jsonb_build_object('anuncios',v_ads_total,'anuncios_qualidade',v_ads_qual,'leads',v_aci_total,'leads_convertidos',v_aci_unlock,'vendas_concluidas',v_deals_s_concl), 'fonte','advertiser_listings + product_listings + aci + orion_alc_deals'),
    jsonb_build_object('pilar','leilao','subscore',s_leilao,'peso',10,'presente',s_leilao IS NOT NULL,
      'evidencia', jsonb_build_object('lances',v_bids,'arremates',v_settl_winner,'arremates_honrados',v_settl_honrados,'vendas_leilao',v_settl_seller,'disputas_abertas',v_disputas_abertas), 'fonte','auction_bids + orion_auction_settlements + orion_alc_disputes'),
    jsonb_build_object('pilar','risco','subscore',s_risco,'peso',15,'presente',true,
      'evidencia', jsonb_build_object('fraudes_abertas',v_fraude_aberta,'impacto_fraude',v_fraude_impacto,'disputas_contra',v_disputas_abertas,'tickets_30d',v_tickets_30d), 'fonte','orion_fraud_events (AI-41) + orion_alc_disputes + support_tickets')
  );

  -- fatores positivos/negativos (para o dashboard do usuário)
  SELECT coalesce(jsonb_agg(f), '[]'::jsonb) INTO v_pos
    FROM jsonb_array_elements(v_fatores) AS f
   WHERE (f->>'presente')::boolean AND (f->>'subscore')::numeric >= 70;
  SELECT coalesce(jsonb_agg(f), '[]'::jsonb) INTO v_neg
    FROM jsonb_array_elements(v_fatores) AS f
   WHERE (f->>'presente')::boolean AND (f->>'subscore')::numeric < 50;

  SELECT r.nivel INTO v_nivel_old FROM orion_rep_scores r WHERE r.user_id = p_user_id;

  INSERT INTO orion_rep_scores AS rs (user_id, trust_score, nivel, sub_scores, fatores, fatores_positivos, fatores_negativos, papeis, _auditoria, computed_at)
  VALUES (p_user_id, v_score, v_nivel,
    jsonb_build_object('cadastro',s_cadastro,'verificacao',s_verif,'financeiro',s_fin,'comprador',s_comprador,'vendedor',s_vendedor,'leilao',s_leilao,'risco',s_risco),
    v_fatores, v_pos, v_neg,
    jsonb_build_object('comprador', (v_paid > 0 OR v_deals_b_concl > 0), 'vendedor', v_ads_total > 0, 'leiloeiro', (v_bids > 0 OR v_settl_seller > 0)),
    jsonb_build_object('pilares_ausentes', v_ausentes, 'calculado_em', now(),
      'lacunas_declaradas', jsonb_build_array('confirmacao_facial','taxa_resposta_mensagens','devolucoes','autobid_ai72','dynamic_pricing_ai73'),
      'reuso', jsonb_build_array('AI-20 trust','AI-41 fraud','AI-42 identity','ALC deals/ratings/disputes')),
    now())
  ON CONFLICT (user_id) DO UPDATE SET
    trust_score = EXCLUDED.trust_score, nivel = EXCLUDED.nivel, sub_scores = EXCLUDED.sub_scores,
    fatores = EXCLUDED.fatores, fatores_positivos = EXCLUDED.fatores_positivos, fatores_negativos = EXCLUDED.fatores_negativos,
    papeis = EXCLUDED.papeis, _auditoria = EXCLUDED._auditoria, computed_at = now();

  INSERT INTO orion_rep_history (user_id, dia, trust_score, nivel, sub_scores)
  VALUES (p_user_id, current_date, v_score, v_nivel,
    jsonb_build_object('cadastro',s_cadastro,'verificacao',s_verif,'financeiro',s_fin,'comprador',s_comprador,'vendedor',s_vendedor,'leilao',s_leilao,'risco',s_risco))
  ON CONFLICT (user_id, dia) DO UPDATE SET trust_score = EXCLUDED.trust_score, nivel = EXCLUDED.nivel, sub_scores = EXCLUDED.sub_scores;

  INSERT INTO orion_rep_verifications (user_id, email, telefone, documento, facial, identidade, atualizado_em)
  VALUES (p_user_id,
    jsonb_build_object('status', CASE WHEN v_email_conf IS NOT NULL THEN 'verificado' ELSE 'pendente' END, 'evidencia', jsonb_build_object('confirmado_em', v_email_conf)),
    jsonb_build_object('status', CASE WHEN v_phone_conf IS NOT NULL THEN 'verificado' WHEN coalesce(v_whatsapp, v_telefone) IS NOT NULL THEN 'informado' ELSE 'pendente' END,
      'evidencia', jsonb_build_object('confirmado_em', v_phone_conf, 'informado', coalesce(v_whatsapp, v_telefone) IS NOT NULL)),
    jsonb_build_object('status', CASE WHEN coalesce(v_cpf, v_cpf_cnpj) IS NOT NULL AND length(coalesce(v_cpf, v_cpf_cnpj, '')) >= 11 THEN 'informado' ELSE 'pendente' END,
      'evidencia', jsonb_build_object('tipo', CASE WHEN v_cpf_cnpj IS NOT NULL THEN 'cpf_cnpj' WHEN v_cpf IS NOT NULL THEN 'cpf' ELSE NULL END)),
    jsonb_build_object('status', 'indisponivel', 'evidencia', jsonb_build_object('motivo', 'sem fonte de confirmação facial na plataforma')),
    jsonb_build_object('status', CASE WHEN v_identity_score IS NOT NULL THEN 'avaliado' ELSE 'sem_perfil' END,
      'evidencia', jsonb_build_object('identity_score', v_identity_score, 'nivel_confianca', v_identity_nivel, 'fonte', 'AI-42')),
    now())
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, telefone = EXCLUDED.telefone,
    documento = EXCLUDED.documento, facial = EXCLUDED.facial, identidade = EXCLUDED.identidade, atualizado_em = now();

  IF v_nivel_old IS NOT NULL AND v_nivel_old <> v_nivel THEN
    INSERT INTO orion_rep_events (user_id, tipo, detalhes, dedupe_key)
    VALUES (p_user_id, 'nivel_change',
      jsonb_build_object('de', v_nivel_old, 'para', v_nivel, 'score', v_score),
      'nivel:' || p_user_id || ':' || v_nivel_old || '>' || v_nivel || ':' || current_date)
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id, 'trust_score', v_score, 'nivel', v_nivel);
END $fn$;

-- ─── 6. MOTOR: selos ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rep_award_badges()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_concedidos integer := 0; v_n integer;
BEGIN
  -- vendedor_verificado
  INSERT INTO orion_rep_badges (user_id, badge_key, evidencia)
  SELECT s.user_id, 'vendedor_verificado',
         jsonb_build_object('doc', true, 'email', true, 'anuncios', (s.fatores->4->'evidencia'->>'anuncios')::int)
    FROM orion_rep_scores s
    JOIN orion_rep_verifications v ON v.user_id = s.user_id
   WHERE v.email->>'status' = 'verificado' AND v.documento->>'status' = 'informado'
     AND coalesce((s.fatores->4->'evidencia'->>'anuncios')::int, 0) >= 1
  ON CONFLICT (user_id, badge_key) DO UPDATE SET revogado_em = NULL, evidencia = EXCLUDED.evidencia;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_concedidos := v_concedidos + v_n;

  -- comprador_verificado
  INSERT INTO orion_rep_badges (user_id, badge_key, evidencia)
  SELECT s.user_id, 'comprador_verificado',
         jsonb_build_object('pagos', (s.fatores->2->'evidencia'->>'pagos')::int)
    FROM orion_rep_scores s
    JOIN orion_rep_verifications v ON v.user_id = s.user_id
   WHERE v.email->>'status' = 'verificado' AND v.documento->>'status' = 'informado'
     AND coalesce((s.fatores->2->'evidencia'->>'pagos')::int, 0) >= 1
  ON CONFLICT (user_id, badge_key) DO UPDATE SET revogado_em = NULL, evidencia = EXCLUDED.evidencia;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_concedidos := v_concedidos + v_n;

  -- pagador_pontual
  INSERT INTO orion_rep_badges (user_id, badge_key, evidencia)
  SELECT s.user_id, 'pagador_pontual',
         jsonb_build_object('pagos', (s.fatores->2->'evidencia'->>'pagos')::int, 'falhos', (s.fatores->2->'evidencia'->>'falhos')::int)
    FROM orion_rep_scores s
   WHERE coalesce((s.fatores->2->'evidencia'->>'pagos')::int, 0) >= 3
     AND (s.fatores->2->'evidencia'->>'pagos')::numeric
         / nullif((s.fatores->2->'evidencia'->>'pagos')::numeric + (s.fatores->2->'evidencia'->>'falhos')::numeric, 0) >= 0.9
  ON CONFLICT (user_id, badge_key) DO UPDATE SET revogado_em = NULL, evidencia = EXCLUDED.evidencia;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_concedidos := v_concedidos + v_n;

  -- entrega_confiavel
  INSERT INTO orion_rep_badges (user_id, badge_key, evidencia)
  SELECT s.user_id, 'entrega_confiavel',
         jsonb_build_object('vendas_concluidas', (s.fatores->4->'evidencia'->>'vendas_concluidas')::int)
    FROM orion_rep_scores s
   WHERE coalesce((s.fatores->4->'evidencia'->>'vendas_concluidas')::int, 0) >= 3
     AND coalesce((s.fatores->6->'evidencia'->>'disputas_contra')::int, 0) = 0
  ON CONFLICT (user_id, badge_key) DO UPDATE SET revogado_em = NULL, evidencia = EXCLUDED.evidencia;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_concedidos := v_concedidos + v_n;

  -- top_vendedor
  INSERT INTO orion_rep_badges (user_id, badge_key, evidencia)
  SELECT s.user_id, 'top_vendedor',
         jsonb_build_object('sub_vendedor', s.sub_scores->>'vendedor', 'vendas', (s.fatores->4->'evidencia'->>'vendas_concluidas')::int)
    FROM orion_rep_scores s
   WHERE (s.sub_scores->>'vendedor') IS NOT NULL AND (s.sub_scores->>'vendedor')::numeric >= 85
     AND coalesce((s.fatores->4->'evidencia'->>'vendas_concluidas')::int, 0) >= 5
  ON CONFLICT (user_id, badge_key) DO UPDATE SET revogado_em = NULL, evidencia = EXCLUDED.evidencia;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_concedidos := v_concedidos + v_n;

  -- top_comprador
  INSERT INTO orion_rep_badges (user_id, badge_key, evidencia)
  SELECT s.user_id, 'top_comprador',
         jsonb_build_object('sub_comprador', s.sub_scores->>'comprador', 'compras', (s.fatores->3->'evidencia'->>'deals_concluidos')::int)
    FROM orion_rep_scores s
   WHERE (s.sub_scores->>'comprador') IS NOT NULL AND (s.sub_scores->>'comprador')::numeric >= 85
     AND coalesce((s.fatores->3->'evidencia'->>'deals_concluidos')::int, 0) >= 5
  ON CONFLICT (user_id, badge_key) DO UPDATE SET revogado_em = NULL, evidencia = EXCLUDED.evidencia;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_concedidos := v_concedidos + v_n;

  -- especialista_leiloes
  INSERT INTO orion_rep_badges (user_id, badge_key, evidencia)
  SELECT s.user_id, 'especialista_leiloes',
         jsonb_build_object('lances', (s.fatores->5->'evidencia'->>'lances')::int, 'honrados', (s.fatores->5->'evidencia'->>'arremates_honrados')::int)
    FROM orion_rep_scores s
   WHERE coalesce((s.fatores->5->'evidencia'->>'lances')::int, 0) >= 10
     AND coalesce((s.fatores->5->'evidencia'->>'arremates_honrados')::int, 0) >= 2
  ON CONFLICT (user_id, badge_key) DO UPDATE SET revogado_em = NULL, evidencia = EXCLUDED.evidencia;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_concedidos := v_concedidos + v_n;

  -- alta_reputacao (score >= 80 nos últimos 7 dias com >= 7 registros de história)
  INSERT INTO orion_rep_badges (user_id, badge_key, evidencia)
  SELECT h.user_id, 'alta_reputacao', jsonb_build_object('dias', count(*), 'min_score', min(h.trust_score))
    FROM orion_rep_history h
   WHERE h.dia >= current_date - 7
   GROUP BY h.user_id
  HAVING count(*) >= 7 AND min(h.trust_score) >= 80
  ON CONFLICT (user_id, badge_key) DO UPDATE SET revogado_em = NULL, evidencia = EXCLUDED.evidencia;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_concedidos := v_concedidos + v_n;

  -- excelente_atendimento
  INSERT INTO orion_rep_badges (user_id, badge_key, evidencia)
  SELECT s.user_id, 'excelente_atendimento',
         jsonb_build_object('media', s.fatores->3->'evidencia'->>'avaliacao_media', 'n', (s.fatores->3->'evidencia'->>'avaliacoes_n')::int)
    FROM orion_rep_scores s
   WHERE coalesce((s.fatores->3->'evidencia'->>'avaliacoes_n')::int, 0) >= 3
     AND (s.fatores->3->'evidencia'->>'avaliacao_media')::numeric >= 4.5
  ON CONFLICT (user_id, badge_key) DO UPDATE SET revogado_em = NULL, evidencia = EXCLUDED.evidencia;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_concedidos := v_concedidos + v_n;

  -- negociacao_segura
  INSERT INTO orion_rep_badges (user_id, badge_key, evidencia)
  SELECT s.user_id, 'negociacao_segura',
         jsonb_build_object('score', s.trust_score, 'deals', coalesce((s.fatores->3->'evidencia'->>'deals_concluidos')::int,0) + coalesce((s.fatores->4->'evidencia'->>'vendas_concluidas')::int,0))
    FROM orion_rep_scores s
   WHERE s.trust_score >= 65
     AND coalesce((s.fatores->6->'evidencia'->>'fraudes_abertas')::int, 0) = 0
     AND coalesce((s.fatores->6->'evidencia'->>'disputas_contra')::int, 0) = 0
     AND (coalesce((s.fatores->3->'evidencia'->>'deals_concluidos')::int,0) + coalesce((s.fatores->4->'evidencia'->>'vendas_concluidas')::int,0)) >= 1
  ON CONFLICT (user_id, badge_key) DO UPDATE SET revogado_em = NULL, evidencia = EXCLUDED.evidencia;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_concedidos := v_concedidos + v_n;

  -- Revogação: selo cujo dono caiu para alto_risco ou ganhou fraude aberta é revogado (auditável, nunca apagado)
  UPDATE orion_rep_badges b SET revogado_em = now()
    FROM orion_rep_scores s
   WHERE s.user_id = b.user_id AND b.revogado_em IS NULL
     AND (s.nivel = 'alto_risco' OR coalesce((s.fatores->6->'evidencia'->>'fraudes_abertas')::int, 0) > 0)
     AND b.badge_key IN ('negociacao_segura','alta_reputacao','pagador_pontual');

  RETURN v_concedidos;
END $fn$;

-- ─── 7. MOTOR: alertas ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rep_scan_alerts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_novos integer := 0; v_n integer;
BEGIN
  -- queda rápida: score atual >= 15 pontos abaixo do máximo dos últimos 7 dias
  INSERT INTO orion_rep_alerts (user_id, tipo, severidade, titulo, detalhes, dedupe_key)
  SELECT s.user_id, 'queda_rapida', 'alta', 'Trust Score caiu rapidamente',
         jsonb_build_object('score_atual', s.trust_score, 'max_7d', h.max_score, 'queda', round(h.max_score - s.trust_score, 2)),
         'queda:' || s.user_id || ':' || current_date
    FROM orion_rep_scores s
    JOIN (SELECT user_id, max(trust_score) AS max_score FROM orion_rep_history WHERE dia >= current_date - 7 GROUP BY user_id) h
      ON h.user_id = s.user_id
   WHERE h.max_score - s.trust_score >= 15
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_novos := v_novos + v_n;

  -- fraude potencial (AI-41 aberto)
  INSERT INTO orion_rep_alerts (user_id, tipo, severidade, titulo, detalhes, dedupe_key)
  SELECT f.user_id, 'fraude_potencial',
         CASE WHEN f.severity = 'critica' THEN 'critica' ELSE 'alta' END,
         'Evento de fraude aberto (AI-41) afeta a reputação',
         jsonb_build_object('fraud_id', f.fraud_id, 'tipo', f.tipo, 'severity', f.severity, 'trust_impact', f.trust_impact),
         'fraude:' || f.fraud_id
    FROM orion_fraud_events f
   WHERE f.user_id IS NOT NULL AND f.status NOT IN ('falso_positivo','resolvida','descartada')
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_novos := v_novos + v_n;

  -- reclamações recorrentes (>= 3 tickets em 30 dias)
  INSERT INTO orion_rep_alerts (user_id, tipo, severidade, titulo, detalhes, dedupe_key)
  SELECT t.user_id, 'reclamacoes_recorrentes', 'media', 'Volume incomum de tickets em 30 dias',
         jsonb_build_object('tickets_30d', count(*)),
         'tickets:' || t.user_id || ':' || date_trunc('month', now())::date
    FROM support_tickets t
   WHERE t.created_at >= now() - interval '30 days' AND t.user_id IS NOT NULL
   GROUP BY t.user_id
  HAVING count(*) >= 3
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_novos := v_novos + v_n;

  -- melhora significativa (+15 vs mínimo de 30 dias)
  INSERT INTO orion_rep_alerts (user_id, tipo, severidade, titulo, detalhes, dedupe_key)
  SELECT s.user_id, 'melhora_significativa', 'info', 'Reputação melhorou significativamente',
         jsonb_build_object('score_atual', s.trust_score, 'min_30d', h.min_score, 'ganho', round(s.trust_score - h.min_score, 2)),
         'melhora:' || s.user_id || ':' || current_date
    FROM orion_rep_scores s
    JOIN (SELECT user_id, min(trust_score) AS min_score FROM orion_rep_history WHERE dia >= current_date - 30 GROUP BY user_id) h
      ON h.user_id = s.user_id
   WHERE s.trust_score - h.min_score >= 15
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_novos := v_novos + v_n;

  RETURN v_novos;
END $fn$;

-- ─── 8. MOTOR: recomendações (recomenda, NUNCA executa) ─────────────────────

CREATE OR REPLACE FUNCTION public.rep_recommendations_engine()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_novas integer := 0; v_n integer;
BEGIN
  -- verificação adicional (score < 50 ou sem documento)
  INSERT INTO orion_rep_recommendations (user_id, tipo, titulo, motivo, prioridade, dedupe_key)
  SELECT s.user_id, 'verificacao_adicional', 'Solicitar verificação adicional do usuário',
         jsonb_build_object('score', s.trust_score, 'documento', v.documento->>'status'),
         CASE WHEN s.nivel = 'alto_risco' THEN 'alta' ELSE 'media' END,
         'verif:' || s.user_id
    FROM orion_rep_scores s JOIN orion_rep_verifications v ON v.user_id = s.user_id
   WHERE s.trust_score < 50 OR v.documento->>'status' <> 'informado'
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_novas := v_novas + v_n;

  -- destacar perfil confiável / benefícios Elite
  INSERT INTO orion_rep_recommendations (user_id, tipo, titulo, motivo, prioridade, dedupe_key)
  SELECT s.user_id, 'destacar_perfil', 'Destacar perfil confiável e conceder benefícios',
         jsonb_build_object('score', s.trust_score, 'nivel', s.nivel), 'baixa',
         'destaque:' || s.user_id
    FROM orion_rep_scores s WHERE s.nivel IN ('elite','excelente')
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_novas := v_novas + v_n;

  -- revisão manual (fraude aberta)
  INSERT INTO orion_rep_recommendations (user_id, tipo, titulo, motivo, prioridade, dedupe_key)
  SELECT s.user_id, 'revisao_manual', 'Revisar manualmente usuário com evento de fraude aberto',
         jsonb_build_object('fraudes_abertas', (s.fatores->6->'evidencia'->>'fraudes_abertas')::int), 'alta',
         'revisao:' || s.user_id
    FROM orion_rep_scores s
   WHERE coalesce((s.fatores->6->'evidencia'->>'fraudes_abertas')::int, 0) > 0
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_novas := v_novas + v_n;

  -- limitar funcionalidades (alto risco — RECOMENDAÇÃO; nunca executa)
  INSERT INTO orion_rep_recommendations (user_id, tipo, titulo, motivo, prioridade, dedupe_key)
  SELECT s.user_id, 'limitar_funcionalidades', 'Considerar limitar funcionalidades temporariamente (decisão humana)',
         jsonb_build_object('score', s.trust_score, 'nivel', s.nivel), 'alta',
         'limitar:' || s.user_id
    FROM orion_rep_scores s WHERE s.nivel = 'alto_risco'
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_novas := v_novas + v_n;

  -- mediação (disputa aberta)
  INSERT INTO orion_rep_recommendations (user_id, tipo, titulo, motivo, prioridade, dedupe_key)
  SELECT DISTINCT dd.seller_user_id, 'mediacao', 'Recomendar mediação em negociação com disputa aberta',
         jsonb_build_object('deal_id', dd.id), 'alta',
         'mediacao:' || dp.id
    FROM orion_alc_disputes dp JOIN orion_alc_deals dd ON dd.id = dp.deal_id
   WHERE dp.decided_at IS NULL
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_novas := v_novas + v_n;

  -- auto-resolver recomendações cuja condição desapareceu
  UPDATE orion_rep_recommendations r SET status = 'resolvida', resolvido_em = now()
   WHERE r.status = 'aberta' AND r.tipo = 'verificacao_adicional'
     AND EXISTS (SELECT 1 FROM orion_rep_scores s JOIN orion_rep_verifications v ON v.user_id = s.user_id
                  WHERE s.user_id = r.user_id AND s.trust_score >= 50 AND v.documento->>'status' = 'informado');
  UPDATE orion_rep_recommendations r SET status = 'resolvida', resolvido_em = now()
   WHERE r.status = 'aberta' AND r.tipo IN ('revisao_manual','limitar_funcionalidades')
     AND EXISTS (SELECT 1 FROM orion_rep_scores s WHERE s.user_id = r.user_id
                  AND s.nivel <> 'alto_risco'
                  AND coalesce((s.fatores->6->'evidencia'->>'fraudes_abertas')::int, 0) = 0);

  RETURN v_novas;
END $fn$;

-- ─── 9. ORQUESTRADOR (tick) ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rep_run(p_origem text DEFAULT 'tick')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_t0 timestamptz := clock_timestamp();
  v_user record; v_users integer := 0;
  v_badges integer; v_alertas integer; v_recs integer;
BEGIN
  FOR v_user IN SELECT id FROM profiles LOOP
    PERFORM rep_compute_user(v_user.id);
    v_users := v_users + 1;
  END LOOP;

  v_badges  := rep_award_badges();
  v_alertas := rep_scan_alerts();
  v_recs    := rep_recommendations_engine();

  INSERT INTO orion_rep_audit_log (origem, duracao_ms, usuarios, alertas, badges, recomendacoes, detalhes)
  VALUES (p_origem, (extract(epoch FROM (clock_timestamp() - v_t0)) * 1000)::int, v_users, v_alertas, v_badges, v_recs,
          jsonb_build_object('modulo', 'trust_reputation', 'versao', 'v1.0'));

  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados)
    VALUES ('rep.updated', 'trust_reputation',
            jsonb_build_object('usuarios', v_users, 'alertas_novos', v_alertas, 'recomendacoes_novas', v_recs));
  EXCEPTION WHEN others THEN NULL; -- event bus nunca derruba o tick
  END;

  RETURN jsonb_build_object('ok', true, 'usuarios', v_users, 'badges', v_badges, 'alertas', v_alertas, 'recomendacoes', v_recs,
                            'duracao_ms', (extract(epoch FROM (clock_timestamp() - v_t0)) * 1000)::int);
END $fn$;

-- ─── 10. APIs (mapeiam a spec /trust/*) ─────────────────────────────────────
-- Autorização: chamador vê a si próprio; admin vê todos; service (auth.uid() null) liberado.

CREATE OR REPLACE FUNCTION public.rep_is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  SELECT coalesce((SELECT p.is_admin FROM profiles p WHERE p.id = auth.uid()), false)
$fn$;

CREATE OR REPLACE FUNCTION public.rep_guard(p_target uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_caller uuid := auth.uid(); v_target uuid;
BEGIN
  v_target := coalesce(p_target, v_caller);
  IF v_target IS NULL THEN RAISE EXCEPTION 'usuário alvo não informado'; END IF;
  IF v_caller IS NOT NULL AND v_target <> v_caller AND NOT rep_is_admin() THEN
    RAISE EXCEPTION 'acesso negado: só o próprio usuário ou admin';
  END IF;
  RETURN v_target;
END $fn$;

-- /trust/score
CREATE OR REPLACE FUNCTION public.rep_get(p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_target uuid := rep_guard(p_user_id); v_row orion_rep_scores;
BEGIN
  SELECT * INTO v_row FROM orion_rep_scores WHERE user_id = v_target;
  IF NOT FOUND THEN
    PERFORM rep_compute_user(v_target);
    SELECT * INTO v_row FROM orion_rep_scores WHERE user_id = v_target;
  END IF;
  RETURN jsonb_build_object('user_id', v_row.user_id, 'trust_score', v_row.trust_score, 'nivel', v_row.nivel,
    'sub_scores', v_row.sub_scores, 'fatores', v_row.fatores, 'papeis', v_row.papeis,
    '_auditoria', v_row._auditoria, 'computed_at', v_row.computed_at,
    'badges', (SELECT coalesce(jsonb_agg(jsonb_build_object('badge_key', b.badge_key, 'nome', c.nome, 'icone', c.icone, 'concedido_em', b.concedido_em)), '[]'::jsonb)
                 FROM orion_rep_badges b JOIN orion_rep_badges_catalog c ON c.badge_key = b.badge_key
                WHERE b.user_id = v_target AND b.revogado_em IS NULL));
END $fn$;

-- /trust/history
CREATE OR REPLACE FUNCTION public.rep_history_api(p_user_id uuid DEFAULT NULL, p_days integer DEFAULT 90)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_target uuid := rep_guard(p_user_id);
BEGIN
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('dia', h.dia, 'trust_score', h.trust_score, 'nivel', h.nivel) ORDER BY h.dia)
    FROM orion_rep_history h WHERE h.user_id = v_target AND h.dia >= current_date - p_days), '[]'::jsonb);
END $fn$;

-- /trust/badges
CREATE OR REPLACE FUNCTION public.rep_badges_api(p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_target uuid := rep_guard(p_user_id);
BEGIN
  RETURN jsonb_build_object(
    'conquistados', coalesce((SELECT jsonb_agg(jsonb_build_object('badge_key', b.badge_key, 'nome', c.nome, 'icone', c.icone, 'descricao', c.descricao, 'concedido_em', b.concedido_em, 'evidencia', b.evidencia))
        FROM orion_rep_badges b JOIN orion_rep_badges_catalog c ON c.badge_key = b.badge_key
       WHERE b.user_id = v_target AND b.revogado_em IS NULL), '[]'::jsonb),
    'disponiveis', coalesce((SELECT jsonb_agg(jsonb_build_object('badge_key', c.badge_key, 'nome', c.nome, 'icone', c.icone, 'descricao', c.descricao))
        FROM orion_rep_badges_catalog c
       WHERE c.ativo AND NOT EXISTS (SELECT 1 FROM orion_rep_badges b WHERE b.user_id = v_target AND b.badge_key = c.badge_key AND b.revogado_em IS NULL)), '[]'::jsonb));
END $fn$;

-- /trust/recommendations
CREATE OR REPLACE FUNCTION public.rep_recommendations_api(p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_target uuid := rep_guard(p_user_id);
BEGIN
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('tipo', r.tipo, 'titulo', r.titulo, 'motivo', r.motivo, 'prioridade', r.prioridade, 'status', r.status, 'criado_em', r.criado_em) ORDER BY r.criado_em DESC)
    FROM orion_rep_recommendations r WHERE r.user_id = v_target), '[]'::jsonb);
END $fn$;

-- /trust/verifications
CREATE OR REPLACE FUNCTION public.rep_verifications_api(p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_target uuid := rep_guard(p_user_id); v_row orion_rep_verifications;
BEGIN
  SELECT * INTO v_row FROM orion_rep_verifications WHERE user_id = v_target;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'sem_registro'); END IF;
  RETURN jsonb_build_object('email', v_row.email, 'telefone', v_row.telefone, 'documento', v_row.documento,
                            'facial', v_row.facial, 'identidade', v_row.identidade, 'atualizado_em', v_row.atualizado_em);
END $fn$;

-- /trust/alerts (admin)
CREATE OR REPLACE FUNCTION public.rep_alerts_api(p_status text DEFAULT 'aberto')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT rep_is_admin() THEN RAISE EXCEPTION 'acesso negado: admin'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'user_id', a.user_id, 'tipo', a.tipo, 'severidade', a.severidade,
      'titulo', a.titulo, 'detalhes', a.detalhes, 'status', a.status, 'criado_em', a.criado_em) ORDER BY a.criado_em DESC)
    FROM orion_rep_alerts a WHERE p_status IS NULL OR a.status = p_status), '[]'::jsonb);
END $fn$;

-- /trust/dashboard (admin — ORION Trust Center)
CREATE OR REPLACE FUNCTION public.rep_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT rep_is_admin() THEN RAISE EXCEPTION 'acesso negado: admin'; END IF;
  RETURN jsonb_build_object(
    'gerado_em', now(),
    'kpis', (SELECT jsonb_build_object(
        'usuarios_avaliados', count(*)::int,
        'trust_medio', round(avg(trust_score), 1),
        'elite', count(*) FILTER (WHERE nivel = 'elite')::int,
        'excelente', count(*) FILTER (WHERE nivel = 'excelente')::int,
        'em_observacao', count(*) FILTER (WHERE nivel IN ('atencao','alto_risco'))::int,
        'verificados', (SELECT count(*)::int FROM orion_rep_verifications v WHERE v.email->>'status' = 'verificado' AND v.documento->>'status' = 'informado'))
      FROM orion_rep_scores),
    'distribuicao', (SELECT coalesce(jsonb_object_agg(nivel, n), '{}'::jsonb) FROM
      (SELECT nivel, count(*)::int AS n FROM orion_rep_scores GROUP BY nivel) d),
    'alertas_abertos', (SELECT count(*)::int FROM orion_rep_alerts WHERE status = 'aberto'),
    'fraudes_monitoradas', (SELECT count(*)::int FROM orion_rep_alerts WHERE tipo = 'fraude_potencial'),
    'recomendacoes_abertas', (SELECT count(*)::int FROM orion_rep_recommendations WHERE status = 'aberta'),
    'selos_concedidos', (SELECT count(*)::int FROM orion_rep_badges WHERE revogado_em IS NULL),
    'ranking_vendedores', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT s.user_id, p.name, p.nome_loja, s.trust_score, s.nivel, s.sub_scores->>'vendedor' AS sub_vendedor
          FROM orion_rep_scores s JOIN profiles p ON p.id = s.user_id
         WHERE (s.papeis->>'vendedor')::boolean ORDER BY s.trust_score DESC LIMIT 10) x),
    'ranking_compradores', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT s.user_id, p.name, s.trust_score, s.nivel, s.sub_scores->>'financeiro' AS sub_financeiro
          FROM orion_rep_scores s JOIN profiles p ON p.id = s.user_id
         WHERE (s.papeis->>'comprador')::boolean ORDER BY s.trust_score DESC LIMIT 10) x),
    'mapa_cidades', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT coalesce(p.cidade, '—') AS cidade, count(*)::int AS usuarios, round(avg(s.trust_score), 1) AS trust_medio
          FROM orion_rep_scores s JOIN profiles p ON p.id = s.user_id
         GROUP BY 1 ORDER BY 2 DESC LIMIT 15) x),
    'evolucao', (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'dia')), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('dia', dia, 'trust_medio', round(avg(trust_score), 1), 'usuarios', count(*)::int) AS x
          FROM orion_rep_history WHERE dia >= current_date - 30 GROUP BY dia) e),
    'telemetria', (SELECT to_jsonb(a) FROM (
        SELECT executado_em, duracao_ms, usuarios, alertas, badges, recomendacoes
          FROM orion_rep_audit_log ORDER BY executado_em DESC LIMIT 1) a),
    '_auditoria', jsonb_build_object('fonte', 'orion_rep_* (motor AI-74)', 'lacunas_declaradas',
      jsonb_build_array('confirmacao_facial','taxa_resposta_mensagens','devolucoes','autobid_ai72','dynamic_pricing_ai73')));
END $fn$;

-- Dashboard do usuário (auto)
CREATE OR REPLACE FUNCTION public.rep_user_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'requer autenticação'; END IF;
  RETURN jsonb_build_object(
    'score', rep_get(v_uid),
    'historico', rep_history_api(v_uid, 90),
    'verificacoes', rep_verifications_api(v_uid),
    'selos', rep_badges_api(v_uid),
    'recomendacoes', rep_recommendations_api(v_uid));
END $fn$;

-- ─── 11. SELFTEST (COMANDO TESTE — 14 checks) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.rep_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  checks jsonb := '[]'::jsonb; ok_count integer := 0; total integer := 14;
  v_ok boolean; v_n integer; v_n2 integer;
  src_pay bigint; src_bids bigint; src_prof bigint; src_ratings bigint; src_fraud bigint;
  v_run1 jsonb; v_run2 jsonb; v_scores1 integer; v_scores2 integer;
  chk jsonb;
  add_check_name text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT rep_is_admin() THEN RAISE EXCEPTION 'acesso negado: admin'; END IF;

  -- 1. tabelas
  SELECT count(*)::int INTO v_n FROM pg_tables WHERE schemaname = 'public' AND tablename IN
    ('orion_rep_scores','orion_rep_history','orion_rep_events','orion_rep_badges_catalog','orion_rep_badges',
     'orion_rep_verifications','orion_rep_recommendations','orion_rep_alerts','orion_rep_audit_log');
  v_ok := v_n = 9; IF v_ok THEN ok_count := ok_count + 1; END IF;
  checks := checks || jsonb_build_object('n', 1, 'check', 'tabelas orion_rep_* (9)', 'ok', v_ok, 'valor', v_n);

  -- 2. RLS habilitado
  SELECT count(*)::int INTO v_n FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'orion_rep_%' AND rowsecurity;
  v_ok := v_n = 9; IF v_ok THEN ok_count := ok_count + 1; END IF;
  checks := checks || jsonb_build_object('n', 2, 'check', 'RLS habilitado nas 9 tabelas', 'ok', v_ok, 'valor', v_n);

  -- 3. políticas presentes
  SELECT count(*)::int INTO v_n FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'orion_rep_%';
  v_ok := v_n >= 9; IF v_ok THEN ok_count := ok_count + 1; END IF;
  checks := checks || jsonb_build_object('n', 3, 'check', 'políticas RLS presentes (≥9)', 'ok', v_ok, 'valor', v_n);

  -- 4. EXECUTE de PUBLIC/anon = 0 nas funções rep_%
  SELECT count(*)::int INTO v_n
    FROM information_schema.routine_privileges rp
   WHERE rp.routine_schema = 'public' AND rp.routine_name LIKE 'rep\_%'
     AND rp.grantee IN ('PUBLIC', 'anon') AND rp.privilege_type = 'EXECUTE';
  v_ok := v_n = 0; IF v_ok THEN ok_count := ok_count + 1; END IF;
  checks := checks || jsonb_build_object('n', 4, 'check', 'EXECUTE PUBLIC/anon em rep_* = 0', 'ok', v_ok, 'valor', v_n);

  -- fontes antes
  SELECT count(*) INTO src_pay FROM pay_payment_orders;
  SELECT count(*) INTO src_bids FROM auction_bids;
  SELECT count(*) INTO src_prof FROM profiles;
  SELECT count(*) INTO src_ratings FROM orion_alc_ratings;
  SELECT count(*) INTO src_fraud FROM orion_fraud_events;

  -- 5. rep_run 1ª execução
  v_run1 := rep_run('selftest');
  SELECT count(*)::int INTO v_scores1 FROM orion_rep_scores;
  v_ok := (v_run1->>'ok')::boolean AND v_scores1 > 0;
  IF v_ok THEN ok_count := ok_count + 1; END IF;
  checks := checks || jsonb_build_object('n', 5, 'check', 'rep_run() executa e gera scores', 'ok', v_ok, 'valor', v_scores1);

  -- 6. idempotência
  v_run2 := rep_run('selftest');
  SELECT count(*)::int INTO v_scores2 FROM orion_rep_scores;
  SELECT count(*)::int INTO v_n FROM (SELECT user_id, badge_key FROM orion_rep_badges GROUP BY user_id, badge_key HAVING count(*) > 1) d;
  v_ok := v_scores2 = v_scores1 AND v_n = 0;
  IF v_ok THEN ok_count := ok_count + 1; END IF;
  checks := checks || jsonb_build_object('n', 6, 'check', 'idempotência (2ª execução: mesmos scores, sem selo duplicado)', 'ok', v_ok, 'valor', jsonb_build_object('scores', v_scores2, 'badges_dup', v_n));

  -- 7. read-only sobre o domínio
  v_ok := (SELECT count(*) FROM pay_payment_orders) = src_pay
      AND (SELECT count(*) FROM auction_bids) = src_bids
      AND (SELECT count(*) FROM profiles) = src_prof
      AND (SELECT count(*) FROM orion_alc_ratings) = src_ratings
      AND (SELECT count(*) FROM orion_fraud_events) = src_fraud;
  IF v_ok THEN ok_count := ok_count + 1; END IF;
  checks := checks || jsonb_build_object('n', 7, 'check', 'read-only: fontes intactas após 2 execuções', 'ok', v_ok);

  -- 8. scores válidos + nível coerente
  SELECT count(*)::int INTO v_n FROM orion_rep_scores
   WHERE trust_score < 0 OR trust_score > 100 OR nivel <> rep_nivel(trust_score);
  v_ok := v_n = 0; IF v_ok THEN ok_count := ok_count + 1; END IF;
  checks := checks || jsonb_build_object('n', 8, 'check', 'scores 0-100 e nível coerente com a faixa', 'ok', v_ok, 'valor', v_n);

  -- 9. explicabilidade: fatores + _auditoria em todo score
  SELECT count(*)::int INTO v_n FROM orion_rep_scores
   WHERE jsonb_array_length(fatores) < 7 OR _auditoria = '{}'::jsonb;
  v_ok := v_n = 0; IF v_ok THEN ok_count := ok_count + 1; END IF;
  checks := checks || jsonb_build_object('n', 9, 'check', 'todo score com 7 fatores + _auditoria', 'ok', v_ok, 'valor', v_n);

  -- 10. histórico único por usuário+dia
  SELECT count(*)::int INTO v_n FROM (SELECT user_id, dia FROM orion_rep_history GROUP BY user_id, dia HAVING count(*) > 1) d;
  v_ok := v_n = 0; IF v_ok THEN ok_count := ok_count + 1; END IF;
  checks := checks || jsonb_build_object('n', 10, 'check', 'histórico imutável sem duplicidade (user,dia)', 'ok', v_ok, 'valor', v_n);

  -- 11. catálogo 10 selos + concedidos com evidência
  SELECT count(*)::int INTO v_n FROM orion_rep_badges_catalog WHERE ativo;
  SELECT count(*)::int INTO v_n2 FROM orion_rep_badges WHERE evidencia = '{}'::jsonb;
  v_ok := v_n = 10 AND v_n2 = 0; IF v_ok THEN ok_count := ok_count + 1; END IF;
  checks := checks || jsonb_build_object('n', 11, 'check', 'catálogo com 10 selos; concedidos com evidência', 'ok', v_ok, 'valor', jsonb_build_object('catalogo', v_n, 'sem_evidencia', v_n2));

  -- 12. alertas sem duplicidade de dedupe_key
  SELECT count(*)::int INTO v_n FROM (SELECT dedupe_key FROM orion_rep_alerts GROUP BY dedupe_key HAVING count(*) > 1) d;
  v_ok := v_n = 0; IF v_ok THEN ok_count := ok_count + 1; END IF;
  checks := checks || jsonb_build_object('n', 12, 'check', 'alertas com dedupe (0 duplicados)', 'ok', v_ok, 'valor', v_n);

  -- 13. registry + cron
  v_ok := EXISTS (SELECT 1 FROM orion_ai_module_prefs WHERE module = 'trust_reputation')
      AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'orion_rep_tick');
  IF v_ok THEN ok_count := ok_count + 1; END IF;
  checks := checks || jsonb_build_object('n', 13, 'check', 'registry (trust_reputation) + cron (orion_rep_tick)', 'ok', v_ok);

  -- 14. APIs respondem + lacuna facial declarada
  v_ok := rep_dashboard() IS NOT NULL
      AND EXISTS (SELECT 1 FROM orion_rep_verifications WHERE facial->>'status' = 'indisponivel');
  IF v_ok THEN ok_count := ok_count + 1; END IF;
  checks := checks || jsonb_build_object('n', 14, 'check', 'APIs respondem; lacuna facial DECLARADA', 'ok', v_ok);

  RETURN jsonb_build_object('modulo', 'ORION-AI-74 trust_reputation', 'aprovado', ok_count = total,
                            'score', ok_count || '/' || total, 'checks', checks);
END $fn$;

-- ─── 12. REGISTRY + PROMPTS + CRON + HARDENING ──────────────────────────────

INSERT INTO public.orion_ai_module_prefs (module, model_code)
VALUES ('trust_reputation', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;

INSERT INTO public.orion_ai_prompts (chave, versao, system_text, ativo, autor, motivo)
SELECT x.chave, 1, x.txt, true, NULL, 'orion-ai-74: criação do módulo Trust & Reputation AI v1.0'
FROM (VALUES
  ('reputation.summary',  'Você é o ORION Trust & Reputation AI (AI-74). Resuma a situação de reputação da plataforma usando SOMENTE os dados fornecidos (scores, distribuição, alertas). Nunca invente números. Responda em português, executivo e direto.'),
  ('reputation.user',     'Você é o ORION Trust & Reputation AI (AI-74). Explique ao usuário o Trust Score dele usando SOMENTE os fatores fornecidos, com recomendações práticas para melhorar. Nunca exponha dados de outros usuários. Português, tom amigável.'),
  ('reputation.alerts',   'Você é o ORION Trust & Reputation AI (AI-74). Priorize e explique os alertas de reputação fornecidos (queda rápida, fraude potencial, reclamações). Recomende ações — NUNCA execute bloqueios. Português, objetivo.'),
  ('reputation.executive','Você é o ORION Trust & Reputation AI (AI-74). Gere um parecer executivo sobre confiança do ecossistema com base nos KPIs fornecidos. Aponte riscos e oportunidades com evidência. Português.')
) AS x(chave, txt)
WHERE NOT EXISTS (SELECT 1 FROM public.orion_ai_prompts pr WHERE pr.chave = x.chave);

DO $cron$
BEGIN
  PERFORM cron.unschedule('orion_rep_tick');
EXCEPTION WHEN others THEN NULL;
END $cron$;
SELECT cron.schedule('orion_rep_tick', '*/7 * * * *', $$SELECT public.rep_run('cron')$$);

-- Hardening: REVOKE EXECUTE de PUBLIC/anon em TODAS as rep_* (lição AI-61)
DO $rev$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE 'rep\_%' ESCAPE '\'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $rev$;

-- APIs de usuário/admin liberadas para authenticated (guardas internas decidem)
GRANT EXECUTE ON FUNCTION public.rep_get(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rep_history_api(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rep_badges_api(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rep_recommendations_api(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rep_verifications_api(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rep_user_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rep_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rep_alerts_api(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rep_selftest() TO authenticated;

-- ─── 13. VERIFICAÇÃO ────────────────────────────────────────────────────────
SELECT
  (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'orion_rep_%')  AS tabelas,
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'rep\_%' ESCAPE '\')                                 AS funcoes,
  (SELECT count(*)::int FROM orion_rep_badges_catalog)                                                 AS selos_catalogo,
  (SELECT count(*)::int FROM cron.job WHERE jobname = 'orion_rep_tick')                                AS cron_ok,
  (SELECT count(*)::int FROM orion_ai_module_prefs WHERE module = 'trust_reputation')                  AS registry_ok;
