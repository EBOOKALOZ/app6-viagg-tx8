/**
 * AdvertiserWalletPage — CENTRO FINANCEIRO INTELIGENTE (Carteira única oficial)
 *
 * SOMENTE UI. Não altera regras/cálculos/comissão/banco/RPC/RLS/triggers.
 * Consome exclusivamente dados existentes via useWalletCenter (wallets +
 * wallet_transactions + carteira pay_*), organizando tudo num único painel:
 * saldo total + breakdown (R$), indicadores, comissão de contato (derivada),
 * saldo em outros perfis (estrutura preparada), gráficos e extrato unificado.
 */
import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWalletCenter, WCTxn, WCKind } from "@/hooks/useWalletCenter";
import { WalletTopupButton } from "@/components/merchant/WalletTopupButton";
import {
  Wallet, RefreshCw, ArrowUpRight, ArrowDownRight, QrCode, Receipt, ShoppingBag,
  AlertCircle, CheckCircle2, Clock, Eye, EyeOff, Loader2, Banknote, Settings,
  Landmark, Shield, Lock, Coins, Users, TrendingUp, Search, Download, Printer,
  Gift, HandCoins, Layers, ArrowLeftRight, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";

const PIX_KEY_TYPES = [
  { value: "cpf", label: "CPF" }, { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" }, { value: "telefone", label: "Telefone" },
  { value: "aleatoria", label: "Chave Aleatória" },
];

// Paleta categórica pré-validada (dataviz skill, modo escuro) — identidade também
// carregada pelos rótulos de eixo (2ª codificação → CVD-safe).
const CAT = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"];
const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const KIND_META: Record<WCKind, { label: string; Icon: any; credit?: boolean }> = {
  recharge:   { label: "Recarga de créditos", Icon: Banknote, credit: true },
  unlock:     { label: "Desbloqueio de contato (2%)", Icon: Users },
  delivery:   { label: "Pedido de entrega", Icon: ShoppingBag },
  payout:     { label: "Saque PIX", Icon: ArrowUpRight },
  adjustment: { label: "Ajuste administrativo", Icon: Settings },
  refund:     { label: "Estorno", Icon: RotateCcw, credit: true },
  transfer:   { label: "Transferência / Importação", Icon: ArrowLeftRight },
  other:      { label: "Movimentação", Icon: Wallet },
};

const moduleOf = (desc: string | null): string => {
  const m = /\(([^)]+)\)/.exec(desc || "");
  const map: Record<string, string> = {
    product: "Mercado", real_estate: "Imóveis", vehicles: "Veículos",
    services: "Serviços", freight: "Fretes", travel: "Viagens",
  };
  return m ? (map[m[1]] || m[1]) : "Outros";
};

export default function AdvertiserWalletPage() {
  const { user } = useAuth();
  const wc = useWalletCenter();
  const [balanceVisible, setBalanceVisible] = useState(true);

  // ── Filtros do extrato ──
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("all");   // all | 30 | 90
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // ── PIX ──
  const [showPixConfig, setShowPixConfig] = useState(false);
  const [pixData, setPixData] = useState<{ pix_tipo_chave: string | null; pix_chave: string | null } | null>(null);
  const [pixLoading, setPixLoading] = useState(true);
  const [pixTipo, setPixTipo] = useState("");
  const [pixChave, setPixChave] = useState("");
  const [pixSubmitting, setPixSubmitting] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!user?.id) return;
      setPixLoading(true);
      try {
        const { data } = await (supabase.from("motoboy_bank_data") as any)
          .select("pix_tipo_chave, pix_chave").eq("user_id", user.id).maybeSingle();
        setPixData(data);
      } catch { /* silent */ } finally { setPixLoading(false); }
    };
    run();
  }, [user?.id]);

  const handlePixSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !pixTipo || !pixChave) return;
    setPixSubmitting(true);
    try {
      const { error } = await supabase.from("motoboy_bank_data")
        .upsert({ user_id: user.id, pix_tipo_chave: pixTipo, pix_chave: pixChave.trim() }, { onConflict: "user_id" });
      if (error) throw error;
      toast.success("Chave Pix salva com sucesso!");
      setPixData({ pix_tipo_chave: pixTipo, pix_chave: pixChave.trim() });
      setShowPixConfig(false);
    } catch (err: any) {
      toast.error("Erro ao salvar chave Pix", { description: err?.message || "Tente novamente." });
    } finally { setPixSubmitting(false); }
  };

  // ── Derivações (useMemo) ──
  const filtered = useMemo(() => {
    const now = Date.now();
    const days = period === "all" ? null : Number(period);
    return wc.transactions.filter((t) => {
      if (days && (now - new Date(t.created_at).getTime()) > days * 864e5) return false;
      if (kindFilter !== "all" && t.kind !== kindFilter) return false;
      if (statusFilter !== "all" && (t.status || "confirmed") !== statusFilter) return false;
      if (search) {
        const hay = `${KIND_META[t.kind].label} ${t.description ?? ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [wc.transactions, period, kindFilter, statusFilter, search]);

  // Gráfico 1 — Entradas x Saídas por mês (últimos 6)
  const monthly = useMemo(() => {
    const map = new Map<string, { mes: string; Entradas: number; Saídas: number }>();
    for (const t of wc.transactions) {
      if (t.status === "reserved" || t.status === "canceled") continue;
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = format(d, "MMM/yy", { locale: ptBR });
      if (!map.has(key)) map.set(key, { mes: label, Entradas: 0, Saídas: 0 });
      const row = map.get(key)!;
      if (t.tx_type === "credit") row.Entradas += t.amount_cents / 100;
      else row.Saídas += t.amount_cents / 100;
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([, v]) => v);
  }, [wc.transactions]);

  // Gráfico 2 — Consumo por módulo (desbloqueios)
  const byModule = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of wc.contact.last.length ? wc.transactions.filter((x) => x.kind === "unlock") : []) {
      const k = moduleOf(t.description);
      map.set(k, (map.get(k) || 0) + t.amount_cents / 100);
    }
    return Array.from(map.entries()).map(([modulo, valor]) => ({ modulo, valor })).sort((a, b) => b.valor - a.valor).slice(0, 6);
  }, [wc.transactions, wc.contact.last.length]);

  // ── Export ──
  const exportCSV = () => {
    const head = ["Data", "Tipo", "Origem", "Descrição", "Entrada/Saída", "Valor (R$)", "Status"];
    const rows = filtered.map((t) => [
      format(new Date(t.created_at), "dd/MM/yyyy HH:mm"),
      KIND_META[t.kind].label,
      t.source === "credit" ? "Carteira de Créditos" : "Carteira Financeira",
      (t.description || "").replace(/;/g, ","),
      t.tx_type === "credit" ? "Entrada" : "Saída",
      (t.amount_cents / 100).toFixed(2),
      t.status || "confirmed",
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `extrato-carteira-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const hide = (node: React.ReactNode) => (balanceVisible ? node : "R$ ••••••");

  // ── Cards de breakdown do hero ──
  const breakdown: { label: string; cents: number; Icon: any; tone: string; note?: string }[] = [
    { label: "Carteira de Créditos", cents: wc.creditAvailableCents, Icon: Coins, tone: "text-amber-300" },
    { label: "Carteira Financeira", cents: wc.financialCents, Icon: Landmark, tone: "text-emerald-300" },
    { label: "Saldo Bloqueado", cents: wc.blockedCents, Icon: Lock, tone: "text-white/70" },
    { label: "Saldo Reservado", cents: wc.reservedCents, Icon: Layers, tone: "text-blue-300" },
    { label: "Em Processamento", cents: wc.processingCents, Icon: Clock, tone: "text-cyan-300" },
    { label: "Cashback", cents: wc.cashbackCents, Icon: Gift, tone: "text-fuchsia-300", note: "em breve" },
    { label: "Comissões Liberadas", cents: wc.releasedCommissionCents, Icon: HandCoins, tone: "text-violet-300", note: "em breve" },
  ];

  // ── Indicadores (FASE 8) ──
  const indicators = [
    { label: "Entradas", value: brl(wc.entriesCents), Icon: ArrowDownRight, tone: "emerald" },
    { label: "Saídas", value: brl(wc.exitsCents), Icon: ArrowUpRight, tone: "red" },
    { label: "Gasto em Contatos", value: brl(wc.contact.totalSpentCents), Icon: Users, tone: "violet" },
    { label: "Movimentações", value: String(wc.transactions.length), Icon: Receipt, tone: "blue" },
  ];

  // ── Outros perfis (FASE 5 — estrutura preparada) ──
  const otherProfiles = [
    { label: "Marketplace", cents: wc.creditAvailableCents }, { label: "Motoboy", cents: 0 },
    { label: "Moto Táxi", cents: 0 }, { label: "Prestador", cents: 0 },
    { label: "Veículos", cents: 0 }, { label: "Imóveis", cents: 0 },
  ];

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#F5F7FA] tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            Centro Financeiro
          </h1>
          <p className="text-sm text-[#A7B0BE] mt-1">Toda a sua vida financeira na plataforma, num só lugar</p>
        </div>
        <Button variant="outline" size="icon" onClick={wc.refetch} disabled={wc.isLoading}
          className="border-[#2A3038] bg-[#1B1F24] hover:bg-[#2A3038] text-[#A7B0BE] hover:text-white">
          <RefreshCw className={`h-4 w-4 ${wc.isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {wc.isError && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">Não foi possível carregar parte dos dados financeiros.</p>
        </div>
      )}

      {/* HERO — SALDO TOTAL + BREAKDOWN */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0D3D2E] via-[#0F4A35] to-[#124D38] border border-emerald-500/20 shadow-2xl shadow-emerald-900/30">
        <div className="absolute -right-10 -top-10 w-60 h-60 bg-emerald-400/5 rounded-full blur-3xl" />
        <div className="relative p-6 lg:p-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 bg-black/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
              <Wallet className="h-4 w-4 text-emerald-300" />
              <span className="text-xs font-bold text-emerald-200 uppercase tracking-widest">Saldo Total</span>
            </div>
            <button onClick={() => setBalanceVisible(!balanceVisible)}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white">
              {balanceVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>
          {wc.isLoading ? <Skeleton className="h-14 w-64 bg-white/10" /> : (
            <p className="text-5xl lg:text-6xl font-black text-white tracking-tight tabular-nums">
              {hide(brl(wc.totalCents))}
            </p>
          )}
          <p className="text-xs text-emerald-300/70 mt-1">Créditos disponíveis + Carteira financeira</p>

          {/* Breakdown */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
            {breakdown.map((b) => (
              <div key={b.label} className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/5">
                <div className="flex items-center gap-1.5">
                  <b.Icon className={`h-3.5 w-3.5 ${b.tone}`} />
                  <p className="text-[10px] text-white/50 uppercase tracking-wider font-bold">{b.label}</p>
                </div>
                <p className={`text-lg font-black tabular-nums mt-1 ${b.tone}`}>{hide(brl(b.cents))}</p>
                {b.note && <p className="text-[9px] text-white/30 uppercase tracking-widest">{b.note}</p>}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 mt-6">
            <Button variant="outline" onClick={() => { setPixTipo(pixData?.pix_tipo_chave || ""); setPixChave(pixData?.pix_chave || ""); setShowPixConfig(true); }}
              className="border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10 font-bold text-xs uppercase tracking-wider">
              <QrCode className="h-4 w-4 mr-1.5" />{pixData?.pix_chave ? "Editar PIX" : "Cadastrar PIX"}
            </Button>
            <WalletTopupButton onSuccess={wc.refetch}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider" />
          </div>
        </div>
      </div>

      {/* INDICADORES */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {indicators.map((i) => (
          <div key={i.label} className="rounded-2xl bg-[#1B1F24] border border-[#2A3038]/60 p-4">
            <div className="flex items-center gap-2">
              <i.Icon className={`h-4 w-4 text-${i.tone}-400`} />
              <p className="text-[10px] font-black uppercase tracking-widest text-[#A7B0BE]">{i.label}</p>
            </div>
            <p className="text-2xl font-black text-[#F5F7FA] tabular-nums mt-1">{i.value}</p>
          </div>
        ))}
      </div>

      {/* GRÁFICOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-[#1B1F24] border border-[#2A3038]/60 p-5">
          <h3 className="text-sm font-bold text-[#F5F7FA] mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-400" /> Entradas × Saídas (mensal)</h3>
          {monthly.length === 0 ? <p className="text-xs text-[#A7B0BE] py-10 text-center">Sem movimentações ainda.</p> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthly} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3038" vertical={false} />
                <XAxis dataKey="mes" tick={{ fill: "#A7B0BE", fontSize: 11 }} axisLine={{ stroke: "#2A3038" }} tickLine={false} />
                <YAxis tick={{ fill: "#A7B0BE", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                <RTooltip contentStyle={{ background: "#0D0F12", border: "1px solid #2A3038", borderRadius: 12, color: "#fff" }}
                  formatter={(v: any) => `R$ ${Number(v).toFixed(2)}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Entradas" fill="#199e70" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Saídas" fill="#e34948" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-2xl bg-[#1B1F24] border border-[#2A3038]/60 p-5">
          <h3 className="text-sm font-bold text-[#F5F7FA] mb-4 flex items-center gap-2"><Layers className="h-4 w-4 text-blue-400" /> Consumo por módulo (desbloqueios)</h3>
          {byModule.length === 0 ? <p className="text-xs text-[#A7B0BE] py-10 text-center">Nenhum desbloqueio ainda.</p> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byModule} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3038" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#A7B0BE", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="modulo" tick={{ fill: "#A7B0BE", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                <RTooltip contentStyle={{ background: "#0D0F12", border: "1px solid #2A3038", borderRadius: 12, color: "#fff" }}
                  formatter={(v: any) => `R$ ${Number(v).toFixed(2)}`} />
                <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                  {byModule.map((_, i) => <Cell key={i} fill={CAT[i % CAT.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* PAINEL COMISSÃO DE CONTATO */}
      <div className="rounded-2xl bg-[#1B1F24] border border-[#2A3038]/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-violet-400" />
          <h3 className="text-sm font-bold text-[#F5F7FA]">Comissão de Contato (desbloqueios 2%)</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="rounded-xl bg-[#14171B] p-3 border border-[#2A3038]/60">
            <p className="text-[10px] text-[#A7B0BE] uppercase tracking-wider font-bold">Total gasto</p>
            <p className="text-xl font-black text-violet-300 tabular-nums mt-1">{brl(wc.contact.totalSpentCents)}</p>
          </div>
          <div className="rounded-xl bg-[#14171B] p-3 border border-[#2A3038]/60">
            <p className="text-[10px] text-[#A7B0BE] uppercase tracking-wider font-bold">Contatos adquiridos</p>
            <p className="text-xl font-black text-[#F5F7FA] tabular-nums mt-1">{wc.contact.unlockCount}</p>
          </div>
          <div className="rounded-xl bg-[#14171B] p-3 border border-[#2A3038]/60">
            <p className="text-[10px] text-[#A7B0BE] uppercase tracking-wider font-bold">Anúncios desbloqueados</p>
            <p className="text-xl font-black text-[#F5F7FA] tabular-nums mt-1">{wc.contact.listingCount}</p>
          </div>
          <div className="rounded-xl bg-[#14171B] p-3 border border-[#2A3038]/60">
            <p className="text-[10px] text-[#A7B0BE] uppercase tracking-wider font-bold">Valor médio</p>
            <p className="text-xl font-black text-[#F5F7FA] tabular-nums mt-1">{brl(wc.contact.avgCents)}</p>
          </div>
        </div>
        {wc.contact.last.length > 0 && (
          <div className="divide-y divide-[#2A3038]/60">
            {wc.contact.last.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0"><Users className="h-3.5 w-3.5 text-violet-400" /></div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#F5F7FA] truncate">{moduleOf(t.description)}</p>
                    <p className="text-[10px] text-[#A7B0BE]">{format(new Date(t.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                  </div>
                </div>
                <p className="text-xs font-black text-red-400 tabular-nums shrink-0">- {brl(t.amount_cents)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SALDO EM OUTROS PERFIS (estrutura preparada) */}
      <div className="rounded-2xl bg-[#1B1F24] border border-[#2A3038]/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-cyan-400" /><h3 className="text-sm font-bold text-[#F5F7FA]">Saldo em Outros Perfis</h3></div>
          <span className="text-[9px] text-cyan-300/60 uppercase tracking-widest font-bold bg-cyan-500/10 px-2 py-1 rounded">Importação em breve</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {otherProfiles.map((p) => (
            <div key={p.label} className="rounded-xl bg-[#14171B] p-3 border border-[#2A3038]/60 flex items-center justify-between">
              <span className="text-xs font-bold text-[#A7B0BE]">{p.label}</span>
              <span className="text-sm font-black text-[#F5F7FA] tabular-nums">{brl(p.cents)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#2A3038]/60">
          <span className="text-xs font-black uppercase tracking-widest text-[#A7B0BE]">Total disponível</span>
          <span className="text-lg font-black text-cyan-300 tabular-nums">{brl(otherProfiles.reduce((s, p) => s + p.cents, 0))}</span>
        </div>
        <Button disabled className="w-full mt-4 bg-cyan-600/40 text-white/60 font-black text-xs uppercase tracking-wider cursor-not-allowed">
          <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" /> Importar Saldo (em breve)
        </Button>
      </div>

      {/* EXTRATO UNIFICADO + FILTROS */}
      <div className="rounded-2xl bg-[#1B1F24] border border-[#2A3038]/60 overflow-hidden">
        <div className="p-5 border-b border-[#2A3038]/60">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#2A3038] flex items-center justify-center"><Receipt className="h-5 w-5 text-[#FF6A00]" /></div>
              <div><h3 className="text-sm font-bold text-[#F5F7FA]">Extrato Unificado</h3><p className="text-xs text-[#A7B0BE]">{filtered.length} de {wc.transactions.length} registros</p></div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={exportCSV} className="border-[#2A3038] text-[#A7B0BE] hover:text-white"><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>
              <Button size="sm" variant="outline" onClick={() => window.print()} className="border-[#2A3038] text-[#A7B0BE] hover:text-white"><Printer className="h-3.5 w-3.5 mr-1" /> PDF</Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A7B0BE]" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar no extrato…"
                className="pl-9 bg-[#0D0F12] border-[#2A3038] text-white placeholder:text-[#A7B0BE]/40" />
            </div>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="bg-[#0D0F12] border-[#2A3038] text-white"><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent className="bg-[#1B1F24] border-[#2A3038] text-white">
                <SelectItem value="all">Todo o período</SelectItem><SelectItem value="30">Últimos 30 dias</SelectItem><SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="bg-[#0D0F12] border-[#2A3038] text-white"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent className="bg-[#1B1F24] border-[#2A3038] text-white">
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="unlock">Desbloqueio (2%)</SelectItem><SelectItem value="recharge">Recarga</SelectItem>
                <SelectItem value="delivery">Entrega</SelectItem><SelectItem value="payout">Saque</SelectItem>
                <SelectItem value="refund">Estorno</SelectItem><SelectItem value="adjustment">Ajuste</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {wc.isLoading ? (
          <div className="p-6 space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full bg-[#2A3038]" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 px-6">
            <div className="w-16 h-16 rounded-2xl bg-[#2A3038] flex items-center justify-center mx-auto mb-4"><Receipt className="h-8 w-8 text-[#A7B0BE]/40" /></div>
            <p className="text-sm font-bold text-[#F5F7FA]">Nenhuma movimentação</p>
            <p className="text-xs text-[#A7B0BE] mt-1">Ajuste os filtros ou aguarde novas transações.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#2A3038]/60">
            {filtered.slice(0, 100).map((t) => {
              const meta = KIND_META[t.kind];
              const isCredit = t.tx_type === "credit";
              return (
                <div key={t.id} className="flex items-center gap-4 px-5 py-4 hover:bg-[#2A3038]/20">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isCredit ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                    <meta.Icon className={`h-4 w-4 ${isCredit ? "text-emerald-400" : "text-red-400"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#F5F7FA] truncate">{meta.label}</p>
                    <p className="text-xs text-[#A7B0BE] mt-0.5">
                      {format(new Date(t.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      <span className="mx-1.5">·</span>{t.source === "credit" ? "Créditos" : "Financeira"}
                      {t.status === "reserved" && <span className="ml-1.5 text-amber-400">· reservado</span>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-black tabular-nums ${isCredit ? "text-emerald-400" : "text-red-400"}`}>{isCredit ? "+" : "-"} {brl(t.amount_cents)}</p>
                    {t.running_cents != null && <p className="text-[10px] text-[#A7B0BE]/50 tabular-nums">saldo {brl(t.running_cents)}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* PIX INFO */}
      <div className="rounded-xl bg-[#1B1F24] border border-[#2A3038]/60 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2A3038] flex items-center justify-center"><QrCode className="h-5 w-5 text-emerald-400" /></div>
            <div>
              <h3 className="text-sm font-bold text-[#F5F7FA]">Chave PIX para Saques</h3>
              {pixLoading ? <Skeleton className="h-4 w-40 bg-[#2A3038] mt-1" /> : pixData?.pix_chave ? (
                <p className="text-xs text-emerald-400 mt-0.5 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{PIX_KEY_TYPES.find(k => k.value === pixData.pix_tipo_chave)?.label || "Pix"}: {pixData.pix_chave}</p>
              ) : <p className="text-xs text-[#A7B0BE] mt-0.5">Nenhuma chave cadastrada</p>}
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => { setPixTipo(pixData?.pix_tipo_chave || ""); setPixChave(pixData?.pix_chave || ""); setShowPixConfig(true); }} className="text-[#A7B0BE] hover:text-white"><Settings className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 py-4">
        <Shield className="h-3.5 w-3.5 text-emerald-400/40" />
        <p className="text-[10px] text-[#A7B0BE]/50 uppercase tracking-widest font-bold">Criptografia ponta a ponta garantida pela plataforma</p>
      </div>

      {/* PIX MODAL */}
      <Dialog open={showPixConfig} onOpenChange={setShowPixConfig}>
        <DialogContent className="sm:max-w-md bg-[#1B1F24] border-[#2A3038] text-[#F5F7FA]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-emerald-400" /> Configurar Chave PIX</DialogTitle>
            <DialogDescription className="text-[#A7B0BE]">Cadastre sua chave Pix para receber pagamentos e saques.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePixSave} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-[#A7B0BE] text-xs uppercase tracking-wider font-bold">Tipo da Chave</Label>
              <Select value={pixTipo} onValueChange={setPixTipo}>
                <SelectTrigger className="bg-[#0D0F12] border-[#2A3038] text-white"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent className="bg-[#1B1F24] border-[#2A3038]">
                  {PIX_KEY_TYPES.map((type) => <SelectItem key={type.value} value={type.value} className="text-[#F5F7FA] focus:bg-[#2A3038]">{type.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[#A7B0BE] text-xs uppercase tracking-wider font-bold">Chave PIX</Label>
              <Input value={pixChave} onChange={(e) => setPixChave(e.target.value)} placeholder="Sua chave PIX"
                className="bg-[#0D0F12] border-[#2A3038] text-white placeholder:text-[#A7B0BE]/40" required />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1 border-[#2A3038] text-[#A7B0BE] hover:text-white" onClick={() => setShowPixConfig(false)}>Cancelar</Button>
              <Button type="submit" className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold" disabled={pixSubmitting || !pixTipo || !pixChave}>
                {pixSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
