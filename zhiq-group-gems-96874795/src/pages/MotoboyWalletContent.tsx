import { useState } from "react";
import {
  Wallet,
  HandCoins,
  Info,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  Loader2,
  Bike,
  Car,
  Truck,
  Users,
  Building2,
  QrCode,
  Check,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { MotoboyPageTemplate } from "@/components/motoboy/MotoboyPageTemplate";
import { useUnifiedBalance, useUnifiedTimeline } from "@/hooks/useUnifiedWallet";
import { useRequestPayout } from "@/hooks/useMotoboyFinance";
import { useMotoboyPayWallet } from "@/hooks/useMotoboyPayWallet";
import { useBankData } from "@/hooks/useBankData";
import { PixFormModal } from "@/components/wallet/PixFormModal";
import { BankAccountFormModal } from "@/components/wallet/BankAccountFormModal";
import { CommissionGoalTracker } from "@/components/wallet/CommissionGoalTracker";
import { BalanceCard } from "@/components/wallet/BalanceCard";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

// ============= Profile icon & color map =============
const PROFILE_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  motoboy: { icon: Bike, color: "text-motoboy", bg: "bg-motoboy/10" },
  driver: { icon: Car, color: "text-info", bg: "bg-info/10" },
  merchant: { icon: Building2, color: "text-success", bg: "bg-success/10" },
  passenger: { icon: Users, color: "text-primary", bg: "bg-primary/10" },
  freight: { icon: Truck, color: "text-warning", bg: "bg-warning/10" },
};

const PROFILE_LABELS: Record<string, string> = {
  motoboy: "Motoboy",
  driver: "Motorista",
  merchant: "Lojista",
  passenger: "Passageiro",
  freight: "Freteiro",
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const getReferenceLabel = (ref: string | null) => {
  switch (ref) {
    case "service_order": return "Entrega";
    case "payout": return "Saque";
    case "bonus": return "Bônus";
    case "ride": return "Corrida";
    default: return ref || "Transação";
  }
};

export default function MotoboyWalletContent() {
  const { total, byProfile, isLoading } = useUnifiedBalance();
  const [filterProfile, setFilterProfile] = useState<string | undefined>();
  const { data: timeline, isLoading: isLoadingTimeline } = useUnifiedTimeline(filterProfile);

  const requestPayoutMutation = useRequestPayout();
  const { balance: payBalance, earnings: payEarnings, commission, payouts: payPayouts } = useMotoboyPayWallet();
  const { bankData, isLoading: isBankLoading, refetch: refetchBankData, hasPixData, hasBankAccountData } = useBankData();

  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);

  const activeProfiles = byProfile.filter((p) => p.balanceCents !== 0 || true); // show all

  const handleRequestPayout = async () => {
    const amountValue = parseFloat(payoutAmount.replace(",", "."));
    if (isNaN(amountValue) || amountValue <= 0) {
      toast.error("Valor inválido");
      return;
    }
    if (amountValue > total) {
      toast.error("Saldo insuficiente");
      return;
    }
    try {
      await requestPayoutMutation.mutateAsync(Math.round(amountValue * 100));
      toast.success("Solicitação de saque enviada!");
      setPayoutModalOpen(false);
      setPayoutAmount("");
    } catch {
      toast.error("Erro ao solicitar saque");
    }
  };

  // Available filter options (only profiles that exist)
  const filterOptions = byProfile.map((p) => p.profileType);

  return (
    <MotoboyPageTemplate title="Carteira" subtitle="Unificada" icon={Wallet}>
      {/* ==================== HERO BALANCE ==================== */}
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-motoboy via-motoboy-hover to-[hsl(25,100%,35%)] text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.12),transparent_60%)]" />
        <CardContent className="relative p-6 space-y-4">
          <div className="flex items-center gap-2 opacity-80">
            <Wallet className="h-5 w-5" />
            <span className="text-sm font-medium">Saldo total disponível para saque</span>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-48 bg-white/20" />
              <div className="h-2" />
              <Skeleton className="h-8 w-32 bg-white/20" />
            </div>
          ) : (
            <p className="text-4xl font-extrabold tracking-tight animate-in fade-in slide-in-from-bottom-2 duration-500">
              {formatCurrency(total)}
            </p>
          )}

          <Button
            size="lg"
            className="bg-white text-motoboy hover:bg-white/90 font-semibold shadow-md transition-transform active:scale-95"
            onClick={() => setPayoutModalOpen(true)}
            disabled={total <= 0}
          >
            <HandCoins className="h-5 w-5 mr-2" />
            Sacar agora
          </Button>
        </CardContent>
      </Card>

      {/* ==================== PAY BALANCE BREAKDOWN (4 baldes contábeis) ==================== */}
      <BalanceCard
        title="Saldo da carteira (contábil)"
        availableCents={payBalance.availableCents}
        reservedCents={payBalance.reservedCents}
        pendingCents={payBalance.pendingCents}
        currentCents={payBalance.totalCents}
        isLoading={isLoading}
      />

      {/* ==================== EARNINGS & COMMISSION ==================== */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground font-bold uppercase">Ganhos Hoje</p>
              <p className="text-xl font-black text-emerald-600">{formatCurrency(payEarnings.todayCents / 100)}</p>
              <p className="text-[10px] text-muted-foreground">{payEarnings.todayCount} transações</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground font-bold uppercase">Ganhos Semana</p>
              <p className="text-xl font-black text-blue-600">{formatCurrency(payEarnings.weekCents / 100)}</p>
              <p className="text-[10px] text-muted-foreground">{payEarnings.weekCount} transações</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ==================== COMMISSION GOAL TRACKER ==================== */}
      {commission && (
        <CommissionGoalTracker
          activeGroups={commission.activeGroups ?? 0}
        />
      )}

      {/* ==================== PAYOUT STATUS ==================== */}
      {payPayouts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Últimos saques</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {payPayouts.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div>
                  <p className="text-sm font-medium">{formatCurrency(p.amount_cents / 100)}</p>
                  <p className="text-[10px] text-muted-foreground">{format(new Date(p.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                </div>
                <Badge className={`text-[9px] ${
                  p.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                  p.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                  p.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{p.status === 'completed' ? 'Pago' : p.status === 'pending' ? 'Pendente' : p.status === 'approved' ? 'Aprovado' : p.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ==================== ORIGINS BREAKDOWN ==================== */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Origem dos ganhos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : activeProfiles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma conta ativa encontrada
            </p>
          ) : (
            activeProfiles.map((p) => {
              const meta = PROFILE_META[p.profileType] || PROFILE_META.motoboy;
              const Icon = meta.icon;
              const balanceReais = p.balanceCents / 100;

              return (
                <div
                  key={p.profileType}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card hover:bg-accent/30 transition-colors"
                >
                  <div className={`h-10 w-10 rounded-full ${meta.bg} flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 ${meta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{p.label}</p>
                    <p className="text-xs text-muted-foreground">Perfil</p>
                  </div>
                  <span className={`font-semibold text-sm ${balanceReais > 0 ? "text-success" : "text-muted-foreground"}`}>
                    {formatCurrency(balanceReais)}
                  </span>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ==================== EDUCATIONAL NOTE ==================== */}
      <Alert className="border-motoboy/20 bg-motoboy/5">
        <Info className="h-4 w-4 text-motoboy" />
        <AlertDescription className="text-xs leading-relaxed">
          <strong>Sua carteira é única.</strong> Todos os valores ganhos em qualquer perfil
          (motoboy, moto-táxi, motorista, etc.) são somados em uma única carteira.
          Você pode sacar todo o saldo disponível, independentemente do perfil ativo.
        </AlertDescription>
      </Alert>

      {/* ==================== PAYMENT METHODS ==================== */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Métodos de saque
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <button
            onClick={() => setPixModalOpen(true)}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/60 hover:bg-accent/30 transition-colors text-left"
          >
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <QrCode className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Pix</p>
              <p className="text-xs text-muted-foreground">
                {hasPixData ? "Chave cadastrada" : "Cadastrar chave Pix"}
              </p>
            </div>
            {hasPixData && (
              <Badge variant="secondary" className="bg-success/10 text-success gap-1">
                <Check className="h-3 w-3" /> Ativo
              </Badge>
            )}
          </button>
          <button
            onClick={() => setBankModalOpen(true)}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/60 hover:bg-accent/30 transition-colors text-left"
          >
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Conta Bancária</p>
              <p className="text-xs text-muted-foreground">
                {hasBankAccountData ? "Conta cadastrada" : "Vincular banco"}
              </p>
            </div>
            {hasBankAccountData && (
              <Badge variant="secondary" className="bg-success/10 text-success gap-1">
                <Check className="h-3 w-3" /> Ativo
              </Badge>
            )}
          </button>
        </CardContent>
      </Card>

      {/* ==================== UNIFIED TIMELINE ==================== */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Extrato unificado
            </CardTitle>
            {/* Filter chips */}
            <div className="flex items-center gap-1 overflow-x-auto">
              <button
                onClick={() => setFilterProfile(undefined)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  !filterProfile ? "bg-motoboy text-white border-motoboy" : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                Todos
              </button>
              {filterOptions.map((pt) => {
                const label = PROFILE_LABELS[pt] || pt;
                return (
                  <button
                    key={pt}
                    onClick={() => setFilterProfile(pt === filterProfile ? undefined : pt)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap ${
                      filterProfile === pt ? "bg-motoboy text-white border-motoboy" : "border-border text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingTimeline ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : !timeline || timeline.length === 0 ? (
            <div className="p-8 text-center">
              <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma transação ainda</p>
            </div>
          ) : (
            <div className="divide-y max-h-96 overflow-y-auto">
              {timeline.map((entry) => {
                const meta = PROFILE_META[entry.profile_type] || PROFILE_META.motoboy;
                const Icon = meta.icon;
                const isCredit = entry.amount_cents > 0;

                return (
                  <div key={entry.id} className="flex items-center gap-3 p-3 animate-in fade-in duration-300">
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center ${isCredit ? "bg-success/10" : "bg-destructive/10"}`}>
                      {isCredit ? (
                        <ArrowDownLeft className="h-4 w-4 text-success" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-sm truncate">
                          {getReferenceLabel(entry.reference_type)}
                        </p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color} font-medium`}>
                          {PROFILE_LABELS[entry.profile_type] || entry.profile_type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(entry.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <span className={`font-semibold text-sm ${isCredit ? "text-success" : "text-destructive"}`}>
                      {isCredit ? "+" : ""}
                      {formatCurrency(entry.amount_cents / 100)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground text-center px-4">
        Seus dados financeiros são protegidos com criptografia de ponta a ponta.
      </p>

      {/* ==================== MODALS ==================== */}
      <Dialog open={payoutModalOpen} onOpenChange={setPayoutModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar Saque</DialogTitle>
            <DialogDescription>Saldo disponível: {formatCurrency(total)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="payout-amount">Valor do saque (R$)</Label>
              <Input
                id="payout-amount"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value.replace(/[^0-9,\.]/g, ""))}
              />
            </div>
            {parseFloat(payoutAmount.replace(",", ".")) > total && (
              <p className="text-sm text-destructive">Saldo insuficiente</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayoutModalOpen(false)} disabled={requestPayoutMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={handleRequestPayout}
              disabled={
                requestPayoutMutation.isPending ||
                !payoutAmount ||
                parseFloat(payoutAmount.replace(",", ".")) > total ||
                parseFloat(payoutAmount.replace(",", ".")) <= 0
              }
              className="bg-motoboy hover:bg-motoboy-hover"
            >
              {requestPayoutMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PixFormModal open={pixModalOpen} onOpenChange={setPixModalOpen} existingData={bankData} onSuccess={refetchBankData} />
      <BankAccountFormModal open={bankModalOpen} onOpenChange={setBankModalOpen} existingData={bankData} onSuccess={refetchBankData} />
    </MotoboyPageTemplate>
  );
}
