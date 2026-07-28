import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AdminCreditSubscription, AdminCreditProduct, AdminCreditsData } from "@/hooks/useAdminCredits";

interface Props { data: AdminCreditsData; }

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-300",
  paused: "bg-amber-100 text-amber-700 border-amber-300",
  cancelled: "bg-red-100 text-red-700 border-red-300",
  expired: "bg-gray-100 text-gray-600 border-gray-300",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo", paused: "Pausado", cancelled: "Cancelado", expired: "Expirado",
};

export function AdminCreditsSubscriptions({ data }: Props) {
  const { subscriptions, products } = data;
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = subscriptions.filter((s: AdminCreditSubscription) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    return true;
  });

  // Plan-level summary
  const planSummary: Record<string, { name: string; type: string; credits: number; active: number; total: number; revenue: number }> = {};
  for (const s of subscriptions) {
    const key = s.product_id;
    if (!planSummary[key]) {
      const prod = products.find((p: AdminCreditProduct) => p.id === key);
      planSummary[key] = {
        name: s.product_name || "—",
        type: s.product_type || "—",
        credits: s.credits_per_cycle || 0,
        active: 0, total: 0,
        revenue: prod ? prod.price_brl : 0,
      };
    }
    planSummary[key].total++;
    if (s.status === "active") planSummary[key].active++;
  }
  const planRows = Object.values(planSummary);

  return (
    <div className="space-y-4">
      {/* Plan Summary Cards */}
      {planRows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {planRows.map((plan, i) => (
            <Card key={i} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-semibold truncate">{plan.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px]">{translateType(plan.type)}</Badge>
                  <span className="text-xs text-muted-foreground">{plan.credits} cr/ciclo</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Ativos:</span> <strong className="text-emerald-600">{plan.active}</strong></div>
                  <div><span className="text-muted-foreground">Total:</span> <strong>{plan.total}</strong></div>
                  <div className="col-span-2"><span className="text-muted-foreground">Receita Mensal Est.:</span> <strong className="text-blue-600">R$ {(plan.revenue * plan.active).toFixed(2)}</strong></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="shadow-sm border-0">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="paused">Pausados</SelectItem>
              <SelectItem value="cancelled">Cancelados</SelectItem>
              <SelectItem value="expired">Expirados</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="text-xs ml-auto">{filtered.length} assinaturas</Badge>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-md border-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {["Lojista", "Loja", "Plano", "Tipo", "Créditos/Ciclo", "Status", "Início", "Próx. Renovação", "Rollover"].map(h => (
                  <th key={h} className="text-left p-3 font-semibold text-xs text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s: AdminCreditSubscription) => (
                <tr key={s.id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="p-3 text-xs">{s.user_email}</td>
                  <td className="p-3 font-medium">{s.store_name}</td>
                  <td className="p-3">{s.product_name}</td>
                  <td className="p-3"><Badge variant="outline" className="text-[10px]">{translateType(s.product_type || "")}</Badge></td>
                  <td className="p-3 font-mono text-right">{s.credits_per_cycle}</td>
                  <td className="p-3"><Badge className={`text-[10px] ${STATUS_COLORS[s.status] || ""}`}>{STATUS_LABELS[s.status] || s.status}</Badge></td>
                  <td className="p-3 text-xs text-muted-foreground">{s.started_at ? new Date(s.started_at).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="p-3 text-xs">{s.next_renewal_at ? new Date(s.next_renewal_at).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="p-3 font-mono text-center">{s.rollover_credits || 0}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Nenhuma assinatura</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function translateType(t: string) {
  const m: Record<string, string> = { pacote: "Avulso", mensal: "Mensal", semestral: "Semestral", anual: "Anual", one_time: "Avulso", monthly: "Mensal" };
  return m[t] || t;
}
