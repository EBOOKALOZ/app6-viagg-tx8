import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { Component, ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Loader2, PlusCircle, HeadphonesIcon, ChevronRight,
    Search, Star, AlertCircle, Clock, CheckCircle2,
    MessageSquare, XCircle, Sparkles, Brain
} from 'lucide-react';
import MotoboyBottomNav from '@/components/motoboy/MotoboyBottomNav';
import MototaxiBottomNav from '@/components/motoboy/MototaxiBottomNav';
import DriverBottomNav from '@/components/driver/DriverBottomNav';
import { cn } from '@/lib/utils';

// ── Exported maps (used by ClientTicketConversationPage) ────────────────────
export const STATUS_COLORS: Record<string, string> = {
    aberto:             'bg-orange-500',
    em_analise:         'bg-blue-500',
    em_atendimento:     'bg-blue-500',
    respondido:         'bg-blue-600',
    respondido_cliente: 'bg-purple-500',
    resolvido:          'bg-green-500',
    fechado:            'bg-gray-500',
};

export const STATUS_LABELS: Record<string, string> = {
    aberto:             'Aberto',
    em_analise:         'Em Atendimento',
    em_atendimento:     'Em Atendimento',
    respondido:         'Resp. Suporte',
    respondido_cliente: 'Aguardando Suporte',
    resolvido:          'Resolvido',
    fechado:            'Encerrado',
};

// ── Types ───────────────────────────────────────────────────────────────────
type SupportTicket = {
    id: string;
    ticket_number: string;
    user_id: string;
    assunto: string;
    categoria: string | null;
    status: string;
    priority?: string | null;
    created_at: string;
    updated_at: string;
};

// ── Error Boundary ───────────────────────────────────────────────────────────
class SupportErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
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

// ── Visual config maps ───────────────────────────────────────────────────────
const STATUS_LEFT_BORDER: Record<string, string> = {
    aberto:             'border-l-orange-500',
    em_analise:         'border-l-blue-500',
    em_atendimento:     'border-l-blue-500',
    respondido:         'border-l-blue-600',
    respondido_cliente: 'border-l-purple-500',
    resolvido:          'border-l-green-500',
    fechado:            'border-l-gray-300',
};

const STATUS_ICON: Record<string, { icon: React.ElementType; cls: string }> = {
    aberto:             { icon: AlertCircle,  cls: 'text-orange-500' },
    em_analise:         { icon: Clock,        cls: 'text-blue-500'   },
    em_atendimento:     { icon: Clock,        cls: 'text-blue-500'   },
    respondido:         { icon: MessageSquare,cls: 'text-blue-600'   },
    respondido_cliente: { icon: MessageSquare,cls: 'text-purple-500' },
    resolvido:          { icon: CheckCircle2, cls: 'text-green-500'  },
    fechado:            { icon: XCircle,      cls: 'text-gray-400'   },
};

const PRIORITY_CFG: Record<string, { label: string; cls: string }> = {
    low:      { label: 'Baixa',   cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    normal:   { label: 'Normal',  cls: 'bg-blue-50 text-blue-700 border-blue-200'     },
    high:     { label: 'Alta',    cls: 'bg-orange-100 text-orange-700 border-orange-200' },
    critical: { label: 'Crítica', cls: 'bg-red-100 text-red-700 border-red-300'       },
    urgent:   { label: 'Urgente', cls: 'bg-red-900/20 text-red-800 border-red-400'    },
};

type SegmentKey = 'motoboy' | 'mototaxi' | 'driver' | 'imoveis' | 'veiculos' | 'servicos' | 'fretes' | 'viagens' | 'mercado';

const SEGMENT_CFG: Record<SegmentKey, { label: string; headerGrad: string; btnCls: string; kpiAccent: string }> = {
    motoboy:  { label: 'Motoboy',           headerGrad: 'bg-[#FF6A00]',                                         btnCls: 'bg-[#FF6A00] hover:bg-[#E65C00] text-white',           kpiAccent: 'text-[#FF6A00]' },
    mototaxi: { label: 'Moto-Táxi',         headerGrad: 'bg-footer-mototaxi',                                   btnCls: 'bg-footer-mototaxi text-footer-mototaxi-foreground hover:opacity-90', kpiAccent: 'text-violet-600' },
    driver:   { label: 'Motorista',          headerGrad: 'bg-gradient-to-r from-amber-700 to-orange-600',       btnCls: 'bg-amber-600 hover:bg-amber-700 text-white',            kpiAccent: 'text-amber-600' },
    imoveis:  { label: 'Imóveis',            headerGrad: 'bg-gradient-to-br from-blue-700 to-blue-500',         btnCls: 'bg-blue-600 hover:bg-blue-700 text-white',              kpiAccent: 'text-blue-600'  },
    veiculos: { label: 'Veículos',           headerGrad: 'bg-gradient-to-br from-cyan-700 to-cyan-500',         btnCls: 'bg-cyan-600 hover:bg-cyan-700 text-white',              kpiAccent: 'text-cyan-600'  },
    servicos: { label: 'Serviços',           headerGrad: 'bg-gradient-to-br from-purple-700 to-purple-500',     btnCls: 'bg-purple-600 hover:bg-purple-700 text-white',          kpiAccent: 'text-purple-600'},
    fretes:   { label: 'Fretes & Mudanças',  headerGrad: 'bg-gradient-to-br from-yellow-600 to-amber-500',      btnCls: 'bg-yellow-600 hover:bg-yellow-700 text-white',          kpiAccent: 'text-yellow-600'},
    viagens:  { label: 'Viagens & Turismo',  headerGrad: 'bg-gradient-to-br from-emerald-700 to-emerald-500',  btnCls: 'bg-emerald-600 hover:bg-emerald-700 text-white',        kpiAccent: 'text-emerald-600'},
    mercado:  { label: 'Mercado',            headerGrad: 'bg-[#FF6A00]',                                        btnCls: 'bg-[#FF6A00] hover:bg-[#E65C00] text-white',           kpiAccent: 'text-[#FF6A00]' },
};

const FAV_KEY = 'viagg_fav_tickets';
type FilterType = 'all' | 'abertos' | 'em_atendimento' | 'respondidos' | 'resolvidos' | 'favoritos';

// ── Component ────────────────────────────────────────────────────────────────
export default function ClientSupportTicketsPage() {
    const navigate = useNavigate();
    const { user, activeProfile } = useAuth();

    const isMotoboy   = activeProfile === 'motoboy';
    const isMototaxi  = activeProfile === 'mototaxi';
    const isDriver    = activeProfile === 'driver';
    const hasMobileNav = isMotoboy || isMototaxi || isDriver;

    const panelContext = sessionStorage.getItem('viagg_panel_context');
    const isAdvertiserPanel = !!panelContext && !isMotoboy && !isMototaxi && !isDriver;

    const segmentKey: SegmentKey = isMotoboy ? 'motoboy'
        : isMototaxi  ? 'mototaxi'
        : isDriver    ? 'driver'
        : panelContext === 'imoveis'  ? 'imoveis'
        : panelContext === 'veiculos' ? 'veiculos'
        : panelContext === 'servicos' ? 'servicos'
        : panelContext === 'fretes'   ? 'fretes'
        : panelContext === 'viagens'  ? 'viagens'
        : 'mercado';

    const seg = SEGMENT_CFG[segmentKey];

    const handleBackToPanel = () => {
        const routes: Record<string, string> = {
            veiculos: '/anunciante/veiculos',
            imoveis:  '/anunciante/imoveis',
            servicos: '/anunciante/servicos',
            fretes:   '/anunciante/fretes',
            viagens:  '/anunciante/viagens',
        };
        navigate(panelContext ? (routes[panelContext] || '/anunciante/painel') : '/anunciante/painel');
    };

    // Favorites
    const [favorites, setFavorites] = useState<Set<string>>(() => {
        try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]') as string[]); }
        catch { return new Set<string>(); }
    });

    const toggleFavorite = (ticketId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setFavorites(prev => {
            const next = new Set(prev);
            if (next.has(ticketId)) next.delete(ticketId); else next.add(ticketId);
            try { localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch {}
            return next;
        });
    };

    // Filter / search
    const [filterActive, setFilterActive] = useState<FilterType>('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Data
    const { data: tickets, isLoading } = useQuery({
        queryKey: ['client-support-tickets', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];
            const { data, error } = await supabase
                .from('support_tickets')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data as SupportTicket[];
        },
        enabled: !!user?.id,
    });

    // Computed stats
    const stats = useMemo(() => {
        const all = tickets || [];
        return {
            total:          all.length,
            abertos:        all.filter(t => t.status === 'aberto').length,
            emAtendimento:  all.filter(t => ['em_analise', 'em_atendimento'].includes(t.status)).length,
            respondidos:    all.filter(t => ['respondido', 'respondido_cliente'].includes(t.status)).length,
            resolvidos:     all.filter(t => ['resolvido', 'fechado'].includes(t.status)).length,
        };
    }, [tickets]);

    // Filtered tickets
    const filteredTickets = useMemo(() => {
        let result = tickets || [];
        if (searchTerm.trim()) {
            const q = searchTerm.toLowerCase();
            result = result.filter(t =>
                t.assunto.toLowerCase().includes(q) ||
                t.ticket_number.toLowerCase().includes(q) ||
                (t.categoria || '').toLowerCase().includes(q)
            );
        }
        switch (filterActive) {
            case 'abertos':        result = result.filter(t => t.status === 'aberto'); break;
            case 'em_atendimento': result = result.filter(t => ['em_analise', 'em_atendimento'].includes(t.status)); break;
            case 'respondidos':    result = result.filter(t => ['respondido', 'respondido_cliente'].includes(t.status)); break;
            case 'resolvidos':     result = result.filter(t => ['resolvido', 'fechado'].includes(t.status)); break;
            case 'favoritos':      result = result.filter(t => favorites.has(t.id)); break;
        }
        return result;
    }, [tickets, searchTerm, filterActive, favorites]);

    const FILTER_TABS: { key: FilterType; label: string; count: number }[] = [
        { key: 'all',            label: 'Todos',          count: stats.total          },
        { key: 'abertos',        label: 'Abertos',        count: stats.abertos        },
        { key: 'em_atendimento', label: 'Em Atendimento', count: stats.emAtendimento  },
        { key: 'respondidos',    label: 'Respondidos',    count: stats.respondidos    },
        { key: 'resolvidos',     label: 'Resolvidos',     count: stats.resolvidos     },
        { key: 'favoritos',      label: '⭐ Favoritos',   count: favorites.size       },
    ];

    const supportRoute = isMotoboy ? '/motoboy/support' : '/suporte';

    return (
        <SupportErrorBoundary>
            <div className="flex flex-col min-h-screen bg-background pb-20 animate-fade-in">

                {/* ── Header ── */}
                <div className={cn(seg.headerGrad, 'text-white px-4 pt-12 pb-8')}>
                    {isAdvertiserPanel && (
                        <button
                            onClick={handleBackToPanel}
                            className="flex items-center gap-1.5 text-xs font-bold opacity-80 hover:opacity-100 mb-4 transition-opacity"
                        >
                            <ChevronRight className="h-4 w-4 rotate-180" /> Voltar ao Painel {seg.label}
                        </button>
                    )}
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                            <HeadphonesIcon className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold leading-tight">Central de Suporte</h1>
                            <p className="text-xs text-white/70 mt-0.5">
                                {seg.label} · {stats.total} chamado{stats.total !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── KPI Stats Cards ── */}
                {!isLoading && stats.total > 0 && (
                    <div className="-mt-4 mx-4 grid grid-cols-2 gap-3 z-10 relative">
                        {[
                            { label: 'Abertos',        value: stats.abertos,       icon: AlertCircle,  bg: 'bg-orange-50 border-orange-100', ic: 'text-orange-500' },
                            { label: 'Em Atendimento', value: stats.emAtendimento, icon: Clock,        bg: 'bg-blue-50 border-blue-100',     ic: 'text-blue-500'   },
                            { label: 'Respondidos',    value: stats.respondidos,   icon: MessageSquare,bg: 'bg-purple-50 border-purple-100', ic: 'text-purple-500' },
                            { label: 'Resolvidos',     value: stats.resolvidos,    icon: CheckCircle2, bg: 'bg-green-50 border-green-100',   ic: 'text-green-500'  },
                        ].map(k => {
                            const Icon = k.icon;
                            return (
                                <div key={k.label} className="bg-card border rounded-2xl p-3 shadow-sm flex items-center gap-3">
                                    <div className={cn('h-9 w-9 rounded-xl border flex items-center justify-center shrink-0', k.bg)}>
                                        <Icon className={cn('h-4 w-4', k.ic)} />
                                    </div>
                                    <div>
                                        <div className="text-xl font-bold leading-none">{k.value}</div>
                                        <div className="text-[11px] text-muted-foreground mt-0.5">{k.label}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="p-4 flex-1 space-y-4 mt-2">

                    {/* ── New Ticket Button ── */}
                    <Button
                        className={cn('w-full gap-2 shadow-md rounded-xl h-12 text-[15px]', seg.btnCls)}
                        onClick={() => navigate(`${supportRoute}/novo`)}
                    >
                        <PlusCircle className="h-5 w-5" />
                        Abrir Novo Chamado
                    </Button>

                    {/* ── GLM AI Banner ── */}
                    <div className="flex items-center gap-3 bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-2xl px-4 py-3">
                        <div className="h-9 w-9 rounded-xl bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
                            <Brain className="h-4 w-4 text-violet-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-violet-800 leading-tight">Atendimento com GLM IA</p>
                            <p className="text-[11px] text-violet-600 mt-0.5">Respostas automáticas disponíveis 24h por dia</p>
                        </div>
                        <Sparkles className="h-4 w-4 text-violet-400 shrink-0" />
                    </div>

                    {/* ── Search ── */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                            placeholder="Buscar por assunto, nº ou categoria..."
                            className="pl-9 rounded-xl bg-muted/40 border-muted-foreground/20 text-sm"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* ── Filter Tabs ── */}
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                        {FILTER_TABS.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setFilterActive(tab.key)}
                                className={cn(
                                    'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border whitespace-nowrap',
                                    filterActive === tab.key
                                        ? 'bg-foreground text-background border-foreground shadow-sm'
                                        : 'bg-muted text-muted-foreground border-transparent hover:bg-muted/70'
                                )}
                            >
                                {tab.label}{tab.count > 0 ? ` (${tab.count})` : ''}
                            </button>
                        ))}
                    </div>

                    {/* ── Ticket List ── */}
                    {isLoading ? (
                        <div className="flex h-32 items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : filteredTickets.length === 0 ? (
                        <div className="text-center py-12 px-4 space-y-3 bg-card rounded-2xl border shadow-sm">
                            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                                <HeadphonesIcon className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <h3 className="font-semibold text-lg">
                                {(tickets?.length ?? 0) === 0 ? 'Nenhum chamado aberto' : 'Nenhum resultado'}
                            </h3>
                            <p className="text-muted-foreground text-sm">
                                {(tickets?.length ?? 0) === 0
                                    ? 'Abra seu primeiro chamado de suporte clicando no botão acima.'
                                    : 'Tente outro filtro ou pesquisa.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredTickets.map(ticket => {
                                const si = STATUS_ICON[ticket.status] || STATUS_ICON['aberto'];
                                const StatusIcon = si.icon;
                                const borderColor = STATUS_LEFT_BORDER[ticket.status] || 'border-l-gray-300';
                                const priority = ticket.priority;
                                const showPriority = priority && priority !== 'normal';
                                const priCfg = priority ? PRIORITY_CFG[priority] : null;
                                const isFav = favorites.has(ticket.id);

                                return (
                                    <Link
                                        key={ticket.id}
                                        to={`${supportRoute}/ticket/${ticket.id}`}
                                        className="block"
                                    >
                                        <Card className={cn(
                                            'overflow-hidden border shadow-sm cursor-pointer active:scale-[0.98] transition-all rounded-2xl border-l-4',
                                            borderColor
                                        )}>
                                            <CardContent className="p-4">
                                                {/* Row 1: Number + priority + fav */}
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-mono text-xs font-bold bg-muted/60 px-2 py-0.5 rounded-md text-muted-foreground">
                                                            #{ticket.ticket_number}
                                                        </span>
                                                        {showPriority && priCfg && (
                                                            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full border', priCfg.cls)}>
                                                                {priCfg.label}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <div className="flex items-center gap-1">
                                                            <StatusIcon className={cn('h-3.5 w-3.5', si.cls)} />
                                                            <span className="text-[11px] font-medium text-muted-foreground">
                                                                {STATUS_LABELS[ticket.status] || ticket.status}
                                                            </span>
                                                        </div>
                                                        <button
                                                            onClick={e => toggleFavorite(ticket.id, e)}
                                                            className={cn(
                                                                'p-1 rounded-lg transition-colors',
                                                                isFav ? 'text-yellow-500' : 'text-muted-foreground/25 hover:text-yellow-400'
                                                            )}
                                                        >
                                                            <Star className={cn('h-4 w-4', isFav && 'fill-current')} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Row 2: Subject + category */}
                                                <h3 className="font-semibold text-[15px] leading-tight line-clamp-2 mb-1">
                                                    {ticket.assunto}
                                                </h3>
                                                <p className="text-xs text-muted-foreground capitalize">
                                                    {ticket.categoria || 'Geral'}
                                                </p>

                                                {/* Row 3: Dates + arrow */}
                                                <div className="flex items-center justify-between mt-3 pt-3 border-t text-[11px] text-muted-foreground">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span>Aberto: {format(new Date(ticket.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                                                        <span>Atualizado: {format(new Date(ticket.updated_at || ticket.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                                                    </div>
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Bottom Nav ── */}
                {hasMobileNav && (
                    <>
                        <div className="h-20" />
                        {isMotoboy  && <MotoboyBottomNav />}
                        {isMototaxi && <MototaxiBottomNav />}
                        {isDriver   && <DriverBottomNav />}
                    </>
                )}
            </div>
        </SupportErrorBoundary>
    );
}
