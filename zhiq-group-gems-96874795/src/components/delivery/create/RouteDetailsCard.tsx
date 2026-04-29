import { Card, CardContent } from "@/components/ui/card";
import { Navigation, Loader2 } from "lucide-react";
import { formatDistance, formatEstimatedTime } from "@/lib/deliveryPricing";

interface RouteInfo {
  distanceKm: number;
  durationMin: number;
  valorTotal: number;
}

const formatBRL = (v: number | null | undefined) =>
  typeof v === "number" ? `R$ ${v.toFixed(2).replace(".", ",")}` : "—";

interface RouteDetailsCardProps {
  routeInfo: RouteInfo | null;
  isCalculating: boolean;
  hasValidCoordinates: boolean;
}

export function RouteDetailsCard({ routeInfo, isCalculating, hasValidCoordinates }: RouteDetailsCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Navigation className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Detalhes da rota</span>
        </div>

        {isCalculating ? (
          <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Calculando rota…</span>
          </div>
        ) : routeInfo ? (
          <div className="text-center space-y-1">
            <p className="text-sm text-muted-foreground text-center">
              Tempo estimado: {formatEstimatedTime(routeInfo.durationMin)}
            </p>
            <p className="text-lg font-bold text-primary">{formatBRL(routeInfo.valorTotal)}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">
            {hasValidCoordinates ? "Aguardando cálculo da rota…" : "Informe o destino para calcular a rota"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
