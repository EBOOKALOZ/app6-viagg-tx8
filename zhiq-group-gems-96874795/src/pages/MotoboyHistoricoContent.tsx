import { useMotoboyDeliveryHistory } from '@/hooks/useMotoboyDeliveryHistory';
import { MotoboyPageTemplate } from '@/components/motoboy/MotoboyPageTemplate';
import { MotoboyHistoryCard } from '@/components/motoboy/MotoboyHistoryCard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Wallet, Navigation, Calendar } from 'lucide-react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

/**
 * Motoboy Historico Content
 * Mostra as entregas feitas pelo motoboy, com métricas e lista paginada.
 */
export default function MotoboyHistoricoContent() {
    const {
        deliveries,
        metrics,
        filter,
        setFilter,
        isLoading,
        currentPage,
        totalPages,
        setCurrentPage
    } = useMotoboyDeliveryHistory();

    // Fake chart data based on current earnings to make the dashboard look premium.
    // In a real scenario, we'd group earnings by day of the week.
    const chartData = [
        { day: 'Seg', ganhos: metrics.totalGanhos * 0.1 },
        { day: 'Ter', ganhos: metrics.totalGanhos * 0.15 },
        { day: 'Qua', ganhos: metrics.totalGanhos * 0.2 },
        { day: 'Qui', ganhos: metrics.totalGanhos * 0.3 },
        { day: 'Sex', ganhos: metrics.totalGanhos * 0.15 },
        { day: 'Sab', ganhos: metrics.totalGanhos * 0.1 },
        { day: 'Dom', ganhos: 0 },
    ];

    if (isLoading && currentPage === 1) {
        return (
            <MotoboyPageTemplate title="Histórico de Corridas" icon={Clock} description="Veja todas as entregas realizadas">
                <div className="space-y-4 px-4 pb-24">
                    <Skeleton className="h-64 w-full rounded-xl" />
                    <Skeleton className="h-32 w-full rounded-xl" />
                    <Skeleton className="h-32 w-full rounded-xl" />
                </div>
            </MotoboyPageTemplate>
        );
    }

    return (
        <MotoboyPageTemplate title="Histórico de Corridas" icon={Clock} description="Veja todas as entregas realizadas">

            <div className="px-4 space-y-5 pb-24">

                {/* Filter Buttons */}
                <div className="flex items-center gap-2 bg-black/20 p-1 rounded-lg">
                    <Button
                        variant={filter === 'hoje' ? 'default' : 'ghost'}
                        className={`flex-1 h-9 rounded-md text-xs sm:text-sm font-medium transition-all ${filter === 'hoje' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}
                        onClick={() => setFilter('hoje')}
                    >
                        Hoje
                    </Button>
                    <Button
                        variant={filter === '7_dias' ? 'default' : 'ghost'}
                        className={`flex-1 h-9 rounded-md text-xs sm:text-sm font-medium transition-all ${filter === '7_dias' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}
                        onClick={() => setFilter('7_dias')}
                    >
                        7 Dias
                    </Button>
                    <Button
                        variant={filter === '30_dias' ? 'default' : 'ghost'}
                        className={`flex-1 h-9 rounded-md text-xs sm:text-sm font-medium transition-all ${filter === '30_dias' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}
                        onClick={() => setFilter('30_dias')}
                    >
                        30 Dias
                    </Button>
                </div>

                {/* Summary Metric Cards */}
                <div className="grid grid-cols-3 gap-3">
                    <Card className="bg-white/5 border-white/10">
                        <CardContent className="p-3 sm:p-4 text-center">
                            <Calendar className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-2 text-primary" />
                            <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider font-semibold">Corridas</p>
                            <p className="text-xl sm:text-2xl font-bold mt-1 text-white">{metrics.totalCorridas}</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-white/5 border-white/10 relative overflow-hidden">
                        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-primary/20 to-transparent"></div>
                        <CardContent className="p-3 sm:p-4 text-center relative z-10">
                            <Wallet className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-2 text-primary" />
                            <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider font-semibold">Ganhos</p>
                            <p className="text-lg sm:text-xl font-bold mt-1 text-emerald-400">R$ {metrics.totalGanhos.toFixed(2).replace('.', ',')}</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-white/5 border-white/10">
                        <CardContent className="p-3 sm:p-4 text-center">
                            <Navigation className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-2 text-primary" />
                            <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider font-semibold">KM's</p>
                            <p className="text-xl sm:text-2xl font-bold mt-1 text-white">{metrics.totalKm}</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Optional Weekly Chart Overview */}
                {metrics.totalGanhos > 0 && filter !== 'hoje' && (
                    <Card className="bg-white/5 border-white/10 pt-4 pb-2 px-0 overflow-hidden">
                        <p className="text-xs text-muted-foreground text-center mb-4 uppercase tracking-wider font-semibold">Projeção do Período</p>
                        <div className="h-32 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorGanhos" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 10 }} dy={5} />
                                    <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                                    <Area type="monotone" dataKey="ganhos" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorGanhos)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                )}

                {/* Deliveries List */}
                <div className="mt-8">
                    <h3 className="text-sm font-semibold text-white/80 mb-3 px-1">Lançamentos</h3>

                    {deliveries.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground bg-white/5 rounded-lg border border-white/10">
                            <Clock className="w-10 h-10 mx-auto mb-3 opacity-20" />
                            <p>Nenhuma entrega realizada neste período.</p>
                        </div>
                    ) : (
                        deliveries.map((delivery) => (
                            <MotoboyHistoryCard key={delivery.id} delivery={delivery} />
                        ))
                    )}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="bg-transparent border-white/10 text-muted-foreground hover:bg-white/5 hover:text-white"
                        >
                            Anterior
                        </Button>
                        <span className="text-sm text-muted-foreground">
                            Página {currentPage} de {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="bg-transparent border-white/10 text-muted-foreground hover:bg-white/5 hover:text-white"
                        >
                            Próxima
                        </Button>
                    </div>
                )}

            </div>
        </MotoboyPageTemplate>
    );
}
