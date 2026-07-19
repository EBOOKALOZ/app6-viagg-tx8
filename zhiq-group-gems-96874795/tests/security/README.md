# Suíte permanente de segurança & integridade — ORION-HARDENING

Base de testes reutilizável criada na **FASE 2 (ETAPA 3)**. Deve ser executada após **qualquer migration** e antes de cada release/fase (Arremates, AI-75). Zero dependências novas.

## Arquivos

| Arquivo | O que testa | Como rodar |
|---|---|---|
| `rls-permissions.test.mjs` | **Behavioral (REST)**: anon negado em tabelas/RPCs/views financeiras; superfície pública preservada; fluxo autenticado + isolamento | `npm run test:security` |
| `db-invariants.sql` | **DB invariantes (10)**: RLS financeiro, anon sem execute financeiro, views non-invoker, mutação anônima só na allowlist, ledger partida-dobrada, idempotência, sem saldo negativo, escrow split, comissão fonte única | SQL Editor **ou** Management API |
| `domain-selftests.sql` | **Domínio**: `auction_security_selftest` (leilão) + `rep_selftest` (reputação/ALC 14/14) | SQL Editor **ou** Management API |

## Rodar

```bash
# 1) Behavioral REST (anon-only; sem credenciais):
npm run test:security

# 1b) Incluindo o bloco autenticado (isolamento entre usuários):
TEST_EMAIL=<conta-teste> TEST_PASSWORD=<senha> npm run test:security

# 2) Invariantes de banco (via SQL Editor: cole o conteúdo; ou via Management API):
#    Sai sem erro = OK; RAISE EXCEPTION = invariante violado.
```

A URL e a anon key (pública) são lidas de `src/integrations/supabase/client.ts`, ou de
`SUPABASE_URL` / `SUPABASE_ANON_KEY` no ambiente (têm prioridade).

## Contrato coberto (não pode regredir)

- **RLS**: toda tabela `%wallet|ledger|escrow|payout|commission|payment|financial|split|bank|earning%` com RLS ON; anon negado.
- **Permissões**: nenhuma função DEFINER financeira/sensível executável por `anon`; mutação anônima só na allowlist pública (`submit_marketplace_order`, `register_product_inquiry`, `charge_*_interest_click`).
- **Views**: nenhuma view financeira *non-invoker* legível por `anon`.
- **Integridade financeira**: ledger reconciliado + partida dobrada + idempotência + escrow split + comissão fonte única.
- **Domínio**: leilão (RLS 8/8, anon sem DML) + reputação (14/14).

## Estender nas próximas fases

- **Arremates (FASE A)**: quando `arremate_status` + trigger de imutabilidade winner/valor existirem, adicionar em `db-invariants.sql`: (a) UPDATE direto de `winner_user_id`/`valor_final` bloqueado; (b) transições inválidas rejeitadas; e reabilitar `aeo_selftest` em `domain-selftests.sql` após corrigir o drift de `orion_auction_finalize_log`.
- **AI-75 (Security Ecosystem)**: adicionar asserts para os novos módulos de segurança.
