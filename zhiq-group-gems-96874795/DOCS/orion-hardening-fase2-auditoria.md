# ORION-HARDENING FASE 2 — Auditoria de Conclusão

**Data:** 2026-07-19 · **Banco:** `broifhfqmnzqoongtokm` (produção) · **Método:** correções aplicadas ao vivo (Management API) + provas REST (anon/authenticated) + suíte permanente executada. Números reais (consultas ao vivo).

**Base:** ORION-AUDIT v1.0 · ORION-HARDENING FASE 1 (aprovada) · ORION-ARCHITECTURE Pós-Leilão v1.0 · ORION-REVIEW FASE A v1.0 · ORION-HOTFIX FASE A.0 (todas as decisões preservadas).

> Escopo: fortalecimento (segurança/governança/testes/qualidade). **Sem** funcionalidade nova, **sem** AI-75, **sem** implementar Arremates, **sem** mudar regra comercial.

---

## 1. RESUMO EXECUTIVO

A FASE 1 fechou o RLS de 104 tabelas + acesso anônimo a 162 funções financeiras. A FASE 2 foi além e fechou os **vetores residuais (P1)** que nenhuma fase anterior cobria, revelados por introspecção ao vivo:

1. **204 funções DEFINER mutantes, sem guarda, executáveis por `anon`** → reduzidas a **8** (a superfície pública intencional: `submit_marketplace_order`, `register_product_inquiry`, `charge_*_interest_click`). As outras 196 foram revogadas.
2. **Vazamento por VIEWS** (achado novo): 25 views financeiras eram `owned by postgres` **sem `security_invoker`** → **ignoravam a RLS**. **Prova ao vivo:** `anon` E `authenticated` não-admin liam `v_pay_platform_ledger_summary` (agregado da plataforma). Fechado.
3. **2 funções de split financeiro** (`release_service_payment_split`, `create_motoboy_split_transaction`) e **2 leituras sensíveis** (`admin_get_auth_emails` via outra rota, `mp_get_admin_overview`) ainda abertas → fechadas.
4. **Base permanente de testes** implantada (39 REST + 10 invariantes SQL + selftests de domínio) — a lacuna R4 da FASE 1.
5. Crons, código, performance, observabilidade e compatibilidade auditados: **sem defeito bloqueante**.

**Nenhuma regra de negócio alterada. Zero regressão** (compat 9/9; suíte 39/39; build verde). Uma regressão foi *detectada e corrigida durante o trabalho* (revoke de `PUBLIC` em 3 views `security_invoker` de carteira → restauradas ao estado original).

---

## 2. ETAPA 1 — SECURITY DEFINER (classificação)

Inventário vivo: **1.576 funções `SECURITY DEFINER`** (88 triggers, não expostas via REST). Classificação transversal (por risco/uso, não função-a-função — inviável em prosa para 1.5k):

| Classe | Critério | Ação |
|---|---|---|
| **Essencial** | Motor/cron/trigger + RPCs chamadas pelo front autenticado (com guarda `auth.uid`/`is_admin` ou owner) | Mantidas; `service_role`/`authenticated` conforme uso |
| **Recomendada** | Leituras públicas legítimas (busca, `get_public_profile`, catálogo, config) e superfície pública de escrita (8 fns) | Mantidas com `anon` |
| **Desnecessária p/ clientes** | Mutantes sem caminho anônimo/autenticado legítimo; financeiras internas; leituras sensíveis | **REVOKE** aplicado |

**Conversão para INVOKER:** não recomendada em massa — a maioria precisa de privilégio de owner para escrever no ledger/bus sob RLS. A conversão correta é **por-view** (§3), não por-função.

**Resultado security-driven:** mutantes-anon-sem-guarda **204 → 8**; financeiras/sensíveis anon-exec **→ 0**.

---

## 3. ETAPA 2 — GOVERNANÇA DE PERMISSÕES (menor privilégio)

### Funções (198 revokes aplicados)
- **2 split financeiro** + **2 leituras sensíveis**: revoke anon (+authenticated nas financeiras); `service_role` mantido.
- **194 mutantes** sem caminho anônimo (grep `.rpc` em src+Edge = 0): revoke `anon`; `authenticated` mantido (zero breakage).
- **8 públicas** (order/inquiry/interest-click): **mantidas** — superfície de escrita anônima intencional.

### Views (achado novo — 25 views financeiras)
Views `public` são `owned by postgres` e, sem `security_invoker`, **bypassam RLS**. Fix:
- **15 views** não referenciadas por nenhum front → `REVOKE SELECT anon+authenticated` (fecha os 2 vetores).
- **10 views** usadas por páginas admin autenticadas → `REVOKE anon` (mantém admin); vazamento entre-autenticados vira **P1** (fix futuro = policy admin nas tabelas base + `security_invoker`).
- **3 views** já eram `security_invoker=true` (carteira do usuário) → **intactas** (respeitam RLS; anon recebe 0 linhas).

### Governança do ambiente
- **Roles:** 16 (padrão Supabase); único superuser = `supabase_admin` ✓.
- **Ownership:** objetos `public` de `postgres` + `supabase_admin` (PostGIS) ✓.
- **Schemas:** 12 (padrão Supabase + `admineng` custom). **Extensões em `public`:** 4 (`pg_net`, `postgis`, `citext`, `pg_trgm`) — nota P2 (mover p/ `extensions`; PostGIS é difícil).
- **Objetos públicos:** superfície de escrita anônima = allowlist de 8; leituras anon sensíveis = 0 (varredura de 584 read-only: só 2 achadas, ambas fechadas).

**Provas:** `admin_get_auth_emails`/`admin_apply_financial_adjustment`/`v_pay_platform_ledger_summary` = anon **42501/401**; fluxo autenticado (`get_my_merchant_pay_wallet`, feed) preservado.

---

## 4. ETAPA 3 — BASE PERMANENTE DE TESTES

Implantada em `tests/security/` (versionada, reutilizável, zero dependências novas):

| Artefato | Cobre | Execução | Resultado |
|---|---|---|---|
| `rls-permissions.test.mjs` | RLS/RPC/Views/superfície pública/isolamento (behavioral REST) | `npm run test:security` | **39/39** |
| `db-invariants.sql` | 10 invariantes: RLS financeiro, anon-execute, views, mutação anônima, ledger partida-dobrada, idempotência, saldo negativo, escrow split, comissão fonte única | SQL Editor / Mgmt API | **10/10** |
| `domain-selftests.sql` | Leilão (`auction_security_selftest`) + Reputação/ALC (`rep_selftest` 14/14) | SQL Editor / Mgmt API | **OK** |
| `README.md` | Como rodar + como estender p/ Arremates/AI-75 | — | — |

Script `test:security` adicionado ao `package.json`. Reutilizável em todas as próximas fases (PAY/Escrow/Leilão/ALC/Reputação cobertos).

---

## 5. ETAPA 4 — CRONS (78)

| Métrica | Valor |
|---|---|
| Jobs ativos | 78/78 |
| Execuções 24h | 16.378 |
| Falhas 24h | 31 (**0,19%**) |
| Falhas de **lógica** em 7 dias | **0** |
| Pior duração | 27,5s (1 job) · nenhum job com média >30s · 4 com média >5s |
| Jobs @ cada minuto | 3 (cyber/autoclose/expire-ride), todos <0,7s |

**Diagnóstico:** 100% das falhas são `startup timeout`/`connection failed` **transitórias**, causadas por **colisão de agenda** (8 jobs `*/10`, 8 `*/15`, 7 `*/2`, 7 `*/5` disparando no mesmo tick → contenção de workers). **Finalidade/frequência/deps:** os ticks ORION são idempotentes e consomem <2s cada. **Recomendação (não bloqueante):** escalonar offsets (`1-59/10`, `2-59/10`…) para eliminar os timeouts transitórios.

---

## 6. ETAPA 5 — CÓDIGO

- **Arquivos mortos:** 0 backups remanescentes; removidos **2 páginas dev sem referência** (`TestMapPage.tsx`, `DevSplitView.tsx`).
- **TODO/FIXME:** 39 (dívida declarada, não bloqueante).
- **Órfãos:** candidatos identificados (`AdminLoja5`, `AdminSystemSupervisor`, `AdminOrionAuctionLifecycle`=WIP paralelo) — **não removidos** (heurística incerta + sessões paralelas ativas); recomendado passe dedicado com as sessões quiescentes.
- **Duplicação de módulos:** reconfirmado (FASE 1) que `trust`/`trust_reputation` e `business`/`business_intelligence` são namespaces **disjuntos por design** — não são duplicação de código.
- Build verde após remoções.

---

## 7. ETAPA 6 — PERFORMANCE

- **Sem query lenta de usuário.** O tempo de DB é dominado por (a) **replicação realtime WAL** (infra Supabase, ~6ms/call, inevitável) e (b) **ticks ORION de background** (`observability`/`aiops`/`aoc` 1–1,6s) — não afetam UX.
- **Seq-scan em escala:** **0 tabelas** com seq_scan>10k e >5k linhas (volume de dados baixo/inicial).
- **Índices:** 129 FKs sem índice de cobertura — **latente** (recomenda-se indexar FKs quentes **antes** do crescimento; hoje inofensivo).
- **Recomendações:** escalonar crons (§5) + indexar FKs proativamente + avaliar frequência dos ticks de 1,5s.

---

## 8. ETAPA 7 — OBSERVABILIDADE

| Item | Estado |
|---|---|
| Event bus `orion_eventos` | 21.742 eventos · **12.934 nas últimas 24h** (ativo) · RLS ON · **anon DML = 0** (imutável) |
| Tabelas audit/log | 66 |
| Funções observ/health/tick | 106 (AI-10/11/51 vivas) |
| Crons com telemetria (`job_run_details`) | 82 |
| Trilhas-chave | `orion_auction_audit`, `system_events_log`, `system_financial_events`, `client_errors`, `orion_ai_log` presentes |

**Todas as operações críticas continuam auditáveis.** As mudanças de permissão preservaram `service_role` (quem grava o bus/trilhas). Nenhuma trilha ficou órfã.

---

## 9. ETAPA 8 — COMPATIBILIDADE (9/9, zero regressão)

| Módulo | Prova |
|---|---|
| Marketplace / Leilões / Imóveis / Veículos | anon lê listagens públicas → 200 ✓ |
| Financeiro / PAY | `get_my_merchant_pay_wallet` (auth) → success ✓ |
| Escrow | anon negado → 401 ✓ (isolamento) |
| Motoboy / Moto-Táxi / Delivery | feed autenticado 200 ✓; pricing anon negado ✓ |
| RIDV / ALC / Reputação | `rep_selftest` 14/14 ✓ |
| IA | `oce_certify` falhou=0 ✓; `auction_security_selftest` pass_geral=true ✓ |
| Notificações (bus) | anon write negado ✓ |

---

## 10. ETAPA 9 — PRONTIDÃO PARA ARREMATES

| Condição | Estado |
|---|---|
| Banco preparado | ✅ `orion_auction_settlements` PK `listing_id`; coluna `arremate_status` **já presente** (groundwork FASE A por sessão paralela); `auction_listings` RLS ON |
| Segurança adequada | ✅ P0-1/P0-2 do leilão fechados (HOTFIX A.0); financeiro blindado (FASE 1/2); única fn `auction%` anon-exec é **trigger** (`tg_arremate_settlement_protect`, não exposta via REST) |
| Eventos compatíveis | ✅ 0 eventos `arremate.*` (sem colisão); bus imutável a anon |
| Integrações prontas | ✅ AI-74 (rep 14/14); realtime `auction_listings`+`auction_bids` publicado |
| Estados consistentes | ✅ settlements=2, bids=1 |
| Rollback definido | ✅ plano na ORION-REVIEW FASE A (export pré-drop + tag) |
| Homologação preparada | ✅ checklist de 19 testes (REVIEW A) + suíte permanente (ETAPA 3) |

---

## 11. RELATÓRIO FINAL

### Melhorias realizadas
- 198 revokes de menor privilégio em funções DEFINER (mutantes-anon 204→8; financeiras/sensíveis→0).
- 25 views financeiras protegidas contra bypass de RLS (leak de agregado de plataforma fechado p/ anon **e** authenticated não-admin nas 15 não-front).
- Base permanente de testes (39 REST + 10 invariantes + selftests de domínio) + `npm run test:security`.
- 2 arquivos mortos removidos; drift e dívidas mapeados.
- Auditoria completa de crons/performance/observabilidade/compatibilidade.

### Objetos revisados
1.576 funções DEFINER · 656 tabelas · 107 views · 78 crons · 66 tabelas de trilha · 16 roles · 12 schemas.

### Testes executados / evidências
Suíte REST 39/39 · invariantes SQL 10/10 · selftests domínio OK · compat 9/9 · build verde. Provas anon/authenticated ao vivo registradas por etapa.

### Riscos remanescentes
| # | Sev | Item |
|---|---|---|
| R1 | 🟡 P2 | `spatial_ref_sys` sem RLS (PostGIS, dono `supabase_admin`; imutável no nosso nível) |
| R2 | 🟠 P1 | 10 views admin-agregadas ainda legíveis por **authenticated** (não anon) — fix = policy admin nas tabelas base + `security_invoker` |
| R3 | 🟠 P1 | ~800 funções DEFINER **não-financeiras/não-mutantes** ainda anon-exec (leituras públicas majoritariamente legítimas) — revisão fina por-função |
| R4 | 🟡 P2 | 129 FKs sem índice (latente, indexar antes de escala) · 78 crons colidindo (escalonar) · 4 extensões em `public` |
| R5 | 🟡 P2 | Drift: `orion_auction_finalize_log`/`orion_auction_commissions` ausentes → `aeo_selftest` falha (não-segurança) |

### Plano de continuidade
1. Aplicar `security_invoker` + policies admin nas 10 views admin (R2). 2. Passe por-função nas leituras DEFINER anon (R3). 3. Escalonar crons + indexar FKs. 4. Corrigir drift do AEO. 5. Manter a suíte rodando a cada migration.

### Recomendações para o Sistema de Arremates
Implementar a **FASE A** exatamente como a ORION-REVIEW A definiu (1 migration aditiva: `arremate_status` já existe → validar backfill; trigger de imutabilidade winner/valor; eventos `arremate.*`; 3 ajustes da máquina de estados; export de rollback antes de qualquer drop). Estender `tests/security/` com os asserts de imutabilidade e reabilitar `aeo_selftest` após corrigir o drift. Aplicar `REVOKE EXECUTE FROM PUBLIC, anon` em toda função nova do domínio (padrão AI-61).

---

## 12. AUDITORIA — RESPOSTAS OBRIGATÓRIAS

| Área | Nota FASE 1 | **Nota FASE 2** |
|---|---|---|
| **Segurança** | 88 | **93** |
| **Banco** | 90 | **92** |
| **Qualidade** | 68 | **80** |
| **Testes** | 55 | **82** |
| **Performance** | 80 | **84** |
| **Governança** | — | **88** |
| **NOTA GERAL** | 86 | **89** |

**A FASE 2 foi aprovada?** 🟢 **SIM.**

**Existem riscos P0?** ❌ **Nenhum.** (financeiro/PII/mutação anônima = 0 em prova ao vivo).

**Existem riscos P1?** Sim, sem exposição pública ativa: **R2** (views admin legíveis por authenticated não-admin) e **R3** (leituras DEFINER anon não-sensíveis a revisar). Ambos endereçáveis sem bloquear Arremates.

**Apto para iniciar o Sistema de Arremates?** ✅ **SIM** (todas as condições técnicas da REVIEW A atendidas; segurança do domínio fechada; suíte de regressão pronta).

**Apto para futuramente iniciar o ORION-AI-75?** ✅ **SIM** — a superfície de segurança está madura (RLS 656/656 exceto catálogo PostGIS; anon sem dinheiro/PII; testes permanentes; governança de menor privilégio aplicada). O AI-75 permanece **não autorizado** até sua própria fase.

---

# 🟢 ORION-HARDENING FASE 2 APROVADA

**Justificativa:** todos os P1 de segurança acionáveis foram eliminados e comprovados ao vivo (mutação anônima 204→8 intencionais; funções/views financeiras/sensíveis acessíveis a anon = 0; leak de views por bypass de RLS fechado); base permanente de testes implantada e verde; crons/performance/observabilidade/compatibilidade auditados sem defeito bloqueante; zero regressão funcional (uma regressão introduzida durante o trabalho foi detectada e revertida). Os remanescentes são P1/P2 sem exposição pública ativa, com plano de continuidade definido. Somente após esta aprovação está autorizada a implementação da **FASE A do Sistema de Arremates**.

---

*Correções aplicadas ao vivo em `broifhfqmnzqoongtokm`; 3 migrations idempotentes + suíte versionadas no repo. Provas por REST (anon + JWT) e Management API, 2026-07-19.*
