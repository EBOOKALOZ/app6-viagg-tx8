import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Minus, Search, Clock } from "lucide-react";

interface Merchant {
    id: string;
    name: string;
    email: string;
    account_id?: string;
}

interface AdjustmentHistory {
    id: string;
    created_at: string;
    amount_cents: number;
    entry_type: 'credit' | 'debit';
    description: string;
    metadata: any;
    financial_accounts: {
        profiles: {
            nome_loja: string;
            email: string;
        }
    }
}

export default function AdminFinanceAdjustments() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [merchants, setMerchants] = useState<Merchant[]>([]);
    const [history, setHistory] = useState<AdjustmentHistory[]>([]);
    const [loadingInitial, setLoadingInitial] = useState(true);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedMerchantId, setSelectedMerchantId] = useState<string>("");
    const [amountStr, setAmountStr] = useState("");
    const [entryType, setEntryType] = useState<'credit' | 'debit'>('credit');
    const [prefix, setPrefix] = useState<string>("");
    const [complement, setComplement] = useState<string>("");

    const fetchData = async () => {
        try {
            // 1. Fetch Merchants and their Financial Account IDs
            const { data: merchantsData, error: merchantsError } = await supabase
                .from('profiles')
                .select(`
          id,
          nome_loja,
          email,
          financial_accounts ( id )
        `)
                .eq('profile_type', 'merchant')
                .order('nome_loja', { ascending: true });

            if (merchantsError) throw merchantsError;

            const formattedMerchants = (merchantsData as any[])
                .filter(m => m.financial_accounts && m.financial_accounts.length > 0)
                .map(m => ({
                    id: m.id,
                    name: m.nome_loja || "Lojista sem nome",
                    email: m.email || "",
                    account_id: m.financial_accounts[0].id
                }));

            setMerchants(formattedMerchants);

            // 2. Fetch Adjustments History
            // Busca registros de ledger_entries onde metadata->>admin_adjustment = 'true'
            const { data: historyData, error: historyError } = await supabase
                .from('ledger_entries')
                .select(`
          id,
          created_at,
          amount_cents,
          entry_type,
          description,
          metadata,
          financial_accounts!inner (
            profiles!inner (
              nome_loja,
              email
            )
          )
        `)
                .eq('source_type', 'admin_adjustment')
                .order('created_at', { ascending: false })
                .limit(20);

            if (historyError) {
                console.error("Erro ao buscar histórico:", historyError);
            } else {
                setHistory(historyData as any[]);
            }

        } catch (e: any) {
            console.error("Erro ao carregar dados:", e);
            toast({
                title: "Erro de carregamento",
                description: "Não foi possível carregar a lista de lojistas.",
                variant: "destructive"
            });
        } finally {
            setLoadingInitial(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedMerchantId) {
            return toast({ title: "Atenção", description: "Selecione um lojista.", variant: "destructive" });
        }

        // Converte R$ 15,50 para centavos (1550)
        const numericAmount = parseFloat(amountStr.replace(',', '.'));
        if (isNaN(numericAmount) || numericAmount <= 0) {
            return toast({ title: "Atenção", description: "Informe um valor válido maior que zero.", variant: "destructive" });
        }
        const amountCents = Math.round(numericAmount * 100);

        if (!prefix || !complement) {
            return toast({ title: "Atenção", description: "Selecione o prefixo e o complemento para formar a descrição.", variant: "destructive" });
        }

        const finalDescription = `${prefix} — ${complement}`;

        const merchant = merchants.find(m => m.id === selectedMerchantId);
        if (!merchant || !merchant.account_id) {
            return toast({ title: "Atenção", description: "Lojista inválido ou sem conta financeira ativa.", variant: "destructive" });
        }

        setIsSubmitting(true);

        try {
            const { error } = await supabase
                .from('ledger_entries')
                .insert({
                    account_id: merchant.account_id,
                    source_type: 'admin_adjustment', // Diferencia de transações normais 'merchant'
                    entry_type: entryType,
                    amount_cents: amountCents,
                    batch_id: `manual_adj_${Date.now()}`,
                    description: finalDescription,
                    metadata: {
                        admin_adjustment: true,
                        admin_id: user?.id,
                        adjustment_type: entryType,
                        prefix: prefix,
                        complement: complement
                    }
                });

            if (error) throw error;

            toast({
                title: "Ajuste realizado com sucesso!",
                description: `O ${entryType === 'credit' ? 'crédito' : 'débito'} de R$ ${numericAmount.toFixed(2)} foi aplicado à carteira do lojista.`,
            });

            // Cleanup do form
            setAmountStr("");
            setPrefix("");
            setComplement("");

            // Atualiza histórico
            fetchData();

        } catch (e: any) {
            console.error("Erro ao aplicar ajuste:", e);
            toast({
                title: "Erro na operação",
                description: e.message || "Não foi possível aplicar o ajuste no banco de dados.",
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const formatCurrency = (cents: number) => {
        return (Math.abs(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    if (loadingInitial) {
        return (
            <div className="flex h-[300px] w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="grid gap-6 md:grid-cols-2">
            {/* Coluna 1: Formulário Novo Ajuste */}
            <Card className="border-primary/10 bg-black/40 shadow-xl backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Plus className="h-5 w-5 text-emerald-400" />
                        Lançamento Manual
                    </CardTitle>
                    <CardDescription>
                        Crie um crédito ou débito oficial na carteira de um lojista. O saldo será atualizado automaticamente pelo sistema de Ledger.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">

                        <div className="space-y-2">
                            <Label>Lojista Destino</Label>
                            <Select value={selectedMerchantId} onValueChange={setSelectedMerchantId} disabled={isSubmitting}>
                                <SelectTrigger className="w-full bg-black/50 border-primary/20">
                                    <SelectValue placeholder="Selecione um lojista..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    {merchants.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>
                                            {m.name} <span className="text-muted-foreground text-xs ml-2">({m.email})</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Tipo de Ajuste</Label>
                                <Select value={entryType} onValueChange={(val: any) => setEntryType(val)} disabled={isSubmitting}>
                                    <SelectTrigger className="w-full bg-black/50 border-primary/20">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="credit" className="text-emerald-400 font-medium">
                                            + Adicionar (Crédito)
                                        </SelectItem>
                                        <SelectItem value="debit" className="text-rose-400 font-medium">
                                            - Descontar (Débito)
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Valor (R$)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    value={amountStr}
                                    onChange={(e) => setAmountStr(e.target.value)}
                                    disabled={isSubmitting}
                                    className="bg-black/50 border-primary/20"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Prefixo da Descrição</Label>
                                <Select value={prefix} onValueChange={setPrefix} disabled={isSubmitting}>
                                    <SelectTrigger className="w-full bg-black/50 border-primary/20">
                                        <SelectValue placeholder="Selecione o prefixo..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Crédito administrativo">Crédito administrativo</SelectItem>
                                        <SelectItem value="Ajuste financeiro">Ajuste financeiro</SelectItem>
                                        <SelectItem value="Estorno administrativo">Estorno administrativo</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Complemento</Label>
                                <Select value={complement} onValueChange={setComplement} disabled={isSubmitting}>
                                    <SelectTrigger className="w-full bg-black/50 border-primary/20">
                                        <SelectValue placeholder="Selecione o complemento..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="saldo inicial">saldo inicial</SelectItem>
                                        <SelectItem value="recarga de saldo">recarga de saldo</SelectItem>
                                        <SelectItem value="correção">correção</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {prefix && complement && (
                            <div className="p-3 bg-black/30 border border-primary/10 rounded-md">
                                <p className="text-xs text-muted-foreground mb-1">Pré-visualização da descrição oficial:</p>
                                <p className="text-sm font-medium text-primary-foreground">{prefix} — {complement}</p>
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full mt-2"
                            disabled={isSubmitting}
                            variant={entryType === 'credit' ? 'default' : 'destructive'}
                        >
                            {isSubmitting ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...</>
                            ) : (
                                `Confirmar ${entryType === 'credit' ? 'Crédito' : 'Débito'} Manual`
                            )}
                        </Button>

                    </form>
                </CardContent>
            </Card>

            {/* Coluna 2: Histórico */}
            <Card className="border-primary/5 bg-background shadow-lg">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Clock className="h-5 w-5 text-primary/70" />
                        Últimos Ajustes Realizados
                    </CardTitle>
                    <CardDescription>
                        Histórico das últimas movimentações manuais feitas por administradores.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground bg-black/20 rounded-lg border border-primary/10">
                            <Search className="h-10 w-10 opacity-20 mb-2" />
                            <p>Nenhum ajuste manual encontrado no histórico.</p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2">
                            {history.map((item) => (
                                <div key={item.id} className="p-3 bg-black/30 border border-primary/10 rounded-lg flex items-start justify-between">
                                    <div className="space-y-1">
                                        <p className="font-medium text-sm text-primary-foreground">
                                            {item.financial_accounts?.profiles?.nome_loja || 'Lojista Desconhecido'}
                                        </p>
                                        <p className="text-xs text-muted-foreground line-clamp-2" title={item.description}>
                                            {item.description}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground/60 w-fit pt-1">
                                            {new Date(item.created_at).toLocaleString('pt-BR')}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end shrink-0 pl-3">
                                        <span className={`font-mono text-sm font-semibold ${item.entry_type === 'credit' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {item.entry_type === 'credit' ? '+' : '-'}{formatCurrency(item.amount_cents)}
                                        </span>
                                        <span className="text-[10px] uppercase font-bold tracking-wider opacity-50 mt-1">
                                            {item.entry_type}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

        </div>
    );
}
