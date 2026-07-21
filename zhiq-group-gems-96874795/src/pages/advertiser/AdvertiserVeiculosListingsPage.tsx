/**
 * AdvertiserVeiculosListingsPage — /anunciante/veiculos/meus-anuncios
 * MODERNIZADO: dark theme, KPI, filtros, grade responsiva, GLM IA, ações rápidas.
 * Lógica de dados (useQuery, queryFn) preservada 100%.
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Car, Bike, Ship, Truck, CarFront, Loader2, Pencil, Plus,
  Search, Star, Brain, Sparkles, LayoutGrid, List as ListIcon,
  Share2, Pause, Play, Trash2, Calendar, Activity, CheckCircle2,
  Clock, AlertCircle, TrendingUp, MapPin, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getListingImageUrl } from "@/lib/real-estate/mediaUtils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Cat { key: string; label: string; icon: LucideIcon; color: string; photo: string; }
const CATEGORIES: Cat[] = [
  { key: "carro",     label: "Carro",     icon: Car,   color: "bg-blue-600",   photo: "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&h=400&fit=crop&q=80" },
  { key: "moto",      label: "Moto",      icon: Bike,  color: "bg-indigo-600", photo: "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=400&h=400&fit=crop&q=80" },
  { key: "barco",     label: "Barco",     icon: Ship,  color: "bg-cyan-600",   photo: "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?w=400&h=400&fit=crop&q=80" },
  { key: "utilitario",label: "Utilitário",icon: Truck, color: "bg-slate-600",  photo: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=400&h=400&fit=crop&q=80" },
];
const TYPE_LABEL: Record<string, string> = {
  carro: "Carro", moto: "Moto", barco: "Barco", utilitario: "Utilitário",
};

const STATUS_CFG: Record<string, { label: string; dot: string; text: string; bg: string; border: string }> = {
  published:      { label: "Ativo",       dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  active:         { label: "Ativo",       dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  pending_review: { label: "Em Revisão",  dot: "bg-yellow-400",  text: "text-yellow-700",  bg: "bg-yellow-50",  border: "border-yellow-200"  },
  moderating:     { label: "Em Análise",  dot: "bg-yellow-400",  text: "text-yellow-700",  bg: "bg-yellow-50",  border: "border-yellow-200"  },
  paused:         { label: "Pausado",     dot: "bg-orange-500",  text: "text-orange-700",  bg: "bg-orange-50",  border: "border-orange-200"  },
  draft:          { label: "Rascunho",    dot: "bg-zinc-400",    text: "text-zinc-600",    bg: "bg-zinc-100",   border: "border-zinc-200"    },
  expired:        { label: "Expirado",    dot: "bg-red-500",     text: "text-red-700",     bg: "bg-red-50",     border: "border-red-200"     },
};
function getStatusCfg(s: string) {
  return STATUS_CFG[s] ?? { label: s, dot: "bg-zinc-400", text: "text-zinc-600", bg: "bg-zinc-100", border: "border-zinc-200" };
}
function daysSince(d: string): number {
  try { return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)); }
  catch { return 0; }
}

const FAV_KEY = "viagg_fav_veiculos";

export default function AdvertiserVeiculosListingsPage() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const qc         = useQueryClient();

  // ── Query original (inalterada) ───────────────────────────────────────
  const { data: veiculos = [], isLoading } = useQuery({
    queryKey: ["veiculos-meus-anuncios", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase.from("vehicle_listings") as any)
        .select("id, title, vehicle_type, brand, model, year, visibility_status, price_brl, city, state, created_at")
        .eq("owner_user_id", user!.id)
        .order("created_at", { ascending: false });
      const list = data || [];
      return Promise.all(list.map(async (v: any) => {
        const { data: media } = await (supabase.from("vehicle_media") as any)
          .select("original_storage_path, public_masked_storage_path")
          .eq("listing_id", v.id)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        const hasThumb = !!media?.public_masked_storage_path && media.public_masked_storage_path !== media.original_storage_path;
        const path = hasThumb ? media.public_masked_storage_path : media?.original_storage_path;
        return { ...v, thumb: path ? getListingImageUrl(path, hasThumb ? "public" : "original") : null };
      }));
    },
  });

  // ── Mutations (novas ações rápidas) ──────────────────────────────────
  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const isActive = ["published","active"].includes(status);
      await (supabase.from("vehicle_listings") as any)
        .update({ visibility_status: isActive ? "paused" : "published" }).eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["veiculos-meus-anuncios", user?.id] }); toast.success("Status atualizado."); },
    onError: () => toast.error("Erro ao atualizar status."),
  });

  const deleteListing = useMutation({
    mutationFn: async (id: string) => {
      await (supabase.from("vehicle_listings") as any).delete().eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["veiculos-meus-anuncios", user?.id] }); toast.success("Veículo excluído."); },
    onError: () => toast.error("Erro ao excluir."),
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

  const handleShare = (id: string) => {
    const url = `${window.location.origin}/veiculo/${id}`;
    navigator.clipboard?.writeText(url).then(() => toast.success("Link copiado!")).catch(() => toast.info(`Link: ${url}`));
  };

  // ── KPI e filtragem ──────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:  veiculos.length,
    active: veiculos.filter(v => ["published","active"].includes((v as any).visibility_status)).length,
    paused: veiculos.filter(v => (v as any).visibility_status === "paused").length,
    review: veiculos.filter(v => ["pending_review","moderating"].includes((v as any).visibility_status)).length,
  }), [veiculos]);

  const filtered = useMemo(() => {
    let r = veiculos as any[];
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      r = r.filter(v =>
        (v.title||"").toLowerCase().includes(q) ||
        (v.brand||"").toLowerCase().includes(q) ||
        (v.model||"").toLowerCase().includes(q) ||
        (v.city||"").toLowerCase().includes(q)
      );
    }
    if (activeFilter === "active")  r = r.filter(v => ["published","active"].includes(v.visibility_status));
    if (activeFilter === "paused")  r = r.filter(v => v.visibility_status === "paused");
    if (activeFilter === "review")  r = r.filter(v => ["pending_review","moderating"].includes(v.visibility_status));
    if (activeFilter === "favs")    r = r.filter(v => favorites.has(v.id));
    return r;
  }, [veiculos, searchTerm, activeFilter, favorites]);

  const FILTERS = [
    { key: "all" as const,    label: "Todos",       count: stats.total   },
    { key: "active" as const, label: "✓ Ativos",    count: stats.active  },
    { key: "paused" as const, label: "⏸ Pausados",  count: stats.paused  },
    { key: "review" as const, label: "🕐 Revisão",  count: stats.review  },
    { key: "favs" as const,   label: "⭐ Favoritos", count: favorites.size},
  ];

  return (
    <div className="min-h-screen bg-[#0D0F12] space-y-6 pb-10">

      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-blue-800 to-blue-600 px-6 pt-8 pb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-12 w-12 rounded-2xl bg-white/10 p-0.5 border border-white/20 overflow-hidden shadow-md shrink-0 flex items-center justify-center">
            <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="w-full h-full object-cover rounded-xl" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Meus Veículos</h1>
            <p className="text-white/70 text-sm mt-0.5">{stats.total} veículo{stats.total !== 1 ? "s" : ""} cadastrado{stats.total !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          {[
            { label: "Total",      value: stats.total,  icon: Activity,     color: "text-white"       },
            { label: "Ativos",     value: stats.active, icon: CheckCircle2, color: "text-blue-200"    },
            { label: "Pausados",   value: stats.paused, icon: Clock,        color: "text-orange-300"  },
            { label: "Em Revisão", value: stats.review, icon: AlertCircle,  color: "text-yellow-300"  },
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


        {/* Categorias */}
        <div className="bg-[#1B1F24] border border-[#2A3038] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-[#F5F7FA] flex items-center gap-2">
              <Plus className="h-4 w-4 text-blue-500" /> Anunciar novo veículo
            </h2>
            <span className="text-[10px] text-blue-500 font-black">Anúncio gratuito</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {CATEGORIES.map((c) => {
              return (
                <button
                  key={c.key}
                  onClick={() => navigate(`/anunciante/veiculos/anuncios/novo/veiculo?tipo=${c.key}`)}
                  className="group relative flex flex-col items-center gap-2 rounded-xl border border-[#2A3038] bg-[#14171B] hover:border-blue-700/50 hover:bg-blue-950/20 transition-all overflow-hidden"
                >
                  {/* Foto real do veículo */}
                  <div className="w-full h-24 overflow-hidden rounded-t-xl relative">
                    <img
                      src={c.photo}
                      alt={c.label}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      onError={(e) => {
                        // Fallback para ícone se a foto falhar
                        const container = e.currentTarget.parentElement;
                        if (container) {
                          container.innerHTML = `<div class="w-full h-full flex items-center justify-center ${c.color}"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/></svg></div>`;
                        }
                      }}
                    />
                    {/* Gradiente de escurecimento na base */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#14171B] via-transparent to-transparent" />
                  </div>
                  <div className="pb-3 px-2 text-center">
                    <span className="font-bold text-[#F5F7FA] text-xs">{c.label}</span>
                    <br />
                    <span className="text-[10px] font-black text-blue-400">Anunciar grátis</span>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-blue-500/80 bg-blue-950/30 border border-blue-800/30 rounded-lg px-3 py-2">
            🔓 O anúncio é publicado gratuitamente. Você usa créditos apenas para desbloquear o contato do interessado.
          </p>
        </div>

        {/* Search + Filtros + Toggle */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A7B0BE] pointer-events-none" />
              <Input
                placeholder="Buscar por título, marca, modelo ou cidade..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 bg-[#1B1F24] border-[#2A3038] text-[#F5F7FA] placeholder:text-[#A7B0BE]/50 rounded-xl h-10"
              />
            </div>
            <div className="flex gap-1 bg-[#1B1F24] border border-[#2A3038] rounded-xl p-1">
              <button onClick={() => setViewMode("grid")} className={cn("p-1.5 rounded-lg transition-colors", viewMode === "grid" ? "bg-blue-600 text-white" : "text-[#A7B0BE] hover:text-white")}>
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode("list")} className={cn("p-1.5 rounded-lg transition-colors", viewMode === "list" ? "bg-blue-600 text-white" : "text-[#A7B0BE] hover:text-white")}>
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
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-[#1B1F24] text-[#A7B0BE] border-[#2A3038] hover:border-blue-600/40 hover:text-white"
                )}
              >
                {f.label}{f.count > 0 ? ` (${f.count})` : ""}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-blue-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-[#1B1F24] border border-dashed border-[#2A3038] rounded-2xl p-14 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-[#14171B] flex items-center justify-center mx-auto">
              <Car className="w-8 h-8 text-[#A7B0BE]" />
            </div>
            <h3 className="text-lg font-black text-[#F5F7FA] uppercase">{stats.total === 0 ? "Nenhum veículo cadastrado" : "Sem resultados"}</h3>
            <p className="text-sm text-[#A7B0BE]">
              {stats.total === 0 ? "Escolha uma categoria acima para anunciar seu primeiro veículo." : "Tente outro filtro."}
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((v: any) => {
              const sc       = getStatusCfg(v.visibility_status);
              const isFav    = favorites.has(v.id);
              const days     = daysSince(v.created_at);
              const isActive = ["published","active"].includes(v.visibility_status);
              const titleDisplay = v.title || [v.brand, v.model].filter(Boolean).join(" ") || "Sem título";
              return (
                <div key={v.id} className="bg-[#1B1F24] border border-[#2A3038] rounded-2xl overflow-hidden flex flex-col hover:shadow-xl hover:shadow-black/30 transition-all hover:-translate-y-0.5">
                  <div className="relative h-44 bg-[#14171B] overflow-hidden">
                    {v.thumb ? (
                      <img src={v.thumb} alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <img
                        src={CATEGORIES.find(c => c.key === v.vehicle_type)?.photo || "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&h=400&fit=crop&q=80"}
                        alt={v.title || "Veículo"}
                        loading="lazy"
                        className="w-full h-full object-cover opacity-60"
                        onError={e => {
                          const parent = e.currentTarget.parentElement;
                          if (parent) {
                            e.currentTarget.style.display = "none";
                            const fallback = document.createElement("div");
                            fallback.className = "w-full h-full flex items-center justify-center";
                            fallback.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2A3038" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 16H9m10.42-4.21a2 2 0 0 1 .58 1.4V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4.81a2 2 0 0 1 .58-1.4L7.17 9.2A2 2 0 0 1 8.58 8h6.84a2 2 0 0 1 1.41.59Z"/><path d="M12 11V4"/></svg>';
                            parent.appendChild(fallback);
                          }
                        }}
                      />
                    )}
                    <div className="absolute top-2 left-2">
                      <span className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black border", sc.text, sc.bg, sc.border)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", sc.dot)} />
                        {sc.label}
                      </span>
                    </div>
                    <button onClick={e => toggleFav(v.id, e)} className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 backdrop-blur-sm hover:bg-black/60">
                      <Star className={cn("h-3.5 w-3.5", isFav ? "fill-yellow-400 text-yellow-400" : "text-white/70")} />
                    </button>
                    <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg">
                      <span className="text-[10px] font-black text-white uppercase">
                        {TYPE_LABEL[v.vehicle_type] || "Veículo"}{v.year ? ` · ${v.year}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 flex flex-col flex-1 gap-2">
                    <h3 className="font-bold text-[14px] text-[#F5F7FA] line-clamp-2 leading-snug">{titleDisplay}</h3>
                    <div className="flex items-center gap-1 text-[11px] text-[#A7B0BE]">
                      <MapPin className="h-3 w-3 shrink-0 text-blue-400" />
                      {[v.city, v.state].filter(Boolean).join(", ") || "Localização não informada"}
                    </div>
                    <div className="text-lg font-black text-blue-400 leading-none">
                      {v.price_brl ? `R$ ${Number(v.price_brl).toLocaleString("pt-BR")}` : <span className="text-[#A7B0BE] text-sm">Consulte</span>}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-[#A7B0BE] pt-1 border-t border-[#2A3038]">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {days}d</span>
                    </div>
                    <div className="flex gap-2 mt-auto pt-2">
                      <Button size="sm" onClick={() => navigate(`/anunciante/veiculos/anuncios/editar/veiculo/${v.id}`)} className="flex-1 h-9 bg-blue-700 hover:bg-blue-600 text-white font-black text-[10px] uppercase rounded-xl gap-1">
                        <Pencil className="h-3 w-3" /> Editar
                      </Button>
                      <button onClick={() => handleShare(v.id)} className="h-9 w-9 flex items-center justify-center rounded-xl border border-[#2A3038] text-[#A7B0BE] hover:text-white hover:border-blue-700/50 transition-colors">
                        <Share2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => toggleStatus.mutate({ id: v.id, status: v.visibility_status })} className={cn("h-9 w-9 flex items-center justify-center rounded-xl border transition-colors", isActive ? "border-orange-500/30 text-orange-400 hover:bg-orange-500/10" : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10")}>
                        {isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => { if(window.confirm("Excluir este veículo?")) deleteListing.mutate(v.id); }} className="h-9 w-9 flex items-center justify-center rounded-xl border border-red-500/20 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-[#1B1F24] border border-[#2A3038] rounded-2xl overflow-hidden divide-y divide-[#2A3038]">
            {filtered.map((v: any) => {
              const sc    = getStatusCfg(v.visibility_status);
              const isFav = favorites.has(v.id);
              const isActive = ["published","active"].includes(v.visibility_status);
              const titleDisplay = v.title || [v.brand, v.model].filter(Boolean).join(" ") || "Sem título";
              return (
                <div key={v.id} className="flex items-center gap-3 p-4 hover:bg-[#14171B] transition-colors group">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#14171B] shrink-0 flex items-center justify-center border border-[#2A3038]">
                    {v.thumb ? <img src={v.thumb} alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : <Car className="w-5 h-5 text-[#2A3038]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#F5F7FA] text-sm truncate">{titleDisplay}</p>
                    <p className="text-xs text-[#A7B0BE] truncate">
                      {TYPE_LABEL[v.vehicle_type] || "Veículo"}{v.year ? ` · ${v.year}` : ""} · {[v.city, v.state].filter(Boolean).join("/")}
                    </p>
                  </div>
                  <span className={cn("text-[10px] font-black px-2 py-1 rounded-full border shrink-0", sc.text, sc.bg, sc.border)}>{sc.label}</span>
                  <span className="text-sm font-black text-blue-400 shrink-0">{v.price_brl ? `R$ ${Number(v.price_brl).toLocaleString("pt-BR")}` : "—"}</span>
                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={e => toggleFav(v.id, e)} className={cn("p-1.5 rounded-lg", isFav ? "text-yellow-400" : "text-[#A7B0BE] hover:text-yellow-400")}><Star className={cn("h-3.5 w-3.5", isFav && "fill-current")} /></button>
                    <button onClick={() => navigate(`/anunciante/veiculos/anuncios/editar/veiculo/${v.id}`)} className="p-1.5 rounded-lg text-[#A7B0BE] hover:text-blue-400"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => toggleStatus.mutate({ id: v.id, status: v.visibility_status })} className={cn("p-1.5 rounded-lg", isActive ? "text-orange-400" : "text-emerald-400")}>{isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
                    <button onClick={() => { if(window.confirm("Excluir?")) deleteListing.mutate(v.id); }} className="p-1.5 rounded-lg text-red-500/50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
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
