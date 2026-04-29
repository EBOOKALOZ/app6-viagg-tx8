import { useState, useMemo } from "react";
import { 
  ShoppingBag, Gavel, Tag, Search, Filter, Calendar, 
  MessageSquare, User, Phone, ChevronRight, Loader2,
  CheckCircle, Clock, TrendingUp, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMerchantConversions, type ConversionEvent } from "@/hooks/useMerchantConversions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export default function MerchantConversionsSection() {
  const { user } = useAuth();
  const { conversions, isLoading } = useMerchantConversions();
  
  // Filters state
  const [filterType, setFilterType] = useState<string>("all");
  const [filterProduct, setFilterProduct] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [period, setPeriod] = useState("30"); // days

  // KPI Card Filter
  const [activeKpiFilter, setActiveKpiFilter] = useState<string | null>(null);

  // Fetch products for filter
  const { data: products = [] } = useQuery({
    queryKey: ["merchant-products-filter", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await (supabase.from("merchant_marketing_products") as any)
        .select("id, title")
        .eq("created_by_user_id", user.id);
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Filtered conversions
  const filteredConversions = useMemo(() => {
    return conversions.filter(event => {
      const matchesType = filterType === "all" || event.event_type === filterType;
      const matchesProduct = filterProduct === "all" || event.product_id === filterProduct;
      const matchesSearch = !searchQuery || 
        event.product_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.customer_whatsapp?.includes(searchQuery);
      
      const eventDate = new Date(event.created_at);
      const now = new Date();
      const diffDays = (now.getTime() - eventDate.getTime()) / (1000 * 3600 * 24);
      const matchesPeriod = period === "custom" || diffDays <= parseInt(period);

      const matchesKpi = !activeKpiFilter || event.event_type === activeKpiFilter;

      return matchesType && matchesProduct && matchesSearch && matchesPeriod && matchesKpi;
    });
  }, [conversions, filterType, filterProduct, searchQuery, period, activeKpiFilter]);

  // KPI Stats
  const stats = useMemo(() => {
    return {
      total: conversions.length,
      whatsapp: conversions.filter(c => c.event_type === 'wattsapp_purchase').length,
      auction: conversions.filter(c => c.event_type === 'auction_won').length,
      arremate: conversions.filter(c => c.event_type === 'arremate_won').length,
    };
  }, [conversions]);

  const formatBRL = (val: number) => {
    return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'wattsapp_purchase': return { label: 'WhatsApp', color: 'bg-emerald-100 text-emerald-700', icon: MessageSquare };
      case 'auction_won': return { label: 'Leilão', color: 'bg-orange-100 text-orange-700', icon: Gavel };
      case 'arremate_won': return { label: 'Arremate', color: 'bg-violet-100 text-violet-700', icon: Tag };
      default: return { label: type, color: 'bg-gray-100 text-gray-700', icon: ShoppingBag };
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
        <p className="text-gray-500 font-medium">Carregando seus fechamentos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 4 Clickable KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { id: 'all', title: 'Todos os fechamentos', count: stats.total, icon: TrendingUp, color: 'from-blue-500 to-blue-600', filter: null },
          { id: 'wattsapp_purchase', title: 'Comprou pelo WhatsApp', count: stats.whatsapp, icon: MessageSquare, color: 'from-emerald-500 to-emerald-600', filter: 'wattsapp_purchase' },
          { id: 'auction_won', title: 'Venceu Leilão', count: stats.auction, icon: Gavel, color: 'from-orange-500 to-orange-600', filter: 'auction_won' },
          { id: 'arremate_won', title: 'Ganhou no Arremate', count: stats.arremate, icon: Tag, color: 'from-violet-500 to-violet-600', filter: 'arremate_won' },
        ].map((kpi) => (
          <button
            key={kpi.id}
            onClick={() => setActiveKpiFilter(activeKpiFilter === kpi.filter ? null : kpi.filter as any)}
            className={`relative overflow-hidden group rounded-2xl p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${
              (activeKpiFilter === kpi.filter || (!activeKpiFilter && kpi.id === 'all'))
                ? 'ring-4 ring-offset-2 shadow-xl ring-gray-200'
                : 'shadow-md border border-gray-100'
            }`}
          >
            <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full bg-gradient-to-br ${kpi.color} opacity-10 group-hover:scale-110 transition-transform`} />
            <kpi.icon className={`h-6 w-6 mb-2 ${
               (activeKpiFilter === kpi.filter || (!activeKpiFilter && kpi.id === 'all')) ? 'text-gray-900' : 'text-gray-400'
            }`} />
            <p className="text-2xl font-black text-gray-900 leading-tight">{kpi.count}</p>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-tight">{kpi.title}</p>
          </button>
        ))}
      </div>

      {/* Filters Area */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Product Selector */}
          <div className="flex-1 min-w-[200px]">
            <Label className="text-[10px] font-black uppercase text-gray-400 mb-1.5 block">Filtrar por Produto</Label>
            <Select value={filterProduct} onValueChange={setFilterProduct}>
              <SelectTrigger className="rounded-xl border-gray-200 h-11">
                <SelectValue placeholder="Todos os produtos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os produtos</SelectItem>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type Selector */}
          <div className="w-full md:w-48">
            <Label className="text-[10px] font-black uppercase text-gray-400 mb-1.5 block">Tipo de Fechamento</Label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="rounded-xl border-gray-200 h-11">
                <SelectValue placeholder="Todos os tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="wattsapp_purchase">WhatsApp</SelectItem>
                <SelectItem value="auction_won">Leilão</SelectItem>
                <SelectItem value="arremate_won">Arremate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Period Selector */}
          <div className="w-full md:w-48">
            <Label className="text-[10px] font-black uppercase text-gray-400 mb-1.5 block">Período</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="rounded-xl border-gray-200 h-11">
                <SelectValue placeholder="Selecione o período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Hoje</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="999">Todo o histórico</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input 
            placeholder="Buscar por produto, cliente ou WhatsApp..." 
            className="pl-11 rounded-xl border-gray-200 h-12 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Results Table/List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Produto</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipo</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Cliente</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Data / Hora</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredConversions.length > 0 ? (
                filteredConversions.map((event) => {
                  const typeInfo = getTypeLabel(event.event_type);
                  return (
                    <tr key={event.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-gray-900 group-hover:text-orange-600 transition-colors">
                          {event.product_title || "Produto não identificado"}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${typeInfo.color}`}>
                          <typeInfo.icon className="h-3 w-3" />
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold text-gray-700">{event.customer_name || "Anônimo"}</p>
                          {event.customer_whatsapp && (
                            <p className="text-[11px] text-gray-400 font-mono">
                              {event.customer_whatsapp.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-black text-gray-900">
                          {formatBRL(event.amount)}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-gray-600">
                            {new Date(event.created_at).toLocaleDateString("pt-BR")}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {new Date(event.created_at).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="rounded-xl border-gray-200 hover:border-orange-200 hover:bg-orange-50 group-hover:shadow-sm"
                        >
                          Ver detalhes
                          <ChevronRight className="h-4 w-4 ml-1 opacity-50" />
                        </Button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="max-w-xs mx-auto space-y-3">
                      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
                        <ShoppingBag className="h-8 w-8 text-gray-200" />
                      </div>
                      <h4 className="text-gray-900 font-bold">Nenhum fechamento encontrado</h4>
                      <p className="text-sm text-gray-400">Ajuste os filtros ou aguarde novas conversões em sua loja.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Label component helper if needed (standard Shadcn UI might not export it directly if custom)
function Label({ children, className }: { children: React.ReactNode, className?: string }) {
  return <label className={className}>{children}</label>;
}
