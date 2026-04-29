import { supabase } from "@/integrations/supabase/client";

export type OrderStatus = 'open' | 'accepted' | 'in_progress' | 'delivered' | 'canceled';

/**
 * Atualiza o estado da ordem de entrega.
 */
export async function updateOrderStatus(orderId: string, status: OrderStatus) {
    const { error } = await supabase
        .from("delivery_orders")
        .update({ status })
        .eq("id", orderId);

    if (error) {
        console.error(`Erro ao atualizar a ordem ${orderId} para o status ${status}:`, error);
        throw error;
    }
}
