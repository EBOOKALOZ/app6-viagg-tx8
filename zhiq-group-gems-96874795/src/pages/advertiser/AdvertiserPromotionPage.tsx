import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrencyBRL } from "@/lib/utils";
import { getListingImageUrl } from "@/lib/real-estate/mediaUtils";
import { chatCompletion } from "@/lib/aiapi";
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
  RefreshCw,
  Trash2,
  ListOrdered,
  Clock,
  Bot,
  Copy,
  Check,
  Briefcase,
  Truck,
  Plane,
  Send,
  Radio,
  LayoutGrid,
  Pause,
  Play,
} from "lucide-react";
import { useGlmPostador } from "@/hooks/useGlmPostador";
import { PromotionPlansModal } from "@/components/promotion/PromotionPlansModal";
import { PromotionActiveDashboard } from "@/components/promotion/PromotionActiveDashboard";
import { CampaignTrackingCard } from "@/components/promotion/CampaignTrackingCard";
import { PromotionFloatingBalloon } from "@/components/promotion/PromotionFloatingBalloon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */

type CategoryTab = "produtos" | "imoveis" | "veiculos" | "servicos" | "fretes" | "viagens";

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

const MAX_PROMO_SLOTS = 5; // máximo de slots do usuário

const SOCIAL_NETWORKS = [
  { id: "whatsapp",  label: "WhatsApp",  emoji: "💬", color: "#25D366" },
  { id: "instagram", label: "Instagram", emoji: "📸", color: "#E1306C" },
  { id: "facebook",  label: "Facebook",  emoji: "👥", color: "#1877F2" },
  { id: "linkedin",  label: "LinkedIn",  emoji: "💼", color: "#0A66C2" },
  { id: "telegram",  label: "Telegram",  emoji: "📲", color: "#0088CC" },
  { id: "twitter",   label: "X / Twitter", emoji: "🐦", color: "#1DA1F2" },
];

const DEFAULT_NETWORKS = ["whatsapp", "instagram"];

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */

function resolveImage(path: string | null, bucket = "marketing-materials"): string {
  if (!path) return "";
  let cleanPath = path;
  if (path.startsWith("[")) {
    try {
      const arr = JSON.parse(path);
      if (Array.isArray(arr) && arr.length > 0) cleanPath = arr[0];
    } catch {}
  } else if (path.includes(",") && !path.startsWith("http") && !path.startsWith("data:")) {
    cleanPath = path.split(",")[0].trim();
  }
  if (!cleanPath) return "";
  if (cleanPath.startsWith("http") || cleanPath.startsWith("data:") || cleanPath.startsWith("blob:")) {
    return cleanPath;
  }
  if (bucket === "real-estate-public" || bucket === "real-estate-original" || bucket === "vehicles") {
    const url = getListingImageUrl(cleanPath, bucket === "real-estate-original" ? "original" : "public");
    if (url) return url;
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(cleanPath);
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
  const { pathname } = useLocation();

  const routeCategory = useMemo((): CategoryTab | null => {
    if (pathname.includes("/imoveis/")) return "imoveis";
    if (pathname.includes("/veiculos/")) return "veiculos";
    if (pathname.includes("/servicos/")) return "servicos";
    if (pathname.includes("/fretes/")) return "fretes";
    if (pathname.includes("/viagens/")) return "viagens";
    if (pathname.includes("/produtos/")) return "produtos";
    // rota genérica /anunciante/divulgar-gratis → contexto de lojista (marketplace)
    return "produtos";
  }, [pathname]);

  const [allItems, setAllItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<CatalogItem[]>([]); // slots visuais (sempre vazios no load)
  const [queuedItems, setQueuedItems] = useState<CatalogItem[]>([]);    // itens salvos no DB (fila real)
  const [submitting, setSubmitting] = useState(false);
  const [promoted, setPromoted] = useState<string[]>([]);
  const [pausedIds, setPausedIds] = useState<string[]>([]);           // anúncios da fila com divulgação pausada
  const [slotNetworks, setSlotNetworks] = useState<Record<string, string[]>>({}); // redes escolhidas por anúncio
  const [savingSlot, setSavingSlot] = useState<string | null>(null); // itemId being saved

  // AI Generation State
  const [generatingPromoText, setGeneratingPromoText] = useState(false);
  const [generatedPromoText, setGeneratedPromoText] = useState("");
  const [copiedText, setCopiedText] = useState(false);
  const [selectedNetworks, setSelectedNetworks] = useState<string[]>(["whatsapp", "instagram"]);
  const [networkTexts, setNetworkTexts] = useState<Record<string, string>>({});
  const [activeNetworkTab, setActiveNetworkTab] = useState<string>("whatsapp");
  const [copiedNetwork, setCopiedNetwork] = useState<string | null>(null);
  const [generatingNetworkId, setGeneratingNetworkId] = useState<string | null>(null);

  // Picker state
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerTab, setPickerTab] = useState<CategoryTab>(routeCategory ?? "produtos");
  const pickerRef = useRef<HTMLDivElement>(null);
  const autoOpenedRef = useRef(false);

  // Modal de planos de promoção
  const [showPlansModal, setShowPlansModal] = useState(false);

  // Escolha obrigatória antes de enviar: 'free' | 'paid' | null
  const [selectedMode, setSelectedMode] = useState<"free" | "paid" | null>(null);

  // Balão de mensagem do slot de marca
  const [showBrandBalloon, setShowBrandBalloon] = useState(false);
  const brandBalloonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleBrandClick() {
    if (brandBalloonTimer.current) clearTimeout(brandBalloonTimer.current);
    setShowBrandBalloon(true);
    brandBalloonTimer.current = setTimeout(() => setShowBrandBalloon(false), 5000);
  }

  /* ── GLM Postador bridge ── */
  const glmProfile = (routeCategory ?? "produtos") as Parameters<typeof useGlmPostador>[0];
  const { sending: glmSending, result: glmResult, error: glmError, sendToPostador, reset: resetGlm } = useGlmPostador(glmProfile);

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
  }, [user?.id, advertiserAccountId, routeCategory]);

  // Os slots ficam sempre vazios ao entrar no painel — o anunciante adiciona manualmente.

  async function fetchAllItems(
    accountId: string | null = advertiserAccountId,
    store: typeof storeInfo = storeInfo,
  ) {
    setLoading(true);
    try {
      const results: CatalogItem[] = [];
      const onlyCategory = routeCategory; // o seletor só oferece anúncios do perfil em uso (categoria da rota)

      // Produtos (Advertiser Listings + Merchant Products)
      if (!onlyCategory || onlyCategory === "produtos") {
        // 1. Fetch Advertiser Listings — by account ID if available, fallback to owner_user_id
        {
          const advQuery = supabase
            .from("advertiser_listings" as any)
            .select("id, title, price, listing_status, cover_image_url, category, city, advertiser_listing_media(media_url, storage_path)")
            .order("created_at", { ascending: false });

          const { data: advData } = accountId
            ? await advQuery.or(`advertiser_account_id.eq.${accountId},owner_user_id.eq.${user!.id}`)
            : await advQuery.eq("owner_user_id", user!.id);

          (advData ?? []).forEach((r: any) => {
            const m = r.advertiser_listing_media?.[0];
            const mediaFallback = m?.media_url || m?.storage_path || null;
            const imgUrl = resolveImage(r.cover_image_url || r.image_url || mediaFallback, "marketing-materials");
            results.push({
              id: r.id,
              title: r.title ?? "Sem título",
              price: r.price,
              image: imgUrl || null,
              bucket: "marketing-materials",
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
        const { data: merchData } = await supabase
          .from("merchant_products")
          .select("id, nome, preco, imagem_url")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false });

        (merchData ?? []).forEach((r: any) => {
          const imgUrl = resolveImage(r.imagem_url || r.image_url || null, "products");
          results.push({
            id: r.id,
            title: r.nome ?? "Sem título",
            price: r.preco,
            image: imgUrl || null,
            bucket: "products",
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
      if (!onlyCategory || onlyCategory === "imoveis") {
        const { data } = await supabase
          .from("real_estate_listings")
          .select("id, title, price_brl, visibility_status, property_type, city, state, real_estate_media(original_storage_path, public_masked_storage_path)")
          .eq("owner_user_id", user!.id)
          .order("created_at", { ascending: false });

        (data ?? []).forEach((r: any) => {
          const media = r.real_estate_media?.[0];
          const hasThumb = !!media?.public_masked_storage_path && media.public_masked_storage_path !== media.original_storage_path;
          const imgPath = hasThumb ? media.public_masked_storage_path : (media?.original_storage_path ?? null);
          const imgUrl = resolveImage(imgPath, hasThumb ? "real-estate-public" : "real-estate-original");
          results.push({
            id: r.id,
            title: r.title ?? "Sem título",
            price: r.price_brl,
            image: imgUrl || null,
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

      // Veículos
      if (!onlyCategory || onlyCategory === "veiculos") {
        const { data } = await supabase
          .from("vehicle_listings" as any)
          .select("id, title, price_brl, visibility_status, vehicle_type, city, state, vehicle_media(original_storage_path, public_masked_storage_path)")
          .eq("owner_user_id", user!.id)
          .order("created_at", { ascending: false });

        const vehicleRows: CatalogItem[] = [];

        (data ?? []).forEach((r: any) => {
          let imgUrl: string | null = null;
          if (r.vehicle_media?.length > 0) {
            const m = r.vehicle_media[0];
            const hasThumb = !!m.public_masked_storage_path && m.public_masked_storage_path !== m.original_storage_path;
            const path = hasThumb ? m.public_masked_storage_path : m.original_storage_path;
            if (path) {
              imgUrl = resolveImage(path, hasThumb ? "real-estate-public" : "real-estate-original");
            }
          }

          vehicleRows.push({
            id: r.id,
            title: r.title ?? "Sem título",
            price: r.price_brl ?? null,
            image: imgUrl || null,
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
                const hasThumb = !!row.public_masked_storage_path && row.public_masked_storage_path !== row.original_storage_path;
                const p = hasThumb ? row.public_masked_storage_path : row.original_storage_path;
                if (p) {
                  mediaMap.set(row.listing_id, resolveImage(p, hasThumb ? "real-estate-public" : "real-estate-original"));
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

      // Serviços
      if (!onlyCategory || onlyCategory === "servicos") {
        const { data } = await supabase
          .from("service_listings" as any)
          .select("id, title, service_type, price_label, city, state, visibility_status")
          .eq("owner_user_id", user!.id)
          .order("created_at", { ascending: false });

        const serviceRows = (data ?? []) as any[];
        const serviceIds = serviceRows.map((r: any) => r.id);
        const serviceMediaMap = new Map<string, string>();
        if (serviceIds.length > 0) {
          const { data: mediaRows } = await supabase
            .from("service_media" as any)
            .select("listing_id, original_storage_path, public_masked_storage_path, sort_order")
            .in("listing_id", serviceIds)
            .order("sort_order", { ascending: true });

          for (const m of (mediaRows ?? []) as any[]) {
            if (!serviceMediaMap.has(m.listing_id)) {
              const hasThumb = !!m.public_masked_storage_path && m.public_masked_storage_path !== m.original_storage_path;
              const p = hasThumb ? m.public_masked_storage_path : m.original_storage_path;
              if (p) {
                serviceMediaMap.set(m.listing_id, resolveImage(p, hasThumb ? "real-estate-public" : "real-estate-original"));
              }
            }
          }
        }

        serviceRows.forEach((r: any) => {
          const imgUrl = serviceMediaMap.get(r.id) ?? null;
          results.push({
            id: r.id,
            title: r.title ?? "Sem título",
            price: null,
            image: imgUrl || null,
            bucket: "marketing-materials",
            status: r.visibility_status ?? "draft",
            category: "servicos",
            extra: r.service_type ?? r.price_label,
            city: r.city,
            state: r.state,
            storeId: store?.id,
            storeName: store?.name,
          });
        });
      }

      // Fretes
      if (!onlyCategory || onlyCategory === "fretes") {
        const { data } = await supabase
          .from("freight_listings" as any)
          .select("id, title, vehicle_type, price_label, price_per_km, city, state, visibility_status")
          .eq("owner_user_id", user!.id)
          .order("created_at", { ascending: false });

        const freightRows = (data ?? []) as any[];
        const freightIds = freightRows.map((r: any) => r.id);
        const freightMediaMap = new Map<string, string>();
        if (freightIds.length > 0) {
          const { data: mediaRows } = await supabase
            .from("freight_media" as any)
            .select("listing_id, original_storage_path, public_masked_storage_path, sort_order")
            .in("listing_id", freightIds)
            .order("sort_order", { ascending: true });

          for (const m of (mediaRows ?? []) as any[]) {
            if (!freightMediaMap.has(m.listing_id)) {
              const hasThumb = !!m.public_masked_storage_path && m.public_masked_storage_path !== m.original_storage_path;
              const p = hasThumb ? m.public_masked_storage_path : m.original_storage_path;
              if (p) {
                freightMediaMap.set(m.listing_id, resolveImage(p, hasThumb ? "real-estate-public" : "real-estate-original"));
              }
            }
          }
        }

        freightRows.forEach((r: any) => {
          const imgUrl = freightMediaMap.get(r.id) ?? null;
          results.push({
            id: r.id,
            title: r.title ?? "Frete",
            price: r.price_per_km ?? null,
            image: imgUrl || null,
            bucket: "marketing-materials",
            status: r.visibility_status ?? "draft",
            category: "fretes",
            extra: r.vehicle_type ?? r.price_label,
            city: r.city,
            state: r.state,
            storeId: store?.id,
            storeName: store?.name,
          });
        });
      }

      // Viagens
      if (!onlyCategory || onlyCategory === "viagens") {
        const { data } = await supabase
          .from("travel_listings" as any)
          .select("id, title, category, destination, city, state, price_per_person, total_price, entry_price, visibility_status")
          .eq("owner_user_id", user!.id)
          .order("created_at", { ascending: false });

        const travelRows = (data ?? []) as any[];

        const travelIds = travelRows.map((r: any) => r.id);
        const travelMediaMap = new Map<string, string>();
        if (travelIds.length > 0) {
          const { data: mediaRows } = await supabase
            .from("travel_media" as any)
            .select("listing_id, original_storage_path, public_masked_storage_path, sort_order")
            .in("listing_id", travelIds)
            .order("sort_order", { ascending: true });

          for (const m of (mediaRows ?? []) as any[]) {
            if (!travelMediaMap.has(m.listing_id)) {
              const hasThumb = !!m.public_masked_storage_path && m.public_masked_storage_path !== m.original_storage_path;
              const p = hasThumb ? m.public_masked_storage_path : m.original_storage_path;
              if (p) {
                travelMediaMap.set(
                  m.listing_id,
                  resolveImage(p, hasThumb ? "real-estate-public" : "real-estate-original")
                );
              }
            }
          }
        }

        travelRows.forEach((r: any) => {
          const price = r.entry_price ?? r.price_per_person ?? r.total_price ?? null;
          const imgUrl = travelMediaMap.get(r.id) ?? null;
          results.push({
            id: r.id,
            title: r.title ?? "Viagem",
            price,
            image: imgUrl || null,
            bucket: "real-estate-original",
            status: r.visibility_status ?? "draft",
            category: "viagens",
            extra: r.category ?? r.destination,
            city: r.city ?? r.destination,
            state: r.state,
            storeId: store?.id,
            storeName: store?.name,
          });
        });
      }

      setAllItems(results);

      // Restore saved slots from DB — fila real (ativos + pausados) + redes por anúncio
      const { data: savedSlots } = await supabase
        .from("promoted_listing_slots" as any)
        .select("listing_id, listing_type, listing_title, listing_price, listing_image, listing_city, status, networks")
        .eq("user_id", user!.id)
        .in("status", ["active", "paused"])
        .order("created_at", { ascending: true });

      if (savedSlots && savedSlots.length > 0) {
        const rows = savedSlots as any[];
        setPromoted(rows.filter((r) => r.status === "active").map((r) => r.listing_id));
        setPausedIds(rows.filter((r) => r.status === "paused").map((r) => r.listing_id));
        setSlotNetworks(Object.fromEntries(rows.map((r) => [r.listing_id, r.networks ?? [...DEFAULT_NETWORKS]])));

        const restored: CatalogItem[] = rows
          .map((slot) => {
            let fallbackBucket = "marketing-materials";
            if (slot.listing_type === "imoveis") fallbackBucket = "real-estate-public";
            else if (slot.listing_type === "veiculos") fallbackBucket = "vehicles";
            else if (slot.listing_type === "viagens") fallbackBucket = "real-estate-original";
            else if (slot.listing_type === "produtos") fallbackBucket = "products";

            const found = results.find((r) => r.id === slot.listing_id);
            if (found) {
              return {
                ...found,
                image: found.image || resolveImage(slot.listing_image, fallbackBucket) || null,
              };
            }
            return {
              id: slot.listing_id,
              title: slot.listing_title ?? "Anúncio",
              price: slot.listing_price ?? null,
              image: resolveImage(slot.listing_image, fallbackBucket) || null,
              bucket: fallbackBucket,
              status: "active",
              category: (slot.listing_type ?? "produtos") as CategoryTab,
              city: slot.listing_city ?? undefined,
              state: undefined,
              storeId: undefined,
              storeName: undefined,
            } as CatalogItem;
          });
        setQueuedItems(restored);
        // NÃO popula selectedItems — slots visuais começam vazios
      } else {
        setQueuedItems([]);
        setPromoted([]);
        setPausedIds([]);
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
    if (pickerSearch.trim()) {
      const q = pickerSearch.toLowerCase();
      list = list.filter((i) => i.title.toLowerCase().includes(q));
    }
    // Mostra apenas os itens cadastrados por esse perfil — tanto os já selecionados quanto os ainda não selecionados
    const selectedIds = new Set(selectedItems.map((s) => s.id));
    const queuedIds = new Set(queuedItems.map((q) => q.id));
    return [...list].sort((a, b) => {
      const aSel = selectedIds.has(a.id) || queuedIds.has(a.id);
      const bSel = selectedIds.has(b.id) || queuedIds.has(b.id);
      if (aSel === bSel) return 0;
      return aSel ? 1 : -1; // não selecionados em primeiro para fácil escolha
    });
  }, [allItems, pickerTab, pickerSearch, selectedItems, queuedItems]);

  /* ── Fila visível — só os anúncios do perfil em uso (a fila real é da conta toda) ── */
  const visibleQueue = useMemo(
    () => queuedItems.filter((i) => i.category === (routeCategory ?? "produtos")),
    [queuedItems, routeCategory]
  );
  const visibleActiveCount = visibleQueue.filter((i) => promoted.includes(i.id)).length;

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
      if (pickerSlot !== null && pickerSlot < prev.length) {
        const copy = [...prev];
        copy[pickerSlot] = item;
        return copy;
      }
      if (prev.length >= MAX_PROMO_SLOTS) return prev;
      return [...prev, item];
    });
    setPickerSlot(null);
    setPickerSearch("");
    // O anúncio só vai para o banco quando o lojista clicar em "Enviar para a Fila"
  }

  /* ── Remove from slot + DB (soft delete via update_slot_status RPC — Regra #1) ── */
  async function handleRemoveSlot(itemId: string, itemTitle?: string) {
    setSelectedItems((prev) => prev.filter((p) => p.id !== itemId));
    setQueuedItems((prev) => prev.filter((p) => p.id !== itemId));
    setPromoted((prev) => prev.filter((id) => id !== itemId));
    setPausedIds((prev) => prev.filter((id) => id !== itemId));

    const { data: slotRow } = await supabase
      .from("promoted_listing_slots" as any)
      .select("id")
      .eq("user_id", user!.id)
      .eq("listing_id", itemId)
      .maybeSingle();

    if (!slotRow?.id) return;

    const { error } = await supabase.rpc("update_slot_status", {
      p_slot_id: slotRow.id,
      p_status:  "removed",
    });
    if (error) {
      toast.error("Erro ao remover da divulgação.");
    } else {
      toast(itemTitle ? `"${itemTitle}" removido da divulgação` : "Anúncio removido da divulgação", {
        description: "O slot está livre para um novo anúncio.",
      });
    }
  }

  /* ── Save single slot → promoted_listing_slots ── */
  async function handleSaveSlot(item: CatalogItem): Promise<boolean> {
    setSavingSlot(item.id);
    try {
      const resolvedImage = resolveImage(item.image ?? null, item.bucket);
      const { error } = await supabase
        .from("promoted_listing_slots" as any)
        .upsert({
          user_id:       user!.id,
          listing_type:  item.category,
          listing_id:    item.id,
          listing_title: item.title,
          listing_price: item.price,
          listing_image: resolvedImage || item.image || null,
          listing_city:  item.city || null,
          status:        "active",
          networks:      slotNetworks[item.id] ?? DEFAULT_NETWORKS,
        }, { onConflict: "user_id,listing_id" });

      if (error) throw error;

      setPromoted((prev) => prev.includes(item.id) ? prev : [...prev, item.id]);
      toast.success(`"${item.title}" enviado para a fila!`, {
        description: "Ele aparece na Fila de Publicação logo abaixo.",
      });
      return true;
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao salvar: ${err.message}`);
      return false;
    } finally {
      setSavingSlot(null);
    }
  }

  /* ── Enviar slot para a fila — salva no banco e move para a Fila de Publicação ── */
  async function handleSendToQueue(item: CatalogItem) {
    const ok = await handleSaveSlot(item);
    if (!ok) return;
    setQueuedItems((prev) => (prev.some((p) => p.id === item.id) ? prev : [...prev, item]));
    setSelectedItems((prev) => prev.filter((p) => p.id !== item.id));
    setPausedIds((prev) => prev.filter((id) => id !== item.id));
    setSlotNetworks((prev) => ({ ...prev, [item.id]: prev[item.id] ?? [...DEFAULT_NETWORKS] }));
  }

  /* ── Pausar/retomar divulgação de um anúncio da fila (RPC update_slot_status) ── */
  async function handleTogglePause(item: CatalogItem) {
    const willPause = !pausedIds.includes(item.id);
    const { data: slotRow } = await supabase
      .from("promoted_listing_slots" as any)
      .select("id")
      .eq("user_id", user!.id)
      .eq("listing_id", item.id)
      .maybeSingle();
    if (!slotRow?.id) {
      toast.error("Anúncio não encontrado na fila.");
      return;
    }
    const { error } = await supabase.rpc("update_slot_status" as any, {
      p_slot_id: slotRow.id,
      p_status:  willPause ? "paused" : "active",
    });
    if (error) {
      toast.error(willPause ? "Erro ao pausar a divulgação." : "Erro ao retomar a divulgação.");
      return;
    }
    setPausedIds((prev) => (willPause ? [...prev, item.id] : prev.filter((id) => id !== item.id)));
    setPromoted((prev) => (willPause ? prev.filter((id) => id !== item.id) : [...new Set([...prev, item.id])]));
    toast(willPause ? `"${item.title}" pausado` : `"${item.title}" reativado`, {
      description: willPause
        ? "O anúncio fica na fila, mas não será divulgado até você retomar."
        : "O anúncio voltou a ser divulgado.",
    });
  }

  /* ── Redes escolhidas por anúncio — persistidas no slot (RPC update_slot_networks) ── */
  async function handleToggleItemNetwork(itemId: string, netId: string) {
    const current = slotNetworks[itemId] ?? [...DEFAULT_NETWORKS];
    const next = current.includes(netId) ? current.filter((n) => n !== netId) : [...current, netId];
    setSlotNetworks((prev) => ({ ...prev, [itemId]: next }));
    const { data: slotRow } = await supabase
      .from("promoted_listing_slots" as any)
      .select("id")
      .eq("user_id", user!.id)
      .eq("listing_id", itemId)
      .maybeSingle();
    if (!slotRow?.id) return;
    const { error } = await supabase.rpc("update_slot_networks" as any, {
      p_slot_id:  slotRow.id,
      p_networks: next,
    });
    if (error) toast.error("Erro ao salvar as redes deste anúncio.");
  }

  /* ── Submit all filled slots at once → promoted_listing_slots ── */
  async function handlePromote() {
    if (selectedItems.length === 0) return;
    setSubmitting(true);
    try {
      const rows = selectedItems.map((item) => ({
        user_id:       user!.id,
        listing_type:  item.category,
        listing_id:    item.id,
        listing_title: item.title,
        listing_price: item.price,
        listing_image: resolveImage(item.image ?? null, item.bucket) || item.image || null,
        listing_city:  item.city || null,
        status:        "active",
        networks:      slotNetworks[item.id] ?? DEFAULT_NETWORKS,
      }));
      const { error } = await supabase
        .from("promoted_listing_slots" as any)
        .upsert(rows, { onConflict: "user_id,listing_id" });
      if (error) throw error;

      const sentItems = [...selectedItems];
      const sentIds = sentItems.map((i) => i.id);
      toast.success(`${sentItems.length} anúncio(s) enviado(s) para divulgação!`, {
        description: "Slots liberados — escolha novos anúncios quando quiser.",
      });
      setSelectedItems([]);                                    // limpa slots visuais
      setQueuedItems((prev) => {                              // atualiza fila real (merge)
        const existingIds = new Set(prev.map((p) => p.id));
        const news = sentItems.filter((i) => !existingIds.has(i.id));
        return [...prev, ...news];
      });
      setPromoted((prev) => [...new Set([...prev, ...sentIds])]);
      autoOpenedRef.current = false;
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao ativar divulgação: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setSubmitting(false);
    }
  }

  /* ── AI Text Generation — per network ── */
  async function handleGeneratePromoText() {
    if (selectedItems.length === 0 || selectedNetworks.length === 0) return;
    setGeneratingPromoText(true);
    setNetworkTexts({});
    setGeneratedPromoText("");

    const itemsContext = selectedItems.map((item, idx) => {
      const catLabel: Record<CategoryTab, string> = {
        produtos: "Produto", imoveis: "Imóvel", veiculos: "Veículo",
        servicos: "Serviço", fretes: "Frete", viagens: "Viagem",
      };
      return `Item ${idx + 1}: ${item.title} — Tipo: ${catLabel[item.category]} — Preço: ${item.price ? formatCurrencyBRL(item.price) : "Consulte"} — Local: ${[item.city, item.state].filter(Boolean).join(", ") || "Não informado"}`;
    }).join("\n");

    const networkInstructions: Record<string, string> = {
      whatsapp:  "WhatsApp: escrita informal e calorosa, emojis moderados, máximo 300 palavras, CTA para chamar no WhatsApp ou acessar o link",
      instagram: "Instagram: linguagem jovem e visual, muitos emojis, hashtags relevantes ao final (#), máximo 2200 caracteres",
      facebook:  "Facebook: texto mais longo e conversacional, engaje com perguntas ao leitor, CTA claro para comentar ou compartilhar",
      linkedin:  "LinkedIn: linguagem profissional e formal, foco em valor e credibilidade, sem emojis excessivos, até 700 palavras",
      telegram:  "Telegram: direto e objetivo, formatação em negrito **assim** para destaques, emojis moderados, inclua link de contato",
      twitter:   "X / Twitter: texto extremamente curto (máximo 280 caracteres), impactante, uma hashtag principal",
    };

    const systemPrompt = `Você é um especialista em marketing digital e copywriting para redes sociais brasileiras.
Crie textos de divulgação altamente persuasivos usando gatilhos mentais (urgência, escassez, prova social, autoridade).
Escreva em português brasileiro coloquial e envolvente. Adapte exatamente ao tom e formato de cada rede social.
Use [LINK DA LOJA] como placeholder para o link da loja do anunciante.`;

    try {
      const results: Record<string, string> = {};
      await Promise.all(
        selectedNetworks.map(async (networkId) => {
          const instruction = networkInstructions[networkId] || networkId;
          const userPrompt = `Rede social: ${instruction}\n\nItens para divulgar:\n${itemsContext}\n\nGere o texto de divulgação para esta rede:`;
          try {
            results[networkId] = await chatCompletion(userPrompt, undefined, systemPrompt);
          } catch {
            results[networkId] = "Erro ao gerar. Tente novamente.";
          }
        })
      );
      setNetworkTexts(results);
      setActiveNetworkTab(selectedNetworks[0]);
      toast.success(`Textos gerados para ${selectedNetworks.length} rede(s)!`);
    } catch (err: any) {
      console.error("Erro ao gerar textos:", err);
      toast.error("Não foi possível gerar os textos com o Viagg-TX8™.");
    } finally {
      setGeneratingPromoText(false);
    }
  }

  function handleCopyPromoText() {
    navigator.clipboard.writeText(generatedPromoText);
    setCopiedText(true);
    toast.success("Texto copiado!");
    setTimeout(() => setCopiedText(false), 2000);
  }

  function handleCopyNetworkText(networkId: string) {
    const text = networkTexts[networkId];
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedNetwork(networkId);
    toast.success("Texto copiado!");
    setTimeout(() => setCopiedNetwork(null), 2000);
  }

  /* ── Build slots array — itens preenchidos + 1 slot vazio extra (até MAX_PROMO_SLOTS) ── */
  const visibleSlotCount = Math.min(selectedItems.length + 1, MAX_PROMO_SLOTS);
  const slots: (CatalogItem | null)[] = Array.from({ length: visibleSlotCount }, (_, i) => selectedItems[i] ?? null);

  /* ── Picker tabs — filtrado pela rota atual ── */
  const allPickerTabs: { key: CategoryTab; label: string; icon: React.ElementType }[] = [
    { key: "produtos",  label: "Produtos",  icon: Package },
    { key: "imoveis",   label: "Imóveis",   icon: Building2 },
    { key: "veiculos",  label: "Veículos",  icon: Car },
    { key: "servicos",  label: "Serviços",  icon: Briefcase },
    { key: "fretes",    label: "Fretes",    icon: Truck },
    { key: "viagens",   label: "Viagens",   icon: Plane },
  ];
  const pickerTabs = allPickerTabs.filter((t) => t.key === (routeCategory ?? "produtos"));

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
      <div className="bg-[#0D0F12] rounded-3xl border border-[#2A3038]/60 relative max-w-sm sm:max-w-none md:max-w-[70%] mx-auto w-full">
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
            <Badge className="bg-white/20 text-white border-white/30 text-[10px] font-black uppercase tracking-wider">
              {selectedItems.length}/{MAX_PROMO_SLOTS}
            </Badge>
          </div>
        </div>

        {/* 1 Slot de marca + 5 Slots do usuário — 2 linhas × 3 colunas */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-[#2A3038]/40 relative">

          {/* ── Slot 0: MARCA — mostra balão ao clicar (não navega) ── */}
          <div className="relative">
            <button
              onClick={handleBrandClick}
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

            {/* Balão de mensagem — aparece ao clicar no card da marca */}
            {showBrandBalloon && (
              <div className="absolute top-2 left-2 right-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="bg-[#1B1F24] border border-[#FF6A00]/60 rounded-2xl p-3 shadow-2xl shadow-black/80">
                  {/* seta apontando para o card */}
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#1B1F24] border-b border-r border-[#FF6A00]/60 rotate-45" />

                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-xl bg-[#FF6A00]/15 border border-[#FF6A00]/30 flex items-center justify-center shrink-0 mt-0.5">
                      <Megaphone className="w-3.5 h-3.5 text-[#FF6A00]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-black text-[11px] uppercase tracking-wider leading-tight">
                        Este espaço é dos Divulgadores
                      </p>
                      <p className="text-[#A7B0BE] text-[10px] mt-1 leading-relaxed">
                        Este card é exibido para os <span className="text-[#FF6A00] font-bold">divulgadores da plataforma</span>, não para você como anunciante.
                        Use os slots ao lado para colocar seus anúncios! 👉
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowBrandBalloon(false); }}
                      className="text-[#A7B0BE] hover:text-white shrink-0 mt-0.5 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Slots 1-5: conteúdo do usuário ── */}
          {/* Mobile: apenas 1 slot visível (idx 0); sm+ mostra todos */}
          {slots.map((slot, idx) => {
            if (slot) {
              const imgUrl = resolveImage(slot.image, slot.bucket);
              return (
                <div key={slot.id} className={`relative bg-[#1B1F24] group/slot flex flex-col${idx > 0 ? " hidden sm:flex" : ""}`}>
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
                          const slotIdx = selectedItems.findIndex((s) => s.id === slot.id);
                          setPickerSlot(slotIdx >= 0 ? slotIdx : idx);
                          setPickerSearch("");
                          setPickerTab(routeCategory ?? "produtos");
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
                    {/* Enviar para a Fila — botão por slot */}
                    <button
                      onClick={() => handleSendToQueue(slot)}
                      disabled={savingSlot === slot.id}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all bg-[#FF6A00]/15 text-[#FF6A00] border border-[#FF6A00]/25 hover:bg-[#FF6A00]/25 hover:shadow-lg hover:shadow-[#FF6A00]/10"
                    >
                      {savingSlot === slot.id ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> Enviando...</>
                      ) : (
                        <><Send className="w-3 h-3" /> Enviar para a Fila</>
                      )}
                    </button>
                  </div>
                </div>
              );
            }

            // ── Empty Slot (CLICKABLE) ──
            return (
              <div key={`empty-${idx}`} className={`relative${idx > 0 ? " hidden sm:block" : ""}`}>
                <button
                  onClick={() => {
                    setPickerSlot(idx);
                    setPickerSearch("");
                    setPickerTab(routeCategory ?? "produtos");
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
                      <div className={`grid ${pickerTabs.length === 1 ? "grid-cols-1" : "grid-cols-3"} gap-1 p-1 bg-[#1B1F24] rounded-xl`}>
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
                          const isAlreadySelected = selectedItems.some((s) => s.id === item.id) || queuedItems.some((q) => q.id === item.id);
                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                if (isAlreadySelected && (pickerSlot === null || (selectedItems[pickerSlot]?.id !== item.id && queuedItems[pickerSlot]?.id !== item.id))) {
                                  toast.info("Este item já está em sua divulgação / fila.");
                                  return;
                                }
                                selectFromPicker(item);
                              }}
                              className="w-full flex items-center gap-3 p-3 hover:bg-[#1B1F24] transition-colors border-b border-[#2A3038]/30 last:border-b-0 text-left group/pick"
                            >
                              {/* Thumbnail */}
                              <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#1B1F24] shrink-0 border border-[#2A3038]/40">
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
                                {item.price !== null && item.price !== undefined && (
                                  <p className="text-xs font-black text-green-500">
                                    {formatCurrencyBRL(item.price)}
                                  </p>
                                )}
                                {(item.city || item.state) && (
                                  <div className="flex items-center gap-1 text-[#A7B0BE] mt-0.5">
                                    <MapPin className="w-2.5 h-2.5" />
                                    <span className="text-[9px]">{[item.city, item.state].filter(Boolean).join(", ")}</span>
                                  </div>
                                )}
                              </div>
                              {/* Add/Status badge */}
                              {isAlreadySelected ? (
                                <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400 text-[10px] font-black shrink-0">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Já na Divulgação</span>
                                </div>
                              ) : (
                                <div className="w-7 h-7 rounded-lg bg-[#FF6A00]/10 flex items-center justify-center shrink-0 group-hover/pick:bg-[#FF6A00] transition-colors">
                                  <Plus className="w-3.5 h-3.5 text-[#FF6A00] group-hover/pick:text-white transition-colors" />
                                </div>
                              )}
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

        {/* Action Buttons — sempre visível; botões desabilitados quando sem itens */}
        <div className="px-3 sm:px-6 py-4 bg-[#0D0F12] border-t border-[#2A3038]/40 rounded-b-3xl space-y-4">

            {/* Network selector */}
            <div className="bg-[#1B1F24] border border-[#2A3038]/60 rounded-xl p-3">
              <p className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-[#FF6A00]" />
                Gerar texto para estas redes:
              </p>
              <div className="flex flex-wrap gap-2">
                {SOCIAL_NETWORKS.map((net) => {
                  const active = selectedNetworks.includes(net.id);
                  return (
                    <button
                      key={net.id}
                      onClick={() =>
                        setSelectedNetworks((prev) =>
                          prev.includes(net.id)
                            ? prev.filter((n) => n !== net.id)
                            : [...prev, net.id]
                        )
                      }
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-black transition-all border ${
                        active
                          ? "text-white border-transparent"
                          : "bg-transparent text-[#A7B0BE] border-[#2A3038] hover:border-[#A7B0BE]/40"
                      }`}
                      style={active ? { backgroundColor: net.color + "33", borderColor: net.color + "66", color: net.color } : {}}
                    >
                      <span>{net.emoji}</span>
                      {net.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Botões principais ── */}
            <div className="flex flex-col md:flex-row gap-3">
              {/* Grátis: 1 anúncio por dia */}
              <Button
                onClick={() => { setSelectedMode("free"); handlePromote(); }}
                disabled={submitting || selectedItems.length === 0}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider text-xs h-14 rounded-xl shadow-lg shadow-emerald-700/25 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none gap-2"
              >
                {submitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Radio className="w-5 h-5" />
                )}
                {submitting ? "Enviando..." : "Manter 1 anúncio grátis por dia"}
              </Button>

              {/* Pago: ver pacotes */}
              <Button
                onClick={() => setShowPlansModal(true)}
                disabled={selectedItems.length === 0}
                className="flex-1 bg-[#FF6A00] hover:bg-[#E65C00] text-white font-black uppercase tracking-wider text-xs h-14 rounded-xl shadow-lg shadow-[#FF6A00]/25 transition-all duration-300 hover:shadow-xl hover:shadow-[#FF6A00]/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none gap-2"
              >
                <Sparkles className="w-5 h-5" />
                Ver Pacotes de Divulgação
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>

            {/* ── Postador IA (função avançada — abaixo dos botões principais) ── */}
            <details className="group">
              <summary className="cursor-pointer list-none flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[#A7B0BE]/60 hover:text-[#A7B0BE] transition-colors select-none">
                <Bot className="w-3.5 h-3.5" />
                Gerar texto com Viagg-TX8™ para redes sociais
                <span className="ml-auto text-[10px] group-open:hidden">▼</span>
                <span className="ml-auto text-[10px] hidden group-open:inline">▲</span>
              </summary>
              <div className="mt-3">
                <Button
                  onClick={handleGeneratePromoText}
                  disabled={generatingPromoText || selectedNetworks.length === 0 || selectedItems.length === 0}
                  variant="outline"
                  className="w-full bg-transparent border-[#FF6A00]/40 text-[#FF6A00] hover:bg-[#FF6A00]/10 hover:border-[#FF6A00] font-black uppercase tracking-wider text-xs h-12 rounded-xl transition-all duration-300"
                >
                  {generatingPromoText ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ) : (
                    <Bot className="w-5 h-5 mr-2" />
                  )}
                  {generatingPromoText
                    ? `Gerando para ${selectedNetworks.length} rede(s)...`
                    : `Postador Viagg-TX8™ — Gerar para ${selectedNetworks.length} Rede(s)`}
                </Button>
              </div>
            </details>

            {/* Per-network generated texts */}
            {Object.keys(networkTexts).length > 0 && (
              <div className="bg-[#1B1F24] border border-[#2A3038] rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-4">
                {/* Header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2A3038]/60">
                  <div className="w-6 h-6 rounded-md bg-[#FF6A00]/10 flex items-center justify-center border border-[#FF6A00]/20">
                    <Sparkles className="w-3.5 h-3.5 text-[#FF6A00]" />
                  </div>
                  <span className="text-xs font-black text-white uppercase tracking-wider flex-1">
                    Textos gerados pelo Postador Viagg-TX8™
                  </span>
                  <span className="text-[10px] text-[#A7B0BE]/60">{Object.keys(networkTexts).length} rede(s)</span>
                </div>

                {/* Network tabs */}
                <div className="flex overflow-x-auto border-b border-[#2A3038]/40 bg-[#0D0F12]">
                  {SOCIAL_NETWORKS.filter((n) => networkTexts[n.id]).map((net) => (
                    <button
                      key={net.id}
                      onClick={() => setActiveNetworkTab(net.id)}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-2 text-[11px] font-black transition-all border-b-2 ${
                        activeNetworkTab === net.id
                          ? "border-[#FF6A00] text-white"
                          : "border-transparent text-[#A7B0BE] hover:text-white"
                      }`}
                    >
                      <span>{net.emoji}</span>
                      {net.label}
                    </button>
                  ))}
                </div>

                {/* Active network text */}
                {SOCIAL_NETWORKS.filter((n) => n.id === activeNetworkTab && networkTexts[n.id]).map((net) => (
                  <div key={net.id} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-[#A7B0BE]">
                        {net.emoji} Texto para {net.label}
                      </span>
                      <Button
                        onClick={() => handleCopyNetworkText(net.id)}
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[#A7B0BE] hover:text-white hover:bg-[#2A3038] text-xs font-bold"
                      >
                        {copiedNetwork === net.id ? (
                          <><Check className="w-3.5 h-3.5 mr-1 text-green-400" /> Copiado</>
                        ) : (
                          <><Copy className="w-3.5 h-3.5 mr-1" /> Copiar</>
                        )}
                      </Button>
                    </div>
                    <Textarea
                      readOnly
                      value={networkTexts[net.id]}
                      className="min-h-[160px] bg-[#0D0F12] border-[#2A3038] text-[#F5F7FA] text-sm custom-scrollbar focus-visible:ring-[#FF6A00]/30"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
      </div>

      {/* ═══════════════════════════════════════════
          FILA DE PUBLICAÇÃO — lista editável dos
          anúncios que estão nos slots
      ═══════════════════════════════════════════ */}
      {visibleQueue.length > 0 && (
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
                  {visibleQueue.length} anúncio{visibleQueue.length > 1 ? "s" : ""} deste perfil na fila · publicados pelos divulgadores
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.20)" }}>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                {visibleActiveCount}/{visibleQueue.length} ativos
              </span>
            </div>
          </div>

          {/* List of queued items */}
          <div className="divide-y divide-[#2A3038]/30">
            {visibleQueue.map((item, idx) => {
              const imgUrl = resolveImage(item.image, item.bucket);
              const isActive = promoted.includes(item.id);
              const isPaused = pausedIds.includes(item.id);
              const itemNets = slotNetworks[item.id] ?? DEFAULT_NETWORKS;
              const categoryIcon =
                item.category === "imoveis"  ? Building2
                : item.category === "veiculos" ? Car
                : item.category === "servicos" ? Briefcase
                : item.category === "fretes"   ? Truck
                : item.category === "viagens"  ? Plane
                : Package;
              const CategoryIcon = categoryIcon;

              return (
                <div
                  key={item.id}
                  className="px-4 sm:px-6 py-3 hover:bg-[#1B1F24]/60 transition-colors group/row"
                >
                  <div className="flex items-center gap-3">
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
                      : isPaused
                      ? { background: "rgba(148,163,184,0.10)", border: "1px solid rgba(148,163,184,0.20)", color: "#94a3b8" }
                      : { background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.20)", color: "#f59e0b" }
                    }>
                    {isActive ? (
                      <><CheckCircle2 className="w-2.5 h-2.5" /> Ativo</>
                    ) : isPaused ? (
                      <><Pause className="w-2.5 h-2.5" /> Pausado</>
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
                        setPickerSlot(idx);
                        setPickerSearch("");
                        setPickerTab(routeCategory ?? "produtos");
                      }}
                      className="w-7 h-7 rounded-lg bg-[#2A3038]/60 text-[#A7B0BE] flex items-center justify-center hover:bg-blue-500/20 hover:text-blue-400 transition-all"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                    {/* Pausar / Retomar */}
                    <button
                      title={isPaused ? "Retomar divulgação" : "Pausar divulgação"}
                      onClick={() => handleTogglePause(item)}
                      className="w-7 h-7 rounded-lg bg-[#2A3038]/60 text-[#A7B0BE] flex items-center justify-center hover:bg-amber-500/20 hover:text-amber-400 transition-all"
                    >
                      {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                    </button>
                    {/* Excluir */}
                    <button
                      title="Excluir da fila"
                      onClick={() => handleRemoveSlot(item.id, item.title)}
                      className="w-7 h-7 rounded-lg bg-[#2A3038]/60 text-[#A7B0BE] flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  </div>

                  {/* Redes onde este anúncio será divulgado */}
                  <div className="mt-2 sm:pl-10 flex flex-wrap items-center gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#A7B0BE]/50 mr-1">
                      Divulgar em:
                    </span>
                    {SOCIAL_NETWORKS.map((net) => {
                      const netActive = itemNets.includes(net.id);
                      return (
                        <button
                          key={net.id}
                          onClick={() => handleToggleItemNetwork(item.id, net.id)}
                          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all border ${
                            netActive
                              ? "text-white border-transparent"
                              : "bg-transparent text-[#A7B0BE]/60 border-[#2A3038] hover:border-[#A7B0BE]/40"
                          }`}
                          style={netActive ? { backgroundColor: net.color + "33", borderColor: net.color + "66", color: net.color } : {}}
                        >
                          <span>{net.emoji}</span>
                          {net.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Card inteligente de acompanhamento (sempre visível — gratuito ou pago) */}
          {user?.id && (
            <CampaignTrackingCard
              userId={user.id}
              category={routeCategory as any}
              onUpgrade={() => { setSelectedMode("paid"); setShowPlansModal(true); }}
              onFreeSelect={() => setSelectedMode("free")}
              selectedMode={selectedMode}
            />
          )}

          {/* Painel vivo da campanha ativa (só para plano pago) */}
          {user?.id && <PromotionActiveDashboard userId={user.id} />}

          {/* Footer tip */}
          <div className="px-4 sm:px-6 py-3 border-t border-[#2A3038]/30 flex flex-col sm:flex-row items-start sm:items-center gap-2"
            style={{ background: "rgba(255,106,0,0.03)" }}>
            <div className="flex items-center gap-2 flex-1">
              <Sparkles className="w-3 h-3 text-[#FF6A00]/50 shrink-0" />
              <p className="text-[9px] text-[#A7B0BE]/40 font-medium">
                Anúncios ativos serão exibidos para motoboys da sua região automaticamente.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                style={{ background: "rgba(255,106,0,0.08)", border: "1px solid rgba(255,106,0,0.20)" }}>
                <Sparkles className="w-3 h-3 text-[#FF6A00] shrink-0" />
                <p className="text-[10px] text-[#FF6A00] font-black uppercase tracking-wide">
                  1 anúncio grátis por dia
                </p>
              </div>
              <button
                onClick={() => setShowPlansModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all hover:opacity-90 active:scale-95"
                style={{ background: "#EAB308", color: "#000" }}
              >
                <Sparkles className="w-3 h-3 shrink-0" />
                Quer promover mais? Clique aqui!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Botão: Enviar ao Postador de Motoboys ── */}
      <div className="space-y-2">
        <Button
          onClick={async () => {
            resetGlm();
            const res = await sendToPostador();
            if (res) {
              if (res.lotsCreated > 0) {
                toast.success(`${res.lotsCreated} lote(s) enviado(s) ao Postador!`, {
                  description: "Os motoboys já podem ver e postar seus anúncios.",
                });
              } else {
                toast(`Nenhum lote criado — salve os anúncios nos slots primeiro.`, {
                  description: res.errors[0] ?? "Slots sem itens salvos.",
                });
              }
            } else {
              toast.error(glmError ?? "Erro ao enviar ao Postador.");
            }
          }}
          disabled={glmSending || promoted.length === 0}
          variant="outline"
          className="w-full bg-gradient-to-r from-[#1a1a2e]/80 to-[#16213e]/80 border-violet-500/40 text-violet-300 hover:bg-violet-500/10 hover:border-violet-400 font-black uppercase tracking-wider text-xs h-12 rounded-xl transition-all duration-300"
        >
          {glmSending ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          {glmSending
            ? "Organizando lotes..."
            : "Enviar para Postagens"}
        </Button>

        {glmResult && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 animate-in fade-in duration-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span className="text-[10px] text-violet-300 font-bold">
              {glmResult.lotsCreated} lote(s) enviado(s) ao painel do Postador
              {glmResult.errors.length > 0 && ` · ${glmResult.errors.length} erro(s)`}
            </span>
          </div>
        )}
        {glmError && (
          <p className="text-[10px] text-red-400 px-1">{glmError}</p>
        )}
      </div>

      {/* Modal de planos de promoção pago — filtrado pelo perfil atual */}
      <PromotionPlansModal
        open={showPlansModal}
        onClose={() => setShowPlansModal(false)}
        profileType={routeCategory ?? undefined}
      />

      {/* Balão flutuante de conversão (aparece 2 s após carregar, fecha com X, reaparece em 8 h) */}
      {user?.id && (
        <PromotionFloatingBalloon
          userId={user.id}
          onOpenPlans={() => setShowPlansModal(true)}
        />
      )}
    </div>
  );
}
