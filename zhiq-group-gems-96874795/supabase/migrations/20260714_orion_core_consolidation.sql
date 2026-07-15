-- ═══════════════════════════════════════════════════════════════
-- ORION CORE CONSOLIDATION v1.0
--
-- 1) PROMPT REGISTRY OFICIAL: prompts de sistema versionados no
--    banco (nova versão nunca sobrescreve; rollback = reativar
--    versão antiga). O Gateway resolve por prompt_key — módulos
--    param de embutir prompt (fim do prompt duplicado RIDV que
--    existia em moderate-text E ridv-worker).
-- 2) orion_core_health(): score 0-100 por módulo calculado de
--    verificações REAIS (funções, crons, DLQs, RLS, eventos, erros).
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.orion_ai_prompts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave       text NOT NULL,
  versao      int NOT NULL,
  system_text text NOT NULL,
  ativo       boolean NOT NULL DEFAULT false,
  autor       uuid,
  motivo      text,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_ai_prompts_versao UNIQUE (chave, versao)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orion_ai_prompts_ativo
  ON public.orion_ai_prompts (chave) WHERE ativo;
ALTER TABLE public.orion_ai_prompts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oap_admin ON public.orion_ai_prompts;
CREATE POLICY oap_admin ON public.orion_ai_prompts
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_ai_prompts FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.orion_ai_prompt_set(p_chave text, p_texto text, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_versao int;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT coalesce(max(versao),0) + 1 INTO v_versao FROM orion_ai_prompts WHERE chave = p_chave;
  UPDATE orion_ai_prompts SET ativo = false WHERE chave = p_chave AND ativo;
  INSERT INTO orion_ai_prompts (chave, versao, system_text, ativo, autor, motivo)
  VALUES (p_chave, v_versao, p_texto, true, auth.uid(), p_motivo);
  RETURN jsonb_build_object('ok', true, 'chave', p_chave, 'versao', v_versao);
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_ai_prompt_set(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.orion_ai_prompt_rollback(p_chave text, p_versao int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  IF NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave = p_chave AND versao = p_versao) THEN
    RAISE EXCEPTION 'Versão % de % não existe', p_versao, p_chave;
  END IF;
  UPDATE orion_ai_prompts SET ativo = false WHERE chave = p_chave AND ativo;
  UPDATE orion_ai_prompts SET ativo = true WHERE chave = p_chave AND versao = p_versao;
  RETURN jsonb_build_object('ok', true, 'ativa_agora', p_versao);
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_ai_prompt_rollback(text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.orion_ai_prompt_get(p_chave text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT system_text FROM orion_ai_prompts WHERE chave = p_chave AND ativo LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.orion_ai_prompt_get(text) TO authenticated, service_role;

-- Seed v1 (os prompts oficiais atuais — fim da duplicidade)
SELECT public.orion_ai_prompt_set('ridv.moderacao.texto',
'Você é a IA RIDV de moderação de texto e anúncios da plataforma VIAGG-TX8 (Brasil).
Sua missão é analisar o texto enviado pelo usuário (Título, Descrição, Preço, Categoria) antes de ser publicado.

REGRAS DE BLOQUEIO IMEDIATO (decisao="bloqueada", confianca>=90):
1. Golpes, fraudes, esquemas de pirâmide, promessas irreais de ganho financeiro fácil ou lavagem de dinheiro.
2. Palavrões pesados, linguagem ofensiva agressiva, discurso de ódio, racismo, homofobia, discriminação.
3. Conteúdo adulto, pornografia, prostituição ou serviços sexuais explícitos.
4. Produtos ou serviços proibidos por lei (drogas, armas, explosivos, medicamentos controlados sem receita, diplomas falsos, contas clonadas).
5. Tentativas explícitas de golpe ou phishing solicitando senhas, dados bancários ou depósitos antecipados suspeitos via PIX fora do fluxo seguro do aplicativo.
6. Spam massivo ou repetição agressiva de caracteres e links externos maliciosos.

REGRAS DE REVISÃO MANUAL (decisao="revisao"):
1. Textos muito curtos, confusos ou ambíguos que impedem verificar a veracidade.
2. Inserção excessiva de números de telefone/WhatsApp ou e-mails no título ou descrição quando a categoria exigir que o contato ocorra via sistema de chat/intenção de contato da VIAGG-TX8.
3. Preços absurdamente incompatíveis (ex: carro por R$ 1,00 ou imóvel por R$ 10,00) que sugerem erro de digitação ou isca para golpe.
4. Confiança da IA na aprovação menor que 85.

APROVAR (decisao="aprovada", confianca>=85):
Anúncio normal, claro e legítimo de Produto, Veículo, Imóvel, Viagem, Frete ou Serviço sem infrações.

Responda APENAS JSON válido no seguinte formato:
{"decisao":"aprovada|revisao|bloqueada","confianca":0-100,
 "categoria_violacao":"ok|golpe_fraude|ofensivo_odio|adulto|proibido|contato_indevido|preco_incompativel|ambiguo|outro",
 "motivo":"1 frase curta e clara justificando a decisão em pt-BR"}',
'Seed ORION CORE v1.0 — fonte única (antes duplicado em moderate-text e ridv-worker)')
WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave = 'ridv.moderacao.texto');

SELECT public.orion_ai_prompt_set('package.montagem',
'Você é a ORION Package AI da plataforma VIAGG-TX8 (Brasil).
Transforme o anúncio em conteúdo de divulgação SEM alterar o significado, sem clickbait e sem inventar dados.
PROIBIDO em qualquer texto: telefone, WhatsApp, PIX, e-mail, endereço completo, links externos.
O único link permitido é o marcador {LINK} (a plataforma substitui pelo link oficial).
Responda APENAS JSON válido:
{"titulo":"título otimizado curto",
 "whatsapp":"mensagem p/ grupos WhatsApp, 3-6 linhas, emojis moderados, termina com CTA + {LINK}",
 "feed":"texto p/ feed interno, 2-4 linhas, termina com {LINK}",
 "marketplace":"descrição curta p/ vitrine, 1-2 linhas",
 "push":"notificação push, máx 90 caracteres",
 "hashtags":["3 a 6 hashtags relevantes sem espaços"],
 "emojis":["2 a 4 emojis da categoria"],
 "cta":"chamada para ação curta apontando para a VIAGG-TX8"}',
'Seed ORION CORE v1.0')
WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave = 'package.montagem');

-- ─────────────────────────────────────────────
-- HEALTH SCORE por módulo (verificações reais, dedução explicável)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_core_health()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r jsonb := '{}'::jsonb;
  v int; d jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;

  -- AI Gateway
  v := 100; d := '[]'::jsonb;
  IF (SELECT count(*) FROM orion_ai_log WHERE status='erro' AND criado_em > now() - interval '24 hours') > 0
    THEN v := v - 10; d := d || '"erros de IA nas últimas 24h"'::jsonb; END IF;
  IF (SELECT count(*) FROM orion_ai_models WHERE ativo) < 2
    THEN v := v - 5; d := d || '"menos de 2 modelos ativos (sem fallback)"'::jsonb; END IF;
  r := r || jsonb_build_object('ai_gateway', jsonb_build_object('score', v, 'deducoes', d));

  -- Publisher
  v := 100; d := '[]'::jsonb;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname ILIKE '%publisher%' AND NOT tgisinternal) < 6
    THEN v := v - 20; d := d || '"triggers do publisher incompletos"'::jsonb; END IF;
  IF (SELECT count(*) FROM orion_publisher_log WHERE status='erro_validacao') > 0
    THEN v := v - 1; d := d || '"anúncios com erro de validação pendentes (dado, não bug)"'::jsonb; END IF;
  r := r || jsonb_build_object('publisher', jsonb_build_object('score', v, 'deducoes', d));

  -- RIDV
  v := 100; d := '[]'::jsonb;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname='trg_ridv_v2_universal_queue' AND NOT tgisinternal) < 8
    THEN v := v - 20; d := d || '"blindagem incompleta"'::jsonb; END IF;
  IF NOT (SELECT active FROM cron.job WHERE jobname='ridv_worker_tick')
    THEN v := v - 15; d := d || '"cron RIDV inativo"'::jsonb; END IF;
  IF (SELECT count(*) FROM service_listings WHERE moderation_status='pending_ai_analysis') > 0
    THEN v := v - 5; d := d || '"pendências não processadas"'::jsonb; END IF;
  r := r || jsonb_build_object('ridv', jsonb_build_object('score', v, 'deducoes', d));

  -- Package
  v := 100; d := '[]'::jsonb;
  IF (SELECT count(*) FROM orion_pacotes WHERE status='dlq') > 0
    THEN v := v - 15; d := d || '"pacotes na DLQ"'::jsonb; END IF;
  IF NOT (SELECT active FROM cron.job WHERE jobname='orion_package_tick')
    THEN v := v - 15; d := d || '"cron inativo"'::jsonb; END IF;
  r := r || jsonb_build_object('package', jsonb_build_object('score', v, 'deducoes', d));

  -- Finance
  v := 100; d := '[]'::jsonb;
  IF (SELECT count(*) FROM orion_finance_divergencias WHERE status='aberta' AND gravidade='critico') > 0
    THEN v := v - 2 * (SELECT count(*) FROM orion_finance_divergencias WHERE status='aberta' AND gravidade='critico');
         d := d || '"divergências críticas abertas (achado real, aguarda decisão humana)"'::jsonb; END IF;
  IF NOT (SELECT active FROM cron.job WHERE jobname='orion_finance_tick')
    THEN v := v - 15; d := d || '"cron inativo"'::jsonb; END IF;
  r := r || jsonb_build_object('finance', jsonb_build_object('score', v, 'deducoes', d));

  -- Campaign
  v := 100; d := '[]'::jsonb;
  IF (SELECT count(*) FROM orion_campanhas WHERE status='dlq') > 0
    THEN v := v - 15; d := d || '"campanhas na DLQ"'::jsonb; END IF;
  IF NOT (SELECT active FROM cron.job WHERE jobname='orion_campaign_tick')
    THEN v := v - 15; d := d || '"cron inativo"'::jsonb; END IF;
  r := r || jsonb_build_object('campaign', jsonb_build_object('score', v, 'deducoes', d));

  -- Dispatcher
  v := 100; d := '[]'::jsonb;
  IF (SELECT count(*) FROM orion_dispatch_queue WHERE status='dlq') > 0
    THEN v := v - 15; d := d || '"itens na DLQ"'::jsonb; END IF;
  IF NOT (SELECT active FROM cron.job WHERE jobname='orion_dispatcher_tick')
    THEN v := v - 15; d := d || '"cron inativo"'::jsonb; END IF;
  IF (SELECT count(*) FROM motor_publish_requests WHERE status='aguardando_dispatcher'
      AND criado_em < now() - interval '24 hours') > 0
    THEN v := v - 5; d := d || '"requests aguardando há mais de 24h (GLM precisa puxar)"'::jsonb; END IF;
  r := r || jsonb_build_object('dispatcher', jsonb_build_object('score', v, 'deducoes', d));

  -- Growth
  v := 100; d := '[]'::jsonb;
  IF (SELECT count(*) FROM orion_growth_scores) = 0
    THEN v := v - 20; d := d || '"scores nunca calculados"'::jsonb; END IF;
  IF NOT (SELECT active FROM cron.job WHERE jobname='orion_growth_tick')
    THEN v := v - 15; d := d || '"cron inativo"'::jsonb; END IF;
  r := r || jsonb_build_object('growth', jsonb_build_object('score', v, 'deducoes', d));

  -- Motor
  v := 100; d := '[]'::jsonb;
  IF (SELECT count(*) FROM pg_proc WHERE proname IN
      ('motor_publish_request','motor_publish_status','motor_publish_cancel','motor_publish_retry','motor_publish_execute')) < 5
    THEN v := v - 30; d := d || '"API do motor incompleta"'::jsonb; END IF;
  r := r || jsonb_build_object('motor', jsonb_build_object('score', v, 'deducoes', d));

  -- Banco / Segurança
  v := 100; d := '[]'::jsonb;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
      WHERE ns.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
        AND (c.relname LIKE 'orion\_%' OR c.relname LIKE 'ridv\_%'
             OR c.relname IN ('pub_events','publication_history','publication_metrics','motor_publish_requests'))) > 0
    THEN v := v - 25; d := d || '"tabela ORION sem RLS"'::jsonb; END IF;
  IF (SELECT count(*) FROM pg_proc p WHERE p.prosecdef AND p.proname LIKE 'orion%'
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) cf WHERE cf LIKE 'search_path=%')) > 0
    THEN v := v - 2; d := d || '"triggers definer sem search_path fixado (baixo risco)"'::jsonb; END IF;
  r := r || jsonb_build_object('banco_seguranca', jsonb_build_object('score', v, 'deducoes', d));

  RETURN jsonb_build_object(
    'modulos', r,
    'score_geral', (SELECT round(avg((value->>'score')::numeric)) FROM jsonb_each(r)),
    'divida_conhecida', jsonb_build_array(
      '6 edges legadas pré-ORION chamam provedores direto (ai-chat, viagg-ai, moderate-text, moderate-image, ai-engine-gateway, auto-poster) — migrar ao Gateway',
      'Receita por cidade não rastreada nas ordens (limita Growth/Finance)',
      'CAC/LTV requerem rastreio de aquisição',
      'Auto-poster GLM antigo aguarda religação no contrato de pull do Dispatcher'),
    'gerado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_core_health() TO authenticated;
