import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MapPin, AlertCircle, MousePointerClick, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DestinationSectionProps {
  destinationAddress: string;
  onAddressChange: (v: string) => void;
  hasValidCoordinates: boolean;
  isMapSelectMode?: boolean;
  onToggleMapSelect?: () => void;
  reverseGeocodedAddress?: string | null;
  isReverseGeocoding?: boolean;
}

export function DestinationSection({
  destinationAddress,
  onAddressChange,
  hasValidCoordinates,
  isMapSelectMode,
  onToggleMapSelect,
  reverseGeocodedAddress,
  isReverseGeocoding,
}: DestinationSectionProps) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <Label className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MapPin className="h-4 w-4 text-primary" />
          Destino da entrega
        </Label>
        <Input
          placeholder="Cole as coordenadas (lat, lng) ou link do Google Maps"
          value={destinationAddress}
          onChange={(e) => onAddressChange(e.target.value)}
        />

        {/* Botão Selecionar no Mapa */}
        {onToggleMapSelect && (
          <Button
            type="button"
            variant={isMapSelectMode ? "default" : "outline"}
            size="sm"
            className={cn(
              "w-full gap-2 transition-all duration-300 shadow-sm",
              isMapSelectMode 
                ? "bg-green-600 hover:bg-green-700 text-white border-green-700 ring-2 ring-green-500/50 scale-[1.02]" 
                : "border-green-500/50 text-green-600 hover:bg-green-50 hover:text-green-700 hover:border-green-500 shadow-green-100/50"
            )}
            onClick={onToggleMapSelect}
          >
            {isMapSelectMode ? (
              <>
                <MousePointerClick className="h-4 w-4 animate-pulse" />
                Clique no mapa para definir o destino
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4" />
                📍 SELECIONAR NO MAPA
              </>
            )}
          </Button>
        )}

        {/* Reverse geocoding result */}
        {isReverseGeocoding && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
            <span>Detectando endereço…</span>
          </div>
        )}

        {reverseGeocodedAddress && !isReverseGeocoding && (
          <div className="flex items-center justify-between gap-2 text-xs bg-primary/10 text-primary rounded-md p-2">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{reverseGeocodedAddress}</span>
            </div>
            {onToggleMapSelect && (
              <button
                type="button"
                onClick={onToggleMapSelect}
                className="shrink-0 text-primary hover:text-primary/80 transition-colors"
                title="Alterar localização"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {!hasValidCoordinates && !isMapSelectMode && !reverseGeocodedAddress && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Informe o destino ou selecione no mapa.
            </span>
          </div>
        )}

        {hasValidCoordinates && !reverseGeocodedAddress && !isReverseGeocoding && (
          <div className="flex items-center gap-2 text-xs text-primary">
            <MapPin className="h-3 w-3" />
            <span>Coordenadas detectadas</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
