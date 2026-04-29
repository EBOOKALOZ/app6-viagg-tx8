import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Activity, Play, AlertTriangle, CheckCircle2 } from 'lucide-react';

type ServiceStatus = 'checking' | 'online' | 'offline' | 'slow';

interface DiagnosticState {
    aiFunction: ServiceStatus;
    database: ServiceStatus;
    realtime: ServiceStatus;
    storage: ServiceStatus;
    aiApi: ServiceStatus;
    lastError: string | null;
}

export default function AdminSystemSupervisor() {
    const [diagnostic, setDiagnostic] = useState<DiagnosticState>({
        aiFunction: 'checking',
        database: 'checking',
        realtime: 'checking',
        storage: 'checking',
        aiApi: 'checking',
        lastError: null
    });
    const [isRunning, setIsRunning] = useState(false);
    const [lastChecked, setLastChecked] = useState<Date | null>(null);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'URL Não Configurada';

    const runDiagnostics = async () => {
        setIsRunning(true);
        setDiagnostic(prev => ({
            ...prev,
            aiFunction: 'checking',
            database: 'checking',
            realtime: 'checking',
            storage: 'checking',
            aiApi: 'checking',
            lastError: null
        }));

        try {
            // 1. & 5. Verify AI Edge Function & AI API
            try {
                const startTime = Date.now();
                const { data, error } = await supabase.functions.invoke("support-ai", {
                    body: { healthcheck: true }
                });

                const latency = Date.now() - startTime;

                if (error) {
                    setDiagnostic(prev => ({ ...prev, aiFunction: 'offline', aiApi: 'offline', lastError: error.message }));
                } else if (data && data.status === 'online') {
                    // Consider slow if it takes more than 3 seconds
                    const statusVal = latency > 3000 ? 'slow' : 'online';
                    setDiagnostic(prev => ({ ...prev, aiFunction: statusVal, aiApi: statusVal }));
                } else {
                    setDiagnostic(prev => ({ ...prev, aiFunction: 'offline', aiApi: 'offline', lastError: 'Resposta inesperada da IA' }));
                }
            } catch (err: any) {
                setDiagnostic(prev => ({ ...prev, aiFunction: 'offline', aiApi: 'offline', lastError: err.message || "Falha ao conectar com Edge Function" }));
            }

            // 2. Verify Database
            try {
                const startTime = Date.now();
                const { data, error } = await supabase
                    .from("support_tickets")
                    .select("id")
                    .limit(1);

                const latency = Date.now() - startTime;

                if (error) {
                    setDiagnostic(prev => ({ ...prev, database: 'offline', lastError: error.message }));
                } else {
                    setDiagnostic(prev => ({ ...prev, database: latency > 1500 ? 'slow' : 'online' }));
                }
            } catch (err: any) {
                setDiagnostic(prev => ({ ...prev, database: 'offline', lastError: 'Falha letal no banco de dados' }));
            }

            // 3. Verify Realtime
            try {
                // To safely check realtime status without subscribing to a specific table, 
                // we'll attempt a dummy connection state check.
                const channel = supabase.channel('supervisor_dummy_check');
                channel.subscribe();

                // Realtime is generally online if we didn't crash trying to connect.
                setDiagnostic(prev => ({ ...prev, realtime: 'online' }));

                // Cleanup
                setTimeout(() => supabase.removeChannel(channel), 1000);
            } catch (err) {
                setDiagnostic(prev => ({ ...prev, realtime: 'offline', lastError: 'Websocket connection failed' }));
            }

            // 4. Verify Storage
            try {
                const startTime = Date.now();
                const { data, error } = await supabase.storage.from("support-files").list(undefined, { limit: 1 });
                const latency = Date.now() - startTime;

                if (error) {
                    setDiagnostic(prev => ({ ...prev, storage: 'offline', lastError: error.message }));
                } else {
                    setDiagnostic(prev => ({ ...prev, storage: latency > 2000 ? 'slow' : 'online' }));
                }
            } catch (err: any) {
                setDiagnostic(prev => ({ ...prev, storage: 'offline', lastError: 'Bucket inacessível' }));
            }

        } finally {
            setIsRunning(false);
            setLastChecked(new Date());
        }
    };

    // Auto-run on mount and every 60s
    useEffect(() => {
        runDiagnostics();
        const interval = setInterval(runDiagnostics, 60000);
        return () => clearInterval(interval);
    }, []);

    const StatusIcon = ({ status }: { status: ServiceStatus }) => {
        switch (status) {
            case 'checking': return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
            case 'online': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case 'slow': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
            case 'offline': return <AlertTriangle className="h-4 w-4 text-red-500" />;
        }
    };

    const getStatusText = (status: ServiceStatus) => {
        switch (status) {
            case 'checking': return <span className="text-muted-foreground text-sm">Verificando...</span>;
            case 'online': return <span className="text-green-600 font-medium text-sm">Online</span>;
            case 'slow': return <span className="text-yellow-600 font-medium text-sm">Lento</span>;
            case 'offline': return <span className="text-red-600 font-medium text-sm">Offline</span>;
        }
    };

    const hasErrors = Object.values(diagnostic).some(s => s === 'offline');
    const hasWarnings = Object.values(diagnostic).some(s => s === 'slow');

    return (
        <Card className={`mb-6 shadow-sm border-l-4 ${hasErrors ? 'border-l-red-500 bg-red-50/10' : hasWarnings ? 'border-l-yellow-500' : 'border-l-green-500'}`}>
            <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Activity className="h-5 w-5 text-primary" />
                        <div>
                            <CardTitle className="text-lg">Supervisor do Sistema</CardTitle>
                            <CardDescription className="text-xs">
                                Projeto atual: <span className="font-mono bg-muted px-1 py-0.5 rounded">{supabaseUrl}</span>
                            </CardDescription>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={runDiagnostics}
                        disabled={isRunning}
                        className="gap-2 h-8 text-xs"
                    >
                        {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        {isRunning ? 'Diagnosticando...' : 'Executar Diagnóstico'}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
                    {/* Items */}
                    <div className="flex items-center gap-3 p-3 bg-card border rounded-lg shadow-sm">
                        <StatusIcon status={diagnostic.aiFunction} />
                        <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Assistente IA</span>
                            {getStatusText(diagnostic.aiFunction)}
                        </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-card border rounded-lg shadow-sm">
                        <StatusIcon status={diagnostic.database} />
                        <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Banco de Dados</span>
                            {getStatusText(diagnostic.database)}
                        </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-card border rounded-lg shadow-sm">
                        <StatusIcon status={diagnostic.realtime} />
                        <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Realtime (WSS)</span>
                            {getStatusText(diagnostic.realtime)}
                        </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-card border rounded-lg shadow-sm">
                        <StatusIcon status={diagnostic.storage} />
                        <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Storage (Arquivos)</span>
                            {getStatusText(diagnostic.storage)}
                        </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-card border rounded-lg shadow-sm">
                        <StatusIcon status={diagnostic.aiApi} />
                        <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">API Externa (IA)</span>
                            {getStatusText(diagnostic.aiApi)}
                        </div>
                    </div>
                </div>

                {hasErrors && (
                    <div className="mt-4 p-3 bg-red-100 text-red-800 rounded-lg text-sm flex items-center gap-3 border border-red-200">
                        <AlertTriangle className="h-5 w-5 shrink-0" />
                        <div className="flex flex-col gap-1">
                            <p className="font-semibold">O assistente de IA não está disponível no momento. Verifique a conexão com o Supabase ou a Edge Function support-ai.</p>
                            {diagnostic.lastError && (
                                <p className="text-xs bg-red-50 p-1.5 rounded border border-red-100 font-mono mt-1">
                                    Erro Crítico: {diagnostic.lastError}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {lastChecked && (
                    <div className="mt-2 text-[10px] text-muted-foreground text-right w-full">
                        Última verificação: {lastChecked.toLocaleTimeString()}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
