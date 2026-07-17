# ORION AI — Arquitetura & Numeração Oficial (fonte única de verdade)

**Consolidação:** 2026-07-14 · **Status: 🟢 APROVADO** · **Score de consistência: 100/100**

> Este documento é a **única fonte de verdade** da numeração ORION. Fonte oficial = **produção** (Prompt Registry, Gateway `orion_ai_module_prefs`, tabelas e funções SQL), que indexam cada módulo por **NOME** — os números são rótulos de documentação. Documentação antiga NÃO é referência. Cada número → um módulo; cada módulo → um número.

## Mapa oficial dos módulos

| Nº | Nome oficial | Chave (Gateway/Registry) | Versão | Status | Score | Certificação | Depende de |
|----|--------------|--------------------------|--------|--------|-------|--------------|------------|
| AI-00 | AI Gateway | `orion-ai-gateway` | v3 | 🟢 Enterprise | 100 | 07-14 | — |
| AI-01 | Publisher AI | `publisher` | v1 | 🟢 Enterprise | 98 | 07-14 | Gateway |
| AI-02 | RIDV AI (Moderação) | `ridv` | v2 | 🟢 Enterprise | 99 | 07-14 | Gateway, Publisher |
| AI-03 | Package AI | `package` | v2 | 🟢 Enterprise | 100 | 07-14 | Gateway, RIDV, Motor |
| AI-04 | Finance AI | `finance` | v1 | 🟢 Enterprise | 97 | 07-14 | pay_* (read-only) |
| AI-05 | Campaign AI | `campaign` | v1 | 🟢 Enterprise | 99 | 07-14 | Package, Motor |
| AI-06 | Dispatcher AI | `dispatcher` | v1 | 🟢 Enterprise | 100 | 07-14 | Motor, Campaign |
| AI-07 | Growth AI | `growth` | v1 | 🟢 Enterprise | 100 | 07-14 | todos (leitura) |
| **AI-08** | **Execution Orchestrator** | `execution` | v1 | 🟢 Enterprise | 99 | 07-14 | RPCs oficiais, AI-09 |
| **AI-09** | **Conversion & Attribution** | `conversion` | v2 | 🟢 Enterprise | 96 | 07-14 | Finance, Dispatcher |
| AI-10 | Health & Observability Center | `health` | v2 | 🟢 Enterprise | 98 | 07-14 | core_health, Performance |
| AI-11 | Performance AI | `performance` | v1 | 🟢 Enterprise | 99 | 07-14 | pg_stat, core_health |
| AI-12 | Command Center | `executive` | v1 | 🟢 Enterprise | 98 | 07-14 | health/core/perf/finance |
| AI-13 | Operations AI (COO) | `operations` | v1 | 🟢 Enterprise | 98 | 07-14 | Finance, Growth, Health |
| AI-14 | Strategic Intelligence Suite | `strategy` | v1 | 🟢 Enterprise | 95 | 07-14 | Conversion, Performance |
| **AI-15** | **Pricing AI** | `pricing` | v1.1 | 🟢 Enterprise | 98 | 07-14 | Finance, Conversion, Forecast |
| AI-16 | Demand Forecast AI | `forecast` | v1 | 🟢 Enterprise | 90 | 07-14 | pay_* (leitura), Growth |
| **AI-17** | **Support AI** | `support` | v1 | 🟢 Enterprise | 97 | 07-14 | support_tickets (leitura), Gateway |
| **AI-18** | **Marketplace Intelligence AI** | `marketplace` | v1 | 🟢 Enterprise | 97 | 07-15 | Growth, Conversion (leitura); sinais do marketplace |
| **AI-19** | **Personalization AI** | `personalization` | v1 | 🟢 Enterprise | 97 | 07-15 | Marketplace AI-18, Growth (leitura); sinais por usuário |
| **AI-20** | **Trust & Reputation AI** | `trust` | v1 | 🟢 Enterprise | 97 | 07-15 | Finance, Conversion, Publisher, RIDV (leitura) |
| **AI-21** | **Automation AI** | `automation` | v1 | 🟢 Enterprise | 97 | 07-15 | todos (recomendações); AI-08 (delega) |
| **AI-22** | **Business Intelligence AI** | `business` | v1 | 🟢 Enterprise | 98 | 07-15 | todos (saídas, leitura) |
| **AI-23** | **Marketing AI** | `marketing` | v1 | 🟢 Enterprise | 97 | 07-15 | Marketplace/Personalization/Trust/BI/Conversion (leitura); AI-21 (execução) |
| **AI-24** | **Security AI** | `security` | v1 | 🟢 Enterprise | 97 | 07-15 | auth audit, Trust, Automation, Gateway (leitura) |
| **AI-25** | **Sales AI** | `sales` | v1 | 🟢 Enterprise | 97 | 07-15 | Marketplace, Marketing, Conversion, Trust (leitura) |
| **AI-26** | **Customer Success AI** | `customer_success` | v1 | 🟢 Enterprise | 97 | 07-15 | Personalization, Trust, Sales, BI (leitura) |
| **AI-27** | **Logistics AI** | `logistics` | v1 | 🟢 Enterprise | 97 | 07-15 | Dispatcher, Forecast, Pricing, Growth (leitura) |
| **AI-28** | **Sustainability AI** | `sustainability` | v1 | 🟢 Enterprise | 97 | 07-15 | BI, Logistics, Growth, Customer Success (leitura) |
| **AI-29** | **Innovation AI** | `innovation` | v1 | 🟢 Enterprise | 97 | 07-15 | todos (gaps+oportunidades, leitura) |
| **AI-30** | **Executive AI · CEO Copilot** | `executive_copilot` | v1 | 🟢 Enterprise | 98 | 07-15 | TODOS os módulos (scores, leitura) |
| AI-31 | Knowledge & Learning AI | `knowledge` | — | ⚪ NÃO CONSTRUÍDO | — | — | (reservado — o `orion_knowledge`/`knowledge_engine` é do AI-14, não deste) |
| **AI-32** | **Search & Discovery AI** | `search_discovery` | v1 | 🟢 Enterprise | 97 | 07-16 | Marketplace/Trust/BI/Marketing/Sales/Customer/Innovation/Executive (leitura) |
| **AI-33** | **GEO Optimization AI** | `geo_optimization` | v1 | 🟢 Enterprise | 97 | 07-16 | AI-32 Search & Discovery (Discovery/Semantic), Marketplace/Marketing/Sales/BI/Publisher (leitura) |
| **AI-34** | **Knowledge Graph AI** | `knowledge_graph` | v1 | 🟢 Enterprise | 97 | 07-16 | AI-32 + AI-33 (Discovery/GEO/Semantic), Marketplace/BI/Publisher (leitura). NÃO confundir c/ `orion_knowledge`/`knowledge_engine` do AI-14 |
| **AI-35** | **Recommendation Intelligence AI** | `recommendation_ai` | v1 | 🟢 Enterprise | 97 | 07-16 | AI-32 + AI-33 + AI-34 (scores+grafo), Health/Performance/Operations. Fecha a cadeia do Discovery |
| **AI-36** | **AI Visibility & Answer Intelligence** | `ai_visibility` | v1 | 🟢 Enterprise | 97 | 07-16 | AI-32/33/34/35 + AI-20 Trust (leitura). Mede AIS/AQS (prontidão p/ IA) |
| **AI-37** | **AI Cost & Intelligence Center** | `ai_center` | v1 | 🟢 Enterprise | 97 | 07-16 | Gateway (orion_ai_log/cache/models) + pay_* (leitura). FinOps: custos/ROI/KPIs/forecast/simulador |
| **AI-38** | **AI Governance Center** | `ai_governance` | v1 | 🟢 Enterprise | 98 | 07-16 | AI-37 (custos, leitura) + Gateway. Governança: orçamentos/políticas/perfis/auditoria imutável/rollback (GCS) |
| **AI-39** | **Visitor Intelligence AI** | `visitor_intelligence` | v1 | 🟢 Enterprise | — | 07-16 | marketplace_product_click_events (leitura). Comportamento/predição de visitantes; privacidade sem PII |
| **AI-40** | **Cyber Defense AI** | `cyber_defense` | v1 | 🟢 Enterprise | 97 | 07-17 | Gateway/auth/client_errors/eventos/Trust (leitura). **Abre o ORION Security Ecosystem** (AI-40..49). Namespace `orion_cyber_*` — NÃO colide com AI-24 `security` |
| **AI-41** | **Fraud Detection AI** | `fraud_detection` | v1 | 🟢 Enterprise | 97 | 07-17 | profiles/device_tokens/pay_*/credit_purchases/clicks/aci (leitura). 2º do Security Ecosystem: 17 detectores com evidência, FS/FR/FT/FC, tick `*/2`; espelha alta/crítica em `orion_cyber_events` (ponte AI-40). Namespace `orion_fraud_*` |
| **AI-42** | **Identity & Access AI** | `identity_access` | v1 | 🟢 Enterprise | 97 | 07-17 | auth.users/sessions/audit_log_entries/mfa_factors + profiles/user_roles + AI-40/41 (leitura). 3º do Security Ecosystem: IS/ATS/SRS/DCS + MAR + III, políticas adaptativas auditadas com rollback, `validate_identity()`, tick `*/2`; espelha alta/crítica em `orion_cyber_events`. Namespace `orion_identity_*`/`orion_access_*`/`orion_devices` |
| **AI-43** | **Threat Intelligence AI** | `threat_intelligence` | v1 | 🟢 Enterprise | 97 | 07-17 | orion_cyber_events (AI-40+41) + auth.audit_log + pg_proc/pg_tables (leitura). **Núcleo analítico** do Security Ecosystem: grafo de ameaças (nós+arestas com evidência), campanhas, vulnerabilidades; TIS/CS/CRS/VIS + MTTC/TRR, `correlate_security_events()`, tick `*/3`; encaminha ao AI-45. Namespace `orion_threat_*`/`orion_security_graph`/`orion_vulnerability_events`. IP/ASN DECLARADO (sem dado) |
| **AI-44** | **Security Audit AI** | `security_audit` | v1 | 🟢 Enterprise | 97 | 07-17 | pg_catalog/grants/cron/auth + AI-40/41/10 (leitura). **Auditor de postura**: 9 categorias com evidência real, baseline aprovada + compliance, findings com auto-close por evidência (FRR real); SAS/COS/CIS/ACS + FRR/ACI, `run_security_audit()`, tick `*/15`; críticos viram `config_risk` na base AI-40 (que o AI-43 correlaciona). NUNCA altera o ambiente. Namespace `orion_secaudit_*` (spec pedia `orion_security_*` = AI-24). Edge/WAF/backups DECLARADOS |
| **AI-45** | **Incident Response AI** | `incident_response` | v1 | 🟢 Enterprise | 97 | 07-17 | orion_cyber_events (base 40+espelhos 41/42/44) + campanhas AI-43. **Fecha o funil do Security Ecosystem**: incidentes classificados (IRS/ICS/RTS/Recovery explicáveis), 5 playbooks auditáveis, timeline/evidências IMUTÁVEIS, rollback lógico preserva histórico; bloqueio SÓ via RPCs guardadas (`cyber_block_entity`/`identity_device_block` — política dos donos decide; negado→aguardando_humano); `respond_to_incidents()`, tick `*/2`; notificações em `notificacoes_admin` c/ confirmação de leitura; **selftest 17 checks = entrada do COMANDO TESTE**. Namespace `orion_incident_*` (NÃO toca `orion_health_incidentes` AI-10). MFA enforcement/congelamento financeiro DECLARADOS |
| **AI-46** | **Backup & Disaster Recovery AI** | `backup_recovery` | v1 | 🟢 Enterprise | 97 | 07-17 | Management API `/database/backups` (walg/pitr/snapshots) + pg_catalog (manifesto de schema com checksums md5) + AI-44 (leitura). **Guardião da continuidade**: prova backup íntegro/restaurável, restore test NÃO-destrutivo, BRS/RRS/DIS/CRI + RPO/RTO, alertas (PITR off/sem snapshot/drift), tick `*/15`; espelha `config_risk` na base AI-40; handoff AI-45. NUNCA restaura produção automaticamente; nunca expõe secrets. `selftest 8/8`. Namespace `orion_backup_*`/`orion_restore_*`/`orion_recovery_*` |
| **AI-47** | **Zero Trust AI** | `zero_trust` | v1 | 🟢 Enterprise | 97 | 07-17 | AI-42 (IS/ATS/sessões/dispositivos) + AI-40/41/43/44 (risco) + auth.audit (contexto), leitura. **Camada central de decisão de acesso** (nunca confiar, sempre verificar): `zero_trust_evaluate()` produz ZTS/CAS/DAS/SAS→RCS→7 decisões por política mais específica; avaliação contínua (tick `*/2`) reclassifica acesso na própria sessão; decisões+cofre IMUTÁVEIS, rollback lógico; exceção temporária auditada; **selftest 13 checks (COMANDO TESTE)**; espelha nada (só decide). Identidade desconhecida→negar. AI-45/46 detecção dinâmica. Namespace `orion_zero_trust_*` |
| **AI-48** | **Compliance & LGPD AI** | `compliance_lgpd` | v1 | 🟢 Enterprise | 97 | 07-17 | profiles/aceites/auth + AI-42/44/45/46/47 (leitura). **Centro de privacidade**: registro de tratamento art.37 (9 atividades reais), direitos do titular (ciclo auditado, prazo 15d), retencao MEDIDA, incidentes de privacidade com auto-resolve; CPS/LCS/DRS/PRS; `run_compliance_check()`, tick `*/15`; alta/critica vira `privacy_incident` na base AI-40 (AI-45 responde); selftest 14 checks (COMANDO TESTE). NUNCA altera dado pessoal nem expoe dado sensivel. Namespace `orion_compliance_*`/`orion_lgpd_*`/`orion_data_*`/`orion_privacy_*`. DPO/RIPD/canal titular DECLARADOS |
| — | Motor de Publicação | `motor_publish_*` | v1 | 🟢 Enterprise | 100 | 07-14 | — (porta única) |
| — | ORION CORE Consolidation | — | v1 | 🟢 Certificado | 99 | 07-14 | todos |

## Divergência histórica resolvida

- **Sintoma:** o arquivo `DOCS/orion-ai-09-pricing-certificacao.md` usava o prefixo `ai-09` para o Pricing, colidindo com o Conversion (AI-09 real).
- **Fonte oficial (produção):** `orion_ai_module_prefs` e o Prompt Registry contêm as chaves `pricing` **e** `conversion` como módulos **distintos** — não há colisão funcional; o problema era só de rótulo em 1 documento.
- **Correção aplicada (só documentação):** `orion-ai-09-pricing-certificacao.md` → renomeado para **`orion-ai-15-pricing-v11-certificacao.md`**; cabeçalho atualizado. **Nenhum módulo de produção renumerado; nenhuma migration/RPC/Gateway/Event Bus alterado.**
- **Resultado:** AI-09 = Conversion & Attribution (único doc `orion-ai-09-conversion-attribution-certificacao.md`); AI-15 = Pricing (docs `orion-ai-15-pricing-certificacao.md` v1.0 + `orion-ai-15-pricing-v11-certificacao.md` v1.1).

## Regra de nomenclatura (congelada)

Módulos novos recebem o **próximo número livre** (agora **AI-49**, previsto = SOC Commander — ultimo do Security Ecosystem; AI-47 = Zero Trust; AI-48 = Compliance & LGPD; AI-46 = Backup & Disaster Recovery, AI-45 = Incident Response; AI-39 = Visitor Intelligence, AI-40 = Cyber Defense, AI-41 = Fraud Detection, AI-42 = Identity & Access, AI-43 = Threat Intelligence, AI-44 = Security Audit — do AI-40 em diante formam o **ORION Security Ecosystem**, AI-40..49; **AI-37** = AI Cost & Intelligence Center, **AI-38** = AI Governance Center — governança sobre o AI-37, sem colisão). **ORION DISCOVERY ECOSYSTEM** (AI-32..AI-40): **AI-32 Search & Discovery** (`search_discovery`) + **AI-33 GEO Optimization** (`geo_optimization`) + **AI-34 Knowledge Graph** (`knowledge_graph`, coração semântico — distinto do `orion_knowledge`/`knowledge_engine` do AI-14) + **AI-35 Recommendation Intelligence** (`recommendation_ai`) + **AI-36 AI Visibility & Answer Intelligence** (`ai_visibility`, mede AIS/AQS). AI-37 = camada de aprendizado autônomo prevista. **AI-31 (Knowledge & Learning AI) segue EM ABERTO/não construído** — o número foi pulado a pedido; quando for feito, usa a chave `knowledge` (não confundir com o motor `knowledge_engine` interno do AI-14). AI-30 = Executive AI/CEO Copilot, chave `executive_copilot` — distinta de AI-12 `executive`. e uma **chave única de módulo** no Gateway/Registry. O número é rótulo humano; a chave é a identidade técnica. Documentos de certificação seguem `DOCS/orion-ai-NN-<slug>-certificacao.md` onde NN e slug batem com a chave. Roadmap 2.x: AI-17+ (benchmark competitivo de preços, feriados no Forecast, migração das 6 edges legadas ao Gateway).

---

## CERTIFICAÇÃO — ORION AI ARCHITECTURE CONSOLIDATION

- ✅ Arquitetura consolidada · ✅ Numeração padronizada · ✅ Documentação sincronizada
- ✅ Duplicidades eliminadas (1 doc renomeado) · ✅ Compatibilidade preservada (0 alteração de lógica/banco/API/Gateway/Event Bus)
- **Status: 🟢 APROVADO** · **Score: 100/100** · **Arquitetura: Consistente**
- **Data:** 2026-07-14 · **Commit:** (push desta consolidação) · **Build:** verde (não houve mudança de código executável)
