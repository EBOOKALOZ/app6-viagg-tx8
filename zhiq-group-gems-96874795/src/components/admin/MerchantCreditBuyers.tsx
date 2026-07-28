import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Store, Wallet, Bike, MapPin, Calendar } from "lucide-react";

interface StoreBuyer {
  store_id: string;
  store_name: string;
  owner_name: string | null;
  email: string | null;
  cidade: string | null;
  estado: string | null;
  total_purchases: number;
  total_amount_paid: number;
  total_credits_bought: number;
  last_purchase_at: string | null;
  last_package_name: string | null;
}

export function MerchantCreditBuyers() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-merchant-credit-buyers"],
    queryFn: async () => {
      const { data: purchases, error } = await supabase.from("credit_purchases")
        .select("store_id, product_name, amount_paid, credits_granted, status, created_at")
        .eq("status", "paid")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!purchases || purchases.length === 0) return { buyers: [], total: 0 };

      const storeIds = [...new Set(purchases.map((p: Record<string, unknown>) => p.store_id).filter(Boolean))] as string[];

      const { data: stores } = storeIds.length > 0
        ? await supabase.from("merchant_stores")
            .select("id, user_id, nome_loja, store_name, cidade, city, estado, region")
            .in("id", storeIds)
        : { data: [] as Record<string, unknown>[] };

      const userIds = [...new Set((stores || []).map((s: Record<string, unknown>) => s.user_id).filter(Boolean))] as string[];

      const { data: profiles } = userIds.length > 0
        ? await supabase.from("profiles")
            .select("id, full_name, name, email")
            .in("id", userIds)
        : { data: [] as Record<string, unknown>[] };

      const storesMap: Record<string, Record<string, unknown>> = {};
      (stores || []).forEach((s: Record<string, unknown>) => { storesMap[s.id as string] = s; });

      const profilesMap: Record<string, Record<string, unknown>> = {};
      (profiles || []).forEach((p: Record<string, unknown>) => { profilesMap[p.id as string] = p; });

      const grouped = new Map<string, StoreBuyer>();
      purchases.forEach((p: Record<string, unknown>) => {
        const sid = p.store_id as string;
        if (!sid) return;
        const store = storesMap[sid] || {};
        const profile = profilesMap[store.user_id as string] || {};

        if (!grouped.has(sid)) {
          grouped.set(sid, {
            store_id: sid,
            email: profile.email || null,
            cidade: store.cidade || store.city || null,
            estado: store.estado || store.region || null,
            total_purchases: 0,
            total_amount_paid: 0,
            total_credits_bought: 0,
            last_purchase_at: null,
            last_package_name: null,
          });
        }
        const b = grouped.get(sid)!;
        b.total_purchases += 1;
        b.total_amount_paid += Number(p.amount_paid || 0);
        b.total_credits_bought += Number(p.credits_granted || 0);
        if (!b.last_purchase_at || new Date(p.created_at) > new Date(b.last_purchase_at)) {
          b.last_purchase_at = p.created_at;
          b.last_package_name = p.product_name || null;
        }
      });

      const buyers = Array.from(grouped.values()).sort(
        (a, b) => b.total_amount_paid - a.total_amount_paid
      );
      const total = buyers.reduce((s, b) => s + b.total_amount_paid, 0);
      return { buyers, total };
    },
    staleTime: 9_000,
    refetchInterval: 9_000,
  });

  const formatBRL = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const formatDate = (iso: string | null) => {
    if (!iso) return "-";
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2 text-gray-900">
            <Bike className="h-5 w-5 text-primary" />
            Lojas que compraram pacotes de crédito (saldo para pagar motoboy)
          </CardTitle>
          {!isLoading && data && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-50 border border-emerald-200">
              <Wallet className="h-3.5 w-3.5 text-emerald-700" />
              <span className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold">
                Dinheiro recebido das lojas
              </span>
              <span className="text-base font-black text-emerald-700 tabular-nums">
                {formatBRL(data.total)}
              </span>
              <span className="text-[10px] text-emerald-600/80">
                ({data.buyers.length} {data.buyers.length === 1 ? "loja" : "lojas"})
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : data && data.buyers.length > 0 ? (
          <div className="space-y-3">
            {data.buyers.map((b, idx) => (
              <div
                key={b.store_id}
                className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg font-black text-gray-900 w-7 text-right tabular-nums shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Store className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-bold text-gray-900 truncate">{b.store_name}</span>
                      {idx === 0 && (
                        <Badge className="bg-amber-500 text-white border-0 text-[10px] font-bold">
                          Maior comprador
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {b.owner_name && <span>{b.owner_name}</span>}
                      {b.email && <span className="text-primary/70">{b.email}</span>}
                      {(b.cidade || b.estado) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {b.cidade}{b.estado ? ` - ${b.estado}` : ""}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="text-center p-2 rounded-md bg-muted/30">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Compras</p>
                        <p className="font-bold tabular-nums text-gray-900">{b.total_purchases}</p>
                      </div>
                      <div className="text-center p-2 rounded-md bg-emerald-50">
                        <p className="text-[10px] text-emerald-700 uppercase font-bold">Total Pago</p>
                        <p className="font-bold tabular-nums text-emerald-700">
                          {formatBRL(b.total_amount_paid)}
                        </p>
                      </div>
                      <div className="text-center p-2 rounded-md bg-muted/30">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Créditos</p>
                        <p className="font-bold tabular-nums text-gray-900">
                          {b.total_credits_bought.toLocaleString("pt-BR")}
                        </p>
                      </div>
                      <div className="text-center p-2 rounded-md bg-muted/30">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold flex items-center justify-center gap-1">
                          <Calendar className="h-3 w-3" /> Última
                        </p>
                        <p className="font-bold tabular-nums text-gray-900 text-sm">
                          {formatDate(b.last_purchase_at)}
                        </p>
                        {b.last_package_name && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {b.last_package_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma loja comprou crédito ainda.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
