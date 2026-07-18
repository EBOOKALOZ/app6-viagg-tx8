# ORION-AI-74 — Dashboards

## Admin — ORION Trust Center (`/admin/orion-trust-center`)

Arquivo: `src/pages/admin/AdminOrionTrustCenter.tsx` · Sidebar: "Trust & Reputation (74)" badge TRUST.
Fonte: `rep_dashboard()` + `rep_alerts_api('aberto')` + `orion_rep_recommendations` (RLS admin).

- **Header:** Trust Score médio, usuários avaliados, Elite/Excelente, em observação, verificados, alertas abertos, selos concedidos; banner de **lacunas declaradas**.
- **Visão Geral:** distribuição pelas 6 faixas; Trust por cidade; evolução 30 dias (1 snapshot/dia); telemetria do último tick (duração, contagens).
- **Rankings:** top vendedores e top compradores (papel real, com subscore do papel).
- **Alertas:** queda rápida, fraude potencial (AI-41), reclamações recorrentes, melhora significativa.
- **Recomendações:** com aviso fixo "o AI-74 recomenda — decisão é humana".

## Usuário — Minha Reputação (`/minha-reputacao`)

Arquivo: `src/pages/public/MinhaReputacao.tsx` (rota protegida em `generalRoutes`).
Fonte única: `rep_user_dashboard()` (o usuário só enxerga a si mesmo — guarda server-side).

- Gauge do Trust Score + nível (Elite→Alto Risco).
- Evolução histórica (barras por dia).
- **O que compõe o seu score:** 7 pilares com barra e "sem histórico ainda" quando o pilar não tem base.
- **Verificações:** e-mail, telefone, documento, facial (**"em breve"** — indisponível declarado), identidade (AI-42).
- **Selos:** conquistados + disponíveis (com a regra na dica).
- **Como melhorar:** lista dinâmica derivada das verificações pendentes + recomendações abertas.
