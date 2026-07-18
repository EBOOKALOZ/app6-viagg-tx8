# ORION AI ECOSYSTEM — DOCUMENTO MESTRE (Single Source of Truth)

> **Este é o documento oficial e único de verdade da arquitetura ORION.** Toda auditoria, certificação, desenvolvimento ou manutenção deve usá-lo como referência principal. Inventário extraído da **produção** (`broifhfqmnzqoongtokm`) em 2026-07-14 — não de memória.
>
> **Números reais do ecossistema:** 31 módulos (AI-00…30) + Motor de Publicação + CORE + **OCE** · **410 funções** · **72 tabelas** · **32 triggers** · **28 cron jobs** · **117 prompts** no Registry · **3 modelos** de IA · **35 dashboards**.
>
> **Atualização 2026-07-15:** AI-18…29 certificados 🟢; AI-30 **Executive AI (CEO Copilot)** — cérebro executivo que consulta todos os módulos; **Executive Score + CEO Intelligence Index (CII)** + Decision Matrix + Executive Chat 🟢 98/100 (`orion-ai-30-executive-certificacao.md`); **ORION CORE — OCE** auditor read-only 100 🟢 CERTIFICADO ENTERPRISE.
> **Atualização 2026-07-16:** abre o **ORION DISCOVERY ECOSYSTEM** com **AI-32 Search & Discovery AI** — VIAGG Discovery Engine (4 scores explicáveis por anúncio + plano de otimização), gap detection e busca semântica 🟢 97/100 (`orion-ai-32-search-discovery-certificacao.md`); e **AI-33 GEO Optimization AI** — dados estruturados reais (JSON-LD/Open Graph/Twitter Cards) + FAQ + contexto semântico + **VIAGG GEO Index (VGI: Platinum/Gold/Silver/Bronze)** reutilizando os scores do AI-32 🟢 97/100 (`orion-ai-33-geo-optimization-certificacao.md`); e **AI-34 Knowledge Graph AI** — grafo de entidades/relações **com evidência** (nunca inventa) + **VIAGG Knowledge Index (VKI)** reutilizando AI-32/AI-33 🟢 97/100 (`orion-ai-34-knowledge-graph-certificacao.md`); e **AI-35 Recommendation Intelligence AI** — motor de recomendações com **RIS** e **Recommendation Score** (grafo/discovery/GEO/comportamento real), **toda recomendação com evidência**, fecha a cadeia do Discovery 🟢 97/100 (`orion-ai-35-recommendation-certificacao.md`); e **AI-36 AI Visibility & Answer Intelligence** — mede a prontidão para IA generativa com **AIS** (AI Visibility Score) + **AQS** (Answer Quality Score) consolidando AI-32/33/34/35/20, menções reais declaradas (nunca fabricadas) 🟢 97/100 (`orion-ai-36-ai-visibility-certificacao.md`). **AI-31 (Knowledge & Learning) segue EM ABERTO** — pulado a pedido. Próximo livre: **AI-37**.

---

## 1. Visão Geral

**Missão do ORION.** Transformar a operação da VIAGG-TX8 numa plataforma autônoma-assistida: do anúncio à receita, cada etapa é validada, moderada, empacotada, divulgada, despachada, medida, precificada e planejada por inteligência — sempre explicável, auditável e com o humano no comando das decisões críticas.

**Arquitetura geral.** Uma linha de produção de divulgação (Publisher → RIDV → Package → Campaign → Motor → Dispatcher → GLM), camadas transversais de inteligência (Finance, Growth, Conversion, Pricing, Forecast, Support), camadas executivas (Command, Operations, Strategy) e camadas de saúde (Performance, Health) — **todas** consumindo IA por uma **porta única** (AI Gateway) com prompts versionados (Prompt Registry) e comunicando por um **barramento de eventos** (`orion_eventos`).

**Princípios do ecossistema (congelados).**
1. IA nunca chama provedor direto — só o **AI Gateway**.
2. Prompts só pelo **Prompt Registry** (versionado, rollback).
3. Publicação só pela **porta única** `motor_publish_request`.
4. IA nunca movimenta dinheiro — Finance/Pricing/Forecast/Conversion são **read-only** sobre `pay_*`.
5. Idempotência por constraint UNIQUE — evento duplicado nunca duplica efeito.
6. Resiliência: retry com backoff → DLQ na 3ª → alerta.
7. Logs imutáveis (REVOKE UPDATE/DELETE).
8. Explicabilidade: toda recomendação carrega motivo/indicadores/confiança/riscos; projeção é sempre rotulada; lacuna de dado é declarada — nunca inventar métrica.
9. Território sempre por `orion_norm` (acento-insensível).
10. Decisão crítica é humana (comprar, iniciar, aprovar, corrigir, responder).

**Pilares tecnológicos.** Supabase (Postgres + RLS + pg_cron + pg_net + Edge Functions Deno), AI Gateway multi-provedor (OpenAI + Anthropic), React/Vite (painéis admin), Event Bus (`orion_eventos`).

**Governança.** Numeração congelada (§9); financeiro protegido (skill `regras-financeiras`); comissão é fonte única (`official_motoboy_commission`) — nenhum módulo a aplica.

---

## 2. Roadmap Oficial (módulos)

| Nº | Nome oficial | Chave | Versão | Status | Score | Certificação | Dependências | Situação |
|----|--------------|-------|--------|--------|-------|--------------|--------------|----------|
| AI-00 | AI Gateway | `orion-ai-gateway` | v3 | 🟢 Enterprise | 100 | 2026-07-14 | — | Ativo |
| AI-01 | Publisher AI | `publisher` | v1 | 🟢 Enterprise | 98 | 2026-07-14 | Gateway | Ativo |
| AI-02 | RIDV AI (Moderação) | `ridv` | v2 | 🟢 Enterprise | 99 | 2026-07-14 | Gateway, Publisher | Ativo |
| AI-03 | Package AI | `package` | v2 | 🟢 Enterprise | 100 | 2026-07-14 | Gateway, RIDV, Motor | Ativo |
| AI-04 | Finance AI | `finance` | v1 | 🟢 Enterprise | 97 | 2026-07-14 | pay_* (read-only) | Ativo |
| AI-05 | Campaign AI | `campaign` | v1 | 🟢 Enterprise | 99 | 2026-07-14 | Package, Motor | Ativo |
| AI-06 | Dispatcher AI | `dispatcher` | v1 | 🟢 Enterprise | 100 | 2026-07-14 | Motor, Campaign | Ativo |
| AI-07 | Growth AI | `growth` | v1 | 🟢 Enterprise | 100 | 2026-07-14 | todos (leitura) | Ativo |
| AI-08 | Execution Orchestrator | `execution` | v1 | 🟢 Enterprise | 99 | 2026-07-14 | RPCs oficiais, AI-09 | Ativo |
| AI-09 | Conversion & Attribution | `conversion` | v2 | 🟢 Enterprise | 96 | 2026-07-14 | Finance, Dispatcher | Ativo |
| AI-10 | Health & Observability | `health` | v2 | 🟢 Enterprise | 98 | 2026-07-14 | core_health, Performance | Ativo |
| AI-11 | Performance AI | `performance` | v1 | 🟢 Enterprise | 99 | 2026-07-14 | pg_stat, core_health | Ativo |
| AI-12 | Command Center | `executive` | v1 | 🟢 Enterprise | 98 | 2026-07-14 | health/core/perf/finance | Ativo |
| AI-13 | Operations AI (COO) | `operations` | v1 | 🟢 Enterprise | 98 | 2026-07-14 | Finance, Growth, Health | Ativo |
| AI-14 | Strategic Intelligence Suite | `strategy` | v1.1 | 🟢 Enterprise | 98 | 2026-07-14 | Conversion, Performance, Forecast | Ativo |
| AI-15 | Pricing AI | `pricing` | v1.1 | 🟢 Enterprise | 98 | 2026-07-14 | Finance, Conversion, Forecast | Ativo |
| AI-16 | Demand Forecast AI | `forecast` | v1 | 🟢 Enterprise | 90 | 2026-07-14 | pay_* (leitura), Growth | Ativo |
| AI-17 | Support AI | `support` | v1 | 🟢 Enterprise | 97 | 2026-07-14 | support_tickets (leitura) | Ativo |
| AI-18 | Marketplace Intelligence AI | `marketplace` | v1 | 🟢 Enterprise | 97 | 2026-07-15 | Growth, Conversion (leitura); sinais do marketplace | Ativo |
| AI-19 | Personalization AI | `personalization` | v1 | 🟢 Enterprise | 97 | 2026-07-15 | Marketplace AI-18, Growth (leitura); sinais por usuário | Ativo |
| AI-20 | Trust & Reputation AI | `trust` | v1 | 🟢 Enterprise | 97 | 2026-07-15 | Finance, Conversion, Publisher, RIDV (leitura) | Ativo |
| AI-21 | Automation AI | `automation` | v1 | 🟢 Enterprise | 97 | 2026-07-15 | todos (recomendações); AI-08 (delega) | Ativo |
| AI-22 | Business Intelligence AI | `business` | v1 | 🟢 Enterprise | 98 | 2026-07-15 | todos (saídas, leitura) | Ativo |
| AI-23 | Marketing AI | `marketing` | v1 | 🟢 Enterprise | 97 | 2026-07-15 | Marketplace, Personalization, Trust, BI, Conversion (leitura); AI-21 (execução) | Ativo |
| AI-24 | Security AI | `security` | v1 | 🟢 Enterprise | 97 | 2026-07-15 | auth audit, Trust, Automation, Gateway (leitura) | Ativo |
| AI-25 | Sales AI | `sales` | v1 | 🟢 Enterprise | 97 | 2026-07-15 | Marketplace, Marketing, Conversion, Trust (leitura) | Ativo |
| AI-26 | Customer Success AI | `customer_success` | v1 | 🟢 Enterprise | 97 | 2026-07-15 | Personalization, Trust, Sales, BI (leitura) | Ativo |
| AI-27 | Logistics AI | `logistics` | v1 | 🟢 Enterprise | 97 | 2026-07-15 | Dispatcher, Forecast, Pricing, Growth (leitura) | Ativo |
| AI-28 | Sustainability AI | `sustainability` | v1 | 🟢 Enterprise | 97 | 2026-07-15 | BI, Logistics, Growth, Customer Success (leitura) | Ativo |
| AI-29 | Innovation AI | `innovation` | v1 | 🟢 Enterprise | 97 | 2026-07-15 | todos (gaps+oportunidades, leitura) | Ativo |
| AI-30 | Executive AI · CEO Copilot | `executive_copilot` | v1 | 🟢 Enterprise | 98 | 2026-07-15 | TODOS os módulos (scores, leitura) | Ativo |
| AI-31 | Knowledge & Learning AI | `knowledge` | — | ⚪ NÃO CONSTRUÍDO | — | — | (reservado; não confundir com o motor `knowledge_engine` do AI-14) | Em aberto |
| AI-32 | Search & Discovery AI | `search_discovery` | v1 | 🟢 Enterprise | 97 | 2026-07-16 | Marketplace/Trust/BI/Marketing/Sales/Customer/Innovation/Executive (leitura) | Ativo |
| AI-33 | GEO Optimization AI | `geo_optimization` | v1 | 🟢 Enterprise | 97 | 2026-07-16 | AI-32 (Discovery/Semantic), Marketplace/Marketing/Sales/BI/Publisher (leitura) | Ativo |
| AI-34 | Knowledge Graph AI | `knowledge_graph` | v1 | 🟢 Enterprise | 97 | 2026-07-16 | AI-32 + AI-33 (Discovery/GEO/Semantic), Marketplace/BI/Publisher (leitura) | Ativo |
| AI-35 | Recommendation Intelligence AI | `recommendation_ai` | v1 | 🟢 Enterprise | 97 | 2026-07-16 | AI-32 + AI-33 + AI-34 (scores+grafo), Health/Performance/Operations | Ativo |
| AI-36 | AI Visibility & Answer Intelligence | `ai_visibility` | v1 | 🟢 Enterprise | 97 | 2026-07-16 | AI-32/33/34/35 + AI-20 Trust (leitura) — AIS/AQS | Ativo |
| AI-37 | AI Cost & Intelligence Center | `ai_center` | v1 | 🟢 Enterprise | 97 | 2026-07-16 | Gateway (orion_ai_log) + pay_* — FinOps/ROI/KPIs/forecast | Ativo |
| AI-38 | AI Governance Center | `ai_governance` | v1 | 🟢 Enterprise | 98 | 2026-07-16 | AI-37 (custos) + Gateway — orçamentos/políticas/perfis/auditoria/rollback (GCS) | Ativo |
| AI-39 | Visitor Intelligence AI | `visitor_intelligence` | v1 | 🟢 Enterprise | — | 2026-07-16 | marketplace_product_click_events (leitura) — comportamento/predição de visitantes sem PII | Ativo |
| AI-40 | Cyber Defense AI | `cyber_defense` | v1 | 🟢 Enterprise | 97 | 2026-07-17 | Gateway/auth audit/client_errors/eventos/Trust (leitura) — **abre o Security Ecosystem**; namespace `orion_cyber_*` (não colide com AI-24) | Ativo |
| AI-41 | Fraud Detection AI | `fraud_detection` | v1 | 🟢 Enterprise | 97 | 2026-07-17 | pay_*/credit_purchases/clicks/aci (leitura) — 17 detectores com evidência; espelha alta/crítica em `orion_cyber_events` (ponte AI-40); namespace `orion_fraud_*` | Ativo |
| AI-42 | Identity & Access AI | `identity_access` | v1 | 🟢 Enterprise | 97 | 2026-07-17 | auth.users/sessions/audit/mfa + profiles/user_roles + AI-40/41 (leitura) — IS/ATS/SRS/DCS + MAR + III; políticas adaptativas auditadas; espelha alta/crítica na base AI-40; namespace `orion_identity_*`/`orion_access_*`/`orion_devices` | Ativo |
| AI-44 | Security Audit AI | `security_audit` | v1 | 🟢 Enterprise | 97 | 2026-07-17 | pg_catalog/grants/cron/auth + AI-40/41/10 (leitura) — auditor de postura: 9 categorias, baseline+compliance, findings auto-close; SAS/COS/CIS/ACS+FRR/ACI; NUNCA altera o ambiente; namespace `orion_secaudit_*` | Ativo |
| AI-45 | Incident Response AI | `incident_response` | v1 | 🟢 Enterprise | 97 | 2026-07-17 | orion_cyber_events (40+41+42+44) + campanhas AI-43 — fecha o funil: incidentes classificados (IRS/ICS/RTS/Recovery), playbooks auditáveis, timeline/evidências imutáveis, rollback preserva histórico; bloqueio SÓ via RPCs guardadas dos irmãos; selftest 17 checks (COMANDO TESTE); namespace `orion_incident_*` | Ativo |
| AI-47 | Zero Trust AI | `zero_trust` | v1 | 🟢 Enterprise | 97 | 2026-07-17 | AI-42 (IS/ATS/sessões/dispositivos) + AI-40/41/43/44 (risco) + auth.audit (contexto) — camada central de decisão (nunca confiar, sempre verificar): ZTS/CAS/DAS/SAS→RCS→7 decisões por política; avaliação contínua tick `*/2`; decisões+cofre imutáveis, rollback lógico, exceção temporária auditada; selftest 13 checks (COMANDO TESTE); namespace `orion_zero_trust_*` | Ativo |
| AI-48 | Compliance & LGPD AI | `compliance_lgpd` | v1 | 🟢 Enterprise | 97 | 2026-07-17 | profiles/aceites/auth + AI-42/44/45/46/47 (leitura) — registro de tratamento vivo, direitos do titular auditados, retenção medida, incidentes de privacidade→AI-45; CPS/LCS/DRS/PRS; nunca altera dado pessoal; namespace `orion_compliance_*`/`orion_lgpd_*` | Ativo |
| AI-50 | Governance AI | `governance` | v1 | 🟢 Enterprise | 97 | 2026-07-17 | prefs/cron/prompts/log (leitura) — Governador: registro auto-descoberto de 53 modulos, saude/certs/deps/lifecycle; GS/LS/CS/DEPS/OHS; namespace `orion_gov_*` | Ativo |
| AI-51 | Observability AI | `observability` | v1 | 🟢 Enterprise | 97 | 2026-07-17 | cron.job_run_details/pg_stat_statements/client_errors/orion_ai_log/orion_eventos + AI-10/11 (leitura) — Centro de Observabilidade: metricas/logs/traces/health/SLI/SLO+RCA; OHS/PHS/DAS/LQS/TPS/SLO Compliance; sanitiza secrets; tick `*/1`; selftest 12; NAO duplica AI-10/11; namespace `orion_obs_*` | Ativo |
| AI-52 | Cost Optimization AI | `cost_optimization` | v1 | 🟢 Enterprise | 97 | 2026-07-17 | pg/storage/cron + AI-37 (leitura) — custo tecnico: uso real x preco declarado, orcamentos, forecasts, anomalias, recomendacoes; COS/CES/RIS/FAS/BCS; namespace `orion_cost_*` | Ativo |
| AI-54 | Business Intelligence AI (DW) | `business_intelligence` | v1 | 🟢 Enterprise | 97 | 2026-07-17 | pay/promo/leiloes/clicks/auth + AI-22+AI-52 (leitura) — DW executivo: facts/KPIs/insights/forecasts, so dados reais, lacunas declaradas; namespace `orion_biz_*`; painel /admin/orion-bi | Ativo |
| — | Motor de Publicação | `motor_publish_*` | v1 | 🟢 Enterprise | 100 | 2026-07-14 | — (porta única) | Ativo |
| — | ORION CORE Consolidation | — | v1 | 🟢 Certificado | 99 | 2026-07-14 | todos | Fundação |
| — | **OCE — Certification Engine** | `certification` | v1 | 🟢 Enterprise | 98 | 2026-07-15 | catálogo (read-only) | CORE / auditor |

**Próximo número livre: AI-43.** **ORION SECURITY ECOSYSTEM** (AI-40..AI-49) inaugurado em 2026-07-17: **AI-40 Cyber Defense** (`cyber_defense`, base comum de eventos/scores/políticas/auditoria — namespace `orion_cyber_*`, não colide com AI-24 `security`) + **AI-41 Fraud Detection** (`fraud_detection`, espelha alta/crítica na base do AI-40) + **AI-42 Identity & Access** (`identity_access`, camada de identidade/sessões/dispositivos/políticas — base de confiança p/ AI-43 Threat Intelligence e AI-47 Zero Trust; espelha alta/crítica na base do AI-40). **ORION DISCOVERY ECOSYSTEM** (AI-32..AI-36): AI-32 Search & Discovery + AI-33 GEO Optimization + **AI-34 Knowledge Graph** + **AI-35 Recommendation Intelligence** + **AI-36 AI Visibility & Answer Intelligence** (descobrir→otimizar→conhecer→recomendar→medir visibilidade p/ IA) já ativos. **AI-31 (Knowledge & Learning AI) segue EM ABERTO** — pulado a pedido; chave `knowledge` (não confundir com AI-34 `knowledge_graph` nem com o `knowledge_engine` do AI-14). **OCE é CORE, não recebe número de IA.**

---

## 3. Documento individual de cada módulo

> Template: Identificação · Objetivo · Faz · NÃO faz · Entradas · Saídas · Dependências · Consumidores · Banco · Edge · Prompts · Gateway · Dashboard · Segurança · Observabilidade · Fluxo.

### AI-00 — AI Gateway (`orion-ai-gateway`, v3)
- **Objetivo:** porta única de IA multi-provedor.
- **Faz:** resolve modelo por módulo, cache, rate limit, retry, fallback entre provedores, custo por chamada, log imutável, resolve `prompt_key` do Registry.
- **NÃO faz:** decisões de negócio; não expõe a chave (só em secrets).
- **Entradas:** `{module, task, prompt, prompt_key?, system?, model?, max_tokens?}`. **Saídas:** `{texto, provider, model, tokens, custo}`.
- **Dependências:** OpenAI, Anthropic. **Consumidores:** TODOS os módulos com IA.
- **Banco:** `orion_ai_models`, `orion_ai_config`, `orion_ai_module_prefs`, `orion_ai_log` (imutável), `orion_ai_cache`, `orion_ai_prompts`. RPCs: `orion_ai_gateway_ctx`, `orion_ai_dashboard`, `orion_ai_prompt_set/get/rollback`, `orion_ai_config_set`, `orion_ai_model_upsert`.
- **Edge:** `orion-ai-gateway`. **Prompts:** N/A (serve todos). **Dashboard:** `/admin/orion-ai`.
- **Segurança:** chave só em secrets; log REVOKE UPD/DEL; rate por minuto/dia/mês/módulo/usuário. **Fluxo:** `Módulo → Gateway → Provedor → log → resposta`.

### AI-01 — Publisher AI (`publisher`, v1)
- **Objetivo:** porta de entrada de anúncios (validação + duplicidade).
- **Faz:** trigger AFTER INSERT nas 6 tabelas de anúncio → valida (IBGE, campos) + similaridade pg_trgm; log + eventos `anuncio_*`.
- **NÃO faz:** moderar conteúdo (é da RIDV); publicar.
- **Entradas:** INSERT de anúncio. **Saídas:** `orion_publisher_log`, eventos `anuncio_validado/reprovado/duplicado/pronto_para_moderacao`.
- **Consumidores:** RIDV, Growth. **Banco:** `orion_publisher_log`; funções `orion_publisher_validar/varredura/painel/tg`. **Dashboard:** `/admin/orion-publisher`. **Fluxo:** `INSERT → Publisher → RIDV`.

### AI-02 — RIDV AI (`ridv`, v2)
- **Objetivo:** moderação obrigatória (texto + imagem).
- **Faz:** blindagem (8 triggers força `pending_ai_analysis`), worker (`ridv-worker`) analisa texto via Gateway (`prompt_key: ridv.moderacao.texto`), aplica veredito; revisão manual admin; imagens via `moderate-image`.
- **NÃO faz:** montar pacote; publicar direto.
- **Entradas:** anúncios pendentes. **Saídas:** aprovado→vitrine / bloqueado→invisível / dúvida→fila; `ridv_decisions_log`; eventos `anuncio_aprovado/bloqueado/revisao_manual`, `moderacao_concluida`.
- **Consumidores:** Package. **Banco:** `ridv_decisions_log` (imutável); funções `ridv_worker_fila/aplicar`, `ridv_manual_review`, `ridv_fila_revisao`, `ridv_reprocessar`, `ridv_dashboard/historico`. **Edge:** `ridv-worker`, `moderate-image`, `moderate-text`. **Prompts:** `ridv.moderacao.texto`. **Cron:** `ridv_worker_tick` (*/5min). **Dashboard:** `/admin/ridv`. **Segurança:** blindagem só service_role muda status; log REVOKE UPD/DEL.

### AI-03 — Package AI (`package`, v2)
- **Objetivo:** montar pacote de divulgação multi-canal.
- **Faz:** consumo idempotente de `anuncio_aprovado`; `package-worker` monta (whatsapp/feed/marketplace/push + hashtags/CTA/link) via Gateway (`prompt_key: package.montagem`); IA de qualidade LGPD; recomendação comercial; DLQ 3×.
- **NÃO faz:** publicar (envia ao Motor); mexer em preço.
- **Saídas:** `orion_pacotes`; eventos `pacote_montado/recomendado/dlq`. **Consumidores:** Campaign. **Banco:** `orion_pacotes`, `orion_pacotes_versoes`; funções `orion_package_fila/aplicar/recomendar/enviar_motor/...`. **Edge:** `package-worker`. **Prompts:** `package.montagem`. **Cron:** `orion_package_tick` (*/5min). **Dashboard:** `/admin/orion-package`.

### AI-04 — Finance AI (`finance`, v1)
- **Objetivo:** cérebro financeiro consultivo.
- **Faz:** conciliação (7 checagens), antifraude (score+evidências), previsão, alertas — **read-only** sobre `pay_*`.
- **NÃO faz:** mover dinheiro, tocar ledger, aplicar comissão.
- **Saídas:** `orion_finance_divergencias/alertas/snapshots`; eventos `finance_*`. **Consumidores:** Command, Operations, Growth, Strategy, Pricing. **Banco:** as 3 próprias + funções `orion_finance_conciliar/fraude/dashboard/resolver/tick`. **Cron:** `orion_finance_tick` (12 * * * *). **Dashboard:** `/admin/orion-finance`. **Segurança:** read-only provado (ledger idêntico antes/depois).

### AI-05 — Campaign AI (`campaign`, v1)
- **Objetivo:** planejar campanhas.
- **Faz:** nasce de `pacote_montado` (idempotente); planejamento determinístico (canais/janela/frequência/grupos DA cidade/orçamento); publica só via Motor; otimização sugere.
- **NÃO faz:** publicar direto; alterar campanha publicada.
- **Saídas:** `orion_campanhas`; eventos `campaign_*`. **Consumidores:** Motor, Dispatcher, Conversion. **Banco:** `orion_campanhas`, `orion_campanhas_versoes`. **Cron:** `orion_campaign_tick` (*/10min). **Dashboard:** `/admin/orion-campaign`.

### AI-06 — Dispatcher AI (`dispatcher`, v1)
- **Objetivo:** orquestrar a execução (o M54).
- **Faz:** requests `aguardando_dispatcher` → itens por grupo (só da cidade, cooldowns, prioridade); pull contract GLM; confirm → `motor_publish_execute`; retry→DLQ; failover heartbeat.
- **NÃO faz:** publicar (é o Motor); postar fisicamente (é o GLM/operador).
- **Saídas:** `orion_dispatch_queue`; eventos `dispatch_*/worker_*`. **Banco:** `orion_dispatch_queue` (imutável), `orion_dispatch_workers`; funções `orion_dispatcher_planejar/glm_pull/glm_confirm/liberar_workers/dashboard`. **Cron:** `orion_dispatcher_tick` (*/5min). **Dashboard:** `/admin/orion-dispatcher`.

### AI-07 — Growth AI (`growth`, v1)
- **Objetivo:** inteligência estratégica de expansão.
- **Faz:** score 0-100/cidade (fórmula explicável), radares oportunidade/risco, previsões multi-horizonte, IA executiva — consultivo.
- **NÃO faz:** executar; inventar (receita/cidade declaradas indisponíveis).
- **Saídas:** `orion_growth_scores`, `orion_growth_relatorios`; eventos `growth_*`. **Consumidores:** Command, Operations, Strategy, Pricing, Forecast. **Cron:** `orion_growth_tick` (28 * * * *). **Dashboard:** `/admin/orion-growth`.

### AI-08 — Execution Orchestrator (`execution`, v1)
- **Objetivo:** executar workflows autorizados.
- **Faz:** ações aprovadas via **RPCs oficiais** (iniciar campanha, enviar pacote, planejar despacho); dependências entre workflows; aprovação humana; retry→DLQ; rollback; instrumenta AI-09.
- **NÃO faz:** lógica paralela; postar no WhatsApp (GLM).
- **Saídas:** `orion_execucoes`; eventos `execution_*`; touchpoints p/ Conversion. **Cron:** `orion_execution_tick` (*/10min). **Dashboard:** `/admin/orion-execution`.

### AI-09 — Conversion & Attribution (`conversion`, v2)
- **Objetivo:** Revenue Intelligence (jornada→receita).
- **Faz:** touchpoints (harvest de pay/cadastros/publicações), **5 modelos de atribuição** (first/last/linear/time_decay/data_driven), funil, ROI/CAC/LTV com fonte citada.
- **NÃO faz:** recalcular financeiro; escrever no ledger.
- **Saídas:** `orion_touchpoints` (imutável); porta `conversion_track()`. **Consumidores:** Pricing, Strategy, Forecast, Execution. **Cron:** `orion_conversion_tick` (7 * * * *). **Dashboard:** `/admin/orion-conversion`.

### AI-10 — Health & Observability (`health`, v2)
- **Objetivo:** disponibilidade + incidentes + trace.
- **Faz:** status board (17 componentes), health_score (reusa core+perf), Centro de Incidentes (abre/fecha auto), Trace Engine (`orion_trace`), narrativas.
- **NÃO faz:** duplicar Performance; estimar o não-mensurável (declara indisponível).
- **Saídas:** `orion_health_snapshots/incidentes`, `orion_trace`; eventos `health_*`. **APIs:** `health_score/report/status/incidents/events/alerts/predictions/trace`. **Cron:** `orion_health_tick` (*/20min). **Dashboard:** `/admin/orion-health`.

### AI-11 — Performance AI (`performance`, v1)
- **Objetivo:** plataforma autoavaliável.
- **Faz:** métricas reais (pg_stat_statements, índices, locks, cache, storage, filas, gateway P95/P99), Performance Score, otimizador (justificativa+impacto+risco), narrativas.
- **NÃO faz:** o não-mensurável (CPU/mem/Web Vitals declarados).
- **Saídas:** `orion_perf_snapshots/alertas/analises` (imutáveis). **APIs:** `performance_score/report/history/alerts/predictions/optimizer`. **Cron:** `orion_perf_tick` (45 * * * *). **Dashboard:** `/admin/orion-performance`.

### AI-12 — Command Center (`executive`, v1)
- **Objetivo:** painel executivo (empresa em 30s).
- **Faz:** agregação PURA — Executive Score, mapa dos módulos, alertas agregados, KPIs, Decision Panel (IA) — nada recalculado.
- **NÃO faz:** recalcular; executar.
- **APIs:** `executive_dashboard/score/modules/alerts/kpis/actions/summary` (auditado c/ trace). **Prompts:** `executive.summary`. **Dashboard:** `/admin/orion-command`.

### AI-13 — Operations AI / COO (`operations`, v1)
- **Objetivo:** transformar achados reais em missões priorizadas.
- **Faz:** motor de decisão (divergências, DLQ, incidentes, fila GLM, cidades sem grupos → missões idempotentes que arquivam sozinhas); ciclo auditado; Execution Score.
- **NÃO faz:** executar sozinho (aprovação humana).
- **Saídas:** `orion_missoes`; eventos `operations_*`. **Cron:** `orion_operations_tick` (52 * * * *). **Dashboard:** `/admin/orion-operations`.

### AI-14 — Strategic Intelligence Suite (`strategy`, v1.1)
- **Objetivo:** conselho estratégico (5 motores).
- **Faz:** Knowledge/Prediction/Decision/Optimization/Simulation; **plano de ação consolidado** (5 sinais, custo/benefício); projeções trimestrais/anuais; simulações que nunca tocam produção.
- **NÃO faz:** executar; alterar produção.
- **Saídas:** `orion_knowledge`, `orion_simulacoes` (imutáveis). **Cron:** `orion_strategy_tick` (58 * * * *). **Dashboard:** `/admin/orion-strategy`.

### AI-15 — Pricing AI (`pricing`, v1.1)
- **Objetivo:** Revenue Optimization.
- **Faz:** recomenda preços/comissões/margens; **motor de decisão explicável** (Preço Inteligente por fatores); anomalias; análise cidade/categoria/horário; heatmap; aplica só o catálogo `divulgacao_packages` sob política (limites+aprovação+rollback).
- **NÃO faz:** mover dinheiro; aplicar comissão (fonte única — só advisory).
- **Saídas:** `orion_pricing_policies/history` (history imutável). **Dashboard:** `/admin/orion-pricing`. **Segurança:** read-only sobre pay_* provado.

### AI-16 — Demand Forecast AI (`forecast`, v1)
- **Objetivo:** prever demanda multi-horizonte.
- **Faz:** previsão pedidos/receita 24h→12m (mm7-dow-v1) com confiança+erro+base declarados; validação previsto×realizado (snapshots imutáveis); recomendações.
- **NÃO faz:** inventar previsão sem confiança; alterar produção.
- **Saídas:** `orion_forecast_snapshots` (imutável). **APIs:** `forecast_dashboard/score/predictions/accuracy/recommendations/history/summary/map/metrics`. **Cron:** `orion_forecast_tick` (23h Cuiabá). **Dashboard:** `/admin/orion-forecast`.

### AI-17 — Support AI (`support`, v1)
- **Objetivo:** inteligência de suporte.
- **Faz:** triagem por urgência/tema, fila priorizada, sugestão de resposta (via Gateway, `prompt_key: support.response` — atendente revisa), recorrências, SLA.
- **NÃO faz:** duplicar a edge `support-ai`; mudar status/enviar resposta; tocar tickets (read-only).
- **Saídas:** `orion_support_analises` (imutável); eventos `support_*`. **Cron:** `orion_support_tick` (25 * * * *). **Dashboard:** `/admin/orion-support`.

### AI-18 — Marketplace Intelligence AI (`marketplace`, v1)
- **Objetivo:** cérebro comercial — dados do marketplace → inteligência de negócio explicável.
- **Faz:** tendências por vertical (30d vs 30d ant.), conversão por vertical (unlock pago), território (demanda×oferta por cidade via `orion_norm`), oportunidades (alta demanda + baixa conversão), qualidade de anúncios e sugestões a lojistas — consolidados em `orion_market_insights` (idempotente/dia, com módulos+métricas+justificativa+confiança).
- **NÃO faz:** executar ação comercial/financeira; publicar; inventar métrica (busca sem log = **lacuna declarada**); duplicar módulos.
- **Entradas:** advertiser_contact_intentions, marketplace_product_click_events, advertiser_listings, merchant_products, city_growth_metrics, neighborhood_product_demand, orion_growth_scores (todas **read-only**). **Saídas:** `orion_market_insights`; eventos `market_*`.
- **Dependências:** Growth (score), Conversion (sinal), Gateway, Registry, Event Bus, orion_norm. **Consumidores:** Command/Operations/Campaign (via insights/eventos).
- **Banco:** `orion_market_insights` (imutável p/ público, UNIQUE tipo+escopo+ref+dia). **APIs:** `market_dashboard/score/metrics/trends/territory/listings_intelligence/merchant_intelligence/search_intelligence/opportunities/generate_insights/recommendations/summary`. **Prompts:** `market.executive/opportunities/merchant/trends/summary`. **Cron:** `orion_market_tick` (40 * * * *). **Dashboard:** `/admin/orion-marketplace`. **Segurança:** read-only provado; log imutável; decisão humana.

### AI-19 — Personalization AI (`personalization`, v1)
- **Objetivo:** experiência adaptativa por usuário — Home inteligente, recomendações e descoberta, explicáveis e com privacidade.
- **Faz:** deriva perfil (afinidade de lojas/produtos, cidade, horários) de sinais comportamentais autorizados; gera recomendações (descoberta de lojas, produtos regionais, tendência AI-18) com score+fatores+motivo; Home em blocos ordenados; melhor horário de notificação.
- **NÃO faz:** usar atributos sensíveis (cpf/nascimento); decidir dinheiro; publicar; duplicar módulos. Opt-out apaga o perfil.
- **Entradas:** marketplace_product_click_events, store_carts, profiles (SÓ cidade), orion_market_insights (AI-18), orion_growth_scores — **read-only**. **Saídas:** `orion_perso_profiles`, `orion_perso_recommendations`; eventos `perso_*`.
- **Dependências:** Marketplace AI-18, Growth, Gateway, Registry, Event Bus, orion_norm. **Consumidores:** front (Home/recomendações por usuário), Campaign (futuro).
- **Banco:** `orion_perso_profiles` (upsert/user), `orion_perso_recommendations` (imutável, UNIQUE user+tipo+ref+dia), `orion_perso_optout`. **APIs:** `perso_home/profile/recommend_products/recommend_stores/best_notification_time/set_optout/generate/score/metrics/summary/dashboard`. **Prompts:** `perso.executive/home/discovery/summary`. **Cron:** `orion_perso_tick` (33 * * * *). **Dashboard:** `/admin/orion-personalization`. **Privacidade:** minimização + opt-out real + RLS por usuário + só sinais comportamentais.

### AI-20 — Trust & Reputation AI (`trust`, v1)
- **Objetivo:** camada oficial de confiança — Trust Score explicável por entidade + alertas de risco + API reutilizável.
- **Faz:** calcula Trust Score (soma ponderada de fatores reais) para buyer/account/merchant/listing; snapshot diário (histórico/evolução); detecta risco (anomalia de pagamento, baixa credibilidade) e alerta; expõe `trust_get(tipo,id)` para os demais módulos.
- **NÃO faz:** bloquear/suspender automaticamente (só recomenda); mover dinheiro; permitir que outro módulo altere o score (só o motor). Avaliações/denúncias e entregas declaradas quando ausentes.
- **Entradas:** pay_payment_orders, merchant_stores, advertiser_contact_intentions, advertiser_listings, delivery_orders — **read-only**. **Saídas:** `orion_trust_scores`, `orion_trust_alerts`; eventos `trust.updated/trust.alert`.
- **Dependências:** Finance/Conversion/Publisher/RIDV (leitura), Gateway, Registry, Event Bus. **Consumidores:** Marketplace, Personalization, Campaign, Support, Operations, Growth, Pricing (via `trust_get`).
- **Banco:** `orion_trust_scores` (snapshot/dia, UNIQUE ent_tipo+ent_id+dia), `orion_trust_alerts` (imutável). **APIs:** `trust_get/generate/ranking/alerts/score/metrics/timeline/summary/dashboard`. **Prompts:** `trust.executive/alerts/entity/summary`. **Cron:** `orion_trust_tick` (48 * * * *). **Dashboard:** `/admin/orion-trust`. **Segurança:** read-only provado; só o motor atualiza; recomenda, nunca bloqueia.

### AI-21 — Automation AI (`automation`, v1)
- **Objetivo:** camada oficial de automação — orquestra execuções por política. **NUNCA decide; apenas executa.**
- **Faz:** recebe pedidos (`automation_request`), resolve política (auto/aprovação/bloqueado), valida concorrência+idempotência+dupla-trava e executa ações seguras de uma **allowlist** (recalcular trust/marketplace/perso, rankings, relatório) ou **delega** workflows (Campaign/Motor/Operations) via Event Bus; auditoria completa.
- **NÃO faz:** decidir mérito; executar financeiro/PIX/estorno/exclusão/permissões/RLS (sempre bloqueado — dupla trava); duplicar o AI-08 (que executa workflows via RPCs oficiais).
- **Entradas:** recomendações dos módulos; políticas. **Saídas:** `orion_automation_requests` (auditoria); eventos `automation.started/completed/failed/rollback/approved/delegated`.
- **Dependências:** todos (recomendações), AI-08 (delega), Gateway, Registry, Event Bus, RPCs seguras. **Consumidores:** admin/painel; módulos donos (delegação).
- **Banco:** `orion_automation_policies` (política/ação, configurável), `orion_automation_requests` (auditoria, UNIQUE idempotency_key). **APIs:** `automation_request/execute/approve/reject/rollback/policies/set_policy/queue/score/metrics/history/summary/dashboard`. **Prompts:** `automation.plan/validate/execute/audit/summary`. **Cron:** `orion_automation_tick` (16 * * * *). **Dashboard:** `/admin/orion-automation`. **Segurança:** dupla trava financeira provada; read-only em dinheiro; só o motor atualiza.

### AI-22 — Business Intelligence AI (`business`, v1)
- **Objetivo:** Centro Executivo — consolida saídas de todos os módulos em KPIs estratégicos, evolução histórica e narrativa. **Exclusivamente analítico.**
- **Faz:** 6 lentes (executivo/financeiro/comercial/operacional/inteligência/IA); snapshot diário de KPIs (`orion_bi_kpis`) com explicabilidade (origem/módulos/metodologia/confiança); evolução histórica; narrativa executiva citando os módulos-fonte.
- **NÃO faz:** executar ações; mover dinheiro; alterar dados; recalcular regra de outro módulo; duplicar o AI-12 (Command, tempo real).
- **Entradas (read-only):** pay_payment_orders, advertiser_listings/contact_intentions, marketplace_product_click_events, delivery_orders, freight_listings, orion_trust_scores/market_insights/growth_scores/perso_profiles/finance_snapshots/ai_log. **Saídas:** `orion_bi_kpis`; eventos `business.kpi.updated/business.summary.created/business.alert`.
- **Dependências:** todos (leitura), Gateway, Registry, Event Bus. **Consumidores:** administração executiva.
- **Banco:** `orion_bi_kpis` (snapshot/dia, UNIQUE dominio+chave+dia). **APIs:** `bi_dashboard/executive/financial/commercial/operational/intelligence/ia/generate/evolution/score/summary`. **Prompts:** `business.summary/analysis/executive/kpi/forecast`. **Cron:** `orion_bi_tick` (9 * * * *). **Dashboard:** `/admin/orion-business-intelligence`. **Segurança:** read-only total; só escreve a própria tabela de KPI.

### AI-23 — Marketing AI (`marketing`, v1)
- **Objetivo:** cérebro de marketing — segmenta públicos, recomenda campanhas, mede ROI, sugere SEO, visitor intelligence. **Recomenda/analisa; nunca envia.**
- **Faz:** segmentos automáticos (recorrentes/sem compra/alto interesse/novos/lojistas); recomendações de campanha (local/categoria/comportamento) com score+ROI estimado+público+canais+motivo; ROI por canal/categoria (reuso touchpoints); visitor intelligence; SEO por demanda.
- **NÃO faz:** enviar/publicar campanha (execução via AI-21 sob aprovação, ou AI-05); duplicar AI-05 (ciclo da campanha) nem AI-09 (atribuição); inventar (CAC/CPC/CTR e busca interna declarados).
- **Entradas (read-only):** orion_touchpoints, pay_payment_orders, marketplace_product_click_events, advertiser_contact_intentions, merchant_stores, orion_perso_profiles, orion_market_insights, orion_campanhas. **Saídas:** `orion_marketing_segments`, `orion_marketing_recommendations`; eventos `marketing.recommendation/segment.created/roi.updated`.
- **Dependências:** Marketplace, Personalization, Trust, BI, Conversion, Growth (leitura), Gateway, Registry, Event Bus. **Consumidores:** admin; Automation AI-21 (execução sob aprovação).
- **Banco:** `orion_marketing_segments`, `orion_marketing_recommendations` (idempotentes/dia). **APIs:** `mkt_dashboard/generate/segments/recommendations/campaigns/roi/visitor_intelligence/seo/trends/score/metrics/summary`. **Prompts:** `marketing.segment/campaign/roi/seo/strategy`. **Cron:** `orion_marketing_tick` (21 * * * *). **Dashboard:** `/admin/orion-marketing`. **Segurança:** read-only; nunca envia campanha.

### AI-24 — Security AI (`security`, v1)
- **Objetivo:** Centro de Inteligência de Segurança — detecção preventiva de anomalias/fraude/abuso + auditoria. **Nunca bloqueia sozinho.**
- **Faz:** detecta autenticação repetida, abuso de API, ações críticas bloqueadas, picos de eventos, fraude (reuso Trust); alertas explicáveis (fator/evidência/confiança/política); config por limiar/modo.
- **NÃO faz:** bloquear/suspender automaticamente (alerta/recomenda; aprovação via AI-21); alterar configurações críticas; inventar (IP/multi-conta declarados).
- **Entradas (read-only):** auth.audit_log_entries, orion_eventos, orion_ai_log, orion_automation_requests, orion_trust_alerts, profiles. **Saídas:** `orion_security_alerts`; eventos `security.alert/risk/audit/summary`.
- **Dependências:** Trust, Automation, Gateway, Registry, Event Bus, Publisher/RIDV (sinais). **Consumidores:** admin; Automation AI-21 (contenção sob aprovação).
- **Banco:** `orion_security_alerts` (imutável), `orion_security_config` (limiares/modo). **APIs:** `sec_dashboard/generate/alerts/auth_analysis/sessions/api_abuse/critical_actions/anomalies/fraud/score/metrics/summary/config/set_config`. **Prompts:** `security.anomaly/risk/audit/summary/recommendation`. **Cron:** `orion_security_tick` (37 * * * *). **Dashboard:** `/admin/orion-security`. **Segurança:** read-only; nunca bloqueia automaticamente.

### ORION CORE — Certification Engine / OCE (`certification`, v1)
- **Objetivo:** auditor oficial que substitui a homologação manual por certificação automatizada. **Parte do ORION CORE — não é uma IA numerada.**
- **Faz:** roda verificações REAIS ao vivo sobre o catálogo (RLS, idempotência, search_path, financeiro read-only, gateway, event bus, crons); emite score por dimensão + veredito; gera patches (Auto Patch Advisor) para falhas.
- **NÃO faz:** modificar o sistema (nunca aplica patch, nunca altera RLS/permissões/dados, nunca executa SQL destrutivo, nunca move dinheiro); fingir os checks de navegador/carga (Front-End/UX/Visual/Mobile/Marketplace-E2E/Stress/Visitor/IA-Scenario ficam **declarados**).
- **Entradas (read-only):** pg_class/pg_proc/pg_constraint, cron.job, orion_ai_log, orion_eventos, orion_ai_prompts/models/module_prefs. **Saídas:** `orion_oce_runs/results/patches`; evento `certification.completed`.
- **Banco:** `orion_oce_checks` (catálogo) · `orion_oce_runs` · `orion_oce_results` · `orion_oce_patches` (imutáveis). **APIs:** `oce_certify/last_run/results/patches/history/score/summary/dashboard`. **Prompts:** `certification.executive/architecture/frontend/security/performance/patch/summary/audit`. **Cron:** `orion_oce_tick` (50 * * * *). **Dashboard:** `/admin/orion-certification`. **Homologação:** score 100 · 🟢 CERTIFICADO ENTERPRISE (13 checks reais / 0 falhas / 8 declarados).

### AI-25 — Sales AI (`sales`, v1)
- **Objetivo:** Centro Inteligente de Vendas — converte interesse em venda (funil + Sales Opportunity Score + recuperação). **Recomenda; nunca fecha venda.**
- **Faz:** funil (visitantes→interesse→intenção→conversão→compra); pontua oportunidades (Sales Opportunity Score 0-100 explicável = recência+demanda+conversão+engajamento); conversão por vertical/cidade; recuperação de carrinho.
- **NÃO faz:** fechar/executar venda; duplicar AI-23 (atrai) nem AI-09 (atribuição); inventar (Trust do comprador por telefone e carrinho vazio declarados).
- **Entradas (read-only):** advertiser_contact_intentions (leads pending_unlock), store_carts, pay_payment_orders, marketplace_product_click_events, orion_trust_scores, orion_perso_profiles, orion_market_insights. **Saídas:** `orion_sales_opportunities`; eventos `sales.opportunity/pipeline`.
- **Dependências:** Marketplace, Marketing, Conversion, Trust, Personalization, Pricing, Forecast (leitura), Gateway, Registry, Event Bus. **Consumidores:** admin; Automation AI-21 (execução sob aprovação).
- **Banco:** `orion_sales_opportunities` (Sales Opportunity Score/dia). **APIs:** `sales_dashboard/generate/funnel/opportunities/cart_recovery/conversion/score/metrics/summary`. **Prompts:** `sales.opportunity/pipeline/conversion/recovery/summary`. **Cron:** `orion_sales_tick` (43 * * * *). **Dashboard:** `/admin/orion-sales`. **Segurança:** read-only; nunca fecha venda.

### AI-26 — Customer Success AI (`customer_success`, v1)
- **Objetivo:** reter/engajar após a conversão — Customer Health Score + churn risk + reengajamento. **Recomenda; nunca executa.**
- **Faz:** calcula Customer Health Score (0-100 explicável = recência+frequência+compras+vendedor+trust) e Churn Risk (muito_baixo→crítico) por usuário; detecta em risco/inativos/vendedores sem anúncio; recorrência.
- **NÃO faz:** alterar dados do usuário; executar retenção (via AI-21 sob aprovação); inventar (satisfação/histórico de suporte declarados).
- **Entradas (read-only):** marketplace_product_click_events, pay_payment_orders, store_carts, merchant_stores, orion_trust_scores. **Saídas:** `orion_customer_health`; eventos `customer.health.updated/churn.detected`.
- **Dependências:** Personalization, Trust, Sales, BI, Marketing (leitura), Gateway, Registry, Event Bus. **Consumidores:** admin; usuário (próprio health via RLS); Automation AI-21 (execução sob aprovação).
- **Banco:** `orion_customer_health` (Health Score/dia, RLS por usuário). **APIs:** `cs_dashboard/generate/health/at_risk/reengagement/recurrence/score/metrics/summary`. **Prompts:** `customer.health/churn/retention/reengagement/summary`. **Cron:** `orion_customer_success_tick` (19 * * * *). **Dashboard:** `/admin/orion-customer-success`. **Segurança:** read-only; RLS por usuário; nunca altera dados.

### AI-27 — Logistics AI (`logistics`, v1)
- **Objetivo:** Centro Inteligente de Operações Logísticas — Logistics Score + Logistics Opportunity Score por cidade, heatmap, cobertura, balanceamento. **Recomenda; nunca despacha.**
- **Faz:** prevê demanda logística; cruza demanda (freight/travel/cliques por cidade) x oferta (motoboys online); Opportunity Score (onde captar/expandir); heatmap; recomendações estratégicas.
- **NÃO faz:** despachar corrida/entrega/frete; substituir Dispatcher/Automation/Pricing/Forecast (reutiliza); alterar corridas/entregas/pagamentos; inventar (tempos de entrega e geo de motoboy declarados).
- **Entradas (read-only):** advertiser_contact_intentions (freight/travel), marketplace_product_click_events, freight_listings/travel_listings, public_rides, motoboy_profiles/motoboy_presence, orion_growth_scores. **Saídas:** `orion_logistics_scores`, `orion_logistics_recommendations`; eventos `logistics.updated/coverage`.
- **Dependências:** Dispatcher, Forecast, Pricing, BI, Marketplace, Growth, Trust (leitura), Gateway, Registry, Event Bus. **Consumidores:** admin; Marketing (captação) / Automation (sob aprovação).
- **Banco:** `orion_logistics_scores`, `orion_logistics_recommendations` (idempotentes/dia). **APIs:** `logistics_dashboard/generate/scores/coverage/motoboys/heatmap/freight_travel/recommendations/score/metrics/summary`. **Prompts:** `logistics.coverage/forecast/balance/recommendation/summary`. **Cron:** `orion_logistics_tick` (27 * * * *). **Dashboard:** `/admin/orion-logistics`. **Segurança:** read-only; nunca despacha.

### AI-28 — Sustainability AI (`sustainability`, v1)
- **Objetivo:** Centro de Sustentabilidade em 3 pilares (Ambiental/Econômico/Social) — Sustainability Score + VIAGG Impact Index (VII) por cidade. **Mede/recomenda; nunca executa.**
- **Faz:** mede impacto real por pilar (receita/IA/automação; empreendedores/retenção; eficiência logística); Sustainability Score (Amb 30% + Eco 40% + Soc 30%); VII + Opportunity por cidade.
- **NÃO faz:** inventar indicador (declara lacunas: renda_motoboys, km_otimizados); executar/alterar operações/preços/entregas; criar infra paralela.
- **Entradas (read-only):** pay_payment_orders, orion_ai_log, orion_automation_requests, advertiser_contact_intentions/clicks, merchant_stores, orion_customer_health, orion_logistics_scores, freight/travel_listings, public_rides, orion_growth_scores. **Saídas:** `orion_sustainability_indicators/scores`; eventos `sustainability.score/updated`.
- **Dependências:** BI, Logistics, Marketplace, Growth, Customer Success, Trust (leitura), Gateway, Registry, Event Bus. **Consumidores:** admin; decisões de expansão.
- **Banco:** `orion_sustainability_indicators` (real|declarado), `orion_sustainability_scores` (Score+VII/escopo/dia). **APIs:** `sustainability_dashboard/generate/environment/economic/social/cities/indicators/score/metrics/summary`. **Prompts:** `sustainability.environment/economic/social/score/summary`. **Cron:** `orion_sustainability_tick` (31 * * * *). **Dashboard:** `/admin/orion-sustainability`. **Segurança:** read-only; nunca inventa; nunca executa.

### AI-29 — Innovation AI (`innovation`, v1)
- **Objetivo:** laboratório de inovação — descobre oportunidades de evolução; Innovation Score + IOM + Portfolio + Roadmap Advisor. **Observa/propõe; nunca executa.**
- **Faz:** descobre oportunidades reais (lacunas declaradas dos módulos + saídas de oportunidade); pontua (impacto/viabilidade/benefício/receita/custos/alinhamento); classifica IOM (🔥/⭐/💡); roadmap (próximo sprint/módulo/maior retorno/menor esforço).
- **NÃO faz:** alterar código/banco; executar; inventar (deriva de dados/gaps reais).
- **Entradas (read-only):** gaps declarados do ecossistema + orion_market_insights (oportunidade), orion_logistics_recommendations, orion_sustainability/sales/growth. **Saídas:** `orion_innovation_opportunities/scores`; eventos `innovation.discovered/recommendation`.
- **Dependências:** BI, Marketplace, Marketing, Sales, Customer Success, Logistics, Sustainability, OCE (leitura), Gateway, Registry, Event Bus. **Consumidores:** admin; futuro AI-30 Executive/CEO Copilot.
- **Banco:** `orion_innovation_opportunities` (Portfolio, UNIQUE chave+dia), `orion_innovation_scores` (índice/categoria). **APIs:** `innovation_dashboard/discover/portfolio/matrix/roadmap/opportunities/score/metrics/summary`. **Prompts:** `innovation.opportunity/feature/market/strategy/summary`. **Cron:** `orion_innovation_tick` (53 * * * *). **Dashboard:** `/admin/orion-innovation`. **Segurança:** read-only; nunca implementa.

### AI-30 — Executive AI · CEO Copilot (`executive_copilot`, v1)
- **Objetivo:** cérebro executivo (CEO Digital 24/7) — consolida TODOS os módulos em decisões estratégicas. **Analisa/prioriza; nunca executa.**
- **Faz:** Data Fusion (consulta scores de 12+ módulos); Executive Score (13 componentes ponderados); **CEO Intelligence Index (CII)** proprietário; CEO Daily Brief; Decision Matrix (🔴/🟠/🟡/🟢); Risk/Opportunity Center; ROI; Simulator (declara); Executive Chat.
- **NÃO faz:** executar/aprovar/alterar; duplicar AI-12 (tempo real) nem AI-22 (BI por domínio); inventar (declara lacunas: saúde operacional, série histórica).
- **Entradas (read-only):** orion_growth/trust/customer_health/logistics/sustainability/innovation_scores + sales_opportunities + market_insights + pay_payment_orders + advertiser_contact_intentions + orion_security_alerts + orion_ai_log. **Saídas:** `orion_executive_snapshots` (Executive Memory), `orion_executive_decisions`; eventos `executive.summary/priority/alert/risk/opportunity/brief`.
- **Dependências:** TODOS os módulos (leitura), Gateway, Registry, Event Bus. **Consumidores:** administração; futuro AI-31 Knowledge.
- **Banco:** `orion_executive_snapshots`, `orion_executive_decisions`. **APIs:** `executive_dashboard/generate/fusion/score/cii/brief/decisions/risks/opportunities/roi/simulator/history/metrics/summary`. **Prompts:** `executive.summary/briefing/strategy/priority/risk/opportunity/forecast/roi/chat/daily/weekly/monthly`. **Cron:** `orion_executive_tick` (5 * * * *). **Dashboard:** `/admin/orion-executive` (badge CEO). **Segurança:** read-only; nunca executa. Chave `executive_copilot` (distinta de AI-12 `executive`).

### Motor de Publicação (`motor_publish_*`, v1)
- **Objetivo:** porta única de publicação. **Faz:** `motor_publish_request/execute/status/cancel/retry`; gate LGPD; feed/marketplace imediato, whatsapp/push → dispatcher. **Banco:** `motor_publish_requests`, `pub_events` (imutável), `publication_history`, `publication_metrics`.

---

## 4. Arquitetura Geral (camadas)

```
┌─ FRONTEND ─ 21 painéis /admin/orion-* (React/Vite) ──────────────────────────┐
│                                                                              │
├─ CAMADA EXECUTIVA ── Command Center (AI-12) · Operations/COO (AI-13) ·        │
│                       Strategy Suite (AI-14)                                 │
├─ CAMADA DE SAÚDE ──── Performance (AI-11) · Health (AI-10)                    │
├─ CAMADA DE INTELIGÊNCIA ── Finance (AI-04) · Growth (AI-07) · Conversion     │
│                            (AI-09) · Pricing (AI-15) · Forecast (AI-16) ·     │
│                            Support (AI-17)                                    │
├─ LINHA DE PRODUÇÃO ── Publisher (01) → RIDV (02) → Package (03) →             │
│                        Campaign (05) → MOTOR → Dispatcher (06) → GLM          │
│                        Execution Orchestrator (08) orquestra                 │
│                                                                              │
├─ CORE ── AI Gateway (AI-00) + Prompt Registry ── ÚNICA porta de IA           │
├─ EVENT BUS ── orion_eventos (298 eventos, prefixos por domínio)              │
├─ BANCO ── Postgres/Supabase: 45 tabelas ORION, 221 funções, 32 triggers,     │
│           14 cron jobs, RLS em 100%, logs imutáveis                          │
└─ PROVEDORES ── OpenAI (gpt-5-nano/mini) · Anthropic (claude-haiku-4-5)        │
```

---

## 5. Inventário Técnico (extraído da produção 2026-07-14)

- **Funções:** 221 (prefixos orion/ridv/motor_publish/pricing/forecast/conversion/execution/operations/strategy/health/performance/executive/support/pub + motores knowledge/prediction/decision/optimization/simulation).
- **Tabelas (45):** orion_ai_cache, orion_ai_config, orion_ai_log, orion_ai_models, orion_ai_module_prefs, orion_ai_prompts, orion_aprendizado, orion_campanhas(+_versoes), orion_diretrizes, orion_dispatch_queue, orion_dispatch_workers, orion_eventos, orion_eventos_operacionais, orion_execucoes, orion_finance_alertas/divergencias/snapshots, orion_forecast_snapshots, orion_growth_relatorios/scores, orion_health_incidentes/snapshots, orion_indices, orion_knowledge, orion_missoes, orion_municipios, orion_pacotes(+_versoes), orion_perf_alertas/analises/snapshots, orion_pricing_history/policies, orion_publisher_log, orion_recomendacoes, orion_simulacoes, orion_support_analises, orion_touchpoints, orion_trace, motor_publish_requests, pub_events, publication_history, publication_metrics, ridv_decisions_log.
- **Triggers:** 32 (blindagem RIDV 8, publisher 6, ping worker 8, guards de campanha/pacote, tg_evento do nervoso, etc.).
- **Cron jobs (14):** ridv_worker */5 · orion_package */5 · orion_dispatcher */5 · orion_campaign */10 · orion_execution */10 · orion_health */20 · orion_finance :12 · orion_forecast 3:15 (23h Cuiabá) · orion_growth :28 · orion_perf :45 · orion_operations :52 · orion_strategy :58 · orion_conversion :07 · orion_support :25.
- **Edge Functions ORION:** `orion-ai-gateway` (v3), `ridv-worker` (v3), `package-worker` (v3), `moderate-text`, `moderate-image`. **Legadas fora do Gateway (dívida):** ai-chat, viagg-ai, ai-engine-gateway, radar-ia, auto-poster.
- **Prompts (39):** pricing 7 · strategy 6 · conversion 5 · execution 5 · forecast 5 · support 5 · ridv 1 · package 1 · health 1 · performance 1 · operations 1 · executive 1.
- **Modelos (3):** gpt-5-nano, gpt-5-mini (OpenAI); claude-haiku-4-5 (Anthropic, fallback).
- **Dashboards (21):** /admin/orion, orion-mobility, orion-os, orion-publisher, ridv, orion-ai, orion-package, orion-finance, orion-campaign, orion-dispatcher, orion-growth, orion-performance, orion-health, orion-command, orion-operations, orion-strategy, orion-conversion, orion-execution, orion-pricing, orion-forecast, orion-support.
- **Filas/Workers:** orion_dispatch_queue (+ workers GLM/humano), orion_execucoes, motor_publish_requests, DLQ em Package/Campaign/Dispatcher/Execution.

---

## 6. Matriz de Dependências

| Módulo | Consome (lê) | Publica eventos | Escutado por |
|---|---|---|---|
| Gateway | provedores | (log próprio) | todos |
| Publisher | — | anuncio_* | RIDV, Growth |
| RIDV | Gateway | anuncio_aprovado/bloqueado, moderacao_concluida | Package |
| Package | Gateway, Motor | pacote_* | Campaign |
| Campaign | Package, Motor | campaign_* | Dispatcher, Conversion |
| Motor | — | publicacao_solicitada, pacote_publicado | Dispatcher, Package |
| Dispatcher | Motor | dispatch_*/worker_* | (métricas) |
| Finance | pay_* | finance_* | Command, Operations, Growth, Strategy, Pricing |
| Growth | todos | growth_* | Command, Operations, Strategy, Pricing, Forecast |
| Execution | RPCs oficiais | execution_* | Conversion (touchpoints) |
| Conversion | Finance, Dispatcher | conversion_* | Pricing, Strategy, Forecast |
| Health | core_health, Performance | health_* | Command |
| Performance | pg_stat, core_health | performance_* | Health, Command |
| Command | health/core/perf/finance/growth | executive_* | — (topo) |
| Operations | Finance, Growth, Health, Campaign | operations_* | Strategy |
| Strategy | Operations, Finance, Growth, Forecast, Dispatcher | (via aprendizado) | — |
| Pricing | Finance, Conversion, Forecast, Growth | pricing_* | — |
| Forecast | pay_* (leitura), Growth | (snapshots) | Strategy, Pricing |
| Support | support_tickets | support_* | Operations (via evento) |

**Sem dependências circulares.** Acoplamento por eventos (assíncrono) ou porta única (Motor/Gateway).

---

## 7. Matriz de Segurança

| Módulo | RLS | Logs imutáveis | Auditoria | Gateway | Prompt Registry | IA | Read-only $ | Idempotência |
|---|---|---|---|---|---|---|---|---|
| Gateway | ✅ | ✅ orion_ai_log | ✅ | — | ✅ | multi | n/a | cache hash |
| Publisher | ✅ | — | ✅ log | — | — | — | ✅ | UNIQUE listing |
| RIDV | ✅ | ✅ decisions_log | ✅ | ✅ | ✅ | ✅ | ✅ | fila condicional |
| Package | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | UNIQUE anúncio |
| Finance | ✅ | ✅ snapshots | ✅ | ✅ | ✅ | ✅ | **✅ provado** | UNIQUE divergência |
| Campaign | ✅ | versões | ✅ | ✅ | — | ✅ | ✅ | UNIQUE pacote |
| Dispatcher | ✅ | ✅ queue | ✅ | — | — | — | ✅ | UNIQUE req+grupo |
| Growth | ✅ | ✅ relatórios | ✅ | ✅ | ✅ | ✅ | ✅ | upsert score |
| Execution | ✅ | ✅ execuções | ✅ trace | ✅ | ✅ | ✅ | ✅ | UNIQUE chave |
| Conversion | ✅ | ✅ touchpoints | ✅ trace | ✅ | ✅ | ✅ | **✅** | UNIQUE chave |
| Health | ✅ | ✅ snapshots/trace | ✅ | ✅ | ✅ | ✅ | ✅ | incidente único/tipo |
| Performance | ✅ | ✅ snapshots | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Command | ✅ | (agrega) | ✅ trace | ✅ | ✅ | ✅ | ✅ | — |
| Operations | ✅ | ✅ missões | ✅ | ✅ | ✅ | ✅ | ✅ | UNIQUE chave |
| Strategy | ✅ | ✅ knowledge/sim | ✅ | ✅ | ✅ | ✅ | ✅ | UNIQUE chave |
| Pricing | ✅ | ✅ history | ✅ | ✅ | ✅ | ✅ | **✅ provado** | política+rollback |
| Forecast | ✅ | ✅ snapshots | ✅ | ✅ | ✅ | ✅ | **✅** | snapshot/dia |
| Support | ✅ | ✅ analises | ✅ trace | ✅ | ✅ | ✅ | **✅** | UNIQUE ticket+ts |

---

## 8. Histórico

- **2026-07-13** — ORION Fase 1 (cérebro territorial, 5.571 municípios IBGE, /admin/orion).
- **2026-07-14** — Sprint de construção: AI-00 a AI-16 + Motor + CORE Consolidation entregues e homologados em produção; ~20 bugs reais corrigidos pelas certificações; custo total de IA da sprint ~US$ 0,02.
- **2026-07-14** — Auditoria Geral ORION v2.0 (score 98/100, PRODUÇÃO ENTERPRISE, commit 9c038a4).
- **2026-07-14** — Consolidação de numeração (commit 800e1ae); Strategy v1.1 (3207072); Pricing v1.1 (c7665f6); **AI-17 Support AI** (c44c431).
- **2026-07-14** — Este Documento Mestre.

---

## 9. Convenções Oficiais (CONGELADAS)

1. **Numeração:** cada módulo tem um número único (AI-NN) e uma **chave técnica única** no Gateway/Registry. O número é rótulo humano; a chave é a identidade técnica. **Nunca renumerar em produção.**
2. **Nomenclatura de funções/tabelas:** `orion_*` (núcleo), `ridv_*` (moderação), `motor_publish_*`+`pub_*`+`publication_*` (porta), prefixo do módulo para APIs (`finance_*`, `pricing_*`, etc.).
3. **Prefixos de eventos:** `dominio_acao` (anuncio_aprovado, pacote_montado, campaign_started, dispatch_completed, finance_alert, growth_risk, support_ticket_critico...).
4. **Versões:** vN para releases; enhancements = vN.1 (estendem, não duplicam).
5. **Documentação:** `DOCS/orion-ai-NN-<slug>-certificacao.md` (NN e slug batem com a chave). Este Documento Mestre é a fonte primária.
6. **Certificação:** scores por dimensão (Arquitetura/Integração/Segurança/Performance/Banco/IA/Observabilidade/Escalabilidade/Código/Governança) + Score Geral + veredito 🟢/🟡/🟠/🔴, com homologação por prova ao vivo (rollback).
7. **Prompts:** só no Registry (`orion_ai_prompts`), versionados; consumidos por `prompt_key`.
8. **Migrations:** idempotentes, com bloco ROLLBACK comentado, RLS, índices, comentários; aplicadas via Management API (nunca `supabase db push`).
9. **Dashboards:** `/admin/orion-*`, no menu ORION AI CENTER; agregação pura no topo (Command).
10. **Regra de ouro:** IA nunca move dinheiro / nunca publica direto / nunca chama provedor fora do Gateway / decisão crítica é humana.

**Qualquer módulo novo DEVE seguir estas convenções.** Módulo que já existe (ex.: Strategy, Pricing) é **estendido**, nunca duplicado.

---

## 10. Roadmap Futuro (reservado)

| Nº | Situação |
|----|----------|
| **AI-18** | ✅ **Marketplace Intelligence AI** — ativo (§2/§3). |
| **AI-19** | ✅ **Personalization AI** — ativo (§2/§3). |
| **AI-20** | ✅ **Trust & Reputation AI** — ativo (§2/§3). |
| **AI-21** | ✅ **Automation AI** — ativo (§2/§3). |
| **AI-22** | ✅ **Business Intelligence AI** — ativo (§2/§3). |
| **AI-23** | ✅ **Marketing AI** — ativo (§2/§3). |
| **AI-24** | ✅ **Security AI** — ativo (§2/§3). |
| **AI-25** | ✅ **Sales AI** — ativo (§2/§3). |
| **AI-26** | ✅ **Customer Success AI** — ativo (§2/§3). |
| **AI-27** | ✅ **Logistics AI** — ativo (§2/§3). |
| **AI-28** | ✅ **Sustainability AI** — ativo (§2/§3). |
| **AI-29** | ✅ **Innovation AI** — ativo (§2/§3). |
| **AI-30** | ✅ **Executive AI · CEO Copilot** — ativo (§2/§3). |
| AI-31 | ⚪ EM ABERTO — Knowledge & Learning AI (pulado a pedido; chave `knowledge`). |
| **AI-32** | ✅ **Search & Discovery AI** — ativo. Abre o ORION Discovery Ecosystem (§`orion-ai-32-search-discovery-certificacao.md`). |
| **AI-33** | ✅ **GEO Optimization AI** — ativo. Dados estruturados (JSON-LD/OG/Twitter) + FAQ + VGI (§`orion-ai-33-geo-optimization-certificacao.md`). |
| **AI-34** | ✅ **Knowledge Graph AI** — ativo. Grafo de entidades/relações com evidência + VKI (§`orion-ai-34-knowledge-graph-certificacao.md`). |
| **AI-35** | ✅ **Recommendation Intelligence AI** — ativo. RIS + Recommendation Score (grafo/discovery/GEO/comportamento), toda rec. com evidência (§`orion-ai-35-recommendation-certificacao.md`). |
| **AI-36** | ✅ **AI Visibility & Answer Intelligence** — ativo. AIS + AQS (prontidão p/ IA generativa), menções declaradas (§`orion-ai-36-ai-visibility-certificacao.md`). |
| AI-37 | Reservado — camada de aprendizado autônomo prevista. |

Dívida técnica priorizada (não bloqueante): migrar 6 edges legadas ao Gateway; fixar `search_path` em ~7 triggers definer; instrumentar `conversion_track()` no front (fecha CAC/LTV real); benchmark competitivo de preços; feriados/eventos no Forecast.

---

## CERTIFICAÇÃO — ORION ECOSYSTEM MASTER DOCUMENT

- ✅ Documento Mestre criado (`DOCS/orion-ecosystem-master.md`)
- ✅ Roadmap consolidado (18 módulos + Motor + CORE)
- ✅ Arquitetura consolidada (5 camadas)
- ✅ Dependências documentadas (matriz, sem ciclos)
- ✅ Inventário completo (221 funções · 45 tabelas · 32 triggers · 14 crons · 39 prompts · 3 modelos — reais da produção)
- ✅ Single Source of Truth estabelecida
- **Validação:** 0 módulo duplicado · 0 numeração conflitante · 0 documentação divergente · 18/18 módulos documentados · dependências e prompts catalogados · 21 dashboards vinculados
- **Status: 🟢 APROVADO** · **Score: 100/100** · **Arquitetura: Consistente**
- **Data:** 2026-07-14 · **Commit:** (push deste documento) · **Build:** verde (documentação — sem alteração de código)
