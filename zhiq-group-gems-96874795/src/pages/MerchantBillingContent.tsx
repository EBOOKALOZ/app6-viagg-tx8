import { AlertCircle, Info } from "lucide-react";
import { useMerchantWallet } from "@/hooks/useMerchantWallet";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AddBalanceCard } from "@/components/merchant/AddBalanceCard";
import { WalletSummaryCard } from "@/components/merchant/WalletSummaryCard";
import { TransactionHistoryTable } from "@/components/merchant/TransactionHistoryTable";
import { MerchantRecentEvents } from "@/components/merchant/MerchantRecentEvents";

/**
 * Conteúdo da carteira do comerciante
 * Usado dentro do MerchantLayout via Outlet
 */
export default function MerchantBillingContent() {
  const { balance, transactions, isLoading } = useMerchantWallet();

  return (
    <div className="p-4 space-y-6 lg:px-10 xl:px-16 lg:py-8">
      <MerchantRecentEvents module="wallet" />
      {/* Desktop: side-by-side wallet + add balance */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-8 space-y-6 lg:space-y-0">
        {/* Left column */}
        <div className="space-y-6">
          <WalletSummaryCard balance={balance} isLoading={isLoading} />

          {balance.saldo_disponivel <= 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Saldo insuficiente!</strong> Adicione saldo para solicitar entregas.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <AddBalanceCard />
          <Alert className="border-merchant/20 bg-merchant-light">
            <Info className="h-4 w-4 text-merchant" />
            <AlertDescription className="text-sm text-muted-foreground">
              Após o pagamento, o saldo será creditado automaticamente em sua carteira.
            </AlertDescription>
          </Alert>
        </div>
      </div>

      {/* Transaction History — full width */}
      <TransactionHistoryTable 
        transactions={transactions} 
        isLoading={isLoading} 
      />

      <p className="text-xs text-muted-foreground text-center px-4">
        Para dúvidas sobre seu saldo, entre em contato com o suporte.
      </p>
    </div>
  );
}
