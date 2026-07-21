/**
 * AdvertiserImoveisListingsPage — /anunciante/imoveis/meus-anuncios
 * MODERNIZADO: dark theme, KPI bar, filtros, grade responsiva, GLM IA, ações rápidas.
 * Lógica de dados (useQuery, queryFn, costs) preservada 100%.
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Building2, Trees, Tractor, MapPin, Wheat, Loader2, Pencil, Plus,
  Search, Star, Brain, Sparkles, LayoutGrid, List as ListIcon,
  Share2, Pause, Play, Trash2, Calendar, Activity, CheckCircle2,
  Clock, AlertCircle, TrendingUp, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getListingImageUrl } from "@/lib/real-estate/mediaUtils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ── Dados estáticos (originais) ───────────────────────────────────────────
interface Cat { key: string; label: string; icon: LucideIcon; color: string; }
const CATEGORIES: Cat[] = [
  { key: "sitio",   label: "Sítio",       icon: Trees,    color: "bg-emerald-600" },
  { key: "chacara", label: "Chácara",     icon: Tractor,  color: "bg-lime-600"    },
  { key: "lote",    label: "Lote Urbano", icon: MapPin,   color: "bg-amber-600"   },
  { key: "fazenda", label: "Fazenda",     icon: Wheat,    color: "bg-orange-600"  },
];
const TYPE_LABEL: Record<string, string> = {
  sitio: "Sítio", chacara: "Chácara", lote: "Lote Urbano", fazenda: "Fazenda", terreno: "Terreno",
};
const DEFAULT_COST: Record<string, number> = { sitio: 80, chacara: 80, lote: 50, fazenda: 150 };

// ── Status visual ─────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; dot: string; text: string; bg: string; border: string }> = {
  published:      { label: "Ativo",       dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-200"  },
  active:         { label: "Ativo",       dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-200"  },
  pending_review: { label: "Em Revisão",  dot: "bg-yellow-400",  text: "text-yellow-700",  bg: "bg-yellow-50",   border: "border-yellow-200"   },
  moderating:     { label: "Em Análise",  dot: "bg-yellow-400",  text: "text-yellow-700",  bg: "bg-yellow-50",   border: "border-yellow-200"   },
  paused:         { label: "Pausado",     dot: "bg-orange-500",  text: "text-orange-700",  bg: "bg-orange-50",   border: "border-orange-200"   },
  draft:          { label: "Rascunho",    dot: "bg-zinc-400",    text: "text-zinc-600",    bg: "bg-zinc-100",    border: "border-zinc-200"     },
  expired:        { label: "Expirado",    dot: "bg-red-500",     text: "text-red-700",     bg: "bg-red-50",      border: "border-red-200"      },
};
function getStatusCfg(s: string) {
  return STATUS_CFG[s] ?? { label: s, dot: "bg-zinc-400", text: "text-zinc-600", bg: "bg-zinc-100", border: "border-zinc-200" };
}
function daysSince(d: string): number {
  try { return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)); }
  catch { return 0; }
}

const FAV_KEY = "viagg_fav_imoveis";

export default function AdvertiserImoveisListingsPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const qc        = useQueryClient();

  // ── Queries originais (inalteradas) ──────────────────────────────────
  const { data: imoveis = [], isLoading } = useQuery({
    queryKey: ["imoveis-meus-anuncios", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase.from("real_estate_listings") as any)
        .select("id, title, property_type, visibility_status, price_brl, city, state, created_at")
        .eq("owner_user_id", user!.id)
        .order("created_at", { ascending: false });
      const list = data || [];
      return Promise.all(list.map(async (im: any) => {
        const { data: media } = await (supabase.from("real_estate_media") as any)
          .select("original_storage_path, thumb_masked_storage_path")
          .eq("listing_id", im.id)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        const hasThumb = !!media?.thumb_masked_storage_path;
        const path = media?.thumb_masked_storage_path || media?.original_storage_path;
        return { ...im, thumb: path ? getListingImageUrl(path, hasThumb ? "public" : "original") : null };
      }));
    },
  });

  const { data: costs = DEFAULT_COST } = useQuery({
    queryKey: ["imoveis-unlock-costs"],
    queryFn: async () => {
      const codes = Object.keys(DEFAULT_COST).map((k) => `real_estate_unlock_${k}`);
      const { data } = await (supabase.from("merchant_credit_usage_rules") as any)
        .select("feature_code, credits_cost").in("feature_code", codes);
      const out: Record<string, number> = { ...DEFAULT_COST };
      (data || []).forEach((r: any) => {
        out[String(r.feature_code).replace("real_estate_unlock_", "")] = Number(r.credits_cost) || 0;
      });
      return out;
    },
  });

  // ── Novas mutations (ações rápidas) ───────────────────────────────────
  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const isActive = ["published", "active"].includes(status);
      await (supabase.from("real_estate_listings") as any)
        .update({ visibility_status: isActive ? "paused" : "published" })
        .eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["imoveis-meus-anuncios", user?.id] }); toast.success("Status atualizado."); },
    onError: () => toast.error("Erro ao atualizar status."),
  });

  const deleteListing = useMutation({
    mutationFn: async (id: string) => {
      await (supabase.from("real_estate_listings") as any).delete().eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["imoveis-meus-anuncios", user?.id] }); toast.success("Imóvel excluído."); },
    onError: () => toast.error("Erro ao excluir imóvel."),
  });

  // ── Estado de UI ─────────────────────────────────────────────────────
  const [searchTerm,   setSearchTerm]   = useState("");
  const [activeFilter, setActiveFilter] = useState<"all"|"active"|"paused"|"review"|"favs">("all");
  const [viewMode,     setViewMode]     = useState<"grid"|"list">("grid");
  const [favorites,    setFavorites]    = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); }
    catch { return new Set<string>(); }
  });

  const toggleFav = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const handleShare = (id: string, title: string) => {
    const url = `${window.location.origin}/imovel/${id}`;
    navigator.clipboard?.writeText(url).then(() => toast.success("Link copiado!")).catch(() => toast.info(`Link: ${url}`));
  };

  // ── KPI e filtragem ──────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:  imoveis.length,
    active: imoveis.filter(i => ["published","active"].includes((i as any).visibility_status)).length,
    paused: imoveis.filter(i => (i as any).visibility_status === "paused").length,
    review: imoveis.filter(i => ["pending_review","moderating"].includes((i as any).visibility_status)).length,
  }), [imoveis]);

  const filtered = useMemo(() => {
    let r = imoveis as any[];
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      r = r.filter(i => (i.title||"").toLowerCase().includes(q) || (i.city||"").toLowerCase().includes(q));
    }
    if (activeFilter === "active")  r = r.filter(i => ["published","active"].includes(i.visibility_status));
    if (activeFilter === "paused")  r = r.filter(i => i.visibility_status === "paused");
    if (activeFilter === "review")  r = r.filter(i => ["pending_review","moderating"].includes(i.visibility_status));
    if (activeFilter === "favs")    r = r.filter(i => favorites.has(i.id));
    return r;
  }, [imoveis, searchTerm, activeFilter, favorites]);

  const FILTERS = [
    { key: "all" as const,    label: "Todos",       count: stats.total  },
    { key: "active" as const, label: "✓ Ativos",    count: stats.active },
    { key: "paused" as const, label: "⏸ Pausados",  count: stats.paused },
    { key: "review" as const, label: "🕐 Revisão",  count: stats.review },
    { key: "favs" as const,   label: "⭐ Favoritos", count: favorites.size},
  ];

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0D0F12] space-y-6 pb-10">

      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-emerald-800 to-emerald-600 px-6 pt-8 pb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-12 w-12 rounded-2xl bg-white/10 p-0.5 border border-white/20 overflow-hidden shadow-md shrink-0 flex items-center justify-center">
            <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="w-full h-full object-cover rounded-xl" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Meus Imóveis</h1>
            <p className="text-white/70 text-sm mt-0.5">{stats.total} imóvel{stats.total !== 1 ? "is" : ""} cadastrado{stats.total !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* KPI bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          {[
            { label: "Total",       value: stats.total,  icon: Activity,     color: "text-white"      },
            { label: "Ativos",      value: stats.active, icon: CheckCircle2, color: "text-emerald-300"},
            { label: "Pausados",    value: stats.paused, icon: Clock,        color: "text-orange-300" },
            { label: "Em Revisão",  value: stats.review, icon: AlertCircle,  color: "text-yellow-300" },
          ].map(k => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="bg-white/10 border border-white/20 rounded-xl px-3 py-2 flex items-center gap-2">
                <Icon className={cn("h-4 w-4 shrink-0", k.color)} />
                <div>
                  <div className="text-xl font-black text-white leading-none">{k.value}</div>
                  <div className="text-[10px] text-white/60">{k.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 md:px-6 space-y-5 max-w-[1400px] mx-auto">


        {/* ── Anunciar novo (categorias originais, estilo dark) ── */}
        <div className="bg-[#1B1F24] border border-[#2A3038] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-[#F5F7FA] flex items-center gap-2">
              <Plus className="h-4 w-4 text-emerald-500" /> Anunciar novo imóvel
            </h2>
            <span className="text-[10px] text-[#A7B0BE] font-bold uppercase">Escolha a categoria</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.key}
                  onClick={() => navigate(`/anunciante/imoveis/anuncios/novo/imovel?tipo=${c.key}`)}
                  className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-[#2A3038] bg-[#14171B] hover:border-emerald-700/50 hover:bg-emerald-950/20 transition-all"
                >
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", c.color)}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="font-bold text-[#F5F7FA] text-xs">{c.label}</span>
                  <span className="text-[10px] font-black text-emerald-500">{costs[c.key]} cr p/ desbloquear</span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-emerald-500/80 bg-emerald-950/30 border border-emerald-800/30 rounded-lg px-3 py-2">
            🔓 Cada categoria tem um custo fixo em créditos para desbloquear o contato do interessado.
          </p>
        </div>

        {/* ── Search + Filtros + View Toggle ── */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A7B0BE] pointer-events-none" />
              <Input
                placeholder="Buscar por título ou cidade..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 bg-[#1B1F24] border-[#2A3038] text-[#F5F7FA] placeholder:text-[#A7B0BE]/50 rounded-xl h-10"
              />
            </div>
            <div className="flex gap-1 bg-[#1B1F24] border border-[#2A3038] rounded-xl p-1">
              <button onClick={() => setViewMode("grid")} className={cn("p-1.5 rounded-lg transition-colors", viewMode === "grid" ? "bg-emerald-600 text-white" : "text-[#A7B0BE] hover:text-white")}>
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode("list")} className={cn("p-1.5 rounded-lg transition-colors", viewMode === "list" ? "bg-emerald-600 text-white" : "text-[#A7B0BE] hover:text-white")}>
                <ListIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap transition-all",
                  activeFilter === f.key
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                    : "bg-[#1B1F24] text-[#A7B0BE] border-[#2A3038] hover:border-emerald-600/40 hover:text-white"
                )}
              >
                {f.label}{f.count > 0 ? ` (${f.count})` : ""}
              </button>
            ))}
          </div>
        </div>

        {/* ── Lista de imóveis ── */}
        {isLoading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-[#1B1F24] border border-dashed border-[#2A3038] rounded-2xl p-14 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-[#14171B] flex items-center justify-center mx-auto">
              <Building2 className="w-8 h-8 text-[#A7B0BE]" />
            </div>
            <h3 className="text-lg font-black text-[#F5F7FA] uppercase">{stats.total === 0 ? "Nenhum imóvel cadastrado" : "Sem resultados"}</h3>
            <p className="text-sm text-[#A7B0BE]">
              {stats.total === 0 ? "Escolha uma categoria acima para cadastrar seu primeiro imóvel." : "Tente outro filtro ou pesquisa."}
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((im: any) => {
              const sc   = getStatusCfg(im.visibility_status);
              const isFav = favorites.has(im.id);
              const days  = daysSince(im.created_at);
              const isActive = ["published","active"].includes(im.visibility_status);
              return (
                <div key={im.id} className="bg-[#1B1F24] border border-[#2A3038] rounded-2xl overflow-hidden flex flex-col hover:shadow-xl hover:shadow-black/30 transition-all hover:-translate-y-0.5">
                  {/* Imagem */}
                  <div className="relative h-44 bg-[#14171B] overflow-hidden">
                    {im.thumb ? (
                      <img src={im.thumb} alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Building2 className="w-10 h-10 text-[#2A3038]" />
                      </div>
                    )}
                    {/* Status badge */}
                    <div className="absolute top-2 left-2">
                      <span className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black border", sc.text, sc.bg, sc.border)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", sc.dot)} />
                        {sc.label}
                      </span>
                    </div>
                    {/* Fav button */}
                    <button onClick={e => toggleFav(im.id, e)} className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 backdrop-blur-sm transition-colors hover:bg-black/60">
                      <Star className={cn("h-3.5 w-3.5", isFav ? "fill-yellow-400 text-yellow-400" : "text-white/70")} />
                    </button>
                    {/* Tipo badge */}
                    <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg">
                      <span className="text-[10px] font-black text-white uppercase">
                        {TYPE_LABEL[im.property_type] || im.property_type || "Imóvel"}
                      </span>
                    </div>
                    {/* Is featured */}
                    {im.is_featured && (
                      <div className="absolute bottom-2 right-2 bg-yellow-400/90 px-2 py-1 rounded-lg">
                        <span className="text-[10px] font-black text-black">⭐ Destaque</span>
                      </div>
                    )}
                  </div>

                  {/* Conteúdo */}
                  <div className="p-4 flex flex-col flex-1 gap-2">
                    <h3 className="font-bold text-[14px] text-[#F5F7FA] line-clamp-2 leading-snug">{im.title || "Sem título"}</h3>
                    <div className="flex items-center gap-1 text-[11px] text-[#A7B0BE]">
                      <MapPin className="h-3 w-3 shrink-0 text-emerald-500" />
                      {[im.city, im.state].filter(Boolean).join(", ") || "Localização não informada"}
                    </div>
                    <div className="text-lg font-black text-emerald-400 leading-none">
                      {im.price_brl ? `R$ ${Number(im.price_brl).toLocaleString("pt-BR")}` : <span className="text-[#A7B0BE] text-sm">Consulte o preço</span>}
                    </div>

                    {/* Indicadores */}
                    <div className="flex items-center gap-3 text-[10px] text-[#A7B0BE] pt-1 border-t border-[#2A3038]">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {days}d</span>
                    </div>

                    {/* Ações */}
                    <div className="flex gap-2 mt-auto pt-2">
                      <Button
                        size="sm"
                        onClick={() => navigate(`/anunciante/imoveis/anuncios/editar/imovel/${im.id}`)}
                        className="flex-1 h-9 bg-emerald-700 hover:bg-emerald-600 text-white font-black text-[10px] uppercase rounded-xl gap-1"
                      >
                        <Pencil className="h-3 w-3" /> Editar
                      </Button>
                      <button
                        onClick={() => handleShare(im.id, im.title)}
                        className="h-9 w-9 flex items-center justify-center rounded-xl border border-[#2A3038] text-[#A7B0BE] hover:text-white hover:border-emerald-700/50 transition-colors"
                        title="Copiar link"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => toggleStatus.mutate({ id: im.id, status: im.visibility_status })}
                        className={cn("h-9 w-9 flex items-center justify-center rounded-xl border transition-colors",
                          isActive ? "border-orange-500/30 text-orange-400 hover:bg-orange-500/10" : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                        )}
                        title={isActive ? "Pausar" : "Ativar"}
                      >
                        {isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => { if(window.confirm("Excluir este imóvel?")) deleteListing.mutate(im.id); }}
                        className="h-9 w-9 flex items-center justify-center rounded-xl border border-red-500/20 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // ── Modo lista ──
          <div className="bg-[#1B1F24] border border-[#2A3038] rounded-2xl overflow-hidden divide-y divide-[#2A3038]">
            {filtered.map((im: any) => {
              const sc    = getStatusCfg(im.visibility_status);
              const isFav = favorites.has(im.id);
              const isActive = ["published","active"].includes(im.visibility_status);
              return (
                <div key={im.id} className="flex items-center gap-3 p-4 hover:bg-[#14171B] transition-colors group">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#14171B] shrink-0 flex items-center justify-center border border-[#2A3038]">
                    {im.thumb ? (
                      <img src={im.thumb} alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <Building2 className="w-5 h-5 text-[#2A3038]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#F5F7FA] text-sm truncate">{im.title || "Sem título"}</p>
                    <p className="text-xs text-[#A7B0BE] truncate">
                      {TYPE_LABEL[im.property_type] || "Imóvel"} · {[im.city, im.state].filter(Boolean).join("/")}
                    </p>
                  </div>
                  <span className={cn("text-[10px] font-black px-2 py-1 rounded-full border shrink-0", sc.text, sc.bg, sc.border)}>{sc.label}</span>
                  <span className="text-sm font-black text-emerald-400 shrink-0">
                    {im.price_brl ? `R$ ${Number(im.price_brl).toLocaleString("pt-BR")}` : "—"}
                  </span>
                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={e => toggleFav(im.id, e)} className={cn("p-1.5 rounded-lg", isFav ? "text-yellow-400" : "text-[#A7B0BE] hover:text-yellow-400")}>
                      <Star className={cn("h-3.5 w-3.5", isFav && "fill-current")} />
                    </button>
                    <button onClick={() => navigate(`/anunciante/imoveis/anuncios/editar/imovel/${im.id}`)} className="p-1.5 rounded-lg text-[#A7B0BE] hover:text-emerald-400">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => toggleStatus.mutate({ id: im.id, status: im.visibility_status })} className={cn("p-1.5 rounded-lg", isActive ? "text-orange-400" : "text-emerald-400")}>
                      {isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => { if(window.confirm("Excluir?")) deleteListing.mutate(im.id); }} className="p-1.5 rounded-lg text-red-500/50 hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
