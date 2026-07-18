# ORION-AUDIT v1.0 — Auditoria Geral do Ecossistema (AI-00 → AI-74)

**Data:** 2026-07-18 · **Tipo:** auditoria técnica/arquitetural/funcional/operacional · **Método:** READ-ONLY sobre banco de produção (`broifhfqmnzqoongtokm`) + repositório. **Todos os números abaixo são reais** (consultas ao vivo), não estimados.

> Ponto de referência antes da fase de Segurança (AI-75). Não altera nenhum dado nem código.

---

## 1. RELATÓRIO EXECUTIVO

O ecossistema é **enorme e funcional**: 70 módulos de IA vivos, 657 tabelas, 2.575 funções, 78 crons, build verde (4.799 módulos). A camada ORION AI está madura, com convenções fortes (evidência, idempotência, RLS + REVOKE nos módulos novos, chave única por módulo). **Porém há 3 riscos que precisam de atenção ANTES de escalar a segurança (AI-75):**

1. **🔴 P0 — RLS desligado em 27 tabelas financeiras/sensíveis** (carteiras, ledger, escrow, contas bancárias, splits de pagamento). No Supabase, tabela `public` sem RLS é exposta via PostgREST.
2. **🔴 P0 — Zero testes automatizados** (0 arquivos de teste, sem E2E). Nenhuma rede de segurança contra regressões numa base de 578 migrations.
3. **🟠 P1 — Duplicação/sobreposição entre módulos de IA** (6 clusters), gerada por sessões paralelas.

**Nota geral do projeto: 76/100.** **Veredito "Pronto para AI-75": 🟡 CONDICIONADO** — pode iniciar, com o RLS financeiro como pré-requisito P0.

---

## 2. INVENTÁRIO (números reais)

| Dimensão | Qtde |
|---|---|
| Tabelas `public` | **657** (344 `orion_*`) |
| Views / Materialized views | 107 / 2 |
| Funções | **2.575** (1.567 SECURITY DEFINER) |
| Cron jobs | **78** (70 ticks ORION) |
| Módulos de IA (module_prefs) | **70** |
| Prompt keys (Registry) | **288** |
| Eventos no event bus | **17.977** |
| Migrations (repo) | **578** |
| Edge Functions | **31** |
| Páginas front | **351** (159 admin, 71 painéis ORION) |
| Rotas admin / lazy exports | 180 / 339 |
| Docs | **136** (61 certificações ORION-AI) |

---

## 3. NOTAS POR DIMENSÃO

| Área | Nota | Observação |
|---|---|---|
| **Arquitetura** | 82 | Modularização forte, namespaces limpos; penalizada por duplicação entre módulos e acoplamento crescente ao `orion_eventos`. |
| **Banco de Dados** | 78 | 553/657 tabelas com RLS; **104 sem RLS** (todas de negócio, 0 ORION). 2.575 funções bem organizadas; migrations abundantes. |
| **Backend** | 88 | SECURITY DEFINER + guarda admin/service; event bus consistente; tratamento de erro `EXCEPTION WHEN OTHERS→NULL` no emit (bom). |
| **Front-end** | 85 | 351 páginas, 71 painéis ORION; build verde; risco de bundle grande (4.799 módulos) e chunks. |
| **Marketplace** | 84 | Fluxos ativos; dados reais baixos (test data). |
| **Leilão** | 80 | Motor + settlement + comissão + analytics (AI-67); **muita duplicação de dashboards** (ver §6). Dados mínimos (2 leilões/0 lances). |
| **Motoboy / Moto-Táxi** | 82 | Despacho compartilhado, carteiras independentes; **RLS off em `courier_wallet_*`/`courier_bank_accounts` (P0)**. |
| **Financeiro** | 74 | Gaps antigos resolvidos (`pay_escrow_holds`=19, `pay_settle_delivery` existe); **RLS off em 27 tabelas financeiras (P0)**. |
| **IA (AI-00..74)** | 88 | 70 módulos vivos, evidência/idempotência; overlaps e chaves duplicadas puxam a nota. |
| **Performance** | 80 | Build verde; só 2 matviews num universo de 657 tabelas; cache no Gateway real; 13 crons com falha em 24h. |
| **Qualidade** | 60 | 26 arquivos com TODO/FIXME; **0 testes**; duplicação de código entre painéis. |
| **Segurança** | 55 | ✅ leak de SECURITY DEFINER→PUBLIC fechado (0 funções com proacl default); ❌ **104 RLS off** (27 financeiras). |
| **Testes** | 20 | **0 unitários, 0 integração, 0 E2E, 0 carga.** Sem cobertura. |
| **Documentação** | 90 | 136 docs, 61 certificações, README + CHANGELOG, numeração oficial + master doc. |

---

## 4. SEGURANÇA — estado antes do AI-75

- ✅ **SECURITY DEFINER**: 1.567 funções, **0 com `proacl` default (PUBLIC execute)** → o vazamento sistêmico (SECURITY DEFINER de leitura executável por anon) está **fechado** globalmente. Lição aplicada.
- ✅ `auction_listings` RLS agora **ON** (estava OFF em auditoria anterior — corrigido por sessão paralela).
- ✅ Módulos ORION: **100% com RLS** (0 `orion_*` sem RLS).
- 🔴 **104 tabelas de negócio SEM RLS**, incluindo 27 financeiras/sensíveis:
  `courier_bank_accounts, courier_wallet_accounts, courier_wallet_ledger, escrow_accounts, escrow_holds, external_bank_accounts, ledger_entries, credit_transactions, credit_package_purchases, commissions_local, delivery_splits, pay_payout_events, pay_payout_requests, pay_split_rules, pay_split_transactions, payment_intents, payment_splits, professional_wallet_ledger, profile_wallets, store_credit_wallet, store_credit_subscriptions, bank_webhook_events, pay_payment_events, pay_merchant_credit_purchases, credit_subscription_plans/grants, credit_pricing_settings` …
  **Impacto:** no Supabase, tabela `public` sem RLS é legível/escrevível via PostgREST conforme o grant do papel `anon`/`authenticated`. **É o item nº 1 a resolver na fase de segurança.**

### Lista de vulnerabilidades (priorizada)
| # | Sev | Item | Ação |
|---|---|---|---|
| V1 | 🔴 P0 | RLS off em 27 tabelas financeiras | `ENABLE ROW LEVEL SECURITY` + policies por dono/admin |
| V2 | 🔴 P0 | RLS off em +77 tabelas de negócio | Revisar e habilitar por padrão |
| V3 | 🟠 P1 | 13 crons falhando/24h | Diagnosticar `cron.job_run_details` |
| V4 | 🟡 P2 | Validação de uploads/entradas (não coberta nesta auditoria de dados) | Revisão de Edge Functions no AI-75 |

---

## 5. TESTES — lacuna crítica

- **0 arquivos de teste** (`*.test.*`/`*.spec.*`), **0 diretórios E2E** (cypress/playwright), sem suíte de carga.
- Rede de segurança contra regressão = **inexistente**. Com 578 migrations e 70 módulos, isso é o maior risco de qualidade.
- **Recomendação:** antes/junto ao AI-75, criar suíte mínima: (a) smoke E2E dos fluxos financeiros e de leilão; (b) testes de RLS (garantir que anon NÃO lê tabela financeira); (c) testes das RPCs críticas de pagamento/comissão.

---

## 6. DUPLICAÇÃO / SOBREPOSIÇÃO (gerada por sessões paralelas)

Clusters de módulos com responsabilidade sobreposta (chaves em `orion_ai_module_prefs`):

| Cluster | Chaves | Observação |
|---|---|---|
| Trust | `trust` + `trust_reputation` | Provável **duplicata** (AI-20). Consolidar. |
| BI | `business` + `business_intelligence` | Possível duplicata (AI-22). |
| Governança | `governance` (AI-50) + `ai_governance` (AI-38) + `compliance_lgpd` (AI-48) | Sobreposição de escopo; delimitar. |
| Executivo | `executive` (AI-12) + `executive_copilot` (AI-30) + `exec_strategy` (AI-59) | Camadas distintas mas próximas. |
| Conhecimento | `knowledge_graph` (AI-34) + `kgraph` (AI-57) + `knowledge_learning` (AI-31) | 3 "knowledges" **intencionalmente distintos** (grafo semântico / grafo corporativo / meta-aprendizado) — documentado. |
| Leilão | `auctions` + `auction_growth` + `auction_intelligence` (AI-67) + `auction_orchestrator` | **Muita duplicação de dashboards** (`orion_auction_market_intel`, `orion_auction_intelligence_dashboard`, `auction_intel_*`, `auction_command_dashboard`, `auction_growth_dashboard`, `orion_auction_seller_dashboard`, `orion_auction_settlement_dashboard`). Consolidar. |

**Código duplicado (front):** os 71 painéis `AdminOrion*` compartilham o mesmo boilerplate (header/tabs/`rpc()` helper) — candidato a um componente base `OrionPanelShell` para reduzir dívida.

---

## 7. PLANO DE CORREÇÃO PRIORIZADO

| Prio | Item | Esforço | Fase |
|---|---|---|---|
| **P0** | Habilitar RLS + policies nas 27 tabelas financeiras | médio | **AI-75 (pré-requisito)** |
| **P0** | Suíte mínima de testes de RLS financeiro (anon negado) | médio | AI-75 |
| **P1** | Habilitar RLS nas +77 tabelas de negócio restantes | alto | AI-75 |
| **P1** | Diagnosticar/corrigir 13 crons com falha/24h | baixo | imediato |
| **P1** | Consolidar duplicatas `trust`/`trust_reputation`, `business`/`business_intelligence` | baixo | pós-AI-75 |
| **P2** | Unificar dashboards de leilão (7+ funções sobrepostas) | médio | pós-AI-75 |
| **P2** | Componente base `OrionPanelShell` (reduz duplicação front) | médio | contínuo |
| **P2** | Resolver 26 TODOs/FIXME + code splitting do bundle | médio | contínuo |

---

## 8. CHECKLIST — "Pronto para ORION-AI-75?"

| Critério | Status | Justificativa |
|---|---|---|
| Arquitetura estável | ✅ | 70 módulos, namespaces limpos, convenções congeladas |
| Build verde | ✅ | `vite build` exit=0, 4.799 módulos |
| Módulos ORION com RLS | ✅ | 100% (0 `orion_*` sem RLS) |
| Leak SECURITY DEFINER→PUBLIC | ✅ | Fechado (0 funções com proacl default) |
| Documentação | ✅ | 61 certificações + master + numeração |
| **RLS em tabelas financeiras** | ❌ | **27 tabelas sensíveis SEM RLS — P0** |
| **Testes automatizados** | ❌ | **0 testes — sem rede de regressão** |
| Crons saudáveis | ⚠️ | 13/78 falhando em 24h |
| Duplicação de módulos resolvida | ⚠️ | 6 clusters sobrepostos |

**VEREDITO: 🟡 CONDICIONADO.** O AI-75 (Security Ecosystem) **pode iniciar**, mas o **RLS das 27 tabelas financeiras é P0** e deve ser o **primeiro entregável** da fase — hoje é a maior exposição real da plataforma. A ausência de testes deve ser endereçada em paralelo (ao menos testes de RLS financeiro).

---

## 9. NOTA SOBRE AS IAs (AI-00 → AI-74)

70 módulos vivos no banco (chaves em §6). Cada um com certificação própria (`DOCS/orion-ai-NN-*-certificacao.md`, 61 docs) — scores individuais 90–100 nas certificações. A auditoria **não recontesta** cada nota individual (elas têm homologação com prova ao vivo); o **valor-add desta auditoria é transversal**: duplicação (§6), RLS financeiro (§4), testes (§5) — itens que nenhuma certificação individual capturava por serem cross-cutting. Recomenda-se, na consolidação pós-AI-75, um **registro único** que concilie os 70 module_prefs com os 74 números de documentação (há gaps e duplicatas de chave a normalizar).

---

*Auditoria read-only. Nenhum dado/código alterado. Fonte: consultas ao vivo em `broifhfqmnzqoongtokm` + repositório, 2026-07-18.*
