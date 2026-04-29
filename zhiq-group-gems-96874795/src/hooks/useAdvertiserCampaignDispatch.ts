import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type ListingType = "produto" | "veiculo" | "imovel";

type DispatchResult = {
    success: boolean;
    campaign_queue_id?: string;
    error?: string;
    message?: string;
};

export function useAdvertiserCampaignDispatch() {
    const { user } = useAuth();
    const [loadingId, setLoadingId] = useState<string | null>(null);

    const dispatch = async (
        listingId: string,
        listingType: ListingType,
    ): Promise<boolean> => {
        if (!user) {
            toast.error("Usuário não autenticado");
            return false;
        }

        setLoadingId(listingId);
        try {
            const { data, error } = await supabase.rpc(
                "create_advertiser_campaign_queue_item" as any,
                {
                    p_listing_id: listingId,
                    p_listing_type: listingType,
                    p_created_by_user_id: user.id,
                    p_campaign_type: "offer",
                },
            );

            if (error) throw error;

            const result = data as DispatchResult;
            if (!result.success) {
                toast.error(result.error ?? "Erro ao enviar para fila");
                return false;
            }

            toast.success(result.message ?? "Anúncio enviado para análise!", {
                description: "Após aprovação os motoboys poderão divulgar.",
                duration: 5000,
            });
            return true;
        } catch (err: any) {
            toast.error(err.message ?? "Erro inesperado");
            return false;
        } finally {
            setLoadingId(null);
        }
    };

    return { dispatch, loadingId };
}
