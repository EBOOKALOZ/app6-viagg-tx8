/**
 * 📋 MerchantLeadsPanel — Leads de Produtos
 * 
 * Shows leads from product_leads for the merchant's store.
 * Allows unlocking leads by spending credits from store_credit_wallet.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Phone, Lock, Unlock, ShoppingBag, User, MapPin,
    Loader2, Wallet, ExternalLink, Bell, Coins, AlertCircle
} from "lucide-react";
import { toast } from "sonner";

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

export default function MerchantLeadsPanel() {
    const { user } = useAuth();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [creditBalance, setCreditBalance] = useState<number>(0);
    const [unlocking, setUnlocking] = useState<string | null>(null);
    const [merchantStoreId, setMerchantStoreId] = useState<string | null>(null);

    // Find merchant's store_id
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

    // Load leads + wallet
    const loadData = useCallback(async () => {
        if (!merchantStoreId) return;
        setLoading(true);

        try {
            // Fetch leads
            const { data: leadsData } = await (supabase.from("product_leads") as any)
                .select("*")
                .eq("store_id", merchantStoreId)
                .order("created_at", { ascending: false })
                .limit(50);

            setLeads(leadsData || []);

            // Fetch or create wallet
            const { data: wallet } = await (supabase.from("store_credit_wallet") as any)
                .select("credits_balance")
                .eq("store_id", merchantStoreId)
                .single();

            if (!wallet) {
                // Auto-create wallet with 0 credits
                await (supabase.from("store_credit_wallet") as any).insert({
                    store_id: merchantStoreId,
                    credits_balance: 0,
                    total_earned: 0,
                    total_spent: 0,
                });
                setCreditBalance(0);
            } else {
                setCreditBalance(wallet.credits_balance);
            }
        } catch (err) {
            console.error("[MerchantLeadsPanel] error:", err);
        } finally {
            setLoading(false);
        }
    }, [merchantStoreId]);

    useEffect(() => { loadData(); }, [loadData]);

    // Real-time subscription for new leads
    useEffect(() => {
        if (!merchantStoreId) return;
        const channel = supabase
            .channel("merchant-leads")
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "product_leads",
                    filter: `store_id=eq.${merchantStoreId}`,
                },
                (payload) => {
                    const newLead = payload.new as Lead;
                    setLeads((prev) => [newLead, ...prev]);
                    toast.info("🔔 Novo cliente interessado!", {
                        description: `${newLead.customer_name} quer falar sobre "${newLead.product_title}"`,
                        duration: 8000,
                    });
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [merchantStoreId]);

    // Unlock lead
    const handleUnlock = async (lead: Lead) => {
        if (creditBalance < lead.credits_cost) {
            toast.error("Créditos insuficientes!", {
                description: `Este lead precisa de ${lead.credits_cost} créditos. Seu saldo é ${creditBalance}.`,
            });
            return;
        }

        setUnlocking(lead.id);
        try {
            // 1. Deduct credits
            const newBalance = creditBalance - lead.credits_cost;
            const { error: walletError } = await (supabase.from("store_credit_wallet") as any)
                .update({
                    credits_balance: newBalance,
                    total_spent: creditBalance - newBalance,
                    updated_at: new Date().toISOString(),
                })
                .eq("store_id", merchantStoreId);

            if (walletError) throw walletError;

            // 2. Update lead status
            const { error: leadError } = await (supabase.from("product_leads") as any)
                .update({
                    status: "unlocked",
                    unlocked_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq("id", lead.id);

            if (leadError) throw leadError;

            // 3. Record transaction
            await (supabase.from("credit_transactions") as any).insert({
                store_id: merchantStoreId,
                lead_id: lead.id,
                credits_used: lead.credits_cost,
                transaction_type: "lead_unlock",
                description: `Desbloqueio de lead: ${lead.customer_name} - ${lead.product_title}`,
                balance_after: newBalance,
            });

            // 4. Update local state
            setCreditBalance(newBalance);
            setLeads((prev) =>
                prev.map((l) => l.id === lead.id ? { ...l, status: "unlocked", unlocked_at: new Date().toISOString() } : l)
            );

            toast.success("Lead desbloqueado!", {
                description: `Agora você pode ver o contato de ${lead.customer_name}`,
            });
        } catch (err: any) {
            console.error("[MerchantLeadsPanel] unlock error:", err);
            toast.error("Erro ao desbloquear lead");
        } finally {
            setUnlocking(null);
        }
    };

    const lockedLeads = leads.filter((l) => l.status === "locked");
    const unlockedLeads = leads.filter((l) => l.status === "unlocked");

    if (loading) {
        return (
            <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-merchant" />
            </div>
        );
    }

    if (leads.length === 0) {
        return (
            <Card className="border-dashed border-2 border-merchant/20">
                <CardContent className="p-8 text-center">
                    <div className="w-14 h-14 rounded-full bg-merchant/10 flex items-center justify-center mx-auto mb-3">
                        <Bell className="h-7 w-7 text-merchant/60" />
                    </div>
                    <h3 className="font-bold text-gray-700 mb-1">Nenhum lead ainda</h3>
                    <p className="text-sm text-gray-400">
                        Quando clientes demonstrarem interesse em seus produtos, você verá aqui.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {/* Credit Balance */}
            <div className="flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                        <Coins className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                        <p className="text-xs text-amber-600 font-bold uppercase tracking-wide">Créditos</p>
                        <p className="text-2xl font-black text-amber-700">{creditBalance}</p>
                    </div>
                </div>
                <p className="text-xs text-amber-500">{lockedLeads.length} lead(s) pendente(s)</p>
            </div>

            {/* Locked Leads */}
            {lockedLeads.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide flex items-center gap-2">
                        <Lock className="h-3.5 w-3.5 text-amber-500" />
                        Novos Interessados ({lockedLeads.length})
                    </h3>
                    {lockedLeads.map((lead) => (
                        <Card key={lead.id} className="border-amber-200 bg-amber-50/50 shadow-sm hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        <div className="flex items-center gap-2">
                                            <Bell className="h-3.5 w-3.5 text-amber-500" />
                                            <span className="text-xs font-bold text-amber-600">
                                                Novo cliente interessado!
                                            </span>
                                        </div>
                                        <p className="text-sm font-bold text-gray-800 truncate">
                                            <ShoppingBag className="h-3.5 w-3.5 inline mr-1 text-gray-400" />
                                            {lead.product_title || "Produto"}
                                        </p>
                                        {lead.product_price && (
                                            <p className="text-sm font-black text-[#FF6A00]">
                                                R$ {lead.product_price}
                                            </p>
                                        )}
                                        <p className="text-sm text-gray-600">
                                            <User className="h-3 w-3 inline mr-1" />
                                            {lead.customer_name}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            📱 WhatsApp: ••••••{lead.customer_phone.slice(-4)}
                                        </p>
                                        <p className="text-[10px] text-gray-300">
                                            {new Date(lead.created_at).toLocaleString("pt-BR")}
                                        </p>
                                    </div>
                                    <Button
                                        onClick={() => handleUnlock(lead)}
                                        disabled={unlocking === lead.id || creditBalance < lead.credits_cost}
                                        className="bg-amber-500 hover:bg-amber-600 text-white shadow-md shrink-0"
                                        size="sm"
                                    >
                                        {unlocking === lead.id ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                        ) : (
                                            <Unlock className="h-3.5 w-3.5 mr-1" />
                                        )}
                                        Desbloquear ({lead.credits_cost} cr.)
                                    </Button>
                                </div>
                                {creditBalance < lead.credits_cost && (
                                    <div className="mt-2 flex items-center gap-1.5 text-xs text-red-500">
                                        <AlertCircle className="h-3 w-3" />
                                        Créditos insuficientes
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Unlocked Leads */}
            {unlockedLeads.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide flex items-center gap-2">
                        <Unlock className="h-3.5 w-3.5 text-green-500" />
                        Contatos Desbloqueados ({unlockedLeads.length})
                    </h3>
                    {unlockedLeads.map((lead) => (
                        <Card key={lead.id} className="border-green-200 bg-green-50/30 shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <p className="text-sm font-bold text-gray-800 truncate">
                                            {lead.product_title || "Produto"}
                                        </p>
                                        <p className="text-sm text-gray-600">
                                            <User className="h-3 w-3 inline mr-1" />
                                            {lead.customer_name}
                                        </p>
                                        <p className="text-sm text-green-600 font-bold">
                                            📱 {lead.customer_phone.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")}
                                        </p>
                                    </div>
                                    <a
                                        href={`https://wa.me/${lead.customer_phone}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="shrink-0"
                                    >
                                        <Button
                                            className="bg-green-500 hover:bg-green-600 text-white shadow-md"
                                            size="sm"
                                        >
                                            <Phone className="h-3.5 w-3.5 mr-1" />
                                            Falar no WhatsApp
                                        </Button>
                                    </a>
                                </div>
                                <p className="text-[10px] text-gray-300 mt-1">
                                    Desbloqueado em {lead.unlocked_at ? new Date(lead.unlocked_at).toLocaleString("pt-BR") : ""}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
