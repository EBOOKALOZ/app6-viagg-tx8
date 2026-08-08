# ORION-480 — Métricas obrigatórias, thresholds e diferenciação de limites

## Métricas obrigatórias por etapa e onde coletá-las

| Métrica | Fonte | Onde aparece neste kit |
|---|---|---|
| VUs configurados vs. VUs efetivamente ativos | k6 (`vus`, `vus_max`) | `handleSummary` em `main.js`; k6 também expõe em tempo real via `--out` ou UI do k6 Cloud |
| Duração da etapa | config da etapa | `progression.json` / `STAGE_LABEL` |
| RPS / throughput | k6 (`http_reqs` rate) | `textSummary()` em `main.js` |
| P50 / P95 / P99 | k6 (`http_req_duration`) | `summaryTrendStats` em `options`, impresso em `textSummary()` |
| Taxa de sucesso / erro | k6 custom (`business_success_rate`) | `lib/metrics.js` |
| HTTP 4xx / 5xx | k6 custom (`http_4xx_total`, `http_5xx_total`) | `lib/metrics.js` |
| Timeouts | k6 custom (`http_timeouts_total`, status 0) | `lib/metrics.js` |
| CPU / RAM (do gerador) | SO do host gerador (`top`/Task Manager/`docker stats`) | **fora do k6** — registrar manualmente ou via script auxiliar no host gerador, ver nota abaixo |
| Rede (do gerador) | SO do host gerador | idem |
| Conexões | k6 (`http_req_connecting`, TCP) + Supabase dashboard (conexões do pooler) | combinar as duas pontas |
| Utilização do banco | Supabase Dashboard → Database → Reports | fora do k6, servidor |
| Latência do banco | Supabase Dashboard / logs de query lenta | fora do k6, servidor |
| Edge Functions (erros, duração) | Supabase Dashboard → Edge Functions → Logs/Invocations | fora do k6, servidor |
| Realtime (conexões, mensagens) | k6 custom (`realtime_connect_duration`, `realtime_message_latency`, `realtime_connect_failures_total`) + Supabase Dashboard → Realtime | ambas as pontas |
| Filas / gargalos (ex. `postador_lotes_board`, `auction_bid_rate`) | consulta direta ao staging (fora do k6) | não coletado automaticamente por este kit — checar manualmente durante/após a etapa |
| Rate limits atingidos | k6 custom (`business_rate_limited_total`, HTTP 429) | `lib/metrics.js` — **não é erro do sistema**, é rate limit de negócio funcionando (ver `scenarios/leiloes.js`) |
| Recuperação pós-teste | comparar métricas do servidor nos 5-10min após `rampDown` chegar a 0 | processo manual, ver seção "Teste de recuperação" abaixo |

**Nota sobre CPU/RAM do gerador**: k6 não instrumenta o próprio host por
padrão. Para etapas locais, rodar em paralelo um monitor simples (Windows:
Task Manager/Performance Monitor; ou `Get-Counter` via PowerShell) e
anotar manualmente no relatório da etapa. Automatizar isso (ex. script
que faz sampling de CPU/RAM do processo `k6` a cada N segundos e salva
junto do summary) é uma melhoria natural a adicionar quando a primeira
execução real acontecer — não implementado aqui para não expandir escopo
além do pedido (preparação, sem execução).

## A/B/C/D — Diferenciação obrigatória de limites

| Categoria | Como identificar | Exemplos de sintoma |
|---|---|---|
| **A. Limite do computador local** | CPU do host gerador perto de 100%, mas sem correlação com erro/latência do servidor | Fan a todo vapor, k6 process em 100% CPU, SO com swap alto |
| **B. Limite do gerador de carga (k6)** | `dropped_iterations > 0`, `vus` efetivo < `vus` alvo, mesmo com CPU do host ainda disponível | k6 não consegue abrir conexões rápido o suficiente, atinge limite de file descriptors/portas efêmeras do SO |
| **C. Limite da aplicação** | Erro 5xx crescente, latência subindo *junto* com métricas do servidor (Supabase Dashboard) subindo também, enquanto o gerador (A/B) está confortável | Timeout de query, Edge Function com erro, RLS/lock contention |
| **D. Limite do Supabase/infraestrutura externa** | Erro 429 do próprio Supabase (não do rate limit de negócio da aplicação), erro de cota de plano, limite de conexões do pooler documentado no plano contratado | Mensagem de erro explícita de quota do Supabase, não um 5xx genérico da aplicação |

**Regra**: nunca declarar "aplicação falhou" sem primeiro descartar A e B.
Sempre registrar no relatório da etapa qual categoria (A/B/C/D) explica
cada anomalia observada — inclusive quando a conclusão for "não foi
possível determinar com certeza" (preferível a uma atribuição errada).

## Critérios de parada (thresholds configuráveis em `main.js`)

Variáveis de ambiente (default entre parênteses):

- `THRESHOLD_ERROR_RATE` (0.05 = 5%) — acima disso, `business_success_rate`
  aciona `abortOnFail`.
- `THRESHOLD_P95_MS` (2000ms) e `THRESHOLD_P99_MS` (5000ms) — thresholds
  informativos de latência (não abortam sozinhos por padrão; ajustar
  `abortOnFail` manualmente em `main.js` se quiser esse comportamento
  mais agressivo numa etapa específica).
- `THRESHOLD_TIMEOUT_RATE` (0.02 = 2%) — acima disso, aborta.
- `THRESHOLD_5XX` implícito via `http_5xx_total` proporcional a `USERS`.

Além dos thresholds automatizados, a regra do ORION-480 exige **parada
humana** diante de: avalanche de timeouts, saturação de banco, saturação
do gerador, perda de estabilidade, comportamento inconsistente, falha de
segurança, corrupção/inconsistência de dados, crescimento descontrolado
de filas, ou rate limit externo (categoria D) que invalide o resultado.
Nenhum desses é 100% automatizável — o operador humano deve revisar o
`textSummary()` e as métricas de servidor antes de aprovar a próxima
etapa, mesmo se os thresholds automatizados não tiverem disparado.

## Teste de recuperação (pós-etapa)

Após o `rampDown` chegar a 0 (VUs = 0), aguardar uma janela (recomendado:
5-10min) e comparar contra a baseline pré-teste:

- CPU/RAM do servidor (Supabase Dashboard) voltou ao patamar anterior?
- Conexões de banco ativas voltaram ao normal (sem conexões "presas")?
- Filas (ex. `postador_lotes_board`, filas de Edge Function) drenaram?
- Latência de query voltou ao baseline?
- Há erros residuais nos logs após a carga cessar?
- O sistema está estável (sem crashes, sem reinícios de conexão em loop)?

Registrar esses pontos no relatório da etapa antes de decidir avançar.
