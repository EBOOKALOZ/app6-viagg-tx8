/**
 * PlatformWithdraw — botão "Sacar para Mercado Pago" + modal + histórico.
 *
 * UI do withdrawService (src/lib/payments/withdrawService.ts). Não toca em
 * ledger/carteiras: toda solicitação é registrada auditada via RPC
 * platform_request_withdraw. Em Sandbox NENHUMA API de saque é chamada
 * (status 'sandbox_simulado'); em Produção fica 'pending' até o backend do
 * withdrawService ganhar a integração oficial MP (TODO lá).
 */
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  requestWithdraw,
  listWithdrawals,
  getPlatformAvailableBalance,
  detectWithdrawEnvironment,
  type WithdrawRecord,
} from "@/lib/payments/withdrawService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Landmark, Loader2, HandCoins, FlaskConical } from "lucide-react";

const fmtBRL = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_BADGE: Record<WithdrawRecord["status"], { label: string; cls: string }> = {
  pending:          { label: "Pendente",         cls: "bg-amber-100 text-amber-700" },
  processing:       { label: "Processando",      cls: "bg-blue-100 text-blue-700" },
  completed:        { label: "Concluído",        cls: "bg-emerald-100 text-emerald-700" },
  failed:           { label: "Falhou",           cls: "bg-red-100 text-red-700" },
  sandbox_simulado: { label: "Sandbox Simulado", cls: "bg-violet-100 text-violet-700" },
};

/** Saldo disponível p/ saque (tesouraria platform_main), com refetch. */
export function usePlatformWithdrawBalance() {
  return useQuery({
    queryKey: ["platform-withdraw-balance"],
    queryFn: getPlatformAvailableBalance,
    staleTime: 30_000,
  });
}

// ── Botão + Modal ─────────────────────────────────────────────────────────────
export function PlatformWithdrawButton({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const { data: balance = 0, isLoading } = usePlatformWithdrawBalance();
  const environment = detectWithdrawEnvironment();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const parsed = parseFloat(amount.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= balance;

  const reset = useCallback(() => { setAmount(""); setSubmitting(false); }, []);

  const handleConfirm = async () => {
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    if (parsed > balance) {
      toast.error("Valor maior que o saldo disponível.");
      return;
    }
    setSubmitting(true);
    try {
      const { record, environment: env } = await requestWithdraw({
        amountBrl: parsed,
        metadata: { origem: "admin-financeiro" },
      });
      if (env === "sandbox") {
        toast.success("Solicitação registrada com sucesso.", {
          description:
            "O ambiente Sandbox do Mercado Pago não permite transferências reais de saldo.",
          duration: 7000,
        });
      } else {
        toast.success("Solicitação de saque registrada.", {
          description: `ID ${record.request_id.slice(0, 8)} — aguardando processamento.`,
        });
      }
      setOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ["platform-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["platform-withdraw-balance"] });
    } catch (e: any) {
      toast.error("Não foi possível registrar o saque", { description: e?.message });
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        disabled={isLoading || balance <= 0}
        onClick={() => setOpen(true)}
        className={className ?? "mt-2 h-8 gap-1.5 bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold"}
      >
        <Landmark className="h-3.5 w-3.5" />
        Sacar para Mercado Pago
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <HandCoins className="h-5 w-5" />
              </span>
              Sacar para Mercado Pago
            </DialogTitle>
            <DialogDescription>
              Transfere o saldo líquido da plataforma para a conta Mercado Pago.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {environment === "sandbox" && (
              <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-violet-700">
                <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-xs font-medium">
                  Ambiente <strong>Sandbox</strong>: a solicitação é registrada e
                  auditada, mas nenhuma transferência real é executada.
                </p>
              </div>
            )}

            <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                Saldo disponível
              </p>
              <p className="text-xl font-black text-blue-700">{fmtBRL(balance)}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="withdraw-amount" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Valor do saque
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">R$</span>
                <Input
                  id="withdraw-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                  className="pl-10 text-lg font-bold"
                />
              </div>
              {amount && !valid && (
                <p className="text-xs font-medium text-red-600">
                  {Number.isFinite(parsed) && parsed > balance
                    ? "Valor maior que o saldo disponível."
                    : "Informe um valor maior que zero."}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!valid || submitting}
              className="bg-blue-600 text-white hover:bg-blue-700 font-bold"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Histórico de Saques ───────────────────────────────────────────────────────
export function PlatformWithdrawHistory() {
  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["platform-withdrawals"],
    queryFn: () => listWithdrawals(50),
    staleTime: 30_000,
  });

  // Tabela ainda não criada (migration pendente) → seção silenciosa.
  const [tableMissing, setTableMissing] = useState(false);
  useEffect(() => {
    if (error && /platform_withdrawals/i.test(String((error as Error).message))) {
      setTableMissing(true);
    }
  }, [error]);
  if (tableMissing) return null;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-5 w-5 text-blue-600" /> Histórico de Saques
          <Badge variant="outline" className="ml-2 text-[10px]">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ambiente</TableHead>
                <TableHead>ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">Carregando...</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">Nenhum saque solicitado ainda.</TableCell></TableRow>
              )}
              {rows.map((w) => {
                const badge = STATUS_BADGE[w.status] ?? { label: w.status, cls: "bg-zinc-100 text-zinc-700" };
                return (
                  <TableRow key={w.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(w.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-bold">
                      {fmtBRL(Number(w.amount))}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${badge.cls}`}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {w.environment === "sandbox" ? "Sandbox" : "Produção"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate font-mono text-[10px] text-muted-foreground">
                      {w.request_id}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
