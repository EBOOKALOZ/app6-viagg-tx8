import { ArrowLeft, AlertCircle, Info, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useMerchantWallet } from "@/hooks/useMerchantWallet";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AddBalanceCard } from "@/components/merchant/AddBalanceCard";
import { WalletSummaryCard } from "@/components/merchant/WalletSummaryCard";
import { TransactionHistoryTable } from "@/components/merchant/TransactionHistoryTable";

const MerchantBilling = () => {
  const navigate = useNavigate();
  const { overview, isLoading, isError, error, loadWallet } = useMerchantWallet();

  const balanceCents = overview?.balanceCents || 0;
  const transactions = Array.isArray(overview?.transactions) ? overview.transactions : [];

  return (
    <div className="p-4 space-y-5 lg:space-y-6 lg:py-8 lg:px-10 xl:px-16 w-full max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-foreground">Carteira</h1>
          <p className="text-sm text-muted-foreground">Gerencie seu saldo e veja o extrato unificado</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => loadWallet()} disabled={isLoading} className="shrink-0">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="space-y-6">
        {/* Supabase Error Display */}
        {isError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="break-all text-xs">
              <strong>Erro ao carregar carteira:</strong> {error?.message || "Falha na conexão"}
            </AlertDescription>
          </Alert>
        )}

        {/* Balance Summary Card */}
        <WalletSummaryCard balanceCents={balanceCents} isLoading={isLoading} />

        {/* Warning if low balance */}
        {!isLoading && balanceCents <= 0 && (
          <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-800">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <AlertDescription className="ml-2 font-medium">
              <strong>Saldo zerado!</strong> Adicione saldo para não interromper os despachos.
            </AlertDescription>
          </Alert>
        )}

        {/* Add Balance Section */}
        <AddBalanceCard />

        {/* Info Alert */}
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
          <Info className="h-4 w-4 text-emerald-600" />
          <AlertDescription className="text-sm font-medium ml-2">
            O saldo é unificado e exclusivo para as operações da sua loja.
          </AlertDescription>
        </Alert>

        {/* Transaction History Table */}
        <TransactionHistoryTable
          transactions={transactions}
          isLoading={isLoading}
        />

        {/* Footer Info */}
        <p className="text-xs text-muted-foreground text-center px-4 pt-4">
          Criptografia ponta a ponta garantida pela plataforma.
        </p>
      </div>
    </div>
  );
};

export default MerchantBilling;
