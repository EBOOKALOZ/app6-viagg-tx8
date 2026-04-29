/**
 * AdminPayWallets — Admin financial_accounts viewer
 * Connects to public.financial_accounts + ledger_entries + payout_requests + external_bank_accounts
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Wallet, Search, Loader2, Eye, ChevronLeft, ChevronRight,
  CreditCard, ArrowUpDown, Calendar, Hash,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const typeColors: Record<string, string> = {
  wallet: "bg-blue-100 text-blue-700",
  institutional: "bg-emerald-100 text-emerald-700",
  escrow: "bg-amber-100 text-amber-700",
  platform_master: "bg-violet-100 text-violet-700",
};

const PAGE_SIZE = 25;

// ═══════════════════════════════════
// MAIN
// ═══════════════════════════════════
export default function AdminPayWallets() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterBalance, setFilterBalance] = useState("all");
  const [sortField, setSortField] = useState<"created_at" | "updated_at">("updated_at");
  const [page, setPage] = useState(0);
  const [selectedWallet, setSelectedWallet] = useState<any | null>(null);

  // ─── Summary stats ────────────────
  const { data: stats } = useQuery({
    queryKey: ["admin-wallets-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("*");
      if (error || !data) return { total: 0, withBalance: 0, availableSum: 0, reservedSum: 0 };

      const total = data.length;
      const getBalance = (w: any) => w.available_balance ?? w.balance_cents ?? 0;
      const getReserved = (w: any) => w.reserved_balance ?? w.reserved_balance_cents ?? 0;
      const withBalance = data.filter(w => getBalance(w) > 0).length;
      
      // Note: Admin summary might need multiplication by 100 if formatBRL expects cents
      const availableSum = data.reduce((s, w) => s + Number(getBalance(w)) * 100, 0);
      const reservedSum = data.reduce((s, w) => s + Number(getReserved(w)) * 100, 0);
      return { total, withBalance, availableSum, reservedSum };
    },
    staleTime: 30_000,
  });

  // ─── Wallets list ─────────────────
  const { data: wallets, isLoading } = useQuery({
    queryKey: ["admin-wallets-list", filterType, filterBalance, searchTerm, sortField, page],
    queryFn: async () => {
      let q = supabase
        .from("financial_accounts")
        .select("*", { count: "exact" })
        .order(sortField, { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filterType !== "all") q = q.eq("account_type", filterType);
      if (filterBalance === "positive") q = q.gt("available_balance", 0);

      // Search by user_id or wallet id
      if (searchTerm.trim()) {
        const term = searchTerm.trim();
        // Try UUID pattern
        if (term.length >= 8) {
          q = q.or(`owner_user_id.eq.${term},id.eq.${term}`);
        }
      }

      const { data, error, count } = await q;
      if (error) { console.error(error); return { rows: [], count: 0 }; }
      return { rows: data || [], count: count || 0 };
    },
    refetchInterval: 30_000,
  });

  const totalPages = Math.ceil((wallets?.count || 0) / PAGE_SIZE);

  // ─── Wallet detail: ledger ────────
  const { data: walletLedger } = useQuery({
    queryKey: ["admin-wallet-detail-ledger", selectedWallet?.id],
    queryFn: async () => {
      if (!selectedWallet) return [];
      const { data } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("account_id", selectedWallet.id)
        .order("created_at", { ascending: false })
        .limit(15);
      return data || [];
    },
    enabled: !!selectedWallet,
  });

  // ─── Wallet detail: payouts ───────
  const { data: walletPayouts } = useQuery({
    queryKey: ["admin-wallet-detail-payouts", selectedWallet?.owner_user_id],
    queryFn: async () => {
      if (!selectedWallet) return [];
      const { data } = await supabase
        .from("payout_requests")
        .select("*")
        .eq("user_id", selectedWallet.owner_user_id)
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!selectedWallet,
  });

  // ─── Wallet detail: bank account ──
  const { data: bankAccount } = useQuery({
    queryKey: ["admin-wallet-detail-bank", selectedWallet?.owner_user_id],
    queryFn: async () => {
      if (!selectedWallet) return null;
      const { data } = await (supabase.from("external_bank_accounts") as any)
        .select("*")
        .eq("user_id", selectedWallet.owner_user_id)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!selectedWallet,
  });

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
          <Wallet className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black">Wallets</h1>
          <p className="text-xs text-muted-foreground">financial_accounts · Todas as carteiras do sistema</p>
        </div>
      </div>

      {/* ═══ SUMMARY CARDS ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total de Wallets</p>
            <p className="text-2xl font-black">{stats?.total ?? "—"}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Wallets com Saldo</p>
            <p className="text-2xl font-black text-emerald-600">{stats?.withBalance ?? "—"}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Saldo Disponível Agregado</p>
            <p className="text-2xl font-black text-blue-600">{stats ? formatBRL(stats.availableSum) : "—"}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Saldo Reservado Agregado</p>
            <p className="text-2xl font-black text-amber-600">{stats ? formatBRL(stats.reservedSum) : "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* ═══ FILTERS ═══ */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por user_id ou wallet id..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
            className="pl-9 h-9 text-xs"
          />
        </div>
        <Select value={filterType} onValueChange={v => { setFilterType(v); setPage(0); }}>
          <SelectTrigger className="w-[150px] h-9 text-xs">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="user_wallet">Wallet</SelectItem>
            <SelectItem value="institutional">Institucional</SelectItem>
            <SelectItem value="escrow">Escrow</SelectItem>
            <SelectItem value="platform_master">Platform Master</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterBalance} onValueChange={v => { setFilterBalance(v); setPage(0); }}>
          <SelectTrigger className="w-[150px] h-9 text-xs">
            <SelectValue placeholder="Saldo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos saldos</SelectItem>
            <SelectItem value="positive">Saldo {">"} 0</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortField} onValueChange={(v: any) => setSortField(v)}>
          <SelectTrigger className="w-[160px] h-9 text-xs">
            <ArrowUpDown className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated_at">Atualizado (recente)</SelectItem>
            <SelectItem value="created_at">Criado (recente)</SelectItem>
          </SelectContent>
        </Select>
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
                    <th className="text-left py-3 px-3 font-bold text-muted-foreground">Owner User</th>
                    <th className="text-left py-3 px-3 font-bold text-muted-foreground">Profile</th>
                    <th className="text-left py-3 px-3 font-bold text-muted-foreground">Tipo</th>
                    <th className="text-right py-3 px-3 font-bold text-muted-foreground">Disponível</th>
                    <th className="text-right py-3 px-3 font-bold text-muted-foreground">Pendente</th>
                    <th className="text-right py-3 px-3 font-bold text-muted-foreground">Reservado</th>
                    <th className="text-left py-3 px-3 font-bold text-muted-foreground">Criado</th>
                    <th className="text-left py-3 px-3 font-bold text-muted-foreground">Atualizado</th>
                    <th className="text-center py-3 px-3 font-bold text-muted-foreground">Ver</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets?.rows.map((w: any) => (
                    <tr
                      key={w.id}
                      className="border-b hover:bg-accent/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedWallet(w)}
                    >
                      <td className="py-2.5 px-3 font-mono text-[10px] text-muted-foreground">{w.id?.slice(0, 8)}...</td>
                      <td className="py-2.5 px-3 font-mono text-[10px]">{w.owner_user_id?.slice(0, 12)}...</td>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline" className="text-[9px]">{w.profile_type || "—"}</Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge className={`text-[9px] ${typeColors[w.account_type] || "bg-gray-100 text-gray-700"}`}>
                          {w.account_type}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-600">{formatBRL((w.available_balance || 0) * 100)}</td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">{formatBRL((w.pending_balance || 0) * 100)}</td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">{formatBRL((w.reserved_balance || 0) * 100)}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{w.created_at ? fmtShort(w.created_at) : "—"}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{w.updated_at ? fmtShort(w.updated_at) : "—"}</td>
                      <td className="py-2.5 px-3 text-center">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(!wallets?.rows || wallets.rows.length === 0) && (
                    <tr><td colSpan={10} className="py-12 text-center text-muted-foreground">Nenhuma wallet encontrada</td></tr>
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
            Página {page + 1} de {totalPages} · {wallets?.count || 0} registros
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

      {/* ═══ WALLET DETAIL DIALOG ═══ */}
      <Dialog open={!!selectedWallet} onOpenChange={(open) => !open && setSelectedWallet(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" />
              Detalhe da Wallet
            </DialogTitle>
          </DialogHeader>
          {selectedWallet && (
            <div className="space-y-5">
              {/* Balance cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-[9px] text-emerald-600 font-bold uppercase">Disponível</p>
                  <p className="text-lg font-black text-emerald-700">{formatBRL((selectedWallet.available_balance || 0) * 100)}</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                  <p className="text-[9px] text-amber-600 font-bold uppercase">Pendente</p>
                  <p className="text-lg font-black text-amber-700">{formatBRL((selectedWallet.pending_balance || 0) * 100)}</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-[9px] text-blue-600 font-bold uppercase">Reservado</p>
                  <p className="text-lg font-black text-blue-700">{formatBRL((selectedWallet.reserved_balance || 0) * 100)}</p>
                </div>
              </div>

              {/* Metadata */}
              <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                <p className="text-[10px]"><span className="font-bold">ID:</span> <span className="font-mono text-[9px]">{selectedWallet.id}</span></p>
                <p className="text-[10px]"><span className="font-bold">Owner User ID:</span> <span className="font-mono text-[9px]">{selectedWallet.owner_user_id}</span></p>
                <p className="text-[10px]"><span className="font-bold">Profile:</span> {selectedWallet.profile_type || "—"}</p>
                <p className="text-[10px]"><span className="font-bold">Tipo:</span> {selectedWallet.account_type}</p>
                <p className="text-[10px]"><span className="font-bold">Moeda:</span> {selectedWallet.currency || "BRL"}</p>
                <p className="text-[10px]"><span className="font-bold">Região:</span> {selectedWallet.region_id || "—"}</p>
                <p className="text-[10px]"><span className="font-bold">Ativo:</span> {selectedWallet.is_active ? "Sim" : "Não"}</p>
                <p className="text-[10px]"><span className="font-bold">Criado:</span> {fmtDate(selectedWallet.created_at)}</p>
                <p className="text-[10px]"><span className="font-bold">Atualizado:</span> {selectedWallet.updated_at ? fmtDate(selectedWallet.updated_at) : "—"}</p>
              </div>

              {/* Ledger entries */}
              <div>
                <h4 className="text-xs font-bold mb-2 flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5 text-blue-500" />
                  Últimos Lançamentos (Ledger)
                </h4>
                {!walletLedger?.length ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhum lançamento</p>
                ) : (
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {walletLedger.map((e: any) => (
                      <div key={e.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/20 text-[11px]">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-[8px] ${e.entry_type === 'credit' || Number(e.amount_cents) > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {e.entry_type || (Number(e.amount_cents) > 0 ? 'credit' : 'debit')}
                          </Badge>
                          <span className="font-medium">{e.source_type || "—"}</span>
                          <span className="text-muted-foreground">{fmtShort(e.created_at)}</span>
                        </div>
                        <span className={`font-bold ${Number(e.amount_cents) > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {formatBRL(e.amount_cents)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payouts */}
              <div>
                <h4 className="text-xs font-bold mb-2 flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-orange-500" />
                  Últimos Payouts
                </h4>
                {!walletPayouts?.length ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhum payout</p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {walletPayouts.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/20 text-[11px]">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-[8px] ${
                            p.status === 'completed' || p.status === 'sent' ? 'bg-emerald-100 text-emerald-700' :
                            p.status === 'pending' || p.status === 'requested' ? 'bg-amber-100 text-amber-700' :
                            p.status === 'failed' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{p.status}</Badge>
                          <span className="text-muted-foreground">{fmtDate(p.created_at)}</span>
                        </div>
                        <span className="font-bold">{formatBRL(p.amount_cents)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* External bank account */}
              <div>
                <h4 className="text-xs font-bold mb-2 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-violet-500" />
                  Conta Bancária Externa
                </h4>
                {!bankAccount ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhuma conta externa vinculada</p>
                ) : (
                  <div className="bg-muted/20 rounded-lg p-3 space-y-1 text-[10px]">
                    <p><span className="font-bold">Tipo:</span> {bankAccount.account_type || "—"}</p>
                    <p><span className="font-bold">Banco:</span> {bankAccount.bank_name || bankAccount.bank_code || "—"}</p>
                    <p><span className="font-bold">Agência:</span> {bankAccount.branch || "—"}</p>
                    <p><span className="font-bold">Conta:</span> {bankAccount.account_number || "—"}</p>
                    <p><span className="font-bold">PIX:</span> {bankAccount.pix_key || "—"}</p>
                    <p><span className="font-bold">Titular:</span> {bankAccount.holder_name || "—"}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
