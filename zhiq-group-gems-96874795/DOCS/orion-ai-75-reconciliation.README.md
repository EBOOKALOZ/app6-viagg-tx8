# ORION-AI-75 — Rotina de Reconciliação Financeira (Centro Financeiro)

Rotina **oficial, 100% somente-leitura**, que revalida a cadeia financeira do
Centro Financeiro Inteligente após cada desbloqueio real em produção. Não altera
banco, RLS, RPC nem regra de negócio — apenas lê e compara.

## Arquivos
| Arquivo | Papel |
|---|---|
| `DOCS/orion-ai-75-reconciliation.sql` | A rotina — uma única query (`WITH … SELECT jsonb`), zero escrita |
| `DOCS/run-reconciliation.sh` | Runner: envia a query à Management API e imprime o parecer |

## Objetivo
Emitir automaticamente o veredito da certificação **ORION-AI-75** comparando, ao
centavo, o que o banco registrou com o que o Centro Financeiro exibe (extrato,
saldo, indicadores, gráficos, comissão), além de idempotência e consistência.

## Modo de execução
Pré-requisitos (a rotina só produz veredito conclusivo quando os três existem):
1. ≥ 1 movimentação real em `wallet_transactions`;
2. a cobrança correspondente em `orion_marketplace_contact_charges`;
3. Management API do Supabase operacional.

```bash
bash DOCS/run-reconciliation.sh
```
O runner lê o token da Management API de um arquivo `sbp.txt` (caminho de sessão,
não versionado — nenhum segredo entra no git) e roda a `.sql` via API.
Alternativa: colar o conteúdo de `orion-ai-75-reconciliation.sql` no SQL Editor.

## Interpretação dos resultados
A query retorna um `jsonb` com `etapa1_deteccao` … `etapa6_consistencia` e um
campo `veredito`. Cada etapa tem flags booleanas que devem ser **todas `true`**:

| Etapa | Valida |
|---|---|
| 1 — Detecção | há movimentação real? (senão → **AGUARDANDO**) |
| 2 — Ledger | `balance == Σcrédito_confirmado − Σdébito_confirmado`; `reserved` bate |
| 3 — Cobrança | débito do unlock == charge; **2% do valor anunciado** (resolve pelo `listing_id`) |
| 4 — Idempotência | 1 charge por (módulo, anúncio, comprador) — nunca cobra 2× |
| 5 — Logs | correlação com `orion_contact_reveal_log` (se existir) |
| 6 — Consistência | sem saldo negativo, sem txn órfã, sem `idempotency_key` duplicado, sem valor ≤ 0 |

## Significado dos estados
- **AGUARDANDO** — `wallet_transactions` e `orion_marketplace_contact_charges`
  vazias. Não há prova de produção; a rotina encerra sem certificar.
- **🟢 CERTIFICADO ORION-AI-75** — existe movimentação real **e** todas as etapas
  passam (0 divergência, tolerância R$ 0,00 no ledger; R$ 1 só no 2% por
  arredondamento/piso). Reemite a certificação plena.
- **🟡 COM RESSALVAS** — mecanismo aprovado, mas sem movimentação real (AGUARDANDO)
  ou com ressalvas de UX não-financeiras (ex.: modo claro). Não bloqueia dinheiro.
- **🔴 NÃO CERTIFICADO** — alguma etapa financeira falhou (divergência de valores,
  cobrança dupla, saldo negativo inesperado, transação órfã). Investigar antes de deploy.

## Rastreabilidade
Reexecutável a cada novo desbloqueio (idempotente, read-only). Anexar a saída do
runner ao processo de certificação como evidência datada.
