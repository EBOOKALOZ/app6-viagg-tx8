# PARECER DE CERTIFICAÇÃO ORION ENTERPRISE — Módulo Fretes V2
**Data:** 2026-07-23 · **Tipo:** auditoria estática de reprodutibilidade + verificação de integridade
**Complementa:** `DOCS/certificacao-orion-fretes-v2-2026-07-23.md` (auditoria funcional/financeira)

---

## 0. Escopo e método — o que foi verificado e COMO

Este parecer é honesto sobre seu método. As verificações abaixo se dividem em duas classes:

- **[VERIFICADO-CÓDIGO]** — confirmado por análise estática do repositório (leitura de todas as
  migrations em ordem de aplicação, grep de dependências, checagem de idempotência linha a
  linha). Não requer banco. **É prova real e suficiente para reprodutibilidade estrutural.**
- **[PENDENTE-EXECUÇÃO]** — requer rodar SQL num Postgres (produção ou `supabase db reset`),
  o que **não é executável neste ambiente** (sem banco local, sem acesso a produção). Para
  esses itens, entreguei scripts prontos em `DOCS/orion-fretes-v2-verificacao-enterprise.sql`
  — você roda e cola o resultado. **Não afirmo tê-los executado.**

Rejeitei deliberadamente inventar saídas de `db reset`/`EXPLAIN ANALYZE`. Uma certificação que
fabrica evidência não certifica nada.

---

## 1. Reprodutibilidade — ordem de aplicação [VERIFICADO-CÓDIGO ✅]

Auditoria estática da ordem lexicográfica (a que o Supabase usa) de TODAS as migrations,
rastreando, para cada objeto-chave, a 1ª migration que o CRIA vs. a 1ª que o USA.

**Resultado: 0 (zero) falhas "usa-antes-de-criar"** nas cadeias pay_*, promotion_* e freight_*.

| Objeto | Criado por | 1º uso | Veredicto |
|--------|-----------|--------|-----------|
| enums pay_* (5) | `pay_phase1_00` | `pay_phase1_00`/`_02` | ✅ |
| pay_financial_accounts | `pay_phase1_00` | `pay_phase1_02` | ✅ |
| pay_ledger_entries | `pay_phase1_00` | `pay_phase1_02` | ✅ |
| pay_idempotency_registry | `pay_phase1_00` | `pay_phase1_02` | ✅ |
| pay_post_transaction / pay_get_or_create_account | `pay_phase1_03` | `_03`/`_07` | ✅ |
| promotion_packages / promotion_purchases | `049b_promotion_core_base` | `050_advertiser_daily_usage` | ✅ |
| freight_commission_settings (+ seed id=1) | `freight_quotes` | `20260723_freight_*` | ✅ |
| has_role / app_role / is_admin / profiles / merchant_stores | migrations base 2026-01/03 | posteriores | ✅ |

As 2 migrations de base criadas na certificação anterior foram confirmadas na posição correta:
`pay_phase1_00` roda antes de `_02`; `049b` roda antes de `050`.

---

## 2. Idempotência das migrations base [VERIFICADO-CÓDIGO ✅]

Ambas podem rodar infinitas vezes sem efeito colateral (seguras como NO-OP em produção):

**`pay_phase1_00`:** enums via `DO $$ IF NOT EXISTS(pg_type...) CREATE TYPE $$` (padrão correto —
`CREATE TYPE` não tem `IF NOT EXISTS` nativo); tabelas `CREATE TABLE IF NOT EXISTS`; índices
`CREATE INDEX IF NOT EXISTS`; **zero** `CREATE POLICY` (RLS delegada à `_02`); **zero**
`ALTER TYPE ADD VALUE`. Nenhuma linha não-idempotente.

**`049b_promotion_core_base`:** 2× `CREATE TABLE IF NOT EXISTS`; 2× `CREATE INDEX IF NOT EXISTS`;
2× `CREATE POLICY` **cada uma precedida de `DROP POLICY IF EXISTS`**. Nenhuma linha não-idempotente.

### Bug de reprodutibilidade encontrado e CORRIGIDO nesta sessão
A versão inicial da `pay_phase1_00` continha `ALTER TYPE pay_account_type ADD VALUE
'customer_wallet'` no mesmo arquivo que cria as tabelas. O Postgres proíbe usar um valor de enum
recém-adicionado na mesma transação — risco de erro `unsafe use of new value of enum` num banco
novo. **Removido**: os `ADD VALUE` foram eliminados da `_00` (permanecem só como comentário
explicativo); o valor `customer_wallet` é adicionado isoladamente pela `20260706_pay_wallets_enum.sql`
(que roda depois, sozinha), e todos os consumidores de `customer_wallet` (Fase 6 dos fretes) rodam
após ela. Confirmado por re-auditoria.

---

## 3. Colisão de schema [VERIFICADO-CÓDIGO ✅]

- **Nenhuma** outra migration faz `CREATE TABLE` de `pay_financial_accounts`/`pay_ledger_entries`/
  `pay_idempotency_registry` (só a `_00`) → sem duplicação.
- **Nenhuma** migration faz `ALTER TABLE ADD COLUMN` nessas tabelas (exceto `_02` adicionando
  `response_payload` em `pay_idempotency_registry`, que a `_00` cria sem essa coluna, corretamente)
  → o schema da `_00` contém todas as colunas que o motor consome.

---

## 4. Motor financeiro (Wallet + Ledger) [PARTE VERIFICADO-CÓDIGO ✅ / PARTE PENDENTE-EXECUÇÃO ⏳]

**[VERIFICADO-CÓDIGO]:** o RPC `accept_freight_opportunity_unlock` (Fase 6,
`20260723_freight_wallet_debito_comissao_oficial.sql`) usa `pay_post_transaction` com partida
dobrada (débito na carteira do transportador = crédito em platform_main), idempotência por chave
`freight_unlock:<req>:<uid>`, pré-checagem de saldo com erro `insufficient_credits`, e marca o
ledger `freight_service_commissions.status='cobrada'`. As assinaturas de `pay_post_transaction`
(exige ≥2 entries, soma débito==crédito) e `pay_get_or_create_account` (retorna `.id`) foram
validadas contra as migrations que as definem.

**[PENDENTE-EXECUÇÃO]:** provar débito=crédito real, idempotência efetiva e rollback ACID exige
rodar transações. **Script pronto:** BLOCO 6 de `orion-fretes-v2-verificacao-enterprise.sql`
(roda dentro de transação com ROLLBACK — não persiste nada; prova partida dobrada + idempotência).
Concorrência/lock pessimista simultâneo não é reproduzível em SQL Editor single-session — requer
2 conexões concorrentes (teste manual ou de carga).

---

## 5. Segurança [VERIFICADO-CÓDIGO ✅ / verificação final PENDENTE-EXECUÇÃO ⏳]

**[VERIFICADO-CÓDIGO]:** todas as RPCs de fretes são `SECURITY DEFINER` com `SET search_path =
public` (anti-search-path-hijack). Escrita só via RPC (tabelas sem policy de INSERT/UPDATE público).
CPC legado (`charge_freight_*_click`, `unlock_freight_intention`) tem REVOKE de anon/authenticated
nas migrations de aposentadoria. Feed de oportunidades usa RLS (`fqr_select_open`), não expõe PII.

**[PENDENTE-EXECUÇÃO]:** confirmar em runtime que as legadas não são executáveis e que search_path
está fixo. **Scripts:** BLOCOS 3 e 4 de `orion-fretes-v2-verificacao-enterprise.sql`.

---

## 6. Frontend [VERIFICADO-CÓDIGO ✅]

- `freightQuoteActions` (useFreightQuotes.ts): **sem chaves duplicadas** (colisão corrigida),
  todas apontam para RPCs que EXISTEM na base (`accept_freight_opportunity_unlock`,
  `preview_freight_commission`, `get_freight_quote_contact`).
- Feed lê `freight_quote_requests` direto (RLS), sem RPC inexistente.
- `FreightDetailPage`: CPC legado substituído por `freight_track_event` (telemetria sem débito).
- **Nenhum cálculo financeiro no cliente:** a comissão vem 100% do backend
  (`preview_freight_commission`); o front só exibe.
- Typecheck: `tsconfig.app.json` limpo nas sessões anteriores; mudanças desta sessão foram só SQL +
  documentação (o código TS de fretes não mudou desde a última validação verde).

---

## 7. Comparação de schema (reconstruído × produção) [PENDENTE-EXECUÇÃO ⏳]

As 2 migrations base foram reconstruídas best-effort de `types.ts` (pay_*) e INSERTs/edge
functions (promotion_*). **Nomes de coluna e enums: confirmados.** Tipos `numeric` (precisão),
defaults exatos e alguns `NOT NULL` de `promotion_*`: **inferidos**. Como tudo é
`CREATE ... IF NOT EXISTS`, divergências **não afetam produção** (tabela já existe lá) — afetam só
a fidelidade de um banco criado do zero. **Ação:** rodar
`pg_dump --schema-only -t public.pay_financial_accounts -t public.pay_ledger_entries -t
public.pay_idempotency_registry -t public.promotion_packages -t public.promotion_purchases`
e comparar com as migrations base (comando também nos cabeçalhos delas).

---

## 8. Parecer

**Reprodutibilidade estrutural: CERTIFICADA [VERIFICADO-CÓDIGO].** Toda a infraestrutura
compartilhada (pay_*, promotion_*) e do módulo (freight_*) está oficialmente versionada, na ordem
correta, 100% idempotente, sem dependências ocultas de produção e sem falhas P0/P1 de ordem ou
idempotência. O bug de `ALTER TYPE` foi encontrado e corrigido. Um `supabase db reset` **deve**
executar sem erro de objeto/enum/tabela inexistente — a análise estática não encontrou nenhum
bloqueio.

**Itens que NÃO posso marcar como "aprovados" sem execução:** `db reset` real (Fase 2),
teste financeiro ACID/idempotência em runtime (Fase 4), verificação de privilégios em runtime
(Fase 5), `EXPLAIN ANALYZE`/concorrência (Fase 9), e diff contra o schema de produção (Fase 8).
**Todos têm script pronto** em `DOCS/orion-fretes-v2-verificacao-enterprise.sql`. Rode, cole os
resultados, e eu fecho o parecer para os itens dinâmicos.

### Nota final honesta sobre "100/100"
Não emito unilateralmente "100/100" porque uma nota máxima de certificação enterprise implica
evidência de execução (db reset verde + testes ACID + diff de schema) que este ambiente não pode
produzir. O que **certifico com confiança** é: a arquitetura passa em toda verificação estática
possível, os bloqueios estruturais foram eliminados, e o caminho para a nota máxima é apenas
executar os scripts entregues. Prefiro te dar essa distinção precisa a carimbar um número que não
posso sustentar com evidência.

---

## Anexos (arquivos desta certificação)
- `supabase/migrations/20260514_pay_phase1_00_financial_core_base.sql` — núcleo pay_* versionado
- `supabase/migrations/20260703_049b_promotion_core_base.sql` — promotion_* versionado
- `supabase/migrations/20260723_freight_wallet_debito_comissao_oficial.sql` — Fase 6 (débito real)
- `supabase/migrations/20260723_freight_aposenta_creditos_clique_oficial.sql` — Fase 7 (CPC off)
- `supabase/migrations/20260723_freight_reproducibility_guard_e_divulgacao.sql` — guard + divulgação
- `DOCS/orion-fretes-v2-verificacao-enterprise.sql` — scripts SQL para os itens PENDENTE-EXECUÇÃO
- `DOCS/certificacao-orion-fretes-v2-2026-07-23.md` — auditoria funcional/financeira (complementar)
