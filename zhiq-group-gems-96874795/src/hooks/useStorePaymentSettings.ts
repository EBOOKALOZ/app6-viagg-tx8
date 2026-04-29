/**
 * useStorePaymentSettings — Per-store direct payment configuration
 *
 * The platform does NOT process payments. The consumer pays directly
 * to the store using the store's registered payment details (PIX, etc).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface StorePaymentSettings {
  id?: string;
  store_id: string;
  // PIX direto
  accepts_direct_pix: boolean;
  pix_key: string;
  pix_key_type: string;
  pix_holder_name: string;
  pix_holder_document: string;
  bank_name: string;
  // Outras formas
  accepts_bank_transfer: boolean;
  accepts_card_on_site: boolean;
  accepts_in_store_payment: boolean;
  // Contato e instruções
  store_whatsapp: string;
  payment_instructions: string;
}

const DEFAULT_SETTINGS: Omit<StorePaymentSettings, "store_id"> = {
  accepts_direct_pix: false,
  pix_key: "",
  pix_key_type: "",
  pix_holder_name: "",
  pix_holder_document: "",
  bank_name: "",
  accepts_bank_transfer: false,
  accepts_card_on_site: false,
  accepts_in_store_payment: true,
  store_whatsapp: "",
  payment_instructions: "",
};

export function useStorePaymentSettings(storeId: string | undefined | null) {
  const queryClient = useQueryClient();

  const {
    data: settings,
    isLoading,
  } = useQuery<StorePaymentSettings | null>({
    queryKey: ["store-payment-settings", storeId],
    queryFn: async () => {
      if (!storeId) return null;
      const { data, error } = await (supabase.from("store_payment_settings") as any)
        .select("*")
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) {
        console.error("[useStorePaymentSettings] fetch error:", error);
        return null;
      }
      if (!data) return { ...DEFAULT_SETTINGS, store_id: storeId };
      return {
        id: data.id,
        store_id: data.store_id,
        accepts_direct_pix: !!data.accepts_direct_pix,
        pix_key: data.pix_key || "",
        pix_key_type: data.pix_key_type || "",
        pix_holder_name: data.pix_holder_name || "",
        pix_holder_document: data.pix_holder_document || "",
        bank_name: data.bank_name || "",
        accepts_bank_transfer: !!data.accepts_bank_transfer,
        accepts_card_on_site: !!data.accepts_card_on_site,
        accepts_in_store_payment: data.accepts_in_store_payment !== false,
        store_whatsapp: data.store_whatsapp || "",
        payment_instructions: data.payment_instructions || "",
      };
    },
    enabled: !!storeId,
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: Partial<StorePaymentSettings>) => {
      if (!storeId) throw new Error("No store ID");
      const payload = { ...updates, store_id: storeId, updated_at: new Date().toISOString() };
      delete (payload as any).id;

      const { data: existing } = await (supabase.from("store_payment_settings") as any)
        .select("id")
        .eq("store_id", storeId)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await (supabase.from("store_payment_settings") as any)
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("store_payment_settings") as any)
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-payment-settings", storeId] });
      toast.success("Formas de pagamento salvas!");
    },
    onError: (err: Error) => {
      toast.error("Erro ao salvar configurações.");
      console.error("[useStorePaymentSettings] save error:", err);
    },
  });

  // Computed: store has direct payment info configured?
  const hasDirectPayment = settings?.accepts_direct_pix && !!settings.pix_key;

  // Computed: store accepts some form of in-store payment?
  const hasInStoreOption = settings?.accepts_in_store_payment ||
    settings?.accepts_card_on_site;

  return {
    settings: settings || { ...DEFAULT_SETTINGS, store_id: storeId || "" },
    isLoading,
    hasDirectPayment: !!hasDirectPayment,
    hasInStoreOption: hasInStoreOption !== false,
    save: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
}
