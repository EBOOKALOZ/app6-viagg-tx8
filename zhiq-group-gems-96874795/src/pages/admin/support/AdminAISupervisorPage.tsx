import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    AlertTriangle, ShieldAlert, Bug, Activity,
    CheckCircle2, RefreshCw, Eye, Search, Filter
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type AIAlert = {
    id: string;
    alert_type: string;
    severity: string;
    entity_type: string | null;
    entity_id: string | null;
    related_user_id: string | null;
    title: string;
    description: string;
    status: string;
    created_at: string;
};

export default function AdminAISupervisorPage() {
    const queryClient = useQueryClient();
    const [isDiagnosing, setIsDiagnosing] = useState(false);
    const [filter, setFilter] = useState('all'); // all, critical, fraud, bugs

    // Fetch Alerts
    const { data: alerts = [], isLoading } = useQuery({
        queryKey: ['ai-supervisor-alerts'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('ai_supervisor_alerts')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data as AIAlert[];
        }
    });

    // Setup Realtime
    useEffect(() => {
        const channel = supabase
            .channel('ai-supervisor-updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'ai_supervisor_alerts' },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['ai-supervisor-alerts'] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient]);

    // Manual Diagnostic Trigger
    const runDiagnostics = async () => {
        setIsDiagnosing(true);
        try {
            const { data, error } = await supabase.functions.invoke('ai-supervisor', {
                body: { action: 'scan' }
            });

            if (error) throw error;

            toast.success(`Scan concluído: ${data.new_alerts} novos alertas encontrados.`);
            queryClient.invalidateQueries({ queryKey: ['ai-supervisor-alerts'] });
        } catch (error: any) {
            toast.error(`Falha no scan automático: ${error.message}`);
        } finally {
            setIsDiagnosing(false);
        }
    };

    const updateAlertStatus = async (id: string, newStatus: string) => {
        try {
            const { error } = await supabase
                .from('ai_supervisor_alerts')
                .update({
                    status: newStatus,
                    resolved_at: newStatus === 'resolved' ? new Date().toISOString() : null
                })
                .eq('id', id);

            if (error) throw error;
            toast.success("Status atualizado com sucesso!");
            queryClient.invalidateQueries({ queryKey: ['ai-supervisor-alerts'] });
        } catch (error: any) {
            toast.error(`Erro ao atualizar: ${error.message}`);
        }
    };

    // Stats
    const openAlerts = alerts.filter(a => a.status === 'open');
    const criticals = openAlerts.filter(a => a.severity === 'critical' || a.severity === 'high');
    const frauds = openAlerts.filter(a => a.alert_type.includes('fraude'));
    const bugs = openAlerts.filter(a => a.alert_type.includes('bug'));

    // Filtering
    const filteredAlerts = alerts.filter(a => {
        if (filter === 'critical') return a.severity === 'critical' || a.severity === 'high';
        if (filter === 'fraud') return a.alert_type.includes('fraude');
        if (filter === 'bugs') return a.alert_type.includes('bug');
        return true;
    });

    const getSeverityBadge = (severity: string) => {
        switch (severity) {
            case 'critical': return <Badge className="bg-red-600 hover:bg-red-700">Crítico</Badge>;
            case 'high': return <Badge className="bg-orange-500 hover:bg-orange-600">Alto</Badge>;
            case 'medium': return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-black">Médio</Badge>;
            default: return <Badge className="bg-blue-500 hover:bg-blue-600">Baixo</Badge>;
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'open': return <Badge variant="outline" className="border-red-500 text-red-500">Aberto</Badge>;
            case 'resolved': return <Badge variant="outline" className="border-green-500 text-green-500">Resolvido</Badge>;
            case 'false_positive': return <Badge variant="outline" className="border-gray-500 text-gray-500">Falso Positivo</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    const getIcon = (type: string) => {
        if (type.includes('fraude')) return <ShieldAlert className="w-5 h-5 text-red-500" />;
        if (type.includes('bug')) return <Bug className="w-5 h-5 text-yellow-500" />;
        return <AlertTriangle className="w-5 h-5 text-orange-500" />;
    }

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Activity className="w-8 h-8 text-primary" />
                        Supervisor de IA
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Monitoramento em tempo real de divergências financeiras e operacionais
                    </p>
                </div>
                <Button onClick={runDiagnostics} disabled={isDiagnosing} className="gap-2">
                    <RefreshCw className={`w-4 h-4 ${isDiagnosing ? 'animate-spin' : ''}`} />
                    Forçar Varredura Agora
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-blue-500">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Alertas Abertos</CardTitle>
                        <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{openAlerts.length}</div>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-red-500">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Críticos / Altos</CardTitle>
                        <Activity className="w-4 h-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{criticals.length}</div>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-orange-500">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Suspeitas de Fraude</CardTitle>
                        <ShieldAlert className="w-4 h-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{frauds.length}</div>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-yellow-500">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Bugs Operacionais</CardTitle>
                        <Bug className="w-4 h-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{bugs.length}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <CardTitle>Histórico de Anomalias</CardTitle>
                        <div className="flex gap-2 text-sm">
                            <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>Todos</Button>
                            <Button variant={filter === 'critical' ? 'destructive' : 'outline'} size="sm" onClick={() => setFilter('critical')}>Críticos</Button>
                            <Button variant={filter === 'fraud' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('fraud')}>Fraude</Button>
                            <Button variant={filter === 'bugs' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('bugs')}>Bugs</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-8"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                    ) : filteredAlerts.length === 0 ? (
                        <div className="text-center p-8 text-muted-foreground">Nenhuma anomalia corresponde aos filtros. A plataforma está segura!</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted/50 text-muted-foreground">
                                    <tr>
                                        <th className="p-3 font-medium">Data</th>
                                        <th className="p-3 font-medium">Severidade</th>
                                        <th className="p-3 font-medium">Tipo / Resumo</th>
                                        <th className="p-3 font-medium">ID da Entidade</th>
                                        <th className="p-3 font-medium">Status</th>
                                        <th className="p-3 font-medium">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAlerts.map(alert => (
                                        <tr key={alert.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                                            <td className="p-3 whitespace-nowrap">
                                                {format(new Date(alert.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                                            </td>
                                            <td className="p-3">
                                                {getSeverityBadge(alert.severity)}
                                            </td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-2">
                                                    {getIcon(alert.alert_type)}
                                                    <div>
                                                        <div className="font-semibold">{alert.title}</div>
                                                        <div className="text-xs text-muted-foreground line-clamp-1">{alert.description}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <code className="text-xs bg-muted p-1 rounded font-mono break-all">{alert.entity_id || 'N/A'}</code>
                                            </td>
                                            <td className="p-3">
                                                {getStatusBadge(alert.status)}
                                            </td>
                                            <td className="p-3">
                                                {alert.status === 'open' && (
                                                    <div className="flex gap-2">
                                                        <Button variant="outline" size="sm" onClick={() => updateAlertStatus(alert.id, 'resolved')}>
                                                            <CheckCircle2 className="w-4 h-4 mr-1 text-green-500" /> Baixa
                                                        </Button>
                                                        <Button variant="ghost" size="sm" onClick={() => updateAlertStatus(alert.id, 'false_positive')}>
                                                            Falso Positivo
                                                        </Button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
