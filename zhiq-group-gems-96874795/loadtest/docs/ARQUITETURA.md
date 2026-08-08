# ORION-480 — Arquitetura do teste de carga

## Escopo e alvo

Este teste **nunca** roda contra produção
(`broifhfqmnzqoongtokm.supabase.co`). Alvo sempre é um projeto Supabase
de **staging**, isolado, com dados sintéticos — ver
`docs/CHECKLIST_STAGING.md`. `k6/lib/guard.js` recusa iniciar se detectar
o host de produção ou a ausência de indícios de staging.

## Estrutura de diretórios

```
loadtest/
  k6/
    main.js              # script principal: options, thresholds, dispatcher
    lib/
      guard.js            # proteção anti-produção (roda no init context)
      config.js            # leitura central de env vars
      metrics.js           # métricas customizadas (Trend/Counter/Rate)
      auth.js               # login sintético via GoTrue REST
      seedData.js            # pool de IDs sintéticos de staging (SharedArray)
    scenarios/
      index.js             # distribuidor ponderado de cenários
      navegacao.js, pesquisa.js, anuncios.js, veiculos.js, leiloes.js,
      convenios.js, doacoes.js, wallet.js, api.js, perfis.js,
      autenticacao.js, realtime.js
  config/
    progression.json       # matriz oficial 25k -> 900k por etapa
    .env.example            # template de variáveis (sem segredos reais)
    seed-data.example.json   # shape do arquivo de seed
  docs/
    ARQUITETURA.md (este arquivo)
    FERRAMENTA-K6-VS-ARTILLERY.md
    DISTRIBUICAO.md
    CHECKLIST_STAGING.md
    EXECUCAO.md
    LIMITES.md
  results/                 # saída dos summaries por etapa (gerado em runtime)
  run-stage.sh              # monta/roda o comando k6 de uma etapa da matriz
```

## Fluxo de um VU (cenário HTTP)

1. `main.js` sorteia um cenário conforme a tabela de pesos
   (`scenarios/index.js`, sobrescrevível por `WEIGHT_<NOME>`).
2. Se o cenário exige autenticação, faz login sintético
   (`lib/auth.js` → GoTrue REST, pool de usuários pré-provisionados).
3. Executa o cenário (leitura, e opcionalmente escrita controlada por
   `WRITE_RATIO`).
4. Registra métricas customizadas via `lib/metrics.js`.
5. `sleep` de jitter entre iterações — evita VUs sincronizados
   artificialmente (que gerariam picos periódicos irreais).

Cenário Realtime roda em executor `k6` separado (`realtimeUser`), com um
teto de VUs proporcional (`REALTIME_VU_RATIO`, default 2% do total) — ver
justificativa em `scenarios/realtime.js`.

## Distribuição de comportamento (pesos default)

| Cenário | Peso default | Requer auth | Natureza |
|---|---|---|---|
| navegacao | 0.30 | não | leitura |
| pesquisa | 0.15 | não | leitura |
| anuncios | 0.15 | não | leitura |
| veiculos | 0.10 | sim (p/ escrita) | leitura + escrita controlada |
| leiloes | 0.10 | sim (p/ lance) | leitura + escrita controlada (rate-limited) |
| perfis | 0.08 | não | leitura |
| convenios | 0.05 | não obrigatório | leitura |
| wallet | 0.04 | sim | leitura |
| doacoes | 0.02 | sim (se escrita habilitada) | leitura + escrita opcional |
| api | 0.01 | não obrigatório | leitura (Edge Function leve) |

**Registro de execução obrigatório**: toda execução real deve documentar
a distribuição efetivamente usada (pesos podem ter sido sobrescritos via
`WEIGHT_*`) no relatório da etapa — ver `docs/EXECUCAO.md`.

## Fora de escopo (deliberado)

- **Pagamento real** (`payments-charge`, `promotion-checkout`): envolvem o
  gateway Mercado Pago mesmo em staging. Só incluir se houver confirmação
  de sandbox do gateway configurado — não é assumido por padrão.
- **Webhooks** (`payments-webhook`, `promotion-payment-webhook`,
  `send-auth-email`): são endpoints que o *provedor externo* chama, não o
  usuário. Simular tráfego de usuário contra eles não testa nada
  relevante e pode violar a validação de assinatura.
- **Edge Functions de IA em alto volume** (`orion-ai-gateway`, `ai-chat`):
  têm rate limit e custo por chamada a provedor de IA externo — carga alta
  aqui testaria o limite do provedor terceiro, não a capacidade do app.
  Cenário `api.js` usa deliberadamente `get-mapbox-token` (leve, sem custo
  de terceiro por chamada) como representante de "chamada de API".
- **Workers assíncronos internos** (`ridv-worker`, `package-worker`):
  disparados por trigger/cron, não por requisição de usuário.

## Segurança do script (resumo — detalhe em `k6/lib/guard.js`)

- Recusa rodar se `BASE_URL`/`SUPABASE_URL` baterem com hosts de produção
  conhecidos (lista fixa em código, não em env — não pode ser burlada
  só por omitir uma env var).
- Recusa rodar se nenhum indício de staging/dev/local/test aparecer no
  host, a menos que `I_CONFIRM_STAGING=yes` seja passado explicitamente.
- Exige `I_UNDERSTAND_THIS_GENERATES_TRAFFIC=yes` para confirmar
  intenção consciente antes de qualquer VU iniciar.
- Recusa rodar se variáveis de credencial real/service_role forem
  fornecidas (`SUPABASE_SERVICE_ROLE_KEY`, `REAL_USER_EMAIL`, etc.).
