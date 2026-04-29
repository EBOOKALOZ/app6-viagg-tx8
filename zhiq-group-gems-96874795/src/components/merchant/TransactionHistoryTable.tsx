import { Plus, Minus, Clock, RefreshCw, Wallet, Receipt, ShoppingBag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MerchantLedgerEntry } from "@/hooks/useMerchantWallet";

interface TransactionHistoryTableProps {
  transactions: MerchantLedgerEntry[];
  isLoading: boolean;
}

export function TransactionHistoryTable({ transactions, isLoading }: TransactionHistoryTableProps) {
  const formatCurrency = (cents: number) => {
    return Math.abs(cents / 100).toFixed(2).replace(".", ",");
  };

  const getTransactionTypeInfo = (tx: MerchantLedgerEntry) => {
    const isCredit = tx.entry_type === 'credit';

    // Provide a human readable label based on the reference type
    let label = "Transação";
    let icon = <Wallet className="h-3 w-3" />;

    switch (tx.reference_type) {
      case 'service_order':
        label = "Pedido";
        icon = <ShoppingBag className="h-3 w-3" />;
        break;
      case 'payout':
        label = "Saque";
        icon = <Minus className="h-3 w-3" />;
        break;
      case 'adjustment':
        label = "Ajuste";
        icon = <RefreshCw className="h-3 w-3" />;
        break;
      case 'refund':
        label = "Estorno";
        icon = <RefreshCw className="h-3 w-3" />;
        break;
      default:
        label = tx.reference_type || tx.description || "Movimentação";
        icon = isCredit ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />;
    }

    return {
      label,
      icon,
      isPositive: isCredit,
      badgeClass: isCredit
        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
        : 'bg-red-100 text-red-800 border-red-300'
    };
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-5 w-5 text-emerald-600" />
            Extrato de Movimentações (Lojista)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-5 w-5 text-emerald-600" />
            Extrato de Movimentações (Lojista)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-10">
            <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Receipt className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="font-medium text-foreground">
              Nenhuma movimentação para o lojista
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Os ganhos com seus pedidos aparecerão aqui.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-bl-[100px] pointer-events-none" />
        <CardTitle className="text-base flex items-center gap-2 relative z-10">
          <Receipt className="h-5 w-5 text-emerald-600" />
          Extrato de Movimentações (Lojista)
          <Badge variant="secondary" className="ml-auto bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200">
            {transactions.length} registro{transactions.length !== 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[140px]">Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="hidden sm:table-cell">Descrição</TableHead>
                <TableHead className="text-right w-[140px]">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => {
                const typeInfo = getTransactionTypeInfo(tx);

                return (
                  <TableRow key={tx.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span className="text-sm">{format(new Date(tx.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(tx.created_at), "HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={typeInfo.badgeClass}>
                        {typeInfo.icon}
                        <span className="ml-1.5">{typeInfo.label}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                      {tx.description || '-'}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      <span className={typeInfo.isPositive ? 'text-emerald-600' : 'text-foreground'}>
                        {typeInfo.isPositive ? '+' : '-'} R$ {formatCurrency(tx.amount_cents)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
