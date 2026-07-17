# ORION-AI-45 — Dashboard (/admin/orion-incident-response)

Badge **INCIDENT** (ícone Siren) no grupo ORION AI CENTER. Fonte única: `incident_dashboard()` (agregação pura). Refetch 45s. Botão **Responder agora** (`respond_to_incidents`).

## Header
Incidentes ativos em destaque + 6 tiles: hoje · críticos ativos · aguardando humano · MTTA · RTS · Recovery.

## Abas

1. **Resumo** — 5 botões de IA (resumo executivo, recomendar resposta, narrar timeline, prevenção, revisar classificação — prompts `incident.*` com contexto `incident_summary()`); resposta automática vs humana (30d); scores IRS/ICS/RTS/Recovery com fórmula.
2. **Ativos** — busca (título/trace) + lista de incidentes; clique abre o **detalhe inline**: timeline completa (momento/ator/descrição), ações com justificativa/resultado e botão **Rollback** (só reversíveis não revertidas), evidências imutáveis; botões Resolver/Fechar conforme o estado.
3. **Críticos** — mesmos cartões filtrados por severidade crítica.
4. **Playbooks** — passos numerados por categoria, ativo/automático, execuções, botão **alternar modo** (`incident_playbook_set`); nota: bloqueios herdam a política dos AI-40/42.
5. **Métricas & Histórico** — tabela diária (abertos/resolvidos/críticos/MTTA/MTTR/auto/humanas/sev. média), incidentes por módulo de origem, e o comando da suíte de testes (`SELECT incident_selftest()` — COMANDO TESTE).
6. **Notificações** — centro com confirmação de leitura (`incident_ack_notification`); não lidas destacadas.

## Princípios visíveis
- Toda ação exibe justificativa e resultado (`executada`/`negada_politica`/`declarada`/`revertida`).
- Timeline e evidências são imutáveis — o painel só lê.
- Ação crítica negada pela política aparece como `aguardando_humano` — decisão é sua, nunca da IA.
