# ORION-AI-47 — Zero Trust AI v1.0

> **Camada central de decisão de acesso do ORION Security Ecosystem** (AI-40..49).
> Chave de módulo: **`zero_trust`**. Painel: **`/admin/orion-zero-trust`** (badge
> ZERO TRUST). Tick: **pg_cron `*/2`** (avaliação contínua).
> Princípio: **nunca confiar, sempre verificar** — identidade desconhecida = NEGAR.

## Missão

Validar continuamente identidade, dispositivo, sessão, comportamento, risco,
permissões e contexto de cada operação. Toda solicitação avaliada recebe uma
decisão **explicável** com justificativa e evidências **imutáveis**. O AI-47
decide e recomenda; bloqueios/negações efetivas dependem de execução humana ou
da integração do front/edge com a porta oficial (adoção gradual — DECLARADO).

## Princípios (ORION CORE v1)

1. **Evidências obrigatórias e NUNCA removidas** — cofre append-only
   (`orion_zero_trust_evidence`) + evidências na própria decisão.
2. **Decisões imutáveis** — reversão = linha compensatória (`rollback_de`);
   nada é apagado.
3. **Idempotência** — upserts por chave; decisões contínuas do tick com dedupe
   diário por sessão+estado; nunca recalcula histórico.
4. **Lacunas declaradas** — AI-45/46 detectados dinamicamente; MFA=0; sem
   geo-IP; sem telemetria por request — tudo declarado, nada inventado.
5. **Zero impacto** — só lê os módulos irmãos; escreve apenas em
   `orion_zero_trust_*` + bus + alertas.

## Engine de Decisão — `zero_trust_evaluate(user, sessão?, device?, módulo?, ação?)`

Calcula os 4 scores → **RCS** → aplica a **política mais específica**
(usuário > módulo/api/edge > painel > perfil > global) → decide:

| Faixa RCS (política global) | Decisão |
|---|---|
| ≥ 80 | `permitir` |
| ≥ 65 | `permitir_monitorado` |
| ≥ 50 | `reautenticar` |
| ≥ 40 | `exigir_mfa` (MFA indisponível → degrada p/ `reautenticar`, DECLARADO) |
| ≥ 25 | `aprovacao_admin` |
| ≥ 15 | `bloqueio_temporario` |
| < 15 | `negar` |

Curto-circuitos: identidade desconhecida → `negar`; perfil/dispositivo
bloqueado (ação humana prévia do AI-42) → `negar`. Exceção temporária ativa
(prazo+motivo auditados) eleva o degrau mínimo a `permitir_monitorado` —
nunca esconde a decisão original (justificativa registra a exceção).

## Scores (0–100, fórmulas gravadas nas evidências)

| Score | Fórmula |
|---|---|
| **ZTS** Zero Trust Score | (IS + ATS)/2 do AI-42 − 0.4·risco_acumulado |
| **CAS** Context Assurance | 100 − fora_do_horário(20) − permissão_alterada_7d(20) − mudança_brusca(15) − sem_contexto(50) |
| **DAS** Device Assurance | DCS (AI-42) − (risco do dono ≥60 ? 20) ; bloqueado = 0 |
| **SAS** Session Assurance | session_score (AI-42, =100−SRS) − (risco ≥60 ? 15) |
| **RCS** Request Confidence | 0.30·ZTS + 0.25·SAS + 0.25·DAS + 0.20·CAS |

KPI: **ZTG** (Score Geral Zero Trust) = 0.4·ZTS + 0.3·SAS + 0.3·DAS (médias).

## Avaliação contínua (tick `*/2`)

`orion_zero_trust_tick()`: contexto → risco → sessões → dispositivos → alertas
→ estatísticas. Sessões em estado `reavaliar`/`bloqueio_recomendado` geram
**decisão contínua** (reautenticar/bloqueio_temporario, origem `tick`, 1×/dia
por sessão+estado) — o acesso é reclassificado **durante a própria sessão**.

## Risco acumulado (por usuário, componentes explicáveis)

cyber AI-40 (15/evento alta+, cap 40) + fraude AI-41 (0.3·FS máx, cap 30) +
identidade AI-42 (10/evento aberto, cap 30) + plataforma AI-43 (5) + AI-44 (5).
Risco ≥60 penaliza ZTS/SAS/DAS e marca `persistente_desde` (alerta ao persistir).
**AI-45/46: detecção dinâmica da superfície** (`orion_incident_%`/`orion_backup_%`)
— componentes declarados até a integração da próxima versão.

## Políticas

`orion_zero_trust_policies` por escopo (global/usuário/perfil/loja/módulo/api/
edge/painel/ambiente) com 6 limiares por faixa + `mfa_quando_disponivel` +
**exceção temporária** (prazo+motivo). Seeds: `zt_global` (80/65/50/40/25/15),
`zt_painel_admin` (85/75/60/50/35/20), `zt_financeiro` módulo pay (85/75/65/55/40/25).
Alteração SÓ via `zerotrust_policy_set` — antes/depois no cofre; **rollback
lógico = reaplicar os valores anteriores** (trilha completa).

## Alertas automáticos (`orion_ai_alerts`, idempotentes por tipo/dia)

`zerotrust:mudanca_brusca` · `zerotrust:admin_alto_risco` (RCS<50 em admin) ·
`zerotrust:dispositivo_suspeito` · `zerotrust:tentativas_repetidas` (≥3
negar/bloqueio em 24h) · `zerotrust:violacao_politica` · `zerotrust:risco_persistente`.

## Suíte de testes — COMANDO TESTE

`zerotrust_selftest()` — **13 testes automatizados** com evidência por teste
(tabelas, RLS, grants travados, políticas seed, cron, avaliação de acesso real,
política aplicada, decisão+evidência registradas, **identidade desconhecida
negada** (núcleo Zero Trust), faixas de decisão, sessões/dispositivos avaliados,
painéis, integrações AI-40..46). Relatório gravado no cofre de evidências.
Entrada do **COMANDO TESTE** (convenção de selftests por módulo, inaugurada
pelo AI-45 na mesma data). Homologação 07-17: **13/13 verdes**.

## IA (AI-00 Gateway, `gpt-5-mini`)

Prompt Registry: `zerotrust.evaluate`, `zerotrust.policy`, `zerotrust.session`,
`zerotrust.risk`, `zerotrust.summary`. Pref em `orion_ai_module_prefs`
(`zero_trust` → `gpt-5-mini`). Nenhuma chamada direta a provedor.

## Integrações

- **AI-42 Identity & Access**: fonte primária (IS/ATS/sessões/dispositivos/DCS);
  bloqueio físico de device/usuário continua lá (ação humana reversível).
- **AI-40/41/43/44**: alimentam o risco acumulado (componentes explicáveis).
- **AI-45/46**: detecção dinâmica de superfície; integração plena na próxima versão.
- **Dashboards Executivo/Financeiro/Auditoria/Analytics/Notificações**: via bus
  `orion_eventos` (origem `zero_trust`: decisao/politica/rollback/selftest/score)
  + `orion_ai_alerts` (mesmo padrão dos módulos AI-10/12/22 consumirem).
- **Enforcement**: o front/edge chama `zero_trust_evaluate` (mesmo padrão do
  `validate_identity` do AI-42); adoção gradual DECLARADA.

## Arquivos

- Migration: `supabase/migrations/20260717_orion_zero_trust_ai.sql` (ROLLBACK manual ao fim)
- Painel: `src/pages/admin/AdminOrionZeroTrust.tsx` (+ rotas/sidebar badge ZERO TRUST)
- API: `DOCS/orion-ai-47-api.md` · Dashboard: `DOCS/orion-ai-47-dashboard.md`
- Certificação: `DOCS/orion-ai-47-certificacao.md`
