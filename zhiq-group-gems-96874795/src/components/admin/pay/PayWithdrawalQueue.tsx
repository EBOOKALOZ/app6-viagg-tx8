import { useState } from "react";
import {
  Banknote, Search, Eye, Check, X, RefreshCw, Loader2,
  ChevronLeft, ChevronRight, Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePayWithdrawalQueue,
  useApproveWithdrawal,
  useCancelWithdrawal,
  useReprocessWithdrawal,
} from "@/hooks/useAdminPayWithdrawals";
import { formatBRL, formatDate, getPayoutStatusLabel, getPayoutStatusColor, truncateId } from "@/skills/pay/payUtils";
import type { WithdrawalRequest } from "@/skills/pay/payTypes";
import { toast } from "sonner";

export default function PayWithdrawalQueue() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<WithdrawalRequest | null>(null);

  const { data: queue, isLoading } = usePayWithdrawalQueue({ status: statusFilter });
  const approveMut = useApproveWithdrawal();
  const cancelMut = useCancelWithdrawal();
  const reprocessMut = useReprocessWithdrawal();

  const handleApprove = async (id: string) => {
    try {
      await approveMut.mutateAsync(id);
      toast.success("Saque aprovado com sucesso");
    } catch (e: any) { toast.error("Erro ao aprovar", { description: e?.message }); }
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelMut.mutateAsync(id);
      toast.success("Saque cancelado");
    } catch (e: any) { toast.error("Erro ao cancelar", { description: e?.message }); }
  };

  const handleReprocess = async (id: string) => {
    try {
      await reprocessMut.mutateAsync(id);
      toast.success("Saque reenfileirado para processamento");
    } catch (e: any) { toast.error("Erro ao reprocessar", { description: e?.message }); }
  };

  return (
    <>
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                <Banknote className="h-4 w-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-sm font-black tracking-tight">Fila de Saques</CardTitle>
                <p className="text-[10px] text-muted-foreground">{queue?.length || 0} registro(s)</p>
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[170px] h-8 text-[11px]">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="pending_approval">Aguardando Aprovação</SelectItem>
                <SelectItem value="approved">Aprovados</SelectItem>
                <SelectItem value="queued">Na Fila</SelectItem>
                <SelectItem value="processing">Processando</SelectItem>
                <SelectItem value="paid">Pagos</SelectItem>
                <SelectItem value="failed">Falhos</SelectItem>
                <SelectItem value="canceled">Cancelados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !queue?.length ? (
            <div className="text-center py-12">
              <Banknote className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum saque encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-2.5 px-3 font-bold text-muted-foreground">Data</th>
                    <th className="text-right py-2.5 px-3 font-bold text-muted-foreground">Valor</th>
                    <th className="text-left py-2.5 px-3 font-bold text-muted-foreground">Destino</th>
                    <th className="text-center py-2.5 px-3 font-bold text-muted-foreground">Status</th>
                    <th className="text-center py-2.5 px-3 font-bold text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((w) => (
                    <tr key={w.id} className="border-b hover:bg-accent/30 transition-colors">
                      <td className="py-2.5 px-3 text-muted-foreground">{formatDate(w.created_at)}</td>
                      <td className="py-2.5 px-3 text-right font-bold">{formatBRL(w.amount_cents)}</td>
                      <td className="py-2.5 px-3">
                        <span className="text-muted-foreground">
                          {w.destination_bank_name || w.destination_pix_key || truncateId(w.destination_account_id, 12)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge className={`text-[9px] ${getPayoutStatusColor(w.status)} ${w.status === "processing" ? "animate-pulse" : ""}`}>
                          {getPayoutStatusLabel(w.status)}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-center gap-1">
                          {(w.status === "pending_approval" || w.status === "pending") && (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-emerald-600 hover:bg-emerald-50" onClick={() => handleApprove(w.id)} disabled={approveMut.isPending}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-red-500 hover:bg-red-50" onClick={() => handleCancel(w.id)} disabled={cancelMut.isPending}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          {w.status === "failed" && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-blue-600 hover:bg-blue-50" onClick={() => handleReprocess(w.id)} disabled={reprocessMut.isPending}>
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSelected(w)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Detail Dialog ─── */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Banknote className="h-4 w-4" />
              Detalhe do Saque
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className={`rounded-xl p-4 text-center ${selected.status === "paid" ? "bg-emerald-50" : selected.status === "failed" ? "bg-red-50" : "bg-blue-50"}`}>
                <Badge className={`text-xs mb-2 ${getPayoutStatusColor(selected.status)}`}>
                  {getPayoutStatusLabel(selected.status)}
                </Badge>
                <p className="text-2xl font-black">{formatBRL(selected.amount_cents)}</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
                {[
                  ["ID", selected.id],
                  ["Tipo", selected.owner_type],
                  ["Conta Destino", selected.destination_account_id || "—"],
                  ["PIX", selected.destination_pix_key || "—"],
                  ["Banco", selected.destination_bank_name || "—"],
                  ["Observação", selected.observation || "—"],
                  ["Idempotency Key", selected.idempotency_key || "—"],
                  ["Aprovado por", selected.approved_by || "—"],
                  ["Aprovado em", selected.approved_at ? formatDate(selected.approved_at) : "—"],
                  ["Pago em", selected.paid_at ? formatDate(selected.paid_at) : "—"],
                  ["Falha em", selected.failed_at ? formatDate(selected.failed_at) : "—"],
                  ["Motivo falha", selected.failure_reason || "—"],
                  ["Criado em", formatDate(selected.created_at)],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-start gap-2 text-[10px]">
                    <span className="font-bold text-muted-foreground min-w-[110px] shrink-0">{label}:</span>
                    <span className="font-mono break-all">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
