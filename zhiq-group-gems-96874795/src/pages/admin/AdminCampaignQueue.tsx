import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Search, Clock, CheckCircle, XCircle, AlertTriangle,
    RefreshCw, Inbox, Eye, Play, Pause, Plus, ExternalLink,
    Layers, Loader2, Star, Megaphone,
    Store, User, Filter, ImageOff,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════
interface CampaignItem {
    id: string;
    created_by_user_id: string | null;
    operator_user_id: string | null;
    whatsapp_group_id: string | null;
    merchant_store_id: string | null;
    source_type: string | null;
    source_id: string | null;
    campaign_type: string | null;
    title: string | null;
    message_text: string | null;
    media_url: string | null;
    external_link: string | null;
    cta_label: string | null;
    price_label: string | null;
    target_city: string | null;
    target_region: string | null;
    scheduled_for: string | null;
    available_from: string | null;
    available_until: string | null;
    status: string;
    priority: number;
    execution_notes: string | null;
    reviewed_by_user_id: string | null;
    reviewed_at: string | null;
    posted_at: string | null;
    created_at: string;
    updated_at: string | null;
    clicks_count: number;
    conversions_count: number;
    starts_at: string | null;
    ends_at: string | null;
    is_ready_now?: boolean;
    is_expired?: boolean;
    has_image?: boolean;
    has_link?: boolean;
    operational_bucket?: string;
    group_name?: string;
    group_city?: string;
    creator_name?: string;
    operator_name?: string;
    store_name?: string;
}

interface DashboardKPIs {
    total: number; pending: number; ready: number; processing: number;
    posted: number; failed: number; review: number; expired: number;
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
const fmtDate = (d: string | null | undefined) => {
    if (!d) return "—";
    try { return format(new Date(d), "dd/MM/yy HH:mm", { locale: ptBR }); } catch { return "—"; }
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; dot: string; icon: React.ReactNode }> = {
    pending: { label: "Pendente", color: "text-amber-600", bg: "bg-amber-500/10", dot: "bg-amber-500", icon: <Clock className="h-3 w-3" /> },
    ready: { label: "Pronto", color: "text-blue-600", bg: "bg-blue-500/10", dot: "bg-blue-500", icon: <Play className="h-3 w-3" /> },
    processing: { label: "Executando", color: "text-indigo-600", bg: "bg-indigo-500/10", dot: "bg-indigo-500", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    posted: { label: "Postado", color: "text-emerald-600", bg: "bg-emerald-500/10", dot: "bg-emerald-500", icon: <CheckCircle className="h-3 w-3" /> },
    failed: { label: "Falha", color: "text-red-600", bg: "bg-red-500/10", dot: "bg-red-500", icon: <XCircle className="h-3 w-3" /> },
    review: { label: "Revisão", color: "text-purple-600", bg: "bg-purple-500/10", dot: "bg-purple-500", icon: <Eye className="h-3 w-3" /> },
    cancelled: { label: "Cancelado", color: "text-gray-500", bg: "bg-gray-500/10", dot: "bg-gray-400", icon: <Pause className="h-3 w-3" /> },
    expired: { label: "Expirado", color: "text-orange-600", bg: "bg-orange-500/10", dot: "bg-orange-500", icon: <AlertTriangle className="h-3 w-3" /> },
};

const PRIORITY_CFG: Record<number, { label: string; color: string; bg: string }> = {
    1: { label: "Baixa", color: "text-gray-500", bg: "bg-gray-500/10" },
    2: { label: "Normal", color: "text-blue-600", bg: "bg-blue-500/10" },
    3: { label: "Alta", color: "text-orange-600", bg: "bg-orange-500/10" },
    4: { label: "Urgente", color: "text-red-600", bg: "bg-red-500/10" },
    5: { label: "Crítica", color: "text-red-700", bg: "bg-red-700/10" },
};

const StatusBadge = ({ status }: { status: string }) => {
    const sc = STATUS_CFG[status] || STATUS_CFG.pending;
    return (
        <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider", sc.bg, sc.color)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} /> {sc.label}
        </span>
    );
};

const PriorityBadge = ({ priority }: { priority: number }) => {
    const pr = PRIORITY_CFG[priority] || PRIORITY_CFG[2];
    return (
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold", pr.bg, pr.color)}>
            {priority >= 4 && <Star className="h-2.5 w-2.5" />} P{priority} {pr.label}
        </span>
    );
};

// ═══════════════════════════════════════════════════════════
// KPI CARD
// ═══════════════════════════════════════════════════════════
function KpiCard({ icon: Icon, label, value, color, active, onClick }: {
    icon: React.ElementType; label: string; value: number; color: string; active?: boolean; onClick?: () => void;
}) {
    return (
        <Card
            className={cn(
                "bg-card border shadow-sm transition-all cursor-pointer hover:shadow-md hover:scale-[1.02]",
                active && "ring-2 ring-primary shadow-md scale-[1.02]"
            )}
            onClick={onClick}
        >
            <CardContent className="p-3 flex items-center gap-3">
                <div className={cn("p-2 rounded-xl", color.replace("text-", "bg-").replace("600", "500/15").replace("700", "700/15"))}>
                    <Icon className={cn("h-4 w-4", color)} />
                </div>
                <div>
                    <p className="text-xl font-black text-foreground leading-none">{value}</p>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">{label}</p>
                </div>
            </CardContent>
        </Card>
    );
}

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════
export default function AdminCampaignQueue() {
    const { user } = useAuth();
    const qc = useQueryClient();

    // ── State ──
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [cityFilter, setCityFilter] = useState<string>("all");
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [priorityFilter, setPriorityFilter] = useState<string>("all");
    const [imageFilter, setImageFilter] = useState<string>("all");
    const [linkFilter, setLinkFilter] = useState<string>("all");
    const [expiredFilter, setExpiredFilter] = useState<string>("all");
    const [sourceFilter, setSourceFilter] = useState<string>("all");
    const [selectedItem, setSelectedItem] = useState<CampaignItem | null>(null);
    const [confirmAction, setConfirmAction] = useState<{ action: string; id: string; label: string } | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newMessage, setNewMessage] = useState("");
    const [newType, setNewType] = useState("promotional");
    const [newCity, setNewCity] = useState("");
    const [newRegion, setNewRegion] = useState("");
    const [newMediaUrl, setNewMediaUrl] = useState("");
    const [newPriority, setNewPriority] = useState("2");

    // ── QUERIES ──
    const { data: dashboard } = useQuery({
        queryKey: ["campaign-queue-dashboard"],
        queryFn: async (): Promise<DashboardKPIs> => {
            try {
                const { data, error } = await (supabase.rpc as any)("get_campaign_queue_dashboard");
                if (error) throw error;
                if (data?.length > 0) return data[0];
            } catch { /* fallback */ }
            return { total: 0, pending: 0, ready: 0, processing: 0, posted: 0, failed: 0, review: 0, expired: 0 };
        },
        refetchInterval: 15_000,
    });

    const { data: items = [], isLoading, refetch } = useQuery({
        queryKey: ["campaign-queue-items"],
        queryFn: async (): Promise<CampaignItem[]> => {
            let result;
            try {
                result = await (supabase.from as any)("admin_campaign_queue_view")
                    .select("*").order("priority", { ascending: false }).order("created_at", { ascending: false }).limit(300);
            } catch {
                result = await (supabase.from as any)("campaign_queue")
                    .select("*").order("priority", { ascending: false }).order("created_at", { ascending: false }).limit(300);
            }
            if (result.error) { console.error("[CentralCampanhas]", result.error); return []; }
            return result.data || [];
        },
        refetchInterval: 15_000,
    });

    const kpis = dashboard || { total: 0, pending: 0, ready: 0, processing: 0, posted: 0, failed: 0, review: 0, expired: 0 };
    const cancelledCount = items.filter(i => i.status === "cancelled").length;

    // ── Derived filters ──
    const cities = useMemo(() => [...new Set(items.map(i => i.target_city).filter(Boolean) as string[])].sort(), [items]);
    const types = useMemo(() => [...new Set(items.map(i => i.campaign_type).filter(Boolean) as string[])].sort(), [items]);

    const filtered = useMemo(() => items.filter(item => {
        if (statusFilter !== "all" && item.status !== statusFilter) return false;
        if (cityFilter !== "all" && item.target_city !== cityFilter) return false;
        if (typeFilter !== "all" && item.campaign_type !== typeFilter) return false;
        if (priorityFilter !== "all" && String(item.priority) !== priorityFilter) return false;
        if (imageFilter === "yes" && !item.has_image) return false;
        if (imageFilter === "no" && item.has_image) return false;
        if (linkFilter === "yes" && !item.has_link) return false;
        if (linkFilter === "no" && item.has_link) return false;
        if (expiredFilter === "yes" && !item.is_expired) return false;
        if (sourceFilter !== "all" && item.source_type !== sourceFilter) return false;
        if (search) {
            const t = search.toLowerCase();
            return [item.title, item.message_text, item.target_city, item.target_region, item.store_name, item.creator_name]
                .some(f => f?.toLowerCase().includes(t));
        }
        return true;
    }), [items, statusFilter, cityFilter, typeFilter, priorityFilter, imageFilter, linkFilter, expiredFilter, sourceFilter, search]);

    // ── RPC ACTIONS (official) ──
    const executeAction = async (action: string, id: string) => {
        setActionLoading(true);
        try {
            const rpcMap: Record<string, { fn: string; params: Record<string, any> }> = {
                approve: { fn: "approve_campaign_queue_item", params: { p_campaign_id: id } },
                process: { fn: "process_campaign_queue_item", params: { p_campaign_id: id, p_operator_user_id: user?.id } },
                posted: { fn: "mark_campaign_queue_posted", params: { p_campaign_id: id, p_execution_notes: "Confirmado via Central Admin" } },
                failed: { fn: "mark_campaign_queue_failed", params: { p_campaign_id: id, p_execution_notes: "Marcado como falha via Central Admin" } },
                review: { fn: "review_campaign_queue_item", params: { p_campaign_id: id, p_reviewed_by_user_id: user?.id } },
                cancel: { fn: "cancel_campaign_queue_item", params: { p_campaign_id: id, p_execution_notes: "Cancelado via Central Admin" } },
                retry: { fn: "retry_campaign_queue_item", params: { p_campaign_id: id } },
            };
            const rpc = rpcMap[action];
            if (!rpc) throw new Error("Ação desconhecida");
            const { error } = await (supabase.rpc as any)(rpc.fn, rpc.params);
            if (error) throw error;
            toast.success("Ação executada com sucesso");
            refetch();
            qc.invalidateQueries({ queryKey: ["campaign-queue-dashboard"] });
            setSelectedItem(null);
        } catch (err: any) {
            toast.error(err?.message || "Erro ao executar ação");
        } finally { setActionLoading(false); setConfirmAction(null); }
    };

    // ── CREATE ──
    const handleCreate = async () => {
        if (!newTitle.trim()) { toast.error("Título obrigatório"); return; }
        setActionLoading(true);
        try {
            const { error } = await (supabase.rpc as any)("create_campaign_queue_item", {
                p_title: newTitle.trim(), p_message_text: newMessage.trim() || null,
                p_campaign_type: newType, p_target_city: newCity.trim() || null,
                p_target_region: newRegion.trim() || null, p_media_url: newMediaUrl.trim() || null,
                p_priority: parseInt(newPriority), p_created_by_user_id: user?.id,
            });
            if (error) throw error;
            toast.success("Campanha criada");
            setShowCreate(false);
            setNewTitle(""); setNewMessage(""); setNewCity(""); setNewRegion(""); setNewMediaUrl("");
            refetch(); qc.invalidateQueries({ queryKey: ["campaign-queue-dashboard"] });
        } catch (err: any) { toast.error(err?.message || "Erro ao criar"); }
        finally { setActionLoading(false); }
    };

    const clearFilters = () => {
        setStatusFilter("all"); setCityFilter("all"); setTypeFilter("all");
        setPriorityFilter("all"); setImageFilter("all"); setLinkFilter("all");
        setExpiredFilter("all"); setSourceFilter("all"); setSearch("");
    };

    const hasActiveFilters = statusFilter !== "all" || cityFilter !== "all" || typeFilter !== "all" ||
        priorityFilter !== "all" || imageFilter !== "all" || linkFilter !== "all" || expiredFilter !== "all" ||
        sourceFilter !== "all" || search !== "";

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center py-20">
                <div className="text-center space-y-3">
                    <div className="h-10 w-10 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="text-sm text-muted-foreground font-medium">Carregando Central de Campanhas...</p>
                </div>
            </div>
        );
    }

    // ── Action buttons helper ──
    const ActionBtns = ({ item, variant = "table" }: { item: CampaignItem; variant?: "table" | "drawer" }) => {
        const isDrawer = variant === "drawer";
        const sz = isDrawer ? "sm" : "sm";
        const cls = isDrawer ? "gap-1.5 text-xs font-bold" : "h-7 px-2";
        const acts: { key: string; label: string; icon: React.ReactNode; color: string; show: boolean }[] = [
            { key: "approve", label: "Aprovar", icon: <Play className="h-3.5 w-3.5" />, color: "text-blue-600 hover:bg-blue-500/10", show: item.status === "pending" },
            { key: "process", label: "Processar", icon: <Loader2 className="h-3.5 w-3.5" />, color: "text-indigo-600 hover:bg-indigo-500/10", show: item.status === "ready" },
            { key: "posted", label: "Postado", icon: <CheckCircle className="h-3.5 w-3.5" />, color: "text-emerald-600 hover:bg-emerald-500/10", show: item.status === "ready" || item.status === "processing" },
            { key: "failed", label: "Falha", icon: <XCircle className="h-3.5 w-3.5" />, color: "text-red-500 hover:bg-red-500/10", show: !["posted", "failed", "cancelled"].includes(item.status) },
            { key: "review", label: "Revisão", icon: <Eye className="h-3.5 w-3.5" />, color: "text-purple-500 hover:bg-purple-500/10", show: !["posted", "review", "cancelled"].includes(item.status) },
            { key: "cancel", label: "Cancelar", icon: <Pause className="h-3.5 w-3.5" />, color: "text-gray-400 hover:bg-gray-500/10", show: !["posted", "cancelled"].includes(item.status) },
            { key: "retry", label: "Retentar", icon: <RefreshCw className="h-3.5 w-3.5" />, color: "text-amber-500 hover:bg-amber-500/10", show: item.status === "failed" || item.status === "cancelled" },
        ];
        return (
            <div className={cn("flex gap-1", isDrawer ? "flex-wrap gap-2" : "items-center justify-center")}>
                {acts.filter(a => a.show).map(a => (
                    <Button key={a.key} size={sz} variant={isDrawer && a.key === "failed" ? "destructive" : "ghost"} className={cn(cls, !isDrawer && a.color)}
                        onClick={(e) => { e.stopPropagation(); setConfirmAction({ action: a.key, id: item.id, label: `${a.label} esta campanha?` }); }}>
                        {a.icon} {isDrawer && a.label}
                    </Button>
                ))}
            </div>
        );
    };

    return (
        <div className="flex-1 overflow-auto bg-background">
            <div className="max-w-[1440px] mx-auto p-4 md:p-6 space-y-5">

                {/* ═══ HEADER ═══ */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-pink-500/5 border border-indigo-500/10">
                            <Megaphone className="h-7 w-7 text-indigo-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-foreground tracking-tight">Central de Campanhas</h1>
                            <p className="text-xs text-muted-foreground">Monitoramento e gestão das campanhas de marketing local das lojas</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] text-muted-foreground gap-1.5 px-3 py-1">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Auto-refresh 15s
                        </Badge>
                        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5 text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700">
                            <Plus className="h-3.5 w-3.5" /> Nova Campanha
                        </Button>
                        <Button onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["campaign-queue-dashboard"] }); }} variant="outline" size="sm" className="gap-1.5 text-xs font-bold">
                            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
                        </Button>
                    </div>
                </div>

                {/* ═══ KPI CARDS ═══ */}
                <div className="grid grid-cols-3 md:grid-cols-5 xl:grid-cols-9 gap-2">
                    <KpiCard icon={Layers} label="Total" value={kpis.total} color="text-slate-600" active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
                    <KpiCard icon={Clock} label="Pendentes" value={kpis.pending} color="text-amber-600" active={statusFilter === "pending"} onClick={() => setStatusFilter("pending")} />
                    <KpiCard icon={Play} label="Prontas" value={kpis.ready} color="text-blue-600" active={statusFilter === "ready"} onClick={() => setStatusFilter("ready")} />
                    <KpiCard icon={Loader2} label="Executando" value={kpis.processing} color="text-indigo-600" active={statusFilter === "processing"} onClick={() => setStatusFilter("processing")} />
                    <KpiCard icon={CheckCircle} label="Postadas" value={kpis.posted} color="text-emerald-600" active={statusFilter === "posted"} onClick={() => setStatusFilter("posted")} />
                    <KpiCard icon={XCircle} label="Falhas" value={kpis.failed} color="text-red-600" active={statusFilter === "failed"} onClick={() => setStatusFilter("failed")} />
                    <KpiCard icon={Eye} label="Revisão" value={kpis.review} color="text-purple-600" active={statusFilter === "review"} onClick={() => setStatusFilter("review")} />
                    <KpiCard icon={Pause} label="Canceladas" value={cancelledCount} color="text-gray-500" active={statusFilter === "cancelled"} onClick={() => setStatusFilter("cancelled")} />
                    <KpiCard icon={AlertTriangle} label="Expiradas" value={kpis.expired} color="text-orange-600" active={statusFilter === "expired"} onClick={() => setStatusFilter("expired")} />
                </div>

                {/* ═══ FILTERS ═══ */}
                <Card className="border shadow-sm">
                    <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-3">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Filtros Avançados</p>
                            {hasActiveFilters && (
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground" onClick={clearFilters}>Limpar filtros</Button>
                            )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
                            <div className="col-span-2">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                    <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar título, loja, criador..." className="pl-8 h-9 text-xs" />
                                </div>
                            </div>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos Status</SelectItem>
                                    {Object.entries(STATUS_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Prioridade" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas Prior.</SelectItem>
                                    {Object.entries(PRIORITY_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            {cities.length > 0 && (
                                <Select value={cityFilter} onValueChange={setCityFilter}>
                                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Cidade" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todas Cidades</SelectItem>
                                        {cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            )}
                            {types.length > 0 && (
                                <Select value={typeFilter} onValueChange={setTypeFilter}>
                                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos Tipos</SelectItem>
                                        {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            )}
                            <Select value={imageFilter} onValueChange={setImageFilter}>
                                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Imagem" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Imagem: Todos</SelectItem>
                                    <SelectItem value="yes">Com imagem</SelectItem>
                                    <SelectItem value="no">Sem imagem</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={linkFilter} onValueChange={setLinkFilter}>
                                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Link" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Link: Todos</SelectItem>
                                    <SelectItem value="yes">Com link</SelectItem>
                                    <SelectItem value="no">Sem link</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={sourceFilter} onValueChange={setSourceFilter}>
                                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Origem" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas Origens</SelectItem>
                                    <SelectItem value="advertiser_listing">Anunciante</SelectItem>
                                    <SelectItem value="merchant_direct">Lojista</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* ═══ RESULT COUNT ═══ */}
                <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                        Mostrando <span className="font-bold text-foreground">{filtered.length}</span> de {items.length} campanhas
                        {hasActiveFilters && <span className="text-primary font-bold ml-1">(filtrado)</span>}
                    </p>
                </div>

                {/* ═══ TABLE ═══ */}
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center py-20 text-center">
                        <div className="p-5 rounded-2xl bg-muted/30 mb-4"><Inbox className="h-12 w-12 text-muted-foreground/30" /></div>
                        <p className="font-bold text-muted-foreground">Nenhuma campanha encontrada</p>
                        <p className="text-xs text-muted-foreground/70 mt-1 max-w-sm">Ajuste os filtros ou aguarde novas campanhas das lojas.</p>
                    </div>
                ) : (
                    <div className="border rounded-xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-muted/40 border-b">
                                        {["", "Campanha", "Status", "Prior.", "Loja", "Cidade", "Tipo", "Criado", "Ações"].map(h => (
                                            <th key={h} className="text-left p-3 font-black text-[10px] text-muted-foreground uppercase tracking-wider">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filtered.slice(0, 100).map(item => (
                                        <tr key={item.id} className="hover:bg-muted/20 transition-colors cursor-pointer group" onClick={() => setSelectedItem(item)}>
                                            {/* Thumbnail */}
                                            <td className="p-2 w-14">
                                                {item.has_image && item.media_url ? (
                                                    <div className="h-10 w-10 rounded-lg overflow-hidden bg-muted/50 flex-shrink-0">
                                                        <img src={item.media_url} alt="" className="h-full w-full object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                                    </div>
                                                ) : (
                                                    <div className="h-10 w-10 rounded-lg bg-muted/30 flex items-center justify-center flex-shrink-0">
                                                        <ImageOff className="h-4 w-4 text-muted-foreground/30" />
                                                    </div>
                                                )}
                                            </td>
                                            {/* Title + creator + micro-badges */}
                                            <td className="p-3 max-w-[280px]">
                                                <p className="font-bold text-foreground truncate">{item.title || "Sem título"}</p>
                                                {item.creator_name && <p className="text-[10px] text-muted-foreground truncate">{item.creator_name}</p>}
                                                <div className="flex gap-1 mt-0.5">
                                                    {item.source_type === "advertiser_listing" && <span className="text-[8px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 font-bold">ANUNCIANTE</span>}
                                                    {item.is_expired && <span className="text-[8px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 font-bold">VENCIDA</span>}
                                                    {!item.has_image && <span className="text-[8px] px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-500 font-bold">S/ IMG</span>}
                                                    {!item.has_link && <span className="text-[8px] px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-500 font-bold">S/ LINK</span>}
                                                    {item.priority >= 4 && <span className="text-[8px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 font-bold">URGENTE</span>}
                                                </div>
                                            </td>
                                            <td className="p-3"><StatusBadge status={item.status} /></td>
                                            <td className="p-3"><PriorityBadge priority={item.priority} /></td>
                                            <td className="p-3 text-xs text-muted-foreground max-w-[140px] truncate">{item.store_name || "—"}</td>
                                            <td className="p-3 text-xs text-muted-foreground">{item.target_city || "—"}</td>
                                            <td className="p-3"><Badge variant="outline" className="text-[10px] font-medium">{item.campaign_type || "—"}</Badge></td>
                                            <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(item.created_at)}</td>
                                            <td className="p-3" onClick={e => e.stopPropagation()}><ActionBtns item={item} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ═══ DETAIL DRAWER ═══ */}
                <Sheet open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
                    <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
                        {selectedItem && (
                            <>
                                <SheetHeader>
                                    <SheetTitle className="flex items-center gap-2 text-lg">
                                        <Megaphone className="h-5 w-5 text-primary" />
                                        {selectedItem.title || "Campanha"}
                                    </SheetTitle>
                                </SheetHeader>
                                <div className="mt-5 space-y-5">
                                    {/* Media */}
                                    {selectedItem.media_url ? (
                                        <div className="aspect-video rounded-xl overflow-hidden bg-muted/30 border">
                                            <img src={selectedItem.media_url} alt="" className="w-full h-full object-contain" onError={e => { (e.target as HTMLImageElement).replaceWith(Object.assign(document.createElement('div'), { className: 'w-full h-full flex items-center justify-center', innerHTML: '<span class="text-muted-foreground text-sm">Mídia indisponível</span>' })); }} />
                                        </div>
                                    ) : (
                                        <div className="aspect-video rounded-xl bg-gradient-to-br from-muted/40 to-muted/20 border flex items-center justify-center">
                                            <div className="text-center"><Megaphone className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" /><p className="text-xs text-muted-foreground/40">Sem mídia</p></div>
                                        </div>
                                    )}

                                    {/* Status + badges */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusBadge status={selectedItem.status} />
                                        <PriorityBadge priority={selectedItem.priority} />
                                        <Badge variant="outline" className="text-[10px]">{selectedItem.campaign_type || "—"}</Badge>
                                        {selectedItem.is_expired && <Badge variant="destructive" className="text-[10px]">⚠ Expirada</Badge>}
                                    </div>

                                    {/* Message */}
                                    {selectedItem.message_text && (
                                        <div>
                                            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Mensagem</Label>
                                            <div className="mt-1 p-3 bg-muted/20 rounded-lg text-sm whitespace-pre-wrap border">{selectedItem.message_text}</div>
                                        </div>
                                    )}

                                    {/* Info grid */}
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { label: "Loja", value: selectedItem.store_name, icon: <Store className="h-3 w-3" /> },
                                            { label: "Criador", value: selectedItem.creator_name, icon: <User className="h-3 w-3" /> },
                                            { label: "Cidade", value: selectedItem.target_city },
                                            { label: "Região", value: selectedItem.target_region },
                                            { label: "CTA", value: selectedItem.cta_label },
                                            { label: "Preço", value: selectedItem.price_label ? `R$ ${selectedItem.price_label}` : null },
                                            { label: "Origem", value: selectedItem.source_type },
                                            { label: "Clicks / Conv", value: (selectedItem.clicks_count || selectedItem.conversions_count) ? `${selectedItem.clicks_count} / ${selectedItem.conversions_count}` : null },
                                            { label: "Início", value: fmtDate(selectedItem.starts_at) !== "—" ? fmtDate(selectedItem.starts_at) : null },
                                            { label: "Fim", value: fmtDate(selectedItem.ends_at) !== "—" ? fmtDate(selectedItem.ends_at) : null },
                                            { label: "Criado em", value: fmtDate(selectedItem.created_at) },
                                            { label: "Atualizado", value: fmtDate(selectedItem.updated_at) },
                                            { label: "Postado em", value: fmtDate(selectedItem.posted_at) !== "—" ? fmtDate(selectedItem.posted_at) : null },
                                            { label: "Revisado em", value: fmtDate(selectedItem.reviewed_at) !== "—" ? fmtDate(selectedItem.reviewed_at) : null },
                                        ].filter(f => f.value).map((f, i) => (
                                            <div key={i}>
                                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold flex items-center gap-1">{f.icon}{f.label}</p>
                                                <p className="text-sm font-medium text-foreground mt-0.5">{f.value}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* External link */}
                                    {selectedItem.has_link && selectedItem.external_link && (
                                        <a href={selectedItem.external_link} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-2 text-sm text-primary hover:underline font-medium p-3 bg-primary/5 rounded-lg border border-primary/10">
                                            <ExternalLink className="h-4 w-4" /> Abrir link de destino
                                        </a>
                                    )}

                                    {/* Source ID */}
                                    {selectedItem.source_id && (
                                        <p className="text-[10px] text-muted-foreground">Source ID: <span className="font-mono">{selectedItem.source_id.substring(0, 16)}...</span></p>
                                    )}

                                    {/* Execution notes */}
                                    {selectedItem.execution_notes && (
                                        <div>
                                            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Notas</Label>
                                            <div className="mt-1 p-3 bg-muted/20 rounded-lg text-xs border">{selectedItem.execution_notes}</div>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="pt-4 border-t">
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-3">Ações</p>
                                        <ActionBtns item={selectedItem} variant="drawer" />
                                    </div>
                                </div>
                            </>
                        )}
                    </SheetContent>
                </Sheet>

                {/* ═══ CONFIRM DIALOG ═══ */}
                <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar Ação</AlertDialogTitle>
                            <AlertDialogDescription>{confirmAction?.label}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={actionLoading}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction disabled={actionLoading} onClick={() => confirmAction && executeAction(confirmAction.action, confirmAction.id)}>
                                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* ═══ CREATE CAMPAIGN DIALOG ═══ */}
                <Dialog open={showCreate} onOpenChange={setShowCreate}>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> Nova Campanha</DialogTitle>
                            <DialogDescription>Criar item na fila de campanhas.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div><Label className="text-xs font-bold">Título *</Label><Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Ex: Promoção Pizzaria Centro" /></div>
                            <div><Label className="text-xs font-bold">Mensagem</Label><Textarea value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Texto da postagem..." rows={3} /></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><Label className="text-xs font-bold">Tipo</Label>
                                    <Select value={newType} onValueChange={setNewType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                                        <SelectItem value="promotional">Promocional</SelectItem><SelectItem value="awareness">Awareness</SelectItem>
                                        <SelectItem value="engagement">Engajamento</SelectItem><SelectItem value="reactivation">Reativação</SelectItem>
                                    </SelectContent></Select></div>
                                <div><Label className="text-xs font-bold">Prioridade</Label>
                                    <Select value={newPriority} onValueChange={setNewPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                                        {Object.entries(PRIORITY_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{k} — {v.label}</SelectItem>)}
                                    </SelectContent></Select></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><Label className="text-xs font-bold">Cidade</Label><Input value={newCity} onChange={e => setNewCity(e.target.value)} placeholder="Blumenau" /></div>
                                <div><Label className="text-xs font-bold">Região</Label><Input value={newRegion} onChange={e => setNewRegion(e.target.value)} placeholder="Centro" /></div>
                            </div>
                            <div><Label className="text-xs font-bold">URL da Mídia</Label><Input value={newMediaUrl} onChange={e => setNewMediaUrl(e.target.value)} placeholder="https://..." /></div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
                            <Button onClick={handleCreate} disabled={actionLoading} className="gap-1.5">
                                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar Campanha
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

            </div>
        </div>
    );
}
