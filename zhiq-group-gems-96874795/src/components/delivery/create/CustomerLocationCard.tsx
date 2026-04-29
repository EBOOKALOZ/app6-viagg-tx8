import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Truck } from "lucide-react";

interface CustomerLocationCardProps {
    destCoords: { lat: number; lng: number } | null;
    distanceKm?: number;
}

export function CustomerLocationCard({ destCoords, distanceKm }: CustomerLocationCardProps) {
    if (!destCoords) return null;

    return (
        <Card className="overflow-hidden rounded-xl shadow-sm border-0" style={{ backgroundColor: "#FFF3E6" }}>
            <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                    <div className="bg-primary/10 p-1.5 rounded-full">
                        <MapPin className="h-4 w-4 text-primary" />
                    </div>
                    <h3 className="font-bold text-base text-foreground">Cliente</h3>
                </div>

                <div className="space-y-3">
                    <div>
                        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Local selecionado</div>
                        <div className="text-sm font-semibold text-foreground mb-1">Coordenadas:</div>
                        <div className="text-[11px] font-mono text-muted-foreground bg-muted/30 p-2 rounded-lg border border-border flex flex-col gap-0.5">
                            <span>Lat: {destCoords.lat.toFixed(6)}</span>
                            <span>Lng: {destCoords.lng.toFixed(6)}</span>
                        </div>
                    </div>


                </div>
            </CardContent>
        </Card>
    );
}
