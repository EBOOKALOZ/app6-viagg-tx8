# ORION-AI-58 — Digital Twin AI v1.0

**Missão:** gêmeo digital VIVO da Viagg-TX8 para simular mudanças ANTES de produção — carga, incidentes, deploy, finanças — com **isolamento absoluto** (simulação nunca toca produção, provado no selftest). Premissas sempre declaradas; nunca promete.

**Chave:** `digital_twin` · **Painel:** `/admin/orion-digital-twin` (badge **TWIN**) · **Modelo:** gpt-5-mini · **Cron:** `orion_twin_tick` a cada 30 min (sync + compare)

## Como é REAL (não é vaporware)
- **Modelo digital auto-descoberto**: `create_digital_twin()` popula `orion_twin_entities` do ambiente real (módulos do AI-50, crons, infra, integrações declaradas) — **131 entidades** no 1º sync.
- **Baselines medidas** (a física do gêmeo): latência do Gateway, custo/dia (AI-52), DB/storage, usuários/cliques, MTTR (AI-45), crons ativos.
- **Simulações determinísticas** com premissas declaradas nos próprios resultados:
  - `simulate_load(n)` — modelo analítico (custo 30% fixo + 70% proporcional; DB linear; latência log-degrada) → fator de escala, custo/latência/DB projetados, **gargalos** por faixa. Sem gerador de carga externo (declarado).
  - `simulate_incident(tipo)` — **propaga pelo grafo REAL de dependências do AI-50** (2 níveis) + tempos dos ticks reais (AI-40/45) + MTTR. Um "banco indisponível" afeta **61 módulos**.
  - `simulate_finance(cenario)` — **DELEGA ao `simulate_future` do AI-55** (não redefine) + custo do AI-52.
  - `simulate_deployment(objeto)` — **relatório de risco real**: colisão de namespace (tabela existe?), dependências no registro AI-50, findings críticos abertos (AI-44), crons vermelhos (AI-50), rollback declarado → score 0-100 + veredito liberado/revisar/bloquear.
  - `what_if_analysis(pergunta)` — roteia para o simulador certo.
- **Camada 12** `compare_prediction()` — previsto×real espelhando o backtest do AI-52/55 (precisão amadurece com histórico).

## Cenários versionados + runs imutáveis
`orion_twin_scenarios` (nome+versão = reprodutível) e `orion_twin_runs` (params+baselines congelados no snapshot, sem UPDATE/DELETE). Mesmo cenário+baseline → mesmo resultado.

## Scores
**THS** (Twin Health) = 60·frescor das entidades + 4·baselines (máx 40) · **SS** (Simulation) = 10·runs 7d + (50−erro médio%). 1ª medição: THS 96, SS 90.

## COMANDO TESTE
`SELECT twin_selftest()` — **15/15**, incluindo o check **`isolamento_producao`** (conta auth.users / pay_payment_orders / orion_ai_log antes e depois de TODAS as simulações — idênticos).

## Lacunas declaradas
Gerador de carga real (100k+ usuários = teste de infra), CPU/memória/rede (sem métrica SQL), réplica física de Firebase/GCloud/Vercel (entidades declaradas), edge de simulação distribuída (motor no banco basta no volume atual).
