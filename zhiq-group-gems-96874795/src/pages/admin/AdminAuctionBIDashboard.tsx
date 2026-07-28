import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { CardDark, CardInfo } from "@/components/ui/dark-card";
import { 
  BarChart3, TrendingUp, Gavel, Users, DollarSign, Activity, AlertTriangle, Sparkles, Trophy, ShoppingBag
} from "lucide-react";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell 
} from "recharts";

export const AdminAuctionBIDashboard = () => {
  const [timeRange, setTimeRange] = useState("30d");

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['admin-auction-bi', timeRange],
    queryFn: async () => {
      // Como estamos mockando os rankings por enquanto (visto que as tabelas de conversão
      // estão sendo preenchidas agora), usaremos dados de mock para apresentação na interface
      return {
        activeAuctions: 124,
        closedAuctions: 458,
        winRate: 68.5,
        totalRevenue: 2450000,
        totalCommissions: 122500, // 5%
      };
    }
  });

  const mockCategoryRanking = [
    { name: "Veículos", value: 450000 },
    { name: "Imóveis", value: 380000 },
    { name: "Eletrônicos", value: 120000 },
    { name: "Joias", value: 85000 },
    { name: "Móveis", value: 45000 },
  ];

  const mockSellerRanking = [
    { name: "João Leiloeiro", sales: 120, revenue: 850000 },
    { name: "Maria Arremates", sales: 95, revenue: 620000 },
    { name: "B2B Automóveis", sales: 45, revenue: 410000 },
  ];

  const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

  return (
    <AdminLayout>
      <div className="space-y-6 animate-fade-in p-2 sm:p-4 pb-20">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <BarChart3 className="text-blue-400" />
              Business Intelligence - Leilões
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Visão macro de performance, comissões e tendências.
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

        {/* Global KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <CardInfo
            title="Leilões Ativos"
            value={metrics?.activeAuctions.toString() || "0"}
            icon={<Gavel className="text-blue-400" />}
          />
          <CardInfo
            title="Volume Encerrado"
            value={metrics?.closedAuctions.toString() || "0"}
            icon={<ShoppingBag className="text-purple-400" />}
          />
          <CardInfo
            title="Taxa de Arrematação"
            value={`${metrics?.winRate || 0}%`}
            icon={<Activity className="text-green-400" />}
          />
          <CardInfo
            title="Receita da Plataforma"
            value={formatCurrencyBRL(metrics?.totalRevenue || 0)}
            icon={<DollarSign className="text-yellow-400" />}
          />
          <CardInfo
            title="Comissões (TX8)"
            value={formatCurrencyBRL(metrics?.totalCommissions || 0)}
            icon={<TrendingUp className="text-emerald-400" />}
          />
        </div>

        {/* Dashboards Secundários */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Gráfico de Categorias */}
          <div className="lg:col-span-2">
            <CardDark className="p-4 sm:p-6 h-full flex flex-col">
              <h3 className="text-white font-medium mb-6 flex items-center gap-2">
                <Trophy size={18} className="text-yellow-400" />
                Ranking de Categorias (Receita)
              </h3>
              <div className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mockCategoryRanking} layout="vertical" margin={{ top: 0, right: 0, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a35" horizontal={true} vertical={false} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} stroke="#9ca3af" fontSize={12} />
                    <RechartsTooltip 
                      formatter={(value: number) => formatCurrencyBRL(value)}
                      contentStyle={{ backgroundColor: '#1a1a24', borderColor: '#2a2a35', color: '#fff' }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                      {mockCategoryRanking.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardDark>
          </div>

          {/* Ranking de Vendedores & IA */}
          <div className="space-y-6">
            <CardDark className="p-4 sm:p-5">
              <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                <Users size={18} className="text-blue-400" />
                Top Vendedores
              </h3>
              <div className="space-y-4">
                {mockSellerRanking.map((seller, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#2a2a35] flex items-center justify-center text-xs font-bold text-gray-300">
                        #{idx + 1}
                      </div>
                      <div>
                        <p className="text-sm text-gray-200">{seller.name}</p>
                        <p className="text-xs text-gray-500">{seller.sales} vendas</p>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-green-400">
                      {formatCurrencyBRL(seller.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </CardDark>

            <CardDark className="p-4 sm:p-5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Sparkles size={64} className="text-purple-400" />
              </div>
              <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                <Sparkles size={18} className="text-purple-400" />
                Tendências (ORION AI)
              </h3>
              <ul className="space-y-3 relative z-10 text-sm">
                <li className="flex items-start gap-2">
                  <TrendingUp className="text-green-400 mt-0.5" size={16} />
                  <span className="text-gray-300">Alta procura por **Veículos Clássicos** (+45% nas buscas).</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="text-orange-400 mt-0.5" size={16} />
                  <span className="text-gray-300">Queda no arremate de Eletrônicos às segundas-feiras.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Activity className="text-blue-400 mt-0.5" size={16} />
                  <span className="text-gray-300">Crescimento geral da plataforma: **+12% novos arrematantes** este mês.</span>
                </li>
              </ul>
            </CardDark>
          </div>

        </div>
      </div>
    </AdminLayout>
  );
};
