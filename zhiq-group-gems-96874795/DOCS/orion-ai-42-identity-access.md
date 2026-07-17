# ORION-AI-42 — Identity & Access AI v1.0

> **Identity & Access Engine oficial do ORION.** 3º módulo do Security Ecosystem
> (AI-40..49; ver `DOCS/orion-security-ecosystem.md`). Chave de módulo: **`identity_access`**.
> Painel: **`/admin/orion-identity`** (badge IDENTITY). Tick: **pg_cron `*/2 * * * *`**.

## Missão

Validar identidades, analisar o contexto de cada acesso (sessão, dispositivo, IP,
horário, perfil), aplicar políticas adaptativas de autenticação/autorização e
proteger todos os perfis da VIAGG-TX8 — **sempre com evidência real**. Nenhum
acesso privilegiado sem evidências, auditoria e política. O módulo **recomenda,
NUNCA bloqueia sozinho**: encerrar sessão/bloquear usuário de verdade é ação
humana pelas políticas (aprovação `humana`), auditada e reversível.

## Princípios (herdados do ORION CORE v1)

1. **Evidências obrigatórias** — todo evento e todo score carrega `evidencias`
   jsonb com componentes, pesos e fonte (formulas declaradas no próprio registro).
2. **Idempotência** — `dedupe_key` único por condição; ingest incremental
   (janela 30d) com upsert; **nunca recalcula histórico**.
3. **Trilha auditável** — eventos append-only para clientes (REVOKE ALL +
   GRANT SELECT); marcações/bloqueios/políticas geram evento com antes/depois;
   rollback de política = reaplicar valores anteriores (trilha completa).
4. **Lacunas declaradas** — o que não tem fonte real é declarado, nunca inventado.
5. **Zero impacto nos demais módulos** — só lê as fontes (inclusive schema
   `auth`); escreve apenas em `orion_identity_*`/`orion_access_*`/`orion_devices`,
   `orion_eventos` (bus), `orion_ai_alerts` e ponte `orion_cyber_events`.
   **Sem trigger em tabela core**: alteração de permissões é detectada por
   snapshot (diff a cada tick).

## Tabelas

| Tabela | Conteúdo |
|---|---|
| `orion_identity_profiles` | identidade por usuário: tipo (active_profile), múltiplos papéis (perfis_disponiveis + roles), **IS/ATS**, nível de confiança, status, evidências |
| `orion_access_sessions` | espelho analítico de `auth.sessions`: ip, navegador/SO (derivados de user_agent), aal/mfa, login/refresh/expiração, **SRS** + session_score, evidências |
| `orion_devices` | dispositivos conhecidos: fingerprint (derivada — DECLARADO), first/last_seen, sessões, **DCS**, bloqueado (ação humana) |
| `orion_access_events` | eventos de acesso: auditoria GoTrue + detectores + políticas + ações humanas; severity/score/evidências/status; `dedupe_key` único |
| `orion_access_policies` | políticas adaptativas: ação, perfil, score mínimo, MFA, aprovação (automática/humana); alteração só via `identity_policy_set` (auditada) |
| `orion_identity_statistics` | por dia: logins, suspeitos, sessões ativas/risco alto, MFA, dispositivos novos/confiáveis, **IS/ATS/SRS/DCS médios, MAR, III** |

RLS: leitura admin (`mp_is_admin()`); grants travados (`REVOKE ALL` + `GRANT SELECT`
a `authenticated` — os default grants do projeto davam até TRUNCATE, que ignora RLS).

## Scores (todos 0–100, explicáveis)

| Score | Significado |
|---|---|
| **IS** Identity Score | base 50 + email confirmado(+10) + perfil completo(+10) + legal(+5) + conta 30d(+10) + documento(+5) − email divergente(−25) − fraude ativa AI-41(−20) − sinal cyber AI-40(−15) − eventos abertos(−15) − admin sem MFA(−10) |
| **ATS** Access Trust Score | (2·IS + média session_score das sessões ativas + média DCS dos dispositivos) / 4 |
| **SRS** Session Risk Score | IP novo(+25) + navegador novo(+15) + expirada reutilizada(+35) + admin sem MFA(+20) + sinais AI-40/41(+30) + sem refresh 7d(+10) + dispositivo bloqueado(+40), teto 100. session_score = 100 − SRS |
| **DCS** Device Confidence | 15 + min(45, dias·3) + min(30, sessões·6) + (sem risco? +10 : −15); bloqueado = 0 |

KPIs derivados: **MAR** (MFA Adoption Rate = sessões aal2/ativas — hoje **0 REAL**,
DECLARADO) e **III** (Identity Integrity Index = 0.35·IS + 0.25·ATS + 0.20·(100−SRS) + 0.20·DCS).

## Fontes reais validadas no banco (07-17)

`auth.users` (11) · `auth.sessions` (37; ip inet, user_agent, aal, factor_id,
not_after, refreshed_at) · `auth.audit_log_entries` (5.297; login 805, logout 462,
token_refreshed 1.920, user_repeated_signup 40, user_updated_password 5;
**ip_address VARCHAR**) · `auth.identities` (10) · `auth.mfa_factors` (**0**) ·
`profiles` (9; active_profile/available_profiles/is_admin) · `user_roles` (2) ·
`orion_fraud_events` (AI-41) · `orion_cyber_events` (AI-40).

## Detecção automática

**Identidade** — `identidade_inconsistente` (email perfil ≠ email auth),
`troca_frequente_ip` (≥3 IPs/24h na auditoria de login), `troca_frequente_navegador`
(≥3 dispositivos/7d). *Contas duplicadas (doc/telefone/dispositivo): cobertas pelo
AI-41 — o AI-42 lê `orion_fraud_events` como penalidade do IS, não re-detecta
(anti-duplicação).* `permissao_alterada` (diff de is_admin/user_roles entre ticks).

**Sessões** — `login_simultaneo_incompativel` (2 sessões ativas, IPs distintos,
<10min), `sessao_duplicada` (mesmo user+IP+dispositivo >1 ativa),
`sessao_expirada_reutilizada` (refresh após not_after — crítica),
`token_suspeito` (≥50 refreshes/24h).

**Dispositivos** — `dispositivo_novo` (informativo), `dispositivo_bloqueado_em_uso`
(crítica). Fingerprint inconsistente aguarda `device_tokens` com volume (DECLARADO).

**Administração** — `admin_sem_mfa` (sessão admin aal1 — recomendação; MAR=0),
`permissao_alterada`, elevação temporária via política `privilege_elevation`
(concessão SEMPRE humana com justificativa/prazo; o AI-42 audita o diff).

## Lacunas DECLARADAS (nunca inventa)

- **Geolocalização por IP** não existe no banco → "mudança brusca de localização"
  fica declarada; proxy real já coberto: troca frequente de IP.
- **Fingerprint real de dispositivo**: `device_tokens` vazia → impressão derivada
  de user_id+user_agent (aproximação declarada nas evidências).
- **MFA não adotado** (mfa_factors=0; 0 sessões aal2) → MAR=0 real; políticas de
  MFA operam como recomendação.
- **Troca de e-mail**: GoTrue registra como `user_modified` genérico.
- **Sessão roubada plena** exige telemetria; proxies reais: expirada reutilizada +
  token em volume anômalo.
- **logout_at** ao sumir do GoTrue é aproximação (hora exata vem do evento de
  auditoria `logout` por usuário).

## Resposta por política (`identity_politica_v1`)

`identity_respond()` roda no tick: eventos novos **crítica** → `reautenticacao`;
**alta** → `validacao_adicional` (ou `exigir_mfa` p/ admin_sem_mfa e
permissao_alterada); ambos vão a `em_analise` + alerta em `orion_ai_alerts`
(idempotente por tipo/dia) + resposta registrada como evento (`resp:<id>`).
Média/baixa: apenas monitoradas. Marcação humana via `identity_mark()`.
Bloqueio de dispositivo via `identity_device_block()`/`identity_device_unblock()`
(reversível, auditado). Política via `identity_policy_set()` (antes/depois na trilha).

## `validate_identity(usuario, sessão?, dispositivo?)` — porta oficial

Retorna IS/ATS/SRS/DCS, nível, status, evidências e **ação recomendada** pela
cadeia de políticas: perfil/dispositivo bloqueado → `negar_acesso` (política humana
já dada) · SRS ≥ limiar → `reautenticacao` · admin sem MFA → `exigir_mfa` ·
IS < mínimo → `revisao_manual` · DCS < mínimo → `validacao_adicional` · senão
`permitir`. Guarda: admin/service **ou o próprio usuário** (autorização contextual).

## IA (via AI-00 Gateway, `gpt-5-mini`)

Prompt Registry: `identity.explain_suspicious`, `identity.explain_block`,
`identity.explain_mfa`, `identity.explain_trust_change`, `identity.report`.
Preferência de modelo em `orion_ai_module_prefs` (`identity_access` → `gpt-5-mini`).
Nenhuma chamada direta a provedor.

## Motor de execução

O papel "edge function identity-access-engine a cada 2 min" é cumprido pelo motor
SQL `orion_identity_tick()` agendado no **pg_cron `*/2`** (mesma convenção dos
AI-36..41: porta única, sem HTTP extra, incremental, nunca recalcula histórico) —
DECLARADO na certificação. Ordem do tick: ingest_audit → sync_sessions → detect →
sync_profiles → respond → statistics_rollup.

## Integrações

- **AI-00 Gateway**: prompts/modelo (acima).
- **AI-40 Cyber Defense**: ponte `identity_bridge_cyber()` — eventos alta/crítica
  espelhados em `orion_cyber_events` (dedupe `identity:<id>`, idempotente,
  defensiva). Sinais cyber do usuário elevam o SRS (+30) e penalizam o IS (−15).
- **AI-41 Fraud Detection**: fraude ativa do usuário eleva SRS (+30) e penaliza
  IS (−20); duplicidades de conta ficam no AI-41 (anti-duplicação).
- **AI-24 Security**: complementar — AI-24 agrega sinais técnicos; a camada
  operacional de identidade/acesso é o AI-42.
- **AI-38 Governance / AI-37 Center**: custos/governança das chamadas IA via Gateway.
- **Supabase Auth**: leitura direta de users/sessions/audit/mfa_factors (JWT/aal/MFA).
- **Bus**: emite `identity.respond`, `identity.mark`, `identity.device_block`,
  `identity.policy_set`, `identity.score` em `orion_eventos` (origem `identity_access`).
- **Próximos módulos**: base de confiança para **AI-43 Threat Intelligence** e
  **AI-47 Zero Trust**.

## Diferenciais VIAGG-TX8

- **Autorização contextual**: `validate_identity` considera perfil (admin/lojista/
  motoboy/cliente), dispositivo, risco da sessão e políticas antes de recomendar.
- **Elevação temporária de privilégios**: política `privilege_elevation`
  (aprovação humana + justificativa + prazo); o diff de permissões é auditado
  automaticamente a cada tick.
- **Multi-papéis**: `perfis_disponiveis` + `roles` por usuário, com permissões
  independentes e auditáveis (fonte: profiles.available_profiles + user_roles).
- **Risco elevado por AI-40/41**: indício de ataque/fraude no usuário aumenta o
  risco da sessão e pode exigir MFA/reautenticação conforme as políticas.

## Arquivos

- Migration: `supabase/migrations/20260717_orion_identity_access_ai.sql` (com ROLLBACK manual ao fim)
- Painel: `src/pages/admin/AdminOrionIdentity.tsx` (+ rota em `adminRoutes.tsx`/`lazyPages.ts`, sidebar badge IDENTITY)
- API: `DOCS/orion-ai-42-api.md` · Dashboard: `DOCS/orion-ai-42-dashboard.md`
- Certificação: `DOCS/orion-ai-42-certificacao.md`
