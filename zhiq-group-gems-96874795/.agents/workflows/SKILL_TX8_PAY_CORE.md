---
description: "Módulo PAY — Núcleo Financeiro Institucional da Plataforma Viagg-TX8: tesouraria, saques, ledger, auditoria"
---
# MÓDULO PAY — NÚCLEO FINANCEIRO INSTITUCIONAL

## Missão
Garantir integridade financeira absoluta na plataforma: caixa central, saques para conta bancária pessoal/empresarial, ledger append-only, reconciliação e auditoria.

---

## Agentes

### 1. PAY Core Architect
Responsável pela arquitetura financeira global. Define tabelas, relações, constraints e o fluxo de dinheiro entre entidades.
- Tabelas: `financial_accounts`, `ledger_entries`, `payout_requests`, `external_bank_accounts`
- Tabelas auxiliares: `pay_escrow_holds`, `pay_splits`, `pay_webhook_raw`, `pay_reconciliation_log`, `pay_transaction_errors`
- Constraints: saldo nunca negativo, idempotency_key única, ledger append-only

### 2. PAY Ledger Guardian
Garante imutabilidade e consistência do ledger.
- Todo movimento financeiro gera entry no ledger
- Entries nunca são deletadas ou editadas (append-only)
- Cada entry tem `idempotency_key` para evitar duplicidade
- Saldo computado = soma de todas entries da account

### 3. PAY Webhook Sentinel
Processa webhooks do provedor bancário de forma idempotente.
- Armazena payload raw em `pay_webhook_raw`
- Valida assinatura do webhook
- Processa evento uma única vez (idempotent)
- Registra erros de processamento

### 4. PAY Admin Console Designer
Responsável pela UI premium do módulo financeiro no admin.
- Visual fintech/bank treasury
- Cards KPI com gradientes escuros
- Tabelas premium com badges de status coloridos
- Feedback visual excelente para cada estado

### 5. PAY Reconciliation Auditor
Auditoria e reconciliação banco ↔ ledger.
- Comparação diária saldo banco vs saldo ledger
- Detecção de divergências
- Alertas para saques em processamento > 24h
- Log de reconciliação em `pay_reconciliation_log`

### 6. PAY Payout Operations Agent
Gerencia o ciclo de vida dos saques.
- State machine: `pending_approval` → `approved` → `queued` → `processing` → `paid` | `failed` | `canceled`
- Em `approved`: reserva saldo internamente
- Em `processing`: Edge Function envia ao banco com `idempotency_key`
- Em `paid`: registra saída definitiva no ledger
- Em `failed`: libera reserva no ledger

---

## Skills

### 1. Financial Ledger Design
```
Regras:
- Ledger é append-only (nunca delete/update)
- Toda movimentação = par de entries (débito/crédito)
- idempotency_key obrigatória
- Saldo = SUM(amount_cents) WHERE account_id = X
- Valores em centavos (integer)
```

### 2. Idempotent Webhook Processing
```
Fluxo:
1. Recebe POST do banco → salva raw em pay_webhook_raw
2. Verifica se event_id já foi processado
3. Se não → processa evento (atualiza payout status, registra ledger)
4. Se sim → retorna 200 sem reprocessar
5. Registra erro se falhar
```

### 3. Payout State Machine
```
Estados:
  pending_approval → approved → queued → processing → paid
  pending_approval → canceled
  approved → canceled
  processing → failed → queued (reprocess)
  processing → paid

Regras:
  - pending_approval: saldo não reservado ainda
  - approved: saldo reservado (balance_cents -= amount, reserved_balance_cents += amount)
  - processing: Edge Function chamou o banco
  - paid: saída definitiva registrada no ledger
  - failed: reserva liberada, pode reprocessar
  - canceled: reserva liberada (se havia)
```

### 4. Financial Reconciliation
```
Frequência: diária (via cron Edge Function)
Ação:
  1. Buscar saldo real do banco via API
  2. Comparar com SUM(ledger_entries) da conta platform_master
  3. Registrar resultado em pay_reconciliation_log
  4. Se divergência > threshold → status = 'divergent' → gerar alerta
```

### 5. Admin Financial UI
```
Design system:
  - KPI cards: bg-gradient-to-br from-slate-900 to-slate-800, text-white
  - Status badges: amber (pending), blue (approved), indigo (queued), violet (processing), emerald (paid), red (failed), gray (canceled)
  - Tabelas: text-xs, font-mono para IDs, hover:bg-accent/30
  - Charts: recharts com área/barra, verde=entrada, vermelho=saída
```

### 6. Bank Destination Management
```
Tabela: external_bank_accounts
Campos: user_id, account_type (personal|business), bank_code, bank_name, branch, account_number, pix_key, holder_name, holder_document, is_default, is_active
Regras:
  - Plataforma pode ter múltiplas contas (owner_type = 'platform')
  - Uma conta marcada como is_default
  - Conta inativa não pode receber saques
```

### 7. Transfer Approval Rules
```
Regras:
  - Saque mínimo: configurável (default R$50,00)
  - Saque máximo: configurável (default R$50.000,00)
  - Saldo disponível >= valor do saque
  - Conta destino deve estar ativa
  - Não pode haver saque duplicado (mesmo valor + conta + janela de 5min)
  - Admin deve aprovar manualmente
```

### 8. Audit Trail Integrity
```
Todo evento financeiro gera audit trail:
  - Quem solicitou (user_id)
  - Quando (timestamp)
  - O que mudou (old_status → new_status)
  - Valor envolvido
  - idempotency_key
  - IP/device (quando disponível)
```

### 9. Failure Recovery Operations
```
Cenários de falha:
  1. Timeout do banco → manter status processing, Edge Function verifica via polling
  2. Falha confirmada → status failed, liberar reserva, permitir reprocessamento
  3. Webhook duplicado → ignorar (idempotent)
  4. Saldo insuficiente → rejeitar no momento da aprovação
  5. Conta inativa → rejeitar no momento da aprovação
```

### 10. Split & Treasury Ready
```
Preparação para futuro:
  - financial_accounts já suporta múltiplos tipos: wallet, institutional, escrow, platform_master
  - profile_type diferencia: motoboy, merchant, platform, passenger
  - pay_splits tabela existe para split de pagamentos
  - pay_escrow_holds para retenção temporária
  - Arquitetura permite: pagamento entra → split → parte pro motoboy, parte pro lojista, parte pra plataforma
```

---

## Fontes de Verdade
| Recurso | Localização |
|---|---|
| Hooks Treasury | `src/hooks/useAdminPayTreasury.ts` |
| Hooks Withdrawals | `src/hooks/useAdminPayWithdrawals.ts` |
| Hooks Bank Accounts | `src/hooks/useAdminPayBankAccounts.ts` |
| Hooks Statement | `src/hooks/useAdminPayStatement.ts` |
| Hooks Audit | `src/hooks/useAdminPayAudit.ts` |
| Types/Utils | `src/skills/pay/payTypes.ts`, `payConstants.ts`, `payUtils.ts` |
| Componentes UI | `src/components/admin/pay/*.tsx` |
| Página principal | `src/pages/admin/AdminPayDashboard.tsx` |
| Dashboard hook (legacy) | `src/hooks/useAdminPayDashboard.ts` |

## Regras Invioláveis
1. **Nunca permitir duplicidade** (idempotency_key em tudo)
2. **Nunca permitir saldo negativo** (check constraint no banco)
3. **Nunca confiar no frontend** para mutações financeiras
4. **Todo fluxo backend-driven** via RPCs e Edge Functions
5. **Ledger append-only** — nunca delete/update entries
6. **Toda transição gera auditoria**
