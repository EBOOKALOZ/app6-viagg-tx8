import { Link, useLocation } from "react-router-dom";
import { Home, Store, MessageSquare, Megaphone, Tag, Package, Headphones } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function StoreBottomNav() {
  const location = useLocation();
  const { user } = useAuth();

  // Resolve os ids do anunciante / loja do usuário logado (cacheado)
  const { data: ids } = useQuery({
    queryKey: ["bottom-nav-ids", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const out: { advId: string | null; storeId: string | null; storeIds: string[] } = {
        advId: null, storeId: null, storeIds: [],
      };
      const { data: adv } = await (supabase.from("advertiser_accounts") as any)
        .select("id").eq("user_id", user!.id).limit(1).maybeSingle();
      if ((adv as any)?.id) { out.advId = (adv as any).id; out.storeIds.push(out.advId!); }
      // Busca TODAS as lojas do usuário para evitar PGRST116 e cobrir multi-loja
      const { data: msList } = await (supabase.from("merchant_stores") as any)
        .select("id").eq("user_id", user!.id);
      if (Array.isArray(msList) && msList.length > 0) {
        out.storeId = msList[0].id;
        msList.forEach((s: any) => { if (s?.id && !out.storeIds.includes(s.id)) out.storeIds.push(s.id); });
      }
      return out;
    },
  });

  // Conta de OFERTAS pendentes (discount_requests)
  const { data: pendingOffers = 0 } = useQuery({
    queryKey: ["bottom-nav-pending-offers", user?.id, ids?.storeIds],
    enabled: !!user?.id && (ids?.storeIds?.length ?? 0) > 0,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { count } = await (supabase.from("discount_requests") as any)
        .select("id", { count: "exact", head: true })
        .in("store_id", ids!.storeIds)
        .eq("status", "pending");
      return count || 0;
    },
  });

  // Conta de MENSAGENS pendentes (leads bloqueados)
  const { data: pendingMessages = 0 } = useQuery({
    queryKey: ["bottom-nav-pending-messages", user?.id],
    enabled: !!user?.id,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { count } = await (supabase.from("advertiser_contact_intentions" as any)
        .select("id", { count: "exact", head: true })
        .eq("advertiser_user_id", user!.id)
        .neq("status", "unlocked")
        .neq("status", "cancelled")) as any;
      return count ?? 0;
    },
  });

  // Conta de PEDIDOS novos (purchase_intentions) — todas as lojas do usuário
  const { data: pendingOrders = 0 } = useQuery({
    queryKey: ["bottom-nav-pending-orders", user?.id, ids?.storeIds],
    enabled: !!user?.id && (ids?.storeIds?.length ?? 0) > 0,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { count } = await (supabase.from("purchase_intentions" as any)
        .select("id", { count: "exact", head: true })
        .in("store_id", ids!.storeIds)
        .eq("status", "new")) as any;
      return count ?? 0;
    },
  });

  const navItems = [
    {
      label: "Início",
      icon: <Home className="w-[18px] h-[18px] mb-1" />,
      path: "/mercado",
      badge: 0,
    },
    {
      label: "Minha Loja",
      icon: <Store className="w-[18px] h-[18px] mb-1" />,
      path: "/loja/minha-loja",
      badge: 0,
    },
    {
      label: "Mensagens",
      icon: <MessageSquare className="w-[18px] h-[18px] mb-1" />,
      path: "/anunciante/mensagens",
      badge: pendingMessages,
    },
    {
      label: "Pedidos",
      icon: <Package className="w-[18px] h-[18px] mb-1" />,
      path: "/anunciante/pedidos",
      badge: pendingOrders,
    },
    {
      label: "Anunciar",
      icon: <Megaphone className="w-[18px] h-[18px] mb-1" />,
      path: "/loja/campanhas",
      badge: 0,
    },
    {
      label: "Ofertas",
      icon: <Tag className="w-[18px] h-[18px] mb-1" />,
      path: "/anunciante/ofertas-recebidas",
      badge: pendingOffers,
    },
    {
      label: "Suporte",
      icon: <Headphones className="w-[18px] h-[18px] mb-1" />,
      path: "/anunciante/suporte",
      badge: 0,
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 w-full bg-zinc-950/95 backdrop-blur-md border-t border-yellow-500/10 text-zinc-400 z-50 md:hidden pb-safe">
      <div className="flex justify-around items-center h-[58px]">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`relative flex flex-col items-center justify-center w-full h-full text-[11px] font-medium transition-colors ${
                isActive ? "text-yellow-500" : "hover:text-zinc-200"
              }`}
            >
              <div className="relative">
                {item.icon}
                {item.badge > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center shadow-lg animate-pulse">
                    {item.badge > 99 ? "99+" : item.badge}
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
