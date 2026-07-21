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
import { revealContact, revealedPII } from "@/lib/credits/unlockContact";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ListingModule = "real_estate" | "vehicles" | "product" | "services" | "freight" | "travel";

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
      // P0/LGPD: colunas EXPLÍCITAS não-PII — visitor_phone/name/message só saem
      // pela RPC wallet_reveal_contact (lockdown de coluna no banco; select("*") falha)
      const { data, error } = await (supabase.from("advertiser_contact_intentions") as any)
        .select("id, created_at, listing_module, listing_id, advertiser_user_id, interest_type, masked_preview, city, region, status, credits_cost, unlock_paid_at, notified_at, opened_at")
        .eq("advertiser_user_id", user!.id)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      // mescla a PII já revelada NESTA sessão (o banco não devolve mais o telefone)
      const rows = ((data || []) as ContactIntention[]).map(r =>
        revealedPII.has(r.id) ? { ...r, ...revealedPII.get(r.id) } : r
      );
      if (rows.length === 0) return rows;

      // ── Enriquecer com título/imagem do anúncio ───────────────────────────
      const realEstateIds = Array.from(new Set(rows.filter(r => r.listing_module === "real_estate").map(r => r.listing_id)));
      const vehicleIds = Array.from(new Set(rows.filter(r => r.listing_module === "vehicles").map(r => r.listing_id)));
      const productIds = Array.from(new Set(rows.filter(r => r.listing_module === "product").map(r => r.listing_id)));
      const serviceIds = Array.from(new Set(rows.filter(r => r.listing_module === "services").map(r => r.listing_id)));
      const freightIds = Array.from(new Set(rows.filter(r => r.listing_module === "freight").map(r => r.listing_id)));
      const travelIds = Array.from(new Set(rows.filter(r => r.listing_module === "travel").map(r => r.listing_id)));

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
          // A moderação às vezes só copia o path original pra public_masked_storage_path
          // sem gerar arquivo novo no bucket público — só confia se for path DIFERENTE.
          const hasMasked = !!m.public_masked_storage_path && m.public_masked_storage_path !== m.original_storage_path;
          const path = hasMasked ? m.public_masked_storage_path : m.original_storage_path;
          const url = getListingImageUrl(path, hasMasked ? 'public' : 'original');
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
            const hasMasked = !!m.public_masked_storage_path && m.public_masked_storage_path !== m.original_storage_path;
            const path = hasMasked ? m.public_masked_storage_path : m.original_storage_path;
            if (!path) return;
            const url = path.startsWith("http") ? path : getListingImageUrl(path, hasMasked ? 'public' : 'original');
            if (url) imageMap.set(m.listing_id, url);
          });
        }
      }

      if (serviceIds.length > 0) {
        const { data: servs } = await (supabase.from("service_listings") as any)
          .select("id, title")
          .in("id", serviceIds);
        (servs || []).forEach((s: any) => {
          if (s.title) titleMap.set(s.id, s.title);
        });

        const { data: sMedia } = await (supabase.from("service_media") as any)
          .select("listing_id, public_masked_storage_path, original_storage_path, sort_order")
          .in("listing_id", serviceIds)
          .order("sort_order", { ascending: true });
        (sMedia || []).forEach((m: any) => {
          if (imageMap.has(m.listing_id)) return;
          const hasMasked = !!m.public_masked_storage_path && m.public_masked_storage_path !== m.original_storage_path;
          const path = hasMasked ? m.public_masked_storage_path : m.original_storage_path;
          if (!path) return;
          const url = path.startsWith("http") ? path : getListingImageUrl(path, hasMasked ? 'public' : 'original');
          if (url) imageMap.set(m.listing_id, url);
        });
      }

      if (freightIds.length > 0) {
        const { data: frts } = await (supabase.from("freight_listings") as any)
          .select("id, title")
          .in("id", freightIds);
        (frts || []).forEach((f: any) => {
          if (f.title) titleMap.set(f.id, f.title);
        });

        const { data: fMedia } = await (supabase.from("freight_media") as any)
          .select("listing_id, public_masked_storage_path, original_storage_path, sort_order")
          .in("listing_id", freightIds)
          .order("sort_order", { ascending: true });
        (fMedia || []).forEach((m: any) => {
          if (imageMap.has(m.listing_id)) return;
          const hasMasked = !!m.public_masked_storage_path && m.public_masked_storage_path !== m.original_storage_path;
          const path = hasMasked ? m.public_masked_storage_path : m.original_storage_path;
          if (!path) return;
          const url = path.startsWith("http") ? path : getListingImageUrl(path, hasMasked ? 'public' : 'original');
          if (url) imageMap.set(m.listing_id, url);
        });
      }

      // ── Viagens & Turismo ──
      if (travelIds.length > 0) {
        const { data: travels } = await (supabase.from("travel_listings") as any)
          .select("id, title")
          .in("id", travelIds);
        (travels || []).forEach((t: any) => {
          if (t.title) titleMap.set(t.id, t.title);
        });
        const { data: tMedia } = await (supabase.from("travel_media") as any)
          .select("listing_id, original_storage_path, public_masked_storage_path, sort_order")
          .in("listing_id", travelIds)
          .order("sort_order", { ascending: true });
        (tMedia || []).forEach((m: any) => {
          if (imageMap.has(m.listing_id)) return;
          const p = m.public_masked_storage_path || m.original_storage_path;
          if (!p) return;
          const url = p.startsWith("http") ? p : supabase.storage.from("real-estate-original").getPublicUrl(p).data.publicUrl;
          if (url) imageMap.set(m.listing_id, url);
        });
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
        (payload: any) => {
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

          // Não força o redirect se o dono estiver numa página PÚBLICA de anúncio
          // (ex.: testando/visitando o próprio veículo/imóvel) — só faz sentido
          // puxar pro painel quando ele já está em outra área do próprio painel.
          const isPublicListingPage =
            window.location.pathname.startsWith("/veiculos/") ||
            window.location.pathname.startsWith("/imoveis/") ||
            window.location.pathname.startsWith("/servicos/") ||
            window.location.pathname.startsWith("/fretes/") ||
            window.location.pathname.startsWith("/viagens/");

          // Caixa certa conforme o segmento do lead — sem isso, lead de veículo/
          // imóvel mandava o dono pra caixa genérica do lojista, onde esse lead
          // nem aparece.
          const leadModule = payload?.new?.listing_module;
          const targetPath =
            leadModule === "vehicles" ? "/anunciante/veiculos/mensagens"
            : leadModule === "real_estate" ? "/anunciante/imoveis/mensagens"
            : leadModule === "services" ? "/anunciante/servicos/mensagens"
            : leadModule === "freight" ? "/anunciante/fretes/mensagens"
            : leadModule === "travel" ? "/anunciante/viagens/mensagens"
            : "/anunciante/mensagens";

          if (
            typeof window !== "undefined" &&
            !window.location.pathname.includes(targetPath) &&
            !isPublicListingPage
          ) {
            window.location.assign(targetPath);
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

  // ── Unlock via Carteira de Créditos (Wallet Core) ─────────────────────────
  //  Rota ÚNICA: wallet_unlock_contact (2% do valor anunciado, permanente por
  //  anúncio+comprador). Resolve módulo/anúncio/comprador a partir da intenção.
  //  (o parâmetro `amount` é ignorado — o valor é calculado no banco)
  const unlockIntention = useCallback(
    async (intentionId: string, _amount: number = 0): Promise<{
      success: boolean;
      error?: string;
      credits_charged?: number;
      buy_credits_cta?: boolean;
      required?: number;
      available?: number;
    }> => {
      const intent = intentions.find((i) => i.id === intentionId);
      if (!intent) return { success: false, error: "intention_not_found" };

      // P0/LGPD: porta única — o buyer_key nasce no SERVIDOR; a RPC cobra
      // (reusando wallet_unlock_contact) e só então devolve o telefone.
      const r = await revealContact(intentionId);

      if (!r.success) {
        return {
          success: false,
          error: r.error,
          buy_credits_cta: r.buy_credits_cta ?? (r.error === "insufficient_credits"),
          required: r.required_cents != null ? r.required_cents / 100 : undefined,
          available: r.available_cents != null ? r.available_cents / 100 : undefined,
        };
      }

      // status='unlocked' já foi gravado pela própria RPC (server-side)
      queryClient.invalidateQueries({ queryKey: ["contact-intentions", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["advertiser-credits"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-balance", user?.id] });

      return { success: true, credits_charged: r.charged_cents != null ? r.charged_cents / 100 : 0 };
    },
    [intentions, user?.id, queryClient]
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
    async (params: RegisterIntentionParams): Promise<{ success: boolean; error?: string; intention_id?: string }> => {
      setIsLoading(true);
      try {
        let rpcResult: any;
        let rpcError: any;

        if (params.listingModule === "travel") {
          const { data, error } = await supabase.rpc(
            "register_travel_contact_intention" as any,
            {
              p_listing_id:      params.listingId,
              p_interest_type:   params.interestType ?? "message_request",
              p_visitor_name:    params.visitorName || null,
              p_visitor_phone:   params.visitorPhone || null,
              p_visitor_message: params.visitorMessage || null,
              p_city:            params.city || null,
              p_region:          params.region || null,
            }
          );
          rpcResult = data; rpcError = error;
        } else {
          const { data, error } = await supabase.rpc(
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
          rpcResult = data; rpcError = error;
        }

        const result = rpcResult as any;

        if (rpcError || !result?.success) {
          return { success: false, error: result?.error || rpcError?.message || "unknown" };
        }

        return { success: true, intention_id: result?.intention_id || undefined };
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
