# ORION-AI-43 — Threat Intelligence AI v1.0

> **Núcleo analítico do ORION Security Ecosystem** (ver `DOCS/orion-security-ecosystem.md`).
> Chave de módulo: **`threat_intelligence`**. Painel: **`/admin/orion-threat-intelligence`**
> (badge THREAT). Tick: **pg_cron `*/3 * * * *`**.

## Missão

Consolidar eventos de segurança (AI-40), fraude (AI-41) e identidade (auth) num
**grafo de ameaças**, detectar campanhas, correlacionar vulnerabilidades e produzir
inteligência estratégica. **Nenhuma ameaça é analisada isoladamente; nenhuma relação
é criada sem evidência registrada; nenhuma ação destrutiva ocorre automaticamente.**

## Arquitetura de correlação

Fonte primária = **`orion_cyber_events`**, o barramento comum do ecossistema (contrato
do AI-40). Ele já recebe as fraudes alta/crítica do AI-41 (ponte `fraud_bridge_cyber`),
os eventos do AI-40 e alertas do Trust — e o AI-42 espelha identidade lá também. O AI-43
lê esse barramento + `auth.audit_log_entries` (identidade) + postura (`pg_proc`/`pg_tables`)
e constrói o grafo. Isso evita duplicação: AI-40/41/42 **alimentam** eventos; o AI-43
**correlaciona**.

## Tabelas

| Tabela | Papel |
|---|---|
| `orion_threat_intelligence` | IOCs/observáveis de alto risco (TIS) — **REUSO**: não existia, criada aqui |
| `orion_ip_reputation` | reputação de IP — **REUSO**; DECLARADA (ambiente sem IP) |
| `orion_security_graph` | **NÓS** do grafo (ip/usuario/dispositivo/sessao/api/edge_function/ataque/fraude/evento/identidade) |
| `orion_threat_correlations` | **ARESTAS** (relação + evidência + peso + CS) — nunca aresta sem evidência |
| `orion_threat_campaigns` | campanhas (clusters correlacionados) com CRS |
| `orion_vulnerability_events` | vulnerabilidades (postura + ataques recorrentes) com VIS e mitigação |
| `orion_threat_statistics` | rollup diário (TIS médio, MTTC, TRR, tendência) |

RLS admin-read nas 7; grants travados (`REVOKE ALL` + `GRANT SELECT` a `authenticated` —
os default grants do projeto davam ALL/TRUNCATE, que ignora RLS).

## Grafo de ameaças (evidência obrigatória)

**Nós**: ataque (por tipo), usuário (por user_id, risco = severidade × diversidade de
ataques/módulos), API (por endpoint — DECLARADO nulo), identidade (por actor_id do auth,
risco por `user_repeated_signup`).

**Arestas** (correlações reais):
- `envolvido_em` — usuário → ataque
- `mesma_origem_usuario` — ataque ↔ ataque compartilhando usuário (correlação cross-tipo)
- `multi_modulo` — usuário ativo em ≥2 módulos de segurança (correlação forte)
- `mesma_conta` — identidade (auth actor_id) → conta plataforma (user_id)
- `mesma_campanha` — membro → nó de campanha

## Campanhas

- **repeticao_ataque** — ≥2 ocorrências do mesmo tipo em 30d
- **multi_modulo** — usuário ativo em ≥2 módulos de segurança (alta severidade)

CRS = severidade + volume + confiança. Marcação humana via `threat_mark_campaign`
(ativa/mitigada/resolvida/falso_positivo).

## Vulnerabilidades (postura real)

1. **Funções SECURITY DEFINER sem `search_path`** (risco de hijacking) — contagem real
2. **Tabelas public sem RLS** — contagem real
3. **Exposição recorrente a `<tipo>`** — vetores de ataque/fraude recorrentes no barramento

> DECLARADO: as contagens de postura incluem objetos de sistema/PostGIS — requerem triagem.

## Scores

| Score | Significado |
|---|---|
| **TIS** Threat Intelligence 0–100 | nível de ameaça da plataforma = 0,45·CRS médio + 0,35·VIS crítico + 0,20·risco de nós ≥60 |
| **CS** Correlation Score 0–100 | confiança de cada correlação (por aresta) |
| **CRS** Campaign Risk Score 0–100 | risco por campanha |
| **VIS** Vulnerability Impact Score 0–100 | impacto por vulnerabilidade |
| **MTTC** Mean Time To Correlate | latência entre chegada do evento no barramento e a correlação (só nós do barramento; identidade DECLARADA fora, senão infla) |
| **TRR** Threat Resolution Rate | campanhas mitigadas+resolvidas / total |

## Resposta inteligente (nunca destrutiva)

O tick agrupa incidentes (campanhas), eleva severidade (CRS), registra IOCs e prepara
o encaminhamento ao **AI-45 (Incident Response)** e ao **AI-49 (SOC Commander)**.
Ações de alto impacto seguem aprovação humana. **Rollback** por trace
(`threat_rollback`) marca correlações/campanhas como revertidas (persistem revertidas;
reativação é decisão manual) — auditado no bus.

## IA (via AI-00 Gateway, `gpt-5-mini`)

Prompt Registry: `threat.campaign`, `threat.correlation`, `threat.vulnerability`,
`threat.mitigation_priority`, `threat.executive_report`. Pref em `orion_ai_module_prefs`
(`threat_intelligence` → `gpt-5-mini`).

## Motor de execução

O papel da "edge threat-intelligence-engine a cada 3 min" é cumprido pelo motor SQL
`orion_threat_tick()` no **pg_cron `*/3`** (mesma convenção AI-36..42: porta única,
incremental, nunca recalcula histórico) — DECLARADO na certificação.

## Lacunas DECLARADAS

- **IP/ASN**: `orion_cyber_events.ip` e `auth.audit_log_entries.ip_address` vazios no
  ambiente → correlação por IP declarada (grafo pronto para recebê-la).
- **dispositivo/sessão/edge_function**: exigem instrumentação.
- **cartões**: fora do fluxo (checkout no provedor).
- **postura (definer/RLS)**: contagem inclui objetos de sistema — requer triagem.

## Arquivos

- Migration: `supabase/migrations/20260717_orion_threat_intelligence_ai.sql` (ROLLBACK manual ao fim)
- Painel: `src/pages/admin/AdminOrionThreat.tsx` (+ rota/lazy/sidebar badge THREAT)
- API: `DOCS/orion-ai-43-api.md` · Dashboard: `DOCS/orion-ai-43-dashboard.md` · Certificação: `DOCS/orion-ai-43-certificacao.md`
