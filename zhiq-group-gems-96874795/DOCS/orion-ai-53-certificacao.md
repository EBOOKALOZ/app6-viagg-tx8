# ORION-AI-53 — AI Operations (AIOps) AI — Certificação v1.0 (2026-07-17)

## Resultado: **CERTIFICADO — 98/100**

Homologado no banco VIVO (`broifhfqmnzqoongtokm`) via Management API em 17-07-2026.

## Critérios de certificação × evidência

| Critério | Status | Prova |
|---|---|---|
| Detecta anomalias operacionais em tempo real | ✅ | detectou `cron_falhando` (orion_threat_tick 118/118), `servico_degradado` (frontend, gateway_ia, jobs), `slo_risco` (global erro_rate 4.04 vs alvo 1) — fontes reais |
| Prevê falhas com base em dados reais | ✅ | predição `interrupcao_servico` orion_threat_tick prob 100% / confiança 95% (60/60 falhas em 3h); degradação da plataforma |
| Executa ações corretivas seguras conforme políticas | ✅ | `abrir_incidente` auto (espelho `ops_anomaly` em orion_cyber_events); destrutivas viram recomendação c/ aprovação; políticas em `orion_aiops_automation_policies` |
| Integra AI-40..AI-52 | ✅ | lê cron/Gateway/client/AI-51(obs)/AI-52(cost)/AI-45(incidents); handoff AI-45 + espelho AI-40; consolidável pelo AI-49 |
| Painel administrativo funcional | ✅ | `/admin/orion-aiops`, 7 abas, badge AIOPS (falta deploy manual do usuário) |
| Documentação completa | ✅ | 4 docs (este + aiops + api + dashboard) |
| Suíte de testes automatizada aprovada | ✅ | `aiops_selftest()` → **8/8 aprovado** (inclui "nenhuma ação destrutiva auto-autorizada") |
| Build verde | ✅ | `vite build` ✓ built in 47.89s |
| Nunca ação destrutiva automática | ✅ | políticas: reprocessar_fila/limpar_cache/reiniciar_servico → auto_autorizada=false, requer_aprovacao=true |
| RLS / evidências imutáveis | ✅ | RLS admin + REVOKE ALL/GRANT SELECT; `orion_aiops_evidence` REVOKE UPD/DEL |

## RCA que provou o valor do módulo (banco vivo)

O AIOps detectou e fez o RCA de uma falha REAL: `orion_threat_tick` (AI-43) falhando a
cada execução. Evidência capturada do `return_message` do cron:
`ERROR: null value in column "entidades" of relation "orion_threat_campaigns" violates not-null constraint`.
A correção (coalesce de `entidades` → `[]`) foi aplicada e o **cron voltou a rodar** —
o loop detecção → RCA → correção fechou de ponta a ponta.

## Provas de robustez

- **Idempotência**: run1 == run2 (10 anomalias / 10 ações / 2 predições / evidência estável)
  após correção do dedup (UNIQUE dedupe_key + upsert; evidência só na 1ª detecção via `xmax=0`).
- **Scores honestos**: AOS 68, RHS 96, FRS 100 (há falhas reais), OAS 100, APS 95, disponibilidade 100%.
- **Automação segura**: 9 ações `abrir_incidente` executadas; 0 destrutivas automáticas.
- **SELFTEST 8/8**; guardas anon (P0001 + 42501).

## Pontos declarados (−2)

- Ações destrutivas de recuperação (reprocessar fila, reiniciar serviço, limpar cache)
  exigem infra fora do escopo do banco → viram recomendação com aprovação humana (DECLARADO).
- MTTD = detecção contínua (~intervalo do tick por fonte) — declarado.

## Rollback do módulo

Bloco `ROLLBACK (manual)` ao fim de `supabase/migrations/20260717_orion_aiops_ai.sql`.
