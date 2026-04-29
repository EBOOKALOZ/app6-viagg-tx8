import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Loader2, Ticket as TicketIcon, FilterX, AlertCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminSystemSupervisor from './AdminSystemSupervisor';
import { useAuth } from '@/contexts/AuthContext';

export const STATUS_COLORS: Record<string, string> = {
    aberto: 'bg-red-500 hover:bg-red-600',
    em_analise: 'bg-yellow-500 hover:bg-yellow-600',
    em_atendimento: 'bg-yellow-500 hover:bg-yellow-600',
    respondido: 'bg-blue-500 hover:bg-blue-600',
    respondido_cliente: 'bg-purple-500 hover:bg-purple-600',
    resolvido: 'bg-green-500 hover:bg-green-600',
    fechado: 'bg-gray-500 hover:bg-gray-600',
};

const STATUS_LABELS: Record<string, string> = {
    aberto: 'Aberto',
    em_analise: 'Em Atendimento',
    em_atendimento: 'Em Atendimento',
    respondido: 'Resp. Suporte',
    respondido_cliente: 'Resp. Cliente',
    resolvido: 'Resolvido',
    fechado: 'Fechado',
};

const PRIORITY_COLORS: Record<string, string> = {
    low: 'bg-blue-100 text-blue-800',
    normal: 'bg-gray-100 text-gray-800',
    high: 'bg-orange-100 text-orange-800 border-orange-200',
    critical: 'bg-red-100 text-red-800 border-red-200 font-bold',
};

import { Component, ReactNode } from 'react';

class AdminErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 text-red-500 bg-white min-h-screen">
                    <h1 className="text-2xl font-bold mb-4">Erro fatal na tela Admin Tickets:</h1>
                    <pre className="text-xs bg-red-50 p-4 border rounded overflow-auto">
                        {this.state.error?.message}{'\n'}{this.state.error?.stack}
                    </pre>
                </div>
            );
        }
        return this.props.children;
    }
}

export default function AdminSupportTicketsPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [categoriaFilter, setCategoriaFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [activeTab, setActiveTab] = useState('todos'); // 'todos', 'meus', 'escalados', 'nao_atribuidos'
    const queryClient = useQueryClient();

    // Listen to real-time additions to support_tickets
    useEffect(() => {
        const channel = supabase
            .channel('admin-tickets-list-channel')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'support_tickets' },
                () => {
                    console.log("[AdminSupportTickets] Tabela alterada, recarregando tickets...");
                    queryClient.invalidateQueries({ queryKey: ['admin-support-tickets-list'] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient]);

    const { data: tickets, isLoading, error: ticketsError } = useQuery({
        queryKey: ['admin-support-tickets-list'],
        queryFn: async () => {
            // First fetch tickets
            const { data: ticketsData, error: ticketsError } = await supabase
                .from('support_tickets')
                .select(`
                  id, 
                  ticket_number, 
                  user_id, 
                  assunto, 
                  categoria, 
                  status, 
                  created_at, 
                  updated_at,
                  assigned_agent_id,
                  priority,
                  ai_status
                `)
                .order('updated_at', { ascending: false });

            if (ticketsError) throw ticketsError;

            // Extract unique user IDs and fetch profiles (both creators and assigned agents)
            const userIds = [...new Set((ticketsData || []).flatMap(t => [t.user_id, t.assigned_agent_id]).filter(Boolean))];
            const profileMap: Record<string, any> = {};

            if (userIds.length > 0) {
                // Fetch from common profiles (Clients + Agents)
                const { data: profilesData } = await supabase
                    .from('profiles')
                    .select('id, name, email')
                    .in('id', userIds);

                if (profilesData) {
                    profilesData.forEach(p => { profileMap[p.id] = p; });
                }

                // Fetch from motoboy_profiles for users
                const { data: motoboyData } = await supabase
                    .from('motoboy_profiles')
                    .select('user_id, whatsapp')
                    .in('user_id', userIds);

                if (motoboyData) {
                    motoboyData.forEach(m => {
                        if (profileMap[m.user_id]) {
                            profileMap[m.user_id] = {
                                ...profileMap[m.user_id],
                                user_type: 'motoboy',
                                phone: m.whatsapp || profileMap[m.user_id].phone
                            };
                        } else {
                            profileMap[m.user_id] = {
                                id: m.user_id,
                                name: 'Motoboy Desconhecido',
                                user_type: 'motoboy',
                                email: '',
                                phone: m.whatsapp
                            };
                        }
                    });
                }
            }

            // Merge data
            return (ticketsData || []).map(ticket => {
                const p = profileMap[ticket.user_id];
                const agent = ticket.assigned_agent_id ? profileMap[ticket.assigned_agent_id] : null;
                return {
                    ...ticket,
                    user: {
                        name: p?.name || 'Usuário Desconhecido',
                        email: p?.email || '',
                        phone: p?.phone || '',
                        user_type: p?.user_type || 'Desconhecido'
                    },
                    agentName: agent?.name || agent?.email || 'Nenhum'
                };
            });
        }
    });

    if (ticketsError) {
        console.error("Erro ao buscar tickets:", ticketsError);
    }

    const filteredTickets = tickets?.filter(ticket => {
        const term = searchTerm.toLowerCase();
        const matchSearch = term === '' ||
            ticket.ticket_number?.toLowerCase().includes(term) ||
            ticket.assunto?.toLowerCase().includes(term) ||
            (ticket.user?.name && ticket.user.name.toLowerCase().includes(term)) ||
            (ticket.user?.email && ticket.user.email.toLowerCase().includes(term));

        const matchStatus = statusFilter === 'all' || ticket.status === statusFilter;
        const matchCategoria = categoriaFilter === 'all' || ticket.categoria === categoriaFilter;
        const matchPriority = priorityFilter === 'all' || ticket.priority === priorityFilter;

        let matchTab = true;
        if (activeTab === 'meus') {
            matchTab = ticket.assigned_agent_id === user?.id;
        } else if (activeTab === 'nao_atribuidos') {
            matchTab = !ticket.assigned_agent_id && ticket.status !== 'resolvido' && ticket.status !== 'fechado';
        } else if (activeTab === 'escalados') {
            matchTab = ticket.ai_status === 'escalated' || ticket.priority === 'high' || ticket.priority === 'critical';
        }

        return matchSearch && matchStatus && matchCategoria && matchPriority && matchTab;
    });

    const uniqueCategories = [...new Set((tickets || []).map(t => t.categoria).filter(Boolean))];

    return (
        <AdminErrorBoundary>
            <div className="p-6 space-y-6 max-w-[1400px] mx-auto animate-fade-in relative">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <TicketIcon className="h-6 w-6 text-primary" />
                        Apoio Colaborativo
                    </h1>
                    <p className="text-muted-foreground">Central unificada de atendimento aos usuários da plataforma.</p>
                </div>

                <AdminSystemSupervisor />

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="mb-4">
                        <TabsTrigger value="todos">Todos os Tickets</TabsTrigger>
                        <TabsTrigger value="meus">Meus Atendimentos</TabsTrigger>
                        <TabsTrigger value="nao_atribuidos">Fila (Aguardando)</TabsTrigger>
                        <TabsTrigger value="escalados">Escalados / Críticos</TabsTrigger>
                    </TabsList>
                </Tabs>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle>Filtros</CardTitle>
                        <CardDescription>Encontre tickets usando parâmetros múltiplos</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            <div className="relative md:col-span-2">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar por #ticket, cliente, e-mail ou assunto..."
                                    className="pl-9"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos os Status</SelectItem>
                                    <SelectItem value="aberto">Aberto</SelectItem>
                                    <SelectItem value="em_analise">Em Atendimento</SelectItem>
                                    <SelectItem value="respondido">Resp. Suporte</SelectItem>
                                    <SelectItem value="respondido_cliente">Resp. Cliente</SelectItem>
                                    <SelectItem value="resolvido">Resolvido</SelectItem>
                                    <SelectItem value="fechado">Fechado</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Categoria" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas as Categorias</SelectItem>
                                    {uniqueCategories.map(cat => (
                                        <SelectItem key={cat as string} value={cat as string}>{cat}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Prioridade" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas as Prioridades</SelectItem>
                                    <SelectItem value="critical">Crítica</SelectItem>
                                    <SelectItem value="high">Alta</SelectItem>
                                    <SelectItem value="normal">Normal</SelectItem>
                                    <SelectItem value="low">Baixa</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {(searchTerm !== '' || statusFilter !== 'all' || categoriaFilter !== 'all' || priorityFilter !== 'all') && (
                            <div className="mt-4 flex justify-end">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setSearchTerm('');
                                        setStatusFilter('all');
                                        setCategoriaFilter('all');
                                        setPriorityFilter('all');
                                    }}
                                    className="text-muted-foreground"
                                >
                                    <FilterX className="h-4 w-4 mr-2" />
                                    Limpar Filtros
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <div className="rounded-md border border-border/50 overflow-hidden">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead className="w-[110px]">Ticket</TableHead>
                                    <TableHead>Usuário</TableHead>
                                    <TableHead>Assunto</TableHead>
                                    <TableHead className="w-[120px]">Responsável</TableHead>
                                    <TableHead className="w-[100px]">Prioridade</TableHead>
                                    <TableHead className="w-[120px]">Status</TableHead>
                                    <TableHead className="w-[140px]">Última Interação</TableHead>
                                    <TableHead className="w-[80px] text-right">Ação</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-24 text-center">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                        </TableCell>
                                    </TableRow>
                                ) : ticketsError ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-24 text-center text-red-500">
                                            Erro ao carregar tickets: {(ticketsError as Error).message}
                                        </TableCell>
                                    </TableRow>
                                ) : filteredTickets && filteredTickets.length > 0 ? (
                                    filteredTickets.map((ticket) => (
                                        <TableRow
                                            key={ticket.id}
                                            className="cursor-pointer hover:bg-muted/50 transition-colors"
                                            onClick={() => navigate(`/admin/support/ticket/${ticket.id}`)}
                                        >
                                            <TableCell className="font-mono text-xs font-semibold text-primary">
                                                #{ticket.ticket_number}
                                            </TableCell>
                                            <TableCell>
                                                <p className="font-medium text-sm">{ticket.user.name || ticket.user.email}</p>
                                                <p className="text-xs text-muted-foreground capitalize">
                                                    {ticket.user.user_type === 'merchant' ? 'Lojista' :
                                                        ticket.user.user_type === 'motoboy' ? 'Motoboy' :
                                                            ticket.user.user_type === 'passenger' ? 'Passageiro' :
                                                                ticket.user.user_type === 'admin' ? 'Administrador' :
                                                                    ticket.user.user_type || 'Cliente'}
                                                </p>
                                            </TableCell>
                                            <TableCell className="max-w-[200px] truncate" title={ticket.assunto}>
                                                <div className="font-medium text-sm truncate">{ticket.assunto}</div>
                                                <div className="text-xs text-muted-foreground truncate">{ticket.categoria || 'Geral'}</div>
                                            </TableCell>
                                            <TableCell>
                                                {ticket.assigned_agent_id ? (
                                                    <Badge variant="outline" className="text-xs font-normal">
                                                        {ticket.agentName.split(' ')[0]}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">Nenhum</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={`text-[10px] uppercase ${PRIORITY_COLORS[ticket.priority || 'normal']}`}>
                                                    {ticket.priority || 'Normal'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={`${STATUS_COLORS[ticket.status] || 'bg-gray-500'} text-white border-0 text-[10px]`}>
                                                    {STATUS_LABELS[ticket.status] || ticket.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {format(new Date(ticket.updated_at), "dd MMM, HH:mm", { locale: ptBR })}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                    <Search className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                                            Nenhum ticket encontrado na aba ou com os filtros atuais.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </Card>
            </div>
        </AdminErrorBoundary>
    );
}
