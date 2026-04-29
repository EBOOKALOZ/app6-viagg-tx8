/**
 * 💰 MerchantCreditWallet — Full Credit Monetization Module
 * 
 * Sections:
 * 1. Wallet header (balance, buy credits button)
 * 2. Pricing table (cost per product price tier)
 * 3. Leads list (locked/unlocked with unlock confirmation modal)
 * 4. Credit purchase modal (PIX packages)
 * 5. Transaction history
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Phone, Lock, Unlock, ShoppingBag, User,
    Loader2, Wallet, Bell, Coins, AlertCircle,
    CreditCard, History, ChevronDown, ChevronUp,
    Check, QrCode, Copy, Info, Sparkles, ArrowDownCircle, ArrowUpCircle
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ──────────────────────────────
interface Lead {
    id: string;
    product_id: string;
    product_title: string | null;
    product_price: string | null;
    customer_name: string;
    customer_phone: string;
    status: string;
    credits_cost: number;
    city: string | null;
    neighborhood: string | null;
    created_at: string;
    unlocked_at: string | null;
}

interface Transaction {
    id: string;
    amount: number;
    type: string;
    description: string | null;
    created_at: string;
}

// ─── Pricing Tiers ──────────────────────
const PRICING_TIERS = [
    { min: 0, max: 99.99, credits: 1 },
    { min: 100, max: 199.99, credits: 2 },
    { min: 200, max: 299.99, credits: 3 },
    { min: 300, max: 499.99, credits: 4 },
    { min: 500, max: 999.99, credits: 5 },
    { min: 1000, max: 2999.99, credits: 6 },
    { min: 3000, max: 10000, credits: 7 },
];

const CREDIT_PRICE = 4.0; // R$ per credit

const CREDIT_PACKAGES = [
    { credits: 10, price: 40, label: "Iniciante", popular: false },
    { credits: 30, price: 120, label: "Crescimento", popular: true },
    { credits: 50, price: 200, label: "Profissional", popular: false },
    { credits: 100, price: 400, label: "Expansão", popular: false },
];

// ─── Component ──────────────────────────
export default function MerchantCreditWallet() {
    const { user } = useAuth();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [creditBalance, setCreditBalance] = useState<number>(0);
    const [unlocking, setUnlocking] = useState<string | null>(null);
    const [merchantStoreId, setMerchantStoreId] = useState<string | null>(null);

    // Modals
    const [confirmLead, setConfirmLead] = useState<Lead | null>(null);
    const [showPurchase, setShowPurchase] = useState(false);
    const [showPricing, setShowPricing] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [selectedPackage, setSelectedPackage] = useState<typeof CREDIT_PACKAGES[0] | null>(null);

    // Active tab
    const [activeTab, setActiveTab] = useState<"leads" | "wallet">("leads");

    // ── Find merchant store ──
    useEffect(() => {
        if (!user?.id) return;
        (async () => {
            const { data } = await (supabase.from("merchant_stores") as any)
                .select("id")
                .eq("user_id", user.id)
                .limit(1)
                .single();
            if (data) setMerchantStoreId(data.id);
        })();
    }, [user?.id]);

    // ── Load data ──
    const loadData = useCallback(async () => {
        if (!merchantStoreId) return;
        setLoading(true);
        try {
            // Leads
            const { data: leadsData } = await (supabase.from("product_leads") as any)
                .select("*")
                .eq("store_id", merchantStoreId)
                .order("created_at", { ascending: false })
                .limit(50);
            setLeads(leadsData || []);

            // Wallet
            const { data: wallet } = await (supabase.from("store_credit_wallet") as any)
                .select("balance")
                .eq("store_id", merchantStoreId)
                .single();

            if (!wallet) {
                await (supabase.from("store_credit_wallet") as any).insert({
                    store_id: merchantStoreId,
                    balance: 0,
                });
                setCreditBalance(0);
            } else {
                setCreditBalance(wallet.balance ?? 0);
            }

            // Transactions
            const { data: txData } = await (supabase.from("credit_transactions") as any)
                .select("*")
                .eq("store_id", merchantStoreId)
                .order("created_at", { ascending: false })
                .limit(20);
            setTransactions(txData || []);
        } catch (err) {
            console.error("[MerchantCreditWallet] error:", err);
        } finally {
            setLoading(false);
        }
    }, [merchantStoreId]);

    useEffect(() => { loadData(); }, [loadData]);

    // ── Realtime leads ──
    useEffect(() => {
        if (!merchantStoreId) return;
        const channel = supabase
            .channel("merchant-leads-wallet")
            .on("postgres_changes", {
                event: "INSERT", schema: "public", table: "product_leads",
                filter: `store_id=eq.${merchantStoreId}`,
            }, (payload) => {
                const newLead = payload.new as Lead;
                setLeads(prev => [newLead, ...prev]);
                toast.info("🔔 Novo cliente interessado!", {
                    description: `${newLead.customer_name} quer "${newLead.product_title}"`,
                    duration: 8000,
                });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [merchantStoreId]);

    // ── Unlock lead ──
    const handleUnlock = async (lead: Lead) => {
        if (creditBalance < lead.credits_cost) {
            toast.error("Créditos insuficientes!", {
                description: `Precisa de ${lead.credits_cost} créditos. Saldo: ${creditBalance}.`,
            });
            return;
        }
        setUnlocking(lead.id);
        setConfirmLead(null);
        try {
            const newBalance = creditBalance - lead.credits_cost;

            const { error: wErr } = await (supabase.from("store_credit_wallet") as any)
                .update({ balance: newBalance, updated_at: new Date().toISOString() })
                .eq("store_id", merchantStoreId);
            if (wErr) throw wErr;

            const { error: lErr } = await (supabase.from("product_leads") as any)
                .update({ status: "unlocked", updated_at: new Date().toISOString() })
                .eq("id", lead.id);
            if (lErr) throw lErr;

            await (supabase.from("credit_transactions") as any).insert({
                store_id: merchantStoreId,
                lead_id: lead.id,
                amount: lead.credits_cost,
                type: "debit",
                description: `Lead: ${lead.customer_name} - ${lead.product_title}`,
            });

            setCreditBalance(newBalance);
            setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: "unlocked" } : l));
            setTransactions(prev => [{
                id: crypto.randomUUID(),
                amount: lead.credits_cost,
                type: "debit",
                description: `Lead: ${lead.customer_name} - ${lead.product_title}`,
                created_at: new Date().toISOString(),
            }, ...prev]);

            toast.success("Lead desbloqueado!", {
                description: `Contato de ${lead.customer_name} liberado`,
            });
        } catch (err) {
            toast.error("Erro ao desbloquear lead");
        } finally {
            setUnlocking(null);
        }
    };

    // ── Simulate PIX purchase ──
    const handlePurchase = async (pkg: typeof CREDIT_PACKAGES[0]) => {
        setSelectedPackage(pkg);
    };

    const confirmPurchase = async () => {
        if (!selectedPackage || !merchantStoreId) return;
        try {
            const newBalance = creditBalance + selectedPackage.credits;

            const { error } = await (supabase.from("store_credit_wallet") as any)
                .update({ balance: newBalance, updated_at: new Date().toISOString() })
                .eq("store_id", merchantStoreId);
            if (error) throw error;

            await (supabase.from("credit_transactions") as any).insert({
                store_id: merchantStoreId,
                amount: selectedPackage.credits,
                type: "credit",
                description: `Compra: ${selectedPackage.credits} créditos (${selectedPackage.label})`,
            });

            setCreditBalance(newBalance);
            setTransactions(prev => [{
                id: crypto.randomUUID(),
                amount: selectedPackage.credits,
                type: "credit",
                description: `Compra: ${selectedPackage.credits} créditos (${selectedPackage.label})`,
                created_at: new Date().toISOString(),
            }, ...prev]);

            toast.success(`${selectedPackage.credits} créditos adicionados!`);
            setShowPurchase(false);
            setSelectedPackage(null);
        } catch {
            toast.error("Erro ao processar compra");
        }
    };

    const lockedLeads = leads.filter(l => l.status === "locked");
    const unlockedLeads = leads.filter(l => l.status === "unlocked");

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* ══════ WALLET HEADER ══════ */}
            <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-2xl p-5 text-white shadow-lg">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                            <Coins className="h-7 w-7 text-white" />
                        </div>
                        <div>
                            <p className="text-xs text-white/70 font-bold uppercase tracking-wider">Carteira de Créditos</p>
                            <p className="text-4xl font-black">{creditBalance}</p>
                            <p className="text-[10px] text-white/60">créditos disponíveis</p>
                        </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <Button
                            onClick={() => setShowPurchase(true)}
                            className="bg-white text-amber-600 hover:bg-white/90 font-bold shadow-md"
                            size="sm"
                        >
                            <CreditCard className="h-4 w-4 mr-1.5" />
                            Comprar Créditos
                        </Button>
                        <Button
                            onClick={() => setShowHistory(!showHistory)}
                            variant="outline"
                            className="border-white/30 text-white hover:bg-white/10"
                            size="sm"
                        >
                            <History className="h-4 w-4 mr-1.5" />
                            Histórico
                        </Button>
                    </div>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-white/20">
                    <div className="text-center">
                        <p className="text-xl font-black">{lockedLeads.length}</p>
                        <p className="text-[9px] text-white/60 font-bold uppercase">Pendentes</p>
                    </div>
                    <div className="text-center">
                        <p className="text-xl font-black">{unlockedLeads.length}</p>
                        <p className="text-[9px] text-white/60 font-bold uppercase">Desbloqueados</p>
                    </div>
                    <div className="text-center">
                        <p className="text-xl font-black">R$ {(creditBalance * CREDIT_PRICE).toFixed(2).replace(".", ",")}</p>
                        <p className="text-[9px] text-white/60 font-bold uppercase">Valor em conta</p>
                    </div>
                </div>
            </div>

            {/* ══════ HOW IT WORKS ══════ */}
            <button
                onClick={() => setShowPricing(!showPricing)}
                className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 rounded-xl border border-blue-100 hover:bg-blue-100 transition-colors"
            >
                <span className="flex items-center gap-2 text-sm font-bold text-blue-700">
                    <Info className="h-4 w-4" />
                    Como funciona? Tabela de preços
                </span>
                {showPricing ? <ChevronUp className="h-4 w-4 text-blue-500" /> : <ChevronDown className="h-4 w-4 text-blue-500" />}
            </button>

            {showPricing && (
                <Card className="border-blue-200 bg-blue-50/50">
                    <CardContent className="p-4 space-y-3">
                        <p className="text-xs text-blue-600 font-medium leading-relaxed">
                            Quando um cliente demonstra interesse em seu produto, o contato fica <strong>bloqueado</strong>.
                            Use créditos para liberar o WhatsApp do comprador. Cada crédito custa <strong>R$ {CREDIT_PRICE.toFixed(2).replace(".", ",")}</strong>.
                        </p>
                        <div className="rounded-xl overflow-hidden border border-blue-200">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="bg-blue-100">
                                        <th className="py-2 px-3 text-left font-bold text-blue-700">Faixa de Preço do Produto</th>
                                        <th className="py-2 px-3 text-center font-bold text-blue-700">Créditos</th>
                                        <th className="py-2 px-3 text-right font-bold text-blue-700">Custo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {PRICING_TIERS.map((tier, i) => (
                                        <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-blue-50/50"}>
                                            <td className="py-2 px-3 text-gray-600">
                                                R$ {tier.min.toFixed(0)} — R$ {tier.max >= 10000 ? "10.000+" : tier.max.toFixed(0)}
                                            </td>
                                            <td className="py-2 px-3 text-center">
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold text-[10px]">
                                                    <Coins className="h-2.5 w-2.5" /> {tier.credits}
                                                </span>
                                            </td>
                                            <td className="py-2 px-3 text-right font-bold text-gray-700">
                                                R$ {(tier.credits * CREDIT_PRICE).toFixed(2).replace(".", ",")}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ══════ TAB SELECTOR ══════ */}
            <div className="flex rounded-xl bg-gray-100 p-1">
                <button
                    onClick={() => setActiveTab("leads")}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                        activeTab === "leads" ? "bg-white shadow-sm text-amber-600" : "text-gray-500 hover:text-gray-700"
                    }`}>
                    <Bell className="h-3.5 w-3.5 inline mr-1" />
                    Leads ({leads.length})
                </button>
                <button
                    onClick={() => setActiveTab("wallet")}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                        activeTab === "wallet" ? "bg-white shadow-sm text-amber-600" : "text-gray-500 hover:text-gray-700"
                    }`}>
                    <Wallet className="h-3.5 w-3.5 inline mr-1" />
                    Carteira
                </button>
            </div>

            {/* ══════ LEADS TAB ══════ */}
            {activeTab === "leads" && (
                <div className="space-y-4">
                    {leads.length === 0 ? (
                        <Card className="border-dashed border-2 border-amber-200">
                            <CardContent className="p-8 text-center">
                                <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3">
                                    <Bell className="h-7 w-7 text-amber-400" />
                                </div>
                                <h3 className="font-bold text-gray-700 mb-1">Nenhum lead ainda</h3>
                                <p className="text-sm text-gray-400">
                                    Quando clientes demonstrarem interesse, os leads aparecerão aqui.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            {/* Locked */}
                            {lockedLeads.length > 0 && (
                                <div className="space-y-2.5">
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                                        <Lock className="h-3 w-3 text-amber-500" />
                                        Pendentes ({lockedLeads.length})
                                    </h3>
                                    {lockedLeads.map(lead => (
                                        <Card key={lead.id} className="border-amber-200 bg-amber-50/50 shadow-sm hover:shadow transition-shadow">
                                            <CardContent className="p-3.5">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0 space-y-1">
                                                        <p className="text-xs font-bold text-amber-600 flex items-center gap-1">
                                                            <Bell className="h-3 w-3" /> Novo interesse!
                                                        </p>
                                                        <p className="text-sm font-bold text-gray-800 truncate">
                                                            <ShoppingBag className="h-3 w-3 inline mr-1 text-gray-400" />
                                                            {lead.product_title || "Produto"}
                                                        </p>
                                                        {lead.product_price && (
                                                            <p className="text-sm font-black text-[#FF6A00]">R$ {lead.product_price}</p>
                                                        )}
                                                        <p className="text-xs text-gray-600">
                                                            <User className="h-3 w-3 inline mr-1" />{lead.customer_name}
                                                        </p>
                                                        <p className="text-xs text-gray-400">📱 ••••••{lead.customer_phone.slice(-4)}</p>
                                                        {lead.city && <p className="text-[10px] text-gray-300">📍 {lead.city}</p>}
                                                        <p className="text-[10px] text-gray-300">
                                                            {new Date(lead.created_at).toLocaleString("pt-BR")}
                                                        </p>
                                                    </div>
                                                    <Button
                                                        onClick={() => setConfirmLead(lead)}
                                                        disabled={unlocking === lead.id}
                                                        className="bg-amber-500 hover:bg-amber-600 text-white shadow shrink-0"
                                                        size="sm"
                                                    >
                                                        {unlocking === lead.id ? (
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                                        ) : (
                                                            <Unlock className="h-3.5 w-3.5 mr-1" />
                                                        )}
                                                        Liberar ({lead.credits_cost} cr.)
                                                    </Button>
                                                </div>
                                                {creditBalance < lead.credits_cost && (
                                                    <div className="mt-2 flex items-center gap-1 text-[10px] text-red-500">
                                                        <AlertCircle className="h-3 w-3" /> Saldo insuficiente
                                                        <button onClick={() => setShowPurchase(true)} className="underline font-bold ml-1">Comprar</button>
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}

                            {/* Unlocked */}
                            {unlockedLeads.length > 0 && (
                                <div className="space-y-2.5">
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                                        <Unlock className="h-3 w-3 text-green-500" />
                                        Desbloqueados ({unlockedLeads.length})
                                    </h3>
                                    {unlockedLeads.map(lead => (
                                        <Card key={lead.id} className="border-green-200 bg-green-50/30 shadow-sm">
                                            <CardContent className="p-3.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex-1 min-w-0 space-y-0.5">
                                                        <p className="text-sm font-bold text-gray-800 truncate">{lead.product_title}</p>
                                                        <p className="text-xs text-gray-600">{lead.customer_name}</p>
                                                        <p className="text-sm text-green-600 font-bold">
                                                            📱 {lead.customer_phone.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")}
                                                        </p>
                                                    </div>
                                                    <a href={`https://wa.me/${lead.customer_phone}?text=${encodeURIComponent(
                                                        `Olá ${lead.customer_name}! Vi seu interesse no produto "${lead.product_title}". Vamos conversar?`
                                                    )}`} target="_blank" rel="noopener noreferrer">
                                                        <Button className="bg-green-500 hover:bg-green-600 text-white" size="sm">
                                                            <Phone className="h-3.5 w-3.5 mr-1" /> WhatsApp
                                                        </Button>
                                                    </a>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ══════ WALLET TAB ══════ */}
            {activeTab === "wallet" && (
                <div className="space-y-3">
                    {/* Transaction history */}
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                        <History className="h-3 w-3" /> Histórico de Movimentações
                    </h3>
                    {transactions.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-6">Nenhuma movimentação ainda.</p>
                    ) : (
                        <div className="space-y-1.5">
                            {transactions.map(tx => (
                                <div key={tx.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100">
                                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                        {tx.type === "credit" ? (
                                            <ArrowDownCircle className="h-4 w-4 text-green-500 shrink-0" />
                                        ) : (
                                            <ArrowUpCircle className="h-4 w-4 text-red-400 shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-gray-700 truncate">{tx.description || "Movimentação"}</p>
                                            <p className="text-[10px] text-gray-400">
                                                {new Date(tx.created_at).toLocaleString("pt-BR")}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`text-sm font-black shrink-0 ${tx.type === "credit" ? "text-green-600" : "text-red-500"}`}>
                                        {tx.type === "credit" ? "+" : "−"}{tx.amount} cr.
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ══════ HISTORY INLINE (toggle from header) ══════ */}
            {showHistory && activeTab !== "wallet" && (
                <Card className="border-gray-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs flex items-center gap-2 text-gray-600">
                            <History className="h-3.5 w-3.5" /> Últimas Movimentações
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {transactions.length === 0 ? (
                            <p className="text-xs text-gray-400 py-3 text-center">Nenhuma movimentação.</p>
                        ) : (
                            <div className="space-y-1">
                                {transactions.slice(0, 5).map(tx => (
                                    <div key={tx.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0">
                                        <span className="text-gray-500 truncate flex-1">{tx.description}</span>
                                        <span className={`font-bold shrink-0 ml-2 ${tx.type === "credit" ? "text-green-600" : "text-red-500"}`}>
                                            {tx.type === "credit" ? "+" : "−"}{tx.amount}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* ══════ CONFIRM UNLOCK MODAL ══════ */}
            <Dialog open={!!confirmLead} onOpenChange={(v) => !v && setConfirmLead(null)}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-amber-600">
                            <Unlock className="h-5 w-5" /> Liberar Contato
                        </DialogTitle>
                    </DialogHeader>
                    {confirmLead && (
                        <div className="space-y-4">
                            <div className="bg-amber-50 rounded-xl p-4 space-y-2">
                                <p className="text-sm font-bold text-gray-800">{confirmLead.product_title}</p>
                                <p className="text-sm text-gray-600">{confirmLead.customer_name}</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Custo:</span>
                                    <span className="font-black text-amber-600">{confirmLead.credits_cost} crédito(s)</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Saldo atual:</span>
                                    <span className="font-bold text-gray-800">{creditBalance} crédito(s)</span>
                                </div>
                                <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
                                    <span className="text-gray-500">Saldo após:</span>
                                    <span className={`font-bold ${creditBalance - confirmLead.credits_cost >= 0 ? "text-green-600" : "text-red-500"}`}>
                                        {creditBalance - confirmLead.credits_cost} crédito(s)
                                    </span>
                                </div>
                            </div>
                            {creditBalance < confirmLead.credits_cost ? (
                                <div className="text-center space-y-2">
                                    <p className="text-sm text-red-500 font-bold">Saldo insuficiente!</p>
                                    <Button onClick={() => { setConfirmLead(null); setShowPurchase(true); }}
                                        className="bg-amber-500 hover:bg-amber-600 text-white w-full">
                                        <CreditCard className="h-4 w-4 mr-1.5" /> Comprar Créditos
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <Button variant="outline" className="flex-1" onClick={() => setConfirmLead(null)}>
                                        Cancelar
                                    </Button>
                                    <Button
                                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                                        onClick={() => handleUnlock(confirmLead)}
                                        disabled={unlocking === confirmLead.id}
                                    >
                                        {unlocking === confirmLead.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                                        ) : (
                                            <Check className="h-4 w-4 mr-1.5" />
                                        )}
                                        Confirmar
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* ══════ PURCHASE CREDITS MODAL ══════ */}
            <Dialog open={showPurchase} onOpenChange={setShowPurchase}>
                <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden rounded-2xl border-0 shadow-2xl">
                    {selectedPackage ? (
                        /* PIX Payment Screen */
                        <div className="p-6 space-y-4">
                            <div className="text-center space-y-2">
                                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                                    <QrCode className="h-8 w-8 text-green-600" />
                                </div>
                                <h3 className="text-lg font-black text-gray-800">Pagamento via PIX</h3>
                                <p className="text-sm text-gray-500">
                                    {selectedPackage.credits} créditos — <strong>R$ {selectedPackage.price.toFixed(2).replace(".", ",")}</strong>
                                </p>
                            </div>

                            <div className="bg-gray-50 rounded-xl p-4 text-center space-y-3">
                                <div className="w-36 h-36 bg-gray-200 rounded-xl mx-auto flex items-center justify-center">
                                    <QrCode className="h-16 w-16 text-gray-400" />
                                </div>
                                <p className="text-[10px] text-gray-400">Escaneie o QR Code ou copie o código PIX</p>
                                <button className="flex items-center gap-1.5 mx-auto px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-600 transition-colors">
                                    <Copy className="h-3 w-3" /> Copiar código PIX
                                </button>
                            </div>

                            <div className="flex gap-2">
                                <Button variant="outline" className="flex-1" onClick={() => setSelectedPackage(null)}>
                                    Voltar
                                </Button>
                                <Button className="flex-1 bg-green-500 hover:bg-green-600 text-white" onClick={confirmPurchase}>
                                    <Check className="h-4 w-4 mr-1.5" /> Confirmar Pagamento
                                </Button>
                            </div>
                        </div>
                    ) : (
                        /* Package Selection */
                        <>
                            <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-5">
                                <DialogHeader>
                                    <DialogTitle className="text-lg font-black text-white flex items-center gap-2">
                                        <Sparkles className="h-5 w-5" /> Comprar Créditos
                                    </DialogTitle>
                                </DialogHeader>
                                <p className="text-xs text-white/80 mt-1">
                                    Cada crédito = R$ {CREDIT_PRICE.toFixed(2).replace(".", ",")}. Escolha um pacote:
                                </p>
                            </div>
                            <div className="p-5 space-y-3">
                                {CREDIT_PACKAGES.map(pkg => (
                                    <button
                                        key={pkg.credits}
                                        onClick={() => handlePurchase(pkg)}
                                        className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98] ${
                                            pkg.popular
                                                ? "border-amber-400 bg-amber-50 shadow-md"
                                                : "border-gray-200 bg-white hover:border-amber-300"
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                                pkg.popular ? "bg-amber-400 text-white" : "bg-gray-100 text-gray-500"
                                            }`}>
                                                <Coins className="h-5 w-5" />
                                            </div>
                                            <div className="text-left">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-black text-gray-800">{pkg.credits} créditos</p>
                                                    {pkg.popular && (
                                                        <span className="text-[9px] font-bold px-2 py-0.5 bg-amber-400 text-white rounded-full">
                                                            POPULAR
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-gray-400 font-medium">{pkg.label}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-black text-gray-800">
                                                R$ {pkg.price.toFixed(0)}
                                            </p>
                                            <p className="text-[9px] text-gray-400">
                                                R$ {CREDIT_PRICE.toFixed(2).replace(".", ",")}/cr.
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
