import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Users, Search } from "lucide-react";
import type { AdminCreditBalance, AdminLedgerEntry } from "@/hooks/useAdminCredits";

interface Props { data: any; }

export function AdminCreditsBalances({ data }: Props) {
  const { balances, ledger } = data;
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AdminCreditBalance | null>(null);

  const filtered = balances.filter((b: AdminCreditBalance) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (b.store_name || "").toLowerCase().includes(s)
      || (b.user_email || "").toLowerCase().includes(s)
      || (b.user_name || "").toLowerCase().includes(s);
  });

  const selectedLedger = selected
    ? ledger.filter((e: AdminLedgerEntry) => e.store_id === selected.store_id).slice(0, 50)
    : [];

  const getHealthStatus = (b: AdminCreditBalance) => {
    const bal = b.balance || b.available_credits;
    if (bal < 0) return { label: "Crítico", color: "bg-red-100 text-red-700 border-red-300" };
    if (bal === 0) return { label: "Zerado", color: "bg-amber-100 text-amber-700 border-amber-300" };
    if (bal <= 5) return { label: "Baixo", color: "bg-orange-100 text-orange-700 border-orange-300" };
    return { label: "Saudável", color: "bg-emerald-100 text-emerald-700 border-emerald-300" };
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <Card className="shadow-sm border-0">
        <CardContent className="p-4 flex gap-3 items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar por lojista, loja ou e-mail…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
          </div>
          <Badge variant="secondary" className="text-xs">{filtered.length} lojistas</Badge>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-md border-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {["Lojista", "Loja", "E-mail", "Saldo", "Comprado", "Consumido", "Assinatura", "Últ. Consumo", "Últ. Recarga", "Saúde"].map(h => (
                  <th key={h} className="text-left p-3 font-semibold text-xs text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((b: AdminCreditBalance) => {
                const health = getHealthStatus(b);
                return (
                  <tr key={b.id} className="border-b hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setSelected(b)}>
                    <td className="p-3 font-medium">{b.user_name || "—"}</td>
                    <td className="p-3">{b.store_name}</td>
                    <td className="p-3 text-xs text-muted-foreground">{b.user_email}</td>
                    <td className="p-3 font-mono font-bold text-right">
                      <span className={(b.balance || b.available_credits) <= 0 ? "text-red-600" : "text-emerald-600"}>
                        {b.balance || b.available_credits}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-right text-blue-600">{b.total_earned}</td>
                    <td className="p-3 font-mono text-right text-red-500">{b.total_spent || b.consumed_credits}</td>
                    <td className="p-3 text-center">
                      {b.subscription_status === "active"
                        ? <Badge className="text-[10px] bg-emerald-100 text-emerald-700">Ativa</Badge>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{b.last_debit_at ? new Date(b.last_debit_at).toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{b.last_credit_at ? new Date(b.last_credit_at).toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="p-3"><Badge className={`text-[10px] ${health.color}`}>{health.label}</Badge></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Nenhum lojista encontrado</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail Drawer */}
      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {selected.store_name}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Saldo Atual", value: selected.balance || selected.available_credits, color: "text-emerald-600" },
                    { label: "Total Comprado", value: selected.total_earned, color: "text-blue-600" },
                    { label: "Total Consumido", value: selected.total_spent || selected.consumed_credits, color: "text-red-500" },
                    { label: "Reservado", value: selected.reserved_credits, color: "text-amber-600" },
                  ].map(kpi => (
                    <Card key={kpi.label} className="border shadow-sm">
                      <CardContent className="p-3">
                        <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                        <p className={`text-xl font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Ledger Extract */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Extrato de Créditos</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-80 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/30 sticky top-0">
                          <tr>
                            {["Data", "Tipo", "Qtd", "Saldo", "Motivo"].map(h => (
                              <th key={h} className="text-left p-2 font-semibold text-muted-foreground">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedLedger.map((e: AdminLedgerEntry) => {
                            const isCredit = e.entry_type === "credit" || (e.credits > 0);
                            return (
                              <tr key={e.id} className="border-b">
                                <td className="p-2 text-muted-foreground">{new Date(e.created_at).toLocaleDateString("pt-BR")}</td>
                                <td className="p-2">
                                  <Badge className={`text-[9px] ${isCredit ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                    {isCredit ? "Crédito" : "Débito"}
                                  </Badge>
                                </td>
                                <td className={`p-2 font-mono font-bold ${isCredit ? "text-emerald-600" : "text-red-500"}`}>
                                  {isCredit ? "+" : ""}{e.credits || e.amount || 0}
                                </td>
                                <td className="p-2 font-mono">{e.balance_after}</td>
                                <td className="p-2 truncate max-w-[120px]">{e.reason || e.reason_code || e.description || "—"}</td>
                              </tr>
                            );
                          })}
                          {selectedLedger.length === 0 && (
                            <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Sem movimentações</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
