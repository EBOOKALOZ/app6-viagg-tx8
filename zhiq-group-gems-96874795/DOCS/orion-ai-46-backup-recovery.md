# ORION-AI-46 — Backup & Disaster Recovery AI v1.0

> **Guardião da continuidade operacional da Viagg-TX8.** Chave: **`backup_recovery`**.
> Painel: **`/admin/orion-backup-recovery`** (badge BACKUP). Tick: **pg_cron `*/15`**.
> 6º módulo do ORION Security Ecosystem.

## Missão

Não basta ter backup. O ORION prova **continuamente** que os backups existem, estão
íntegros, são restauráveis, têm cobertura adequada e atendem RPO/RTO — sempre com
**evidência real e auditável**. **Nunca restaura produção automaticamente**;
restauração real exige autorização humana explícita.

## Fontes reais (sondadas 07-17)

- **Management API `/database/backups`**: `walg_enabled=true` (WAL contínuo ativo),
  `pitr_enabled=false`, `backups=[]` (sem snapshot nomeado). Sincronizado por
  `backup_sync_catalog(jsonb)` — a chamada usa o token de gestão (secret), então o
  sync contínuo é feito por edge/manual; o motor DB valida o catálogo.
- **Manifesto de schema (DB-native)**: checksums **md5 reais** por categoria crítica
  (tabelas, funções-assinatura, RLS, cron, índices, pay_tables, pay_functions,
  orion_tables) — um backup **lógico de estrutura** que o próprio banco produz e
  re-verifica → detecção de drift/corrupção.
- **AI-44 Security Audit** (`orion_secaudit_findings`): risco de config.

## Tabelas (8)

`orion_backup_jobs` (execuções/manifestos) · `orion_backup_catalog` (pontos de backup
por componente) · `orion_backup_evidence` (**checksums imutáveis** — append-only) ·
`orion_restore_tests` (validação não-destrutiva) · `orion_recovery_plans` (planos +
metas RPO/RTO) · `orion_recovery_events` (drills/solicitações) · `orion_backup_alerts`
(1/tipo/dia) · `orion_backup_statistics` (rollup diário).

RLS admin-read; `REVOKE ALL`+`GRANT SELECT` (armadilha TRUNCATE); evidências com
`REVOKE UPDATE/DELETE` (imutáveis).

## Scores (fórmulas explicáveis)

| Score | Fórmula |
|---|---|
| **BRS** Backup Reliability | WAL-G(35) + integridade manifesto(30) + snapshot nomeado(20) + manifesto recente(15) |
| **RRS** Recovery Readiness | plano ativo(30) + restore test aprovado(30) + cobertura(25) + PITR(15) |
| **DIS** Disaster Impact (menor=melhor) | sem PITR(30)+sem snapshot(30)+sem plano(20)+drift(20) − WAL-G(30) |
| **CRI** Critical Recovery Index | 0,4·BRS + 0,4·RRS + 0,2·(100−DIS) |

**RPO**: dados contínuos via WAL-G (declarado); RPO_validado = idade do último
manifesto de integridade. **RTO**: heurística declarada (base 30min + objetos/1000).
Cobertura por **tipo de componente distinto** (estável, não conta histórico de manifestos).

## Motor (tick `*/15` → `run_backup_recovery`)

1. `backup_snapshot` — manifesto de schema + evidências md5 + drift vs anterior.
2. `backup_restore_test` — validação **não-destrutiva** (6 casos: manifesto completo,
   checksum estável, RLS pay ativo, funções críticas presentes, cron presente, backup
   físico presente) + RTO estimado. Nunca toca produção.
3. `backup_generate_alerts` — PITR off, sem backup, RPO excedido, drift, restore falhou;
   auto-fecham quando a evidência some. Espelha críticos em `orion_cyber_events`
   (`config_risk`, consumido pelo AI-43) + handoff `backup.handoff_ai45`.
4. `backup_statistics_rollup` — BRS/RRS/DIS/CRI + RPO/RTO do dia.

## Disaster Recovery (nunca automático)

Planos seeded (banco completo, config/schema) com passos e metas. Fluxo:
`backup_request_recovery` (pendente) → `backup_approve_recovery` (admin) — e mesmo
aprovado **não executa restore**: sinaliza ops para restauração manual controlada.

## Segurança

Nunca acessa/expõe senhas, secrets, chaves ou tokens — valida **apenas existência,
integridade e disponibilidade**. Componentes secrets/storage/edge ficam DECLARADOS
(existência via Management API/edge).

## Suíte de testes (COMANDO TESTE)

`backup_selftest()` — 8 casos (catálogo, evidências 8 categorias, scores válidos,
restore test registrado, plano ativo, RLS ativo, evidências imutáveis, integridade
validável). Homologação: **8/8 aprovado**.

## IA (via AI-00 Gateway, `gpt-5-mini`)

`backup.validate`, `backup.restore`, `backup.summary`, `backup.risk`, `backup.recommendation`.

## Integrações

- **AI-40 Cyber Defense**: espelha risco crítico em `orion_cyber_events`.
- **AI-43 Threat Intelligence**: correlaciona os `config_risk` de backup.
- **AI-44 Security Audit**: consome findings de config.
- **AI-45 Incident Response** (construído em paralelo): handoff via `backup.handoff_ai45`.

## Lacunas DECLARADAS

- Snapshots físicos/storage/edge/secrets: existência via Management API (edge com token).
- Restore real: exige ambiente separado + aprovação humana — nunca automático.
- Contagem de postura inclui objetos de sistema — triagem.

## Arquivos

- Migration: `supabase/migrations/20260717_orion_backup_recovery_ai.sql` (ROLLBACK manual ao fim)
- Painel: `src/pages/admin/AdminOrionBackup.tsx` (+ rota/lazy/sidebar badge BACKUP)
- API: `DOCS/orion-ai-46-api.md` · Dashboard: `DOCS/orion-ai-46-dashboard.md` · Certificação: `DOCS/orion-ai-46-certificacao.md`
