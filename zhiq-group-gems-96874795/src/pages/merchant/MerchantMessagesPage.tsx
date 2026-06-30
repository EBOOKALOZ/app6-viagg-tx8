import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare, Phone, Clock, Package, User, Trash2, Search,
  Star, Brain, Sparkles, TrendingUp, Activity, ShoppingBag,
  ArrowLeft, Coins,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import LoadingTransition from "@/pages/LoadingTransition";

// ── Tipos ─────────────────────────────────────────────────────────────────
interface PurchaseIntention {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_note: string | null;
  created_at: string;
  total_amount: number;
  items: Array<{
    listing_id: string;
    quantity: number;
    price: number;
    title?: string;
    image_url?: string;
  }>;
  store_id?: string;
}

const FAV_MERCH_KEY = "viagg_fav_merch_msgs";

function timeAgo(dateStr: string): string {
  try { return formatDistanceToNow(new Date(dateStr), { locale: ptBR, addSuffix: true }); }
  catch { return ""; }
}

function getInitials(name: string): string {
  const parts = (name || "?").trim().split(/\s+/);
  return (parts[0]?.[0] || "?").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
}

// GLM score p/ Mercado: baseado em presença de telefone, mensagem e valor
function getMerchGLMScore(pi: PurchaseIntention): { label: string; color: string } {
  if (pi.customer_phone && pi.customer_note && pi.total_amount > 0)
    return { label: "Alto Interesse", color: "text-red-700 bg-red-50 border-red-200" };
  if (pi.customer_phone && pi.total_amount > 0)
    return { label: "Interesse Médio", color: "text-orange-700 bg-orange-50 border-orange-200" };
  if (pi.customer_phone)
    return { label: "Interesse Básico", color: "text-blue-700 bg-blue-50 border-blue-200" };
  return { label: "Interesse Inicial", color: "text-gray-700 bg-gray-50 border-gray-200" };
}

// ── Component ─────────────────────────────────────────────────────────────
export default function MerchantMessagesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [intentions, setIntentions] = useState<PurchaseIntention[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── Busca original preservada na íntegra ─────────────────────────────
  useEffect(() => {
    if (!user?.id) { setIsLoading(false); return; }

    async function fetchStoreAndIntentions() {
      try {
        const { data: store, error: storeErr } = await supabase
          .from("merchant_stores")
          .select("id, nome_loja")
          .eq("user_id", user.id)
          .maybeSingle();

        if (storeErr || !store) { setIsLoading(false); return; }

        const { data: allIntentions, error: piErr } = await supabase
          .from("purchase_intentions")
          .select("*")
          .order("created_at", { ascending: false });

        if (piErr) { console.error("Error fetching intentions:", piErr); setIsLoading(false); return; }

        let storeIntentions: PurchaseIntention[] = (allIntentions || []).filter(
          (pi: any) => pi.store_id === store.id
        );

        if (storeIntentions.length === 0) {
          const { data: listings } = await supabase
            .from("advertiser_listings")
            .select("id")
            .eq("store_id", store.id);
          const listingIds = new Set(listings?.map(l => l.id) || []);
          if (listingIds.size > 0) {
            storeIntentions = (allIntentions || []).filter((pi: any) => {
              const items = pi.items as Array<{ listing_id: string }> || [];
              return items.some(item => listingIds.has(item.listing_id));
            });
          }
        }

        setIntentions(storeIntentions);
      } catch (error) {
        console.error("Unexpected error:", error);
        toast.error("Erro ao carregar mensagens.");
      } finally {
        setIsLoading(false);
      }
    }

    fetchStoreAndIntentions();
  }, [user]);

  // ── Handler original preservado ───────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!window.confirm("Excluir esta mensagem?")) return;
    const { error } = await supabase.from("purchase_intentions").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir: " + error.message); }
    else { toast.success("Mensagem excluída."); setIntentions(prev => prev.filter(i => i.id !== id)); }
  };

  // ── NOVAS funcionalidades de UI ────────────────────────────────────────
  const [searchTerm, setSearchTerm]     = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "withPhone" | "withNote" | "favoritos">("all");
  const [favorites, setFavorites]       = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_MERCH_KEY) || "[]") as string[]); }
    catch { return new Set<string>(); }
  });

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(FAV_MERCH_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const stats = useMemo(() => ({
    total:      intentions.length,
    withPhone:  intentions.filter(i => !!i.customer_phone).length,
    withNote:   intentions.filter(i => !!i.customer_note).length,
    totalValue: intentions.reduce((s, i) => s + (i.total_amount || 0), 0),
  }), [intentions]);

  const filteredIntentions = useMemo(() => {
    let result = intentions;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(i =>
        (i.customer_name || "").toLowerCase().includes(q) ||
        (i.customer_note || "").toLowerCase().includes(q) ||
        (i.customer_phone || "").includes(q)
      );
    }
    if (activeFilter === "withPhone")  result = result.filter(i => !!i.customer_phone);
    if (activeFilter === "withNote")   result = result.filter(i => !!i.customer_note);
    if (activeFilter === "favoritos")  result = result.filter(i => favorites.has(i.id));
    return result;
  }, [intentions, searchTerm, activeFilter, favorites]);

  const FILTER_TABS = [
    { key: "all" as const,       label: "Todos",          count: stats.total     },
    { key: "withPhone" as const, label: "📞 Com Telefone", count: stats.withPhone },
    { key: "withNote" as const,  label: "✉ Com Mensagem", count: stats.withNote  },
    { key: "favoritos" as const, label: "⭐ Favoritos",   count: favorites.size  },
  ];

  // ── Render ────────────────────────────────────────────────────────────
  if (isLoading) return <LoadingTransition />;

  return (
    <div className="min-h-screen bg-[#0D0F12] animate-fade-in">

      {/* Header */}
      <div className="bg-gradient-to-br from-[#FF6A00] to-[#E05A00] px-6 pt-10 pb-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-white/70 hover:text-white text-xs font-bold uppercase tracking-widest mb-5 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Voltar
        </button>
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
            <ShoppingBag className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Mensagens da Loja</h1>
            <p className="text-white/70 text-sm font-medium mt-0.5">
              Mercado · {stats.total} intenção{stats.total !== 1 ? "ões" : ""} de compra
            </p>
          </div>
        </div>

        {/* Valor total em destaque */}
        {stats.totalValue > 0 && (
          <div className="mt-5 flex items-center gap-3 bg-white/10 border border-white/20 rounded-2xl px-4 py-3">
            <Coins className="w-5 h-5 text-white/80 shrink-0" />
            <div>
              <p className="text-white/60 text-[11px] font-bold uppercase tracking-wider">Volume total em pedidos</p>
              <p className="text-white text-2xl font-black leading-none">
                R$ {stats.totalValue.toFixed(2)}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 md:px-6 py-6 space-y-6 max-w-[1400px] mx-auto">

        {/* KPI Dashboard */}
        {!isLoading && stats.total > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Mensagens",  value: stats.total,                     icon: Activity,     color: "text-white",       bg: "bg-zinc-700"       },
              { label: "Com Telefone",     value: stats.withPhone,                 icon: Phone,        color: "text-emerald-400", bg: "bg-emerald-500/10" },
              { label: "Com Mensagem",     value: stats.withNote,                  icon: MessageSquare,color: "text-blue-400",    bg: "bg-blue-500/10"    },
              { label: "Valor Total",      value: `R$${stats.totalValue.toFixed(0)}`,icon: Coins,      color: "text-orange-400",  bg: "bg-orange-500/10"  },
            ].map(k => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="bg-[#1B1F24] border border-[#2A3038] rounded-2xl p-4 flex items-center gap-3">
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", k.bg)}>
                    <Icon className={cn("h-5 w-5", k.color)} />
                  </div>
                  <div>
                    <div className="text-xl font-black text-[#F5F7FA]">{k.value}</div>
                    <div className="text-[11px] text-[#A7B0BE] mt-0.5">{k.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* GLM IA Banner */}
        <div className="flex items-center gap-3 bg-violet-950/40 border border-violet-700/30 rounded-2xl px-4 py-3">
          <div className="h-9 w-9 rounded-xl bg-violet-700/30 border border-violet-600/30 flex items-center justify-center shrink-0">
            <Brain className="h-4 w-4 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-violet-300">Análise de Intenção de Compra — GLM IA</p>
            <p className="text-[11px] text-violet-500 mt-0.5">Classificação automática de interesse por perfil de cliente</p>
          </div>
          <Sparkles className="h-4 w-4 text-violet-500 shrink-0" />
        </div>

        {/* Search + Filtros */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A7B0BE] pointer-events-none" />
            <Input
              placeholder="Buscar por nome, mensagem ou telefone..."
              className="pl-10 bg-[#1B1F24] border-[#2A3038] text-[#F5F7FA] placeholder:text-[#A7B0BE]/50 rounded-xl h-11"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border whitespace-nowrap",
                  activeFilter === tab.key
                    ? "bg-[#FF6A00] text-white border-[#FF6A00] shadow-sm shadow-[#FF6A00]/30"
                    : "bg-[#1B1F24] text-[#A7B0BE] border-[#2A3038] hover:border-[#FF6A00]/30 hover:text-white"
                )}
              >
                {tab.label}{tab.count > 0 ? ` (${tab.count})` : ""}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de intenções */}
        {filteredIntentions.length === 0 ? (
          <div className="bg-[#1B1F24] border border-dashed border-[#2A3038] rounded-2xl p-14 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-[#14171B] flex items-center justify-center mx-auto">
              <ShoppingBag className="w-8 h-8 text-[#A7B0BE]" />
            </div>
            <h3 className="text-lg font-black text-[#F5F7FA] uppercase">
              {stats.total === 0 ? "Nenhuma mensagem ainda" : "Nenhum resultado"}
            </h3>
            <p className="text-sm text-[#A7B0BE] max-w-md mx-auto">
              {stats.total === 0
                ? "Quando um cliente demonstrar interesse nos seus produtos, aparecerá aqui."
                : "Tente outro filtro ou pesquisa."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredIntentions.map((pi) => {
              const isFav = favorites.has(pi.id);
              const glm   = getMerchGLMScore(pi);

              return (
                <div key={pi.id} className="bg-[#1B1F24] border border-[#2A3038] rounded-2xl overflow-hidden flex flex-col hover:shadow-xl hover:shadow-black/30 transition-all">
                  <div className="h-0.5 bg-gradient-to-r from-[#FF6A00] to-[#FF7A1A]" />

                  {/* Card header */}
                  <div className="p-4 flex items-center gap-3">
                    <div className="h-11 w-11 rounded-full bg-[#FF6A00] flex items-center justify-center font-black text-sm text-white shrink-0">
                      {getInitials(pi.customer_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[14px] text-[#F5F7FA]">
                          {pi.customer_name || "Anônimo"}
                        </span>
                        <Badge className="text-[10px] border-0 px-2 py-0 bg-[#FF6A00]/20 text-[#FF6A00] font-bold">
                          Nova Mensagem
                        </Badge>
                      </div>
                      <p className="text-[11px] text-[#A7B0BE] mt-0.5">{timeAgo(pi.created_at)}</p>
                    </div>
                    <button
                      onClick={e => toggleFavorite(pi.id, e)}
                      className={cn("shrink-0 p-1.5 rounded-lg transition-colors", isFav ? "text-yellow-400" : "text-[#A7B0BE]/30 hover:text-yellow-400")}
                    >
                      <Star className={cn("h-4 w-4", isFav && "fill-current")} />
                    </button>
                  </div>

                  {/* Telefone */}
                  {pi.customer_phone ? (
                    <div className="mx-4 mb-3 flex items-center gap-2 text-sm text-emerald-300 bg-emerald-950/30 border border-emerald-700/30 px-3 py-2 rounded-xl">
                      <Phone className="h-4 w-4 shrink-0" />
                      {pi.customer_phone}
                    </div>
                  ) : (
                    <div className="mx-4 mb-3 flex items-center gap-2 text-xs text-[#A7B0BE]/50 border border-dashed border-[#2A3038] px-3 py-2 rounded-xl">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      Sem telefone informado
                    </div>
                  )}

                  {/* Mensagem */}
                  {pi.customer_note && (
                    <p className="mx-4 mb-3 text-xs italic leading-relaxed text-[#A7B0BE] bg-[#14171B] border border-[#2A3038] rounded-xl p-3 whitespace-pre-line">
                      "{pi.customer_note}"
                    </p>
                  )}

                  {/* Itens do pedido */}
                  {pi.items && pi.items.length > 0 && (
                    <div className="mx-4 mb-3 bg-[#14171B] border border-[#2A3038] rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-[#A7B0BE] font-black uppercase tracking-wider">
                        <Package className="h-3 w-3" />Itens do Pedido
                      </div>
                      {pi.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs text-[#A7B0BE] bg-[#1B1F24] px-2.5 py-1.5 rounded-lg border border-[#2A3038]">
                          <span className="truncate">{item.title || `Produto`}</span>
                          <span className="font-bold text-[#F5F7FA] ml-2 shrink-0">{item.quantity}×</span>
                        </div>
                      ))}
                      <div className="flex justify-between pt-1.5 border-t border-[#2A3038]">
                        <span className="text-xs font-bold text-[#A7B0BE]">Total</span>
                        <span className="text-sm font-black text-[#FF6A00]">R$ {pi.total_amount?.toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  {/* GLM IA Score */}
                  <div className={cn("mx-4 mb-3 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold", glm.color)}>
                    <Brain className="h-3.5 w-3.5 shrink-0" />
                    <span>GLM IA: {glm.label}</span>
                    <TrendingUp className="h-3 w-3 ml-auto" />
                  </div>

                  {/* Timestamp */}
                  <div className="mx-4 mb-3 flex items-center gap-1.5 text-[10px] text-[#A7B0BE]/50 font-mono">
                    <Clock className="h-3 w-3" />
                    {new Date(pi.created_at).toLocaleString("pt-BR")}
                  </div>

                  {/* Actions */}
                  <div className="px-4 pb-4 space-y-2 mt-auto">
                    {pi.customer_phone && (
                      <Button
                        onClick={() => {
                          const clean = String(pi.customer_phone).replace(/\D/g, "").replace(/^55/, "");
                          const msg = encodeURIComponent(`Olá ${pi.customer_name || ""}! Vi que você se interessou pelos produtos da nossa loja na Viagg-TX8. Posso ajudar?`);
                          window.open(`https://wa.me/55${clean}?text=${msg}`, "_blank");
                        }}
                        className="w-full h-11 bg-emerald-700 hover:bg-emerald-600 text-white font-black uppercase text-[11px] tracking-widest gap-2 rounded-xl"
                      >
                        <MessageSquare className="w-4 h-4" /> Contatar via WhatsApp
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(pi.id)}
                      className="w-full h-9 rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/10 hover:text-red-400 font-black text-[10px] uppercase gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Excluir Mensagem
                    </Button>
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
