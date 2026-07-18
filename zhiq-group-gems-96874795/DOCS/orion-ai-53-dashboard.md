# ORION-AI-53 — Dashboard `/admin/orion-aiops` (badge AIOPS)

Fonte única: `aiops_dashboard()` (refetch 30s). Arquivo: `src/pages/admin/AdminOrionAiops.tsx`.
Sidebar: grupo ORION → **AI Operations · AIOps** (ícone Monitor, badge **AIOPS**),
após Cost Optimization.

## Header

AOS (cor por faixa) + críticas · faixa: Runtime Health, Failure Risk, Automação %,
anomalias, serviços ruins, disponibilidade. Snapshot + tick */2.

## Abas (7 — cobrem os 11 itens da spec)

1. **Resumo** (Executive Dashboard) — 5 cards de score (AOS/RHS/FRS/OAS/APS); contadores
   (saúde geral, anomalias, críticas, serviços degradados, ações 24h, MTTR); banner de
   predições + nota de automação segura.
2. **Anomalias** — anomalias ativas com severidade/categoria/status + botão **RCA** por
   anomalia (causa provável, serviço, cadeia, impacto, prioridade, evidência) → cobre a aba
   "Root Cause" da spec.
3. **Predições** — predições de falha com barra de probabilidade, confiança, horizonte, justificativa.
4. **Ações & Automação** — ações automáticas seguras + recomendações (exigem aprovação) +
   políticas de automação (auto/aprovação/destrutiva) + playbooks (na aba Config) → cobre
   "Ações Automáticas" e "Playbooks".
5. **Infraestrutura** — saúde de runtime por serviço/categoria (RHS, sucesso %, latência) →
   cobre "Infraestrutura" e "Serviços".
6. **Estatísticas** — série 14 dias (AOS/RHS/FRS/OAS + anomalias/ações/MTTR/disponibilidade).
7. **Config** — cron, modelo, fontes reais, playbooks operacionais, regra de ouro.

## Mapeamento spec → painel

As 11 abas da spec (Resumo/Anomalias/Predições/Playbooks/Ações/Root Cause/Infraestrutura/
Serviços/Estatísticas/Histórico/Config) foram consolidadas em 7 abas coerentes: Root Cause
vive dentro de Anomalias (botão RCA), Playbooks dentro de Config, Serviços dentro de
Infraestrutura, Histórico dentro de Estatísticas.

## Guarda

Tudo admin (RLS + guarda nas funções); anon sem SELECT (42501). O painel é read-only;
a automação real é do motor (tick), sempre gated por política e nunca destrutiva.
