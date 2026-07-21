import React, { useState } from "react";
import {
  Package,
  PlusCircle,
  UserCircle,
  CreditCard,
  ArrowRight,
  MessageSquare,
  Bike,
  Store as StoreIcon,
  Loader2,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { useAdvertiserAccountData } from "@/hooks/useAdvertiserAccountData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function AdvertiserOverviewCards() {
  const { data: account } = useAdvertiserAccountData();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [motoboyOpen, setMotoboyOpen] = useState(false);

  // Mensagens pendentes (leads + ofertas + pedidos)
  const { data: messagesCount = 0 } = useQuery({
    queryKey: ["overview-messages-count", user?.id],
    enabled: !!user?.id,
    refetchInterval: 15_000,
    queryFn: async () => {
      const storeIds: string[] = [];
      const { data: adv } = await (supabase.from("advertiser_accounts" as any).select("id").eq("user_id", user!.id).maybeSingle()) as any;
      if ((adv as any)?.id) storeIds.push((adv as any).id);
      const { data: ms } = await (supabase.from("merchant_stores" as any).select("id").eq("user_id", user!.id).maybeSingle()) as any;
      if ((ms as any)?.id) storeIds.push((ms as any).id);

      const [contactCount, discountCount, purchaseCount] = await Promise.all([
        (supabase.from("advertiser_contact_intentions" as any).select("id", { count: "exact", head: true }).eq("advertiser_user_id", user!.id).neq("status", "cancelled")) as any,
        storeIds.length > 0
          ? ((supabase.from("discount_requests" as any).select("id", { count: "exact", head: true }).in("store_id", storeIds)) as any)
          : { count: 0 },
        (ms as any)?.id
          ? ((supabase.from("purchase_intentions" as any).select("id", { count: "exact", head: true }).eq("store_id", (ms as any).id)) as any)
          : { count: 0 },
      ]);
      return (contactCount?.count ?? 0) + (discountCount?.count ?? 0) + (purchaseCount?.count ?? 0);
    },
  });

  // ── Produtos do anunciante pra o modal "Chamar Motoboy" ──
  const { data: storeProducts = [], isLoading: loadingProducts } = useQuery<any[]>({
    queryKey: ["motoboy-eligible-products", user?.id],
    enabled: !!user?.id && motoboyOpen,
    queryFn: async () => {
      const { data: adv } = await (supabase.from("advertiser_accounts" as any).select("id").eq("user_id", user!.id).maybeSingle()) as any;
      const accId = (adv as any)?.id;
      const { data: ms } = await (supabase.from("merchant_stores" as any).select("id").eq("user_id", user!.id).maybeSingle()) as any;
      const storeId = (ms as any)?.id;

      const out: any[] = [];

      if (accId) {
        const { data: advList } = await (supabase.from("advertiser_listings" as any)
          .select("id, title, price, cover_image_url, listing_status")
          .eq("advertiser_account_id", accId)) as any;
        for (const p of ((advList as any[]) || [])) {
          out.push({ id: p.id, title: p.title, price: p.price ?? 0, image: p.cover_image_url, source: "advertiser_listings" });
        }
      }

      if (storeId) {
        const { data: mktList } = await (supabase.from("merchant_marketing_products" as any)
          .select("id, title, price_label, image_url, is_active")
          .eq("merchant_store_id", storeId)) as any;
        for (const p of ((mktList as any[]) || [])) {
          const price = parseFloat(String(p.price_label || "0").replace(",", ".").replace(/[^\d.]/g, "")) || 0;
          out.push({ id: p.id, title: p.title, price, image: p.image_url, source: "merchant_marketing_products" });
        }
      }

      return out;
    },
  });

  const activeListings = account?.stats?.active_listings ?? 0;
  const credits = account?.stats?.available_credits ?? 0;
  const storeName = account?.full_name || account?.profile?.name || user?.email?.split("@")[0] || "Minha Loja";

  const selectProductForDelivery = (productId: string) => {
    setMotoboyOpen(false);
    navigate(`/anunciante/entregas/nova?product=${productId}`);
  };

  const actions: Array<{
    title: string;
    description: string;
    icon: React.ElementType;
    color: string;
    href?: string;
    stats?: string;
    isPrimary?: boolean;
    onClick?: () => void;
  }> = [
    {
      title: "MEUS PRODUTOS",
      description: "Gerencie seus produtos ativos e pausados.",
      icon: Package,
      color: "bg-orange-500",
      href: "/anunciante/meus-anuncios",
      stats: `${activeListings} Ativo${activeListings !== 1 ? 's' : ''}`,
    },
    {
      title: "CRIAR NOVO PRODUTO",
      description: "Publique um novo produto agora.",
      icon: PlusCircle,
      color: "bg-[#FF6A00]",
      href: "/anunciante/anuncios/novo",
      isPrimary: true,
    },
    {
      title: storeName.toUpperCase(),
      description: "Selecione um produto e chame um motoboy.",
      icon: Bike,
      color: "bg-emerald-500",
      onClick: () => setMotoboyOpen(true),
      stats: "Chamar Motoboy",
    },
    {
      title: "MINHA CONTA",
      description: "Edite seus dados e preferências.",
      icon: UserCircle,
      color: "bg-[#2A3038]",
      href: "/anunciante/conta",
    },
    {
      title: "CRÉDITOS / PLANOS",
      description: "Acompanhe seus créditos e assinaturas.",
      icon: CreditCard,
      color: "bg-emerald-600",
      href: "/anunciante/creditos",
      stats: `${credits.toLocaleString('pt-BR')} créditos`,
    },
    {
      title: "MENSAGENS / LEADS",
      description: "Gerencie perguntas e intenções de contato.",
      icon: MessageSquare,
      color: "bg-[#2A3038]",
      href: "/anunciante/mensagens",
      stats: messagesCount > 0 ? `${messagesCount} mensage${messagesCount !== 1 ? 'ns' : 'm'}` : "Sem mensagens",
    },
  ];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
        {actions.map((action) => {
          const cardInner = (
            <Card className={cn(
              "border border-[#2A3038] shadow-lg shadow-black/30 rounded-[28px] overflow-hidden hover:-translate-y-1 transition-all duration-300 w-full flex flex-col h-full cursor-pointer",
              action.isPrimary ? "bg-[#0D0F12]" : "bg-[#1B1F24]"
            )}>
              <CardContent className="p-8 space-y-4 flex flex-col h-full">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center p-0.5 shadow-lg shadow-black/5 transition-all group-hover:scale-110",
                  action.isPrimary ? "bg-orange-500 text-white" : `${action.color} text-white`
                )}>
                  <action.icon className="w-6 h-6" />
                </div>

                <div className="space-y-1 flex-1">
                   <h3 className="font-black text-xs uppercase tracking-[0.1em] text-[#F5F7FA] line-clamp-1">{action.title}</h3>
                   <p className="text-[11px] font-bold leading-relaxed text-[#A7B0BE]">
                      {action.description}
                   </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-[#2A3038] group-hover:border-[#FF6A00]/20 transition-all mt-auto">
                   {action.stats ? (
                     <span className="text-[10px] font-black uppercase tracking-widest text-[#FF6A00]">{action.stats}</span>
                   ) : (
                     <span className="text-[10px] font-black uppercase tracking-widest text-[#A7B0BE]">Gerenciar</span>
                   )}
                   <ArrowRight className="w-4 h-4 text-[#A7B0BE] transition-transform group-hover:translate-x-1 group-hover:text-[#FF6A00]" />
                </div>
              </CardContent>
            </Card>
          );

          if (action.onClick) {
            return (
              <button key={action.title} onClick={action.onClick} className="group flex h-full text-left">
                {cardInner}
              </button>
            );
          }
          return (
            <Link key={action.title} to={action.href!} className="group flex h-full">
              {cardInner}
            </Link>
          );
        })}
      </div>

      {/* Modal: Chamar Motoboy → escolher produto */}
      <Dialog open={motoboyOpen} onOpenChange={setMotoboyOpen}>
        <DialogContent className="sm:max-w-lg bg-white max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-zinc-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                <Bike className="w-4 h-4" />
              </span>
              Chamar Motoboy — {storeName}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            <p className="text-sm text-zinc-500 mb-4">
              Escolha um produto da sua loja para enviar via motoboy:
            </p>

            {loadingProducts ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              </div>
            ) : storeProducts.length === 0 ? (
              <div className="py-12 text-center text-zinc-400 text-xs font-bold uppercase tracking-widest space-y-3">
                <StoreIcon className="w-10 h-10 text-zinc-300 mx-auto" />
                <p>Nenhum produto cadastrado.</p>
                <Button
                  variant="outline"
                  onClick={() => { setMotoboyOpen(false); navigate('/anunciante/anuncios/novo'); }}
                >
                  Criar Anúncio
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {storeProducts.map((p) => (
                  <button
                    key={`${p.source}-${p.id}`}
                    onClick={() => selectProductForDelivery(p.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-zinc-200 hover:border-emerald-400 hover:bg-emerald-50 transition-all text-left group"
                  >
                    <div className="w-14 h-14 rounded-lg bg-zinc-100 overflow-hidden shrink-0 flex items-center justify-center">
                      {p.image ? (
                        <img
                          src={p.image}
                          alt={p.title}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <Package className="w-6 h-6 text-zinc-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-zinc-900 line-clamp-1 group-hover:text-emerald-700">{p.title}</p>
                      <p className="text-xs text-zinc-500 font-medium">{formatCurrencyBRL(p.price)}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-zinc-100 flex justify-end">
            <Button variant="outline" onClick={() => setMotoboyOpen(false)}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
