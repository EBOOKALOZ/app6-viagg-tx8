import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle, HeadphonesIcon, ChevronRight } from 'lucide-react';
import MotoboyBottomNav from '@/components/motoboy/MotoboyBottomNav';
export const STATUS_COLORS: Record<string, string> = {
    aberto: 'bg-orange-500',
    em_analise: 'bg-blue-500',
    em_atendimento: 'bg-blue-500',
    respondido: 'bg-blue-600',
    respondido_cliente: 'bg-purple-500',
    resolvido: 'bg-green-500',
    fechado: 'bg-gray-500',
};

type SupportTicket = {
    id: string;
    ticket_number: string;
    user_id: string;
    assunto: string;
    categoria: string | null;
    status: string;
    created_at: string;
    updated_at: string;
};

export const STATUS_LABELS: Record<string, string> = {
    aberto: 'Aberto',
    em_analise: 'Em Atendimento',
    em_atendimento: 'Em Atendimento',
    respondido: 'Resp. Suporte',
    respondido_cliente: 'Aguardando Suporte',
    resolvido: 'Resolvido',
    fechado: 'Fechado',
};

import { Component, ReactNode } from 'react';

class SupportErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 text-red-500 bg-white min-h-screen">
                    <h1 className="text-2xl font-bold mb-4">Erro fatal na tela de tickets:</h1>
                    <pre className="text-xs bg-red-50 p-4 border rounded overflow-auto">
                        {this.state.error?.message}{'\n'}{this.state.error?.stack}
                    </pre>
                </div>
            );
        }
        return this.props.children;
    }
}

// Removing redundant re-export of STATUS_COLORS as it is already exported above

export default function ClientSupportTicketsPage() {
    const navigate = useNavigate();
    const { user, activeProfile } = useAuth();
    const isMotoboy = activeProfile === 'motoboy' || activeProfile === 'mototaxi';

    // Se veio do painel de anunciante (veículos/imóveis/lojista), mostra botão de
    // volta pro painel certo — mesmo contexto salvo pelo AdvertiserPanelLayout.
    const panelContext = sessionStorage.getItem('viagg_panel_context');
    const isAdvertiserPanel = !!panelContext && !isMotoboy;
    const handleBackToPanel = () => {
        if (panelContext === 'veiculos') navigate('/anunciante/veiculos');
        else if (panelContext === 'imoveis') navigate('/anunciante/imoveis');
        else navigate('/anunciante/painel');
    };

    const { data: tickets, isLoading } = useQuery({
        queryKey: ['client-support-tickets', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];

            const { data, error } = await supabase
                .from('support_tickets')
                .select(`*`)
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data as SupportTicket[];
        },
        enabled: !!user?.id
    });

    return (
        <SupportErrorBoundary>
            <div className="flex flex-col min-h-screen bg-background pb-20 animate-fade-in">
                {/* Header */}
                <div className="bg-[#FF6A00] px-4 pt-12 pb-6 text-white">
                    {isAdvertiserPanel && (
                        <button
                            onClick={handleBackToPanel}
                            className="flex items-center gap-1.5 text-xs font-bold text-white/80 hover:text-white mb-4 transition-colors"
                        >
                            <ChevronRight className="h-4 w-4 rotate-180" /> Voltar ao Painel
                        </button>
                    )}
                    <div className="flex items-center gap-3 mb-2">
                        <HeadphonesIcon className="h-6 w-6" />
                        <h1 className="text-xl font-bold">Central de Suporte</h1>
                    </div>
                    <p className="text-sm text-white/80">
                        Acompanhe seus chamados e converse com o suporte.
                    </p>
                </div>

                <div className="p-4 flex-1 space-y-4 -mt-3 relative z-10">
                    <Button
                        className="w-full gap-2 shadow-lg rounded-xl h-12 text-md mb-2 bg-[#FF6A00] hover:bg-[#E65C00] text-white"
                        onClick={() => navigate(isMotoboy ? '/motoboy/support/novo' : '/suporte/novo')}
                    >
                        <PlusCircle className="h-5 w-5" />
                        + Novo Chamado
                    </Button>

                    {isLoading ? (
                        <div className="flex h-32 items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : tickets?.length === 0 ? (
                        <div className="text-center py-12 px-4 space-y-3 bg-card rounded-2xl border shadow-sm">
                            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                                <HeadphonesIcon className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <h3 className="font-semibold text-lg">Nenhum chamado aberto</h3>
                            <p className="text-muted-foreground text-sm">
                                Você ainda não abriu nenhum chamado de suporte. Se precisar de ajuda, clique no botão acima.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {tickets?.map((ticket) => (
                                <Link
                                    key={ticket.id}
                                    to={isMotoboy ? `/motoboy/support/ticket/${ticket.id}` : `/suporte/ticket/${ticket.id}`}
                                    className="block"
                                >
                                    <Card
                                        className="overflow-hidden border shadow-sm cursor-pointer active:scale-[0.98] transition-all rounded-2xl"
                                    >
                                        <CardContent className="p-0">
                                            <div className="p-4 space-y-3">
                                                {/* Header: Ticket Number + Status */}
                                                <div className="flex items-center justify-between">
                                                    <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-md">
                                                        #{ticket.ticket_number}
                                                    </span>
                                                    <Badge className={`${STATUS_COLORS[ticket.status] || 'bg-gray-500'} text-white border-0 text-[10px] px-2`}>
                                                        {STATUS_LABELS[ticket.status] || ticket.status}
                                                    </Badge>
                                                </div>

                                                {/* Body: Subject */}
                                                <div>
                                                    <h3 className="font-semibold text-[15px] leading-tight line-clamp-2">
                                                        {ticket.assunto}
                                                    </h3>
                                                    <p className="text-xs text-muted-foreground mt-1 capitalize">
                                                        Categoria: {ticket.categoria || 'Geral'}
                                                    </p>
                                                </div>

                                                {/* Footer: Date & Arrow */}
                                                <div className="pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                                                    <span>Atualizado em {format(new Date(ticket.updated_at || ticket.created_at || new Date()), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                                                    <div className="flex items-center text-primary font-medium">
                                                        Ver detalhes <ChevronRight className="h-4 w-4 ml-1" />
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                {isMotoboy && (
                    <>
                        <div className="h-20" />
                        <MotoboyBottomNav />
                    </>
                )}
            </div>
        </SupportErrorBoundary>
    );
}
