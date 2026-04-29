/**
 * AdminPayLedger — Admin ledger_entries viewer
 * Connects to public.ledger_entries
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Layers, Search, Loader2, ChevronLeft, ChevronRight,
  ArrowDownCircle, ArrowUpCircle, Calendar, Key, Eye,
  Hash, Filter, X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// ─── Helpers ─────────────────────────────
const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleString("pt-BR"); } catch { return d; }
};

const fmtShort = (d: string) => {
  try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return d; }
};

const PAGE_SIZE = 30;

// ═══════════════════════════════════
// MAIN
// ═══════════════════════════════════
export default function AdminPayLedger() {
  const [filterAccountId, setFilterAccountId] = useState("");
  const [filterDirection, setFilterDirection] = useState("all");
  const [filterSourceType, setFilterSourceType] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [searchIdemKey, setSearchIdemKey] = useState("");
  const [page, setPage] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);

  // ─── Source types for filter ───────
  const { data: sourceTypes } = useQuery({
    queryKey: ["admin-ledger-source-types"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ledger_entries")
        .select("source_type")
        .not("source_type", "is", null)
        .limit(200);
      const unique = [...new Set((data || []).map((r: any) => r.source_type).filter(Boolean))];
      return unique.sort();
    },
    staleTime: 60_000,
  });

  // ─── Ledger list ──────────────────
  const { data: ledger, isLoading } = useQuery({
    queryKey: ["admin-ledger-list", filterAccountId, filterDirection, filterSourceType, filterPeriod, searchIdemKey, page],
    queryFn: async () => {
      let q = supabase
        .from("ledger_entries")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filterAccountId.trim()) q = q.eq("account_id", filterAccountId.trim());

      if (filterDirection === "credit") q = q.gt("amount_cents", 0);
      else if (filterDirection === "debit") q = q.lt("amount_cents", 0);

      if (filterSourceType !== "all") q = q.eq("source_type", filterSourceType);

      if (filterPeriod !== "all") {
        const now = new Date();
        let start: Date;
        if (filterPeriod === "today") start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        else if (filterPeriod === "7d") { start = new Date(); start.setDate(start.getDate() - 7); }
        else if (filterPeriod === "30d") { start = new Date(); start.setDate(start.getDate() - 30); }
        else if (filterPeriod === "90d") { start = new Date(); start.setDate(start.getDate() - 90); }
        else start = new Date(0);
        q = q.gte("created_at", start.toISOString());
      }

      if (searchIdemKey.trim()) q = q.eq("idempotency_key", searchIdemKey.trim());

      const { data, error, count } = await q;
      if (error) { console.error(error); return { rows: [], count: 0 }; }
      return { rows: data || [], count: count || 0 };
    },
    refetchInterval: 30_000,
  });

  const totalPages = Math.ceil((ledger?.count || 0) / PAGE_SIZE);

  const clearFilters = () => {
    setFilterAccountId(""); setFilterDirection("all"); setFilterSourceType("all");
    setFilterPeriod("all"); setSearchIdemKey(""); setPage(0);
  };

  const hasActiveFilters = filterAccountId || filterDirection !== "all" || filterSourceType !== "all" || filterPeriod !== "all" || searchIdemKey;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg">
          <Layers className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black">Ledger</h1>
          <p className="text-xs text-muted-foreground">ledger_entries · Registro imutável de movimentações financeiras</p>
        </div>
      </div>

      {/* ═══ FILTERS ═══ */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filtrar por account_id..."
            value={filterAccountId}
            onChange={e => { setFilterAccountId(e.target.value); setPage(0); }}
            className="pl-9 h-9 text-xs"
          />
        </div>
        <div className="relative min-w-[200px] max-w-xs">
          <Key className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar idempotency_key..."
            value={searchIdemKey}
            onChange={e => { setSearchIdemKey(e.target.value); setPage(0); }}
            className="pl-9 h-9 text-xs"
          />
        </div>
        <Select value={filterDirection} onValueChange={v => { setFilterDirection(v); setPage(0); }}>
          <SelectTrigger className="w-[130px] h-9 text-xs">
            <SelectValue placeholder="Direção" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas direções</SelectItem>
            <SelectItem value="credit">Credit</SelectItem>
            <SelectItem value="debit">Debit</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSourceType} onValueChange={v => { setFilterSourceType(v); setPage(0); }}>
          <SelectTrigger className="w-[160px] h-9 text-xs">
            <SelectValue placeholder="Source Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos source_type</SelectItem>
            {sourceTypes?.map(st => (
              <SelectItem key={st} value={st}>{st}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPeriod} onValueChange={v => { setFilterPeriod(v); setPage(0); }}>
          <SelectTrigger className="w-[140px] h-9 text-xs">
            <Calendar className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo período</SelectItem>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="90d">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs text-muted-foreground">
            <X className="h-3 w-3 mr-1" /> Limpar
          </Button>
        )}
      </div>

      {/* ═══ TABLE ═══ */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <Card className="border-0 shadow-md">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-3 px-3 font-bold text-muted-foreground">ID</th>
                    <th className="text-left py-3 px-3 font-bold text-muted-foreground">Account</th>
                    <th className="text-center py-3 px-3 font-bold text-muted-foreground">Direção</th>
                    <th className="text-right py-3 px-3 font-bold text-muted-foreground">Valor</th>
                    <th className="text-left py-3 px-3 font-bold text-muted-foreground">Moeda</th>
                    <th className="text-left py-3 px-3 font-bold text-muted-foreground">Source Type</th>
                    <th className="text-left py-3 px-3 font-bold text-muted-foreground">Source ID</th>
                    <th className="text-left py-3 px-3 font-bold text-muted-foreground">Profile</th>
                    <th className="text-left py-3 px-3 font-bold text-muted-foreground">Idempotency</th>
                    <th className="text-left py-3 px-3 font-bold text-muted-foreground">Data</th>
                    <th className="text-center py-3 px-3 font-bold text-muted-foreground">Ver</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger?.rows.map((e: any) => {
                    const isCredit = Number(e.amount_cents) > 0;
                    return (
                      <tr
                        key={e.id}
                        className="border-b hover:bg-accent/30 transition-colors cursor-pointer"
                        onClick={() => setSelectedEntry(e)}
                      >
                        <td className="py-2.5 px-3 font-mono text-[10px] text-muted-foreground">{e.id?.slice(0, 8)}...</td>
                        <td className="py-2.5 px-3 font-mono text-[10px]">{e.account_id?.slice(0, 8)}...</td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge className={`text-[9px] ${isCredit ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {isCredit ? (
                              <><ArrowDownCircle className="h-2.5 w-2.5 mr-0.5 inline" />credit</>
                            ) : (
                              <><ArrowUpCircle className="h-2.5 w-2.5 mr-0.5 inline" />debit</>
                            )}
                          </Badge>
                        </td>
                        <td className={`py-2.5 px-3 text-right font-bold ${isCredit ? 'text-emerald-600' : 'text-red-500'}`}>
                          {formatBRL(e.amount_cents)}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">{e.currency || "BRL"}</td>
                        <td className="py-2.5 px-3">
                          <Badge variant="outline" className="text-[9px]">{e.source_type || "—"}</Badge>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[10px] text-muted-foreground">
                          {e.source_id ? `${e.source_id.slice(0, 8)}...` : "—"}
                        </td>
                        <td className="py-2.5 px-3">
                          {e.profile_type ? <Badge variant="outline" className="text-[9px]">{e.profile_type}</Badge> : "—"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[9px] text-muted-foreground max-w-[100px] truncate">
                          {e.idempotency_key || e.batch_id || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">{fmtShort(e.created_at)}</td>
                        <td className="py-2.5 px-3 text-center">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {(!ledger?.rows || ledger.rows.length === 0) && (
                    <tr><td colSpan={11} className="py-12 text-center text-muted-foreground">Nenhum lançamento encontrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ PAGINATION ═══ */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Página {page + 1} de {totalPages} · {ledger?.count || 0} registros
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ═══ ENTRY DETAIL DIALOG ═══ */}
      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Hash className="h-4 w-4" />
              Detalhe do Lançamento
            </DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              {/* Amount highlight */}
              <div className={`rounded-xl p-4 text-center ${Number(selectedEntry.amount_cents) > 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <Badge className={`text-xs mb-2 ${Number(selectedEntry.amount_cents) > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {Number(selectedEntry.amount_cents) > 0 ? 'CREDIT' : 'DEBIT'}
                </Badge>
                <p className={`text-2xl font-black ${Number(selectedEntry.amount_cents) > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {formatBRL(selectedEntry.amount_cents)}
                </p>
              </div>

              {/* All fields */}
              <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
                {[
                  ["ID", selectedEntry.id],
                  ["Account Kind", selectedEntry.account_kind],
                  ["Account ID", selectedEntry.account_id],
                  ["Direction", Number(selectedEntry.amount_cents) > 0 ? "credit" : "debit"],
                  ["Amount (cents)", selectedEntry.amount_cents],
                  ["Currency", selectedEntry.currency || "BRL"],
                  ["Source Type", selectedEntry.source_type],
                  ["Source ID", selectedEntry.source_id],
                  ["Reference Type", selectedEntry.reference_type],
                  ["Reference ID", selectedEntry.reference_id],
                  ["Entry Type", selectedEntry.entry_type],
                  ["Profile Type", selectedEntry.profile_type],
                  ["Idempotency Key", selectedEntry.idempotency_key || selectedEntry.batch_id],
                  ["Created At", fmtDate(selectedEntry.created_at)],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-start gap-2 text-[10px]">
                    <span className="font-bold text-muted-foreground min-w-[110px] shrink-0">{label}:</span>
                    <span className={`font-mono break-all ${
                      label === "Source Type" || label === "Idempotency Key" ? "text-blue-600 font-bold" : ""
                    }`}>{value || "—"}</span>
                  </div>
                ))}
              </div>

              {/* Raw JSON if metadata exists */}
              {(selectedEntry.metadata || selectedEntry.extra) && (
                <div>
                  <h4 className="text-xs font-bold mb-2">Dados Adicionais (JSON)</h4>
                  <pre className="bg-gray-900 text-green-400 rounded-lg p-3 text-[9px] overflow-x-auto max-h-40">
                    {JSON.stringify(selectedEntry.metadata || selectedEntry.extra, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
