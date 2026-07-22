/**
 * MerchantArremate — Página dedicada de Arremates do Lojista
 *
 * Central de gestão de ofertas, decisões, comunicação com clientes
 * e integração com a página de Pedidos.
 * Separada do módulo de Leilão.
 */
import { useState, useMemo, useEffect } from "react";
import { useArremate, type ArremateOffer } from "@/hooks/useArremate";
import { useAdvertiserAuctions, type AuctionListing } from "@/hooks/useAdvertiserAuctions";
import { useMerchantCredits } from "@/hooks/useMerchantCredits";
import { useMerchantNotificationBadges } from "@/hooks/useMerchantNotificationBadges";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Tag, CheckCircle, XCircle, Loader2, AlertCircle,
  Users, MessageSquare, Package, ClipboardList,
  Search, RefreshCw, ChevronDown, ChevronUp, Clock, Zap, Plus, ImagePlus,
  Edit, Trash2, PauseCircle, PlayCircle, Coins, CircleDollarSign, CheckCircle2, ChevronRight
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { MerchantRecentEvents } from "@/components/merchant/MerchantRecentEvents";

// ─── Helpers ────────────────────────────
function normalizeImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

// ─── KPI Card ───────────────────────────
function KPICard({ icon: Icon, label, value, color, accent }: {
  icon: typeof Tag; label: string; value: number; color: string; accent: string;
}) {
  return (
    <div className="bg-[#1B1F24] rounded-2xl p-4 shadow-lg shadow-black/20 border border-[#2A3038] flex items-center gap-4 min-w-0 hover:border-[#FF6A00]/30 transition-all group">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 ${accent}`}>
        <Icon className={`h-6 w-6 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-black text-[#F5F7FA] leading-tight">{value}</p>
        <p className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-[0.1em] truncate">{label}</p>
      </div>
    </div>
  );
}

// ─── Status helpers ─────────────────────
function getOfferStatus(offer: ArremateOffer) {
  if (offer.status === "accepted") return { label: "Arremate aceito", color: "bg-emerald-500", text: "text-white", icon: "✅" };
  if (offer.status === "rejected") return { label: "Oferta recusada", color: "bg-red-500/20", text: "text-red-400", icon: "❌" };
  if (offer.status === "expired") return { label: "Expirada", color: "bg-gray-800", text: "text-gray-400", icon: "⏰" };
  if (offer.status === "cancelled") return { label: "Cancelada", color: "bg-gray-800", text: "text-gray-400", icon: "🚫" };
  return { label: "Oferta recebida", color: "bg-[#FF6A00]/20", text: "text-[#FF6A00]", icon: "⏳" };
}

// ─── ArremateOfferCard ──────────────────
function ArremateOfferCard({
  offer,
  listing,
  onRespond,
  isResponding,
  onAcceptWithCredits,
  availableCredits,
  usageRules,
}: {
  offer: ArremateOffer;
  listing?: AuctionListing;
  onRespond: (id: string, accept: boolean) => void;
  isResponding?: boolean;
  onAcceptWithCredits?: (offer: ArremateOffer) => Promise<boolean>;
  availableCredits?: number;
  usageRules?: { feature_code: string; credits_cost: number }[];
}) {
  const [accepting, setAccepting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const isAccepted = offer.status === "accepted";
  const isRejected = offer.status === "rejected";
  const isPending = offer.status === "pending";

  const offerValueReais = (offer.amount_cents || 0) / 100;
  const status = getOfferStatus(offer);

  // Dynamic costs from Supabase usage rules
  const contactCost = usageRules?.find(r => r.feature_code === 'offer_accept_contact_unlock')?.credits_cost ?? 2;
  const intentionCost = usageRules?.find(r => r.feature_code === 'purchase_intention_received')?.credits_cost ?? 5;
  const totalCost = contactCost + intentionCost;

  const whatsappLink = offer.customer_whatsapp
    ? `https://wa.me/55${offer.customer_whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Olá${offer.customer_name ? ` ${offer.customer_name.split(" ")[0]}` : ""}! Vi sua oferta de ${formatBRL(offerValueReais)} na plataforma Viagg-TX8. Vamos conversar?`
      )}`
    : null;

  const handleAccept = async () => {
    if (!onAcceptWithCredits) { onRespond(offer.id, true); return; }
    setAccepting(true);
    await onAcceptWithCredits(offer);
    setAccepting(false);
  };

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-all duration-300 ${
        isAccepted
          ? "bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/5"
          : isRejected
          ? "bg-[#1B1F24]/50 border-[#2A3038] opacity-60"
          : "bg-[#1B1F24] border-[#2A3038] shadow-xl shadow-black/20 hover:border-[#FF6A00]/30"
      }`}
    >
      {/* ── Status Banner ── */}
      {isAccepted && (
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-white" />
              <span className="text-xs font-black text-white uppercase tracking-wider">
                Arremate aceito ✅
              </span>
              <span className="text-[9px] font-black bg-white/20 text-white px-2 py-0.5 rounded-full uppercase">
                Finalizado
              </span>
            </div>
            <span className="text-[10px] text-white/70 font-medium">
              {offer.updated_at && new Date(offer.updated_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            </span>
          </div>
          <p className="text-[11px] text-white/90 mt-1 font-bold">
            📋 Pedido gerado via Arremate — Enviado para Gestão de Pedidos
          </p>
        </div>
      )}

      {isRejected && (
        <div className="bg-gradient-to-r from-red-500/80 to-red-600/80 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-white" />
            <span className="text-xs font-black text-white uppercase tracking-wider">
              Oferta recusada
            </span>
          </div>
          <span className="text-[10px] text-white/70 font-medium">
            {offer.updated_at && new Date(offer.updated_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </span>
        </div>
      )}

      {isPending && (
        <div className="bg-gradient-to-r from-[#FF6A00] to-[#FF8C33] px-4 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-white" />
              <span className="text-xs font-black text-white uppercase tracking-wider animate-pulse">
                Oferta recebida
              </span>
              <span className="text-[9px] font-black bg-white/20 text-white px-2 py-0.5 rounded-full uppercase">
                Novo Arremate
              </span>
            </div>
          </div>
          <p className="text-[11px] text-white/90 mt-1 font-bold">
            ⏳ Aguardando sua decisão (Aceite ou Recusa)
          </p>
        </div>
      )}

      <div className="p-5 space-y-4">
        {/* ── Product Info ── */}
        {listing && (
          <div className="flex items-center gap-4 bg-[#14171B] border border-[#2A3038] rounded-2xl p-3 hover:border-[#FF6A01]/20 transition-all">
            {listing.product_image_url ? (
              <img src={listing.product_image_url} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0 border border-[#2A3038]" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-[#0D0F12] flex items-center justify-center shrink-0 border border-[#2A3038]">
                <Package className="h-7 w-7 text-[#A7B0BE]/30" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-[#F5F7FA] truncate">{listing.title}</p>
              {listing.starting_bid > 0 && (
                <p className="text-xs font-bold text-[#A7B0BE]">Base: {formatBRL(listing.starting_bid)}</p>
              )}
              {listing.description && (
                <p className="text-[11px] text-[#A7B0BE]/70 truncate mt-1">{listing.description}</p>
              )}
            </div>
            <span className="text-[10px] font-black uppercase px-3 py-1.5 rounded-xl bg-[#FF6A00]/10 text-[#FF6A00] border border-[#FF6A00]/20 shrink-0">
              Arremate
            </span>
          </div>
        )}

        {/* ── Offer Value (hero) ── */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#A7B0BE] font-black mb-1">
              Valor Ofertado
            </p>
            <div className="flex items-baseline gap-2">
              <p className={`text-3xl font-black tracking-tight ${isAccepted ? "text-emerald-400" : "text-[#F5F7FA]"}`}>
                {formatBRL(offerValueReais)}
              </p>
              {(offer.quantity || 1) > 1 && (
                <span className="text-sm font-black text-[#A7B0BE]">
                  ×{offer.quantity} unit.
                </span>
              )}
            </div>
          </div>
          
          {!isAccepted && !isRejected && (
            <div className="flex items-center gap-1.5 text-[10px] font-black text-[#FF6A00] bg-[#FF6A00]/10 px-3 py-1.5 rounded-xl border border-[#FF6A00]/20 uppercase">
              <Clock className="h-3 w-3" />
              Pendente
            </div>
          )}
        </div>

        {/* ── Customer Info ── */}
        <div className={`rounded-2xl p-4 space-y-3 ${
          isAccepted ? "bg-emerald-500/5 border border-emerald-500/20" : "bg-[#14171B] border border-[#2A3038]"
        }`}>
          <p className="text-[10px] uppercase tracking-[0.15em] text-[#A7B0BE] font-black flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-[#FF6A00]" /> Dados do Cliente
          </p>

          {offer.customer_name ? (
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-black text-white shadow-lg ${
                isAccepted ? "bg-emerald-500 shadow-emerald-500/20" : "bg-[#FF6A00] shadow-[#FF6A00]/20"
              }`}>
                {offer.customer_name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-[#F5F7FA] truncate uppercase">{offer.customer_name}</p>
                {offer.customer_whatsapp && (
                  <p className="text-xs font-bold text-[#A7B0BE] font-mono">
                    {offer.customer_whatsapp.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#A7B0BE] italic">Informações do cliente não disponíveis</p>
          )}

          {offer.message && (
            <div className="flex items-start gap-2 pt-2 border-t border-[#2A3038]">
              <MessageSquare className="h-3.5 w-3.5 text-[#FF6A00] shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-[#A7B0BE] leading-relaxed italic">"{offer.message}"</p>
            </div>
          )}
        </div>

        {/* ── WhatsApp / Communication Status (accepted only) ── */}
        {isAccepted && (
          <div className="space-y-1">
            {whatsappLink ? (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold bg-[#25D366] hover:bg-[#1fb855] text-white shadow-md shadow-green-200 transition-all"
              >
                <CheckCircle className="h-4 w-4" />
                Comunicação liberada — Abrir WhatsApp
              </a>
            ) : (
              <div className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-500 border border-gray-200">
                <AlertCircle className="h-4 w-4" />
                Comunicação liberada — Cliente não informou WhatsApp
              </div>
            )}
            <p className="text-[11px] text-center text-emerald-500 font-semibold">
              ✅ Contato desbloqueado com o aceite
            </p>
          </div>
        )}

        {/* ── Accept / Reject (pending only) ── */}
        {isPending && (
          <div className="pt-1 border-t border-gray-100 space-y-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-12 text-sm bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-sm rounded-xl"
                onClick={handleAccept}
                disabled={isResponding || accepting}
              >
                {(isResponding || accepting) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-1.5" />
                    Aceitar • {totalCost} créditos
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-12 px-4 text-xs border-red-200 text-red-500 hover:bg-red-50 font-bold rounded-xl"
                onClick={() => onRespond(offer.id, false)}
                disabled={isResponding || accepting}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" /> Recusar
              </Button>
            </div>
            <p className="text-[12px] text-center text-gray-400">
              <span className="font-semibold text-gray-500">{contactCost} de comunicação + {intentionCost} de intenção</span>
              {typeof availableCredits === "number" && (
                <span className="text-gray-300 ml-1.5">(saldo: {availableCredits})</span>
              )}
            </p>
          </div>
        )}

        {/* ── History / Audit Trail ── */}
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors w-full justify-center pt-1"
        >
          <Clock className="h-3 w-3" />
          Histórico do evento
          {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        {showHistory && (
          <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 border border-gray-100 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
              Oferta recebida em {new Date(offer.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            </div>
            {offer.status === "accepted" && offer.updated_at && (
              <>
                <div className="flex items-center gap-2 text-[11px] text-emerald-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  Aceita em {new Date(offer.updated_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-green-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                  Contato liberado em {new Date(offer.updated_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-blue-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  Enviado para Pedidos
                </div>
              </>
            )}
            {offer.status === "rejected" && offer.updated_at && (
              <div className="flex items-center gap-2 text-[11px] text-red-500">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                Recusada em {new Date(offer.updated_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              </div>
            )}
            {isPending && (
              <div className="flex items-center gap-2 text-[11px] text-amber-600">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                Aguardando decisão do lojista
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════
export default function MerchantArremate() {
  const { user } = useAuth();
  const { arremateListings: myListings, loadingMyListings, createListing, refetchMyListings, endListing: endAuction, updateListing, deleteListing } = useAdvertiserAuctions();
  const { receivedOffers, respondOffer, refetchOffers, loadingOffers } = useArremate();
  const { balance, storeId: merchantStoreId, usageRules, refetch: refetchCredits, debitCredits } = useMerchantCredits();
  const navigate = useNavigate();
  const { markSectionAsRead } = useMerchantNotificationBadges();
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const [respondingOfferId, setRespondingOfferId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "accepted" | "rejected">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // ── Create arremate state ──
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configProduct, setConfigProduct] = useState<{ id: string; name: string; price: number; image_url: string | null; description: string | null } | null>(null);
  const [configForm, setConfigForm] = useState({
    starting_price: "",
    quantity: "1",
    start_date: "",
    end_date: "",
  });

  // ── Fetch store products (product_listings) ──
  const { data: storeProducts = [], isLoading: loadingProducts } = useQuery<{ id: string; name: string; price: number; image_url: string | null; description: string | null; active: boolean }[]>({
    queryKey: ["store-products-for-arremate", user?.id],
    queryFn: async () => {
      const [pRes, rRes, vRes] = await Promise.all([
        supabase.from("product_listings").select("id, title, price, cover_image_url, description, is_active").eq("owner_user_id", user!.id).order("created_at", { ascending: false }),
        supabase.from("real_estate_listings").select("id, title, price_brl, description, visibility_status, real_estate_media(original_storage_path, public_masked_storage_path)").eq("owner_user_id", user!.id).order("created_at", { ascending: false }),
        supabase.from("vehicle_listings").select("id, title, price_brl, description, visibility_status, cover_image_url, vehicle_media(original_storage_path, public_masked_storage_path)").eq("owner_user_id", user!.id).order("created_at", { ascending: false })
      ]);

      const formats: any[] = [];

      if (pRes.data) {
        formats.push(...pRes.data.map((p: any) => ({
          id: p.id,
          name: `[Produto] ${p.title || "Sem título"}`,
          price: p.price || 0,
          image_url: p.cover_image_url || null,
          description: p.description || null,
          active: p.is_active ?? true,
        })));
      }

      if (rRes.data) {
        formats.push(...rRes.data.map((r: any) => {
          let img = null;
          if (r.real_estate_media?.length > 0) {
            const p = r.real_estate_media[0].public_masked_storage_path || r.real_estate_media[0].original_storage_path;
            if (p) img = supabase.storage.from("real-estate-public").getPublicUrl(p).data.publicUrl;
          }
          return {
            id: r.id,
            name: `[Imóvel] ${r.title || "Sem título"}`,
            price: r.price_brl || 0,
            image_url: img,
            description: r.description || null,
            active: r.visibility_status === 'published',
          };
        }));
      }

      if (vRes.data) {
        formats.push(...vRes.data.map((v: any) => {
          let img: string | null = v.cover_image_url || null;
          if (!img && v.vehicle_media?.length > 0) {
            const p = v.vehicle_media[0].public_masked_storage_path || v.vehicle_media[0].original_storage_path;
            if (p) img = p.startsWith("http") ? p : supabase.storage.from("real-estate-original").getPublicUrl(p).data.publicUrl;
          }
          return {
            id: v.id,
            name: `[Veículo] ${v.title || "Sem título"}`,
            price: v.price_brl || 0,
            image_url: img,
            description: v.description || null,
            active: v.visibility_status === 'published',
          };
        }));
      }

      return formats;
    },
    enabled: !!user,
  });

  const { data: merchantStore } = useQuery({
    queryKey: ["merchant-store-arremate", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: profile } = await (supabase.from("profiles") as any)
        .select("full_name, nome_loja, avatar_url, logo_url")
        .eq("id", user!.id)
        .maybeSingle();

      const { data } = await (supabase.from("merchant_stores") as any)
        .select("id, city, region, logo_url, nome_loja")
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();

      if (data) {
        return {
          ...data,
          logo_url: data.logo_url || profile?.logo_url || profile?.avatar_url || null,
          nome_loja: data.nome_loja || profile?.nome_loja || profile?.full_name || "Minha Loja",
        };
      }

      return {
        id: null,
        logo_url: profile?.logo_url || profile?.avatar_url || null,
        nome_loja: profile?.nome_loja || profile?.full_name || "Minha Loja",
      };
    },
  });

  // Mark arremate section as read on mount
  useEffect(() => { markSectionAsRead("arremate"); }, []);

  // Realtime: auto-refetch when arremate_offers change
  useEffect(() => {
    const channel = supabase
      .channel("arremate-page-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "arremate_offers" },
        () => { refetchOffers(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "auction_listings" },
        () => { refetchMyListings(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetchOffers, refetchMyListings]);

  // Filter only arremate listings
  const arremateListings = useMemo(
    () => myListings.filter(l => (l as any).listing_type === "arremate"),
    [myListings]
  );

  const arremateListingIds = useMemo(
    () => new Set(arremateListings.map(l => l.id)),
    [arremateListings]
  );

  const arremateOffers = useMemo(
    () => receivedOffers.filter(o => arremateListingIds.has(o.arremate_listing_id)),
    [receivedOffers, arremateListingIds]
  );

  // Listing map for quick lookup
  const listingMap = useMemo(() => {
    const map = new Map<string, AuctionListing>();
    arremateListings.forEach(l => map.set(l.id, l));
    return map;
  }, [arremateListings]);

  // Filter by status + search
  const filteredOffers = useMemo(() => {
    let result = arremateOffers;
    if (statusFilter !== "all") {
      result = result.filter(o => o.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(o => {
        const listing = listingMap.get(o.arremate_listing_id);
        return (
          (o.customer_name?.toLowerCase().includes(q)) ||
          (listing?.title?.toLowerCase().includes(q)) ||
          (o.customer_whatsapp?.includes(q))
        );
      });
    }
    return result;
  }, [arremateOffers, statusFilter, searchQuery, listingMap]);

  // KPIs
  const kpis = useMemo(() => ({
    total: arremateOffers.length,
    pending: arremateOffers.filter(o => o.status === "pending").length,
    accepted: arremateOffers.filter(o => o.status === "accepted").length,
    rejected: arremateOffers.filter(o => o.status === "rejected").length,
    listings: arremateListings.length,
  }), [arremateOffers, arremateListings]);

  // Handlers
  const handleRefresh = async () => {
    setRefreshing(true);
    await refetchMyListings();
    await refetchOffers();
    await refetchCredits();
    setRefreshing(false);
  };

  const handleRespondOffer = (offerId: string, accept: boolean) => {
    setRespondingOfferId(offerId);
    respondOffer.mutate(
      { offerId, accept },
      {
        onSettled: () => {
          setRespondingOfferId(null);
          refetchOffers();
        },
      }
    );
  };

  const handleAcceptWithCredits = async (offer: ArremateOffer): Promise<boolean> => {
    const resolvedStoreId = merchantStoreId || (await (async () => {
      const { data: s } = await (supabase.from("merchant_stores") as any)
        .select("id").eq("user_id", user!.id).single();
      return s?.id || null;
    })());

    if (!resolvedStoreId) {
      const { toast } = await import("sonner");
      toast.error("Loja não encontrada. Tente recarregar a página.");
      return false;
    }

    const { data: rpcResult, error } = await supabase.rpc("accept_offer_with_credits" as any, {
      p_offer_id: offer.id,
      p_store_id: resolvedStoreId,
    });

    const result = rpcResult as any;

    if (error) {
      console.error("[accept_offer_with_credits] RPC error:", error);
      const { toast } = await import("sonner");
      toast.error("Erro ao aceitar oferta. Tente novamente.");
      return false;
    }

    if (!result?.success) {
      const { toast } = await import("sonner");
      if (result?.error === "insufficient_credits") {
        toast.error(
          `Créditos insuficientes! Necessário: ${result.required} créditos. Saldo: ${result.available}. Recarregue seus créditos.`,
          { action: { label: "Recarregar", onClick: () => window.location.hash = "#plans" } }
        );
      } else {
        toast.error(`Erro: ${result?.error || "desconhecido"}`);
      }
      return false;
    }

    const { toast } = await import("sonner");
    if (result.already_accepted) {
      toast.info("Oferta já aceita anteriormente.");
    } else {
      toast.success(`Oferta aceita! ${result.credits_charged} créditos debitados. Comunicação liberada!`);
    }
    refetchCredits();
    refetchOffers();
    return true;
  };

  const filterTabs = [
    { key: "all" as const, label: "Todas", count: kpis.total },
    { key: "pending" as const, label: "Pendentes", count: kpis.pending },
    { key: "accepted" as const, label: "Aceitas", count: kpis.accepted },
    { key: "rejected" as const, label: "Recusadas", count: kpis.rejected },
  ];

  const isLoading = loadingMyListings || loadingOffers;

  return (
    <div className="px-4 pt-4 pb-28 lg:px-10 xl:px-16 max-w-5xl w-full mx-auto space-y-5">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between bg-[#1B1F24] border border-[#2A3038] p-6 rounded-3xl shadow-2xl shadow-black/40">
        <div className="flex items-center gap-4">
          {(() => {
            const storeImage = normalizeImageUrl(merchantStore?.logo_url);
            return storeImage ? (
              <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-[#FF6A00]/40 bg-[#121418] shadow-lg shadow-[#FF6A00]/20 flex items-center justify-center shrink-0">
                <img src={storeImage} alt={merchantStore?.nome_loja || "Loja"} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6A00] to-[#FF8C33] flex items-center justify-center shadow-lg shadow-[#FF6A00]/20 shrink-0">
                <Tag className="h-8 w-8 text-white stroke-[2.5px]" />
              </div>
            );
          })()}
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-3xl font-black text-[#F5F7FA] tracking-tight uppercase">Arremate</h1>
              {merchantStore?.nome_loja && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FF6A00]/10 border border-[#FF6A00]/30 text-[#FF6A00] text-xs font-bold uppercase tracking-wider">
                  {merchantStore.nome_loja}
                </span>
              )}
            </div>
            <p className="text-[11px] font-bold text-[#A7B0BE] uppercase tracking-[0.2em] mt-1 opacity-70">
              Venda Direta • Ofertas • Conversão Real
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="w-12 h-12 rounded-2xl border border-[#2A3038] bg-[#14171B] flex items-center justify-center hover:border-[#FF6A01]/40 hover:bg-[#1B1F24] transition-all disabled:opacity-50 group"
        >
          <RefreshCw className={`h-5 w-5 text-[#A7B0BE] group-hover:text-[#FF6A00] ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── Pendências ── */}
      {kpis.pending > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <Zap className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-800">
              {kpis.pending} oferta{kpis.pending > 1 ? "s" : ""} aguardando sua decisão
            </p>
            <p className="text-[11px] text-amber-600">Revise e responda para liberar a comunicação com o cliente</p>
          </div>
          <Button
            size="sm"
            className="bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl h-9 text-xs shrink-0"
            onClick={() => setStatusFilter("pending")}
          >
            Ver pendentes
          </Button>
        </div>
      )}

      <MerchantRecentEvents module="arremate" />

      {/* ═══ KPIs ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={Tag} label="Arremates" value={kpis.listings} color="text-[#FF6A00]" accent="bg-[#FF6A00]/10" />
        <KPICard icon={AlertCircle} label="Pendentes" value={kpis.pending} color="text-amber-400" accent="bg-amber-400/10" />
        <KPICard icon={CheckCircle} label="Aceitas" value={kpis.accepted} color="text-emerald-400" accent="bg-emerald-400/10" />
        <KPICard icon={ClipboardList} label="Ofertas" value={kpis.total} color="text-blue-400" accent="bg-blue-400/10" />
      </div>

      {/* ═══ SEARCH + FILTER ═══ */}
      <div className="space-y-4">
        {/* Search */}
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#A7B0BE] group-focus-within:text-[#FF6A00] transition-colors" />
          <Input
            placeholder="Buscar por produto ou cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-14 rounded-2xl border-[#2A3038] bg-[#1B1F24] shadow-2xl shadow-black/20 text-sm font-bold text-[#F5F7FA] focus:border-[#FF6A00]/50 transition-all placeholder:text-[#A7B0BE]/40 w-full"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {filterTabs.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${
                statusFilter === key
                  ? "bg-[#FF6A00] border-[#FF6A00] text-white shadow-xl shadow-[#FF6A00]/20"
                  : "bg-[#1B1F24] border-[#2A3038] text-[#A7B0BE] hover:border-[#FF6A00]/30 hover:text-[#F5F7FA]"
              }`}
            >
              {label}
              <span className={`px-2 py-0.5 rounded-full text-[9px] ${
                statusFilter === key ? "bg-white/20 text-white" : "bg-[#14171B] text-[#A7B0BE]"
              }`}>
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ CREDIT RULES INFO ═══ */}
      {(() => {
        const publishCost   = usageRules?.find(r => r.feature_code === 'auction_listing_create')?.credits_cost ?? 7;
        const endCost       = usageRules?.find(r => r.feature_code === 'auction_listing_end')?.credits_cost ?? 5;
        const contactCost   = usageRules?.find(r => r.feature_code === 'offer_accept_contact_unlock')?.credits_cost ?? 2;
        const intentionCost = usageRules?.find(r => r.feature_code === 'purchase_intention_received')?.credits_cost ?? 5;
        const acceptCost    = contactCost + intentionCost;
        return (
          <div className="bg-[#1B1F24] rounded-2xl border border-[#2A3038] px-5 py-4 shadow-xl shadow-black/20 border-l-4 border-l-[#FF6A00]">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 shrink-0">
                <div className="p-2 rounded-lg bg-[#FF6A00]/10">
                  <Coins className="h-5 w-5 text-[#FF6A00]" />
                </div>
                <div>
                  <span className="text-[11px] font-black text-[#F5F7FA] uppercase tracking-wider block">Regras de Créditos</span>
                  <p className="text-[10px] font-bold text-[#A7B0BE]">Investimento para conversão direta</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-tighter">Criar Arremate</span>
                  <span className="text-sm font-black text-[#FF6A00]">{publishCost} CRÉDITOS</span>
                </div>
                <div className="w-px h-8 bg-[#2A3038]" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-tighter">Encerrar Arremate</span>
                  <span className="text-sm font-black text-amber-400">{endCost} CRÉDITOS</span>
                </div>
                <div className="w-px h-8 bg-[#2A3038]" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-tighter">Aceitar Oferta</span>
                  <span className="text-sm font-black text-emerald-400">{acceptCost} CRÉDITOS</span>
                </div>
                <div className="w-px h-8 bg-[#2A3038]" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-tighter">Recusar Oferta</span>
                  <span className="text-sm font-black text-red-400">GRÁTIS</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ CRIAR ARREMATE CTA ═══ */}
      <Button
        className="w-full h-16 text-base font-black bg-gradient-to-r from-[#FF6A01] to-[#FF8C33] hover:from-[#FF7A1A] hover:to-[#FFA357] text-white rounded-2xl shadow-2xl shadow-[#FF6A00]/20 active:scale-[0.98] transition-all uppercase tracking-widest flex items-center justify-center gap-3"
        onClick={() => setShowProductPicker(true)}
      >
        <Plus className="h-6 w-6 stroke-[3px]" />
        Publicar Novo Arremate Agora
      </Button>

      {/* ═══ MEUS ARREMATES PUBLICADOS ═══ */}
      {arremateListings.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-black text-[#F5F7FA] flex items-center gap-2 uppercase tracking-widest">
            <Tag className="h-5 w-5 text-[#FF6A00]" />
            Meus Arremates Publicados ({arremateListings.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {arremateListings.map((listing) => {
              const listingOffers = arremateOffers.filter(o => o.arremate_listing_id === listing.id);
              const pendingCount = listingOffers.filter(o => o.status === "pending").length;
              const acceptedCount = listingOffers.filter(o => o.status === "accepted").length;
              const isActive = listing.status === "active";
              const endsAt = new Date(listing.ends_at);
              const now = new Date();
              const isExpired = endsAt <= now;

              return (
                <div key={listing.id} className={`rounded-3xl border overflow-hidden transition-all duration-300 shadow-2xl shadow-black/20 ${
                  isActive && !isExpired
                    ? "bg-[#1B1F24] border-[#2A3038] hover:border-[#FF6A00]/40"
                    : "bg-[#14171B] border-[#2A3038] opacity-60"
                }`}>
                  {/* Header badge */}
                  <div className="bg-[#14171B] border-b border-[#2A3038] px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-[#FF6A00]" />
                      <span className="text-[10px] font-black text-[#F5F7FA] uppercase tracking-widest">Arremate Ativo</span>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide ${
                      isActive && !isExpired
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-gray-800 text-gray-500"
                    }`}>
                      {isActive && !isExpired ? "Publicado" : "Encerrado"}
                    </span>
                  </div>

                  <div className="p-5 space-y-5">
                    {/* Product info */}
                    <div className="flex items-center gap-4">
                      {listing.product_image_url ? (
                        <img src={listing.product_image_url} alt="" className="w-16 h-16 rounded-2xl object-cover shrink-0 border border-[#2A3038] shadow-lg" />
                      ) : (
                        <div className="w-16 h-16 rounded-2xl bg-[#0D0F12] flex items-center justify-center shrink-0 border border-[#2A3038]">
                          <Package className="h-7 w-7 text-[#A7B0BE]/30" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-[#F5F7FA] truncate uppercase tracking-tight">{listing.title}</p>
                        <p className="text-sm font-black text-[#FF6A00] mt-0.5">{formatBRL(listing.starting_bid)}</p>
                      </div>
                    </div>

                    {/* Offer stats */}
                    <div className="flex items-center gap-4 text-[11px] font-bold text-[#A7B0BE] bg-[#14171B] p-3 rounded-2xl border border-[#2A3038]">
                      {listingOffers.length === 0 ? (
                        <span className="flex items-center gap-2 italic text-[#A7B0BE]/30">
                          <Clock className="h-4 w-4" />
                          Aguardando ofertas...
                        </span>
                      ) : (
                        <div className="flex items-center gap-4">
                          <span className="text-[#A7B0BE]/70">
                            <span className="font-black text-[#F5F7FA]">{listingOffers.length}</span> oferta{listingOffers.length > 1 ? "s" : ""}
                          </span>
                          {pendingCount > 0 && (
                            <span className="text-amber-400 font-black animate-pulse flex items-center gap-1">
                              <Zap className="h-3 w-3" /> {pendingCount} nova{pendingCount > 1 ? "s" : ""}
                            </span>
                          )}
                          {acceptedCount > 0 && (
                            <span className="text-emerald-400 font-black">
                              {acceptedCount} aceita{acceptedCount > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Created date */}
                    <p className="text-[10px] font-bold text-[#A7B0BE]/40 uppercase tracking-widest">
                      Criado em {new Date(listing.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </p>

                    {/* ── Action Buttons ── */}
                    <div className="flex gap-2 pt-2 border-t border-[#2A3038]">
                      <button
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black text-[#F5F7FA] bg-[#14171B] border border-[#2A3038] hover:border-[#FF6A00]/40 transition-all uppercase tracking-widest"
                        onClick={() => {
                          setConfigProduct({
                            id: listing.id,
                            name: listing.title,
                            price: listing.starting_bid,
                            image_url: listing.product_image_url || null,
                            description: listing.description || null,
                          });
                          setConfigForm({
                            starting_price: String(listing.starting_bid),
                            quantity: "1",
                            start_date: listing.created_at ? new Date(listing.created_at).toISOString().slice(0, 16) : "",
                            end_date: listing.ends_at ? new Date(listing.ends_at).toISOString().slice(0, 16) : "",
                          });
                          setShowConfigModal(true);
                        }}
                      >
                        <Edit className="h-4 w-4 text-[#FF6A00]" />
                        Editar
                      </button>
                      <button
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black border transition-all uppercase tracking-widest ${
                          isActive && !isExpired
                            ? "text-amber-400 bg-amber-400/10 border-amber-400/20 hover:bg-amber-400/20"
                            : "text-emerald-400 bg-emerald-400/10 border-emerald-400/20 hover:bg-emerald-400/20"
                        }`}
                        onClick={async () => {
                          if (isActive && !isExpired) {
                            const endCost = usageRules?.find(r => r.feature_code === 'auction_listing_end')?.credits_cost ?? 5;
                            if ((balance?.available_credits ?? 0) < endCost) {
                              const { toast } = require("sonner");
                              toast.error(`Créditos insuficientes! Necessário: ${endCost}. Saldo: ${balance?.available_credits ?? 0}.`);
                              return;
                            }
                            endAuction.mutate(listing.id, {
                              onSuccess: async () => {
                                await debitCredits({
                                  amount: endCost,
                                  reasonCode: "auction_listing_end",
                                  description: `Encerramento de arremate: ${listing.title}`,
                                  metadata: { listing_id: listing.id },
                                });
                                refetchCredits();
                                refetchMyListings();
                              },
                            });
                          } else {
                            updateListing.mutate(
                              { id: listing.id, status: "active", ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
                              { onSuccess: () => refetchMyListings() }
                            );
                          }
                        }}
                      >
                        {isActive && !isExpired ? (
                          <><PauseCircle className="h-4 w-4" /> Pausar</>  
                        ) : (
                          <><PlayCircle className="h-4 w-4" /> Ativar</>  
                        )}
                      </button>
                      <button
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black text-red-500 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all uppercase tracking-widest"
                        onClick={() => {
                          if (confirm("Tem certeza que deseja excluir este arremate?")) {
                            deleteListing.mutate(listing.id, {
                              onSuccess: () => refetchMyListings(),
                            });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ CONTENT ═══ */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="relative">
            <Loader2 className="h-12 w-12 animate-spin text-[#FF6A00]" />
            <div className="absolute inset-0 blur-lg bg-[#FF6A00]/20 animate-pulse" />
          </div>
          <p className="text-sm font-bold text-[#A7B0BE] mt-4 uppercase tracking-widest">Sincronizando Arremates...</p>
        </div>
      ) : filteredOffers.length === 0 ? (
        <div className="text-center py-24 bg-[#1B1F24] rounded-3xl border border-[#2A3038] shadow-2xl shadow-black/40">
          <div className="w-24 h-24 rounded-full bg-[#14171B] border border-[#2A3038] flex items-center justify-center mx-auto mb-6 shadow-inner">
            <Tag className="h-10 w-10 text-[#FF6A00]/40" />
          </div>
          <h3 className="text-xl font-black text-[#F5F7FA] mb-2 uppercase tracking-tight">
            {searchQuery ? "Nenhum resultado" :
              statusFilter === "all" ? "Nenhuma oferta de arremate" :
              `Nenhuma oferta ${statusFilter === "pending" ? "pendente" : statusFilter === "accepted" ? "aceita" : "recusada"}`}
          </h3>
          <p className="text-sm font-medium text-[#A7B0BE] max-w-md mx-auto px-6 leading-relaxed">
            {searchQuery ? "Tente ajustar seus termos de busca." :
              <>As ofertas enviadas por seus clientes aparecerão instantaneamente aqui. <br/><span className="text-[#A7B0BE]/70 text-xs mt-2 block">Nota: Os produtos para inserir no arremate devem estar cadastrados na loja.</span></>}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOffers.map((offer) => (
            <ArremateOfferCard
              key={offer.id}
              offer={offer}
              listing={listingMap.get(offer.arremate_listing_id)}
              onRespond={handleRespondOffer}
              isResponding={respondingOfferId === offer.id}
              onAcceptWithCredits={handleAcceptWithCredits}
              availableCredits={balance.available_credits}
              usageRules={usageRules}
            />
          ))}
        </div>
      )}

      {/* ═══ PRODUCT PICKER MODAL (Fluxo Completo) ═══ */}
      <Dialog open={showProductPicker} onOpenChange={setShowProductPicker}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto bg-[#14171B] border-[#2A3038] text-[#F5F7FA]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl font-black uppercase tracking-tight">
              <div className="p-2 rounded-xl bg-[#FF6A00]/10">
                <Tag className="h-6 w-6 text-[#FF6A00]" />
              </div>
              Publicar Arremate
            </DialogTitle>
            <DialogDescription className="text-[#A7B0BE] font-bold">Vincule um produto do seu catálogo para criar uma oferta estratégica.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-4">
            <div className="space-y-4 p-4 rounded-2xl bg-[#1B1F24] border border-[#2A3038] shadow-inner">
              <Label className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-[0.2em] ml-1">Buscar no Catálogo</Label>
              
              <div className="flex flex-col gap-3">
                <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={searchOpen}
                      className="w-full justify-between bg-[#14171B] border-[#2A3038] text-[#F5F7FA] hover:bg-[#1B1F24] h-14 rounded-2xl font-bold"
                    >
                      <div className="flex items-center gap-3">
                         <Search className="h-4 w-4 text-[#FF6A00]" />
                         {selectedProductId 
                           ? storeProducts.find((p) => p.id === selectedProductId)?.name 
                           : "Selecione um produto..."}
                      </div>
                      <ChevronRight className={cn("ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform", searchOpen && "rotate-90")} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-[#1B1F24] border-[#2A3038] shadow-2xl">
                    <Command className="bg-transparent">
                      <CommandInput placeholder="Digite o nome..." className="text-white" />
                      <CommandList className="max-h-[300px]">
                        <CommandEmpty className="py-6 text-center text-[#A7B0BE] font-bold">Nenhum produto encontrado.</CommandEmpty>
                        <CommandGroup heading="Seu Catálogo">
                          {storeProducts.map((product) => (
                            <CommandItem
                              key={product.id}
                              onSelect={() => {
                                setSelectedProductId(product.id);
                                setConfigProduct(product);
                                setConfigForm({
                                  starting_price: product.price ? String(product.price) : "",
                                  quantity: "1",
                                  start_date: new Date().toISOString().slice(0, 16),
                                  end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
                                });
                                setSearchOpen(false);
                                setShowProductPicker(false);
                                setShowConfigModal(true);
                              }}
                              className="hover:bg-[#FF6A00]/10 cursor-pointer text-[#A7B0BE] hover:text-white flex items-center justify-between p-3"
                            >
                              <div className="flex items-center gap-3">
                                {product.image_url && (
                                  <img src={product.image_url} alt="" className="w-8 h-8 rounded-lg object-cover border border-[#2A3038]" />
                                )}
                                <div className="flex flex-col">
                                  <span className="font-bold text-sm">{product.name}</span>
                                  <span className="text-[10px] opacity-70">R$ {product.price?.toFixed(2)}</span>
                                </div>
                              </div>
                              <CheckCircle2 className={cn("h-4 w-4 text-[#FF6A00]", selectedProductId === product.id ? "opacity-100" : "opacity-0")} />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                <div className="flex items-center gap-2">
                  <div className="h-px bg-[#2A3038] flex-1" />
                  <span className="text-[9px] font-black text-[#A7B0BE] uppercase tracking-[0.2em]">ou</span>
                  <div className="h-px bg-[#2A3038] flex-1" />
                </div>

                <Button 
                  variant="outline" 
                  onClick={() => navigate('/anunciante/meus-anuncios')}
                  className="w-full h-12 rounded-xl border-dashed border-[#2A3038] text-[9px] font-black uppercase tracking-widest gap-2 bg-[#FF6A00]/5 text-[#FF6A00] hover:bg-[#FF6A00]/10"
                >
                  <Plus className="w-4 h-4" /> Cadastrar Novo Produto (Fluxo Completo)
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ CONFIG MODAL ═══ */}
      <Dialog open={showConfigModal} onOpenChange={(o) => { setShowConfigModal(o); if (!o) setConfigProduct(null); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto bg-[#14171B] border-[#2A3038] text-[#F5F7FA]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl font-black uppercase tracking-tight">
              <div className="p-2 rounded-xl bg-[#FF6A00]/10">
                <Zap className="h-6 w-6 text-[#FF6A00]" />
              </div>
              Configurar Arremate
            </DialogTitle>
            <DialogDescription className="text-[#A7B0BE] font-bold">
              Defina as regras da oferta para o produto selecionado.
            </DialogDescription>
          </DialogHeader>

          {configProduct && (
            <div className="space-y-6 py-4">
              {/* Product preview */}
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#1B1F24] border border-[#2A3038] shadow-inner">
                {configProduct.image_url ? (
                  <img src={configProduct.image_url} alt={configProduct.name} className="w-16 h-16 rounded-xl object-cover shrink-0 border border-[#2A3038]" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-[#14171B] flex items-center justify-center shrink-0 border border-[#2A3038]">
                    <Package className="h-7 w-7 text-[#A7B0BE]/20" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-black text-xs text-[#F5F7FA] truncate uppercase tracking-tight">{configProduct.name}</p>
                  <p className="text-sm font-black text-[#FF6A00]">{formatBRL(configProduct.price || 0)}</p>
                </div>
                <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-full bg-[#FF6A00]/20 text-[#FF6A00] tracking-widest border border-[#FF6A00]/30 shadow-lg shadow-[#FF6A00]/10">PRODUTO BASE</span>
              </div>

              {/* Preço de oportunidade */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-[0.2em] ml-1">Preço do Arremate (R$) <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-[#FF6A00]">R$</span>
                  <Input 
                    type="number" 
                    step="0.01" 
                    placeholder="0,00" 
                    value={configForm.starting_price}
                    onChange={(e) => setConfigForm(f => ({ ...f, starting_price: e.target.value }))} 
                    className="pl-12 h-14 rounded-2xl border-[#2A3038] bg-[#1B1F24] font-black text-[#F5F7FA] text-lg focus:border-[#FF6A00]/50 shadow-xl shadow-black/10"
                  />
                </div>
              </div>

              {/* Custo de crédito + Quantidade */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-[0.2em] ml-1">Custo Unlocking</Label>
                  <div className="flex items-center gap-3 h-14 px-4 rounded-2xl border border-[#2A3038] bg-[#14171B] shadow-inner">
                    <Coins className="h-5 w-5 text-emerald-400" />
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-emerald-400">7 CRÉDITOS</span>
                      <span className="text-[8px] text-[#A7B0BE] font-bold uppercase tracking-tight italic">Por contato liberado</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-[0.2em] ml-1">Quantidade</Label>
                  <Input 
                    type="number" 
                    min="1" 
                    placeholder="1" 
                    value={configForm.quantity}
                    onChange={(e) => setConfigForm(f => ({ ...f, quantity: e.target.value }))} 
                    className="h-14 rounded-2xl border-[#2A3038] bg-[#1B1F24] font-black text-[#F5F7FA] text-lg focus:border-[#FF6A00]/50 shadow-xl shadow-black/10 text-center"
                  />
                </div>
              </div>

              {/* Data início / fim */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-[0.2em] ml-1">Início</Label>
                  <Input 
                    type="datetime-local" 
                    value={configForm.start_date}
                    onChange={(e) => setConfigForm(f => ({ ...f, start_date: e.target.value }))} 
                    className="h-14 rounded-2xl border-[#2A3038] bg-[#1B1F24] font-bold text-[#F5F7FA] text-sm focus:border-[#FF6A00]/50 shadow-xl shadow-black/10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-[0.2em] ml-1">Término</Label>
                  <Input 
                    type="datetime-local" 
                    value={configForm.end_date}
                    onChange={(e) => setConfigForm(f => ({ ...f, end_date: e.target.value }))} 
                    className="h-14 rounded-2xl border-[#2A3038] bg-[#1B1F24] font-bold text-[#F5F7FA] text-sm focus:border-[#FF6A00]/50 shadow-xl shadow-black/10"
                  />
                </div>
              </div>

              {/* Submit */}
              <Button
                className="w-full h-16 text-base font-black bg-gradient-to-r from-[#FF6A01] to-[#FF8C33] hover:from-[#FF7A1A] hover:to-[#FFA357] text-white rounded-2xl shadow-2xl shadow-[#FF6A00]/30 active:scale-[0.98] transition-all uppercase tracking-[0.2em] mt-4"
                disabled={createListing.isPending || !configForm.starting_price}
                onClick={() => {
                  if (!configProduct) return;
                  const startDate = configForm.start_date ? new Date(configForm.start_date) : new Date();
                  const endDate = configForm.end_date ? new Date(configForm.end_date) : new Date(Date.now() + 24 * 60 * 60 * 1000);
                  const durationHours = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 3600000));
                  // Publicar é GRÁTIS (modelo oficial): gate de crédito para publicar
                  // arremate desativado — espelha MerchantAuctions. Créditos só no
                  // desbloqueio de contato do comprador, não para anunciar.
                  // const publishCost = usageRules?.find(r => r.feature_code === 'auction_listing_create')?.credits_cost ?? 7;
                  // if ((balance?.available_credits ?? 0) < publishCost) { ... }
                  createListing.mutate({
                    title: configProduct.name,
                    description: configProduct.description || undefined,
                    product_image_url: configProduct.image_url || undefined,
                    starting_bid: parseFloat(configForm.starting_price) || 0,
                    duration_hours: durationHours,
                    starts_at: startDate.toISOString(),
                    ends_at: endDate.toISOString(),
                    listing_type: "arremate",
                    fulfillment_type: "both",
                    product_id: configProduct.id,
                  }, {
                    onSuccess: async () => {
                      await debitCredits({
                        amount: publishCost,
                        reasonCode: "auction_listing_create",
                        description: `Publicação de arremate: ${configProduct.name}`,
                      });
                      refetchCredits();
                      setShowConfigModal(false);
                      setConfigProduct(null);
                      refetchMyListings();
                      const { toast } = require("sonner");
                      toast.success("Arremate publicado com sucesso!");
                    },
                  });
                }}
              >
                {createListing.isPending ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <><Zap className="h-6 w-6 mr-3 stroke-[3px]" /> PUBLICAR ARREMATE AGORA</>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

