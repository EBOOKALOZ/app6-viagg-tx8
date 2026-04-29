import { MotoboyDeliveryRecord } from '@/hooks/useMotoboyDeliveryHistory';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, ArrowRight, Activity, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

interface MotoboyHistoryCardProps {
    delivery: MotoboyDeliveryRecord;
}

export function MotoboyHistoryCard({ delivery }: MotoboyHistoryCardProps) {
    // Extract a shorter version of the address strings (assuming it might be a full address, grab the first part or neighborhood if possible)
    const formatAddress = (addr: string) => {
        if (!addr) return 'Local Fixo';
        const parts = addr.split(',');
        return parts[0].trim(); // Just take the first part to keep the layout clean
    };

    const statusMap: Record<string, { label: string, color: string }> = {
        'delivered': { label: 'Entregue', color: 'bg-green-500/10 text-green-500 border-green-500/20' },
        'cancelled': { label: 'Cancelado', color: 'bg-red-500/10 text-red-500 border-red-500/20' },
        'in_progress': { label: 'Em andamento', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' }
    };

    // Fallback status color
    const uiStatus = statusMap[delivery.status] || { label: delivery.status, color: 'bg-slate-500/10 text-slate-500 border-slate-500/20' };

    return (
        <Card className="bg-white/5 border-white/5 shadow-sm overflow-hidden mb-3">
            <CardContent className="p-4 flex flex-col gap-3">
                {/* Header: Status and Date */}
                <div className="flex justify-between items-start w-full">
                    <Badge variant="outline" className={`font-semibold border ${uiStatus.color}`}>
                        {uiStatus.label}
                    </Badge>
                    <div className="flex items-center text-muted-foreground text-xs gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {delivery.created_at ? format(new Date(delivery.created_at), "dd/MM 'às' HH:mm") : 'Data não disp.'}
                    </div>
                </div>

                {/* Body: Addresses */}
                <div className="flex items-center gap-2 mt-1 px-1">
                    <MapPin className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-sm font-medium truncate flex-1">{formatAddress(delivery.pickup_address)}</span>

                    <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />

                    <MapPin className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    <span className="text-sm font-medium truncate flex-1">{formatAddress(delivery.drop_address)}</span>
                </div>

                {/* Footer: Price and Distance */}
                <div className="flex justify-between items-center pt-2 mt-1 border-t border-white/10">
                    <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">Valor:</span>
                        <span className="text-base font-bold text-primary">
                            R$ {(delivery.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>

                    <div className="flex flex-col items-end">
                        <span className="text-xs text-muted-foreground">Distância:</span>
                        <div className="flex items-center gap-1 text-sm font-semibold">
                            <Activity className="h-3 w-3 text-emerald-500" />
                            {delivery.distance_km ? `${Number(delivery.distance_km).toFixed(1)} km` : '- km'}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
