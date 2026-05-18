/**
 * deliveryPay — pontes entre o fluxo real de entrega e a carteira pay_*.
 *
 * O pagamento da entrega sai do `merchant_wallet` (pay_*, em R$) — a MESMA
 * conta que a recarga "Comprar + Saldo" do lojista alimenta — e nunca dos
 * pontos (merchant_credit_balances). O motoboy recebe no `motoboy_wallet`
 * pay_* (owner = auth user id, mesmo padrão de useMotoboyPayWallet).
 *
 * service_orders.merchant_id guarda o auth user_id do lojista (ver
 * useDeliveryOrder: join merchant_stores.user_id = merchant_id). A conta
 * pay_* é dona por merchant_stores.id, então é preciso resolver o store id.
 */
import { supabase } from '@/integrations/supabase/client';

/**
 * Resolve o merchant_stores.id (owner do merchant_wallet pay_*) a partir do
 * service_orders.merchant_id. Esse campo normalmente é o auth user_id do
 * lojista, mas alguns fluxos (StoreOrdersPage) já gravam o store id direto —
 * por isso tentamos os dois caminhos.
 */
export async function resolveMerchantStoreId(
  merchantId: string | null | undefined,
): Promise<string | null> {
  if (!merchantId) return null;

  // 1) já é um merchant_stores.id?
  const { data: byId } = await supabase
    .from('merchant_stores')
    .select('id')
    .eq('id', merchantId)
    .maybeSingle();
  if (byId?.id) return byId.id as string;

  // 2) então é o auth user_id do lojista.
  const { data: byUser } = await supabase
    .from('merchant_stores')
    .select('id')
    .eq('user_id', merchantId)
    .maybeSingle();
  return (byUser?.id as string | undefined) ?? null;
}

/** Dados mínimos do pedido para mover dinheiro no pay_*. */
export async function fetchOrderPayContext(
  orderId: string,
): Promise<{ storeId: string | null; amountCents: number } | null> {
  const { data } = await supabase
    .from('service_orders')
    .select('merchant_id, total_price')
    .eq('id', orderId)
    .maybeSingle();
  if (!data) return null;
  const storeId = await resolveMerchantStoreId(data.merchant_id as string);
  const amountCents = Math.round(Number(data.total_price ?? 0) * 100);
  return { storeId, amountCents };
}
