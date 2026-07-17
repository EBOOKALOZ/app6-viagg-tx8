# ORION-AI-49 — Dashboard `/admin/orion-soc` (badge SOC COMMANDER)

Fonte única: `soc_dashboard()` (refetch 30s). Arquivo: `src/pages/admin/AdminOrionSoc.tsx`.
Sidebar: grupo ORION → **SOC Commander AI** (ícone ShieldHalf, badge **SOC COMMANDER**),
após Backup & Recovery — fecha o cluster de segurança.

## Header

4 scores grandes (OSS/ORS/GHS/ECS) + faixa: módulos OK, incidentes críticos, alertas SOC,
risco de domínio médio, MTTR, disponibilidade. Timestamp do snapshot + nota de tick */2.

## Abas (7 — cobrem os 11 itens da spec)

1. **Executive** — 4 cards de score explicáveis; contadores de módulos por estado +
   críticos/itens abertos; painel de analytics (MTTD/MTTR/MTTC/RPO/RTO + disponibilidade).
2. **Mapa de Saúde** — 9 cards, um por IA: estado 🟢🟡🟠🔴 (saúde operacional) +
   selo de risco de domínio + métricas reais + **deep-link para o painel do módulo**
   (Threat/Auditorias/Compliance/Backup/Zero Trust/Cyber/Fraud/Identity/Incident —
   os 5 "tabs por módulo" da spec ficam aqui, cada card abre o painel dedicado).
3. **Alertas** — alertas de nível SOC (degradação, incidentes correlacionados, risco abrupto)
   com módulos envolvidos.
4. **Incidentes** — visão consolidada (referência ao módulo dono; o SOC não altera a decisão).
5. **Timeline Global** — union do barramento das 9 origens + SOC, com cor por estado do módulo.
6. **Estatísticas** — série 14 dias (OSS/ORS/GHS/ECS + MTTR/MTTC/RPO/RTO + incidentes/alertas/disponibilidade).
7. **Config** — cron, modelo IA, módulos coordenados, playbooks executivos e a regra
   de ouro (coordena, nunca altera decisões).

## Mapeamento spec → painel

Os itens "Threat Intelligence / Auditorias / Compliance / Backup / Zero Trust" da spec
são consolidados no **Mapa de Saúde** (card + deep-link para o painel real de cada módulo),
evitando abas duplicadas e mantendo a fonte única em cada módulo dono.

## Guarda

Tudo admin (RLS + guarda nas funções); anon sem SELECT (42501). O painel é read-only —
nenhuma ação altera decisão de módulo; `soc_register_decision` é operação auditada à parte.
