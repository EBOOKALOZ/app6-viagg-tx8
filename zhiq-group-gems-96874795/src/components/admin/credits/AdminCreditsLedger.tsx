import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Download } from "lucide-react";
import { exportToCSV } from "@/hooks/useAdminCredits";
import type { AdminLedgerEntry, AdminCreditsData } from "@/hooks/useAdminCredits";

interface Props { data: AdminCreditsData; }

const REASON_LABELS: Record<string, string> = {
  package_purchase: "Compra de Pacote",
  subscription_activation: "Ativação de Assinatura",
  purchase_intention: "Intenção de Compra",
  bonus: "Bônus",
  adjustment: "Ajuste Manual",
  store_view: "Entrada na Loja",
  product_click: "Visualização de Produto",
  buy_click: "Clique em Comprar",
  refund: "Estorno",
  expiration: "Expiração",
  rollover: "Rollover",
};

export function AdminCreditsLedger({ data }: Props) {
  const { ledger } = data;
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");

  const filtered = useMemo(() => {
    return ledger.filter((e: AdminLedgerEntry) => {
      // Search
      if (search) {
        const s = search.toLowerCase();
        if (!(e.store_name || "").toLowerCase().includes(s)
          && !(e.user_email || "").toLowerCase().includes(s)
          && !(e.reason || "").toLowerCase().includes(s)
          && !(e.reason_code || "").toLowerCase().includes(s)
          && !(e.description || "").toLowerCase().includes(s)) return false;
      }
      // Type
      if (typeFilter === "credit" && !(e.entry_type === "credit" || e.credits > 0)) return false;
      if (typeFilter === "debit" && !(e.entry_type === "debit" || e.credits < 0)) return false;
      // Period
      if (periodFilter !== "all" && e.created_at) {
        const days = periodFilter === "7d" ? 7 : periodFilter === "30d" ? 30 : 90;
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
        if (new Date(e.created_at) < cutoff) return false;
      }
      return true;
    });
  }, [ledger, search, typeFilter, periodFilter]);

  // Totals
  const totalCredits = filtered.filter((e: AdminLedgerEntry) => e.entry_type === "credit" || e.credits > 0)
    .reduce((s: number, e: AdminLedgerEntry) => s + Math.abs(e.credits || e.amount || 0), 0);
  const totalDebits = filtered.filter((e: AdminLedgerEntry) => e.entry_type === "debit" || e.credits < 0)
    .reduce((s: number, e: AdminLedgerEntry) => s + Math.abs(e.credits || e.amount || 0), 0);

  const handleExport = () => {
    exportToCSV(filtered.map((e: AdminLedgerEntry) => ({
      ID: e.id,
      Loja: e.store_name,
      Email: e.user_email,
      Tipo: e.entry_type || (e.credits >= 0 ? "credit" : "debit"),
      Quantidade: e.credits || e.amount,
      Saldo_Antes: e.balance_before,
      Saldo_Depois: e.balance_after,
      Motivo: e.reason || e.reason_code || "",
      Descricao: e.description || "",
      Data: e.created_at,
    })), "extrato_creditos");
  };

  return (
    <div className="space-y-4">
      {/* Filters + Totals */}
      <Card className="shadow-sm border-0">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar lojista, motivo…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="credit">Créditos</SelectItem>
              <SelectItem value="debit">Débitos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo Período</SelectItem>
              <SelectItem value="7d">7 dias</SelectItem>
              <SelectItem value="30d">30 dias</SelectItem>
              <SelectItem value="90d">90 dias</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-xs space-x-3">
              <span>Entradas: <strong className="text-emerald-600">+{totalCredits}</strong></span>
              <span>Saídas: <strong className="text-red-500">-{totalDebits}</strong></span>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 text-xs h-8">
              <Download className="h-3 w-3" /> CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-md border-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {["Data/Hora", "Loja", "E-mail", "Tipo", "Qtd", "Antes", "Depois", "Motivo", "Descrição"].map(h => (
                  <th key={h} className="text-left p-3 font-semibold text-xs text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((e: AdminLedgerEntry) => {
                const isCredit = e.entry_type === "credit" || (e.credits > 0);
                const rc = e.reason_code || "";
                return (
                  <tr key={e.id} className="border-b hover:bg-muted/20 transition-colors">
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {e.created_at ? new Date(e.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="p-3 font-medium text-xs">{e.store_name}</td>
                    <td className="p-3 text-xs text-muted-foreground">{e.user_email}</td>
                    <td className="p-3">
                      <Badge className={`text-[10px] ${isCredit ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {isCredit ? "Crédito" : "Débito"}
                      </Badge>
                    </td>
                    <td className={`p-3 font-mono font-bold ${isCredit ? "text-emerald-600" : "text-red-500"}`}>
                      {isCredit ? "+" : ""}{e.credits || e.amount || 0}
                    </td>
                    <td className="p-3 font-mono text-xs">{e.balance_before || "—"}</td>
                    <td className="p-3 font-mono text-xs">{e.balance_after}</td>
                    <td className="p-3 text-xs">{REASON_LABELS[rc] || e.reason || rc || "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground truncate max-w-[150px]">{e.description || e.rule_applied || "—"}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Sem lançamentos</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground text-right">{filtered.length} lançamentos (mostrando até 200)</p>
    </div>
  );
}
