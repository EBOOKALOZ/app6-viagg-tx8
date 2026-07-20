# ORION-AI-77 — IAM Enforcement AI v1.0

> Camada de **EXECUÇÃO** de identidade & acesso. Chave `iam_enforcement` · namespace `orion_iam_*` · painel `/admin/orion-iam` (badge ENFORCEMENT).
> Migration: `supabase/migrations/20260718_orion_iam_enforcement_ai.sql`.

## O que é (e o que NÃO é)

Complementa — **não duplica** — o **AI-42 Identity & Access** e o **AI-47 Zero Trust**, que são **analíticos** (detectam, pontuam, recomendam; read-only). O AI-77 faz as **ações ativas** que eles não fazem: forçar MFA, revogar sessão, quarentena de dispositivo, revogação automática por risco.

> Se fosse construído como "AI-77 Identity & Access" do zero, seria duplicata do AI-42. Aqui a fronteira é clara: **AI-42/AI-47 pensam, AI-77 executa.**

## Segurança por princípio (não trava ninguém por acidente)

- **KILL-SWITCH GLOBAL** `orion_iam_config.enforcement_enabled` = **false por padrão**. Ações automáticas só **registram recomendação** enquanto está off.
- **ANTI-LOCKOUT** (provado no selftest): `iam_revoke_session` nunca revoga (a) a própria sessão do chamador, nem (b) a **última sessão admin ativa**.
- A migration **não revoga nenhuma sessão** ao aplicar (provado: `auth.sessions` = 65 antes e depois).
- Toda ação é **auditada** (`orion_iam_actions`) e **reversível** (quarentena) — revogação obriga novo login, não bloqueia permanentemente.

## Capacidades

| Recurso | Como |
|---|---|
| **Forçar MFA (admin)** | `iam_mfa_scan()` acha admins sem MFA verificado (lê `auth.mfa_factors status='verified'`); `iam_mfa_status_user(uid)` diz se precisa/está satisfeito. Config `mfa_enforce_enabled` + `mfa_mode` (warn/block). |
| **Revogar sessão** | `iam_revoke_session(session_id, motivo, manual)` — DELETE real em `auth.sessions` (postgres tem permissão), com anti-lockout. |
| **Revogação automática por risco** | `iam_auto_enforce()` lê `orion_access_sessions.risk_score` (AI-42) ≥ threshold e revoga — **só executa com kill-switch + `auto_revoke_enabled`**; senão registra. |
| **Quarentena de dispositivo** | `iam_quarantine_device()` / `iam_release_device()` (reversível). |
| **Privilégio mínimo / Zero Trust** | reusa AI-47 + o hardening (REVOKE anon); enforcement é auditável. |
| **Painel** | `iam_dashboard()` → `/admin/orion-iam` (kill-switch, MFA gaps, sessões de risco + revogar, quarentena, ações). |

## Admin = fonte única
`public.user_roles role='admin'` ativo (mesma base do `mp_is_admin`). Achado real na homologação: **2 admins, ambos SEM MFA**.

## Operação
- `orion_iam_tick()` (cron `*/15`) → `iam_mfa_scan` + `iam_auto_enforce` (registra enquanto off) + stats.
- RLS admin + REVOKE ALL/GRANT SELECT; **REVOKE EXECUTE FROM PUBLIC/anon** (=0 provado).
- COMANDO TESTE: `SELECT public.iam_selftest();` — **10 provas** (inclui `zero_lockout` e `kill_switch_off_default`).

## Próximo passo DECLARADO (risco de lockout → cuidado)
O **bloqueio forçado de MFA no front** (ProtectedRoute redireciona admin sem MFA para enrollment) + a **tela de cadastro de MFA (TOTP)** ficam para a próxima etapa — é a parte que pode travar acesso, então merece rollout controlado. O motor (`mfa_enforce_enabled`, `iam_mfa_status_user`) já está pronto para ele.
