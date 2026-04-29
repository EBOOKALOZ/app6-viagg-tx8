import { Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface WalletSummaryCardProps {
  balanceCents: number;
  isLoading: boolean;
}

export function WalletSummaryCard({ balanceCents, isLoading }: WalletSummaryCardProps) {
  const formatCurrency = (cents: number) => {
    return (cents / 100).toFixed(2).replace(".", ",");
  };

  return (
    <Card className="bg-gradient-to-br from-emerald-600 to-green-800 text-white border-0 shadow-xl overflow-hidden relative">
      <div className="absolute -right-8 -top-8 opacity-10 pointer-events-none">
        <Wallet className="w-40 h-40" />
      </div>

      <CardContent className="p-6 relative z-10">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="flex items-center gap-2 mb-2 bg-black/20 px-3 py-1 rounded-full backdrop-blur-sm">
            <Wallet className="h-4 w-4" />
            <span className="text-xs font-semibold tracking-wider uppercase">Saldo Disponível</span>
          </div>

          {isLoading ? (
            <Skeleton className="h-12 w-48 bg-white/20 mt-2" />
          ) : (
            <p className="text-5xl font-black mt-2 tracking-tight tabular-nums drop-shadow-md">
              R$ {formatCurrency(balanceCents)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
