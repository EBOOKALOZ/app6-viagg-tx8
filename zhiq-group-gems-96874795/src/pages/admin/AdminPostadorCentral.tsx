import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Shield, Users, Search, Send, Activity, AlertTriangle, CheckCircle,
    Clock, XCircle, ExternalLink, TrendingUp, Zap, BarChart3,
    RefreshCw, Globe, Target, ShieldAlert, Eye, Inbox, History,
    ChevronDown, ChevronUp, Layers, Award, MapPin
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
    useAdminPostingData,
    type AdminGroup,
    type AdminOperator,
    type RegionHealth,
} from "@/hooks/useAdminPostingData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { visualStatusToDbFields } from "@/lib/groupStatusUtils";

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────
const daysSince = (d: string | null | undefined): number => {
    if (!d) return 999;
    return Math.ceil((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
};

const fmtDate = (d: string | null | undefined) => {
    if (!d) return "—";
    try { return format(new Date(d), "dd/MM/yy HH:mm", { locale: ptBR }); } catch { return "—"; }
};

const statusMap: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
    ativo: { label: "Válido", bg: "bg-emerald-500/10", text: "text-emerald-600", icon: <CheckCircle className="h-3 w-3" /> },
    em_analise: { label: "Pendente", bg: "bg-amber-500/10", text: "text-amber-600", icon: <Clock className="h-3 w-3" /> },
    bloqueado: { label: "Rejeitado", bg: "bg-red-500/10", text: "text-red-600", icon: <XCircle className="h-3 w-3" /> },
    inativo: { label: "Inativo", bg: "bg-gray-500/10", text: "text-gray-500", icon: <ShieldAlert className="h-3 w-3" /> },
    expirado: { label: "Expirado", bg: "bg-orange-500/10", text: "text-orange-600", icon: <AlertTriangle className="h-3 w-3" /> },
};

const healthColors: Record<string, string> = {
    healthy: "border-emerald-500/30 bg-emerald-500/5",
    attention: "border-amber-500/30 bg-amber-500/5",
    critical: "border-red-500/30 bg-red-500/5",
};

// ─────────────────────────────────────────────────────────
// KPI CARD
// ─────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color, sub }: {
    icon: React.ElementType; label: string; value: number | string; color: string; sub?: string;
}) {
    return (
        <Card className="bg-card border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("p-2.5 rounded-xl", color.replace("text-", "bg-").replace("600", "500/10").replace("500", "500/10"))}>
                    <Icon className={cn("h-5 w-5", color)} />
                </div>
                <div className="min-w-0">
                    <p className="text-2xl font-black text-foreground leading-none">{value}</p>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1">{label}</p>
                    {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
                </div>
            </CardContent>
        </Card>
    );
}

// ─────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
    return (
        <div className="flex flex-col items-center py-12 text-center">
            <div className="p-4 rounded-2xl bg-muted/30 mb-4">
                <Icon className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <p className="font-semibold text-muted-foreground">{title}</p>
            <p className="text-xs text-muted-foreground/70 mt-1 max-w-sm">{subtitle}</p>
        </div>
    );
}

// ─────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────
export default function AdminPostadorCentral() {
    const {
        groups, validGroups, pendingGroups, rejectedGroups, expiredGroups, atRiskGroups,
        queue, queuePending, logs, operators, activeOperators,
        regionHealth, kpis, alerts, isLoading, refetch,
    } = useAdminPostingData();

    // Filters
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [cityFilter, setCityFilter] = useState<string>("all");
    const [activeTab, setActiveTab] = useState("overview");

    // Cities for filter
    const cities = useMemo(() => {
        const set = new Set(groups.map(g => g.city_name).filter(Boolean));
        return [...set].sort();
    }, [groups]);

    // Filtered groups
    const filteredGroups = useMemo(() => {
        return groups.filter(g => {
            if (statusFilter !== "all" && g.status !== statusFilter) return false;
            if (cityFilter !== "all" && g.city_name !== cityFilter) return false;
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                return (
                    g.group_name?.toLowerCase().includes(term) ||
                    g.city_name?.toLowerCase().includes(term) ||
                    g.owner_name?.toLowerCase().includes(term) ||
                    g.group_link?.toLowerCase().includes(term)
                );
            }
            return true;
        });
    }, [groups, statusFilter, cityFilter, searchTerm]);

    // Actions
    const handleStatusChange = async (group: AdminGroup, newVisualStatus: string) => {
        try {
            const dbFields = visualStatusToDbFields(newVisualStatus as any);
            await (supabase.from("whatsapp_groups") as any)
                .update({
                    validation_status: dbFields.validation_status,
                    is_active: dbFields.is_active,
                    is_valid: dbFields.is_valid,
                    // valid_for_commission is handled by the backend trigger
                })
                .eq("id", group.id);
            toast.success(`Status atualizado para "${newVisualStatus}"`);
            refetch();
        } catch (err) {
            console.error("[AdminPostadorCentral] Error updating status:", err);
            toast.error("Erro ao atualizar status");
        }
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center py-20">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-auto bg-background">
            <div className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-6">

                {/* HEADER EXECUTIVO */}
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
                                    <Shield className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                    <h1 className="text-xl font-black text-foreground tracking-tight">Central do Postador</h1>
                                    <p className="text-xs text-muted-foreground">Gestão de grupos territoriais, campanhas locais e operação de engajamento</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] text-muted-foreground gap-1">
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Atualizado agora
                            </Badge>
                            <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-2">
                                <RefreshCw className="h-4 w-4" />
                                Atualizar
                            </Button>
                        </div>
                    </div>
                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="default" className="gap-1.5 text-xs font-bold" onClick={() => toast.info("Módulo de campanhas em preparação")}>
                            <Zap className="h-3.5 w-3.5" /> Criar Campanha
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs font-bold" onClick={() => { setStatusFilter("em_analise"); setActiveTab("groups"); }}>
                            <Eye className="h-3.5 w-3.5" /> Revisar Pendentes
                            {kpis.pendingGroups > 0 && <Badge variant="destructive" className="ml-1 h-4 px-1 text-[9px]">{kpis.pendingGroups}</Badge>}
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs font-bold" onClick={() => setActiveTab("queue")}>
                            <Inbox className="h-3.5 w-3.5" /> Abrir Fila
                            {kpis.queuePending > 0 && <Badge variant="destructive" className="ml-1 h-4 px-1 text-[9px]">{kpis.queuePending}</Badge>}
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs font-bold" onClick={() => setActiveTab("operators")}>
                            <Award className="h-3.5 w-3.5" /> Ver Operadores
                        </Button>
                    </div>
                </div>

                {/* ALERTS BANNER */}
                {alerts.length > 0 && (
                    <div className="space-y-2">
                        {alerts.slice(0, 3).map((alert, i) => (
                            <div key={i} className={cn(
                                "flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm",
                                alert.type === "danger" ? "bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-400"
                                    : alert.type === "warning" ? "bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-400"
                                        : "bg-blue-500/5 border-blue-500/20 text-blue-700 dark:text-blue-400"
                            )}>
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                <span className="font-medium">{alert.label}</span>
                                <Badge variant="secondary" className="ml-auto font-bold">{alert.count}</Badge>
                            </div>
                        ))}
                    </div>
                )}

                {/* TABS */}
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-6 h-10">
                        <TabsTrigger value="overview" className="text-xs font-bold gap-1.5">
                            <BarChart3 className="h-3.5 w-3.5" /> Visão Geral
                        </TabsTrigger>
                        <TabsTrigger value="groups" className="text-xs font-bold gap-1.5">
                            <Users className="h-3.5 w-3.5" /> Grupos
                        </TabsTrigger>
                        <TabsTrigger value="queue" className="text-xs font-bold gap-1.5">
                            <Inbox className="h-3.5 w-3.5" /> Fila
                        </TabsTrigger>
                        <TabsTrigger value="operators" className="text-xs font-bold gap-1.5">
                            <Award className="h-3.5 w-3.5" /> Operadores
                        </TabsTrigger>
                        <TabsTrigger value="health" className="text-xs font-bold gap-1.5">
                            <Activity className="h-3.5 w-3.5" /> Saúde
                        </TabsTrigger>
                        <TabsTrigger value="logs" className="text-xs font-bold gap-1.5">
                            <History className="h-3.5 w-3.5" /> Logs
                        </TabsTrigger>
                    </TabsList>

                    {/* ═══════════════════════════════════════════════════
              TAB 1: VISÃO GERAL EXECUTIVA
             ═══════════════════════════════════════════════════ */}
                    <TabsContent value="overview" className="mt-6 space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
                            <KpiCard icon={Layers} label="Grupos Totais" value={kpis.totalGroups} color="text-blue-600" />
                            <KpiCard icon={CheckCircle} label="Válidos" value={kpis.validGroups} color="text-emerald-600" />
                            <KpiCard icon={Clock} label="Pendentes" value={kpis.pendingGroups} color="text-amber-600" />
                            <KpiCard icon={XCircle} label="Rejeitados" value={kpis.rejectedGroups} color="text-red-600" />
                            <KpiCard icon={AlertTriangle} label="Em Risco" value={kpis.atRiskGroups} color="text-orange-600" sub=">20 dias sem postagem" />
                            <KpiCard icon={ShieldAlert} label="Expirados" value={kpis.expiredGroups} color="text-gray-500" sub=">30 dias sem postagem" />
                            <KpiCard icon={Send} label="Fila Pendente" value={kpis.queuePending} color="text-indigo-600" />
                            <KpiCard icon={Award} label="Operadores" value={kpis.activeOperators} color="text-violet-600" />
                            <KpiCard icon={Globe} label="Regiões" value={kpis.regionsCount} color="text-teal-600" />
                            <KpiCard icon={Zap} label="Campanhas" value={kpis.activeCampaigns} color="text-pink-600" />
                        </div>

                        {/* Quick Region Health */}
                        {regionHealth.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-primary" /> Saúde por Região
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {regionHealth.slice(0, 6).map(region => (
                                        <Card key={region.city} className={cn("border shadow-sm", healthColors[region.health])}>
                                            <CardContent className="p-4">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="font-bold text-sm">{region.city}</h4>
                                                    <Badge variant="outline" className={cn(
                                                        "text-[10px] font-bold uppercase",
                                                        region.health === "healthy" ? "border-emerald-500 text-emerald-600"
                                                            : region.health === "attention" ? "border-amber-500 text-amber-600"
                                                                : "border-red-500 text-red-600"
                                                    )}>
                                                        {region.health === "healthy" ? "Saudável" : region.health === "attention" ? "Atenção" : "Crítico"}
                                                    </Badge>
                                                </div>
                                                <div className="grid grid-cols-4 gap-2 text-center">
                                                    <div>
                                                        <p className="text-lg font-black">{region.total_groups}</p>
                                                        <p className="text-[9px] text-muted-foreground uppercase">Total</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-lg font-black text-emerald-600">{region.valid_groups}</p>
                                                        <p className="text-[9px] text-muted-foreground uppercase">Válidos</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-lg font-black text-amber-600">{region.pending_groups}</p>
                                                        <p className="text-[9px] text-muted-foreground uppercase">Pending</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-lg font-black text-orange-600">{region.at_risk}</p>
                                                        <p className="text-[9px] text-muted-foreground uppercase">Risco</p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    {/* ═══════════════════════════════════════════════════
              TAB 2: GESTÃO DE GRUPOS
             ═══════════════════════════════════════════════════ */}
                    <TabsContent value="groups" className="mt-6 space-y-4">
                        {/* Filters */}
                        <div className="flex flex-col md:flex-row gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    placeholder="Buscar por nome, cidade, motoboy ou link..."
                                    className="pl-10"
                                />
                            </div>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos os Status</SelectItem>
                                    <SelectItem value="ativo">✅ Válidos</SelectItem>
                                    <SelectItem value="em_analise">⏳ Pendentes</SelectItem>
                                    <SelectItem value="bloqueado">❌ Rejeitados</SelectItem>
                                    <SelectItem value="inativo">⚪ Inativos</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={cityFilter} onValueChange={setCityFilter}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Cidade" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas as Cidades</SelectItem>
                                    {cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Results count */}
                        <p className="text-xs text-muted-foreground">
                            Mostrando <span className="font-bold text-foreground">{filteredGroups.length}</span> de {groups.length} grupos
                        </p>

                        {/* Table */}
                        {filteredGroups.length === 0 ? (
                            <EmptyState icon={Users} title="Nenhum grupo encontrado" subtitle="Tente ajustar os filtros de busca." />
                        ) : (
                            <div className="border rounded-xl overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-muted/50 border-b">
                                                <th className="text-left p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Grupo</th>
                                                <th className="text-left p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Cidade</th>
                                                <th className="text-center p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Status</th>
                                                <th className="text-center p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Membros</th>
                                                <th className="text-center p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Comissão</th>
                                                <th className="text-left p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Últ. Postagem</th>
                                                <th className="text-left p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Motoboy</th>
                                                <th className="text-center p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {filteredGroups.slice(0, 50).map(group => {
                                                const sc = statusMap[group.status] || statusMap["em_analise"];
                                                const daysInactive = daysSince(group.last_posted_at);
                                                const isAtRisk = daysInactive > 20 && daysInactive <= 30;
                                                const isExpired = daysInactive > 30 && daysInactive !== 999;

                                                return (
                                                    <tr key={group.id} className="hover:bg-muted/30 transition-colors">
                                                        <td className="p-3">
                                                            <div className="flex items-center gap-2">
                                                                <p className="font-semibold text-foreground truncate max-w-[200px]">{group.group_name || group.city_name}</p>
                                                                {group.group_link && (
                                                                    <a href={group.group_link} target="_blank" rel="noopener noreferrer" className="text-primary/50 hover:text-primary">
                                                                        <ExternalLink className="h-3 w-3" />
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-muted-foreground">{group.city_name}</td>
                                                        <td className="p-3 text-center">
                                                            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold", sc.bg, sc.text)}>
                                                                {sc.icon} {sc.label}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <span className={cn("font-bold", group.min_members_valid ? "text-emerald-600" : "text-red-500")}>
                                                                {group.members_count}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            {group.valid_for_commission ? (
                                                                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-bold">✓ Válido</Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="text-[10px] text-muted-foreground">—</Badge>
                                                            )}
                                                        </td>
                                                        <td className="p-3">
                                                            <span className={cn(
                                                                "text-xs font-medium",
                                                                isAtRisk ? "text-orange-600" : isExpired ? "text-red-500" : "text-muted-foreground"
                                                            )}>
                                                                {daysInactive === 999 ? "Nunca" : `${daysInactive}d atrás`}
                                                            </span>
                                                        </td>
                                                        <td className="p-3">
                                                            <span className="text-xs text-muted-foreground truncate max-w-[120px] block">
                                                                {group.owner_name || "—"}
                                                            </span>
                                                        </td>
                                                        <td className="p-3">
                                                            <div className="flex items-center justify-center gap-1">
                                                                {group.status === "em_analise" && (
                                                                    <>
                                                                        <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-600 hover:bg-emerald-500/10"
                                                                            onClick={() => handleStatusChange(group, "ativo")}>
                                                                            <CheckCircle className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                        <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:bg-red-500/10"
                                                                            onClick={() => handleStatusChange(group, "bloqueado")}>
                                                                            <XCircle className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                    </>
                                                                )}
                                                                {group.status === "ativo" && (
                                                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-orange-500 hover:bg-orange-500/10"
                                                                        onClick={() => handleStatusChange(group, "inativo")}>
                                                                        <ShieldAlert className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                )}
                                                                {(group.status === "bloqueado" || group.status === "inativo") && (
                                                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-blue-500 hover:bg-blue-500/10"
                                                                        onClick={() => handleStatusChange(group, "em_analise")}>
                                                                        <Eye className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    {/* ═══════════════════════════════════════════════════
              TAB 3: FILA DE POSTAGEM / CAMPANHAS
             ═══════════════════════════════════════════════════ */}
                    <TabsContent value="queue" className="mt-6 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                            <KpiCard icon={Inbox} label="Na Fila" value={queuePending.length} color="text-indigo-600" />
                            <KpiCard icon={Send} label="Executados" value={queue.filter(q => q.status === "executed" || q.status === "postado").length} color="text-emerald-600" />
                            <KpiCard icon={Zap} label="Campanhas Ativas" value={kpis.activeCampaigns} color="text-pink-600" />
                        </div>

                        {queue.length === 0 ? (
                            <EmptyState
                                icon={Inbox}
                                title="Fila de postagens vazia"
                                subtitle="As campanhas criadas aparecerão aqui quando estiverem na fila de execução. Crie campanhas pelo módulo de Marketing para começar."
                            />
                        ) : (
                            <div className="border rounded-xl overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-muted/50 border-b">
                                                <th className="text-left p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Campanha</th>
                                                <th className="text-left p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Cidade</th>
                                                <th className="text-center p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Status</th>
                                                <th className="text-left p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Agendado</th>
                                                <th className="text-left p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Postado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {queue.slice(0, 30).map(item => (
                                                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                                                    <td className="p-3 font-medium">{item.title || '—'}</td>
                                                    <td className="p-3 text-muted-foreground">{item.target_city || item.target_region || '—'}</td>
                                                    <td className="p-3 text-center">
                                                        <Badge variant="outline" className="text-[10px]">
                                                            {item.status}
                                                        </Badge>
                                                    </td>
                                                    <td className="p-3 text-xs text-muted-foreground">{fmtDate(item.scheduled_for)}</td>
                                                    <td className="p-3 text-xs text-muted-foreground">{fmtDate(item.posted_at)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    {/* ═══════════════════════════════════════════════════
              TAB 4: OPERADORES / POSTADORES
             ═══════════════════════════════════════════════════ */}
                    <TabsContent value="operators" className="mt-6 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                            <KpiCard icon={Users} label="Total Operadores" value={operators.length} color="text-violet-600" />
                            <KpiCard icon={Award} label="Com Grupos Ativos" value={activeOperators.length} color="text-emerald-600" />
                            <KpiCard icon={TrendingUp} label="Postagens Total" value={operators.reduce((s, o) => s + o.postings_count, 0)} color="text-blue-600" />
                        </div>

                        {operators.length === 0 ? (
                            <EmptyState
                                icon={Award}
                                title="Nenhum operador encontrado"
                                subtitle="Operadores são motoboys com grupos ativos ou postagens confirmadas. Eles aparecerão aqui automaticamente ao vincular grupos."
                            />
                        ) : (
                            <div className="border rounded-xl overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-muted/50 border-b">
                                                <th className="text-left p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Operador</th>
                                                <th className="text-left p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Cidade</th>
                                                <th className="text-center p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Grupos</th>
                                                <th className="text-center p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Postagens</th>
                                                <th className="text-center p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Ranking</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {[...operators]
                                                .sort((a, b) => (b.groups_count + b.postings_count) - (a.groups_count + a.postings_count))
                                                .slice(0, 30)
                                                .map((op, idx) => (
                                                    <tr key={op.id} className="hover:bg-muted/30 transition-colors">
                                                        <td className="p-3">
                                                            <div>
                                                                <p className="font-semibold">{op.name}</p>
                                                                <p className="text-[10px] text-muted-foreground">{op.email}</p>
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-muted-foreground">{op.city || "—"}</td>
                                                        <td className="p-3 text-center font-bold">{op.groups_count}</td>
                                                        <td className="p-3 text-center font-bold">{op.postings_count}</td>
                                                        <td className="p-3 text-center">
                                                            {idx < 3 ? (
                                                                <span className="text-lg">{["🥇", "🥈", "🥉"][idx]}</span>
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    {/* ═══════════════════════════════════════════════════
              TAB 5: SAÚDE OPERACIONAL
             ═══════════════════════════════════════════════════ */}
                    <TabsContent value="health" className="mt-6 space-y-6">
                        {/* Risk groups */}
                        {atRiskGroups.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-orange-600 mb-3 flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4" /> Grupos em Risco ({atRiskGroups.length})
                                    <span className="text-[10px] text-muted-foreground font-normal">20-30 dias sem postagem</span>
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {atRiskGroups.map(g => (
                                        <Card key={g.id} className="border-orange-500/20 bg-orange-500/5">
                                            <CardContent className="p-4 flex items-center justify-between">
                                                <div>
                                                    <p className="font-bold text-sm">{g.group_name || g.city_name}</p>
                                                    <p className="text-xs text-muted-foreground">{g.owner_name} • {daysSince(g.last_posted_at)} dias inativo</p>
                                                </div>
                                                <Badge className="bg-orange-500/20 text-orange-700 border-orange-500/30 font-bold">⚠ Risco</Badge>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Expired groups */}
                        {expiredGroups.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-red-600 mb-3 flex items-center gap-2">
                                    <XCircle className="h-4 w-4" /> Grupos Expirados ({expiredGroups.length})
                                    <span className="text-[10px] text-muted-foreground font-normal">30+ dias sem postagem</span>
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {expiredGroups.map(g => (
                                        <Card key={g.id} className="border-red-500/20 bg-red-500/5">
                                            <CardContent className="p-4 flex items-center justify-between">
                                                <div>
                                                    <p className="font-bold text-sm">{g.group_name || g.city_name}</p>
                                                    <p className="text-xs text-muted-foreground">{g.owner_name} • {daysSince(g.last_posted_at)} dias</p>
                                                </div>
                                                <Badge className="bg-red-500/20 text-red-700 border-red-500/30 font-bold">Expirado</Badge>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Region health cards */}
                        <div>
                            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                                <Globe className="h-4 w-4 text-primary" /> Saúde Regional Completa
                            </h3>
                            {regionHealth.length === 0 ? (
                                <EmptyState icon={Globe} title="Sem dados regionais" subtitle="Grupos cadastrados aparecerão aqui agrupados por cidade." />
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {regionHealth.map(region => (
                                        <Card key={region.city} className={cn("border shadow-sm", healthColors[region.health])}>
                                            <CardContent className="p-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <h4 className="font-bold text-sm">{region.city}</h4>
                                                    <Badge variant="outline" className={cn(
                                                        "text-[10px] font-bold uppercase",
                                                        region.health === "healthy" ? "border-emerald-500 text-emerald-600"
                                                            : region.health === "attention" ? "border-amber-500 text-amber-600"
                                                                : "border-red-500 text-red-600"
                                                    )}>
                                                        {region.health === "healthy" ? "✓ Saudável" : region.health === "attention" ? "⚡ Atenção" : "🚨 Crítico"}
                                                    </Badge>
                                                </div>
                                                <div className="grid grid-cols-5 gap-1 text-center">
                                                    <div>
                                                        <p className="text-base font-black">{region.total_groups}</p>
                                                        <p className="text-[8px] text-muted-foreground uppercase">Total</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-base font-black text-emerald-600">{region.valid_groups}</p>
                                                        <p className="text-[8px] text-muted-foreground uppercase">Válidos</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-base font-black text-amber-600">{region.pending_groups}</p>
                                                        <p className="text-[8px] text-muted-foreground uppercase">Pend.</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-base font-black text-orange-600">{region.at_risk}</p>
                                                        <p className="text-[8px] text-muted-foreground uppercase">Risco</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-base font-black text-violet-600">{region.operators}</p>
                                                        <p className="text-[8px] text-muted-foreground uppercase">Ops</p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* No issues state */}
                        {atRiskGroups.length === 0 && expiredGroups.length === 0 && (
                            <div className="flex flex-col items-center py-8 text-center">
                                <div className="p-4 rounded-2xl bg-emerald-500/10 mb-4">
                                    <CheckCircle className="h-10 w-10 text-emerald-500" />
                                </div>
                                <p className="font-bold text-emerald-600">Saúde Operacional OK</p>
                                <p className="text-xs text-muted-foreground mt-1">Nenhum grupo em risco ou expirado.</p>
                            </div>
                        )}
                    </TabsContent>

                    {/* ═══════════════════════════════════════════════════
              TAB 6: HISTÓRICO / LOGS
             ═══════════════════════════════════════════════════ */}
                    <TabsContent value="logs" className="mt-6 space-y-4">
                        {logs.length === 0 ? (
                            <EmptyState
                                icon={History}
                                title="Histórico vazio"
                                subtitle="Postagens confirmadas, aprovações e mudanças de status aparecerão aqui à medida que o ecossistema evolui."
                            />
                        ) : (
                            <div className="border rounded-xl overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-muted/50 border-b">
                                                <th className="text-left p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Data</th>
                                                <th className="text-left p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Campanha</th>
                                                <th className="text-left p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Tipo</th>
                                                <th className="text-left p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Cidade</th>
                                                <th className="text-center p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Transição</th>
                                                <th className="text-left p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Operador</th>
                                                <th className="text-left p-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Notas</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {logs.slice(0, 50).map(log => {
                                                const isSuccess = log.final_status === "posted" || log.final_status === "postado";
                                                const isFail = log.final_status === "failed" || log.final_status === "erro";
                                                return (
                                                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                                                        <td className="p-3 text-xs font-medium whitespace-nowrap">{fmtDate(log.posted_at)}</td>
                                                        <td className="p-3 font-medium truncate max-w-[180px]">{log.title || "—"}</td>
                                                        <td className="p-3">
                                                            <Badge variant="outline" className="text-[10px]">{log.campaign_type || "—"}</Badge>
                                                        </td>
                                                        <td className="p-3 text-xs text-muted-foreground">{log.target_city || log.target_region || "—"}</td>
                                                        <td className="p-3 text-center whitespace-nowrap">
                                                            <span className="inline-flex items-center gap-1">
                                                                {log.queue_status_before && (
                                                                    <>
                                                                        <Badge variant="outline" className="text-[10px]">{log.queue_status_before}</Badge>
                                                                        <span className="text-muted-foreground text-[10px]">→</span>
                                                                    </>
                                                                )}
                                                                <Badge
                                                                    variant={isSuccess ? "default" : "outline"}
                                                                    className={cn(
                                                                        "text-[10px]",
                                                                        isSuccess && "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
                                                                        isFail && "bg-red-500/10 text-red-600 border-red-500/30"
                                                                    )}
                                                                >
                                                                    {log.final_status}
                                                                </Badge>
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-xs text-muted-foreground">{log.operator_user_id?.substring(0, 8) || "—"}</td>
                                                        <td className="p-3 text-xs text-muted-foreground truncate max-w-[160px]">
                                                            {log.error_message || log.execution_notes || "—"}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
