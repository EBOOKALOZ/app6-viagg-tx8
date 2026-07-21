import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
    Wallet,
    ArrowUpRight,
    ArrowDownRight,
    RefreshCcw,
    Landmark,
    Loader2,
    AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { MotoboyPageTemplate } from '@/components/motoboy/MotoboyPageTemplate';

interface LedgerEntry {
    id: string;
    created_at: string;
    type: string;
    amount: number;
    description: string;
}

interface ProfileWallet {
    id: string;
    balance: number;
}

export default function MotoboyWalletPage() {
    console.log('[DEBUG MotoboyWalletPage] Render started');
    const { user } = useAuth();
    console.log('[DEBUG MotoboyWalletPage] Auth user:', user?.id);
    const [wallet, setWallet] = useState<ProfileWallet | null>(null);
    const [history, setHistory] = useState<LedgerEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Withdraw Modal State
    const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [pixKey, setPixKey] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Carregar carteira do motoboy e extrato
    const fetchWalletData = async () => {
        console.log('[DEBUG MotoboyWalletPage] Fetching wallet for user:', user?.id);
        if (!user?.id) return;
        setIsLoading(true);

        try {
            // @ts-ignore - Assuming profile_wallets and relation exists or will be created
            let { data: walletData, error: walletError } = await supabase
                .from('profile_wallets')
                .select('*')
                .eq('account_id', user.id)
                .eq('profile_type', 'motoboy')
                .maybeSingle();

            console.log('[DEBUG MotoboyWalletPage] Found walletData:', walletData);

            if (!walletData || Number(walletData.balance || 0) === 0) {
                const { data: payAccounts } = await (supabase.from('pay_financial_accounts' as any)
                    .select('id, available_balance')
                    .eq('owner_id', user.id)
                    .in('account_type', ['motoboy_wallet', 'mototaxi_wallet', 'driver_wallet', 'merchant_wallet', 'customer_wallet'])) as any;
                if (payAccounts && Array.isArray(payAccounts) && payAccounts.length > 0) {
                    const totalPayReais = payAccounts.reduce((sum: number, acc: any) => sum + Number(acc.available_balance || 0), 0);
                    walletData = {
                        id: payAccounts[0].id,
                        balance: totalPayReais,
                        ...(walletData || {})
                    } as any;
                }
            }

            if (walletError && walletError.code !== 'PGRST116') {
                console.error('[DEBUG MotoboyWalletPage] Wallet error:', walletError);
                throw walletError;
            }

            if (walletData) {
                setWallet(walletData);
                await fetchHistory(walletData.id);
            } else {
                setWallet(null);
                setHistory([]);
            }
        } catch (err) {
            console.error('[MotoboyWallet] Fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchHistory = async (walletId: string) => {
        console.log('[DEBUG MotoboyWalletPage] Fetching history for walletId:', walletId);
        try {
            // @ts-ignore
            let { data: entries, error } = await supabase
                .from('ledger_entries')
                .select('*')
                .eq('wallet_id', walletId)
                .order('created_at', { ascending: false });

            console.log('[DEBUG MotoboyWalletPage] Ledger entries for walletId', walletId, ':', entries);
            if (!entries || entries.length === 0) {
                const { data: statementEntries } = await (supabase.from('v_wallet_statement' as any)
                    .select('*')
                    .eq('owner_user_id', user!.id)
                    .order('created_at', { ascending: false })) as any;
                if (statementEntries && Array.isArray(statementEntries) && statementEntries.length > 0) {
                    entries = statementEntries.map((e: any) => ({
                        id: e.id,
                        created_at: e.created_at,
                        type: e.direction || e.entry_type || 'credit',
                        amount: e.amount_cents ? e.amount_cents / 100 : Number(e.amount || 0),
                        description: e.description || e.category || 'Transação financeira'
                    })) as any;
                }
            }

            if (error && error.code !== 'PGRST116') {
                console.error('[DEBUG MotoboyWalletPage] History error:', error);
                throw error;
            }
            setHistory(entries || []);
        } catch (err) {
            console.error('[MotoboyWallet] History error:', err);
        }
    };

    // Setup de subscrição realtime
    useEffect(() => {
        if (!user?.id) return;
        fetchWalletData();

        // @ts-ignore
        const channel = supabase.channel('motoboy_wallet_updates')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'ledger_entries'
            }, (payload) => {
                // Recarregar os dados se mudar o extrato
                console.log('[MotoboyWallet] Realtime update:', payload);
                fetchWalletData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id]);

    const handleWithdrawRequest = async () => {
        if (!wallet) return;
        if (!withdrawAmount || isNaN(Number(withdrawAmount)) || Number(withdrawAmount) <= 0) {
            toast.error('Informe um valor válido para o saque.');
            return;
        }
        if (!pixKey.trim()) {
            toast.error('Informe sua chave PIX.');
            return;
        }
        if (Number(withdrawAmount) > wallet.balance) {
            toast.error('Saldo insuficiente para este valor.');
            return;
        }

        setIsSubmitting(true);
        try {
            // @ts-ignore - Assumes the RPC exists
            const { data, error } = await supabase.rpc('request_payout', {
                wallet_id: wallet.id,
                amount: Number(withdrawAmount),
                pix_key: pixKey
            });

            if (error) throw error;

            toast.success('Saque solicitado com sucesso');
            setIsWithdrawModalOpen(false);
            setWithdrawAmount('');
            setPixKey('');
            fetchWalletData();
        } catch (error: any) {
            console.error('[MotoboyWallet] Withdraw error:', error);
            toast.error(error.message || 'Erro ao solicitar saque. Tente novamente.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    // Helpers para ícone e cor por tipo de transação (heurística baseada no sinal do amount ou campo type)
    const isCredit = (entry: LedgerEntry) => entry.amount > 0;

    return (
        <MotoboyPageTemplate title="Carteira" subtitle="Digital" icon={Wallet}>
            <div className="flex flex-col min-h-full pb-20">
                <div className="p-4 space-y-4 max-w-lg mx-auto w-full">

                    {/* Card de Saldo */}
                    <div className="bg-orange-500 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
                        {/* Elemento de background pra dar visual de "cartão/carteira" */}
                        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white opacity-10" />
                        <div className="absolute bottom-0 right-10 -mb-10 w-24 h-24 rounded-full bg-white opacity-10" />

                        <div className="relative z-10 flex flex-col gap-1">
                            <div className="flex items-center gap-2 mb-2">
                                <Wallet className="h-5 w-5 text-orange-100" />
                                <span className="font-medium text-orange-100 text-sm">Carteira do Motoboy</span>
                            </div>

                            <p className="text-orange-100 text-sm mt-2">Saldo disponível</p>
                            {isLoading ? (
                                <div className="h-10 w-32 bg-orange-400/50 animate-pulse rounded-lg mt-1" />
                            ) : (
                                <h2 className="text-4xl font-bold tracking-tight">
                                    {formatCurrency(wallet?.balance || 0)}
                                </h2>
                            )}
                        </div>
                    </div>

                    {/* Botões de Ação Rápida */}
                    <div className="flex gap-3">
                        <Button
                            className="flex-1 bg-white hover:bg-slate-100 text-orange-600 border border-orange-200 shadow-sm"
                            onClick={() => setIsWithdrawModalOpen(true)}
                            disabled={!wallet || wallet.balance <= 0 || isLoading}
                        >
                            <Landmark className="mr-2 h-4 w-4" />
                            Solicitar Saque
                        </Button>

                        <Button
                            variant="outline"
                            className="flex-1 bg-white hover:bg-slate-100 text-slate-700 shadow-sm"
                            onClick={fetchWalletData}
                            disabled={isLoading}
                        >
                            <RefreshCcw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                            Atualizar
                        </Button>
                    </div>

                    {/* Seção de Extrato */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mt-6">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-semibold text-slate-800">Extrato Completo</h3>
                        </div>

                        <div className="divide-y divide-slate-100">
                            {isLoading ? (
                                <div className="p-8 flex justify-center">
                                    <Loader2 className="h-6 w-6 text-orange-500 animate-spin" />
                                </div>
                            ) : history.length === 0 ? (
                                <div className="p-8 flex flex-col items-center justify-center text-center gap-3">
                                    <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center">
                                        <AlertCircle className="h-6 w-6 text-slate-300" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-700">Nenhuma movimentação ainda</p>
                                        <p className="text-xs text-slate-500 mt-1">Suas corridas aparecerão aqui.</p>
                                    </div>
                                </div>
                            ) : (
                                history.map((entry) => {
                                    const credit = isCredit(entry);
                                    return (
                                        <div key={entry.id} className="p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                                            <div className={`p-2 rounded-full flex-shrink-0 ${credit ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                                                }`}>
                                                {credit ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-800 truncate">
                                                    {entry.description || (credit ? 'Crédito' : 'Débito')}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    {new Date(entry.created_at).toLocaleDateString('pt-BR', {
                                                        day: '2-digit', month: '2-digit', year: 'numeric'
                                                    })}
                                                </p>
                                            </div>

                                            <div className={`font-semibold shrink-0 ${credit ? 'text-green-600' : 'text-slate-800'
                                                }`}>
                                                {credit ? '+' : ''}{formatCurrency(entry.amount)}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Modal de Saque */}
                <Dialog open={isWithdrawModalOpen} onOpenChange={setIsWithdrawModalOpen}>
                    <DialogContent className="sm:max-w-md rounded-2xl">
                        <DialogHeader>
                            <DialogTitle>Solicitar Saque</DialogTitle>
                            <DialogDescription>
                                Informe o valor que deseja transferir e sua chave PIX.
                                <br />Saldo disponível: <strong className="text-orange-600">{formatCurrency(wallet?.balance || 0)}</strong>
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="amount">Valor do Saque (R$)</Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    placeholder="0.00"
                                    value={withdrawAmount}
                                    onChange={(e) => setWithdrawAmount(e.target.value)}
                                    step="0.01"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="pix">Chave PIX</Label>
                                <Input
                                    id="pix"
                                    placeholder="CPF, E-mail, Telefone ou Aleatória"
                                    value={pixKey}
                                    onChange={(e) => setPixKey(e.target.value)}
                                />
                            </div>
                        </div>

                        <DialogFooter className="sm:justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsWithdrawModalOpen(false)}
                                disabled={isSubmitting}
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                className="bg-orange-500 hover:bg-orange-600 text-white"
                                onClick={handleWithdrawRequest}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Processando...
                                    </>
                                ) : (
                                    'Confirmar Saque'
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </MotoboyPageTemplate>
    );
}
