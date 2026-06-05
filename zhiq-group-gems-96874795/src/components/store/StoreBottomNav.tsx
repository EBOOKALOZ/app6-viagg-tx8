import { Link, useLocation } from "react-router-dom";
import { Home, Store, MessageSquare, Megaphone } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function StoreBottomNav() {
  const location = useLocation();
  const { user } = useAuth();

  // Conta ofertas pendentes (discount_requests + arremate offers) para o anunciante atual
  const { data: pendingOffers = 0 } = useQuery({
    queryKey: ["bottom-nav-pending-offers", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const storeIds: string[] = [];
      const { data: adv } = await (supabase.from("advertiser_accounts") as any)
        .select("id").eq("user_id", user!.id).maybeSingle();
      if ((adv as any)?.id) storeIds.push((adv as any).id);
      const { data: ms } = await (supabase.from("merchant_stores") as any)
        .select("id").eq("user_id", user!.id).maybeSingle();
      if ((ms as any)?.id) storeIds.push((ms as any).id);
      if (storeIds.length === 0) return 0;
      const { count } = await (supabase.from("discount_requests") as any)
        .select("id", { count: "exact", head: true })
        .in("store_id", storeIds)
        .eq("status", "pending");
      return count || 0;
    },
  });

  const navItems = [
    {
      label: "Início",
      icon: <Home className="w-5 h-5 mb-1" />,
      path: "/mercado",
    },
    {
      label: "Minha Loja",
      icon: <Store className="w-5 h-5 mb-1" />,
      path: "/loja/minha-loja",
    },
    {
      label: "Mensagens",
      icon: <MessageSquare className="w-5 h-5 mb-1" />,
      path: "/anunciante/mensagens",
    },
    {
      label: "Anunciar",
      icon: <Megaphone className="w-5 h-5 mb-1" />,
      path: "/loja/campanhas",
    },
    {
        label: "Mais",
        icon: <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="w-5 h-5 mb-1" />,
        path: "/anunciante/painel",
      },
  ];

  return (
    <div className="fixed bottom-0 left-0 w-full bg-zinc-950/95 backdrop-blur-md border-t border-yellow-500/10 text-zinc-400 z-50 md:hidden pb-safe">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`relative flex flex-col items-center justify-center w-full h-full text-xs font-medium transition-colors ${
                isActive ? "text-yellow-500" : "hover:text-zinc-200"
              }`}
            >
              <div className="relative">
                {item.icon}
                {item.label === "Mensagens" && pendingOffers > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-lg animate-pulse">
                    {pendingOffers > 99 ? "99+" : pendingOffers}
                  </span>
                )}
              </div>
              <span className={isActive ? "text-yellow-500" : ""}>{item.label}</span>
              {isActive && (
                <span className="absolute top-0 w-8 h-[2px] bg-yellow-500 rounded-b-full shadow-[0_0_8px_rgba(234,179,8,0.8)]" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
