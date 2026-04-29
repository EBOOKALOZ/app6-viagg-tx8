import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminH3Expansion } from '@/hooks/useAdminH3Expansion';
import { Hexagon, Activity, Clock, Download } from 'lucide-react';

export function H3ExpansionStats() {
    const { stats, isLoading } = useAdminH3Expansion();

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-background/80 backdrop-blur-md border border-border/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <Activity className="w-16 h-16" />
                </div>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center justify-between text-green-500">
                        Células H3 Ativas
                        <Hexagon className="h-4 w-4" />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-3xl font-bold">{isLoading ? '...' : stats.ativas}</div>
                    <p className="text-xs text-muted-foreground mt-1">Cobertura em operação</p>
                </CardContent>
            </Card>

            <Card className="bg-background/80 backdrop-blur-md border border-border/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <Clock className="w-16 h-16" />
                </div>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center justify-between text-yellow-500">
                        Células em Espera
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
                    <p className="text-xs text-muted-foreground mt-1">Demandam captação</p>
                </CardContent>
            </Card>

            <Card className="bg-background/80 backdrop-blur-md border border-border/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-20 text-primary pointer-events-none">
                    <Hexagon className="w-16 h-16" />
                </div>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center justify-between" style={{ color: "hsl(var(--admin-primary))" }}>
                        Total de Entregas
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex justify-between items-end">
                        <div className="text-3xl font-bold">{isLoading ? '...' : stats.totalEntregas.toLocaleString('pt-BR')}</div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
