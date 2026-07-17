# ORION-AI-40 — Dashboard (`/admin/orion-cyber-defense`)

Página: `src/pages/admin/AdminOrionCyberDefense.tsx` · badge **SECURITY** · ícone `ShieldBan` (distinto do `ShieldAlert` do AI-24) · lazy em `lazyPages.ts` · rota em `adminRoutes.tsx` · item de menu em `AdminSidebar.tsx` (logo abaixo de "Security AI"). Read-only; `refetchInterval: 45s`; fonte única `cyber_dashboard()`.

## Header
Threat Score em destaque + 6 stats: TS, RS, SH, AC, Ataques hoje, Disponibilidade.

## Abas (8)
1. **Visão Geral** — botões de IA (explicar ataque/risco/mitigação/relatório executivo via Gateway), scores (TS/RS/SH/AC + fórmula), situação (ataques hoje/24h, críticos, alertas abertos, bloqueios ativos, disponibilidade), KPIs (FPR/MTTR/alertas 30d/resolvidos), e lista de **alertas priorizados** com recomendação.
2. **Ataques** — por tipo / severidade / módulo (7d).
3. **Tempo Real** — linha do tempo dos últimos eventos + críticos (severidade, tipo, descrição, score, horário).
4. **Mapa** — origem por cidade (30d) + nota declarada (geo por IP exige instrumentação).
5. **IP Intelligence** — IPs bloqueados + nota declarada (ASN/país/histórico exigem enriquecimento externo).
6. **Usuários** — autenticação suspeita (falhas de login, signups repetidos, recovery) + visitantes bot/scraping.
7. **APIs** — Gateway por módulo (chamadas/erros/retries), latência média, endpoints web suspeitos.
8. **IA** — ameaças contra a IA (prompt injection/jailbreak), flood de tokens 24h.

## Rodapé
Assinatura do módulo: v1.0 · ORION-AI-40 · abre o Security Ecosystem · namespace `orion_cyber_*` · detecção incremental (tick 1/min + edge deployada) · evidência obrigatória · auditoria imutável · IA só via Gateway.

## Padrão visual
Segue os demais painéis ORION (header gradiente vermelho, cartões arredondados, chips). Componentes auxiliares locais: `Stat`, `Card`, `Chips`.
