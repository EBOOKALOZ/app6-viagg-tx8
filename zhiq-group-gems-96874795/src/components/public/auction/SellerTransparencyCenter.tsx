import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CardDark } from "@/components/ui/dark-card";
import { Store, ShieldCheck, Trophy, CheckCircle2 } from "lucide-react";
import { differenceInMonths, parseISO } from "date-fns";
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
        .select("nome_loja, logo_url, created_at")
        .eq("id", storeId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // 2. Fetch Store Badges (só exibidos se realmente existirem no banco)
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

  // 3. Leilões realizados — contagem REAL (encerrados/vendidos) na
  // própria loja. Avaliação, confiabilidade e "produtos ativos" não têm
  // fonte no banco hoje — omitidos em vez de fabricados.
  const { data: auctionsCount = 0 } = useQuery({
    queryKey: ["transparency-auctions-count", storeId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("auction_listings")
        .select("id", { count: "exact", head: true })
        .eq("store_id", storeId)
        .in("status", ["ended", "sold"]);
      if (error) return 0;
      return count || 0;
    },
    enabled: !!storeId,
  });

  if (isStoreLoading || !store) return null;

  const monthsActive = store.created_at ? differenceInMonths(new Date(), parseISO(store.created_at)) : 1;

  return (
    <CardDark className="p-6 md:p-8 rounded-3xl border border-[#323A45]/60 bg-[#1A1F24]">

      {/* Header do Vendedor */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-6 pb-6 border-b border-[#323A45]/60">
        <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-[#252B33] border border-[#323A45] flex items-center justify-center overflow-hidden shrink-0">
          {store.logo_url ? (
            <img src={store.logo_url} alt={store.nome_loja} className="w-full h-full object-cover" />
          ) : (
            <Store className="w-8 h-8 text-[#8E98A3]" />
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl md:text-2xl font-black text-white">{store.nome_loja}</h2>
            <ShieldCheck className="w-5 h-5 text-[#00C58E]" />
          </div>
          <p className="text-sm font-medium text-[#8E98A3] mb-3">Na plataforma há {monthsActive} meses</p>

          {badges.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {badges.map((badge: any) => (
                <div key={badge.id} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black", badge.bg || 'bg-[#323A45]', badge.color || 'text-white')}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {badge.badge_name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Métricas reais */}
      <div className="grid grid-cols-1 gap-4 mt-6 max-w-[240px]">
        <div className="p-4 rounded-2xl bg-[#252B33] flex flex-col items-center justify-center text-center">
          <Trophy className="w-6 h-6 text-[#FF7A00] mb-2" />
          <p className="text-2xl font-black text-white">{auctionsCount}</p>
          <p className="text-[10px] uppercase font-bold tracking-wider text-[#8E98A3]">Leilões Realizados</p>
        </div>
      </div>

    </CardDark>
  );
}
