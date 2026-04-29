/**
 * PayWithdrawalsTab — Unified premium withdrawal operations panel
 * Replaces PayWithdrawalForm + PayWithdrawalQueue
 */
import { useState } from "react";
import {
  Banknote, Search, Eye, Check, X, RefreshCw, Loader2, Plus,
  ChevronLeft, ChevronRight, Filter, Clock, CheckCircle, XCircle,
  ArrowDownCircle, AlertTriangle, Send, CreditCard, FileText,
  Copy, ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  usePayWithdrawalQueue,
  useRequestWithdrawal,
  useApproveWithdrawal,
  useCancelWithdrawal,
  useReprocessWithdrawal,
} from "@/hooks/useAdminPayWithdrawals";
import { usePayPlatformBankAccounts } from "@/hooks/useAdminPayBankAccounts";
import { usePayTreasuryStats } from "@/hooks/useAdminPayTreasury";
import { formatBRL, formatDate, formatDateFull, getPayoutStatusLabel, getPayoutStatusColor, truncateId, validateWithdrawalAmount } from "@/skills/pay/payUtils";
import type { WithdrawalRequest } from "@/skills/pay/payTypes";

const STATUSES = [
  { value: "all", label: "Todos status" },
  { value: "pending_approval", label: "Pendente" },
  { value: "approved", label: "Aprovado" },
  { value: "queued", label: "Na fila" },
  { value: "processing", label: "Processando" },
  { value: "paid", label: "Pago" },
  { value: "failed", label: "Falhou" },
  { value: "canceled", label: "Cancelado" },
  { value: "reversed", label: "Revertido" },
];

export default function PayWithdrawalsTab() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [selected, setSelected] = useState<WithdrawalRequest | null>(null);

  // New withdrawal form
  const [amount, setAmount] = useState("");
  const [destAccountId, setDestAccountId] = useState("");
  const [observation, setObservation] = useState("");

  const { data: withdrawals, isLoading } = usePayWithdrawalQueue({ status: statusFilter });
  const { data: accounts } = usePayPlatformBankAccounts();
  const { data: stats } = usePayTreasuryStats();
  const requestMutation = useRequestWithdrawal();
  const approveMutation = useApproveWithdrawal();
  const cancelMutation = useCancelWithdrawal();
  const reprocessMutation = useReprocessWithdrawal();

  const activeAccounts = accounts?.filter(a => a.is_active) || [];

  // Computed counts
  const all = withdrawals || [];
  const counts = {
    pending: all.filter(w => w.status === "pending_approval").length,
    queued: all.filter(w => ["approved", "queued"].includes(w.status)).length,
    processing: all.filter(w => w.status === "processing").length,
    paid: all.filter(w => w.status === "paid").length,
    failed: all.filter(w => w.status === "failed").length,
    totalPaidCents: all.filter(w => w.status === "paid").reduce((s, w) => s + w.amount_cents, 0),
  };

  const filtered = search.trim()
    ? all.filter(w =>
        w.id.includes(search) ||
        w.idempotency_key?.includes(search) ||
        (w as any).provider_payout_id?.toString().includes(search)
      )
    : all;

  const handleSubmit = async () => {
    const amountCents = Math.round(parseFloat(amount) * 100);
    const validation = validateWithdrawalAmount(amountCents, stats?.availableForWithdrawalCents || 0);
    if (!validation.valid) { toast({ title: "Erro", description: validation.error, variant: "destructive" }); return; }
    if (!destAccountId) { toast({ title: "Erro", description: "Selecione conta", variant: "destructive" }); return; }

    try {
      await requestMutation.mutateAsync({ amountCents, destinationAccountId: destAccountId, observation });
      toast({ title: "Saque solicitado", description: "Aguardando aprovação" });
      setShowNewForm(false);
      setAmount(""); setDestAccountId(""); setObservation("");
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Falha ao solicitar", variant: "destructive" });
    }
  };

  const summaryCards = [
    { label: "Pendentes", value: counts.pending, icon: Clock, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
    { label: "Na Fila", value: counts.queued, icon: Send, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
    { label: "Processando", value: counts.processing, icon: Loader2, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
    { label: "Concluídos", value: counts.paid, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
    { label: "Falhados", value: counts.failed, icon: XCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
    { label: "Total Sacado", value: formatBRL(counts.totalPaidCents), icon: Banknote, color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-950/30", isAmount: true },
  ];

  return (
    <div className="space-y-5">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-md">
            <Banknote className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-black tracking-tight">Saques da Plataforma</h3>
            <p className="text-[10px] text-muted-foreground">Fila operacional de transferências e retiradas do caixa</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowNewForm(true)} className="gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-md">
          <Plus className="h-3.5 w-3.5" /> Solicitar Saque
        </Button>
      </div>

      {/* ─── Summary Cards ─── */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5">
        {summaryCards.map(c => (
          <Card key={c.label} className="border shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
                <span className="text-[8px] text-muted-foreground font-extrabold uppercase tracking-[0.15em]">{c.label}</span>
              </div>
              <p className={`text-lg font-black tabular-nums ${c.color}`}>
                {(c as any).isAmount ? c.value : c.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─── Filters ─── */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-8 text-[11px]"><Filter className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar por ID, idempotency_key..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-[11px]" />
        </div>
      </div>

      {/* ─── Table ─── */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <Card className="border-0 shadow-lg">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["ID","Data","Valor","Taxa","Líquido","Conta Destino","Status","Ação"].map(h => (
                      <th key={h} className="text-left py-2.5 px-3 font-extrabold text-muted-foreground text-[9px] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(w => (
                    <tr key={w.id} className="border-b hover:bg-accent/30 transition-colors cursor-pointer" onClick={() => setSelected(w)}>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-muted-foreground">{truncateId(w.id, 10)}</td>
                      <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">{formatDate(w.created_at)}</td>
                      <td className="py-2.5 px-3 font-bold tabular-nums">{formatBRL(w.amount_cents)}</td>
                      <td className="py-2.5 px-3 text-muted-foreground tabular-nums">{w.fee_cents ? formatBRL(w.fee_cents) : "—"}</td>
                      <td className="py-2.5 px-3 font-bold tabular-nums">{formatBRL(w.net_amount_cents || w.amount_cents)}</td>
                      <td className="py-2.5 px-3 text-muted-foreground text-[10px]">{w.destination_bank_name || w.destination_pix_key || truncateId(w.destination_account_id, 8)}</td>
                      <td className="py-2.5 px-3"><Badge className={`text-[8px] font-bold ${getPayoutStatusColor(w.status)}`}>{getPayoutStatusLabel(w.status)}</Badge></td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          {w.status === "pending_approval" && (
                            <>
                              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-emerald-600 hover:bg-emerald-50" onClick={() => approveMutation.mutate(w.id)}>
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent>Aprovar</TooltipContent></Tooltip></TooltipProvider>
                              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:bg-red-50" onClick={() => cancelMutation.mutate(w.id)}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent>Cancelar</TooltipContent></Tooltip></TooltipProvider>
                            </>
                          )}
                          {w.status === "failed" && (
                            <TooltipProvider><Tooltip><TooltipTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-amber-600 hover:bg-amber-50" onClick={() => reprocessMutation.mutate(w.id)}>
                                <RefreshCw className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger><TooltipContent>Reprocessar</TooltipContent></Tooltip></TooltipProvider>
                          )}
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setSelected(w)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="py-16 text-center text-muted-foreground">
                      <Banknote className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                      Nenhum saque encontrado
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── New Withdrawal Dialog ─── */}
      <Dialog open={showNewForm} onOpenChange={setShowNewForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Banknote className="h-5 w-5 text-emerald-600" /> Solicitar Saque</DialogTitle>
            <DialogDescription>O saque entrará como pending_approval. Backend-driven.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3">
              <p className="text-[10px] text-emerald-600 font-bold uppercase">Disponível para saque</p>
              <p className="text-xl font-black text-emerald-700 tabular-nums">{formatBRL(stats?.availableForWithdrawalCents || 0)}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Conta destino</Label>
              <Select value={destAccountId} onValueChange={setDestAccountId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecionar conta..." /></SelectTrigger>
                <SelectContent>
                  {activeAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-3 w-3" />
                        <span>{a.account_label || a.bank_name || "Conta"}</span>
                        {a.is_default && <Badge className="text-[7px] bg-emerald-100 text-emerald-700 px-1">Padrão</Badge>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Valor (R$)</Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" className="h-9 text-lg font-bold" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Observação (opcional)</Label>
              <Textarea value={observation} onChange={e => setObservation(e.target.value)} placeholder="Motivo ou referência..." className="h-16 text-sm" />
            </div>
            <Button onClick={handleSubmit} disabled={requestMutation.isPending} className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-teal-600">
              {requestMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Solicitar Saque
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Drawer ─── */}
      <Sheet open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <SheetContent className="w-[460px] sm:max-w-[460px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> Detalhe do Saque</SheetTitle>
            <SheetDescription>Informações completas e trilha operacional</SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="space-y-5 mt-4">
              {/* Amount card */}
              <div className="rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 p-5 text-white">
                <div className="flex items-center justify-between mb-3">
                  <Badge className={`text-[9px] font-bold ${getPayoutStatusColor(selected.status)}`}>{getPayoutStatusLabel(selected.status)}</Badge>
                  {selected.paid_at && <span className="text-[10px] text-white/50">Pago {formatDate(selected.paid_at)}</span>}
                </div>
                <p className="text-3xl font-black tabular-nums">{formatBRL(selected.amount_cents)}</p>
                <div className="flex gap-4 mt-2 text-[11px] text-white/50">
                  <span>Taxa: {selected.fee_cents ? formatBRL(selected.fee_cents) : "R$ 0,00"}</span>
                  <span>Líquido: {formatBRL(selected.net_amount_cents || selected.amount_cents)}</span>
                </div>
              </div>

              {/* Details grid */}
              <div className="space-y-2">
                {[
                  ["ID", selected.id],
                  ["Idempotency Key", selected.idempotency_key],
                  ["Status", getPayoutStatusLabel(selected.status)],
                  ["Owner", `${selected.owner_type} / ${truncateId(selected.owner_id, 12)}`],
                  ["Conta Destino", selected.destination_bank_name || selected.destination_pix_key || truncateId(selected.destination_account_id, 12)],
                  ["Solicitado em", formatDateFull(selected.created_at)],
                  ["Aprovado em", selected.approved_at ? formatDateFull(selected.approved_at) : "—"],
                  ["Aprovado por", selected.approved_by ? truncateId(selected.approved_by, 12) : "—"],
                  ["Pago em", selected.paid_at ? formatDateFull(selected.paid_at) : "—"],
                  ["Falha em", selected.failed_at ? formatDateFull(selected.failed_at) : "—"],
                  ["Motivo falha", selected.failure_reason || "—"],
                  ["Observação", selected.observation || "—"],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-start gap-2 text-[11px] py-1.5 border-b border-border/40">
                    <span className="font-bold text-muted-foreground min-w-[120px] shrink-0">{label}</span>
                    <span className="font-mono text-[10px] break-all">{value || "—"}</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              {selected.status === "pending_approval" && (
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 gap-1 bg-emerald-600" onClick={() => { approveMutation.mutate(selected.id); setSelected(null); }}>
                    <Check className="h-3.5 w-3.5" /> Aprovar
                  </Button>
                  <Button size="sm" variant="destructive" className="flex-1 gap-1" onClick={() => { cancelMutation.mutate(selected.id); setSelected(null); }}>
                    <X className="h-3.5 w-3.5" /> Cancelar
                  </Button>
                </div>
              )}
              {selected.status === "failed" && (
                <Button size="sm" className="w-full gap-1 bg-amber-600" onClick={() => { reprocessMutation.mutate(selected.id); setSelected(null); }}>
                  <RefreshCw className="h-3.5 w-3.5" /> Reprocessar
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
