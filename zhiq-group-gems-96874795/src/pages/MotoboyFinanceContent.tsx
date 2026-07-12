import { useState } from "react";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  Target,
  Info,
  Loader2,
  HandCoins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMotoboyFinance } from "@/hooks/useMotoboyFinance";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { MotoboyPageTemplate } from '@/components/motoboy/MotoboyPageTemplate';
import { TierLadderCard } from '@/components/motoboy/TierLadderCard';
import { cn } from "@/lib/utils";

export default function MotoboyFinanceContent() {
  const {
    balance,
    todaySummary,
    timeline,
    chartData,
    commissionData,
    payoutRequests,
    isLoading,
    isLoadingChart,
    isLoadingCommission,
    requestPayout,
    isRequestingPayout,
  } = useMotoboyFinance();

  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleRequestPayout = async () => {
    const amountValue = parseFloat(payoutAmount.replace(",", "."));
    
    if (isNaN(amountValue) || amountValue <= 0) {
      toast.error("Valor inválido");
      return;
    }

    if (amountValue > balance) {
      toast.error("Saldo insuficiente");
      return;
    }

    try {
      const amountCents = Math.round(amountValue * 100);
      await requestPayout(amountCents);
      toast.success("Solicitação de saque enviada!");
      setPayoutModalOpen(false);
      setPayoutAmount("");
    } catch (error) {
      toast.error("Erro ao solicitar saque");
    }
  };

  const getEntryTypeLabel = (entryType: string | null, amountCents: number) => {
    if (amountCents > 0) return "Crédito";
    if (amountCents < 0) return "Débito";
    return entryType || "Transação";
  };

  const getEntryReferenceLabel = (referenceType: string | null) => {
    switch (referenceType) {
      case "service_order":
        return "Entrega";
      case "payout":
        return "Saque";
      case "bonus":
        return "Bônus";
      default:
        return referenceType || "—";
    }
  };

  const getPayoutStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return { label: "Pendente", className: "text-warning" };
      case "processing":
        return { label: "Processando", className: "text-info" };
      case "completed":
        return { label: "Concluído", className: "text-success" };
      case "failed":
        return { label: "Falhou", className: "text-destructive" };
      default:
        return { label: status, className: "text-muted-foreground" };
    }
  };

  const commissionPercent = commissionData?.commissionPercent ?? 25;
  const activeGroups = commissionData?.activeGroups ?? 0;
  const groupsToMin = Math.max(0, 6 - activeGroups);

  return (
    <MotoboyPageTemplate title="Financeiro" icon={Wallet}>

      {/* Main Balance Card */}
      <Card className="bg-gradient-to-br from-motoboy to-motoboy-hover text-white border-0">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-5 w-5 opacity-80" />
            <p className="text-sm opacity-80">Saldo Disponível</p>
          </div>
          {isLoading ? (
            <Skeleton className="h-10 w-40 bg-white/20" />
          ) : (
            <p className="text-3xl font-bold">{formatCurrency(balance)}</p>
          )}
          <Button
            className="mt-4 bg-white text-motoboy hover:bg-white/90"
            onClick={() => setPayoutModalOpen(true)}
            disabled={balance <= 0}
          >
            <HandCoins className="h-4 w-4 mr-2" />
            Solicitar Saque
          </Button>
        </CardContent>
      </Card>

      {/* Today Summary */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Resumo Hoje
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-3 gap-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-lg font-bold text-success">
                  {formatCurrency(todaySummary.totalReceived)}
                </p>
                <p className="text-xs text-muted-foreground">Recebido</p>
              </div>
              <div>
                <p className="text-lg font-bold text-destructive">
                  {formatCurrency(todaySummary.totalWithdrawn)}
                </p>
                <p className="text-xs text-muted-foreground">Sacado</p>
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">
                  {todaySummary.transactionCount}
                </p>
                <p className="text-xs text-muted-foreground">Transações</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 7-Day Chart */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Ganhos - Últimos 7 dias
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingChart ? (
            <Skeleton className="h-40 w-full" />
          ) : chartData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
              Sem dados para exibir
            </div>
          ) : (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `R$${value}`}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), "Ganho"]}
                    labelFormatter={(label) => `Dia ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="hsl(var(--motoboy))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--motoboy))", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Commission Card — mesmo sistema premium da página Grupos */}
      {isLoadingCommission ? (
        <Skeleton className="h-40 w-full rounded-[20px]" />
      ) : (
        <TierLadderCard validGroups={activeGroups} />
      )}

      {/* Financial Timeline */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Extrato
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : timeline.length === 0 ? (
            <div className="p-6 text-center">
              <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhuma transação ainda
              </p>
            </div>
          ) : (
            <div className="divide-y max-h-80 overflow-y-auto">
              {timeline.map((entry) => (
                <div key={entry.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {entry.amount_cents > 0 ? (
                        <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
                          <ArrowDownLeft className="h-4 w-4 text-success" />
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
                          <ArrowUpRight className="h-4 w-4 text-destructive" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-sm">
                          {getEntryReferenceLabel(entry.reference_type)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(entry.created_at), "dd/MM 'às' HH:mm", {
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`font-semibold text-sm ${
                        entry.amount_cents > 0 ? "text-success" : "text-destructive"
                      }`}
                    >
                      {entry.amount_cents > 0 ? "+" : ""}
                      {formatCurrency(entry.amount_cents / 100)}
                    </span>
                  </div>

                  {/* Discriminação: valor do serviço, comissão aplicada (pelos grupos) e líquido */}
                  {entry.gross_cents != null && entry.fee_cents != null && (
                    <div className="mt-2 ml-11 rounded-lg bg-muted/40 border border-muted px-3 py-2 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Valor do serviço</span>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(entry.gross_cents / 100)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Comissão da plataforma ({entry.fee_percent}%)
                        </span>
                        <span className="font-semibold tabular-nums text-destructive">
                          − {formatCurrency(entry.fee_cents / 100)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs border-t border-muted pt-1">
                        <span className="text-muted-foreground">Você recebeu</span>
                        <span className="font-bold tabular-nums text-success">
                          {formatCurrency(entry.amount_cents / 100)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Payouts */}
      {payoutRequests.filter((p) => p.status === "pending").length > 0 && (
        <Alert className="bg-warning/10 border-warning/20">
          <Info className="h-4 w-4 text-warning" />
          <AlertDescription className="text-xs">
            Você tem{" "}
            <strong>
              {payoutRequests.filter((p) => p.status === "pending").length}
            </strong>{" "}
            solicitação de saque pendente.
          </AlertDescription>
        </Alert>
      )}

      {/* Info */}
      <Alert className="bg-motoboy/5 border-motoboy/20">
        <Info className="h-4 w-4 text-motoboy" />
        <AlertDescription className="text-xs text-motoboy-header-foreground/80">
          Os valores exibidos são calculados em tempo real a partir do livro
          razão financeiro (ledger).
        </AlertDescription>
      </Alert>

      {/* Payout Modal */}
      <Dialog open={payoutModalOpen} onOpenChange={setPayoutModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar Saque</DialogTitle>
            <DialogDescription>
              Saldo disponível: {formatCurrency(balance)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Valor do saque (R$)</Label>
              <Input
                id="amount"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={payoutAmount}
                onChange={(e) => {
                  // Allow only numbers and comma/period
                  const value = e.target.value.replace(/[^0-9,\.]/g, "");
                  setPayoutAmount(value);
                }}
              />
            </div>
            {parseFloat(payoutAmount.replace(",", ".")) > balance && (
              <p className="text-sm text-destructive">Saldo insuficiente</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPayoutModalOpen(false)}
              disabled={isRequestingPayout}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRequestPayout}
              disabled={
                isRequestingPayout ||
                !payoutAmount ||
                parseFloat(payoutAmount.replace(",", ".")) > balance ||
                parseFloat(payoutAmount.replace(",", ".")) <= 0
              }
              className="bg-motoboy hover:bg-motoboy-hover"
            >
              {isRequestingPayout ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Confirmar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MotoboyPageTemplate>
  );
}
