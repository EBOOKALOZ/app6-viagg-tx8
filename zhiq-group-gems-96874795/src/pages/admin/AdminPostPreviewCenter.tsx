/**
 * AdminPostPreviewCenter — Central de Pré-Visualização das Postagens
 *
 * Visualiza em tempo real como cada SmartCard será publicado:
 * · categoria, layout visual final, hora prevista, badge PROMOVIDO
 * · timeline respeitando interval_minutes e max_publications do pacote
 * · fila com posição, restante de publicações, prioridade, expiração
 * · inteligência comercial: promos ativas, perto do limite, expirando em breve
 *
 * Fontes de dados:
 *   promoted_listing_slots + promotion_purchases + promotion_packages
 *   posting_lots + posting_lot_items + campaign_queue
 *
 * Atualização: 30s polling + Supabase realtime em promoted_listing_slots
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrencyBRL as formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  addMinutes, addDays, format, differenceInMinutes,
  differenceInDays, isPast, isFuture,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Monitor, RefreshCw, Pin, Clock, Layers, BrainCircuit,
  ShoppingBag, Home, Car, Wrench, Truck, Plane,
  MapPin, Star, ChevronRight, Search, Filter,
  ArrowRight, Zap, TrendingUp, Package, AlertCircle,
  CheckCircle2, Timer, CalendarClock, BarChart2, Repeat2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
interface PromotionPackage {
  id: string;
  name: string;
  max_publications: number;
  interval_minutes: number;
  priority: number;
  duration_days: number;
  price_brl?: number;
}

interface PromotionPurchase {
  id: string;
  user_id: string;
  status: string;
  amount_brl?: number;
  created_at: string;
  package_id?: string;
  pkg?: PromotionPackage;
}

interface PromotedSlot {
  id: string;
  listing_type: string;
  listing_title: string;
  listing_city: string;
  listing_price?: number;
  listing_image?: string;
  user_id: string;
  created_at: string;
  promotion_purchase_id?: string;
  // enriched
  pkg?: PromotionPackage;
  purchase?: PromotionPurchase;
  remaining_publications?: number;
  expires_at?: Date;
}

interface PostingLotItem {
  id: string;
  lot_id: string;
  product_name: string;
  product_price?: number;
  product_image_url?: string;
  position: number;
}

interface PostingLot {
  id: string;
  store_name?: string;
  store_logo_url?: string;
  target_city?: string;
  status: string;
  items_count: number;
  created_at: string;
  items: PostingLotItem[];
}

interface CampaignQueueItem {
  id: string;
  title: string;
  status: string;
  message_text?: string;
  media_url?: string;
  target_city?: string;
  created_at: string;
}

interface PreviewData {
  promoted: PromotedSlot[];
  lots: PostingLot[];
  campaigns: CampaignQueueItem[];
  packages: PromotionPackage[];
  purchases: PromotionPurchase[];
}

// ─────────────────────────────────────────────────────────
// Hook de dados
// ─────────────────────────────────────────────────────────
function usePostPreviewData() {
  return useQuery<PreviewData>({
    queryKey: ["post-preview-center"],
    staleTime: 20_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [slotsRes, purchasesRes, pkgsRes, lotsRes, lotItemsRes, campaignsRes] =
        await Promise.allSettled([
          (supabase.from("promoted_listing_slots") as any)
            .select("id, listing_type, listing_title, listing_city, user_id, created_at, promotion_purchase_id")
            .order("created_at", { ascending: true })
            .limit(300),
          (supabase.from("promotion_purchases") as any)
            .select("id, user_id, status, amount_brl, created_at, package_id")
            .in("status", ["active", "paid", "approved", "completed"])
            .order("created_at", { ascending: false })
            .limit(300),
          (supabase.from("promotion_packages") as any)
            .select("id, name, max_publications, interval_minutes, priority, duration_days, price_brl")
            .limit(50),
          (supabase.from("posting_lots") as any)
            .select("id, store_name, store_logo_url, target_city, status, items_count, created_at")
            .in("status", ["available", "claimed"])
            .order("created_at", { ascending: true })
            .limit(100),
          (supabase.from("posting_lot_items") as any)
            .select("id, lot_id, product_name, product_price, product_image_url, position")
            .order("position", { ascending: true })
            .limit(300),
          (supabase.from("campaign_queue") as any)
            .select("id, title, status, message_text, media_url, target_city, created_at")
            .in("status", ["pending", "queued", "approved", "ready", "scheduled"])
            .order("created_at", { ascending: true })
            .limit(50),
        ]);

      function rows(r: PromiseSettledResult<any>): any[] {
        return r.status === "fulfilled" ? (r.value?.data ?? []) : [];
      }

      const rawSlots: any[] = rows(slotsRes);
      const rawPurchases: any[] = rows(purchasesRes);
      const rawPkgs: PromotionPackage[] = rows(pkgsRes);
      const rawLots: any[] = rows(lotsRes);
      const rawItems: PostingLotItem[] = rows(lotItemsRes);
      const rawCampaigns: CampaignQueueItem[] = rows(campaignsRes);

      // Build package lookup
      const pkgById: Record<string, PromotionPackage> = {};
      rawPkgs.forEach((p) => { pkgById[p.id] = p; });

      // Build purchases with their package
      const purchases: PromotionPurchase[] = rawPurchases.map((p) => ({
        ...p,
        pkg: p.package_id ? pkgById[p.package_id] : undefined,
      }));

      // Build purchase lookup by id and by user_id (fallback)
      const purchaseById: Record<string, PromotionPurchase> = {};
      const purchaseByUser: Record<string, PromotionPurchase[]> = {};
      purchases.forEach((p) => {
        purchaseById[p.id] = p;
        if (!purchaseByUser[p.user_id]) purchaseByUser[p.user_id] = [];
        purchaseByUser[p.user_id].push(p);
      });

      // Default package when no match found
      const defaultPkg: PromotionPackage = {
        id: "default",
        name: "Padrão",
        max_publications: 10,
        interval_minutes: 60,
        priority: 1,
        duration_days: 30,
      };

      // Enrich promoted slots
      const promoted: PromotedSlot[] = rawSlots.map((slot) => {
        let purchase: PromotionPurchase | undefined;
        let pkg: PromotionPackage | undefined;

        if (slot.promotion_purchase_id) {
          purchase = purchaseById[slot.promotion_purchase_id];
        }
        if (!purchase && purchaseByUser[slot.user_id]) {
          // Fallback: most recent purchase from same user
          purchase = purchaseByUser[slot.user_id][0];
        }

        pkg = purchase?.pkg ?? defaultPkg;

        const slotCreated = new Date(slot.created_at);
        const expires_at = addDays(slotCreated, pkg.duration_days);

        // Estimate remaining publications (no real counter — approximate)
        const daysSinceCreated = Math.max(0, differenceInDays(new Date(), slotCreated));
        const estimatedUsed = Math.min(
          pkg.max_publications,
          Math.floor((daysSinceCreated * 24 * 60) / pkg.interval_minutes)
        );
        const remaining_publications = Math.max(0, pkg.max_publications - estimatedUsed);

        return {
          ...slot,
          purchase,
          pkg,
          remaining_publications,
          expires_at,
        };
      });

      // Lots with items
      const lots: PostingLot[] = rawLots.map((lot) => ({
        ...lot,
        items: rawItems.filter((i) => i.lot_id === lot.id),
      }));

      return {
        promoted,
        lots,
        campaigns: rawCampaigns,
        packages: rawPkgs,
        purchases,
      };
    },
  });
}

// ─────────────────────────────────────────────────────────
// Category config
// ─────────────────────────────────────────────────────────
type CatKey = "produto" | "imovel" | "veiculo" | "servico" | "frete" | "viagem" | "outros";

const CAT_CONFIG: Record<CatKey, {
  label: string; icon: React.ElementType;
  gradient: string; bg: string; text: string; border: string;
}> = {
  produto:  { label: "Mercado",  icon: ShoppingBag, gradient: "from-orange-500 to-amber-400",  bg: "bg-orange-50",  text: "text-orange-700", border: "border-orange-200" },
  imovel:   { label: "Imóveis",  icon: Home,        gradient: "from-green-600 to-emerald-400", bg: "bg-green-50",   text: "text-green-700",  border: "border-green-200" },
  veiculo:  { label: "Veículos", icon: Car,         gradient: "from-blue-600 to-sky-400",      bg: "bg-blue-50",    text: "text-blue-700",   border: "border-blue-200" },
  servico:  { label: "Serviços", icon: Wrench,      gradient: "from-purple-600 to-violet-400", bg: "bg-purple-50",  text: "text-purple-700", border: "border-purple-200" },
  frete:    { label: "Fretes",   icon: Truck,       gradient: "from-amber-600 to-yellow-400",  bg: "bg-amber-50",   text: "text-amber-700",  border: "border-amber-200" },
  viagem:   { label: "Viagens",  icon: Plane,       gradient: "from-indigo-600 to-cyan-400",   bg: "bg-indigo-50",  text: "text-indigo-700", border: "border-indigo-200" },
  outros:   { label: "Outros",   icon: Package,     gradient: "from-gray-500 to-slate-400",    bg: "bg-gray-50",    text: "text-gray-700",   border: "border-gray-200" },
};

function catCfg(type: string) {
  return CAT_CONFIG[(type as CatKey)] ?? CAT_CONFIG.outros;
}

// ─────────────────────────────────────────────────────────
// SmartCard — Promovido
// ─────────────────────────────────────────────────────────
function SmartCard({
  item, queuePos, estimatedTime,
}: { item: PromotedSlot; queuePos: number; estimatedTime: Date }) {
  const cfg = catCfg(item.listing_type);
  const Icon = cfg.icon;
  const timeStr = format(estimatedTime, "HH:mm", { locale: ptBR });
  const minsLeft = differenceInMinutes(estimatedTime, new Date());
  const remaining = item.remaining_publications ?? 0;
  const expiresIn = item.expires_at ? differenceInDays(item.expires_at, new Date()) : null;
  const nearLimit = remaining <= 2 && remaining > 0;
  const expiringSoon = expiresIn !== null && expiresIn <= 3 && expiresIn >= 0;

  return (
    <div className={cn(
      "rounded-2xl overflow-hidden border shadow-md bg-white flex flex-col",
      nearLimit ? "border-orange-300" : expiringSoon ? "border-red-300" : "border-border"
    )}>
      {/* Header colorido */}
      <div className={cn("bg-gradient-to-r p-3 flex items-center gap-2", cfg.gradient)}>
        <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-[13px] truncate leading-tight">
            {item.listing_title || "Sem título"}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <MapPin className="h-2.5 w-2.5 text-white/70" />
            <p className="text-white/80 text-[10px] truncate">{item.listing_city || "Brasil"}</p>
            <span className="text-white/40">·</span>
            <span className="text-white/80 text-[10px]">{cfg.label}</span>
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-bold bg-white/20 text-white px-2 py-0.5 rounded-full flex items-center gap-0.5">
          <Pin className="h-2.5 w-2.5" /> PROMOVIDO
        </span>
      </div>

      {/* Imagem */}
      {item.listing_image ? (
        <img src={item.listing_image} alt={item.listing_title} className="w-full h-32 object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      ) : (
        <div className={cn("w-full h-24 flex items-center justify-center", cfg.bg)}>
          <Icon className={cn("h-10 w-10 opacity-20", cfg.text)} />
        </div>
      )}

      {/* Preço + CTA */}
      <div className="px-3 py-2 flex-1">
        {item.listing_price && item.listing_price > 0 && (
          <p className="text-green-600 font-bold text-sm">{formatCurrency(item.listing_price)}</p>
        )}
        <div className="flex items-center gap-1 mt-1">
          <ChevronRight className="h-3 w-3 text-primary shrink-0" />
          <span className="text-[11px] text-primary font-semibold">Ver anúncio completo</span>
        </div>
        {/* Detalhes do pacote */}
        {item.pkg && (
          <div className="mt-2 grid grid-cols-2 gap-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Repeat2 className="h-2.5 w-2.5" />
              <span>{item.pkg.interval_minutes}min/post</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Star className={cn("h-2.5 w-2.5", item.pkg.priority >= 3 ? "text-amber-500 fill-amber-500" : "")} />
              <span>Prioridade {item.pkg.priority}</span>
            </div>
          </div>
        )}
      </div>

      {/* Alertas */}
      {(nearLimit || expiringSoon) && (
        <div className={cn(
          "mx-2 mb-1 px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1",
          nearLimit ? "bg-orange-50 text-orange-700" : "bg-red-50 text-red-700"
        )}>
          <AlertCircle className="h-3 w-3 shrink-0" />
          {nearLimit
            ? `Apenas ${remaining} publicação${remaining > 1 ? "ões" : ""} restante${remaining > 1 ? "s" : ""}`
            : `Expira em ${expiresIn} dia${expiresIn !== 1 ? "s" : ""}`}
        </div>
      )}

      {/* Footer da fila */}
      <div className="border-t px-3 py-2 bg-muted/30 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Layers className="h-3 w-3" />
          <span>#{queuePos}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Repeat2 className="h-3 w-3" />
          <span className={cn("font-medium", remaining <= 2 ? "text-orange-600" : "text-foreground")}>
            {remaining} restante{remaining !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span className="font-medium text-foreground">{timeStr}</span>
        </div>
      </div>
    </div>
  );
}

// SmartCard para posting_lot
function SmartCardLot({
  lot, queuePos, estimatedTime,
}: { lot: PostingLot; queuePos: number; estimatedTime: Date }) {
  const timeStr = format(estimatedTime, "HH:mm", { locale: ptBR });
  const minsLeft = differenceInMinutes(estimatedTime, new Date());

  return (
    <div className="rounded-2xl overflow-hidden border border-border shadow-md bg-white flex flex-col">
      <div className="bg-gradient-to-r from-gray-700 to-gray-500 p-3 flex items-center gap-2">
        <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
          {lot.store_logo_url ? (
            <img src={lot.store_logo_url} className="h-6 w-6 rounded-full object-cover" alt="" />
          ) : (
            <ShoppingBag className="h-4 w-4 text-white" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-[13px] truncate">{lot.store_name || "Loja"}</p>
          <div className="flex items-center gap-1">
            <MapPin className="h-2.5 w-2.5 text-white/70" />
            <p className="text-white/80 text-[10px]">{lot.target_city || "Brasil"}</p>
          </div>
        </div>
        <Badge className="bg-white/20 text-white hover:bg-white/20 border-0 text-[10px]">
          {lot.items_count || lot.items.length} prod.
        </Badge>
      </div>

      <div className="divide-y divide-border/60">
        {lot.items.slice(0, 3).map((item) => (
          <div key={item.id} className="flex items-center gap-2 px-3 py-2">
            {item.product_image_url ? (
              <img src={item.product_image_url} className="h-10 w-10 rounded-lg object-cover shrink-0" alt={item.product_name} />
            ) : (
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Package className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium truncate">{item.product_name}</p>
              {item.product_price && item.product_price > 0 && (
                <p className="text-[11px] text-green-600 font-semibold">{formatCurrency(item.product_price)}</p>
              )}
            </div>
          </div>
        ))}
        {lot.items.length === 0 && (
          <div className="px-3 py-3 text-[11px] text-muted-foreground text-center">
            Carregando produtos...
          </div>
        )}
      </div>

      <div className="border-t px-3 py-2 bg-muted/30 flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">#{queuePos}</span>
        <Badge variant="outline" className="text-[10px] py-0">{lot.status}</Badge>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span className="font-medium text-foreground">{timeStr}</span>
          {minsLeft > 0 && <span>(~{minsLeft}m)</span>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Timeline entry type
// ─────────────────────────────────────────────────────────
interface TimelineEntry {
  id: string;
  estimatedTime: Date;
  isPromoted: boolean;
  type: "promoted" | "lot" | "campaign";
  title: string;
  category: string;
  city: string;
  queuePos: number;
  intervalMinutes?: number;
  remainingPublications?: number;
  expiresAt?: Date;
  priority?: number;
  packageName?: string;
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const cfg = catCfg(entry.category);
  const Icon = cfg.icon;
  const timeStr = format(entry.estimatedTime, "HH:mm", { locale: ptBR });
  const minsLeft = differenceInMinutes(entry.estimatedTime, new Date());
  const expiresIn = entry.expiresAt ? differenceInDays(entry.expiresAt, new Date()) : null;

  return (
    <div className={cn(
      "flex items-stretch gap-3 p-3 rounded-xl border transition-colors",
      minsLeft < 0 ? "opacity-50 bg-muted/20" : "bg-white",
      entry.isPromoted && minsLeft >= 0 && "border-amber-300 bg-amber-50/50"
    )}>
      {/* Hora */}
      <div className="w-14 shrink-0 text-center flex flex-col justify-center">
        <p className={cn("text-sm font-bold tabular-nums", minsLeft < 0 ? "text-muted-foreground" : "text-foreground")}>
          {timeStr}
        </p>
        {minsLeft > 0 && <p className="text-[10px] text-muted-foreground">~{minsLeft}m</p>}
      </div>

      {/* Linha + dot */}
      <div className="flex flex-col items-center w-4 shrink-0">
        <div className={cn(
          "h-3 w-3 rounded-full border-2 shrink-0 mt-2",
          entry.isPromoted ? "bg-amber-400 border-amber-600" : "bg-muted-foreground/30 border-muted-foreground"
        )} />
        <div className="flex-1 w-0.5 bg-border mt-1" />
      </div>

      {/* Conteúdo */}
      <div className={cn("flex-1 flex items-start gap-2 rounded-lg p-2", cfg.bg)}>
        <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", cfg.text)} />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold truncate">{entry.title}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            <span className={cn("text-[10px] font-medium", cfg.text)}>{cfg.label}</span>
            {entry.city && (
              <>
                <span className="text-muted-foreground text-[10px]">·</span>
                <MapPin className="h-2.5 w-2.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground truncate">{entry.city}</span>
              </>
            )}
            {entry.intervalMinutes && (
              <>
                <span className="text-muted-foreground text-[10px]">·</span>
                <Repeat2 className="h-2.5 w-2.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">a cada {entry.intervalMinutes}min</span>
              </>
            )}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          {entry.isPromoted && (
            <span className="text-[10px] font-bold bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <Pin className="h-2.5 w-2.5" /> PROMOVIDO
            </span>
          )}
          {entry.remainingPublications !== undefined && (
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full",
              entry.remainingPublications <= 2
                ? "bg-orange-100 text-orange-700"
                : "bg-muted text-muted-foreground"
            )}>
              {entry.remainingPublications} restante{entry.remainingPublications !== 1 ? "s" : ""}
            </span>
          )}
          {expiresIn !== null && expiresIn <= 7 && (
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full",
              expiresIn <= 2 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
            )}>
              exp. {expiresIn}d
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">#{entry.queuePos}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────
const TABS = [
  { key: "cards",    label: "SmartCards",      icon: Monitor },
  { key: "timeline", label: "Linha do Tempo",  icon: Clock },
  { key: "fila",     label: "Fila Simulada",   icon: Layers },
  { key: "intel",    label: "Inteligência",    icon: BrainCircuit },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// ─────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────
export default function AdminPostPreviewCenter() {
  const [tab, setTab] = useState<TabKey>("cards");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [timeWindow, setTimeWindow] = useState<"30" | "60" | "120" | "240" | "360">("120");
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = usePostPreviewData();

  // Realtime: promoted_listing_slots
  useEffect(() => {
    const ch = supabase
      .channel("preview-center-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "promoted_listing_slots" }, () => {
        queryClient.invalidateQueries({ queryKey: ["post-preview-center"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "promotion_purchases" }, () => {
        queryClient.invalidateQueries({ queryKey: ["post-preview-center"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "posting_lots" }, () => {
        queryClient.invalidateQueries({ queryKey: ["post-preview-center"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  const promoted = data?.promoted ?? [];
  const lots = data?.lots ?? [];
  const campaigns = data?.campaigns ?? [];
  const packages = data?.packages ?? [];

  const lastRefresh = dataUpdatedAt ? format(new Date(dataUpdatedAt), "HH:mm:ss") : "—";

  // ── Build unified queue with real intervals ──
  const queueEntries = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [];
    const now = new Date();
    let pos = 1;

    // Promoted items — sorted by priority desc, then created_at asc
    const sortedPromoted = [...promoted].sort((a, b) => {
      const pa = a.pkg?.priority ?? 1;
      const pb = b.pkg?.priority ?? 1;
      if (pb !== pa) return pb - pa;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    sortedPromoted.forEach((p) => {
      const interval = p.pkg?.interval_minutes ?? 60;
      entries.push({
        id: `p-${p.id}`,
        estimatedTime: addMinutes(now, pos * interval),
        isPromoted: true,
        type: "promoted",
        title: p.listing_title || "Sem título",
        category: p.listing_type || "outros",
        city: p.listing_city || "",
        queuePos: pos++,
        intervalMinutes: interval,
        remainingPublications: p.remaining_publications,
        expiresAt: p.expires_at,
        priority: p.pkg?.priority,
        packageName: p.pkg?.name,
      });
    });

    // Regular lots — 60 min each
    lots.forEach((l) => {
      entries.push({
        id: `l-${l.id}`,
        estimatedTime: addMinutes(now, pos * 60),
        isPromoted: false,
        type: "lot",
        title: l.store_name ? `${l.store_name} · ${l.items_count ?? l.items.length} produtos` : "Lote de Postagem",
        category: "produto",
        city: l.target_city || "",
        queuePos: pos++,
      });
    });

    // Campaigns — 60 min each
    campaigns.forEach((c) => {
      entries.push({
        id: `c-${c.id}`,
        estimatedTime: addMinutes(now, pos * 60),
        isPromoted: false,
        type: "campaign",
        title: c.title || "Campanha",
        category: "produto",
        city: c.target_city || "",
        queuePos: pos++,
      });
    });

    return entries;
  }, [promoted, lots, campaigns]);

  // Filtered promoted for SmartCards
  const filteredPromoted = useMemo(() => {
    return promoted.filter((p) => {
      if (catFilter !== "all" && p.listing_type !== catFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (p.listing_title ?? "").toLowerCase().includes(q) ||
          (p.listing_city ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [promoted, catFilter, search]);

  // Timeline filtered by time window
  const filteredTimeline = useMemo(() => {
    const windowMs = parseInt(timeWindow) * 60 * 1000;
    const cutoff = new Date(Date.now() + windowMs);
    return queueEntries.filter((e) => e.estimatedTime <= cutoff);
  }, [queueEntries, timeWindow]);

  const totalPromoted = promoted.length;
  const totalLots = lots.length;
  const totalCampaigns = campaigns.length;
  const totalQueue = totalPromoted + totalLots + totalCampaigns;
  const nextPost = queueEntries[0];
  const nextPostTime = nextPost ? format(nextPost.estimatedTime, "HH:mm") : "—";

  // Intelligence data
  const catBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    promoted.forEach((p) => { const k = p.listing_type || "outros"; counts[k] = (counts[k] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => ({ cat, count, cfg: catCfg(cat) }));
  }, [promoted]);

  const nearLimitItems = promoted.filter((p) => (p.remaining_publications ?? 99) <= 2);
  const expiringSoonItems = promoted.filter((p) => {
    if (!p.expires_at) return false;
    const d = differenceInDays(p.expires_at, new Date());
    return d >= 0 && d <= 3;
  });
  const expiredItems = promoted.filter((p) => p.expires_at && isPast(p.expires_at));
  const highPriorityItems = promoted.filter((p) => (p.pkg?.priority ?? 0) >= 3);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ── Header ── */}
      <div className="border-b bg-card px-6 py-4 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Monitor className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold">Central de Pré-Visualização</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Simula exatamente como cada SmartCard será publicado: categoria, hora, badge PROMOVIDO, intervalo e repetições restantes.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-muted-foreground hidden sm:block">Atualizado: {lastRefresh}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          {[
            { label: "Total na Fila", value: totalQueue, icon: Layers, color: "text-blue-600" },
            { label: "📌 Promovidos", value: totalPromoted, icon: Star, color: "text-amber-600" },
            { label: "Prioridade Alta", value: highPriorityItems.length, icon: Zap, color: "text-purple-600" },
            { label: "Próxima Postagem", value: nextPostTime, icon: Clock, color: "text-green-600" },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border bg-white p-3 flex items-center gap-3">
              <k.icon className={cn("h-5 w-5 shrink-0", k.color)} />
              <div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-lg font-bold">{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Alertas globais */}
        {(nearLimitItems.length > 0 || expiringSoonItems.length > 0) && (
          <div className="flex flex-wrap gap-2 mt-3">
            {nearLimitItems.length > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] bg-orange-50 border border-orange-200 text-orange-700 px-3 py-1.5 rounded-lg">
                <AlertCircle className="h-3.5 w-3.5" />
                <span><strong>{nearLimitItems.length}</strong> anúncio{nearLimitItems.length > 1 ? "s" : ""} quase no limite de publicações</span>
              </div>
            )}
            {expiringSoonItems.length > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded-lg">
                <Timer className="h-3.5 w-3.5" />
                <span><strong>{expiringSoonItems.length}</strong> promoção{expiringSoonItems.length > 1 ? "s" : ""} expira{expiringSoonItems.length > 1 ? "m" : ""} em até 3 dias</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="border-b bg-card px-6 shrink-0">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
                  tab === t.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}>
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Conteúdo ── */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span>Carregando dados da fila...</span>
          </div>
        ) : (
          <>
            {/* ══ SmartCards ══ */}
            {tab === "cards" && (
              <div className="p-6 space-y-5">
                {/* Filtros */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-48">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input placeholder="Buscar por título ou cidade..."
                      value={search} onChange={(e) => setSearch(e.target.value)}
                      className="pl-8 h-9 text-sm" />
                  </div>
                  <Select value={catFilter} onValueChange={setCatFilter}>
                    <SelectTrigger className="w-44 h-9 text-sm">
                      <Filter className="h-3.5 w-3.5 mr-1.5" />
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as categorias</SelectItem>
                      {Object.entries(CAT_CONFIG).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge variant="secondary" className="text-xs">
                    {filteredPromoted.length} promovido{filteredPromoted.length !== 1 ? "s" : ""}
                  </Badge>
                </div>

                {/* Promovidos */}
                {filteredPromoted.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Pin className="h-4 w-4 text-amber-500" />
                      <h2 className="text-sm font-semibold">Anúncios Promovidos (📌 PROMOVIDO)</h2>
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]">
                        {filteredPromoted.length}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filteredPromoted.map((item, idx) => {
                        const entry = queueEntries.find((e) => e.id === `p-${item.id}`);
                        return (
                          <SmartCard
                            key={item.id}
                            item={item}
                            queuePos={entry?.queuePos ?? idx + 1}
                            estimatedTime={entry?.estimatedTime ?? addMinutes(new Date(), (idx + 1) * 60)}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Lotes */}
                {lots.length > 0 && catFilter === "all" && !search && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Package className="h-4 w-4 text-gray-500" />
                      <h2 className="text-sm font-semibold">Lotes Aguardando Postagem</h2>
                      <Badge variant="secondary" className="text-[10px]">{lots.length}</Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {lots.map((lot, idx) => {
                        const entry = queueEntries.find((e) => e.id === `l-${lot.id}`);
                        return (
                          <SmartCardLot
                            key={lot.id}
                            lot={lot}
                            queuePos={entry?.queuePos ?? totalPromoted + idx + 1}
                            estimatedTime={entry?.estimatedTime ?? addMinutes(new Date(), (totalPromoted + idx + 1) * 60)}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {filteredPromoted.length === 0 && lots.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                    <Monitor className="h-10 w-10 opacity-20" />
                    <p className="text-sm">Nenhum anúncio na fila de divulgação no momento.</p>
                  </div>
                )}
              </div>
            )}

            {/* ══ Linha do Tempo ══ */}
            {tab === "timeline" && (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">Simulação Cronológica</h2>
                    <p className="text-xs text-muted-foreground">
                      Calculada com os parâmetros reais de cada pacote (interval_minutes, prioridade).
                      Promovidos têm prioridade.
                    </p>
                  </div>
                  <Select value={timeWindow} onValueChange={(v) => setTimeWindow(v as any)} >
                    <SelectTrigger className="w-32 h-8 text-xs ml-auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 minutos</SelectItem>
                      <SelectItem value="60">1 hora</SelectItem>
                      <SelectItem value="120">2 horas</SelectItem>
                      <SelectItem value="240">4 horas</SelectItem>
                      <SelectItem value="360">6 horas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-amber-400 border-2 border-amber-600" />
                    <span>📌 PROMOVIDO</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-muted-foreground/30 border-2 border-muted-foreground" />
                    <span>Postagem normal</span>
                  </div>
                </div>

                {filteredTimeline.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                    <Clock className="h-10 w-10 opacity-20" />
                    <p className="text-sm">Nenhuma postagem prevista nesta janela de tempo.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-w-2xl">
                    {filteredTimeline.map((entry) => (
                      <TimelineRow key={entry.id} entry={entry} />
                    ))}
                    {queueEntries.length > filteredTimeline.length && (
                      <div className="flex items-center gap-2 py-3 px-4 text-[12px] text-muted-foreground border rounded-xl bg-muted/30">
                        <ArrowRight className="h-4 w-4" />
                        <span>
                          +{queueEntries.length - filteredTimeline.length} postagens além desta janela.
                          Amplie o período para visualizar.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ══ Fila Simulada ══ */}
            {tab === "fila" && (
              <div className="p-6 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold">Fila Completa de Divulgação</h2>
                  <p className="text-xs text-muted-foreground">
                    Posição · tipo · intervalo do pacote · publicações restantes · expiração
                  </p>
                </div>

                {queueEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                    <Layers className="h-10 w-10 opacity-20" />
                    <p className="text-sm">Fila vazia.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground w-10">#</th>
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground">Anúncio</th>
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground w-24">Categoria</th>
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground w-20">Tipo</th>
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground w-20">Intervalo</th>
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground w-24">Restantes</th>
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground w-20">Hora Est.</th>
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground w-20">Expiração</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {queueEntries.map((entry) => {
                            const cfg = catCfg(entry.category);
                            const Icon = cfg.icon;
                            const minsLeft = differenceInMinutes(entry.estimatedTime, new Date());
                            const expiresIn = entry.expiresAt
                              ? differenceInDays(entry.expiresAt, new Date())
                              : null;
                            return (
                              <tr key={entry.id}
                                className={cn(
                                  "hover:bg-muted/20 transition-colors",
                                  entry.isPromoted && "bg-amber-50/60"
                                )}>
                                <td className="px-4 py-2.5 text-muted-foreground font-mono text-[12px]">{entry.queuePos}</td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <Icon className={cn("h-3.5 w-3.5 shrink-0", cfg.text)} />
                                    <span className="font-medium text-[12px] truncate max-w-44">{entry.title}</span>
                                    {entry.isPromoted && (
                                      <span className="shrink-0 text-[10px] font-bold bg-amber-400/30 text-amber-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                        <Pin className="h-2.5 w-2.5" /> PROM.
                                      </span>
                                    )}
                                  </div>
                                  {entry.city && (
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <MapPin className="h-2.5 w-2.5 text-muted-foreground" />
                                      <span className="text-[10px] text-muted-foreground">{entry.city}</span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className={cn("text-[11px] font-medium", cfg.text)}>{cfg.label}</span>
                                </td>
                                <td className="px-4 py-2.5">
                                  {entry.isPromoted ? (
                                    <div className="flex items-center gap-1">
                                      <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                                      <span className="text-[11px] text-amber-700 font-semibold">
                                        P{entry.priority ?? 1}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-muted-foreground">Gratuita</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  {entry.intervalMinutes ? (
                                    <span className="text-[11px] font-mono text-foreground">{entry.intervalMinutes}min</span>
                                  ) : (
                                    <span className="text-[11px] text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  {entry.remainingPublications !== undefined ? (
                                    <span className={cn(
                                      "text-[11px] font-semibold",
                                      entry.remainingPublications <= 2 ? "text-orange-600" : "text-foreground"
                                    )}>
                                      {entry.remainingPublications}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className="text-[12px] font-mono font-medium">
                                    {format(entry.estimatedTime, "HH:mm")}
                                  </span>
                                  {minsLeft > 0 && (
                                    <p className="text-[10px] text-muted-foreground">~{minsLeft}m</p>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  {expiresIn !== null ? (
                                    <span className={cn(
                                      "text-[11px]",
                                      expiresIn <= 2 ? "text-red-600 font-semibold" :
                                        expiresIn <= 7 ? "text-amber-600 font-semibold" :
                                          "text-muted-foreground"
                                    )}>
                                      {expiresIn <= 0 ? "Expirado" : `${expiresIn}d`}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-muted-foreground">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══ Inteligência ══ */}
            {tab === "intel" && (
              <div className="p-6 space-y-5">
                <div>
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4 text-primary" />
                    Inteligência Comercial da Fila
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Análise automática baseada nos parâmetros reais de cada promoção e campanha.
                  </p>
                </div>

                {/* Resumo */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Promovidos Ativos", value: totalPromoted, icon: Pin, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
                    { label: "Perto do Limite", value: nearLimitItems.length, icon: AlertCircle, color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
                    { label: "Expiram em 3d", value: expiringSoonItems.length, icon: Timer, color: "text-red-600", bg: "bg-red-50 border-red-200" },
                    { label: "Alta Prioridade", value: highPriorityItems.length, icon: Zap, color: "text-purple-600", bg: "bg-purple-50 border-purple-200" },
                  ].map((k) => (
                    <div key={k.label} className={cn("rounded-xl border p-4", k.bg)}>
                      <div className="flex items-center gap-2 mb-1">
                        <k.icon className={cn("h-4 w-4 shrink-0", k.color)} />
                        <span className="text-xs font-semibold text-foreground">{k.label}</span>
                      </div>
                      <p className={cn("text-2xl font-bold", k.color)}>{k.value}</p>
                    </div>
                  ))}
                </div>

                {/* Distribuição por categoria */}
                {catBreakdown.length > 0 && (
                  <div className="rounded-xl border bg-white p-4">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <BarChart2 className="h-4 w-4 text-muted-foreground" />
                      Distribuição por Categoria
                    </h3>
                    <div className="space-y-2.5">
                      {catBreakdown.map(({ cat, count, cfg }) => {
                        const Icon = cfg.icon;
                        const pct = totalPromoted > 0 ? (count / totalPromoted) * 100 : 0;
                        return (
                          <div key={cat} className="flex items-center gap-3">
                            <Icon className={cn("h-4 w-4 shrink-0", cfg.text)} />
                            <span className="text-[12px] font-medium w-24 shrink-0">{cfg.label}</span>
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div className={cn("h-full rounded-full bg-gradient-to-r", cfg.gradient)}
                                style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[11px] text-muted-foreground w-14 text-right shrink-0">
                              {count} ({Math.round(pct)}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Pacotes ativos */}
                {packages.length > 0 && (
                  <div className="rounded-xl border bg-white p-4">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      Pacotes de Promoção Configurados
                    </h3>
                    <div className="space-y-2">
                      {packages.map((pkg) => (
                        <div key={pkg.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 border">
                          <div className="flex-1">
                            <p className="text-[13px] font-semibold">{pkg.name}</p>
                            <div className="flex flex-wrap gap-3 mt-1">
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Repeat2 className="h-2.5 w-2.5" /> {pkg.interval_minutes}min/post
                              </span>
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <BarChart2 className="h-2.5 w-2.5" /> {pkg.max_publications} publicações
                              </span>
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <CalendarClock className="h-2.5 w-2.5" /> {pkg.duration_days} dias
                              </span>
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Star className="h-2.5 w-2.5" /> Prioridade {pkg.priority}
                              </span>
                            </div>
                          </div>
                          {pkg.price_brl && (
                            <p className="text-sm font-bold text-green-600 shrink-0">
                              {formatCurrency(pkg.price_brl)}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Insights */}
                <div className="rounded-xl border bg-white p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4 text-primary" />
                    Insights Automáticos
                  </h3>
                  <div className="space-y-2">
                    {totalPromoted === 0 && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
                        <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                        <p className="text-[12px] text-blue-800">
                          Nenhum anúncio promovido ativo. A fila opera somente com postagens gratuitas.
                        </p>
                      </div>
                    )}
                    {nearLimitItems.length > 0 && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-50 border border-orange-200">
                        <AlertCircle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                        <p className="text-[12px] text-orange-800">
                          <strong>{nearLimitItems.length}</strong> anúncio{nearLimitItems.length > 1 ? "s" : ""} com 2 ou menos publicações restantes.
                          {" "}Considere contatar os anunciantes para renovação.
                        </p>
                      </div>
                    )}
                    {expiringSoonItems.length > 0 && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                        <Timer className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                        <p className="text-[12px] text-red-800">
                          <strong>{expiringSoonItems.length}</strong> promoção{expiringSoonItems.length > 1 ? "ões" : ""} expira{expiringSoonItems.length > 1 ? "m" : ""} em até 3 dias.
                          {" "}Oportunidade de renovação de receita.
                        </p>
                      </div>
                    )}
                    {expiredItems.length > 0 && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
                        <CheckCircle2 className="h-4 w-4 text-gray-600 shrink-0 mt-0.5" />
                        <p className="text-[12px] text-gray-800">
                          <strong>{expiredItems.length}</strong> slot{expiredItems.length > 1 ? "s" : ""} expirado{expiredItems.length > 1 ? "s" : ""} ainda presente{expiredItems.length > 1 ? "s" : ""} na tabela.
                          {" "}Podem ser removidos após limpeza automática.
                        </p>
                      </div>
                    )}
                    {highPriorityItems.length > 0 && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-purple-50 border border-purple-200">
                        <Zap className="h-4 w-4 text-purple-600 shrink-0 mt-0.5" />
                        <p className="text-[12px] text-purple-800">
                          <strong>{highPriorityItems.length}</strong> anúncio{highPriorityItems.length > 1 ? "s" : ""} com prioridade alta (≥3).
                          {" "}Eles serão publicados com maior frequência que os demais.
                        </p>
                      </div>
                    )}
                    {catBreakdown[0] && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                        <TrendingUp className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-[12px] text-amber-800">
                          Categoria mais ativa: <strong>{catBreakdown[0].cfg.label}</strong> com{" "}
                          {catBreakdown[0].count} anúncio{catBreakdown[0].count > 1 ? "s" : ""} promovido{catBreakdown[0].count > 1 ? "s" : ""} em fila.
                        </p>
                      </div>
                    )}
                    {totalQueue > 20 && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
                        <Layers className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                        <p className="text-[12px] text-blue-800">
                          Fila com <strong>{totalQueue}</strong> itens. Tempo estimado para esvaziar:{" "}
                          <strong>~{Math.round((totalQueue * 60) / 60)}h</strong>.
                        </p>
                      </div>
                    )}
                    {campaigns.length > 0 && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
                        <Package className="h-4 w-4 text-gray-600 shrink-0 mt-0.5" />
                        <p className="text-[12px] text-gray-800">
                          {campaigns.length} campanha{campaigns.length > 1 ? "s" : ""} aguardando aprovação ou processamento na fila de divulgação.
                        </p>
                      </div>
                    )}
                    {totalQueue === 0 && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                        <p className="text-[12px] text-green-800">
                          Fila completamente vazia. Nenhuma postagem pendente no momento.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
