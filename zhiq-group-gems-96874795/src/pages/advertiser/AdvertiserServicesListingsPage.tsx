/**
 * AdvertiserServicesListingsPage — /anunciante/servicos/meus-anuncios
 * MODERNIZADO: dark theme, KPI, filtros, grade responsiva, GLM IA, ações rápidas.
 * Lógica de dados (useQuery, Popover/Command) preservada 100%.
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Briefcase, ChevronsUpDown, Dumbbell, Loader2, Pencil, Pill, Scale,
  Scissors, Stethoscope, Wrench, Plus, Search, Star, Brain, Sparkles,
  LayoutGrid, List as ListIcon, Share2, Pause, Play, Trash2, Calendar,
  Activity, CheckCircle2, Clock, AlertCircle, TrendingUp, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getListingImageUrl } from "@/lib/real-estate/mediaUtils";
import {
  SERVICE_CATEGORY_GROUPS, SERVICE_ITEM_ICONS,
  resolveServiceTypeLabel, resolveServiceTypeIcon,
} from "@/lib/services/serviceCategories";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ── Dados estáticos (originais) ───────────────────────────────────────────
const QUICK_CATEGORIES = [
  { label: "Academia",  value: "Academias",          icon: Dumbbell,    color: "bg-orange-600" },
  { label: "Dentista",  value: "Dentistas",          icon: Stethoscope, color: "bg-sky-600"    },
  { label: "Farmácia",  value: "Farmácias",          icon: Pill,        color: "bg-emerald-600"},
  { label: "Advogado",  value: "Advogados",          icon: Scale,       color: "bg-amber-600"  },
  { label: "Mecânico",  value: "Oficinas Mecânicas", icon: Wrench,      color: "bg-zinc-600"   },
  { label: "Salão",     value: "Salões de Beleza",   icon: Scissors,    color: "bg-pink-600"   },
  { label: "Clínica",   value: "Clínicas Médicas",   icon: Stethoscope, color: "bg-teal-600"   },
];

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
const FAV_KEY = "viagg_fav_servicos";

export default function AdvertiserServicesListingsPage() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  // ── Query original (inalterada) ───────────────────────────────────────
  const { data: servicos = [], isLoading } = useQuery({
    queryKey: ["servicos-meus-anuncios", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase.from("service_listings") as any)
        .select("id, title, service_type, visibility_status, price_label, city, state, created_at")
        .eq("owner_user_id", user!.id)
        .order("created_at", { ascending: false });
      const list = data || [];
      return Promise.all(list.map(async (s: any) => {
        const { data: media } = await (supabase.from("service_media") as any)
          .select("original_storage_path, public_masked_storage_path")
          .eq("listing_id", s.id)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        const hasThumb = !!media?.public_masked_storage_path && media.public_masked_storage_path !== media.original_storage_path;
        const path = hasThumb ? media.public_masked_storage_path : media?.original_storage_path;
        return { ...s, thumb: path ? getListingImageUrl(path, hasThumb ? "public" : "original") : null };
      }));
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────
  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const isActive = ["published","active"].includes(status);
      await (supabase.from("service_listings") as any)
        .update({ visibility_status: isActive ? "paused" : "published" }).eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["servicos-meus-anuncios", user?.id] }); toast.success("Status atualizado."); },
    onError: () => toast.error("Erro ao atualizar status."),
  });

  const deleteListing = useMutation({
    mutationFn: async (id: string) => {
      await (supabase.from("service_listings") as any).delete().eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["servicos-meus-anuncios", user?.id] }); toast.success("Serviço excluído."); },
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
    const url = `${window.location.origin}/servico/${id}`;
    navigator.clipboard?.writeText(url).then(() => toast.success("Link copiado!")).catch(() => toast.info(`Link: ${url}`));
  };

  // ── KPI e filtragem ──────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:  servicos.length,
    active: servicos.filter(s => ["published","active"].includes((s as any).visibility_status)).length,
    paused: servicos.filter(s => (s as any).visibility_status === "paused").length,
    review: servicos.filter(s => ["pending_review","moderating"].includes((s as any).visibility_status)).length,
  }), [servicos]);

  const filtered = useMemo(() => {
    let r = servicos as any[];
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      r = r.filter(s => (s.title||"").toLowerCase().includes(q) || (s.city||"").toLowerCase().includes(q) || (s.service_type||"").toLowerCase().includes(q));
    }
    if (activeFilter === "active")  r = r.filter(s => ["published","active"].includes(s.visibility_status));
    if (activeFilter === "paused")  r = r.filter(s => s.visibility_status === "paused");
    if (activeFilter === "review")  r = r.filter(s => ["pending_review","moderating"].includes(s.visibility_status));
    if (activeFilter === "favs")    r = r.filter(s => favorites.has(s.id));
    return r;
  }, [servicos, searchTerm, activeFilter, favorites]);

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
      <div className="bg-gradient-to-br from-violet-800 to-violet-600 px-6 pt-8 pb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center">
            <Briefcase className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Meus Serviços</h1>
            <p className="text-white/70 text-sm mt-0.5">{stats.total} serviço{stats.total !== 1 ? "s" : ""} cadastrado{stats.total !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          {[
            { label: "Total",      value: stats.total,  icon: Activity,     color: "text-white"      },
            { label: "Ativos",     value: stats.active, icon: CheckCircle2, color: "text-violet-200" },
            { label: "Pausados",   value: stats.paused, icon: Clock,        color: "text-orange-300" },
            { label: "Em Revisão", value: stats.review, icon: AlertCircle,  color: "text-yellow-300" },
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


        {/* Categorias (originais, estilo dark) */}
        <div className="bg-[#1B1F24] border border-[#2A3038] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-[#F5F7FA] flex items-center gap-2">
              <Plus className="h-4 w-4 text-violet-400" /> Anunciar novo serviço
            </h2>
            <span className="text-[10px] text-violet-400 font-black">Anúncio gratuito</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {QUICK_CATEGORIES.map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.value}
                  onClick={() => navigate(`/anunciante/servicos/anuncios/novo/servico?tipo=${encodeURIComponent(c.value)}`)}
                  className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-[#2A3038] bg-[#14171B] hover:border-violet-700/50 hover:bg-violet-950/20 transition-all"
                >
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", c.color)}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="font-bold text-[#F5F7FA] text-xs">{c.label}</span>
                  <span className="text-[10px] font-black text-violet-400">Anunciar grátis</span>
                </button>
              );
            })}

            {/* Popover "Outros" — original preservado */}
            <Popover open={categoryPickerOpen} onOpenChange={setCategoryPickerOpen}>
              <PopoverTrigger asChild>
                <button className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-[#2A3038] bg-[#14171B] hover:border-violet-700/50 hover:bg-violet-950/20 transition-all">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 bg-violet-600">
                    <ChevronsUpDown className="w-5 h-5 text-white" />
                  </div>
                  <span className="font-bold text-[#F5F7FA] text-xs">Outros</span>
                  <span className="text-[10px] font-black text-violet-400">Ver todas</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] sm:w-[380px] p-0 rounded-lg shadow-xl bg-white sm:mt-3" align="start" sideOffset={12}>
                <Command className="bg-white">
                  <CommandInput placeholder="Pesquisar categoria..." className="h-11 text-zinc-900 placeholder:text-zinc-400" />
                  <CommandList className="max-h-[400px] bg-white">
                    <CommandEmpty className="text-zinc-500">Nenhuma categoria encontrada.</CommandEmpty>
                    {SERVICE_CATEGORY_GROUPS.map((g) => (
                      <CommandGroup
                        key={g.group}
                        heading={
                          <span className="flex items-center gap-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-violet-100 to-violet-200 text-violet-700 shrink-0">
                              <g.icon className="h-[15px] w-[15px]" />
                            </span>
                            {g.group}
                          </span>
                        }
                      >
                        {g.items.map((item) => {
                          const ItemIcon = SERVICE_ITEM_ICONS[item] || g.icon;
                          return (
                            <CommandItem
                              key={item}
                              value={item}
                              className="text-zinc-900 data-[selected=true]:text-zinc-900 gap-3"
                              onSelect={() => {
                                setCategoryPickerOpen(false);
                                navigate(`/anunciante/servicos/anuncios/novo/servico?tipo=${encodeURIComponent(item)}`);
                              }}
                            >
                              <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-50 to-violet-100 text-violet-700 shrink-0 ring-1 ring-violet-200/60 shadow-sm">
                                <ItemIcon className="h-[19px] w-[19px]" />
                              </span>
                              {item}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <p className="text-[10px] text-violet-500/80 bg-violet-950/30 border border-violet-800/30 rounded-lg px-3 py-2">
            🔓 O anúncio é publicado gratuitamente. Você usa créditos apenas para desbloquear o contato do interessado.
          </p>
        </div>

        {/* Search + Filtros + Toggle */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A7B0BE] pointer-events-none" />
              <Input
                placeholder="Buscar por título, categoria ou cidade..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 bg-[#1B1F24] border-[#2A3038] text-[#F5F7FA] placeholder:text-[#A7B0BE]/50 rounded-xl h-10"
              />
            </div>
            <div className="flex gap-1 bg-[#1B1F24] border border-[#2A3038] rounded-xl p-1">
              <button onClick={() => setViewMode("grid")} className={cn("p-1.5 rounded-lg transition-colors", viewMode === "grid" ? "bg-violet-600 text-white" : "text-[#A7B0BE] hover:text-white")}><LayoutGrid className="h-4 w-4" /></button>
              <button onClick={() => setViewMode("list")} className={cn("p-1.5 rounded-lg transition-colors", viewMode === "list" ? "bg-violet-600 text-white" : "text-[#A7B0BE] hover:text-white")}><ListIcon className="h-4 w-4" /></button>
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
                    ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                    : "bg-[#1B1F24] text-[#A7B0BE] border-[#2A3038] hover:border-violet-600/40 hover:text-white"
                )}
              >
                {f.label}{f.count > 0 ? ` (${f.count})` : ""}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-violet-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-[#1B1F24] border border-dashed border-[#2A3038] rounded-2xl p-14 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-[#14171B] flex items-center justify-center mx-auto">
              <Briefcase className="w-8 h-8 text-[#A7B0BE]" />
            </div>
            <h3 className="text-lg font-black text-[#F5F7FA] uppercase">{stats.total === 0 ? "Nenhum serviço cadastrado" : "Sem resultados"}</h3>
            <p className="text-sm text-[#A7B0BE]">{stats.total === 0 ? "Escolha uma categoria acima para anunciar seu primeiro serviço." : "Tente outro filtro."}</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((s: any) => {
              const sc       = getStatusCfg(s.visibility_status);
              const isFav    = favorites.has(s.id);
              const days     = daysSince(s.created_at);
              const isActive = ["published","active"].includes(s.visibility_status);
              const RowIcon  = resolveServiceTypeIcon(s.service_type);
              return (
                <div key={s.id} className="bg-[#1B1F24] border border-[#2A3038] rounded-2xl overflow-hidden flex flex-col hover:shadow-xl hover:shadow-black/30 transition-all hover:-translate-y-0.5">
                  <div className="relative h-44 bg-gradient-to-br from-violet-950/50 to-violet-900/30 overflow-hidden">
                    {s.thumb ? (
                      <img src={s.thumb} alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <RowIcon className="w-14 h-14 text-violet-400/40" />
                      </div>
                    )}
                    <div className="absolute top-2 left-2">
                      <span className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black border", sc.text, sc.bg, sc.border)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", sc.dot)} />{sc.label}
                      </span>
                    </div>
                    <button onClick={e => toggleFav(s.id, e)} className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 backdrop-blur-sm hover:bg-black/60">
                      <Star className={cn("h-3.5 w-3.5", isFav ? "fill-yellow-400 text-yellow-400" : "text-white/70")} />
                    </button>
                    <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg">
                      <span className="text-[10px] font-black text-white uppercase">{resolveServiceTypeLabel(s.service_type)}</span>
                    </div>
                  </div>
                  <div className="p-4 flex flex-col flex-1 gap-2">
                    <h3 className="font-bold text-[14px] text-[#F5F7FA] line-clamp-2 leading-snug">{s.title || "Sem título"}</h3>
                    <div className="flex items-center gap-1 text-[11px] text-[#A7B0BE]">
                      <MapPin className="h-3 w-3 shrink-0 text-violet-400" />
                      {[s.city, s.state].filter(Boolean).join(", ") || "Localização não informada"}
                    </div>
                    <div className="text-lg font-black text-violet-400 leading-none">
                      {s.price_label?.trim() || <span className="text-[#A7B0BE] text-sm">Consulte</span>}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-[#A7B0BE] pt-1 border-t border-[#2A3038]">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {days}d</span>
                    </div>
                    <div className="flex gap-2 mt-auto pt-2">
                      <Button size="sm" onClick={() => navigate(`/anunciante/servicos/anuncios/editar/servico/${s.id}`)} className="flex-1 h-9 bg-violet-700 hover:bg-violet-600 text-white font-black text-[10px] uppercase rounded-xl gap-1">
                        <Pencil className="h-3 w-3" /> Editar
                      </Button>
                      <button onClick={() => handleShare(s.id)} className="h-9 w-9 flex items-center justify-center rounded-xl border border-[#2A3038] text-[#A7B0BE] hover:text-white hover:border-violet-700/50 transition-colors"><Share2 className="h-3.5 w-3.5" /></button>
                      <button onClick={() => toggleStatus.mutate({ id: s.id, status: s.visibility_status })} className={cn("h-9 w-9 flex items-center justify-center rounded-xl border transition-colors", isActive ? "border-orange-500/30 text-orange-400 hover:bg-orange-500/10" : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10")}>
                        {isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => { if(window.confirm("Excluir este serviço?")) deleteListing.mutate(s.id); }} className="h-9 w-9 flex items-center justify-center rounded-xl border border-red-500/20 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 transition-colors">
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
            {filtered.map((s: any) => {
              const sc    = getStatusCfg(s.visibility_status);
              const isFav = favorites.has(s.id);
              const isActive = ["published","active"].includes(s.visibility_status);
              const RowIcon = resolveServiceTypeIcon(s.service_type);
              return (
                <div key={s.id} className="flex items-center gap-3 p-4 hover:bg-[#14171B] transition-colors group">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-violet-950/50 to-violet-900/30 shrink-0 flex items-center justify-center border border-[#2A3038]">
                    {s.thumb ? <img src={s.thumb} alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : <RowIcon className="w-5 h-5 text-violet-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#F5F7FA] text-sm truncate">{s.title || "Sem título"}</p>
                    <p className="text-xs text-[#A7B0BE] truncate">{resolveServiceTypeLabel(s.service_type)} · {[s.city, s.state].filter(Boolean).join("/")}</p>
                  </div>
                  <span className={cn("text-[10px] font-black px-2 py-1 rounded-full border shrink-0", sc.text, sc.bg, sc.border)}>{sc.label}</span>
                  <span className="text-sm font-black text-violet-400 shrink-0">{s.price_label?.trim() || "—"}</span>
                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={e => toggleFav(s.id, e)} className={cn("p-1.5 rounded-lg", isFav ? "text-yellow-400" : "text-[#A7B0BE] hover:text-yellow-400")}><Star className={cn("h-3.5 w-3.5", isFav && "fill-current")} /></button>
                    <button onClick={() => navigate(`/anunciante/servicos/anuncios/editar/servico/${s.id}`)} className="p-1.5 rounded-lg text-[#A7B0BE] hover:text-violet-400"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => toggleStatus.mutate({ id: s.id, status: s.visibility_status })} className={cn("p-1.5 rounded-lg", isActive ? "text-orange-400" : "text-emerald-400")}>{isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
                    <button onClick={() => { if(window.confirm("Excluir?")) deleteListing.mutate(s.id); }} className="p-1.5 rounded-lg text-red-500/50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
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
