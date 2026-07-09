/**
 * withdrawService — saque do saldo líquido da plataforma p/ a conta Mercado Pago.
 *
 * Camada de serviço com interface ESTÁVEL: a UI chama requestWithdraw() e
 * nunca precisa mudar; só o comportamento interno muda conforme o ambiente.
 *
 *  • SANDBOX  → NÃO chama nenhuma API de saque. Registra a solicitação
 *               auditada via RPC platform_request_withdraw (status
 *               'sandbox_simulado'). O MP não permite transferências reais
 *               em ambiente de teste.
 *  • PRODUÇÃO → registra a solicitação (status 'pending') e...
 *               TODO(produção): integrar aqui a API oficial de transferências
 *               do Mercado Pago (money-out), via Edge Function com o access
 *               token de produção (nunca no browser). Ao confirmar a
 *               transferência: atualizar status pending→processing→completed,
 *               gravar provider_transfer_id e SÓ ENTÃO debitar platform_main
 *               no ledger (pay_post_transaction, scope 'platform_withdraw').
 *
 * Auditoria (na RPC): usuário, valor, saldo antes/depois, ambiente, IP,
 * request_id, data/hora. Nenhuma mutação em ledger/carteiras aqui.
 */
import { supabase } from "@/integrations/supabase/client";
import { mercadoPagoPublicKey } from "@/lib/payments/checkoutConfig";

export type WithdrawEnvironment = "sandbox" | "production";

export interface WithdrawRequestInput {
  /** Valor do saque em reais (ex.: 1234.56). */
  amountBrl: number;
  /** Metadados livres p/ auditoria (tela de origem etc.). */
  metadata?: Record<string, unknown>;
}

export interface WithdrawRecord {
  id: string;
  request_id: string;
  requested_by: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  environment: WithdrawEnvironment;
  status: "pending" | "processing" | "completed" | "failed" | "sandbox_simulado";
  destination: string;
  provider_transfer_id: string | null;
  ip: string | null;
  created_at: string;
  processed_at: string | null;
}

/**
 * Ambiente ativo do gateway. Heurística do front: public key "TEST-…" =
 * sandbox. Fallback SEGURO é sandbox (nunca marcar produção por engano).
 * TODO(produção): resolver via config oficial do gateway (mp_gateway /
 * resolveMpGateway) exposta por Edge Function, em vez da public key.
 */
export function detectWithdrawEnvironment(): WithdrawEnvironment {
  const pk = mercadoPagoPublicKey() ?? "";
  if (pk.startsWith("APP_USR-")) return "production";
  return "sandbox";
}

/** Saldo líquido disponível da tesouraria (platform_main) — leitura admin. */
export async function getPlatformAvailableBalance(): Promise<number> {
  const { data, error } = await (supabase as any)
    .from("pay_financial_accounts")
    .select("available_balance,current_balance")
    .eq("owner_type", "platform")
    .is("owner_id", null)
    .eq("account_type", "platform_main")
    .maybeSingle();
  if (error) throw new Error(`saldo platform_main: ${error.message}`);
  return Number(data?.available_balance ?? data?.current_balance ?? 0) || 0;
}

/**
 * Solicita o saque. Interface única p/ Sandbox e Produção — a diferença de
 * comportamento fica AQUI dentro (spec item 8).
 */
export async function requestWithdraw(
  input: WithdrawRequestInput,
): Promise<{ record: WithdrawRecord; environment: WithdrawEnvironment }> {
  const environment = detectWithdrawEnvironment();

  // Registro auditado da solicitação (as validações de valor/saldo/admin
  // são reforçadas na RPC, no servidor).
  const { data, error } = await (supabase.rpc as any)("platform_request_withdraw", {
    p_amount: Number(input.amountBrl.toFixed(2)),
    p_environment: environment,
    p_metadata: input.metadata ?? {},
  });
  if (error) {
    // Log estruturado p/ auditoria: arquivo/função + erro completo do PostgREST
    // (code PGRST202 = RPC inexistente → migration 20260708_platform_withdrawals
    // ainda não rodada no SQL Editor; 42501 = usuário não é admin).
    console.error("[withdrawService.requestWithdraw] RPC platform_request_withdraw falhou:", {
      code: (error as any).code,
      message: error.message,
      details: (error as any).details,
      hint: (error as any).hint,
      environment,
      amountBrl: input.amountBrl,
    });
    throw new Error(`${error.message}${(error as any).code ? ` (código ${(error as any).code})` : ""}`);
  }
  const record = data as WithdrawRecord;

  if (environment === "production") {
    // TODO(produção): chamada à API oficial de transferências do Mercado
    // Pago (money-out) via Edge Function dedicada — NUNCA no browser.
    // Fluxo previsto:
    //   1. Edge Function 'payments-withdraw' lê credenciais MP_PROD_*
    //   2. POST transferência p/ a conta MP da plataforma
    //   3. status: pending → processing → completed/failed
    //   4. na confirmação: gravar provider_transfer_id + debitar
    //      platform_main via pay_post_transaction (scope 'platform_withdraw')
    // Por ora a solicitação fica registrada como 'pending' (sem dinheiro
    // movido), preservando exatamente esta interface.
  }

  return { record, environment };
}

/** Histórico de saques (mais recentes primeiro) — leitura admin via RLS. */
export async function listWithdrawals(limit = 50): Promise<WithdrawRecord[]> {
  const { data, error } = await (supabase as any)
    .from("platform_withdrawals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`histórico de saques: ${error.message}`);
  return (data ?? []) as WithdrawRecord[];
}
