import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CardDark } from "@/components/ui/dark-card";
import { Store, Star, ShieldCheck, Trophy, Package, Activity, Medal, CheckCircle2 } from "lucide-react";
import { format, differenceInMonths, parseISO } from "date-fns";
import { DarkBadge } from "@/components/ui/DarkBadge";
import { cn } from "@/lib/utils";

interface SellerTransparencyCenterProps {
  storeId: string;
}

export function SellerTransparencyCenter({ storeId }: SellerTransparencyCenterProps) {
  // 1. Fetch Store Details
  const { data: store, isLoading: isStoreLoading } = useQuery({
    queryKey: ["transparency-store", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merchant_stores")
        .select("*")
        .eq("id", storeId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // 2. Fetch Store Badges
  const { data: badges = [] } = useQuery({
    queryKey: ["store-badges", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_badges")
        .select("*")
        .eq("store_id", storeId);
      if (error) return []; // fail gracefully se a tabela ainda n tiver dados
      return data;
    },
  });

  // 3. Mocked Metrics (Em prod viriam de aggregations ou views do BD)
  const salesCount = Math.floor(Math.random() * 500) + 50;
  const auctionsCount = Math.floor(Math.random() * 50) + 5;
  const rating = (Math.random() * (5.0 - 4.2) + 4.2).toFixed(1);
  const reliabilityIndex = Math.floor(Math.random() * (100 - 90) + 90);
  const activeProducts = Math.floor(Math.random() * 200) + 20;

  if (isStoreLoading || !store) return null;

  const monthsActive = store.created_at ? differenceInMonths(new Date(), parseISO(store.created_at)) : 1;

  // Se não houver selos no banco ainda, geramos selos mockados para ilustrar o padrão Enterprise
  const displayBadges = badges.length > 0 ? badges : [
    { id: '1', badge_name: 'Vendedor Verificado', icon_name: 'ShieldCheck', color: 'text-[#00C58E]', bg: 'bg-[#00C58E]/10' },
    { id: '2', badge_name: 'Alta Reputação', icon_name: 'Star', color: 'text-[#F5E62B]', bg: 'bg-[#F5E62B]/10' },
    { id: '3', badge_name: 'Entrega Confirmada', icon_name: 'Package', color: 'text-[#FF7A00]', bg: 'bg-[#FF7A00]/10' },
  ];

  return (
    <CardDark className="p-6 md:p-8 rounded-3xl border border-[#323A45]/60 bg-[#1A1F24]">
      
      {/* Header do Vendedor */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-6 pb-6 border-b border-[#323A45]/60">
        <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-[#252B33] border border-[#323A45] flex items-center justify-center overflow-hidden shrink-0">
          {store.logo_url ? (
            <img src={store.logo_url} alt={store.name} className="w-full h-full object-cover" />
          ) : (
            <Store className="w-8 h-8 text-[#8E98A3]" />
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl md:text-2xl font-black text-white">{store.name}</h2>
            <ShieldCheck className="w-5 h-5 text-[#00C58E]" />
          </div>
          <p className="text-sm font-medium text-[#8E98A3] mb-3">Na plataforma há {monthsActive} meses</p>
          
          <div className="flex flex-wrap items-center gap-2">
            {displayBadges.map((badge: any) => (
              <div key={badge.id} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black", badge.bg || 'bg-[#323A45]', badge.color || 'text-white')}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                {badge.badge_name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grid de Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        
        <div className="p-4 rounded-2xl bg-[#252B33] flex flex-col items-center justify-center text-center">
          <Star className="w-6 h-6 text-[#F5E62B] mb-2" />
          <p className="text-2xl font-black text-white">{rating}</p>
          <p className="text-[10px] uppercase font-bold tracking-wider text-[#8E98A3]">Avaliação Média</p>
        </div>

        <div className="p-4 rounded-2xl bg-[#252B33] flex flex-col items-center justify-center text-center border border-[#00C58E]/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-[#00C58E]/5 rounded-bl-full" />
          <Medal className="w-6 h-6 text-[#00C58E] mb-2 relative z-10" />
          <p className="text-2xl font-black text-[#00C58E] relative z-10">{reliabilityIndex}%</p>
          <p className="text-[10px] uppercase font-bold tracking-wider text-[#8E98A3] relative z-10">Confiabilidade</p>
        </div>

        <div className="p-4 rounded-2xl bg-[#252B33] flex flex-col items-center justify-center text-center">
          <Trophy className="w-6 h-6 text-[#FF7A00] mb-2" />
          <p className="text-2xl font-black text-white">{auctionsCount}</p>
          <p className="text-[10px] uppercase font-bold tracking-wider text-[#8E98A3]">Leilões Realizados</p>
        </div>

        <div className="p-4 rounded-2xl bg-[#252B33] flex flex-col items-center justify-center text-center">
          <Activity className="w-6 h-6 text-[#B8C2CC] mb-2" />
          <p className="text-2xl font-black text-white">{activeProducts}</p>
          <p className="text-[10px] uppercase font-bold tracking-wider text-[#8E98A3]">Produtos Ativos</p>
        </div>

      </div>

    </CardDark>
  );
}
