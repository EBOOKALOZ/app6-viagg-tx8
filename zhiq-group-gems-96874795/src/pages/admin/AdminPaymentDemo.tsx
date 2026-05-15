/**
 * AdminPaymentDemo — Simulação ponta-a-ponta do fluxo financeiro.
 *
 * Permite executar o ciclo completo:
 *  1. Lojista compra pacote → CREDIT
 *  2. Lojista chama motoboy → HOLD
 *  3. Entrega concluída → RELEASE + CREDIT motoboy + FEE plataforma
 *     OU cancelada → REFUND lojista
 *  4. Motoboy saca PIX → PAYOUT
 *
 * Valida toda a arquitetura: driver, ledger, idempotência, double-entry.
 * Sem precisar do banco.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Beaker,
  ShoppingCart,
  Bike,
  CheckCircle2,
  XCircle,
  Banknote,
  RotateCcw,
  ArrowRight,
  AlertTriangle,
  Coins,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

import { usePaymentsOrchestrator } from '@/hooks/usePaymentsOrchestrator';
import {
  listAccounts,
  listAllEntries,
  computeBalance,
  resetLocalLedger,
  getOrCreateAccount,
} from '@/lib/payments/local-ledger';
import type { LedgerEntry, LedgerEntryType } from '@/lib/payments';

const DEMO_MERCHANT_ID = 'demo-merchant-001';
const DEMO_MOTOBOY_ID = 'demo-motoboy-001';

const LEDGER_QK = ['local-ledger'] as const;

/* ─────────── helpers visuais ─────────── */

const ENTRY_COLORS: Record<LedgerEntryType, string> = {
  CREDIT: 'bg-emerald-100 text-emerald-700',
  DEBIT: 'bg-rose-100 text-rose-700',
  HOLD: 'bg-amber-100 text-amber-700',
  RELEASE: 'bg-blue-100 text-blue-700',
  REFUND: 'bg-purple-100 text-purple-700',
  FEE: 'bg-pink-100 text-pink-700',
  PAYOUT: 'bg-orange-100 text-orange-700',
  PAYOUT_REVERSAL: 'bg-yellow-100 text-yellow-700',
  ADJUSTMENT: 'bg-slate-100 text-slate-700',
  BONUS: 'bg-cyan-100 text-cyan-700',
  EXPIRATION: 'bg-gray-100 text-gray-700',
};

const ENTRY_SIGN: Record<LedgerEntryType, '+' | '−'> = {
  CREDIT: '+',
  DEBIT: '−',
  HOLD: '−',
  RELEASE: '+',
  REFUND: '+',
  FEE: '−',
  PAYOUT: '−',
  PAYOUT_REVERSAL: '+',
  ADJUSTMENT: '+',
  BONUS: '+',
  EXPIRATION: '−',
};

/* ─────────── página ─────────── */

export default function AdminPaymentDemo() {
  const queryClient = useQueryClient();
  const {
    purchaseCredits,
    requestDelivery,
    completeDelivery,
    cancelDelivery,
    requestPayout,
    isPending,
  } = usePaymentsOrchestrator();

  // Estado dos parâmetros do demo
  const [packageCredits, setPackageCredits] = useState(100);
  const [deliveryCost, setDeliveryCost] = useState(7);
  const [platformFee, setPlatformFee] = useState(2);
  const [payoutAmount, setPayoutAmount] = useState(5);

  // Hold ID gerado pela última chamada (pra completar/cancelar a mesma)
  const [pendingHoldId, setPendingHoldId] = useState<string | null>(null);
  const [pendingDeliveryId, setPendingDeliveryId] = useState<string | null>(null);

  // Re-render quando ledger muda
  const { data: snapshot } = useQuery({
    queryKey: LEDGER_QK,
    queryFn: () => ({
      accounts: listAccounts(),
      entries: listAllEntries({ limit: 50 }),
    }),
    refetchInterval: 1000,
  });

  const accounts = snapshot?.accounts ?? [];
  const entries = snapshot?.entries ?? [];

  // Saldos calculados (derivados do ledger)
  const balances = accounts.map((a) => ({
    account: a,
    balance: computeBalance(a.id),
  }));

  const merchantBalance = balances.find(
    (b) =>
      b.account.account_type === 'merchant_credits' &&
      b.account.owner_user_id === DEMO_MERCHANT_ID,
  );
  const motoboyBalance = balances.find(
    (b) =>
      b.account.account_type === 'motoboy' &&
      b.account.owner_user_id === DEMO_MOTOBOY_ID,
  );

  /* ─────────── ações ─────────── */

  const handleReset = () => {
    if (!confirm('Resetar todo o ledger local? Isso apaga contas, entries e idempotency cache.')) return;
    resetLocalLedger();
    setPendingHoldId(null);
    setPendingDeliveryId(null);
    queryClient.invalidateQueries({ queryKey: LEDGER_QK });
    toast.success('Ledger resetado');
  };

  const handlePurchase = async () => {
    try {
      const res = await purchaseCredits({
        merchant_user_id: DEMO_MERCHANT_ID,
        package_credits: packageCredits,
        package_price_cents: packageCredits * 100, // 1 crédito = R$1 (demo)
        package_name: `Pacote ${packageCredits}`,
      });
      toast.success(
        `Compra: ${res.charge.status}${res.ledger_tx_id ? ` · tx ${res.ledger_tx_id.slice(-6)}` : ''}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro na compra');
    }
  };

  const handleRequestDelivery = async () => {
    try {
      const deliveryId = `dlv_${Date.now().toString(36)}`;
      const res = await requestDelivery({
        merchant_user_id: DEMO_MERCHANT_ID,
        motoboy_user_id: DEMO_MOTOBOY_ID,
        credits_cost: deliveryCost,
        delivery_id: deliveryId,
      });
      setPendingHoldId(res.hold_entry_id);
      setPendingDeliveryId(deliveryId);
      toast.success(`HOLD criado · ${deliveryCost} créditos retidos`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro');
    }
  };

  const handleCompleteDelivery = async () => {
    if (!pendingHoldId || !pendingDeliveryId) {
      toast.error('Crie uma chamada de motoboy primeiro');
      return;
    }
    try {
      await completeDelivery({
        hold_entry_id: pendingHoldId,
        merchant_user_id: DEMO_MERCHANT_ID,
        motoboy_user_id: DEMO_MOTOBOY_ID,
        credits_cost: deliveryCost,
        platform_fee_cents: platformFee,
        delivery_id: pendingDeliveryId,
      });
      setPendingHoldId(null);
      setPendingDeliveryId(null);
      toast.success(
        `Entrega finalizada · motoboy recebeu ${deliveryCost - platformFee}, plataforma ${platformFee}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro');
    }
  };

  const handleCancelDelivery = async () => {
    if (!pendingHoldId || !pendingDeliveryId) {
      toast.error('Crie uma chamada de motoboy primeiro');
      return;
    }
    try {
      await cancelDelivery({
        hold_entry_id: pendingHoldId,
        merchant_user_id: DEMO_MERCHANT_ID,
        credits_cost: deliveryCost,
        delivery_id: pendingDeliveryId,
        reason: 'Cancelamento demo',
      });
      setPendingHoldId(null);
      setPendingDeliveryId(null);
      toast.success(`Cancelada · ${deliveryCost} créditos devolvidos`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro');
    }
  };

  const handlePayout = async () => {
    try {
      const res = await requestPayout({
        motoboy_user_id: DEMO_MOTOBOY_ID,
        amount_cents: payoutAmount,
        pix_key: 'demo@viagg.local',
        pix_key_type: 'email',
      });
      toast.success(`Saque ${res.payout.status} · ${payoutAmount} créditos`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro');
    }
  };

  // Cria contas demo se ainda não existirem
  const ensureDemoAccounts = () => {
    getOrCreateAccount('merchant_credits', DEMO_MERCHANT_ID, 'Lojista Demo');
    getOrCreateAccount('motoboy', DEMO_MOTOBOY_ID, 'Motoboy Demo');
    getOrCreateAccount('platform_escrow', null, 'Escrow Plataforma');
    getOrCreateAccount('platform_revenue', null, 'Receita Plataforma');
    getOrCreateAccount('gateway_clearing', null, 'Gateway Clearing');
    queryClient.invalidateQueries({ queryKey: LEDGER_QK });
    toast.success('Contas demo criadas');
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* ═══ HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-fuchsia-500 via-violet-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-500/20 ring-2 ring-violet-400/20">
            <Beaker className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Demo · Fluxo Financeiro</h1>
            <p className="text-[10px] text-muted-foreground/60 font-medium tracking-wide">
              Mock driver · Ledger append-only · Idempotente · Double-entry
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={ensureDemoAccounts}>
            Criar contas demo
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} className="text-red-600">
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
        </div>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>Demo em localStorage.</strong> Use os botões abaixo para simular o ciclo
          completo. Cada operação grava entries no ledger append-only. Saldos são SEMPRE
          derivados do ledger (nunca persistidos). Idempotência protege contra
          duplicidade de clique.
        </AlertDescription>
      </Alert>

      {/* ═══ SALDOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BalanceCard
          icon={ShoppingCart}
          color="from-blue-500 to-indigo-600"
          label="Lojista (créditos)"
          available={merchantBalance?.balance.available_cents ?? 0}
          held={merchantBalance?.balance.held_cents ?? 0}
          total={merchantBalance?.balance.total_cents ?? 0}
        />
        <BalanceCard
          icon={Bike}
          color="from-emerald-500 to-teal-600"
          label="Motoboy (créditos)"
          available={motoboyBalance?.balance.available_cents ?? 0}
          held={motoboyBalance?.balance.held_cents ?? 0}
          total={motoboyBalance?.balance.total_cents ?? 0}
        />
      </div>

      {/* ═══ AÇÕES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Compra de pacote */}
        <ActionCard
          icon={Coins}
          title="1. Lojista compra pacote"
          color="border-blue-300"
        >
          <Label className="text-xs">Quantidade de créditos</Label>
          <Input
            type="number"
            value={packageCredits}
            onChange={(e) => setPackageCredits(Number(e.target.value))}
            min={1}
          />
          <Button
            className="w-full"
            size="sm"
            onClick={handlePurchase}
            disabled={isPending}
          >
            Comprar pacote
          </Button>
        </ActionCard>

        {/* 2. Chamar motoboy */}
        <ActionCard
          icon={ArrowRight}
          title="2. Chamar motoboy (HOLD)"
          color="border-amber-300"
        >
          <Label className="text-xs">Custo da entrega (créditos)</Label>
          <Input
            type="number"
            value={deliveryCost}
            onChange={(e) => setDeliveryCost(Number(e.target.value))}
            min={1}
          />
          <Button
            className="w-full"
            size="sm"
            onClick={handleRequestDelivery}
            disabled={isPending || Boolean(pendingHoldId)}
          >
            Chamar motoboy
          </Button>
          {pendingHoldId && (
            <Badge variant="outline" className="text-[10px] truncate">
              Hold: {pendingHoldId.slice(-12)}
            </Badge>
          )}
        </ActionCard>

        {/* 3. Finalizar / cancelar */}
        <ActionCard
          icon={CheckCircle2}
          title="3. Finalizar entrega"
          color="border-emerald-300"
        >
          <Label className="text-xs">Comissão plataforma (créditos)</Label>
          <Input
            type="number"
            value={platformFee}
            onChange={(e) => setPlatformFee(Number(e.target.value))}
            min={0}
          />
          <Button
            className="w-full"
            size="sm"
            onClick={handleCompleteDelivery}
            disabled={isPending || !pendingHoldId}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" /> Concluir
          </Button>
          <Button
            className="w-full"
            size="sm"
            variant="outline"
            onClick={handleCancelDelivery}
            disabled={isPending || !pendingHoldId}
          >
            <XCircle className="h-4 w-4 mr-1" /> Cancelar (REFUND)
          </Button>
        </ActionCard>

        {/* 4. Saque PIX */}
        <ActionCard
          icon={Banknote}
          title="4. Motoboy saca PIX"
          color="border-orange-300"
        >
          <Label className="text-xs">Valor do saque (créditos)</Label>
          <Input
            type="number"
            value={payoutAmount}
            onChange={(e) => setPayoutAmount(Number(e.target.value))}
            min={1}
          />
          <Button
            className="w-full"
            size="sm"
            onClick={handlePayout}
            disabled={isPending}
          >
            <Banknote className="h-4 w-4 mr-1" /> Sacar PIX
          </Button>
        </ActionCard>
      </div>

      <Separator />

      {/* ═══ TODAS AS CONTAS */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contas no ledger</CardTitle>
        </CardHeader>
        <CardContent>
          {balances.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma conta ainda. Clique em "Criar contas demo" para começar.
            </p>
          ) : (
            <div className="space-y-2">
              {balances.map(({ account, balance }) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div>
                    <p className="text-sm font-semibold">{account.display_name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {account.account_type} · {account.id.slice(-10)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black">
                      {balance.available_cents}
                      <span className="text-xs text-muted-foreground ml-1">disp.</span>
                    </p>
                    {balance.held_cents > 0 && (
                      <p className="text-[10px] text-amber-600">
                        {balance.held_cents} em hold
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ LEDGER */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Ledger append-only ({entries.length})</CardTitle>
          <p className="text-[10px] text-muted-foreground">Atualiza a cada 1s</p>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem entries ainda.</p>
          ) : (
            <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
              {entries.map((e) => (
                <LedgerEntryRow key={e.id} entry={e} accounts={accounts} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────── sub-componentes ─────────── */

function BalanceCard({
  icon: Icon,
  color,
  label,
  available,
  held,
  total,
}: {
  icon: React.ElementType;
  color: string;
  label: string;
  available: number;
  held: number;
  total: number;
}) {
  return (
    <Card className="overflow-hidden">
      <div className={`bg-gradient-to-r ${color} p-4 text-white`}>
        <div className="flex items-center gap-2 opacity-80">
          <Icon className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
        </div>
        <p className="text-4xl font-black mt-2">{available}</p>
        <p className="text-xs opacity-70">créditos disponíveis</p>
      </div>
      <CardContent className="p-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">Em hold</p>
          <p className="font-bold text-amber-600">{held}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Total ledger</p>
          <p className="font-bold">{total}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionCard({
  icon: Icon,
  title,
  color,
  children,
}: {
  icon: React.ElementType;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={`border-2 ${color}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

function LedgerEntryRow({
  entry,
  accounts,
}: {
  entry: LedgerEntry;
  accounts: ReturnType<typeof listAccounts>;
}) {
  const account = accounts.find((a) => a.id === entry.account_id);
  return (
    <div className="flex items-center justify-between gap-2 p-2 rounded border bg-card text-xs">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Badge className={`text-[10px] font-mono flex-shrink-0 ${ENTRY_COLORS[entry.entry_type]}`}>
          {entry.entry_type}
        </Badge>
        <div className="min-w-0">
          <p className="font-semibold truncate">
            {account?.display_name ?? entry.account_id.slice(-10)}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {entry.description}
          </p>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-black font-mono">
          {ENTRY_SIGN[entry.entry_type]}
          {entry.amount_cents}
        </p>
        <p className="text-[9px] text-muted-foreground">→ {entry.balance_after_cents}</p>
      </div>
    </div>
  );
}
