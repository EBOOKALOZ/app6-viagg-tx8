# ORION-AI-48 — Dashboard (/admin/orion-compliance)

Badge **COMPLIANCE** (ícone Scale). Fonte única `compliance_dashboard()`, refetch 60s, botão **Verificar agora**.

**Header:** CPS em destaque + tiles LCS/DRS/PRS/solicitações abertas/incidentes/retenção vencida.

**Abas:** 1) **Resumo** — 5 botões de IA (prompts `compliance.*`/`lgpd.*`/`privacy.*`) + controles com status/categoria e fórmula dos scores; 2) **LGPD & Direitos** — registrar solicitação (7 tipos) + lista com Analisar/Concluir (ciclo auditado); 3) **Registro de Tratamento** — 9 atividades com base legal/finalidade/origem/destino/retenção/tabelas (sem base legal = vermelho); 4) **Retenção** — política vs idade real medida + exceções legais; 5) **Incidentes** — tipo/severidade/status + selo "→ AI-45" quando encaminhado; 6) **Alertas & Estatísticas** — alertas 14d + contagem de evidências + comando da suíte (`SELECT compliance_selftest()`).

**Princípios visíveis:** nenhum dado pessoal é exibido (só contagens/ids truncados); descarte/exclusão é decisão humana — o painel registra e alerta.
