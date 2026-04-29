import { Card, CardContent } from "@/components/ui/card";
import { Wallet } from "lucide-react";

const formatBRL = (v: number | null | undefined) =>
  typeof v === "number" ? `R$ ${v.toFixed(2).replace(".", ",")}` : "—";

interface FinancialSummaryCardProps {
  saldoDisplay: number | null;
  valorFinal: number | null;
  saldoApos: number | null;
  isLoadingBalance: boolean;
}

export function FinancialSummaryCard({
  saldoDisplay,
  valorFinal,
  saldoApos,
  isLoadingBalance,
  distanceKm,
}: FinancialSummaryCardProps & { distanceKm?: number | null }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 mb-2 pb-1 border-b border-border">
          <Wallet className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Resumo financeiro</span>
        </div>

        {distanceKm !== undefined && distanceKm !== null && (
          <div className="flex justify-between text-sm mb-1 text-slate-700 font-medium">
            <span className="flex items-center gap-1.5 opacity-90">
              <span className="text-muted-foreground">📍</span> Distância da entrega
            </span>
            <span>
              {distanceKm.toFixed(1).replace('.', ',')} km
            </span>
          </div>
        )}

        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Saldo atual</span>
          <span className="text-green-600 font-semibold">
            {isLoadingBalance ? "Carregando…" : saldoDisplay !== null ? formatBRL(saldoDisplay) : "—"}
          </span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Custo da entrega</span>
          <span className="text-red-600 font-semibold">
            {valorFinal !== null ? `- ${formatBRL(valorFinal)}` : "—"}
          </span>
        </div>

        <div className="border-t border-border pt-2 flex justify-between text-sm font-bold">
          <span className="text-foreground">Saldo após</span>
          <span className={saldoApos !== null && saldoApos < 0 ? "text-red-700" : "text-green-700"}>
            {saldoApos !== null ? formatBRL(saldoApos) : "—"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
