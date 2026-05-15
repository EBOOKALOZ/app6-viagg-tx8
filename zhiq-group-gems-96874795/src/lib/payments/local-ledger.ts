/**
 * Local Ledger — append-only ledger backed por localStorage (FASE 1).
 *
 * Mesma forma do ledger final do banco. Quando a tabela `pay_ledger_entries`
 * existir, troca-se a implementação e o restante do código não muda.
 *
 * CONTRATOS-CHAVE preservados (idênticos ao banco):
 *  1. Append-only: nunca UPDATE/DELETE em entries.
 *  2. Idempotência: 2 chamadas com mesma idempotency_key = 1 efeito + mesma resposta.
 *  3. Double-entry: toda operação grava DEBIT + CREDIT em contas opostas.
 *  4. Saldo derivado: nunca persistido — sempre computado de SUM(entries).
 *  5. Transactional: todas as entries de uma operação compartilham transaction_id.
 */

import type {
  LedgerAccount,
  LedgerAccountType,
  LedgerEntry,
  LedgerEntryType,
  LedgerOperation,
  AccountingBalance,
} from './ledger';

const ACCOUNTS_KEY = 'viagg.local_ledger.accounts.v1';
const ENTRIES_KEY = 'viagg.local_ledger.entries.v1';
const IDEMPOTENCY_KEY = 'viagg.local_ledger.idempotency.v1';

/* ─────────── Sinal por tipo de entry ─────────── */

/**
 * Convenção: + entra na conta, − sai.
 * HOLD sai do pagador (negativo na conta dele).
 * RELEASE entra na conta destino (positivo).
 * REFUND devolve ao pagador (positivo).
 * FEE sai da conta (negativo) — vai pra platform_fees como CREDIT.
 */
const ENTRY_SIGN: Record<LedgerEntryType, 1 | -1> = {
  CREDIT: +1,
  DEBIT: -1,
  HOLD: -1,
  RELEASE: +1,
  REFUND: +1,
  FEE: -1,
  PAYOUT: -1,
  PAYOUT_REVERSAL: +1,
  ADJUSTMENT: +1,
  BONUS: +1,
  EXPIRATION: -1,
};

export function entrySign(entry_type: LedgerEntryType): 1 | -1 {
  return ENTRY_SIGN[entry_type];
}

/* ─────────── Storage helpers ─────────── */

function readAccounts(): LedgerAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_KEY);
    return raw ? (JSON.parse(raw) as LedgerAccount[]) : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts: LedgerAccount[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function readEntries(): LedgerEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ENTRIES_KEY);
    return raw ? (JSON.parse(raw) as LedgerEntry[]) : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: LedgerEntry[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
}

function readIdempotency(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(IDEMPOTENCY_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function writeIdempotency(map: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(IDEMPOTENCY_KEY, JSON.stringify(map));
}

/* ─────────── Account management ─────────── */

export function getOrCreateAccount(
  account_type: LedgerAccountType,
  owner_user_id: string | null,
  display_name: string,
): LedgerAccount {
  const accounts = readAccounts();
  // Para contas da plataforma (sem owner), única por tipo
  // Para contas de usuário, única por (tipo, owner)
  const found = accounts.find(
    (a) => a.account_type === account_type && a.owner_user_id === owner_user_id,
  );
  if (found) return found;

  const created: LedgerAccount = {
    id: `acc_${account_type}_${owner_user_id ?? 'platform'}_${Math.random().toString(36).slice(2, 8)}`,
    account_type,
    owner_user_id,
    currency: 'BRL',
    display_name,
    created_at: new Date().toISOString(),
  };
  accounts.push(created);
  writeAccounts(accounts);
  return created;
}

export function listAccounts(): LedgerAccount[] {
  return readAccounts();
}

/* ─────────── Idempotency cache ─────────── */

export function getCachedResponse<T>(idempotency_key: string): T | null {
  const map = readIdempotency();
  return (map[idempotency_key] as T) ?? null;
}

export function cacheResponse(idempotency_key: string, response: unknown): void {
  const map = readIdempotency();
  map[idempotency_key] = response;
  writeIdempotency(map);
}

/* ─────────── Balance computation (derivado!) ─────────── */

export function computeBalance(account_id: string): AccountingBalance {
  const entries = readEntries().filter((e) => e.account_id === account_id);
  let total_cents = 0;
  let held_cents = 0;
  const heldByParent = new Map<string, number>();

  for (const entry of entries) {
    total_cents += entry.amount_cents * entrySign(entry.entry_type);

    if (entry.entry_type === 'HOLD') {
      heldByParent.set(entry.id, entry.amount_cents);
    } else if (entry.entry_type === 'RELEASE' || entry.entry_type === 'REFUND') {
      if (entry.parent_entry_id) {
        heldByParent.delete(entry.parent_entry_id);
      }
    }
  }
  for (const v of heldByParent.values()) held_cents += v;

  return {
    account_id,
    total_cents,
    held_cents,
    available_cents: total_cents - held_cents,
    computed_at: new Date().toISOString(),
  };
}

/* ─────────── Append entries (atomicamente, com idempotência) ─────────── */

export interface PostTransactionInput {
  idempotency_key: string;
  operation: LedgerOperation;
  description: string;
  entries: Array<{
    account_id: string;
    entry_type: LedgerEntryType;
    amount_cents: number;
    reference_type?: string | null;
    reference_id?: string | null;
    parent_entry_id?: string | null;
    metadata?: Record<string, unknown>;
  }>;
}

export interface PostTransactionResult {
  transaction_id: string;
  entries: LedgerEntry[];
  duplicated: boolean; // true = idempotência aplicou cache
}

export function postTransaction(input: PostTransactionInput): PostTransactionResult {
  // 1. Idempotência — se já temos cache, retorna mesmo resultado
  const cached = getCachedResponse<PostTransactionResult>(input.idempotency_key);
  if (cached) return { ...cached, duplicated: true };

  // 2. Double-entry guard: soma sinalizada deve fechar em zero
  const signedSum = input.entries.reduce(
    (acc, e) => acc + e.amount_cents * entrySign(e.entry_type),
    0,
  );
  if (signedSum !== 0) {
    throw new Error(
      `Ledger double-entry violation: soma sinalizada = ${signedSum} (deve ser 0)`,
    );
  }

  // 3. Append
  const now = new Date().toISOString();
  const transaction_id = `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const allEntries = readEntries();
  const newEntries: LedgerEntry[] = [];

  for (const e of input.entries) {
    // Snapshot do saldo após esta entry (rápido para UI)
    const priorBalance = allEntries
      .concat(newEntries)
      .filter((x) => x.account_id === e.account_id)
      .reduce((acc, x) => acc + x.amount_cents * entrySign(x.entry_type), 0);

    const balance_after = priorBalance + e.amount_cents * entrySign(e.entry_type);

    const entry: LedgerEntry = {
      id: `le_${transaction_id}_${newEntries.length}`,
      transaction_id,
      idempotency_key: input.idempotency_key,
      account_id: e.account_id,
      entry_type: e.entry_type,
      amount_cents: e.amount_cents,
      currency: 'BRL',
      balance_after_cents: balance_after,
      reference_type: e.reference_type ?? null,
      reference_id: e.reference_id ?? null,
      description: input.description,
      parent_entry_id: e.parent_entry_id ?? null,
      metadata: e.metadata ?? {},
      created_at: now,
      created_by: null,
      created_from_ip: null,
    };
    newEntries.push(entry);
  }

  // Append append-only
  writeEntries([...allEntries, ...newEntries]);

  const result: PostTransactionResult = {
    transaction_id,
    entries: newEntries,
    duplicated: false,
  };
  cacheResponse(input.idempotency_key, result);
  return result;
}

/* ─────────── Queries ─────────── */

export function listEntriesByAccount(
  account_id: string,
  opts?: { limit?: number },
): LedgerEntry[] {
  const entries = readEntries()
    .filter((e) => e.account_id === account_id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return opts?.limit ? entries.slice(0, opts.limit) : entries;
}

export function listEntriesByTransaction(transaction_id: string): LedgerEntry[] {
  return readEntries().filter((e) => e.transaction_id === transaction_id);
}

export function listAllEntries(opts?: { limit?: number }): LedgerEntry[] {
  const entries = readEntries().sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  return opts?.limit ? entries.slice(0, opts.limit) : entries;
}

/** Limpa todo o ledger local (botão de reset no demo). */
export function resetLocalLedger(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCOUNTS_KEY);
  window.localStorage.removeItem(ENTRIES_KEY);
  window.localStorage.removeItem(IDEMPOTENCY_KEY);
}
