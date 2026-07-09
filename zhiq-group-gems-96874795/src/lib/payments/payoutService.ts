/**
 * payoutService — saque dos PROFISSIONAIS (motoboy, moto-táxi, motorista).
 *
 * Arquitetura padrão do Wallet Engine: NENHUM INSERT financeiro sai do
 * navegador. Tudo passa pela RPC SECURITY DEFINER professional_request_payout
 * (migration 20260708_professional_request_payout), que:
 *   auth → identifica perfil/carteira NO SERVIDOR → valida saldo disponível →
 *   cria pay_payout_requests ('pending') → reserva no ledger (payout_reserve:
 *   available −valor, reserved +valor, contábil conciliado) → auditoria.
 *
 * O cliente NUNCA envia wallet_id/user_id/profile_id — no máximo um HINT de
 * TIPO de perfil ('motoboy'|'mototaxi'|'driver'), validado no servidor contra
 * as carteiras do próprio usuário.
 *
 * SANDBOX: nenhuma chamada externa (nem aqui, nem na RPC). PRODUÇÃO: o envio
 * real é o processPayout() abaixo — ainda TODO.
 */
import { supabase } from "@/integrations/supabase/client";
import { detectWithdrawEnvironment, type WithdrawEnvironment } from "@/lib/payments/withdrawService";

export type ProfessionalProfileHint = "motoboy" | "mototaxi" | "driver";

export interface PayoutRequestResult {
  request_id: string;
  status: string;
  environment: WithdrawEnvironment;
  profile_type: ProfessionalProfileHint;
  amount: number;
  available_before: number;
  available_after: number;
  reserved_after: number;
  current_balance: number;
  created_at: string;
}

/**
 * Solicita o saque (reserva). Interface única Sandbox/Produção — o ambiente
 * só muda o registro/mensagem, nunca dispara integração externa aqui.
 */
export async function requestPayout(input: {
  amountBrl: number;
  profileHint?: ProfessionalProfileHint;
  metadata?: Record<string, unknown>;
}): Promise<PayoutRequestResult> {
  const environment = detectWithdrawEnvironment();

  const { data, error } = await (supabase.rpc as any)("professional_request_payout", {
    p_amount: Number(input.amountBrl.toFixed(2)),
    p_environment: environment,
    p_profile_hint: input.profileHint ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) {
    // Auditoria: nunca ocultar a causa real (RLS/constraint/RPC ausente).
    console.error("[payoutService.requestPayout] RPC professional_request_payout falhou:", {
      code: (error as any).code,
      message: error.message,
      details: (error as any).details,
      hint: (error as any).hint,
      amountBrl: input.amountBrl,
      profileHint: input.profileHint ?? null,
      environment,
    });
    const code = (error as any).code ? ` [${(error as any).code}]` : "";
    throw new Error(`${error.message}${code}`);
  }
  return data as PayoutRequestResult;
}

/**
 * processPayout — envio REAL do dinheiro (PRODUÇÃO). Ainda não implementado.
 *
 * TODO(produção): integração oficial com a API de transferências do Mercado
 * Pago, via Edge Function dedicada (token de produção NUNCA no browser):
 *   1. admin aprova → pay_update_payout_request_status pending→approved
 *   2. Edge Function envia a transferência (money-out) → approved→processing
 *   3. confirmação do gateway → processing→paid:
 *        · ledger: payout_settlement (reserved −valor, current −valor)
 *   4. falha → processing→failed:
 *        · ledger: payout_release (reserved −valor, available +valor)
 * A máquina de estados e os entry_types acima JÁ EXISTEM no motor
 * (migration 20260514 fase1 08 + pay_apply_balance_impact).
 */
export async function processPayout(_requestId: string): Promise<never> {
  throw new Error(
    "processPayout: envio real ainda não habilitado — integração oficial " +
      "Mercado Pago (produção) é o próximo passo. A solicitação permanece " +
      "reservada e auditada.",
  );
}
