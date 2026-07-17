# ORION-AI-43 — Dashboard `/admin/orion-threat-intelligence` (badge THREAT)

Fonte única: `threat_dashboard()` (refetch 60s). Arquivo: `src/pages/admin/AdminOrionThreat.tsx`.
Sidebar: grupo ORION → **Threat Intelligence AI** (ícone Waypoints, badge **THREAT**),
logo após Identity & Access (AI-42).

## Header (7 painéis)

TIS (cor por faixa) · campanhas críticas · campanhas ativas · vulnerabilidades ·
correlações · nós no grafo · MTTC (min) · tendência 7d.

## Abas (5)

1. **Visão Geral** — 4 cards de score (TIS/CS/Risco médio/TRR); tabela de estatísticas
   7 dias (ameaças/campanhas/vulns/correlações/risco médio/MTTC); observáveis de maior
   risco (IOCs); lacunas declaradas.
2. **Threat Graph** — legenda por tipo de nó (cores); coluna de **nós** (por risco) e
   coluna de **arestas** (correlações) com **evidências JSON expandíveis**. Nota de
   lacuna (IP/dispositivo/sessão declarados).
3. **Campanhas** — cada campanha: severidade, CRS, tipo, status, evidências, janela
   temporal; botões **Mitigar / Resolver / Falso positivo** (`threat_mark_campaign`).
4. **Vulnerabilidades** — contadores (abertas/críticas/recorrentes/mitigadas) + lista
   com VIS, impacto, mitigação e nota de triagem.
5. **Correlações** — relações por tipo (barras) + correlações mais fortes (por peso)
   com evidências expandíveis.

## Ações no painel

- `threat_mark_campaign(id, status)` — ciclo humano de campanha (alimenta TRR).
- Guarda: tudo admin (RLS + guarda nas funções); anon sem SELECT (42501).
- Rollback por trace é operação de motor (`threat_rollback`) — auditada no bus.
