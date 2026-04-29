import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart3, Clock, CheckCircle, Ticket } from "lucide-react";

export default function AdminSupportStatsPage() {
    return (
        <div className="space-y-6 max-w-[1400px] mx-auto animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <BarChart3 className="h-6 w-6 text-primary" />
                    Estatísticas de Suporte
                </h1>
                <p className="text-muted-foreground">Métricas de atendimento ao cliente.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tickets Abertos</CardTitle>
                        <Ticket className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">--</div>
                        <p className="text-xs text-muted-foreground">Aguardando atendimento</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Resolvidos Hoje</CardTitle>
                        <CheckCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">--</div>
                        <p className="text-xs text-muted-foreground">Em {new Date().toLocaleDateString('pt-BR')}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tempo Médio</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">-- min</div>
                        <p className="text-xs text-muted-foreground">SLA de primeira resposta</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Visão Geral (Em breve)</CardTitle>
                    <CardDescription>Gráficos complexos entrarão aqui.</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px] flex items-center justify-center bg-muted/20 border border-dashed rounded-md">
                    <p className="text-muted-foreground text-sm">Dashboard Analytics Component</p>
                </CardContent>
            </Card>
        </div>
    );
}
