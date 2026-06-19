/**
 * useContactIntentions — Sistema de Intenção de Contato
 *
 * Para o ANUNCIANTE:
 *   - lista intenções (leads) dos seus anúncios
 *   - unlock via RPC backend-driven com débito no ledger
 *   - realtime: badge atualiza quando novo lead chega
 *
 * Para a PÁGINA PÚBLICA:
 *   - useRegisterContactIntention → chama RPC register_contact_intention
 */

/**
 * 🛡️ BLINDAGEM DE CÓDIGO (NÃO ALTERAR SEM AUTORIZAÇÃO EXPLÍCITA) 🛡️
 * O sistema de redirecionamento, bip de áudio e atualizações automáticas
 * desta página foram homologados e estabilizados.
 * 
 * REGRA DO PROJETO: Qualquer refatoração nas outras áreas da plataforma (Veículos, etc)
 * NÃO deve modificar ou "limpar" a lógica de `queryClient.invalidateQueries` ou o
 * redirecionamento para `/anunciante/mensagens` aqui definido, pois isso quebra o
 * fluxo central de Imóveis.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getListingImageUrl } from "@/lib/real-estate/mediaUtils";
import { playLeadNotificationSound } from "@/lib/notificationSound";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ListingModule = "real_estate" | "vehicles" | "product";

export type InterestType =
  | "whatsapp_click"
  | "message_request"
  | "proposal"
  | "view_contact";

export type IntentionStatus =
  | "pending_unlock"
  | "unlocked"
  | "expired"
  | "cancelled";

export interface ContactIntention {
  id: string;
  created_at: string;
  listing_module: ListingModule;
  listing_id: string;
  advertiser_user_id: string;
  interest_type: InterestType;
  visitor_name: string | null;
  visitor_phone: string | null;
  visitor_message: string | null;
  masked_preview: string | null;
  city: string | null;
  region: string | null;
  status: IntentionStatus;
  credits_cost: number;
  unlock_paid_at: string | null;
  notified_at: string | null;
  opened_at: string | null;
  // Enriquecimento client-side (título/imagem do anúncio associado)
  listing_title?: string | null;
  listing_image_url?: string | null;
}

export interface IntentionPricing {
  listing_module: string;
  interest_type: string;
  credits_cost: number;
  label: string;
}

// Label amigável para tipo de interesse
export const INTEREST_TYPE_LABELS: Record<InterestType, string> = {
  whatsapp_click: "WhatsApp",
  message_request: "Mensagem",
  proposal: "Proposta",
  view_contact: "Ver Contato",
};

// ─── Hook do Anunciante ─────────────────────────────────────────────────────

export function useContactIntentions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Query principal de intenções
  const { data: intentions = [], isLoading } = useQuery({
    queryKey: ["contact-intentions", user?.id],
    enabled: !!user?.id,
    // Polling de 10s + revalida ao voltar pra aba, sem precisar de F5.
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await (supabase.from("advertiser_contact_intentions") as any)
        .select("*")
        .eq("advertiser_user_id", user!.id)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      const rows = (data || []) as ContactIntention[];
      if (rows.length === 0) return rows;

      // ── Enriquecer com título/imagem do anúncio ───────────────────────────
      const realEstateIds = Array.from(new Set(rows.filter(r => r.listing_module === "real_estate").map(r => r.listing_id)));
      const vehicleIds = Array.from(new Set(rows.filter(r => r.listing_module === "vehicles").map(r => r.listing_id)));
      const productIds = Array.from(new Set(rows.filter(r => r.listing_module === "product").map(r => r.listing_id)));

      const titleMap = new Map<string, string>();
      const imageMap = new Map<string, string>();

      if (realEstateIds.length > 0) {
        const { data: props } = await (supabase.from("real_estate_listings") as any)
          .select("id, title")
          .in("id", realEstateIds);
        (props || []).forEach((p: any) => {
          if (p.title) titleMap.set(p.id, p.title);
        });

        const { data: mediaRows } = await (supabase.from("real_estate_media") as any)
          .select("listing_id, public_masked_storage_path, original_storage_path, sort_order")
          .in("listing_id", realEstateIds)
          .order("sort_order", { ascending: true });
        (mediaRows || []).forEach((m: any) => {
          if (imageMap.has(m.listing_id)) return;
          const path = m.public_masked_storage_path || m.original_storage_path;
          const url = getListingImageUrl(path);
          if (url) imageMap.set(m.listing_id, url);
        });
      }

      if (vehicleIds.length > 0) {
        const { data: vehs } = await (supabase.from("vehicle_listings") as any)
          .select("id, title, brand, model")
          .in("id", vehicleIds);
        (vehs || []).forEach((v: any) => {
          const title = v.title || [v.brand, v.model].filter(Boolean).join(" ") || null;
          if (title) titleMap.set(v.id, title);
        });

        const missingVehicleIds = vehicleIds.filter(id => !imageMap.has(id));
        if (missingVehicleIds.length > 0) {
          const { data: vMedia } = await (supabase.from("vehicle_media") as any)
            .select("listing_id, public_masked_storage_path, original_storage_path")
            .in("listing_id", missingVehicleIds);
          (vMedia || []).forEach((m: any) => {
            if (imageMap.has(m.listing_id)) return;
            const path = m.public_masked_storage_path || m.original_storage_path;
            if (!path) return;
            const url = path.startsWith("http") ? path : getListingImageUrl(path);
            if (url) imageMap.set(m.listing_id, url);
          });
        }
      }

      // ── Produtos do /mercado (merchant_marketing_products + advertiser_listings) ──
      if (productIds.length > 0) {
        // Helper: normaliza path do storage → URL pública
        const resolveStorageUrl = (raw: string | null | undefined, bucket = "marketing-materials"): string | null => {
          if (!raw) return null;
          if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) return raw;
          try {
            const { data } = supabase.storage.from(bucket).getPublicUrl(raw);
            return data?.publicUrl ?? null;
          } catch {
            return null;
          }
        };

        // 1. merchant_marketing_products
        const { data: mmpRows } = await (supabase.from("merchant_marketing_products") as any)
          .select("*")
          .in("id", productIds);
        (mmpRows || []).forEach((p: any) => {
          const title = p.title || p.name || p.nome || null;
          if (title) titleMap.set(p.id, title);
          const rawImg = p.image_url || p.cover_image_url || p.imagem_url || p.thumbnail_url || null;
          const img = resolveStorageUrl(rawImg);
          if (img) imageMap.set(p.id, img);
        });

        // 2. advertiser_listings — completa o que faltar (título OU imagem)
        const missing = productIds.filter(id => !titleMap.has(id) || !imageMap.has(id));
        if (missing.length > 0) {
          const { data: alRows } = await (supabase.from("advertiser_listings") as any)
            .select("id, title, cover_image_url, advertiser_listing_media(media_url)")
            .in("id", missing);
          (alRows || []).forEach((p: any) => {
            if (p.title && !titleMap.has(p.id)) titleMap.set(p.id, p.title);
            if (imageMap.has(p.id)) return;
            const mediaPath = p.cover_image_url || p.advertiser_listing_media?.[0]?.media_url || null;
            const url = resolveStorageUrl(mediaPath);
            if (url) imageMap.set(p.id, url);
          });
        }
      }

      return rows.map(r => ({
        ...r,
        listing_title: titleMap.get(r.listing_id) ?? null,
        listing_image_url: imageMap.get(r.listing_id) ?? null,
      }));
    },
  });

  // Query de preços para exibição dos custos
  const { data: pricing = [] } = useQuery({
    queryKey: ["contact-intention-pricing"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data } = await (supabase.from("contact_intention_pricing") as any)
        .select("listing_module, interest_type, credits_cost, label")
        .eq("is_active", true);
      return (data || []) as IntentionPricing[];
    },
  });

  // Realtime: novo lead → invalidar cache automaticamente + tocar som
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`contact-intentions-realtime-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "advertiser_contact_intentions",
          filter: `advertiser_user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["contact-intentions", user.id] });
          // Bip de notificação ao receber lead em tempo real
          void playLeadNotificationSound();
          
          toast.success("Nova mensagem recebida! Vá para as mensagens.", {
            duration: 10000,
          });

          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification("Viagg-TX8 Anunciante", {
              body: "Você tem um novo cliente tentando contatar! Clique para ver suas mensagens.",
            });
          } else if (typeof Notification !== "undefined" && Notification.permission !== "denied") {
            Notification.requestPermission();
          }

          if (typeof window !== "undefined" && !window.location.pathname.includes("/anunciante/mensagens")) {
            window.location.assign("/anunciante/mensagens");
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "advertiser_contact_intentions",
          filter: `advertiser_user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["contact-intentions", user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Contagem de pendentes para badge
  const pendingCount = intentions.filter((i) => i.status === "pending_unlock").length;

  // ── Unlock via RPC backend-driven ─────────────────────────────────────────
  const unlockIntention = useCallback(
    async (intentionId: string, amount: number = 9): Promise<{  // By default use 9 as requested by user
      success: boolean;
      error?: string;
      credits_charged?: number;
      buy_credits_cta?: boolean;  // sinal: exibir CTA de compra de créditos
      required?: number;
      available?: number;
    }> => {
      const { data: rpcResult, error } = await supabase.rpc(
        "unlock_contact_intention" as any,  // RPC blindada — apenas créditos comprados
        { 
          p_intention_id: intentionId,
          p_amount: amount
        }
      );

      const result = rpcResult as any;

      if (error || !result?.success) {
        const errCode = result?.error || error?.message || "unknown";
        return {
          success: false,
          error: errCode,
          buy_credits_cta: result?.buy_credits_cta ?? false,
          required: result?.required,
          available: result?.available,
        };
      }

      // Invalida saldo E lista de intenções
      queryClient.invalidateQueries({ queryKey: ["contact-intentions", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["advertiser-credits"] });

      return {
        success: true,
        credits_charged: result.credits_charged,
      };
    },
    [user?.id, queryClient]
  );

  // Buscar custo de desbloqueio para um módulo/tipo específico
  const getCreditsCost = useCallback(
    (module: ListingModule, interestType: InterestType): number => {
      const rule = pricing.find(
        (p) => p.listing_module === module && p.interest_type === interestType
      );
      return rule?.credits_cost ?? 9;
    },
    [pricing]
  );

  // ── Excluir lead / intenção ────────────────────────────────────────────────
  const deleteIntention = useCallback(
    async (intentionId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        // Exclusão Lógica: Apenas alteramos o status para 'cancelled'. 
        // Não podemos deletar (DELETE físico) diretamente pois isso quebra a integridade (Chave Estrangeira)
        // com a tabela 'advertiser_contact_intention_events'.
        const { data, error } = await supabase
          .from("advertiser_contact_intentions")
          .update({ status: 'cancelled' })
          .eq("id", intentionId)
          .eq("advertiser_user_id", user!.id)
          .select("id");

        if (error) {
          return { success: false, error: error.message };
        }

        if (!data || data.length === 0) {
          return { success: false, error: "Permissão Negada (RLS) ao atualizar." };
        }

        queryClient.invalidateQueries({ queryKey: ["contact-intentions", user?.id] });
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || "Erro inesperado ao excluir contato" };
      }
    },
    [user?.id, queryClient]
  );

  return {
    intentions,
    isLoading,
    pendingCount,
    pricing,
    unlockIntention,
    deleteIntention,
    getCreditsCost,
  };
}

// ─── Hook para Registro na Página Pública ──────────────────────────────────

export interface RegisterIntentionParams {
  listingModule: ListingModule;
  listingId: string;
  interestType?: InterestType;
  visitorName: string;
  visitorPhone: string;
  visitorMessage?: string;
  city?: string;
  region?: string;
}

export function useRegisterContactIntention() {
  const [isLoading, setIsLoading] = useState(false);

  const register = useCallback(
    async (params: RegisterIntentionParams): Promise<{ success: boolean; error?: string }> => {
      setIsLoading(true);
      try {
        const { data: rpcResult, error } = await supabase.rpc(
          "register_contact_intention" as any,
          {
            p_listing_module:  params.listingModule,
            p_listing_id:      params.listingId,
            p_interest_type:   params.interestType ?? "message_request",
            p_visitor_name:    params.visitorName || null,
            p_visitor_phone:   params.visitorPhone || null,
            p_visitor_message: params.visitorMessage || null,
            p_city:            params.city || null,
            p_region:          params.region || null,
          }
        );

        const result = rpcResult as any;

        if (error || !result?.success) {
          return { success: false, error: result?.error || error?.message || "unknown" };
        }

        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || "unexpected_error" };
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { register, isLoading };
}
