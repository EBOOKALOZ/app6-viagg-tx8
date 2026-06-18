/**
 * RealEstateCreditReportCard — Relatório de créditos de IMÓVEIS.
 *
 * Mostra, em um único card:
 *  • Débitos de NAVEGAÇÃO (cliques no anúncio cobrados) — real_estate_credit_ledger
 *    com metadata.event = 'listing_click'.
 *  • Compras atuais — real_estate_credit_purchases (pacotes adquiridos).
 *
 * Tema escuro, alinhado ao restante da página de Gestão e Pacotes.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingDown, PackageCheck, Coins, MousePointerClick, Loader2, Wallet } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn, formatCurrencyBRL } from "@/lib/utils";

const fmtDate = (d: string) => format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

export function RealEstateCreditReportCard() {
  const { user } = useAuth();

  // Saldo atual (pode ficar negativo = dívida acumulada).
  const { data: balance = 0 } = useQuery({
    queryKey: ["re-report-balance", user?.id],
    enabled: !!user?.id,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data } = await (supabase.from("real_estate_credit_balances") as any)
        .select("available_credits")
        .eq("owner_user_id", user!.id)
        .maybeSingle();
      return Number((data as any)?.available_credits ?? 0);
    },
  });

  // Débitos de navegação (cliques cobrados) — ledger.
  const { data: debits = [], isLoading: debitsLoading } = useQuery({
    queryKey: ["re-report-debits", user?.id],
    enabled: !!user?.id,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data } = await (supabase.from("real_estate_credit_ledger") as any)
        .select("id, entry_type, amount, balance_after, listing_id, metadata, created_at")
        .eq("owner_user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return (data || []).filter(
        (e: any) => e?.metadata?.event === "listing_click" || e?.entry_type === "debit_unlock"
      );
    },
  });

  // Compras de pacotes de imóveis.
  const { data: purchases = [], isLoading: purchasesLoading } = useQuery({
    queryKey: ["re-report-purchases", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await (supabase.from("real_estate_credit_purchases") as any)
        .select("id, credits_total, amount_brl, payment_status, created_at, paid_at")
        .eq("owner_user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  const totals = useMemo(() => {
    const navConsumed = (debits || [])
      .filter((e: any) => e?.metadata?.event === "listing_click")
      .reduce((s: number, e: any) => s + Math.abs(Number(e.amount || 0)), 0);
    const unlocksConsumed = (debits || [])
      .filter((e: any) => e?.entry_type === "debit_unlock")
      .reduce((s: number, e: any) => s + Math.abs(Number(e.amount || 0)), 0);
    const paid = (purchases || []).filter((p: any) =>
      ["paid", "approved", "confirmed"].includes(String(p.payment_status || "").toLowerCase())
    );
    const creditsBought = paid.reduce((s: number, p: any) => s + Number(p.credits_total || 0), 0);
    const valuePaid = paid.reduce((s: number, p: any) => s + Number(p.amount_brl || 0), 0);
    return { navConsumed, unlocksConsumed, creditsBought, valuePaid, paidCount: paid.length };
  }, [debits, purchases]);

  const loading = debitsLoading || purchasesLoading;

  const labelForDebit = (e: any) =>
    e?.metadata?.event === "listing_click" ? "Clique no anúncio (navegação)"
    : e?.entry_type === "debit_unlock" ? "Desbloqueio de contato"
    : "Consumo";

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-3xl font-black text-[#F5F7FA] tracking-tighter uppercase flex items-center gap-3">
          <div className="p-3 bg-[#0D0F12] rounded-2xl shadow-xl shadow-black/30">
            <TrendingDown className="w-6 h-6 text-[#FF6A00]" />
          </div>
          Relatório de Créditos
        </h2>
        <p className="text-[#A7B0BE] font-bold uppercase text-[10px] tracking-[0.2em] ml-16">
          Débitos de navegação e compras de pacotes (imóveis)
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-[#1B1F24] border-[#2A3038]">
          <CardContent className="p-5 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#A7B0BE] flex items-center gap-1.5">
              <MousePointerClick className="w-3.5 h-3.5 text-amber-400" /> Navegação (cliques)
            </p>
            <p className="text-2xl font-black text-amber-400 tabular-nums">− {totals.navConsumed} cr</p>
          </CardContent>
        </Card>
        <Card className="bg-[#1B1F24] border-[#2A3038]">
          <CardContent className="p-5 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#A7B0BE] flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-red-400" /> Desbloqueios
            </p>
            <p className="text-2xl font-black text-red-400 tabular-nums">− {totals.unlocksConsumed} cr</p>
          </CardContent>
        </Card>
        <Card className="bg-[#1B1F24] border-[#2A3038]">
          <CardContent className="p-5 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#A7B0BE] flex items-center gap-1.5">
              <PackageCheck className="w-3.5 h-3.5 text-emerald-400" /> Comprado ({totals.paidCount})
            </p>
            <p className="text-2xl font-black text-emerald-400 tabular-nums">+ {totals.creditsBought} cr</p>
            <p className="text-[11px] text-[#A7B0BE] font-medium">{formatCurrencyBRL(totals.valuePaid)}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#1B1F24] border-[#2A3038]">
          <CardContent className="p-5 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#A7B0BE] flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-[#FF6A00]" /> Saldo atual
            </p>
            <p className={cn("text-2xl font-black tabular-nums", balance < 0 ? "text-red-400" : "text-[#F5F7FA]")}>
              {balance} cr
            </p>
            {balance < 0 && <p className="text-[11px] text-red-400/80 font-medium">dívida a abater</p>}
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 px-4 text-[#A7B0BE]">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando relatório...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Débitos de navegação / consumo */}
          <div className="space-y-3">
            <p className="text-[11px] font-black uppercase tracking-widest text-[#A7B0BE] flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-400" /> Débitos (navegação e desbloqueios)
            </p>
            {debits.length === 0 ? (
              <div className="bg-[#1B1F24] border-2 border-dashed border-[#2A3038] rounded-2xl p-8 text-center text-[#A7B0BE] text-xs font-bold uppercase tracking-widest">
                Nenhum débito registrado ainda
              </div>
            ) : (
              <div className="bg-[#1B1F24] border border-[#2A3038] rounded-2xl overflow-hidden divide-y divide-[#2A3038]">
                {debits.slice(0, 30).map((e: any) => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                      <TrendingDown className="w-4 h-4 text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#F5F7FA] truncate">{labelForDebit(e)}</p>
                      <p className="text-[11px] text-[#A7B0BE]">{fmtDate(e.created_at)}</p>
                    </div>
                    <span className="text-sm font-black text-red-400 tabular-nums shrink-0">
                      − {Math.abs(Number(e.amount || 0))} cr
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Compras */}
          <div className="space-y-3">
            <p className="text-[11px] font-black uppercase tracking-widest text-[#A7B0BE] flex items-center gap-2">
              <Coins className="w-4 h-4 text-emerald-400" /> Compras de pacotes
            </p>
            {purchases.length === 0 ? (
              <div className="bg-[#1B1F24] border-2 border-dashed border-[#2A3038] rounded-2xl p-8 text-center text-[#A7B0BE] text-xs font-bold uppercase tracking-widest">
                Nenhuma compra registrada ainda
              </div>
            ) : (
              <div className="bg-[#1B1F24] border border-[#2A3038] rounded-2xl overflow-hidden divide-y divide-[#2A3038]">
                {purchases.slice(0, 30).map((p: any) => {
                  const isPaid = ["paid", "approved", "confirmed"].includes(String(p.payment_status || "").toLowerCase());
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <PackageCheck className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[#F5F7FA]">+{p.credits_total} créditos</p>
                        <p className="text-[11px] text-[#A7B0BE]">
                          {fmtDate(p.paid_at || p.created_at)}
                          {!isPaid && <span className="ml-2 text-amber-400 uppercase font-black">{p.payment_status}</span>}
                        </p>
                      </div>
                      <span className="text-sm font-black text-emerald-400 tabular-nums shrink-0">
                        {formatCurrencyBRL(Number(p.amount_brl || 0))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default RealEstateCreditReportCard;
