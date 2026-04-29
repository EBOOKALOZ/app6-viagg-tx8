import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, TrendingUp, TrendingDown, ArrowLeftRight, Calendar, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Transaction = {
    merchant_user_id: string;
    created_at: string;
    source_type: string;
    description_safe: string;
    direction: string;
    amount_cents: number;
    is_sandbox: boolean;
};

interface MerchantFinancialHistoryProps {
    merchantId: string;
    merchantName: string;
}

export const MerchantFinancialHistory = ({ merchantId, merchantName }: MerchantFinancialHistoryProps) => {
    const [filterType, setFilterType] = useState<string>("all");

    const { data: history, isLoading, error } = useQuery({
        queryKey: ["merchant-financial-history", merchantId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("v_admin_merchant_financial_history_enriched")
                .select("*")
                .eq("merchant_user_id", merchantId)
                .order("created_at", { ascending: false });

            if (error) {
                console.error("Erro ao carregar histórico financeiro:", error);
                throw error;
            }
            return data as Transaction[];
        },
    });

    const getSourceIcon = (sourceType: string) => {
        switch (sourceType) {
            case "admin_adjustment":
                return <ArrowLeftRight className="h-4 w-4 text-blue-500" />;
            case "merchant_recharge":
                return <TrendingUp className="h-4 w-4 text-emerald-500" />;
            case "repasse":
                return <TrendingUp className="h-4 w-4 text-amber-500" />;
            default:
                return <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />;
        }
    };

    const getSourceLabel = (sourceType: string) => {
        switch (sourceType) {
            case "admin_adjustment":
                return "Ajuste Admin";
            case "merchant_recharge":
                return "Recarga";
            case "repasse":
                return "Repasse";
            case "delivery_fee":
                return "Taxa de Entrega";
            case "order_payment":
                return "Pagamento de Pedido";
            default:
                return sourceType || "Desconhecido";
        }
    };

    const getFallbackDescription = (tx: Transaction) => {
        if (tx.source_type === "admin_adjustment") {
            return tx.direction === "credit" ? "Crédito administrativo — Referência legada" : "Ajuste financeiro (débito) — Referência legada";
        }
        if (tx.source_type === "merchant_recharge") {
            return "Recarga de saldo — Referência legada";
        }
        if (tx.source_type === "repasse") {
            return "Repasse financeiro — Referência legada";
        }
        if (tx.source_type === "order_payment" || tx.source_type === "delivery_fee") {
            return "Processamento de pedido — Referência legada";
        }
        return "Movimentação financeira — Referência legada";
    };

    const filteredHistory = history?.filter((tx) => {
        if (filterType === "all") return true;
        if (filterType === "credit") return tx.direction === "credit";
        if (filterType === "debit") return tx.direction === "debit";
        if (filterType === "sandbox") return tx.is_sandbox === true;
        if (filterType === "product") return tx.is_sandbox === false;
        return true;
    });

    return (
        <Card className="mt-6 border-muted bg-white/50 backdrop-blur-sm shadow-md">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Histórico Financeiro - {merchantName}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                        Movimentações oficiais na base contábil (Ledger)
                    </p>
                </div>
                <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filtrar por tipo" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todas as Movimentações</SelectItem>
                        <SelectItem value="credit">Entradas</SelectItem>
                        <SelectItem value="debit">Saídas</SelectItem>
                        <SelectItem value="sandbox">Sandbox (Testes)</SelectItem>
                        <SelectItem value="product">Produção Oficial</SelectItem>
                    </SelectContent>
                </Select>
            </CardHeader>
            <CardContent>
                {error && (
                    <Alert variant="destructive" className="mb-6">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Erro ao carregar histórico financeiro</AlertTitle>
                        <AlertDescription>
                            {error instanceof Error ? error.message : "Ocorreu um erro desconhecido ao buscar o histórico."}
                        </AlertDescription>
                    </Alert>
                )}
                {isLoading ? (
                    <div className="flex justify-center items-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : filteredHistory && filteredHistory.length > 0 ? (
                    <div className="rounded-md border bg-white">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead>Data/Hora</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Origem</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead className="text-right text-emerald-600">Entrada (R$)</TableHead>
                                    <TableHead className="text-right text-rose-600">Saída (R$)</TableHead>
                                    <TableHead className="text-center">Sandbox</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredHistory.map((tx, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell className="whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-sm">
                                                    {format(new Date(tx.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={tx.direction === 'credit' ? 'outline' : 'secondary'} className={`flex items-center gap-1 w-fit ${tx.direction === 'credit' ? 'text-emerald-600 border-emerald-200 bg-emerald-50' : 'text-rose-600 border-rose-200 bg-rose-50'}`}>
                                                {tx.direction === 'credit' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                                {tx.direction === 'credit' ? 'Crédito' : 'Débito'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="flex items-center gap-1 w-fit">
                                                {getSourceIcon(tx.source_type)}
                                                {getSourceLabel(tx.source_type)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="max-w-[200px] truncate" title={tx.description_safe || getFallbackDescription(tx)}>
                                            {tx.description_safe || <span className="text-muted-foreground italic">{getFallbackDescription(tx)}</span>}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-medium text-emerald-600">
                                            {tx.direction === "credit" ? `+ ${(tx.amount_cents / 100).toFixed(2)}` : "-"}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-medium text-rose-600">
                                            {tx.direction === "debit" ? `- ${(tx.amount_cents / 100).toFixed(2)}` : "-"}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {tx.is_sandbox ? (
                                                <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">Sandbox</Badge>
                                            ) : (
                                                <Badge variant="outline" className="bg-slate-50 text-slate-500">Prod</Badge>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="text-center py-12 text-muted-foreground">
                        <Calendar className="h-12 w-12 mx-auto opacity-20 mb-4" />
                        <p>Nenhuma movimentação financeira encontrada para este lojista.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
