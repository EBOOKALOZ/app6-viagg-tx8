import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrencyBRL } from "@/lib/utils";
import { toast } from "sonner";
import {
  Search,
  Megaphone,
  Package,
  Building2,
  Car,
  CheckCircle2,
  Sparkles,
  ImageIcon,
  Loader2,
  ArrowRight,
  X,
  MapPin,
  Share2,
  ExternalLink,
  Store,
  Plus,
  Save,
  RefreshCw,
  Trash2,
  ListOrdered,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */

type CategoryTab = "produtos" | "imoveis" | "veiculos";

interface CatalogItem {
  id: string;
  title: string;
  price: number | null;
  image: string | null;
  bucket?: string;
  status: string;
  category: CategoryTab;
  extra?: string;
  city?: string;
  state?: string;
  storeId?: string;
  storeName?: string;
}

const MAX_PROMO_SLOTS = 5; // 1 slot fixo de marca + 5 slots do usuário

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */

function resolveImage(path: string | null, bucket = "marketing-materials"): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl ?? "";
}

function buildStoreUrl(storeId?: string): string {
  if (!storeId) return "#";
  return `${window.location.origin}/loja/${storeId}`;
}

/* ─────────────────────────────────────────────
   Main Component
───────────────────────────────────────────── */

export default function AdvertiserPromotionPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [allItems, setAllItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<CatalogItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [promoted, setPromoted] = useState<string[]>([]);
  const [savingSlot, setSavingSlot] = useState<string | null>(null); // itemId being saved

  // Picker state
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerTab, setPickerTab] = useState<CategoryTab>("produtos");
  const pickerRef = useRef<HTMLDivElement>(null);

  /* ── Fetch advertiser account + store ── */
  const [advertiserAccountId, setAdvertiserAccountId] = useState<string | null>(null);
  const [storeInfo, setStoreInfo] = useState<{ id: string; name: string; city?: string; state?: string } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [accRes, storeRes] = await Promise.all([
        supabase.from("advertiser_accounts").select("id").eq("user_id", user.id).maybeSingle(),
        supabase.from("merchant_stores").select("id, store_name, city, state").eq("user_id", user.id).maybeSingle(),
      ]);
      if (accRes.data) setAdvertiserAccountId(accRes.data.id);
      if (storeRes.data) {
        setStoreInfo({
          id: storeRes.data.id,
          name: storeRes.data.store_name ?? "Minha Loja",
          city: storeRes.data.city ?? undefined,
          state: storeRes.data.state ?? undefined,
        });
      }
    })();
  }, [user?.id]);

  /* ── Fetch ALL items once ── */
  useEffect(() => {
    if (!user?.id) return;
    fetchAllItems(advertiserAccountId, storeInfo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, advertiserAccountId]);

  async function fetchAllItems(
    accountId: string | null = advertiserAccountId,
    store: typeof storeInfo = storeInfo,
  ) {
    setLoading(true);
    try {
      const results: CatalogItem[] = [];

      // Produtos (Advertiser Listings + Merchant Products)
      {
        // 1. Fetch Advertiser Listings — by account ID if available, fallback to owner_user_id
        {
          const advQuery = supabase
            .from("advertiser_listings" as any)
            .select("id, title, price, listing_status, cover_image_url, category, city, advertiser_listing_media(media_url)")
            .order("created_at", { ascending: false });

          const { data: advData } = accountId
            ? await advQuery.eq("advertiser_account_id", accountId)
            : await advQuery.eq("owner_user_id", user!.id);

          (advData ?? []).forEach((r: any) => {
            const mediaFallback = r.advertiser_listing_media?.[0]?.media_url ?? null;
            const imgUrl = r.cover_image_url || mediaFallback;
            results.push({
              id: r.id,
              title: r.title ?? "Sem título",
              price: r.price,
              image: imgUrl,
              bucket: undefined,
              status: r.listing_status ?? "draft",
              category: "produtos",
              extra: r.category,
              city: r.city ?? store?.city,
              state: store?.state,
              storeId: store?.id,
              storeName: store?.name,
            });
          });
        }

        // 2. Fetch Merchant Products (from old system)
        // NOTE: tabela merchant_products não tem coluna is_active — usar apenas as colunas existentes
        const { data: merchData } = await supabase
          .from("merchant_products")
          .select("id, nome, preco, imagem_url")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false });

        (merchData ?? []).forEach((r: any) => {
          results.push({
            id: r.id,
            title: r.nome ?? "Sem título",
            price: r.preco,
            image: r.imagem_url,
            bucket: undefined,
            status: "active",
            category: "produtos",
            extra: "Produto da Loja",
            city: store?.city,
            state: store?.state,
            storeId: store?.id,
            storeName: store?.name,
          });
        });
      }

      // Imóveis
      {
        const { data } = await supabase
          .from("real_estate_listings")
          .select("id, title, price_brl, visibility_status, property_type, city, state, real_estate_media(original_storage_path, public_masked_storage_path)")
          .eq("owner_user_id", user!.id)
          .order("created_at", { ascending: false });

        (data ?? []).forEach((r: any) => {
          const media = r.real_estate_media?.[0];
          const imgPath = media?.public_masked_storage_path ?? media?.original_storage_path ?? null;
          results.push({
            id: r.id,
            title: r.title ?? "Sem título",
            price: r.price_brl,
            image: imgPath,
            bucket: "real-estate-public",
            status: r.visibility_status ?? "draft",
            category: "imoveis",
            extra: r.property_type,
            city: r.city,
            state: r.state,
            storeId: store?.id,
            storeName: store?.name,
          });
        });
      }

      // Veículos — vehicle_listings não tem cover_image_url; usar vehicle_media join
      {
        const { data } = await supabase
          .from("vehicle_listings" as any)
          .select("id, title, price_brl, visibility_status, vehicle_type, city, state, vehicle_media(original_storage_path, public_masked_storage_path)")
          .eq("owner_user_id", user!.id)
          .order("created_at", { ascending: false });

        const vehicleRows: CatalogItem[] = [];

        (data ?? []).forEach((r: any) => {
          // Priority 1: vehicle_media join
          let imgUrl: string | null = null;

          if (r.vehicle_media?.length > 0) {
            const m = r.vehicle_media[0];
            const path = m.public_masked_storage_path || m.original_storage_path;
            if (path) {
              // VehicleForm faz upload no bucket real-estate-original
              imgUrl = path.startsWith("http")
                ? path
                : supabase.storage.from("real-estate-original").getPublicUrl(path).data.publicUrl;
            }
          }

          vehicleRows.push({
            id: r.id,
            title: r.title ?? "Sem título",
            price: r.price_brl ?? null,
            image: imgUrl,
            bucket: "vehicles",
            status: r.visibility_status ?? "draft",
            category: "veiculos",
            extra: r.vehicle_type,
            city: r.city ?? store?.city,
            state: r.state ?? store?.state,
            storeId: store?.id,
            storeName: store?.name,
          });
        });

        // Priority 3: separate vehicle_media query for vehicles still missing an image
        const missing = vehicleRows.filter((v) => !v.image);
        if (missing.length > 0) {
          const { data: mediaRows } = await supabase
            .from("vehicle_media" as any)
            .select("listing_id, original_storage_path, public_masked_storage_path")
            .in("listing_id", missing.map((v) => v.id));

          if (mediaRows && mediaRows.length > 0) {
            const mediaMap = new Map<string, string>();
            for (const row of mediaRows as any[]) {
              if (!mediaMap.has(row.listing_id)) {
                const p = row.public_masked_storage_path || row.original_storage_path;
                if (p) {
                  mediaMap.set(
                    row.listing_id,
                    // VehicleForm salva no bucket real-estate-original
                    p.startsWith("http") ? p : supabase.storage.from("real-estate-original").getPublicUrl(p).data.publicUrl,
                  );
                }
              }
            }
            for (const v of vehicleRows) {
              if (!v.image && mediaMap.has(v.id)) {
                v.image = mediaMap.get(v.id)!;
              }
            }
          }
        }

        results.push(...vehicleRows);
      }

      setAllItems(results);

      // Restore saved slots from DB — populates both visual slots and "Ativo" badges
      const { data: savedSlots } = await supabase
        .from("promoted_listing_slots" as any)
        .select("listing_id, listing_type, listing_title, listing_price, listing_image, listing_city")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });

      if (savedSlots && savedSlots.length > 0) {
        const savedIds = (savedSlots as any[]).map((r) => r.listing_id);
        setPromoted(savedIds);

        // Rebuild selectedItems: prefer full item from allItems (has bucket etc.),
        // fallback to the denormalized data stored in the slot row itself
        const restoredItems: CatalogItem[] = (savedSlots as any[])
          .slice(0, MAX_PROMO_SLOTS)
          .map((slot) => {
            const found = results.find((r) => r.id === slot.listing_id);
            if (found) return found;
            // Fallback using stored display data
            return {
              id: slot.listing_id,
              title: slot.listing_title ?? "Anúncio",
              price: slot.listing_price ?? 0,
              image: slot.listing_image ?? null,
              bucket: null,
              category: slot.listing_type ?? "produtos",
              city: slot.listing_city ?? undefined,
              state: undefined,
              storeId: undefined,
              storeName: undefined,
            } as CatalogItem;
          });
        setSelectedItems(restoredItems);
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar itens.");
    } finally {
      setLoading(false);
    }
  }

  /* ── Picker items filtered by tab and search ── */
  const pickerItems = useMemo(() => {
    let list = allItems.filter((i) => i.category === pickerTab);
    // Exclude items currently in the visual slots (prevent same slot duplicate)
    const selectedIds = new Set(selectedItems.map((s) => s.id));
    list = list.filter((i) => !selectedIds.has(i.id));
    if (pickerSearch.trim()) {
      const q = pickerSearch.toLowerCase();
      list = list.filter((i) => i.title.toLowerCase().includes(q));
    }
    return list;
  }, [allItems, pickerTab, pickerSearch, selectedItems]);

  /* ── Close picker on outside click ── */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerSlot(null);
      }
    }
    if (pickerSlot !== null) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [pickerSlot]);

  /* ── Select item from picker + auto-save ── */
  function selectFromPicker(item: CatalogItem) {
    setSelectedItems((prev) => {
      if (prev.length >= MAX_PROMO_SLOTS) return prev;
      return [...prev, item];
    });
    setPickerSlot(null);
    setPickerSearch("");
    // Auto-save immediately so data persists even if user leaves
    handleSaveSlot(item);
  }

  /* ── Remove from slot + DB ── */
  function handleRemoveSlot(itemId: string, itemTitle?: string) {
    setSelectedItems((prev) => prev.filter((p) => p.id !== itemId));
    setPromoted((prev) => prev.filter((id) => id !== itemId));
    supabase
      .from("promoted_listing_slots" as any)
      .delete()
      .eq("user_id", user!.id)
      .eq("listing_id", itemId)
      .then(({ error }) => {
        if (error) {
          toast.error("Erro ao remover da divulgação.");
        } else {
          toast(itemTitle ? `"${itemTitle}" removido da divulgação` : "Anúncio removido da divulgação", {
            description: "O slot está livre para um novo anúncio.",
          });
        }
      });
  }

  /* ── Save single slot → promoted_listing_slots ── */
  async function handleSaveSlot(item: CatalogItem) {
    setSavingSlot(item.id);
    try {
      const resolvedImage = resolveImage(item.image ?? null, item.bucket);
      const { error } = await supabase
        .from("promoted_listing_slots" as any)
        .upsert({
          user_id: user!.id,
          listing_type: item.category,
          listing_id: item.id,
          listing_title: item.title,
          listing_price: item.price,
          listing_image: resolvedImage || item.image || null,
          listing_city: item.city || null,
        }, { onConflict: "user_id,listing_id" });

      if (error) throw error;

      setPromoted((prev) => prev.includes(item.id) ? prev : [...prev, item.id]);
      toast.success(`"${item.title}" salvo para divulgação!`, {
        description: "Já já estará sendo divulgado Gratuitamente",
      });
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao salvar: ${err.message}`);
    } finally {
      setSavingSlot(null);
    }
  }

  /* ── Submit all filled slots at once → promoted_listing_slots ── */
  async function handlePromote() {
    if (selectedItems.length === 0) return;
    setSubmitting(true);
    try {
      const rows = selectedItems.map((item) => ({
        user_id: user!.id,
        listing_type: item.category,
        listing_id: item.id,
        listing_title: item.title,
        listing_price: item.price,
        listing_image: resolveImage(item.image ?? null, item.bucket) || item.image || null,
        listing_city: item.city || null,
      }));
      const { error } = await supabase
        .from("promoted_listing_slots" as any)
        .upsert(rows, { onConflict: "user_id,listing_id" });
      if (error) throw error;

      setPromoted((prev) => [...prev, ...selectedItems.map((i) => i.id)]);
      toast.success(`${selectedItems.length} anúncio(s) enviado(s) para divulgação!`);
      setSelectedItems([]);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao ativar divulgação.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Build slots array (always 6) ── */
  const slots: (CatalogItem | null)[] = Array.from({ length: MAX_PROMO_SLOTS }, (_, i) => selectedItems[i] ?? null);

  /* ── Picker tabs ── */
  const pickerTabs: { key: CategoryTab; label: string; icon: React.ElementType }[] = [
    { key: "produtos", label: "Produtos", icon: Package },
    { key: "imoveis", label: "Imóveis", icon: Building2 },
    { key: "veiculos", label: "Veículos", icon: Car },
  ];

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF6A00] to-[#FF8C33] flex items-center justify-center shadow-lg shadow-[#FF6A00]/25">
            <Megaphone className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-[#F5F7FA] tracking-tight">
              Divulgar Grátis
            </h1>
            <p className="text-sm text-[#A7B0BE] mt-0.5">
              Clique nos slots e escolha até {MAX_PROMO_SLOTS} anúncios para divulgar
            </p>
          </div>
        </div>

        <Badge className="bg-[#FF6A00]/15 text-[#FF6A00] border-[#FF6A00]/30 font-bold text-xs uppercase tracking-wider px-3 py-1.5">
          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          Recurso Gratuito
        </Badge>
      </div>

      {/* ═══════════════════════════════════════════
          CARD BUILDER — ALWAYS VISIBLE (3 SLOTS)
      ═══════════════════════════════════════════ */}
      <div className="bg-[#0D0F12] rounded-3xl border border-[#2A3038]/60 relative w-full md:max-w-[70%] mx-auto">
        {/* Card Builder Header */}
        <div className="bg-gradient-to-r from-[#FF6A00] to-[#FF8C33] px-3 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-2 rounded-t-3xl">
          <div className="flex items-center gap-3">
            <Store className="w-5 h-5 text-white" />
            <div>
              <p className="text-white font-black text-sm uppercase tracking-wider">
                Card de Divulgação
              </p>
              <p className="text-white/70 text-[10px] font-medium">
                É dessa maneira que seus clientes verão seus anúncios
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={() => {
                const nextSlot = selectedItems.length;
                if (nextSlot < MAX_PROMO_SLOTS) {
                  setPickerSlot(nextSlot);
                  setPickerSearch("");
                  setPickerTab("produtos");
                } else {
                  toast.error("Todos os slots já estão preenchidos!");
                }
              }}
              className="bg-green-600 text-white border-green-500 border hover:bg-green-500 hover:text-white uppercase tracking-wider font-black text-[10px] h-7 px-3 shadow-md transition-all cursor-pointer"
            >
              <span className="hidden sm:inline">QUER ANUNCIAR AQUI!!!</span>
              <span className="sm:hidden">+ ANUNCIAR</span>
            </Button>
            <Badge className="bg-white/20 text-white border-white/30 text-[10px] font-black uppercase tracking-wider">
              {selectedItems.length}/{MAX_PROMO_SLOTS}
            </Badge>
          </div>
        </div>

        {/* 1 Slot de marca + 5 Slots do usuário — 2 linhas × 3 colunas */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-[#2A3038]/40 relative">

          {/* ── Slot 0: MARCA — clica e vai criar anúncio ── */}
          <button
            onClick={() => {
              if (user) {
                navigate("/anunciante/anuncios/novo");
              } else {
                navigate("/auth");
              }
            }}
            className="relative bg-[#0D0F12] aspect-square flex flex-col items-center justify-center overflow-hidden cursor-pointer group/brand w-full transition-all duration-300 hover:bg-[#FF6A00]/10"
          >
            {/* fundo decorativo */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#FF6A00]/20 via-transparent to-[#FF8C33]/10 pointer-events-none" />
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-[#FF6A00]/8 rounded-full pointer-events-none" />
            <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-[#FF8C33]/8 rounded-full pointer-events-none" />
            {/* conteúdo */}
            <div className="relative z-10 flex flex-col items-center gap-3 text-center px-4">
              <img
                src="/assets/brand/viagg-tx8-logo-premium.png"
                alt="Viagg-TX8"
                className="w-28 sm:w-32 h-auto object-contain drop-shadow-2xl"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/viagg-logo.png"; }}
              />
              <div className="space-y-1">
                <p className="text-white/90 font-black text-[14px] sm:text-[16px] leading-tight">
                  Anuncie e publique
                </p>
                <p className="text-[#FF6A00] font-black text-[26px] sm:text-[31px] leading-tight uppercase tracking-wide drop-shadow-lg">
                  GRÁTIS
                </p>
                <p className="text-white/60 font-semibold text-[13px]">
                  seu anúncio aqui
                </p>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <Sparkles className="w-4 h-4 text-[#FF6A00]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white">
                  Clique aqui
                </span>
                <Sparkles className="w-4 h-4 text-[#FF6A00]" />
              </div>
            </div>
            {/* borda accent */}
            <div className="absolute inset-0 border border-[#FF6A00]/25 group-hover/brand:border-[#FF6A00]/60 transition-colors pointer-events-none" />
          </button>

          {/* ── Slots 1-5: conteúdo do usuário ── */}
          {slots.map((slot, idx) => {
            if (slot) {
              const imgUrl = resolveImage(slot.image, slot.bucket);
              return (
                <div key={slot.id} className="relative bg-[#1B1F24] group/slot flex flex-col">
                  <div className="relative aspect-square overflow-hidden">
                    {imgUrl ? (
                      <img src={imgUrl} alt={slot.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#0D0F12]">
                        <ImageIcon className="w-8 h-8 text-[#2A3038]" />
                      </div>
                    )}
                    {/* Price Overlay */}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3">
                      <p className="text-white font-black text-sm drop-shadow-lg">
                        {formatCurrencyBRL(slot.price)}
                      </p>
                    </div>
                    {/* Action buttons: always visible Trocar + Excluir */}
                    <div className="absolute top-2 right-2 flex flex-col gap-1">
                      {/* Trocar — reopen picker for this slot */}
                      <button
                        title="Trocar anúncio"
                        onClick={() => {
                          handleRemoveSlot(slot.id, slot.title);
                          const slotIdx = selectedItems.findIndex((s) => s.id === slot.id);
                          setTimeout(() => {
                            setPickerSlot(slotIdx >= 0 ? slotIdx : selectedItems.length);
                            setPickerSearch("");
                            setPickerTab("produtos");
                          }, 50);
                        }}
                        className="w-7 h-7 rounded-full bg-blue-500/90 text-white flex items-center justify-center hover:bg-blue-600 shadow-lg transition-all"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      {/* Excluir */}
                      <button
                        title="Remover da divulgação"
                        onClick={() => handleRemoveSlot(slot.id, slot.title)}
                        className="w-7 h-7 rounded-full bg-red-500/90 text-white flex items-center justify-center hover:bg-red-600 shadow-lg transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="p-2 space-y-1 flex-1 flex flex-col">
                    {slot.storeName && (
                      <div className="flex items-center gap-1">
                        <Store className="w-2.5 h-2.5 text-[#FF6A00] shrink-0" />
                        <span className="text-[9px] font-black text-[#FF6A00] truncate uppercase tracking-wide">
                          {slot.storeName}
                        </span>
                      </div>
                    )}
                    <p className="text-[#F5F7FA] font-bold text-xs line-clamp-2 leading-tight flex-1">
                      {slot.title}
                    </p>
                    {(slot.city || slot.state) && (
                      <div className="flex items-center gap-1 text-[#A7B0BE]">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="text-[10px] font-medium truncate">
                          {[slot.city, slot.state].filter(Boolean).join(", ")}
                        </span>
                      </div>
                    )}
                    {/* Save button per slot */}
                    <button
                      onClick={() => handleSaveSlot(slot)}
                      disabled={savingSlot === slot.id}
                      className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${
                        promoted.includes(slot.id)
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 cursor-default"
                          : "bg-[#FF6A00]/15 text-[#FF6A00] border border-[#FF6A00]/25 hover:bg-[#FF6A00]/25 hover:shadow-lg hover:shadow-[#FF6A00]/10"
                      }`}
                    >
                      {savingSlot === slot.id ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> Salvando...</>
                      ) : promoted.includes(slot.id) ? (
                        <><CheckCircle2 className="w-3 h-3" /> Ativo</>
                      ) : (
                        <><Save className="w-3 h-3" /> Salvar Anúncio</>
                      )}
                    </button>
                  </div>
                </div>
              );
            }

            // ── Empty Slot (CLICKABLE) ──
            return (
              <div key={`empty-${idx}`} className="relative">
                <button
                  onClick={() => {
                    setPickerSlot(idx);
                    setPickerSearch("");
                    setPickerTab("produtos");
                  }}
                  className="w-full bg-[#1B1F24] flex flex-col items-center justify-center aspect-square border-2 border-dashed border-[#2A3038]/60 hover:border-[#FF6A00]/50 hover:bg-[#FF6A00]/5 transition-all duration-300 cursor-pointer group/empty"
                >
                  <div className="flex flex-col items-center gap-3 text-center px-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#FF6A00]/10 border border-[#FF6A00]/20 flex items-center justify-center group-hover/empty:bg-[#FF6A00]/20 group-hover/empty:border-[#FF6A00]/40 transition-all duration-300">
                      <Plus className="w-6 h-6 text-[#FF6A00]/60 group-hover/empty:text-[#FF6A00] transition-colors" />
                    </div>
                    <div>
                      <p className="text-[#A7B0BE]/60 font-black text-[10px] uppercase tracking-wider group-hover/empty:text-[#FF6A00] transition-colors">
                        Slot {idx + 2}
                      </p>
                      <p className="text-[#A7B0BE]/40 text-[9px] mt-0.5 group-hover/empty:text-[#A7B0BE] transition-colors">
                        Clique para adicionar
                      </p>
                    </div>
                  </div>
                </button>

                {/* ── PICKER DROPDOWN ── */}
                {pickerSlot === idx && (
                  <div
                    ref={pickerRef}
                    className={`z-50 bg-[#0D0F12] border border-[#FF6A00]/40 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-200 ${
                      (idx + 1) % 3 === 0
                        ? "fixed left-3 right-3 top-[28%] md:absolute md:left-0 md:right-auto md:top-full md:mt-2"
                        : (idx + 1) % 3 === 1
                        ? "fixed left-3 right-3 top-[28%] md:absolute md:left-1/2 md:-translate-x-1/2 md:right-auto md:top-full md:mt-2"
                        : "fixed left-3 right-3 top-[28%] md:absolute md:right-0 md:left-auto md:top-full md:mt-2"
                    }`}
                    style={{ minWidth: "320px", maxWidth: "400px" }}
                  >
                    {/* Picker Header */}
                    <div className="p-3 border-b border-[#2A3038]/60">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-black text-[#F5F7FA] uppercase tracking-wider">
                          Escolher anúncio
                        </p>
                        <button onClick={() => setPickerSlot(null)} className="text-[#A7B0BE] hover:text-white transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Mini tabs */}
                      <div className="flex gap-1 p-1 bg-[#1B1F24] rounded-xl">
                        {pickerTabs.map((t) => (
                          <button
                            key={t.key}
                            onClick={() => setPickerTab(t.key)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                              pickerTab === t.key
                                ? "bg-[#FF6A00] text-white"
                                : "text-[#A7B0BE] hover:text-white"
                            }`}
                          >
                            <t.icon className="w-3 h-3" />
                            {t.label}
                          </button>
                        ))}
                      </div>

                      {/* Search */}
                      <div className="relative mt-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A7B0BE]" />
                        <Input
                          placeholder="Buscar..."
                          value={pickerSearch}
                          onChange={(e) => setPickerSearch(e.target.value)}
                          className="pl-9 h-9 bg-[#1B1F24] border-[#2A3038]/60 text-[#F5F7FA] rounded-lg text-xs placeholder:text-[#A7B0BE]/40"
                          autoFocus
                        />
                      </div>
                    </div>

                    {/* Picker Items List */}
                    <div className="max-h-64 overflow-y-auto custom-scrollbar">
                      {loading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-5 h-5 text-[#FF6A00] animate-spin" />
                        </div>
                      ) : pickerItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-2">
                          <Package className="w-6 h-6 text-[#A7B0BE]/30" />
                          <p className="text-[#A7B0BE]/50 text-xs">Nenhum item encontrado</p>
                        </div>
                      ) : (
                        pickerItems.map((item) => {
                          const imgUrl = resolveImage(item.image, item.bucket);
                          return (
                            <button
                              key={item.id}
                              onClick={() => selectFromPicker(item)}
                              className="w-full flex items-center gap-3 p-3 hover:bg-[#1B1F24] transition-colors border-b border-[#2A3038]/30 last:border-b-0 text-left group/pick"
                            >
                              {/* Thumbnail */}
                              <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#1B1F24] shrink-0">
                                {imgUrl ? (
                                  <img src={imgUrl} alt={item.title} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <ImageIcon className="w-4 h-4 text-[#2A3038]" />
                                  </div>
                                )}
                              </div>
                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                {item.storeName && (
                                  <div className="flex items-center gap-1 mb-0.5">
                                    <Store className="w-2.5 h-2.5 text-[#FF6A00] shrink-0" />
                                    <span className="text-[8px] font-black text-[#FF6A00] truncate uppercase tracking-wide">
                                      {item.storeName}
                                    </span>
                                  </div>
                                )}
                                <p className="text-xs font-bold text-[#F5F7FA] truncate group-hover/pick:text-[#FF6A00] transition-colors">
                                  {item.title}
                                </p>
                                <p className="text-xs font-black text-green-500">
                                  {formatCurrencyBRL(item.price)}
                                </p>
                                {(item.city || item.state) && (
                                  <div className="flex items-center gap-1 text-[#A7B0BE] mt-0.5">
                                    <MapPin className="w-2.5 h-2.5" />
                                    <span className="text-[9px]">{[item.city, item.state].filter(Boolean).join(", ")}</span>
                                  </div>
                                )}
                              </div>
                              {/* Add icon */}
                              <div className="w-7 h-7 rounded-lg bg-[#FF6A00]/10 flex items-center justify-center shrink-0 group-hover/pick:bg-[#FF6A00] transition-colors">
                                <Plus className="w-3.5 h-3.5 text-[#FF6A00] group-hover/pick:text-white transition-colors" />
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Card Footer — Store Link */}
        <div className={`px-3 sm:px-6 py-3 bg-[#0D0F12] border-t border-[#2A3038]/40 flex items-center justify-between ${selectedItems.length === 0 ? "rounded-b-3xl" : ""}`}>
          <div className="flex items-center gap-2 text-[#A7B0BE]">
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider">
              Ao clicar → Redireciona para sua loja
            </span>
          </div>
          {storeInfo && (
            <span className="text-[10px] font-mono text-[#FF6A00] truncate max-w-[100px] sm:max-w-[200px]">
              /loja/{storeInfo.id}
            </span>
          )}
        </div>

        {/* Send Button */}
        {selectedItems.length > 0 && (
          <div className="px-3 sm:px-6 py-4 bg-[#0D0F12] border-t border-[#2A3038]/40 rounded-b-3xl">
            <Button
              onClick={handlePromote}
              disabled={submitting}
              className="w-full bg-[#FF6A00] hover:bg-[#E65C00] text-white font-black uppercase tracking-wider text-xs h-14 rounded-xl shadow-lg shadow-[#FF6A00]/25 transition-all duration-300 hover:shadow-xl hover:shadow-[#FF6A00]/30"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : (
                <Share2 className="w-5 h-5 mr-2" />
              )}
              {submitting
                ? "Enviando para o Postador..."
                : `Enviar ${selectedItems.length} Anúncio${selectedItems.length > 1 ? "s" : ""} para Divulgação`}
              {!submitting && <ArrowRight className="w-5 h-5 ml-2" />}
            </Button>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════
          FILA DE PUBLICAÇÃO — lista editável dos
          anúncios que estão nos slots
      ═══════════════════════════════════════════ */}
      {selectedItems.length > 0 && (
        <div className="bg-[#0D0F12] rounded-3xl border border-[#2A3038]/60 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-[#2A3038]/40"
            style={{ background: "linear-gradient(to right, #1B1F24, #0D0F12)" }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(255,106,0,0.12)", border: "1px solid rgba(255,106,0,0.25)" }}>
                <ListOrdered className="w-4 h-4 text-[#FF6A00]" />
              </div>
              <div>
                <p className="text-white font-black text-sm uppercase tracking-wider">Fila de Publicação</p>
                <p className="text-[#A7B0BE]/60 text-[10px] mt-0.5">
                  {selectedItems.length} anúncio{selectedItems.length > 1 ? "s" : ""} na fila · clique para editar
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.20)" }}>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                {promoted.length}/{selectedItems.length} ativos
              </span>
            </div>
          </div>

          {/* List of queued items */}
          <div className="divide-y divide-[#2A3038]/30">
            {selectedItems.map((item, idx) => {
              const imgUrl = resolveImage(item.image, item.bucket);
              const isActive = promoted.includes(item.id);
              const categoryIcon = item.category === "imoveis" ? Building2
                : item.category === "veiculos" ? Car : Package;
              const CategoryIcon = categoryIcon;

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-4 sm:px-6 py-3 hover:bg-[#1B1F24]/60 transition-colors group/row"
                >
                  {/* Posição */}
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black"
                    style={{
                      background: isActive ? "rgba(16,185,129,0.12)" : "rgba(42,48,56,0.60)",
                      border: isActive ? "1px solid rgba(16,185,129,0.25)" : "1px solid rgba(42,48,56,0.80)",
                      color: isActive ? "#10b981" : "#A7B0BE",
                    }}>
                    {idx + 1}
                  </div>

                  {/* Thumbnail */}
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#1B1F24] shrink-0 border border-[#2A3038]/40">
                    {imgUrl ? (
                      <img src={imgUrl} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <CategoryIcon className="w-4 h-4 text-[#2A3038]" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    {item.storeName && (
                      <div className="flex items-center gap-1 mb-0.5">
                        <Store className="w-2.5 h-2.5 text-[#FF6A00] shrink-0" />
                        <span className="text-[8px] font-black text-[#FF6A00] truncate uppercase tracking-wide">
                          {item.storeName}
                        </span>
                      </div>
                    )}
                    <p className="text-[#F5F7FA] font-bold text-xs truncate">{item.title}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-[10px] font-black text-emerald-400">
                        {formatCurrencyBRL(item.price)}
                      </span>
                      {(item.city || item.state) && (
                        <div className="flex items-center gap-1 text-[#A7B0BE]/60">
                          <MapPin className="w-2.5 h-2.5 shrink-0" />
                          <span className="text-[9px] truncate">
                            {[item.city, item.state].filter(Boolean).join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className="shrink-0 hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide"
                    style={isActive
                      ? { background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.20)", color: "#10b981" }
                      : { background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.20)", color: "#f59e0b" }
                    }>
                    {isActive ? (
                      <><CheckCircle2 className="w-2.5 h-2.5" /> Ativo</>
                    ) : (
                      <><Clock className="w-2.5 h-2.5" /> Aguardando</>
                    )}
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Trocar */}
                    <button
                      title="Trocar anúncio"
                      onClick={() => {
                        handleRemoveSlot(item.id, item.title);
                        setTimeout(() => {
                          setPickerSlot(idx);
                          setPickerSearch("");
                          setPickerTab(item.category as CategoryTab);
                        }, 50);
                      }}
                      className="w-7 h-7 rounded-lg bg-[#2A3038]/60 text-[#A7B0BE] flex items-center justify-center hover:bg-blue-500/20 hover:text-blue-400 transition-all"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                    {/* Remover */}
                    <button
                      title="Remover da fila"
                      onClick={() => handleRemoveSlot(item.id, item.title)}
                      className="w-7 h-7 rounded-lg bg-[#2A3038]/60 text-[#A7B0BE] flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer tip */}
          <div className="px-4 sm:px-6 py-3 border-t border-[#2A3038]/30 flex items-center gap-2"
            style={{ background: "rgba(255,106,0,0.03)" }}>
            <Sparkles className="w-3 h-3 text-[#FF6A00]/50 shrink-0" />
            <p className="text-[9px] text-[#A7B0BE]/40 font-medium">
              Anúncios ativos serão exibidos para motoboys da sua região automaticamente.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
