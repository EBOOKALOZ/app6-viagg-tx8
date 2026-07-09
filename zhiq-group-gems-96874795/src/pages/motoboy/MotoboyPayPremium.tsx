/**
 * MotoboyPayPremium — Motoboy Financial Dashboard
 * Visual tone: Orange premium (motoboy identity)
 * Consumes 3 motoboy views + existing payout flow
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { requestPayout as requestProfessionalPayout } from "@/lib/payments/payoutService";
import {
  Wallet, TrendingUp, Clock, Loader2, Banknote,
  ArrowUpRight, ArrowDownRight, Info, Landmark, AlertCircle,
  HandCoins, CheckCircle, XCircle, FileText
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MotoboyPageTemplate } from "@/components/motoboy/MotoboyPageTemplate";
import {
  useMotoboyWalletOverview,
  useMotoboyEarningsDetailed,
  useMotoboyPayoutsDetailed,
} from "@/hooks/useMotoboyPayViews";

// ==================== Helpers ====================

const fmt = (v: number | undefined | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
};

const SOURCE_LABELS: Record<string, string> = {
  delivery: "Entrega",
  ride: "Corrida",
  mototaxi: "Moto-Táxi",
  freight: "Frete",
  bonus: "Bônus",
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-amber-100 text-amber-700" },
  approved: { label: "Aprovado", color: "bg-blue-100 text-blue-700" },
  processing: { label: "Processando", color: "bg-blue-100 text-blue-700" },
  processed: { label: "Concluído", color: "bg-emerald-100 text-emerald-700" },
  completed: { label: "Concluído", color: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Falhou", color: "bg-red-100 text-red-700" },
  rejected: { label: "Rejeitado", color: "bg-red-100 text-red-700" },
};

// ==================== KPI Card ====================

function MotoboyKpi({ label, value, sub, icon: Icon, highlight = false }: {
  label: string; value: string; sub?: string; icon: any; highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-5 shadow-sm border transition-all ${
      highlight
        ? "bg-gradient-to-br from-orange-500 to-orange-600 text-white border-orange-400 shadow-orange-500/25 shadow-lg"
        : "bg-white dark:bg-slate-900 border-orange-100 dark:border-slate-800"
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
          highlight ? "bg-white/15" : "bg-orange-50 dark:bg-orange-950/30"
        }`}>
          <Icon className={`h-4 w-4 ${highlight ? "text-white" : "text-orange-600 dark:text-orange-400"}`} />
        </div>
        <p className={`text-[11px] font-semibold uppercase tracking-wider ${
          highlight ? "text-white/70" : "text-slate-500"
        }`}>{label}</p>
      </div>
      <p className={`text-2xl md:text-3xl font-black tracking-tight ${
        highlight ? "" : "text-slate-900 dark:text-white"
      }`}>{value}</p>
      {sub && <p className={`text-[10px] mt-1 ${highlight ? "text-white/50" : "text-slate-400"}`}>{sub}</p>}
    </div>
  );
}

// ==================== Main Page ====================

export default function MotoboyPayPremium() {
  const { data: wallet, isLoading: isLoadingW } = useMotoboyWalletOverview();
  const { data: earnings = [], isLoading: isLoadingE } = useMotoboyEarningsDetailed();
  const { data: payouts = [], isLoading: isLoadingP } = useMotoboyPayoutsDetailed();

  console.log('[DEBUG MotoboyPayPremium] Current wallet data:', wallet);
  console.log('[DEBUG MotoboyPayPremium] Earnings count:', earnings.length);

  const [withdrawModal, setWithdrawModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [requesting, setRequesting] = useState(false);
  const queryClient = useQueryClient();

  const isLoading = isLoadingW;

  // Saque REAL via arquitetura padrão do motor: RPC professional_request_payout
  // (reserva payout_reserve no ledger; perfil/carteira resolvidos no servidor).
  const handleRequestPayout = async () => {
    const val = parseFloat(amount.replace(",", "."));
    if (isNaN(val) || val <= 0) { toast.error("Valor inválido"); return; }
    if (val > (wallet?.available_balance ?? 0)) { toast.error("Saldo insuficiente"); return; }
    setRequesting(true);
    try {
      const result = await requestProfessionalPayout({ amountBrl: val });
      if (result.environment === "sandbox") {
        toast.success("Saque registrado em ambiente Sandbox.", {
          description: "Nenhuma transferência real foi executada.",
          duration: 7000,
        });
      } else {
        toast.success("Solicitação de saque enviada!", {
          description: "Reserva registrada — aguardando processamento.",
        });
      }
      setWithdrawModal(false);
      setAmount("");
      queryClient.invalidateQueries({ queryKey: ["motoboy-wallet-overview"] });
      queryClient.invalidateQueries({ queryKey: ["motoboy-payouts-detailed"] });
      queryClient.invalidateQueries({ queryKey: ["motoboy-pay-balance"] });
    } catch (err: any) {
      // Nunca ocultar a causa real (padrão de auditoria do módulo de saque).
      toast.error("Não foi possível solicitar o saque", {
        description: err?.message || String(err),
        duration: 10000,
      });
    } finally {
      setRequesting(false);
    }
  };

  return (
    <MotoboyPageTemplate title="Financeiro PAY" icon={Wallet}>
      <div className="space-y-6 pb-4">

        {/* ═══ KPI GRID ═══ */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <MotoboyKpi
              label="Saldo Total"
              value={fmt(wallet?.total_balance)}
              icon={Wallet}
              highlight
            />
            <MotoboyKpi
              label="Disponível"
              value={fmt(wallet?.available_balance)}
              sub="para saque"
              icon={Banknote}
            />
            <MotoboyKpi
              label="Reservado"
              value={fmt(wallet?.reserved_balance)}
              sub="em processamento"
              icon={Clock}
            />
            <MotoboyKpi
              label="Ganhos recentes"
              value={String(earnings.length)}
              sub="lançamentos"
              icon={TrendingUp}
            />
          </div>
        )}

        {/* ═══ WITHDRAW CTA ═══ */}
        <Button
          className="w-full h-14 text-base font-bold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-2xl shadow-lg shadow-orange-500/25"
          onClick={() => setWithdrawModal(true)}
          disabled={!wallet || (wallet?.available_balance ?? 0) <= 0}
        >
          <HandCoins className="h-5 w-5 mr-2" />
          Solicitar Saque
        </Button>

        {/* ═══ INFO CARD ═══ */}
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 rounded-2xl p-5 border border-orange-200 dark:border-orange-800">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
            <div className="text-[12px] text-orange-700/80 dark:text-orange-400/80 leading-relaxed space-y-1">
              <p><strong>Saldo disponível</strong> = valor que pode solicitar para saque</p>
              <p><strong>Saldo reservado</strong> = já solicitado para saque / em processamento</p>
              <p><strong>Ganhos</strong> = lançamentos líquidos após comissão da plataforma</p>
            </div>
          </div>
        </div>

        {/* ═══ EARNINGS TABLE ═══ */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-orange-100 dark:border-slate-800 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-orange-50 dark:border-slate-800">
            <TrendingUp className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Ganhos Detalhados</h3>
            <Badge variant="secondary" className="ml-auto text-[10px]">{earnings.length}</Badge>
          </div>
          {isLoadingE ? (
            <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-400" /></div>
          ) : earnings.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">Nenhum ganho registrado</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-orange-50/50 dark:bg-slate-800/50">
                    <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-slate-500">Data</th>
                    <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-slate-500">Tipo</th>
                    <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-slate-500">Bruto</th>
                    <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-slate-500">Comissão</th>
                    <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-slate-500">Líquido</th>
                    <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-50 dark:divide-slate-800">
                  {earnings.map((e, i) => (
                    <tr key={e.id || i} className="hover:bg-orange-50/30 transition-colors">
                      <td className="px-4 py-3 text-slate-600">{fmtDate(e.created_at)}</td>
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                        {SOURCE_LABELS[e.source_type] || e.source_type || "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">{fmt(e.gross_amount)}</td>
                      <td className="px-4 py-3 text-right text-red-400">{fmt(e.commission_amount)}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">{fmt(e.net_amount)}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] ${STATUS_MAP[e.status]?.color || "bg-slate-100 text-slate-600"}`}>
                          {STATUS_MAP[e.status]?.label || e.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ═══ PAYOUTS TABLE ═══ */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-orange-100 dark:border-slate-800 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-orange-50 dark:border-slate-800">
            <Landmark className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Saques</h3>
            <Badge variant="secondary" className="ml-auto text-[10px]">{payouts.length}</Badge>
          </div>
          {isLoadingP ? (
            <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-400" /></div>
          ) : payouts.length === 0 ? (
            <div className="p-8 text-center">
              <Landmark className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Nenhum saque solicitado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-orange-50/50 dark:bg-slate-800/50">
                    <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-slate-500">Solicitado</th>
                    <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-slate-500">Taxa</th>
                    <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-slate-500">Líquido</th>
                    <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-slate-500">Provedor</th>
                    <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-slate-500">Solicitado em</th>
                    <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-slate-500">Aprovado em</th>
                    <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-slate-500">Processado em</th>
                    <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-slate-500">Motivo falha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-50 dark:divide-slate-800">
                  {payouts.map((p, i) => (
                    <tr key={p.id || i} className="hover:bg-orange-50/30 transition-colors">
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] ${STATUS_MAP[p.status]?.color || "bg-slate-100 text-slate-600"}`}>
                          {STATUS_MAP[p.status]?.label || p.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-white">{fmt(p.requested_amount)}</td>
                      <td className="px-4 py-3 text-right text-red-400">{fmt(p.fee_amount)}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">{fmt(p.net_amount)}</td>
                      <td className="px-4 py-3 text-slate-500">{p.provider_name || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(p.requested_at)}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(p.approved_at)}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(p.processed_at)}</td>
                      <td className="px-4 py-3 text-red-500 max-w-[150px] truncate">{p.failure_reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ═══ FOOTER ═══ */}
        <div className="text-center py-3 border-t border-orange-100 dark:border-slate-800">
          <p className="text-[9px] text-muted-foreground/40 font-medium tracking-wider">
            Financeiro PAY · Views reais Supabase · Seus dados · Auto-refresh 30s
          </p>
        </div>
      </div>

      {/* ═══ WITHDRAW MODAL ═══ */}
      <Dialog open={withdrawModal} onOpenChange={setWithdrawModal}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Solicitar Saque</DialogTitle>
            <DialogDescription>
              Saldo disponível: <strong className="text-orange-600">{fmt(wallet?.available_balance)}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="payout-amount">Valor do Saque (R$)</Label>
              <Input
                id="payout-amount"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9,.]/g, ""))}
              />
            </div>
          </div>
          <DialogFooter className="sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setWithdrawModal(false)}>Cancelar</Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={handleRequestPayout}
              disabled={requesting}
            >
              {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar Saque"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MotoboyPageTemplate>
  );
}
