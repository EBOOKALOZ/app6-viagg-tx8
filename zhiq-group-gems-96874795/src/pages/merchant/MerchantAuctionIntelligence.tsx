import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CardDark, CardInfo } from "@/components/ui/dark-card";
import { 
  TrendingUp, Users, Eye, Sparkles, BrainCircuit, Activity, 
  BarChart3, DollarSign, Clock, CalendarDays, LineChart as LineChartIcon,
  AlertTriangle, Lightbulb
} from "lucide-react";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from "recharts";
import { cn, formatCurrencyBRL } from "@/lib/utils";

const mockPerformanceData = [
  { name: 'Seg', visualizacoes: 40, lances: 4, conversao: 10 },
  { name: 'Ter', visualizacoes: 30, lances: 3, conversao: 10 },
  { name: 'Qua', visualizacoes: 55, lances: 8, conversao: 14 },
  { name: 'Qui', visualizacoes: 45, lances: 5, conversao: 11 },
  { name: 'Sex', visualizacoes: 80, lances: 15, conversao: 18 },
  { name: 'Sab', visualizacoes: 120, lances: 25, conversao: 20 },
  { name: 'Dom', visualizacoes: 95, lances: 12, conversao: 12 },
];

export const MerchantAuctionIntelligence = () => {
  const [timeRange, setTimeRange] = useState("7d");

  // Fetch das mtricas macro do vendedor
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['merchant-auction-intelligence', timeRange],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return null;

      // Buscar da view que criamos (auction_performance_analytics)
      const { data, error } = await supabase
        .from('auction_performance_analytics')
        .select('*')
        .eq('seller_id', user.user.id);
      
      if (error) {
        console.error("Erro ao buscar BI:", error);
        return [];
      }
      return data || [];
    }
  });

  const totalViews = metrics?.reduce((acc, curr) => acc + (curr.views_count || 0), 0) || 0;
  const totalBids = metrics?.reduce((acc, curr) => acc + (curr.bids_count || 0), 0) || 0;
  const totalUnique = metrics?.reduce((acc, curr) => acc + (curr.unique_visitors_count || 0), 0) || 0;
  const avgConversion = metrics?.length 
    ? metrics.reduce((acc, curr) => acc + (curr.conversion_rate || 0), 0) / metrics.length 
    : 0;

  return (
    <div className="space-y-6 animate-fade-in p-2 sm:p-4">
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BrainCircuit className="text-blue-400" />
            Inteligência Comercial
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            BI e Insights de IA para otimização dos seus leilões.
          </p>
        </div>

        <select 
          className="bg-[#1a1a24] text-white border border-[#2a2a35] rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
        >
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="90d">Últimos 90 dias</option>
          <option value="12m">Últimos 12 meses</option>
        </select>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <CardInfo
          title="Visualizações Totais"
          value={totalViews.toString()}
          subtitle="+14% vs período anterior"
          icon={<Eye className="text-blue-400" />}
        />
        <CardInfo
          title="Visitantes Únicos"
          value={totalUnique.toString()}
          subtitle="+8% vs período anterior"
          icon={<Users className="text-purple-400" />}
        />
        <CardInfo
          title="Taxa de Conversão"
          value={`${avgConversion.toFixed(1)}%`}
          subtitle="Visitas que viraram lances"
          icon={<Activity className="text-green-400" />}
        />
        <CardInfo
          title="Receita Estimada"
          value={formatCurrencyBRL(totalBids * 150)} // mockup value
          subtitle="Baseado em lances atuais"
          icon={<DollarSign className="text-yellow-400" />}
        />
      </div>

      {/* AI Insights Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Gráfico */}
        <div className="lg:col-span-2">
          <CardDark className="p-4 sm:p-6 h-full flex flex-col">
            <h3 className="text-white font-medium mb-6 flex items-center gap-2">
              <LineChartIcon size={18} className="text-gray-400" />
              Evolução de Tráfego e Engajamento
            </h3>
            
            <div className="flex-1 w-full min-h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockPerformanceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorBids" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a35" vertical={false} />
                  <XAxis dataKey="name" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a24', borderColor: '#2a2a35', color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Area type="monotone" dataKey="visualizacoes" stroke="#3b82f6" fillOpacity={1} fill="url(#colorViews)" />
                  <Area type="monotone" dataKey="lances" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorBids)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardDark>
        </div>

        {/* AI Recommendations */}
        <div className="space-y-4">
          <CardDark className="p-4 sm:p-5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Sparkles size={64} className="text-yellow-400" />
            </div>
            
            <h3 className="text-white font-medium flex items-center gap-2 mb-4">
              <Sparkles className="text-yellow-400" size={18} />
              ORION AI Insights
            </h3>
            
            <div className="space-y-3">
              <div className="bg-[#1a1a24] p-3 rounded-lg border border-[#2a2a35]">
                <div className="flex gap-3">
                  <div className="mt-0.5"><AlertTriangle size={16} className="text-orange-400" /></div>
                  <div>
                    <p className="text-sm text-gray-200 font-medium">Baixo engajamento detectado</p>
                    <p className="text-xs text-gray-400 mt-1">Seu leilão "iPhone 15 Pro" está com 30% menos visitas que a média da categoria.</p>
                  </div>
                </div>
              </div>

              <div className="bg-[#1a1a24] p-3 rounded-lg border border-[#2a2a35]">
                <div className="flex gap-3">
                  <div className="mt-0.5"><Lightbulb size={16} className="text-green-400" /></div>
                  <div>
                    <p className="text-sm text-gray-200 font-medium">Recomendação de Horário</p>
                    <p className="text-xs text-gray-400 mt-1">A IA sugere iniciar seus próximos leilões de eletrônicos às <strong className="text-green-400">Sextas-feiras, 19:00</strong> para 25% mais lances.</p>
                  </div>
                </div>
              </div>

              <div className="bg-[#1a1a24] p-3 rounded-lg border border-[#2a2a35]">
                <div className="flex gap-3">
                  <div className="mt-0.5"><TrendingUp size={16} className="text-blue-400" /></div>
                  <div>
                    <p className="text-sm text-gray-200 font-medium">Índice de Atratividade</p>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1.5 bg-[#2a2a35] rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 w-[78%]"></div>
                      </div>
                      <span className="text-xs text-blue-400 font-bold">78/100</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <button className="w-full mt-4 bg-[#2a2a35] hover:bg-[#32323e] text-white text-sm py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
              <BrainCircuit size={16} />
              Gerar Relatório Completo
            </button>
          </CardDark>
        </div>
      </div>

    </div>
  );
};
