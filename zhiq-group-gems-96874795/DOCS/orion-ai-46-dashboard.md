# ORION-AI-46 — Dashboard `/admin/orion-backup-recovery` (badge BACKUP)

Fonte única: `backup_dashboard()` (refetch 60s). Arquivo: `src/pages/admin/AdminOrionBackup.tsx`.
Sidebar: grupo ORION → **Backup & Recovery AI** (ícone DatabaseBackup, badge **BACKUP**),
após Threat Intelligence (AI-43).

## Header (7 painéis)

CRI (cor por faixa) · alertas abertos · BRS · RRS · DIS · Cobertura % · RPO validado · RTO estimado.

## Abas (8)

1. **Resumo** — 4 cards de score (BRS/RRS/DIS/CRI com explicação); último backup/tipo/status,
   próximo, tempo médio, falhas, restore testados/aprovados; banner WAL-G/PITR/snapshots +
   botões **Rodar restore test** e **Suíte de testes**.
2. **Backups** — catálogo por componente (WAL-G, PITR, snapshots, manifesto, storage/edge/secrets
   declarados) com presente/ausente e evidência.
3. **Restore** — último teste não-destrutivo (6 casos com ✓/✗, ex.: RLS pay, funções críticas,
   cron, backup físico) + RTO; integridade do manifesto (checksums por categoria: estável/drift/baseline).
4. **Planos** — planos de recuperação (escopo, metas RPO/RTO, passos) + eventos DR (drills/solicitações).
5. **Alertas** — alertas de continuidade (7 dias) por severidade/status.
6. **Estatísticas** — série 7 dias (BRS/RRS/DIS/CRI + RPO/RTO + testes + alertas).
7. **Histórico** — jobs de backup/manifesto + evidências do último manifesto (checksums imutáveis).
8. **Config** — cron, modelo IA, escopo monitorado, nota de segurança (nunca expõe secrets) e lacunas declaradas.

## Ações no painel

- `backup_restore_test()` — roda validação não-destrutiva na hora.
- `backup_selftest()` — roda a suíte de 8 testes.
- Solicitação/aprovação de restore são operações auditadas (via RPC); o painel nunca dispara restore real.
- Guarda: tudo admin (RLS + guarda nas funções); anon sem SELECT (42501).
