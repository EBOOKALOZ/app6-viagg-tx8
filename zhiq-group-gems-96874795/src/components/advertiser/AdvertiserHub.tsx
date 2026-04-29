import React from "react";
import { Building2, Package, Megaphone, LayoutDashboard, Settings, LogOut, TrendingUp, Eye, MessageSquare, Plus, CreditCard, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function AdvertiserHub() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // Fetch real counts for the advertiser
  const { data: stats } = useQuery({
    queryKey: ["advertiser-stats", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [resListings, resProducts] = await Promise.all([
        supabase.from("real_estate_listings").select("id", { count: "exact" }).eq("owner_user_id", user?.id),
        supabase.from("merchant_marketing_products").select("id", { count: "exact" }).eq("merchant_store_id", user?.id) // assuming store_id is user_id for now or linked
      ]);
      
      return {
        listings: resListings.count || 0,
        products: resProducts.count || 0,
        totalAds: (resListings.count || 0) + (resProducts.count || 0)
      };
    }
  });

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[32px] border border-zinc-100 shadow-xl shadow-zinc-200/50">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-orange-100 text-orange-600 text-[10px] font-black uppercase tracking-widest rounded-full">Portal do Anunciante</span>
          </div>
          <h1 className="text-4xl font-black text-zinc-900 tracking-tight uppercase">
            Olá, <span className="text-orange-600">{user?.email?.split('@')[0]}</span>
          </h1>
          <p className="text-zinc-500 font-medium">Gerencie seus anúncios de imóveis e produtos em um só lugar.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <Card className="bg-zinc-900 text-white border-0 rounded-[24px] px-6 py-4 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/10 rounded-xl">
                <CreditCard className="w-6 h-6 text-orange-400" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Saldo Premium</p>
                <p className="text-2xl font-black tracking-tight">R$ 0,00</p>
              </div>
              <Button 
                size="icon" 
                className="bg-orange-600 hover:bg-orange-700 rounded-full h-8 w-8 ml-2"
                onClick={() => navigate("/anunciante/creditos")}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Anúncios Ativos", value: stats?.totalAds || 0, icon: Megaphone, color: "orange" },
          { label: "Visualizações", value: "0", icon: Eye, color: "blue" },
          { label: "Leads / Contatos", value: "0", icon: MessageSquare, color: "emerald" },
          { label: "CTR Médio", value: "0%", icon: TrendingUp, color: "purple" },
        ].map((stat, i) => (
          <Card key={i} className="border-0 shadow-lg shadow-zinc-200/40 rounded-[24px] overflow-hidden group hover:scale-[1.02] transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-2xl bg-${stat.color}-50 text-${stat.color}-600 group-hover:scale-110 transition-transform`}>
                  <stat.icon className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Tempo Real</span>
              </div>
              <div>
                <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-1">{stat.label}</p>
                <p className="text-3xl font-black text-zinc-900">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions & Empty State */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-0 shadow-xl shadow-zinc-200/40 rounded-[32px] overflow-hidden">
            <CardHeader className="p-8 border-b border-zinc-50 bg-white">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-black uppercase tracking-tight text-zinc-900">Meus Classificados</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-xl font-bold uppercase text-[10px] tracking-widest border-zinc-200">Ver Todos</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8 bg-zinc-50/30">
              <div className="flex flex-col items-center justify-center p-12 text-center space-y-6 border-2 border-dashed border-zinc-200 rounded-[24px] bg-white">
                <div className="w-20 h-20 rounded-full bg-orange-50 flex items-center justify-center">
                  <LayoutDashboard className="w-10 h-10 text-orange-500" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-black text-zinc-900 uppercase tracking-tight">Nenhum anúncio encontrado</h3>
                  <p className="text-zinc-500 max-w-sm font-medium">Você ainda não tem imóveis ou produtos sendo anunciados nesta conta.</p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <Button onClick={() => navigate("/imoveis")} className="bg-zinc-900 hover:bg-black text-white px-8 h-14 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-zinc-900/10 gap-2">
                    <Building2 className="w-5 h-5" /> Novo Imóvel
                  </Button>
                  <Button className="bg-orange-600 hover:bg-orange-700 text-white px-8 h-14 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-orange-600/10 gap-2">
                    <Package className="w-5 h-5" /> Novo Produto
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-0 shadow-xl shadow-zinc-200/40 rounded-[32px] bg-gradient-to-br from-orange-600 to-orange-500 text-white overflow-hidden p-8">
            <div className="space-y-6 relative z-10">
              <div className="p-3 bg-white/20 rounded-2xl w-fit">
                <Sparkles className="w-8 h-8 text-yellow-300" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black uppercase tracking-tight leading-tight">Impulsione seus resultados</h3>
                <p className="text-orange-100 font-medium">Contrate pacotes de destaque para aparecer no topo das buscas do Mercado Local.</p>
              </div>
              <Button 
                className="w-full bg-white text-orange-600 hover:bg-zinc-100 h-14 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg transition-all"
                onClick={() => navigate("/anunciante/creditos")}
              >
                Ver Planos Premium
              </Button>
            </div>
            <div className="absolute top-0 right-0 p-8 opacity-10 scale-150">
                <Megaphone className="w-32 h-32" />
            </div>
          </Card>

          <Card className="border-0 shadow-lg shadow-zinc-100 rounded-[24px] p-6 space-y-4">
             <h4 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Central de Ajuda</h4>
             <div className="space-y-3">
               {[
                 "Como anunciar um imóvel?",
                 "Regras da plataforma",
                 "Dicas de fotografia",
                 "Falar com suporte"
               ].map((item, i) => (
                 <button key={i} className="w-full text-left p-4 rounded-xl hover:bg-zinc-50 transition-colors flex items-center justify-between group">
                    <span className="text-sm font-bold text-zinc-700">{item}</span>
                    <Plus className="w-4 h-4 text-zinc-300 group-hover:text-orange-500 group-hover:rotate-45 transition-all" />
                 </button>
               ))}
             </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
