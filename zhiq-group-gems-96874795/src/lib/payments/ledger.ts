/**
 * Universal Ledger Types
 *
 * Append-only ledger é a única fonte da verdade financeira da plataforma.
 * Saldos não são armazenados — sempre computados de SUM(amount * sign).
 *
 * Toda movimentação financeira gera UMA OU MAIS entries no ledger.
 * Nunca UPDATE, nunca DELETE — só INSERT.
 */

/* ─────────── Account types ─────────── */

export type LedgerAccountType =
  | 'motoboy'              // Carteira do motoboy
  | 'merchant_credits'     // Créditos do lojista
  | 'merchant_money'       // Saldo monetário do lojista (cashback, devoluções)
  | 'advertiser_credits'   // Créditos do anunciante
  | 'real_estate_credits'  // Créditos imobiliários
  | 'driver'               // Saldo do motorista/passageiro
  | 'platform_revenue'     // Receita da plataforma (comissões, taxas)
  | 'platform_escrow'      // Conta-clearing de escrow (valores retidos)
  | 'platform_fees'        // Conta de taxas operacionais
  | 'gateway_clearing';    // Conta de trânsito do gateway

export interface LedgerAccount {
  id: string;
  account_type: LedgerAccountType;
  /** Para contas de usuário, o user_id dono. NULL para contas da plataforma. */
  owner_user_id: string | null;
  currency: 'BRL';
  /** Etiqueta humana — ex: "Carteira Motoboy João". */
  display_name: string;
  created_at: string;
}

/* ─────────── Entry types ─────────── */

/**
 * Tipos de evento no ledger. Cada operação financeira mapeia para 1 ou + entries.
 *
 * Convenção de sinal:
 *  - CREDIT/RELEASE/REFUND     => entrada (+) na conta destino
 *  - DEBIT/HOLD/FEE/PAYOUT     => saída  (−) na conta origem
 *
 * Toda operação é DOUBLE-ENTRY: para cada DEBIT há um CREDIT correspondente
 * em outra conta (ex: HOLD na conta do lojista ↔ CREDIT na platform_escrow).
 */
export type LedgerEntryType =
  | 'CREDIT'           // Entrada de dinheiro (lojista comprou pacote, motoboy recebeu entrega)
  | 'DEBIT'            // Saída direta (compra, débito)
  | 'HOLD'             // Reserva (escrow) — sai da conta origem
  | 'RELEASE'          // Libera o hold para o destinatário final
  | 'REFUND'           // Estorno — devolução do hold ao pagador
  | 'FEE'              // Taxa cobrada pela plataforma (comissão, taxa)
  | 'PAYOUT'           // Saque para fora (PIX out)
  | 'PAYOUT_REVERSAL'  // PIX falhou, volta pro saldo
  | 'ADJUSTMENT'       // Ajuste manual de admin (justificado)
  | 'BONUS'            // Bônus / incentivo
  | 'EXPIRATION';      // Crédito expirado (validade)

/* ─────────── Ledger entry ─────────── */

export interface LedgerEntry {
  id: string;
  /** Agrupa entries que pertencem à mesma operação atômica (HOLD+CREDIT). */
  transaction_id: string;
  /** Idempotency key do request que gerou esta entry. */
  idempotency_key: string;
  account_id: string;
  entry_type: LedgerEntryType;
  /** Valor em centavos. Sempre positivo aqui — o "sentido" vem do entry_type. */
  amount_cents: number;
  currency: 'BRL';
  /** Saldo da conta APÓS esta entry (snapshot para reconciliação rápida). */
  balance_after_cents: number;
  /** Referência ao evento de negócio que originou (ex: delivery_id). */
  reference_type: string | null;
  reference_id: string | null;
  /** Descrição humana (aparece no extrato). */
  description: string;
  /** Para HOLD/RELEASE/REFUND: ID do hold pai. */
  parent_entry_id: string | null;
  /** Metadata livre — payload do gateway, contexto, etc. */
  metadata: Record<string, unknown>;
  created_at: string;
  /** Usuário/sistema que criou a entry (auditoria). */
  created_by: string | null;
  /** IP/origem da operação (para operações sensíveis). */
  created_from_ip: string | null;
}

/* ─────────── Computed balances (não armazenados!) ─────────── */

/**
 * Saldo contábil — a verdade.
 * Computado por: SUM(amount_cents * signOf(entry_type)) GROUP BY account_id.
 *
 * NUNCA escreva em uma tabela "balance" diretamente.
 * Sempre derive deste cálculo (view ou função SQL).
 */
export interface AccountingBalance {
  account_id: string;
  total_cents: number;
  /** Soma de HOLDs ativos (held - released - refunded). */
  held_cents: number;
  /** Disponível = total − held. */
  available_cents: number;
  computed_at: string;
}

/**
 * Saldo apresentado — UX layer.
 * Pode aplicar regras de negócio: "valores de entrega <24h ficam pendentes",
 * "saque só com KYC", etc.
 */
export interface PresentedBalance {
  account_id: string;
  available_cents: number; // pode sacar agora
  pending_cents: number;   // chega em D+1, ou em rota
  held_cents: number;      // em escrow ou em análise
  computed_at: string;
}

/* ─────────── Transaction grouping ─────────── */

/**
 * Uma "transação" do ponto de vista do negócio gera várias entries no ledger.
 * Ex: lojista chama motoboy →
 *   1) HOLD na conta merchant_credits  (−7 créditos)
 *   2) CREDIT na platform_escrow        (+7 créditos)
 * Mesmo transaction_id, mesma idempotency_key.
 */
export interface LedgerTransaction {
  id: string;
  idempotency_key: string;
  operation: LedgerOperation;
  status: 'pending' | 'completed' | 'reversed';
  entries: LedgerEntry[];
  created_at: string;
}

export type LedgerOperation =
  | 'credit_purchase'      // Lojista compra pacote
  | 'delivery_request'     // Lojista chama motoboy (HOLD)
  | 'delivery_complete'    // Entrega finaliza (RELEASE)
  | 'delivery_cancel'      // Entrega cancela (REFUND)
  | 'payout_request'       // Motoboy pede saque
  | 'payout_complete'      // Saque confirmado
  | 'payout_reverse'       // Saque falhou
  | 'admin_adjustment'     // Ajuste manual
  | 'bonus_grant'          // Bônus concedido
  | 'fee_collection'       // Coleta de taxa
  | 'credit_expiration';   // Expiração de créditos
