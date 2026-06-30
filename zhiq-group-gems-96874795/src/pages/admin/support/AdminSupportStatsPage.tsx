import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart3, Clock, CheckCircle, Ticket, AlertCircle, MessageSquare, Activity, Loader2, Brain, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

type TicketRow = {
    id: string;
    status: string;
    priority: string | null;
    categoria: string | null;
    created_at: string;
    updated_at: string;
};

type MsgRow = {
    id: string;
    ticket_id: string;
    is_ai: boolean | null;
    created_at: string;
};

const CAT_LABEL: Record<string, string> = {
    geral:    'Geral',
    pagamento:'Pagamento',
    tecnico:  'Técnico',
    creditos: 'Créditos',
    conta:    'Conta',
    anuncio:  'Anúncio',
    entrega:  'Entrega',
    outros:   'Outros',
};

function ProgressBar({ value, max, colorClass }: { value: number; max: number; colorClass: string }) {
    const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
    return (
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div className={cn('h-2 rounded-full transition-all duration-500', colorClass)} style={{ width: `${pct}%` }} />
        </div>
    );
}

export default function AdminSupportStatsPage() {
    const { data: allTickets, isLoading: ticketsLoading } = useQuery({
        queryKey: ['admin-support-stats-tickets'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('support_tickets')
                .select('id, status, priority, categoria, created_at, updated_at');
            if (error) throw error;
            return (data || []) as TicketRow[];
        },
        staleTime: 60_000,
    });

    const { data: allMessages, isLoading: msgsLoading } = useQuery({
        queryKey: ['admin-support-stats-messages'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('ticket_messages')
                .select('id, ticket_id, is_ai, created_at');
            if (error) throw error;
            return (data || []) as MsgRow[];
        },
        staleTime: 60_000,
    });

    const isLoading = ticketsLoading || msgsLoading;

    const stats = useMemo(() => {
        const tickets = allTickets || [];
        const messages = allMessages || [];
        const todayStr = new Date().toISOString().slice(0, 10);
        const total = tickets.length;

        const byStatus: Record<string, number> = {};
        const byCategoria: Record<string, number> = {};
        const byPriority: Record<string, number> = {};
        let abertosHoje = 0, resolvidosHoje = 0;

        for (const t of tickets) {
            byStatus[t.status] = (byStatus[t.status] || 0) + 1;
            const cat = t.categoria || 'geral';
            byCategoria[cat] = (byCategoria[cat] || 0) + 1;
            const pri = t.priority || 'normal';
            byPriority[pri] = (byPriority[pri] || 0) + 1;
            if ((t.created_at || '').startsWith(todayStr)) abertosHoje++;
            if (['resolvido', 'fechado'].includes(t.status) && (t.updated_at || '').startsWith(todayStr)) resolvidosHoje++;
        }

        const abertos       = byStatus['aberto'] || 0;
        const emAtendimento = (byStatus['em_analise'] || 0) + (byStatus['em_atendimento'] || 0);
        const resolvidos    = (byStatus['resolvido'] || 0) + (byStatus['fechado'] || 0);
        const urgentes      = (byPriority['urgent'] || 0) + (byPriority['critical'] || 0);

        // GLM AI metrics
        const aiMessages    = messages.filter(m => m.is_ai === true);
        const aiMsgCount    = aiMessages.length;
        const totalMsgCount = messages.length;
        const ticketIdsWithAI = new Set(aiMessages.map(m => m.ticket_id));
        const ticketsWithAI = ticketIdsWithAI.size;
        const aiCoverageRate = total > 0 ? Math.round((ticketsWithAI / total) * 100) : 0;
        const aiResponseRate = totalMsgCount > 0 ? Math.round((aiMsgCount / totalMsgCount) * 100) : 0;

        const topCats = Object.entries(byCategoria)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        return {
            total, abertos, emAtendimento, resolvidos, urgentes,
            abertosHoje, resolvidosHoje,
            byStatus, byCategoria, byPriority, topCats,
            aiMsgCount, aiCoverageRate, aiResponseRate, ticketsWithAI,
        };
    }, [allTickets, allMessages]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const kpiCards = [
        { label: 'Total de Tickets', value: stats.total,          icon: Ticket,       color: 'text-primary',    bg: 'bg-primary/10',   sub: `${stats.abertosHoje} novos hoje` },
        { label: 'Abertos',          value: stats.abertos,         icon: AlertCircle,  color: 'text-orange-500', bg: 'bg-orange-50',    sub: 'Aguardando atendimento' },
        { label: 'Em Atendimento',   value: stats.emAtendimento,   icon: Clock,        color: 'text-blue-500',   bg: 'bg-blue-50',      sub: 'Em análise pela equipe' },
        { label: 'Resolvidos',       value: stats.resolvidos,      icon: CheckCircle,  color: 'text-green-500',  bg: 'bg-green-50',     sub: `${stats.resolvidosHoje} hoje` },
        { label: 'Urgentes/Críticos',value: stats.urgentes,        icon: Activity,     color: 'text-red-500',    bg: 'bg-red-50',       sub: 'Exigem atenção imediata' },
    ];

    const statusRows = [
        { key: 'aberto',             label: 'Abertos',          colorClass: 'bg-orange-500', count: stats.byStatus['aberto'] || 0 },
        { key: 'em_atendimento',     label: 'Em Atendimento',   colorClass: 'bg-blue-500',   count: (stats.byStatus['em_analise'] || 0) + (stats.byStatus['em_atendimento'] || 0) },
        { key: 'respondido',         label: 'Resp. Suporte',    colorClass: 'bg-blue-600',   count: stats.byStatus['respondido'] || 0 },
        { key: 'respondido_cliente', label: 'Aguard. Suporte',  colorClass: 'bg-purple-500', count: stats.byStatus['respondido_cliente'] || 0 },
        { key: 'resolvido',          label: 'Resolvidos',       colorClass: 'bg-green-500',  count: stats.byStatus['resolvido'] || 0 },
        { key: 'fechado',            label: 'Encerrados',       colorClass: 'bg-gray-400',   count: stats.byStatus['fechado'] || 0 },
    ];

    const priorityRows = [
        { key: 'urgent',   label: 'Urgente', colorClass: 'bg-red-800'    },
        { key: 'critical', label: 'Crítica', colorClass: 'bg-red-500'    },
        { key: 'high',     label: 'Alta',    colorClass: 'bg-orange-500' },
        { key: 'normal',   label: 'Normal',  colorClass: 'bg-blue-400'   },
        { key: 'low',      label: 'Baixa',   colorClass: 'bg-slate-400'  },
    ];

    return (
        <div className="space-y-6 max-w-[1400px] mx-auto animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <BarChart3 className="h-6 w-6 text-primary" />
                    Estatísticas de Suporte
                </h1>
                <p className="text-muted-foreground">
                    Métricas de atendimento ao cliente — {stats.total} tickets no total. Atualizado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.
                </p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {kpiCards.map(kpi => {
                    const Icon = kpi.icon;
                    return (
                        <Card key={kpi.label}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{kpi.label}</CardTitle>
                                <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center', kpi.bg)}>
                                    <Icon className={cn('h-4 w-4', kpi.color)} />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold">{kpi.value}</div>
                                <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* GLM AI Metrics */}
            <Card className="border-violet-200 bg-gradient-to-br from-violet-50/50 to-purple-50/30">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-violet-800">
                        <Brain className="h-5 w-5 text-violet-600" />
                        Métricas da GLM IA
                    </CardTitle>
                    <CardDescription>Desempenho do atendimento automático por inteligência artificial</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-4 bg-white rounded-xl border border-violet-100 shadow-sm">
                            <div className="flex items-center justify-center mb-2">
                                <Sparkles className="h-5 w-5 text-violet-500" />
                            </div>
                            <div className="text-2xl font-bold text-violet-700">{stats.aiMsgCount}</div>
                            <p className="text-xs text-violet-600 mt-1 font-medium">Respostas da IA</p>
                        </div>
                        <div className="text-center p-4 bg-white rounded-xl border border-violet-100 shadow-sm">
                            <div className="flex items-center justify-center mb-2">
                                <MessageSquare className="h-5 w-5 text-violet-500" />
                            </div>
                            <div className="text-2xl font-bold text-violet-700">{stats.ticketsWithAI}</div>
                            <p className="text-xs text-violet-600 mt-1 font-medium">Tickets com IA</p>
                        </div>
                        <div className="text-center p-4 bg-white rounded-xl border border-violet-100 shadow-sm">
                            <div className="text-2xl font-bold text-violet-700">{stats.aiCoverageRate}%</div>
                            <p className="text-xs text-violet-600 mt-1 font-medium">Cobertura IA</p>
                            <ProgressBar value={stats.aiCoverageRate} max={100} colorClass="bg-violet-500" />
                        </div>
                        <div className="text-center p-4 bg-white rounded-xl border border-violet-100 shadow-sm">
                            <div className="text-2xl font-bold text-violet-700">{stats.aiResponseRate}%</div>
                            <p className="text-xs text-violet-600 mt-1 font-medium">Msgs automáticas</p>
                            <ProgressBar value={stats.aiResponseRate} max={100} colorClass="bg-purple-500" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Status Distribution */}
                <Card>
                    <CardHeader>
                        <CardTitle>Distribuição por Status</CardTitle>
                        <CardDescription>Como os tickets estão distribuídos entre os estados</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {statusRows.map(row => (
                            <div key={row.key} className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">{row.label}</span>
                                    <span className="font-semibold">{row.count}</span>
                                </div>
                                <ProgressBar value={row.count} max={stats.total} colorClass={row.colorClass} />
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Top Categories */}
                <Card>
                    <CardHeader>
                        <CardTitle>Categorias Mais Comuns</CardTitle>
                        <CardDescription>As categorias mais utilizadas pelos clientes</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {stats.topCats.length === 0 ? (
                            <p className="text-muted-foreground text-sm">Nenhum dado disponível.</p>
                        ) : stats.topCats.map(([cat, count]) => (
                            <div key={cat} className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground capitalize">{CAT_LABEL[cat] || cat}</span>
                                    <span className="font-semibold">{count}</span>
                                </div>
                                <ProgressBar value={count} max={stats.total} colorClass="bg-primary" />
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Priority Distribution */}
                <Card>
                    <CardHeader>
                        <CardTitle>Distribuição por Prioridade</CardTitle>
                        <CardDescription>Nível de urgência dos tickets</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {priorityRows.map(row => {
                            const count = stats.byPriority[row.key] || 0;
                            return (
                                <div key={row.key} className="space-y-1">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">{row.label}</span>
                                        <span className="font-semibold">{count}</span>
                                    </div>
                                    <ProgressBar value={count} max={stats.total} colorClass={row.colorClass} />
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>

                {/* Today's Activity */}
                <Card>
                    <CardHeader>
                        <CardTitle>Atividade de Hoje</CardTitle>
                        <CardDescription>{format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="text-center p-4 bg-orange-50 rounded-xl border border-orange-100">
                                <div className="text-3xl font-bold text-orange-600">{stats.abertosHoje}</div>
                                <p className="text-xs text-orange-700 mt-1 font-medium">Novos Tickets</p>
                            </div>
                            <div className="text-center p-4 bg-green-50 rounded-xl border border-green-100">
                                <div className="text-3xl font-bold text-green-600">{stats.resolvidosHoje}</div>
                                <p className="text-xs text-green-700 mt-1 font-medium">Resolvidos</p>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Taxa de resolução hoje</span>
                                <span className="font-bold text-green-600">
                                    {stats.abertosHoje > 0 ? Math.round((stats.resolvidosHoje / stats.abertosHoje) * 100) : 0}%
                                </span>
                            </div>
                            <ProgressBar
                                value={stats.abertosHoje > 0 ? stats.resolvidosHoje : 0}
                                max={Math.max(stats.abertosHoje, 1)}
                                colorClass="bg-green-500"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground mt-3 text-center">
                            Total geral: {stats.resolvidos} de {stats.total} tickets resolvidos
                            ({stats.total > 0 ? Math.round((stats.resolvidos / stats.total) * 100) : 0}%)
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
