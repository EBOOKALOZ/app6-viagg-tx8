# ORION-480 — Escolha de ferramenta: k6 vs Artillery

## Decisão: **k6**

## Contexto da avaliação

O alvo é um SPA React servido estaticamente + Supabase (PostgREST, GoTrue,
Edge Functions em Deno, Realtime via WebSocket/Phoenix Channels). A carga
não é só HTTP request/response simples: inclui autenticação com token
Bearer reaproveitado entre requisições, RPCs PostgREST com payload JSON,
regras de negócio com rate limit próprio (ex.: leilão, 5 lances/10s — ver
`supabase/migrations/20260723_auction_enterprise_security_bidengine_oficial.sql`),
e canais Realtime via WebSocket. A progressão pretendida (25k → 900k VUs)
exige também geração distribuída em múltiplas máquinas/instâncias, não
apenas um processo único.

## Comparação nos critérios que importam para este projeto

| Critério | k6 | Artillery |
|---|---|---|
| Modelo de execução | Binário Go único, VUs como goroutines — baixíssimo overhead por VU, essencial para chegar perto de 900k VUs com poucas máquinas geradoras | Node.js/worker threads — overhead por VU maior (VM JS + event loop), precisaria de mais máquinas geradoras para o mesmo número de VUs |
| Scripting | JavaScript ES6 (subset, sem Node APIs) — cenários deste repo (autenticação, RPC, lógica condicional de rate limit) ficam naturais | JavaScript também, mas o modelo declarativo YAML é o caminho "feliz"; lógica condicional fica mais forçada, geralmente empurrada para hooks JS de qualquer forma |
| Thresholds / critério de parada automatizado | `thresholds` nativo com `abortOnFail` — aborta a execução sozinho ao violar um limite, exatamente o mecanismo que a regra "PARAR imediatamente" deste teste precisa | Existe `ensure`/plugins, mas o abort automático de execução é menos direto e depende mais de orquestração externa |
| WebSocket / Realtime | Suporte nativo (`k6/ws`, `k6/experimental/websockets`) | Suporte via engine `ws`, funcional mas com menos exemplos maduros para o padrão Phoenix Channels do Supabase Realtime |
| Métricas customizadas | `Trend`/`Counter`/`Rate` de primeira classe, granularidade por tag — usado extensivamente em `k6/lib/metrics.js` desta suíte | Possível via custom metrics, mas a ergonomia e a integração com thresholds é menos direta |
| Execução distribuída em larga escala | k6 Cloud (SaaS) ou `k6 run` paralelo coordenado externamente (múltiplas instâncias + agregação de resultado); também roda bem em containers/K8s (k6-operator) | Artillery Cloud existe, mas o ecossistema de operação distribuída self-hosted é menos maduro que o do k6 |
| Saída/relatório programável | `handleSummary()` — permite gerar JSON estruturado por etapa (usado em `main.js` para `loadtest/results/summary-<etapa>.json`, essencial para comparar etapa a etapa como a regra de progressão exige) | Tem relatórios (`--output`), mas menos flexível para essa customização |

## O que pesou mais na decisão

1. **Overhead por VU.** Para uma meta de 900k VUs simultâneos, a diferença
   de footprint por VU entre um binário Go e uma VM JS por worker se
   traduz diretamente em quantas máquinas geradoras são necessárias (ver
   `docs/DISTRIBUICAO.md`). k6 reduz esse custo de infraestrutura.
2. **`thresholds` com `abortOnFail` nativo.** A regra fundamental do
   ORION-480 é "não avançar, parar automaticamente se degradar". k6 tem
   esse mecanismo embutido no motor de execução, não como camada externa.
3. **Regras de negócio com estado (rate limit de leilão).** Precisamos
   diferenciar HTTP 429 esperado (rate limit de negócio) de erro real do
   sistema — isso exige lógica no cenário (ver `scenarios/leiloes.js`), e
   o modelo de scripting do k6 (função JS imperativa por VU) é mais direto
   para isso do que o modelo declarativo do Artillery.
4. **Realtime.** O Supabase Realtime é usado extensivamente no app (canais
   de leilão, corridas, wallet, notificações — ver mapeamento em
   `docs/ARQUITETURA.md`). O suporte a WebSocket do k6 é first-class.

## Quando Artillery seria preferível (não é o caso aqui)

Artillery tende a vencer quando o teste é majoritariamente REST simples,
a equipe já tem scripts/plugins Artillery prontos, ou quando se quer
YAML declarativo para não-programadores editarem cenários. Nenhum desses
fatores se aplica a este projeto.
