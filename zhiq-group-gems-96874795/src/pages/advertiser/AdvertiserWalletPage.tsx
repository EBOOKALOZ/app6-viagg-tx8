/**
 * AdvertiserWalletPage — Carteira do Lojista (Anunciante)
 * 
 * Página completa de gestão financeira dentro do painel do anunciante.
 * Integra: saldo unificado, extrato, recarga, configuração PIX.
 * Design: Dark Premium (matching AdvertiserPanelLayout)
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMerchantWallet, MerchantLedgerEntry } from "@/hooks/useMerchantWallet";
import { useMerchantWalletOverview } from "@/hooks/useMerchantPayViews";
import { useAdvertiserCredits } from "@/hooks/useAdvertiserCredits";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Wallet,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  QrCode,
  Receipt,
  Minus,
  ShoppingBag,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Banknote,
  Settings,
  Info,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Landmark,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ========== PIX KEY TYPES ==========
const PIX_KEY_TYPES = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" },
  { value: "telefone", label: "Telefone" },
  { value: "aleatoria", label: "Chave Aleatória" },
];

// ========== MAIN COMPONENT ==========
export default function AdvertiserWalletPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { overview, isLoading, isError, error, loadWallet } = useMerchantWallet();
  const { data: creditOverview } = useMerchantWalletOverview();
  const { balance: advCredits, isLoading: isLoadingAdvertiserCredits } = useAdvertiserCredits();

  const [balanceVisible, setBalanceVisible] = useState(true);
  const [showPixConfig, setShowPixConfig] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>("extrato");

  // PIX config state
  const [pixData, setPixData] = useState<{ pix_tipo_chave: string | null; pix_chave: string | null } | null>(null);
  const [pixLoading, setPixLoading] = useState(true);

  // PIX form state
  const [pixTipo, setPixTipo] = useState("");
  const [pixChave, setPixChave] = useState("");
  const [pixSubmitting, setPixSubmitting] = useState(false);

  const balanceCents = overview?.balanceCents || 0;
  const balanceReais = overview?.balanceReais || 0;
  const pendingCents = overview?.pendingCents || 0;
  const transactions = Array.isArray(overview?.transactions) ? overview.transactions : [];

  // Fetch PIX data
  useEffect(() => {
    const fetchPix = async () => {
      if (!user?.id) return;
      setPixLoading(true);
      try {
        const { data } = await (supabase.from("motoboy_bank_data") as any)
          .select("pix_tipo_chave, pix_chave")
          .eq("user_id", user.id)
          .maybeSingle();
        setPixData(data);
      } catch {
        // silently handle
      } finally {
        setPixLoading(false);
      }
    };
    fetchPix();
  }, [user?.id]);

  // Derived metrics
  const totalCredits = transactions.filter(t => t.entry_type === "credit").reduce((s, t) => s + t.amount_cents, 0);
  const totalDebits = transactions.filter(t => t.entry_type === "debit").reduce((s, t) => s + t.amount_cents, 0);
  const recentTransactions = transactions.slice(0, 20);

  const formatCurrency = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  const formatCurrencyFromReais = (reais: number) => reais.toFixed(2).replace(".", ",");

  // ======= PIX SAVE =======
  const handlePixSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !pixTipo || !pixChave) return;
    setPixSubmitting(true);
    try {
      const { error } = await supabase
        .from("motoboy_bank_data")
        .upsert({
          user_id: user.id,
          pix_tipo_chave: pixTipo,
          pix_chave: pixChave.trim(),
        }, { onConflict: "user_id" });
      if (error) throw error;
      toast.success("Chave Pix salva com sucesso!");
      setPixData({ pix_tipo_chave: pixTipo, pix_chave: pixChave.trim() });
      setShowPixConfig(false);
    } catch (err: any) {
      console.error("[PIX] Erro ao salvar chave:", err);
      toast.error("Erro ao salvar chave Pix", {
        description: err?.message || err?.hint || "Tente novamente em instantes.",
      });
    } finally {
      setPixSubmitting(false);
    }
  };

  // ======= TRANSACTION RENDERING =======
  const getTransactionInfo = (tx: MerchantLedgerEntry) => {
    const isCredit = tx.entry_type === "credit";
    let label = "Movimentação";
    let IconComp = Wallet;
    switch (tx.reference_type) {
      case "service_order": label = "Pedido de Entrega"; IconComp = ShoppingBag; break;
      case "payout": label = "Saque PIX"; IconComp = ArrowUpRight; break;
      case "adjustment": label = "Ajuste Administrativo"; IconComp = Settings; break;
      case "refund": label = "Estorno"; IconComp = RefreshCw; break;
      default: label = tx.description || "Movimentação";
    }
    return { label, IconComp, isCredit };
  };

  return (
    <div className="space-y-8">
      {/* ========== HEADER ========== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#F5F7FA] tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            Carteira
          </h1>
          <p className="text-sm text-[#A7B0BE] mt-1">Gerencie seu saldo, extrato e configurações financeiras</p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => loadWallet()}
          disabled={isLoading}
          className="border-[#2A3038] bg-[#1B1F24] hover:bg-[#2A3038] text-[#A7B0BE] hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* ========== ERROR BANNER ========== */}
      {isError && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">Erro ao carregar carteira: {error?.message || "Falha na conexão"}</p>
        </div>
      )}

      {/* ========== BALANCE HERO CARD ========== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0D3D2E] via-[#0F4A35] to-[#124D38] border border-emerald-500/20 shadow-2xl shadow-emerald-900/30">
        <div className="absolute -right-10 -top-10 w-60 h-60 bg-emerald-400/5 rounded-full blur-3xl" />
        <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-emerald-600/10 rounded-full blur-2xl" />
        
        <div className="relative p-6 lg:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 bg-black/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
              <Wallet className="h-4 w-4 text-emerald-300" />
              <span className="text-xs font-bold text-emerald-200 uppercase tracking-widest">Saldo Disponível</span>
            </div>
            <button
              onClick={() => setBalanceVisible(!balanceVisible)}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-white/60 hover:text-white"
            >
              {balanceVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>

          {isLoading ? (
            <Skeleton className="h-16 w-64 bg-white/10" />
          ) : (
            <div className="space-y-1">
              <p className="text-5xl lg:text-6xl font-black text-white tracking-tight tabular-nums">
                {balanceVisible ? `R$ ${formatCurrency(balanceCents)}` : "R$ ••••••"}
              </p>
              {pendingCents > 0 && (
                <p className="text-sm text-emerald-300/70 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  R$ {formatCurrency(pendingCents)} em processamento
                </p>
              )}
            </div>
          )}

          {/* Quick stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/5">
              <p className="text-[10px] text-emerald-300/60 uppercase tracking-wider font-bold">Entradas</p>
              <p className="text-lg font-black text-emerald-300 tabular-nums mt-0.5">
                {balanceVisible ? `+R$ ${formatCurrency(totalCredits)}` : "••••"}
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/5">
              <p className="text-[10px] text-red-300/60 uppercase tracking-wider font-bold">Saídas</p>
              <p className="text-lg font-black text-red-300 tabular-nums mt-0.5">
                {balanceVisible ? `-R$ ${formatCurrency(totalDebits)}` : "••••"}
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/5">
              <p className="text-[10px] text-amber-300/60 uppercase tracking-wider font-bold">Saldo de Créditos</p>
              <p className="text-lg font-black text-amber-300 tabular-nums mt-0.5">
                {isLoadingAdvertiserCredits ? "..." : (advCredits?.available_credits ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/5">
              <p className="text-[10px] text-blue-300/60 uppercase tracking-wider font-bold">Movimentações</p>
              <p className="text-lg font-black text-blue-300 tabular-nums mt-0.5">
                {transactions.length}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setPixTipo(pixData?.pix_tipo_chave || "");
                setPixChave(pixData?.pix_chave || "");
                setShowPixConfig(true);
              }}
              className="border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10 hover:text-emerald-100 font-bold text-xs uppercase tracking-wider"
            >
              <QrCode className="h-4 w-4 mr-1.5" />
              {pixData?.pix_chave ? "Editar PIX" : "Cadastrar PIX"}
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/anunciante/creditos")}
              className="border-amber-500/30 text-amber-200 hover:bg-amber-500/10 hover:text-amber-100 font-bold text-xs uppercase tracking-wider"
            >
              <Banknote className="h-4 w-4 mr-1.5" />
              Comprar Créditos
            </Button>
          </div>
        </div>
      </div>

      {/* ========== PIX REGISTERED INFO ========== */}
      <div className="rounded-xl bg-[#1B1F24] border border-[#2A3038]/60 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2A3038] flex items-center justify-center">
              <QrCode className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#F5F7FA]">Chave PIX para Saques</h3>
              {pixLoading ? (
                <Skeleton className="h-4 w-40 bg-[#2A3038] mt-1" />
              ) : pixData?.pix_chave ? (
                <p className="text-xs text-emerald-400 mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {PIX_KEY_TYPES.find(k => k.value === pixData.pix_tipo_chave)?.label || "Pix"}: {pixData.pix_chave}
                </p>
              ) : (
                <p className="text-xs text-[#A7B0BE] mt-0.5">Nenhuma chave cadastrada</p>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPixTipo(pixData?.pix_tipo_chave || "");
              setPixChave(pixData?.pix_chave || "");
              setShowPixConfig(true);
            }}
            className="text-[#A7B0BE] hover:text-white hover:bg-[#2A3038]"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ========== LOW BALANCE WARNING ========== */}
      {!isLoading && balanceCents <= 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-bold">Saldo zerado</p>
            <p className="text-xs text-amber-300/70 mt-0.5">Compre um pacote de créditos para continuar anunciando.</p>
          </div>
          <Button size="sm" onClick={() => navigate("/anunciante/creditos")} className="ml-auto bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs shrink-0">
            Comprar Créditos
          </Button>
        </div>
      )}

      {/* ========== TRANSACTION HISTORY (EXTRATO) ========== */}
      <div className="rounded-xl bg-[#1B1F24] border border-[#2A3038]/60 overflow-hidden">
        <button
          onClick={() => setExpandedSection(expandedSection === "extrato" ? null : "extrato")}
          className="w-full flex items-center justify-between p-5 hover:bg-[#2A3038]/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2A3038] flex items-center justify-center">
              <Receipt className="h-5 w-5 text-[#FF6A00]" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-bold text-[#F5F7FA]">Extrato de Movimentações</h3>
              <p className="text-xs text-[#A7B0BE]">{transactions.length} registro{transactions.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          {expandedSection === "extrato" 
            ? <ChevronDown className="h-5 w-5 text-[#A7B0BE]" /> 
            : <ChevronRight className="h-5 w-5 text-[#A7B0BE]" />
          }
        </button>

        {expandedSection === "extrato" && (
          <div className="border-t border-[#2A3038]/60">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-14 w-full bg-[#2A3038]" />
                ))}
              </div>
            ) : recentTransactions.length === 0 ? (
              <div className="text-center py-12 px-6">
                <div className="w-16 h-16 rounded-2xl bg-[#2A3038] flex items-center justify-center mx-auto mb-4">
                  <Receipt className="h-8 w-8 text-[#A7B0BE]/40" />
                </div>
                <p className="text-sm font-bold text-[#F5F7FA]">Nenhuma movimentação</p>
                <p className="text-xs text-[#A7B0BE] mt-1">Quando você receber ou gastar, as transações aparecerão aqui.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#2A3038]/60">
                {recentTransactions.map((tx) => {
                  const { label, IconComp, isCredit } = getTransactionInfo(tx);
                  return (
                    <div key={tx.id} className="flex items-center gap-4 px-5 py-4 hover:bg-[#2A3038]/20 transition-colors">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isCredit ? "bg-emerald-500/10" : "bg-red-500/10"
                      }`}>
                        <IconComp className={`h-4 w-4 ${isCredit ? "text-emerald-400" : "text-red-400"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[#F5F7FA] truncate">{label}</p>
                        <p className="text-xs text-[#A7B0BE] mt-0.5">
                          {format(new Date(tx.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                        {tx.description && (
                          <p className="text-[10px] text-[#A7B0BE]/60 mt-0.5 truncate">{tx.description}</p>
                        )}
                      </div>
                      <p className={`text-sm font-black tabular-nums shrink-0 ${
                        isCredit ? "text-emerald-400" : "text-red-400"
                      }`}>
                        {isCredit ? "+" : "-"} R$ {formatCurrency(tx.amount_cents)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========== SECURITY FOOTER ========== */}
      <div className="flex items-center justify-center gap-2 py-4">
        <Shield className="h-3.5 w-3.5 text-emerald-400/40" />
        <p className="text-[10px] text-[#A7B0BE]/50 uppercase tracking-widest font-bold">
          Criptografia ponta a ponta garantida pela plataforma
        </p>
      </div>

      {/* ========== PIX CONFIG MODAL ========== */}
      <Dialog open={showPixConfig} onOpenChange={setShowPixConfig}>
        <DialogContent className="sm:max-w-md bg-[#1B1F24] border-[#2A3038] text-[#F5F7FA]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#F5F7FA]">
              <QrCode className="h-5 w-5 text-emerald-400" />
              Configurar Chave PIX
            </DialogTitle>
            <DialogDescription className="text-[#A7B0BE]">
              Cadastre sua chave Pix para receber pagamentos e saques.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handlePixSave} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-[#A7B0BE] text-xs uppercase tracking-wider font-bold">Tipo da Chave</Label>
              <Select value={pixTipo} onValueChange={setPixTipo}>
                <SelectTrigger className="bg-[#0D0F12] border-[#2A3038] text-white">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent className="bg-[#1B1F24] border-[#2A3038]">
                  {PIX_KEY_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value} className="text-[#F5F7FA] focus:bg-[#2A3038] focus:text-white">
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[#A7B0BE] text-xs uppercase tracking-wider font-bold">Chave PIX</Label>
              <Input
                value={pixChave}
                onChange={(e) => setPixChave(e.target.value)}
                placeholder={
                  pixTipo === "cpf" ? "000.000.000-00" :
                  pixTipo === "cnpj" ? "00.000.000/0000-00" :
                  pixTipo === "email" ? "seu@email.com" :
                  pixTipo === "telefone" ? "+55 11 99999-9999" :
                  "Chave aleatória"
                }
                className="bg-[#0D0F12] border-[#2A3038] text-white placeholder:text-[#A7B0BE]/40"
                required
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 border-[#2A3038] text-[#A7B0BE] hover:bg-[#2A3038] hover:text-white"
                onClick={() => setShowPixConfig(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
                disabled={pixSubmitting || !pixTipo || !pixChave}
              >
                {pixSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
