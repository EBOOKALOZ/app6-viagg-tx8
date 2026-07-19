# ORION-HOTFIX FASE A.0 v1.0 — Certificação de Segurança (P0)

> **Data:** 2026-07-18 · **Migration:** `20260718_hotfix_fase_a0_p0_security.sql` (aplicada via Management API; idempotente, reaplicada 2×)
> **Escopo:** SOMENTE correção dos 2 P0 da ORION-REVIEW FASE A + varredura da mesma classe. **Zero funcionalidade nova, zero regra de negócio, zero DROP de função, zero alteração de tela.**

---

## Princípio aplicado — menor privilégio por bucket

| Bucket | Papel autorizado | Racional |
|---|---|---|
| **A — Motor/cron/trigger** (`orion_auction_close/charge/settle/apply_commission/autoclose_tick/antisniper/alert_tick/score_tick/intel_tick/orchestrator_tick/fraud_scan/validate_bids`, `auction_set_owner`, `auto_prazo_arremate`, `notify_store_on_arremate_offer`) | **só `service_role`** | invocadas por cron/trigger/webhook; nunca por cliente |
| **Legadas com `user_id` explícito** (`place_auction_bid` 3-arg, `submit_arremate_offer` 7-arg) | **só `service_role`** | vetor de personificação (recebem quem é o usuário como parâmetro) |
| **B — Ação de usuário** (`end_auction_listing`, `create_auction_listing[_v2]`, `create_arremate_listing`, `respond/accept_arremate_offer`, `place_auction_bid` 2-arg, `submit_arremate_offer` 3-arg) | **`authenticated`** | têm guarda interna `auth.uid()`/owner (verificado no código) |
| **C — Leitura/dashboard** (`auction_command_dashboard`, `auction_statistics/ranking`, `auction_intel_*`, `auction_growth_dashboard`, `orion_auction_panel/report_get/seller_dashboard/settlement_dashboard/...`, `auction_financial_rules_list/rule_get`, `auction_security_selftest`) | **`authenticated`** | painéis admin logados; **nenhuma página anon usa** (grep confirmou) |
| **Escrita de regra financeira** (`auction_financial_rule_upsert/deactivate`) | **só `service_role`** | muda comissão — jamais authenticated genérico |

## Objetos protegidos

- **Funções:** todas as ~85 do domínio `%auction%`/`%arremate%` → `REVOKE EXECUTE FROM PUBLIC, anon`; buckets A e financeiras também de `authenticated`.
- **Barramento:** `orion_eventos` **e** `orion_eventos_operacionais` → `REVOKE ALL FROM PUBLIC, anon, authenticated` + `GRANT SELECT TO authenticated` (policy admin filtra linhas) + `GRANT ALL TO service_role`.
- **Global:** `REVOKE TRUNCATE` de `anon`/`authenticated` em todas as tabelas/views `public` (TRUNCATE ignora RLS e não é exposto pelo PostgREST → uso legítimo = zero).

## Testes executados (todos APROVADOS)

### Segurança — sonda REST com a anon key real (produção)
| # | Tentativa (perfil anon) | Resultado | Esperado |
|---|---|---|---|
| 1 | `orion_auction_close` | `42501 permission denied` | negar ✅ |
| 2 | `orion_auction_charge` | `PGRST202` (nem visível) | negar ✅ |
| 3 | `INSERT orion_eventos` | `42501 permission denied for table` | negar ✅ |
| 4 | `SELECT auction_listings` (leitura pública) | **200 + linha** | permitir ✅ |
| 5 | `place_auction_bid` 3-arg (personificação) | `42501 permission denied` | negar ✅ |
| 6 | `create_auction_listing` | `PGRST202` | negar ✅ |

### Matriz de privilégios (banco)
- `service_role` executa `orion_auction_close` → **true** ✅ (cron/motor preservado)
- `authenticated` executa `orion_auction_close` → **false** ✅ (motor fechado ao usuário)
- `authenticated` executa `place_auction_bid` 2-arg → **true** ✅ (lance do usuário logado preservado)
- `authenticated` executa `end_auction_listing` / `auction_command_dashboard` → **true** ✅

### Banco / integridade
- Nenhuma migration anterior afetada (só GRANT/REVOKE; nenhum DDL de tabela/função).
- Dados intactos: settlements=2, bids=1, eventos=21.356 (bus continuou crescendo).
- **28 policies** do domínio intactas; **6 crons** de leilão ativos.
- Idempotência: migration reaplicada — mesmo resultado (`p01=0, p02=0`).

### Regressão dos módulos
| Módulo | Resultado |
|---|---|
| `rep_selftest` (AI-74) | **14/14** ✅ |
| `auction_security_selftest` | `pass_geral=true`, `anon_sem_dml: grants=0`, RLS 8/8 ✅ |
| `auction_command_dashboard` | ✅ responde |
| `auction_growth_dashboard` (AI-69) | ✅ responde |
| `orion_auction_settlement_dashboard` (AI-65) | ✅ responde |
| Leitura pública / lance autenticado / motor via service_role | ✅ |

---

## Auditoria pós-hotfix (respostas obrigatórias)

**SECURITY DEFINER — existe função crítica ainda executável por anon?** **NÃO.** `p01_leilao_anon = 0` (verificado no banco + sonda REST 42501/PGRST202).

**Eventos — existe operação destrutiva disponível para anon?** **NÃO.** `p02_eventos_dml = 0` em `orion_eventos` e `orion_eventos_operacionais`; INSERT/UPDATE/DELETE/TRUNCATE negados; SELECT filtrado por policy admin.

**Os riscos P0 foram eliminados?** **SIM.** P0-1 e P0-2 = 0 em produção, comprovado por privilégio (banco) e por comportamento (REST anon).

**As correções impactaram algum módulo existente?** **NÃO** (nenhum impacto funcional). Leitura pública, lance do usuário logado, dashboards admin, motor por cron e os selftests AI-74/segurança continuam operando.

## Riscos remanescentes (NÃO são P0; NÃO são regressão)

- **Drift pré-existente (P2):** `aeo_selftest` (AI-70) e `auction_intel_summary` (AI-67) falham com `42P01 relation does not exist` — tabelas `orion_auction_finalize_log` e `orion_auction_commissions` **nunca existiram** (bug de drift anterior ao hotfix). Erro de tabela ausente **não pode** vir de mudança de grant (grant gera `42501`, não `42P01`). Fica para uma correção de drift própria.
- **PostGIS (informativo):** `spatial_ref_sys`/`geometry_columns`/`geography_columns` mantêm TRUNCATE herdado (owned por `supabase_admin`, fora do nosso controle; não é vetor de domínio).
- **Escopo maior declarado:** a varredura confirmou que este padrão (anon com DML/EXECUTE) é sistêmico — **1.116 funções DEFINER e 415 tabelas** com exposição a anon no banco todo (quadro ORION-HARDENING FASE 1). Este hotfix fechou **o domínio de leilão + o bus de eventos + TRUNCATE global**; o restante permanece no backlog de hardening (fora do escopo P0 desta fase).

## Rollback

Tag sugerida `pre-hotfix-fase-a0`. Reversão possível reaplicando os GRANTs originais — **porém correção de vulnerabilidade não deve ser revertida**. A migration é puramente de permissão (sem DDL), então o rollback funcional é nulo: nada quebrou para reverter.

---

# 🟢 HOTFIX FASE A.0 APROVADA

**Justificativa:** os 2 riscos P0 foram eliminados e comprovados por privilégio (banco) e comportamento (sonda REST anon em produção); nenhum SECURITY DEFINER crítico permanece acessível por anon; nenhuma operação destrutiva (DML/TRUNCATE) permanece disponível a anon/authenticated no bus nem via TRUNCATE global; todos os 6 testes de segurança e a regressão (leitura pública, lance autenticado, dashboards, motor por cron, selftests AI-74/segurança) passaram; zero regressão funcional. As 2 falhas de selftest observadas são drift pré-existente (tabela ausente, classe de erro impossível de originar-se de grant) e ficam registradas como P2 fora do escopo P0.

**Autorização decorrente:** com a HOTFIX A.0 aprovada, o início da **implementação da FASE A** do Sistema de Arremates está liberado.
