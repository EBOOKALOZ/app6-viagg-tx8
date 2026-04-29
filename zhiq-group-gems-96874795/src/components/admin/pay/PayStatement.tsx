/**
 * PayStatement — Premium financial ledger statement
 */
import { useState } from "react";
import {
  FileText, Search, ChevronLeft, ChevronRight,
  ArrowDownCircle, ArrowUpCircle, X, Calendar, Eye,
  Lock, Shield, Database, Download, TrendingUp, TrendingDown,
  CircleDot, RotateCcw, RefreshCw, Minus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { usePayFinancialStatement, usePaySourceTypes } from "@/hooks/useAdminPayStatement";
import { formatBRL, formatDate, formatDateFull, truncateId } from "@/skills/pay/payUtils";
import type { StatementEntry } from "@/skills/pay/payTypes";

const PAGE_SIZE = 30;

// Entry type visual config
const ENTRY_TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  credit: { label: "Crédito", color: "bg-emerald-100 text-emerald-700", icon: ArrowDownCircle },
  debit: { label: "Débito", color: "bg-red-100 text-red-700", icon: ArrowUpCircle },
  reserve: { label: "Reserva", color: "bg-amber-100 text-amber-700", icon: Lock },
  release: { label: "Liberação", color: "bg-blue-100 text-blue-700", icon: RefreshCw },
  transfer_in: { label: "Transferência In", color: "bg-emerald-100 text-emerald-700", icon: TrendingUp },
  transfer_out: { label: "Transferência Out", color: "bg-orange-100 text-orange-700", icon: TrendingDown },
  payout_request: { label: "Saque Solicitado", color: "bg-violet-100 text-violet-700", icon: CircleDot },
  payout_paid: { label: "Saque Pago", color: "bg-teal-100 text-teal-700", icon: ArrowUpCircle },
  payout_failed: { label: "Saque Falhou", color: "bg-red-100 text-red-700", icon: X },
  reversal: { label: "Estorno", color: "bg-pink-100 text-pink-700", icon: RotateCcw },
  adjustment: { label: "Ajuste", color: "bg-gray-100 text-gray-700", icon: Minus },
};

function getEntryConfig(entryType: string | null, sourceType: string | null) {
  if (entryType && ENTRY_TYPE_CONFIG[entryType]) return ENTRY_TYPE_CONFIG[entryType];
  if (sourceType && ENTRY_TYPE_CONFIG[sourceType]) return ENTRY_TYPE_CONFIG[sourceType];
  return { label: entryType || sourceType || "—", color: "bg-gray-100 text-gray-600", icon: CircleDot };
}

export default function PayStatement() {
  const [sourceType, setSourceType] = useState("all");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<StatementEntry | null>(null);

  const { data, isLoading } = usePayFinancialStatement({ sourceType, search, period, page });
  const { data: sourceTypes } = usePaySourceTypes();

  const totalPages = Math.ceil((data?.count || 0) / PAGE_SIZE);
  const hasFilters = sourceType !== "all" || search || period !== "all";

  // Compute summary from current page
  const rows = data?.rows || [];
  const totalIn = rows.filter(r => r.amount_cents > 0).reduce((s, r) => s + r.amount_cents, 0);
  const totalOut = rows.filter(r => r.amount_cents < 0).reduce((s, r) => s + Math.abs(r.amount_cents), 0);

  const clearFilters = () => { setSourceType("all"); setSearch(""); setPeriod("all"); setPage(0); };

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-md">
              <FileText className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight">Extrato Financeiro</h3>
              <p className="text-[10px] text-muted-foreground">Trilha contábil operacional · {data?.count || 0} lançamentos</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 text-[11px]" disabled>
            <Download className="h-3.5 w-3.5" /> Exportar
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {[
            { label: "Entradas", value: formatBRL(totalIn), icon: ArrowDownCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
            { label: "Saídas", value: formatBRL(totalOut), icon: ArrowUpCircle, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30" },
            { label: "Saldo Computado", value: formatBRL(totalIn - totalOut), icon: TrendingUp, color: totalIn >= totalOut ? "text-emerald-600" : "text-red-500", bg: totalIn >= totalOut ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30" },
            { label: "Lançamentos", value: String(data?.count || 0), icon: Database, color: "text-slate-600", bg: "bg-slate-50 dark:bg-slate-950/30" },
          ].map(c => (
            <Card key={c.label} className="border shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
                  <span className="text-[8px] text-muted-foreground font-extrabold uppercase tracking-[0.15em]">{c.label}</span>
                </div>
                <p className={`text-lg font-black tabular-nums ${c.color}`}>{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar por referência..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="pl-8 h-8 text-[11px]" />
          </div>
          <Select value={sourceType} onValueChange={v => { setSourceType(v); setPage(0); }}>
            <SelectTrigger className="w-[160px] h-8 text-[11px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {sourceTypes?.map(st => {
                const cfg = getEntryConfig(st, st);
                return <SelectItem key={st} value={st}>{cfg.label}</SelectItem>;
              })}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={v => { setPeriod(v); setPage(0); }}>
            <SelectTrigger className="w-[130px] h-8 text-[11px]"><Calendar className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo período</SelectItem>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="7d">7 dias</SelectItem>
              <SelectItem value="30d">30 dias</SelectItem>
              <SelectItem value="90d">90 dias</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-[11px] text-muted-foreground">
              <X className="h-3 w-3 mr-1" /> Limpar
            </Button>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <Card className="border-0 shadow-lg">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      {["Data","Tipo","Referência","Descrição","Valor","Saldo Após","",""].map(h => (
                        <th key={h} className="text-left py-2.5 px-3 font-extrabold text-muted-foreground text-[9px] uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => {
                      const isCredit = e.amount_cents > 0;
                      const cfg = getEntryConfig(e.entry_type, e.source_type);
                      const EntryIcon = cfg.icon;
                      return (
                        <tr key={e.id} className="border-b hover:bg-accent/30 transition-colors cursor-pointer" onClick={() => setSelected(e)}>
                          <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">{formatDate(e.created_at)}</td>
                          <td className="py-2.5 px-3">
                            <Badge className={`text-[8px] font-bold gap-1 ${cfg.color}`}>
                              <EntryIcon className="h-2.5 w-2.5" /> {cfg.label}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[10px] text-muted-foreground">{truncateId(e.source_id || e.reference_id, 12)}</td>
                          <td className="py-2.5 px-3 text-muted-foreground max-w-[180px] truncate">{e.description || e.reference_type || "—"}</td>
                          <td className={`py-2.5 px-3 text-right font-bold tabular-nums ${isCredit ? "text-emerald-600" : "text-red-500"}`}>
                            {isCredit ? "+" : ""}{formatBRL(e.amount_cents)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[10px] text-muted-foreground tabular-nums">
                            {e.balance_after_cents != null ? formatBRL(e.balance_after_cents) : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {isCredit ? <ArrowDownCircle className="h-3.5 w-3.5 text-emerald-500 inline" /> : <ArrowUpCircle className="h-3.5 w-3.5 text-red-400 inline" />}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Eye className="h-3.5 w-3.5" /></Button>
                          </td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr><td colSpan={8} className="py-16 text-center text-muted-foreground">
                        <Database className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                        Nenhum lançamento encontrado
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">Página {page + 1} de {totalPages} · {data?.count || 0} registros</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {/* Institutional Block */}
        <Card className="border shadow-sm bg-slate-50/50 dark:bg-slate-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-slate-500" />
              <p className="text-[10px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Integridade do Ledger</p>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px]">
              <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 rounded-lg border border-emerald-200 font-bold">
                <Database className="h-3 w-3" /> Append-only — Lançamentos nunca são alterados ou deletados
              </span>
              <span className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 dark:bg-blue-950/30 text-blue-700 rounded-lg border border-blue-200 font-bold">
                <Lock className="h-3 w-3" /> Alterações exigem lançamento compensatório
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> Detalhe do Lançamento</DialogTitle>
          </DialogHeader>
          {selected && (() => {
            const isCredit = selected.amount_cents > 0;
            const cfg = getEntryConfig(selected.entry_type, selected.source_type);
            return (
              <div className="space-y-4">
                <div className={`rounded-xl p-4 text-center ${isCredit ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"}`}>
                  <Badge className={`text-[9px] mb-2 font-bold gap-1 ${cfg.color}`}>
                    <cfg.icon className="h-3 w-3" /> {cfg.label}
                  </Badge>
                  <p className={`text-2xl font-black tabular-nums ${isCredit ? "text-emerald-700" : "text-red-600"}`}>{formatBRL(selected.amount_cents)}</p>
                </div>
                <div className="space-y-2">
                  {[
                    ["ID", selected.id],
                    ["Account ID", selected.account_id],
                    ["Account Kind", selected.account_kind],
                    ["Entry Type", selected.entry_type],
                    ["Source Type", selected.source_type],
                    ["Source ID", selected.source_id],
                    ["Reference", `${selected.reference_type || "—"} / ${selected.reference_id || "—"}`],
                    ["Idempotency Key", selected.idempotency_key],
                    ["Data", formatDateFull(selected.created_at)],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex items-start gap-2 text-[11px] py-1 border-b border-border/40">
                      <span className="font-bold text-muted-foreground min-w-[110px] shrink-0">{label}</span>
                      <span className="font-mono text-[10px] break-all">{value || "—"}</span>
                    </div>
                  ))}
                </div>
                {selected.metadata && (
                  <div>
                    <p className="text-[10px] font-bold mb-1">Metadata (JSON)</p>
                    <pre className="bg-gray-900 text-green-400 rounded-lg p-3 text-[9px] overflow-x-auto max-h-40">{JSON.stringify(selected.metadata, null, 2)}</pre>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
