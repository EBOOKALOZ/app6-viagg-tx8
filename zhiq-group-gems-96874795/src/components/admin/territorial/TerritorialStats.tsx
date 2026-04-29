import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminTerritorialExpansion } from '@/hooks/useAdminTerritorialExpansion';
import { Activity, Clock, Download, MapPin } from 'lucide-react';

export function TerritorialStats() {
    const { stats, isLoading } = useAdminTerritorialExpansion();

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-background/80 backdrop-blur-md border border-border/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <MapPin className="w-16 h-16" />
                </div>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center justify-between text-green-500">
                        Cidades Ativas
                        <Activity className="h-4 w-4" />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-3xl font-bold">{isLoading ? '...' : stats.ativas}</div>
                    <p className="text-xs text-muted-foreground mt-1">Operando hoje</p>
                </CardContent>
            </Card>

            <Card className="bg-background/80 backdrop-blur-md border border-border/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <Clock className="w-16 h-16" />
                </div>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center justify-between text-yellow-500">
                        Cidades em Espera
                        <Clock className="h-4 w-4" />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-3xl font-bold">{isLoading ? '...' : stats.emEspera}</div>
                    <p className="text-xs text-muted-foreground mt-1">Aguardando liberação</p>
                </CardContent>
            </Card>

            <Card className="bg-background/80 backdrop-blur-md border border-border/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <Download className="w-16 h-16" />
                </div>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center justify-between text-blue-500">
                        Fase de Download
                        <Download className="h-4 w-4" />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-3xl font-bold">{isLoading ? '...' : stats.downloadsStatus}</div>
                    <p className="text-xs text-muted-foreground mt-1">Baixa atratividade momentânea</p>
                </CardContent>
            </Card>

            <Card className="bg-background/80 backdrop-blur-md border border-border/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-20 text-primary pointer-events-none">
                    <Download className="w-16 h-16" />
                </div>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center justify-between" style={{ color: "hsl(var(--admin-primary))" }}>
                        Total Cidades SC
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex justify-between items-end">
                        <div className="text-3xl font-bold">{isLoading ? '...' : stats.ativas + stats.emEspera + stats.downloadsStatus} / 295</div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
