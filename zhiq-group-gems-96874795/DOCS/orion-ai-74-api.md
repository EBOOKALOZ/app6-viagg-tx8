# ORION-AI-74 — API (Trust & Reputation)

As APIs do ecossistema são **RPCs Postgres** (padrão ORION). Mapeamento da spec `/trust/*`:

| Endpoint da spec | RPC | Acesso | Retorno |
|---|---|---|---|
| `/trust/score` | `rep_get(p_user_id uuid DEFAULT NULL)` | próprio usuário ou admin | score, nível, sub_scores, fatores (7, com evidência), papéis, selos ativos, `_auditoria` |
| `/trust/history` | `rep_history_api(p_user_id uuid, p_days int DEFAULT 90)` | próprio ou admin | série `[{dia, trust_score, nivel}]` |
| `/trust/badges` | `rep_badges_api(p_user_id uuid)` | próprio ou admin | `{conquistados[], disponiveis[]}` |
| `/trust/recommendations` | `rep_recommendations_api(p_user_id uuid)` | próprio ou admin | recomendações do usuário |
| `/trust/verifications` | `rep_verifications_api(p_user_id uuid)` | próprio ou admin | e-mail/telefone/documento/facial/identidade (status+evidência) |
| `/trust/alerts` | `rep_alerts_api(p_status text DEFAULT 'aberto')` | **admin** | alertas com dedupe |
| `/trust/dashboard` | `rep_dashboard()` | **admin** | KPIs, distribuição, rankings, mapa por cidade, evolução 30d, telemetria |
| dashboard do usuário | `rep_user_dashboard()` | autenticado (auth.uid()) | payload completo do próprio usuário |

**Motor (service_role/cron apenas — sem grant para authenticated):**
`rep_run(p_origem)` (orquestrador) · `rep_compute_user(uuid)` · `rep_award_badges()` · `rep_scan_alerts()` · `rep_recommendations_engine()`

**Teste:** `rep_selftest()` — 14 checks (admin/service). **Uso via supabase-js:** `supabase.rpc('rep_get')`.

Autorização: `rep_guard()` — chamador ≠ alvo exige `profiles.is_admin`; `auth.uid()` NULL (service) liberado. Todas SECURITY DEFINER com `REVOKE EXECUTE FROM PUBLIC, anon`.

## Integração com rankings (consumidores)

Módulos que quiserem ponderar rankings (marketplace, leilões, busca) devem **LER** `rep_get(user)`/`orion_rep_scores` — o AI-74 não altera ranking algum diretamente (recomenda-nunca-executa).
