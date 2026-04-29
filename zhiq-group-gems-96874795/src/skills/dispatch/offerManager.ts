import { supabase } from "@/integrations/supabase/client";

export interface DeliveryOffer {
    order_id: string;
    motoboy_id: string;
    status: 'pending' | 'accepted' | 'rejected' | 'timeout';
}

/**
 * Registra a oferta de corrida para o motoboy selecionado.
 */
export async function sendDeliveryOffer(orderId: string, motoboyId: string) {
    const { error } = await supabase
        .from("delivery_offers")
        .insert({
            order_id: orderId,
            motoboy_id: motoboyId,
            status: "pending"
        });

    if (error) {
        console.error("Erro ao enviar oferta de entrega:", error);
        throw error;
    }
}
