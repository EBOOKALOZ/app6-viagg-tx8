# ORION-480 — Checklist de pré-requisitos de staging

Nenhum item deste checklist foi executado por esta preparação — são
pré-condições a satisfazer por decisão/ação explícita do usuário antes da
primeira execução real (mesmo a de 25k).

## 1. Projeto Supabase de staging existe e está isolado de produção

- [ ] Projeto Supabase separado de `broifhfqmnzqoongtokm.supabase.co`
      criado (ou identificado, se já existir).
- [ ] Confirmar que o schema/migrations de staging estão espelhados a
      partir de `supabase/migrations/` (mesma estrutura de tabelas, RLS,
      RPCs, rate limits) — sem isso os cenários vão falhar com 404/42883
      (função/tabela inexistente) em vez de medir capacidade real.
- [ ] Confirmar que staging **não** tem replicação/sync com produção que
      poderia vazar dados sintéticos de volta, nem vice-versa.

## 2. Credenciais de staging

- [ ] `SUPABASE_URL` de staging obtido.
- [ ] `SUPABASE_ANON_KEY` de staging obtido (nunca a `service_role` key).
- [ ] `BASE_URL` do frontend apontando para um deploy do app que fala com
      esse mesmo projeto de staging (não o `.env` de produção do
      repositório).

## 3. Pool de usuários sintéticos de teste

- [ ] Decidir o tamanho do pool (`TEST_USER_POOL_SIZE`, default 2000) —
      recomenda-se que o pool seja bem menor que o total de VUs (VUs
      reaproveitam contas, o que é esperado e realista: usuários reais
      também reabrem sessão).
- [ ] Criar os usuários em staging com padrão prefixível e
      reconhecível, ex.: `loadtest+000001@example.invalid` ...
      `loadtest+002000@example.invalid`, todos com a mesma senha
      sintética fixa (`TEST_USER_PASSWORD`).
- [ ] Confirmar que o domínio de e-mail usado (`example.invalid` é
      reservado pela RFC 2606 para esse fim) não dispara envio real de
      e-mail de confirmação/boas-vindas em staging (ou que o envio está
      mockado/desativado nesse ambiente).
- [ ] Confirmar que a RPC pós-login `ensure_base_profile_and_wallet`
      (ver `src/contexts/AuthContext.tsx`) roda sem erro para esses
      usuários sintéticos (perfil + wallet base precisam existir para os
      cenários de wallet/veículos/leilões autenticados funcionarem).

## 4. Dados de seed (produtos, veículos, leilões, perfis/lojas)

- [ ] Gerar um lote de registros sintéticos em staging para cada domínio
      usado pelos cenários (ver `config/seed-data.example.json` para o
      shape esperado):
  - `products` — IDs de anúncios de teste (para `/produto/:id`)
  - `vehicles` — IDs de `vehicle_listings` de teste
  - `auctions` — IDs de `auction_listings` de teste, **ativos** (status
    que aceite lance), com pelo menos alguns tendo lance mínimo/incremento
    configurado de forma que `place_auction_bid` não rejeite por regra de
    negócio alheia à carga (ex.: leilão encerrado)
  - `profiles` — IDs/slugs de loja/perfil público de teste
- [ ] Preencher esses IDs em `loadtest/config/seed-data.staging.json`
      (copiar de `seed-data.example.json`) e apontar `SEED_DATA_FILE`
      para esse arquivo.
- [ ] Confirmar que os dados de seed são claramente marcados como teste
      (nome/descrição prefixados, ex. `[LOADTEST]`) para facilitar limpeza
      posterior e evitar confusão com dados reais de staging (se staging
      também for usado para QA manual por outras pessoas).

## 5. Doações — confirmar caminho de escrita antes de habilitar

- [ ] Ler `src/` (grep `convenio_donations`) para confirmar qual é o
      fluxo real de criação de doação usado pelo frontend hoje (RPC
      dedicada? insert direto? fluxo de pagamento?). O cenário
      `scenarios/doacoes.js` está com escrita desabilitada por padrão
      (`ENABLE_DONATION_WRITE=no`) até essa confirmação — ver comentário
      no arquivo.

## 6. Observabilidade do lado do servidor

- [ ] Acesso ao dashboard do projeto Supabase de staging (Database →
      Reports, Edge Functions → Logs, Realtime → Inspector) para coletar,
      durante cada etapa, as métricas de servidor que o k6 não vê:
      conexões de banco ativas, CPU/RAM do Postgres, latência de query,
      taxa de erro de Edge Function, throughput Realtime.
- [ ] Confirmar plano/tier do projeto Supabase de staging e seus limites
      conhecidos (conexões simultâneas do pooler, cota de Edge Function
      invocations, cota de Realtime concurrent connections) — esses
      limites de **infraestrutura externa** (categoria D em
      `docs/LIMITES.md`) precisam ser conhecidos de antemão para não
      serem confundidos com falha da aplicação.

## 7. Gerador de carga

- [ ] k6 instalado no(s) ambiente(s) que vão gerar a carga (não vem
      instalado neste ambiente de desenvolvimento — instalar é uma ação
      que requer autorização, não foi feita aqui).
- [ ] Para etapas acima do que 1 PC aguenta (ver `docs/DISTRIBUICAO.md`):
      decisão tomada sobre k6 Cloud vs. instâncias self-hosted vs.
      k6-operator, e infraestrutura correspondente provisionada.

## 8. Plano de limpeza pós-teste

- [ ] Script/checklist para remover os usuários e registros sintéticos
      de staging após a campanha de testes (ou aceitar deixá-los,
      documentado, se staging for descartável).
