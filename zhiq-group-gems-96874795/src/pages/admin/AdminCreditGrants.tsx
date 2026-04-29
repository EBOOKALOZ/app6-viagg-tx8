/**
 * AdminCreditGrants — Painel Admin para Créditos Sandbox
 *
 * 3 seções:
 *   A. Concessão Manual de Créditos (test_grant / admin_grant / bonus_grant)
 *   B. Compra Simulada (sandbox) — mostra pacotes com valor R$
 *   C. Histórico Completo (auditoria) — ledger com valor R$, pacote, status
 */

import React, { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Coins,
  Search,
  Gift,
  ShoppingBag,
  History,
  ArrowUpCircle,
  ArrowDownCircle,
  Loader2,
  CheckCircle2,
  ShieldAlert,
  Package,
  User,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface CreditPackage {
  id: string;
  name: string;
  slug: string;
  credits_base: number;
  credits_bonus: number;
  credits_total: number;
  price_brl: number;
  badge_text: string | null;
  is_featured: boolean;
}

interface LedgerEntry {
  id: string;
  created_at: string;
  advertiser_account_id: string;
  entry_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  reason_code: string;
  description: string;
  source_type: string;
  source_id: string | null;
  created_by: string | null;
  environment: string;
}

interface UserSearchResult {
  user_id: string;
  email: string;
  name: string | null;
  account_id: string;
  available_credits: number;
}

// ─── Constantes ─────────────────────────────────────────────────────────────

const SOURCE_TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  purchase_real:    { label: "Compra Real",    color: "text-emerald-400", bg: "bg-emerald-500/15" },
  purchase_sandbox: { label: "Sandbox",        color: "text-yellow-400",  bg: "bg-yellow-500/15" },
  admin_grant:      { label: "Admin",          color: "text-blue-400",    bg: "bg-blue-500/15" },
  test_grant:       { label: "Teste",          color: "text-purple-400",  bg: "bg-purple-500/15" },
  bonus_grant:      { label: "Bônus",          color: "text-orange-400",  bg: "bg-orange-500/15" },
  consumption:      { label: "Consumo",        color: "text-red-400",     bg: "bg-red-500/15" },
  refund:           { label: "Estorno",        color: "text-cyan-400",    bg: "bg-cyan-500/15" },
  adjustment:       { label: "Ajuste",         color: "text-zinc-400",    bg: "bg-zinc-500/15" },
  unknown:          { label: "Legado",         color: "text-zinc-500",    bg: "bg-zinc-500/10" },
};

const SOURCE_TYPE_OPTIONS = [
  { value: "test_grant", label: "🟣 Crédito de Teste" },
  { value: "admin_grant", label: "🔵 Concessão Admin" },
  { value: "bonus_grant", label: "🟠 Bônus Promocional" },
];

// ─── Componente ─────────────────────────────────────────────────────────────

export default function AdminCreditGrants() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── State: busca de usuário ──
  const [searchEmail, setSearchEmail] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // ── State: concessão manual ──
  const [grantAmount, setGrantAmount] = useState("");
  const [grantSourceType, setGrantSourceType] = useState("test_grant");
  const [grantDescription, setGrantDescription] = useState("");
  const [isGranting, setIsGranting] = useState(false);

  // ── State: compra simulada ──
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatingPackageId, setSimulatingPackageId] = useState<string | null>(null);

  // ── State: filtro de histórico ──
  const [historyFilter, setHistoryFilter] = useState("all");

  // ── Query: pacotes disponíveis ──
  const { data: packages = [] } = useQuery({
    queryKey: ["admin-credit-packages"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("advertiser_credit_packages") as any)
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as CreditPackage[];
    },
  });

  // ── Query: histórico do ledger ──
  const { data: ledgerEntries = [], isLoading: isLoadingLedger } = useQuery({
    queryKey: ["admin-credit-ledger", historyFilter],
    queryFn: async () => {
      let query = (supabase.from("advertiser_credit_ledger") as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (historyFilter !== "all") {
        query = query.eq("source_type", historyFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as LedgerEntry[];
    },
    refetchInterval: 15_000,
  });

  // ── Buscar usuário ──
  const handleSearchUser = useCallback(async () => {
    if (!searchEmail.trim()) return;
    setIsSearching(true);
    setSelectedUser(null);

    try {
      // Buscar na tabela profiles por email
      const { data: profileData, error: profileError } = await (supabase.from("profiles") as any)
        .select("id, name, email")
        .ilike("email", `%${searchEmail.trim()}%`)
        .limit(1)
        .maybeSingle();

      if (profileError || !profileData) {
        toast.error("Usuário não encontrado");
        return;
      }

      // Buscar conta de anunciante
      const { data: accountData } = await (supabase.from("advertiser_accounts") as any)
        .select("id")
        .eq("user_id", profileData.id)
        .maybeSingle();

      if (!accountData) {
        toast.error("Usuário encontrado mas não possui conta de anunciante");
        return;
      }

      // Buscar saldo
      const { data: balanceData } = await (supabase.from("advertiser_credit_balances") as any)
        .select("available_credits")
        .eq("advertiser_account_id", accountData.id)
        .maybeSingle();

      setSelectedUser({
        user_id: profileData.id,
        email: profileData.email || searchEmail,
        name: profileData.name,
        account_id: accountData.id,
        available_credits: balanceData?.available_credits ?? 0,
      });

      toast.success(`Encontrado: ${profileData.email}`);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  }, [searchEmail]);

  // ── Conceder créditos ──
  const handleGrant = useCallback(async () => {
    if (!selectedUser || !grantAmount || isGranting) return;
    const amount = parseInt(grantAmount);
    if (isNaN(amount) || amount <= 0 || amount > 10000) {
      toast.error("Quantidade deve ser entre 1 e 10.000");
      return;
    }
    if (!grantDescription.trim()) {
      toast.error("Informe um motivo para a concessão");
      return;
    }

    setIsGranting(true);
    try {
      const { data, error } = await supabase.rpc("admin_grant_credits" as any, {
        p_target_user_id: selectedUser.user_id,
        p_amount: amount,
        p_source_type: grantSourceType,
        p_description: grantDescription.trim(),
        p_environment: "test",
      });

      const result = data as any;
      if (error || !result?.success) {
        toast.error(`Erro: ${result?.error || error?.message}`);
        return;
      }

      toast.success(`✅ ${amount} créditos concedidos! Novo saldo: ${result.new_balance}`);
      setSelectedUser(prev => prev ? { ...prev, available_credits: result.new_balance } : null);
      setGrantAmount("");
      setGrantDescription("");
      queryClient.invalidateQueries({ queryKey: ["admin-credit-ledger"] });
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setIsGranting(false);
    }
  }, [selectedUser, grantAmount, grantSourceType, grantDescription, isGranting, queryClient]);

  // ── Compra simulada ──
  const handleSimulatePurchase = useCallback(async (packageId: string) => {
    if (!selectedUser || isSimulating) return;
    setIsSimulating(true);
    setSimulatingPackageId(packageId);

    try {
      const { data, error } = await supabase.rpc("simulate_credit_purchase" as any, {
        p_package_id: packageId,
        p_target_user_id: selectedUser.user_id,
      });

      const result = data as any;
      if (error || !result?.success) {
        toast.error(`Erro: ${result?.error || error?.message}`);
        return;
      }

      toast.success(
        `✅ Compra simulada! ${result.credits_added} créditos · R$ ${Number(result.amount_brl).toFixed(2)} · Saldo: ${result.new_balance}`
      );
      setSelectedUser(prev => prev ? { ...prev, available_credits: result.new_balance } : null);
      queryClient.invalidateQueries({ queryKey: ["admin-credit-ledger"] });
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setIsSimulating(false);
      setSimulatingPackageId(null);
    }
  }, [selectedUser, isSimulating, queryClient]);

  // ── Helpers de renderização ──
  const getSourceBadge = (sourceType: string) => {
    const config = SOURCE_TYPE_LABELS[sourceType] || SOURCE_TYPE_LABELS.unknown;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${config.bg} ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "2-digit",
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return dateStr; }
  };

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center">
          <Coins className="w-7 h-7 text-orange-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Créditos Sandbox</h1>
          <p className="text-sm text-zinc-400 font-medium">
            Concessão manual · Compra simulada · Auditoria completa
          </p>
        </div>
      </div>

      {/* ── Busca de Usuário ── */}
      <div className="bg-[#1B1F24] rounded-2xl border border-[#2A3038]/60 p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Search className="w-5 h-5 text-orange-400" />
          <h2 className="text-sm font-black text-white uppercase tracking-widest">Buscar Usuário</h2>
        </div>
        <div className="flex gap-3">
          <Input
            placeholder="Email do anunciante..."
            value={searchEmail}
            onChange={(e) => setSearchEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearchUser()}
            className="flex-1 h-12 rounded-xl bg-[#0D0F12] border-[#2A3038] text-white placeholder:text-zinc-600"
          />
          <Button
            onClick={handleSearchUser}
            disabled={isSearching || !searchEmail.trim()}
            className="h-12 px-6 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black uppercase text-xs"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
          </Button>
        </div>

        {selectedUser && (
          <div className="bg-[#0D0F12] rounded-xl border border-emerald-500/20 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 font-black">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">{selectedUser.name || selectedUser.email}</p>
                <p className="text-xs text-zinc-400">{selectedUser.email}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-500 uppercase tracking-widest font-black">Saldo Atual</p>
              <p className="text-xl font-black text-emerald-400">R$ {selectedUser.available_credits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Seção A: Concessão Manual ── */}
      {selectedUser && (
        <div className="bg-[#1B1F24] rounded-2xl border border-[#2A3038]/60 p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Gift className="w-5 h-5 text-purple-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-widest">Concessão Manual</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Quantidade</label>
              <Input
                type="number"
                placeholder="Ex: 100"
                value={grantAmount}
                onChange={(e) => setGrantAmount(e.target.value)}
                min={1}
                max={10000}
                className="h-12 rounded-xl bg-[#0D0F12] border-[#2A3038] text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Tipo de Origem</label>
              <select
                value={grantSourceType}
                onChange={(e) => setGrantSourceType(e.target.value)}
                className="w-full h-12 rounded-xl bg-[#0D0F12] border border-[#2A3038] text-white px-3 text-sm font-medium"
              >
                {SOURCE_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Motivo *</label>
              <Input
                placeholder="Ex: Teste de leilão semana 2"
                value={grantDescription}
                onChange={(e) => setGrantDescription(e.target.value)}
                className="h-12 rounded-xl bg-[#0D0F12] border-[#2A3038] text-white"
              />
            </div>
          </div>

          <Button
            onClick={handleGrant}
            disabled={isGranting || !grantAmount || !grantDescription.trim()}
            className="w-full h-14 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-black uppercase text-xs tracking-widest"
          >
            {isGranting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Gift className="w-4 h-4 mr-2" />
                Conceder {grantAmount || "0"} Créditos
              </>
            )}
          </Button>
        </div>
      )}

      {/* ── Seção B: Compra Simulada ── */}
      {selectedUser && (
        <div className="bg-[#1B1F24] rounded-2xl border border-[#2A3038]/60 p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingBag className="w-5 h-5 text-yellow-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-widest">Compra Simulada (Sandbox)</h2>
            <span className="ml-auto text-[10px] font-black text-yellow-400 bg-yellow-500/15 px-3 py-1 rounded-full uppercase tracking-widest">
              Sem dinheiro real
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {packages.map(pkg => (
              <div
                key={pkg.id}
                className={`relative bg-[#0D0F12] rounded-xl border p-5 space-y-3 transition-all hover:border-yellow-500/40 ${
                  pkg.is_featured ? "border-yellow-500/30" : "border-[#2A3038]"
                }`}
              >
                {pkg.badge_text && (
                  <span className="absolute -top-2.5 left-4 text-[9px] font-black uppercase tracking-widest bg-yellow-500 text-black px-2.5 py-0.5 rounded-full">
                    {pkg.badge_text}
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-yellow-400" />
                  <h3 className="text-sm font-black text-white">{pkg.name}</h3>
                </div>
                <div className="space-y-1">
                  <p className="text-2xl font-black text-white">
                    {pkg.credits_total} <span className="text-xs text-zinc-500 font-medium">créditos</span>
                  </p>
                  {pkg.credits_bonus > 0 && (
                    <p className="text-[10px] text-emerald-400 font-bold">+{pkg.credits_bonus} bônus inclusos</p>
                  )}
                  <p className="text-lg font-black text-yellow-400">
                    R$ {Number(pkg.price_brl).toFixed(2)}
                  </p>
                </div>
                <Button
                  onClick={() => handleSimulatePurchase(pkg.id)}
                  disabled={isSimulating}
                  className="w-full h-10 rounded-xl bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 font-black text-[10px] uppercase tracking-widest border border-yellow-500/20"
                >
                  {simulatingPackageId === pkg.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Simular Compra"
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Seção C: Histórico ── */}
      <div className="bg-[#1B1F24] rounded-2xl border border-[#2A3038]/60 p-6 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-zinc-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-widest">Histórico Completo</h2>
            <span className="text-[10px] text-zinc-500 font-medium ml-2">
              {ledgerEntries.length} registros
            </span>
          </div>
          <select
            value={historyFilter}
            onChange={(e) => setHistoryFilter(e.target.value)}
            className="h-9 rounded-lg bg-[#0D0F12] border border-[#2A3038] text-zinc-300 px-3 text-xs font-medium"
          >
            <option value="all">Todos</option>
            <option value="purchase_real">🟢 Compra Real</option>
            <option value="purchase_sandbox">🟡 Sandbox</option>
            <option value="admin_grant">🔵 Admin</option>
            <option value="test_grant">🟣 Teste</option>
            <option value="bonus_grant">🟠 Bônus</option>
            <option value="consumption">🔴 Consumo</option>
          </select>
        </div>

        {isLoadingLedger ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </div>
        ) : ledgerEntries.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
            <p className="text-sm text-zinc-500 font-medium">Nenhum registro encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2A3038]/60">
                  <th className="text-left py-3 px-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Data</th>
                  <th className="text-left py-3 px-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Tipo</th>
                  <th className="text-left py-3 px-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Dir</th>
                  <th className="text-right py-3 px-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Qtd</th>
                  <th className="text-right py-3 px-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Saldo</th>
                  <th className="text-left py-3 px-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Ambiente</th>
                  <th className="text-left py-3 px-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Descrição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A3038]/30">
                {ledgerEntries.map(entry => {
                  const isCredit = entry.entry_type === "credit" ||
                    entry.entry_type === "purchase_confirmed" ||
                    entry.source_type.includes("grant") ||
                    entry.source_type.includes("purchase");
                  const isConsumption = entry.source_type === "consumption" ||
                    entry.entry_type === "debit" ||
                    entry.entry_type === "contact_unlock";

                  return (
                    <tr key={entry.id} className="hover:bg-[#0D0F12]/50 transition-colors">
                      <td className="py-3 px-3 text-zinc-400 font-medium whitespace-nowrap">
                        {formatDate(entry.created_at)}
                      </td>
                      <td className="py-3 px-3">
                        {getSourceBadge(entry.source_type)}
                      </td>
                      <td className="py-3 px-3">
                        {isConsumption ? (
                          <ArrowDownCircle className="w-4 h-4 text-red-400" />
                        ) : (
                          <ArrowUpCircle className="w-4 h-4 text-emerald-400" />
                        )}
                      </td>
                      <td className={`py-3 px-3 text-right font-black ${isConsumption ? "text-red-400" : "text-emerald-400"}`}>
                        {isConsumption ? "-" : "+"} R$ {Number(entry.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3 text-right text-zinc-400 font-medium">
                        <span className="text-zinc-600">R$ {Number(entry.balance_before).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        <span className="text-zinc-600 mx-1">→</span>
                        <span className="text-white font-bold">R$ {Number(entry.balance_after).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] font-bold uppercase ${
                          entry.environment === "production" ? "text-emerald-400" : "text-yellow-400"
                        }`}>
                          {entry.environment === "production" ? "PROD" : "TEST"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-zinc-400 font-medium max-w-[300px] truncate" title={entry.description || ""}>
                        {entry.description || entry.reason_code}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
