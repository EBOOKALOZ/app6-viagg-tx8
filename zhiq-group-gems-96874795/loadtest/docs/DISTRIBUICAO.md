# ORION-480 — Estratégia de geração de carga distribuída

## Por que um único PC não serve para as etapas maiores

O ambiente local desta sessão tem **4 núcleos lógicos**. Isso é
suficiente para validar o gerador e os cenários nas etapas iniciais
(25k, possivelmente 50k, dependendo do resultado real — ver
`docs/EXECUCAO.md`), mas não escala sozinho até 900k VUs. k6 é eficiente
por VU (goroutines, não threads/processos do SO), mas ainda assim VUs
consomem CPU (execução do script JS embutido, TLS handshake, parsing de
resposta) e memória (buffers de conexão, estado do VU). Regra prática:
não assumir que "reduzir think time" ou "aumentar RAM" resolve o teto de
CPU — CPU é o recurso que primeiro satura ao empilhar VUs num único host.

## Como diferenciar "limite do PC/gerador" de "limite da aplicação"

Este é um critério explícito do ORION-480 (não declarar app como
gargalo se o gerador for o gargalo). Sinais de que o **gerador** (não a
aplicação) está saturado:

- CPU do processo `k6` em ~100% em todos os núcleos, enquanto a taxa de
  erro HTTP e a latência do lado do servidor (medida independentemente,
  ex. painel do Supabase) permanecem normais.
- k6 reporta `dropped_iterations` > 0 (não conseguiu nem iniciar a
  iteração no tempo esperado) — isso é limite do gerador, não da app.
- Latência medida pelo k6 sobe, mas o tempo de resposta do lado do
  Supabase (logs/dashboard) não acompanha — indica fila local no
  gerador, não no servidor.
- `vus` efetivo relatado pelo k6 fica consistentemente abaixo do `vus`
  alvo configurado.

Sempre coletar as duas pontas: métricas do k6 (cliente) **e** métricas do
Supabase/staging (servidor) — ver `docs/LIMITES.md` para a matriz
completa de "quem registra o quê".

## Opções de geração distribuída (para quando o teto local for atingido)

Nenhuma destas opções deve ser contratada/provisionada sem autorização
explícita — isto é só o desenho técnico, não uma ação.

### Opção A — k6 Cloud (SaaS oficial do k6)
- Prós: geração distribuída gerenciada, sem provisionar infraestrutura
  própria; agregação de resultados automática.
- Contras: custo por VU-hora; dados trafegam por infraestrutura de
  terceiro (aceitável pois o alvo já é staging com dados sintéticos, mas
  ainda assim considerar antes de contratar).
- Uso: mesmo script `k6/main.js`, rodado com `k6 cloud` em vez de
  `k6 run` (requer conta e token).

### Opção B — múltiplas instâncias k6 autogeridas (self-hosted)
- Provisionar N máquinas (VMs em nuvem ou containers), cada uma rodando
  `k6 run` com uma fração do total de VUs (`USERS_ETAPA / N` por
  instância), todas apontando para o mesmo `BASE_URL`/`SUPABASE_URL` de
  staging.
- Agregação de resultado: cada instância gera seu próprio
  `summary-<etapa>-<instancia>.json` (via `handleSummary` de `main.js`,
  ajustando `STAGE_LABEL` para incluir o índice da instância); somar
  `http_reqs`/`checks` e recalcular percentis é necessário — k6 puro
  não agrega P95/P99 entre instâncias automaticamente (percentis não são
  somáveis; requer dados brutos ou uma ferramenta de agregação como
  `k6-operator` ou InfluxDB+Grafana com `k6 run --out`).
- Requer que cada máquina geradora tenha, ela mesma, capacidade de rede/
  CPU suficiente para sua fração — não resolve o problema, só o
  particiona; ainda assim aplicar o mesmo diagnóstico de "gerador vs.
  app" por instância.

### Opção C — k6-operator em Kubernetes
- Para times que já operam um cluster K8s: o `k6-operator` distribui uma
  execução entre múltiplos pods automaticamente, com output agregado via
  Prometheus/InfluxDB.
- Faz sentido só se já existir cluster K8s disponível para staging; não
  recomendar provisionar um cluster novo só para este teste sem decisão
  explícita de custo/benefício.

### Recomendação de sequenciamento

1. Rodar **25k e 50k localmente** (1 PC) — objetivo é validar o gerador e
   os cenários, não ainda medir o teto real da aplicação.
2. Em **100k**, já esperar precisar de pelo menos 2-3 instâncias
   distribuídas (Opção B) ou k6 Cloud (Opção A), dependendo do que a
   etapa de 50k local mostrar sobre uso de CPU do gerador.
3. Escalar o número de instâncias/geradores proporcionalmente ao alvo de
   VUs de cada etapa seguinte, sempre validando que o gerador não é o
   gargalo antes de atribuir qualquer degradação à aplicação.

## Rede local como possível gargalo adicional

Independente de CPU, uma única conexão de internet doméstica/escritório
pode saturar (upload/download, NAT/conntrack do roteador) bem antes de
900k conexões simultâneas. Isso é outro motivo para não tentar gerar as
etapas grandes de um único ponto de rede — mover para infraestrutura de
nuvem (Opção A/B/C) também resolve isso incidentalmente.
