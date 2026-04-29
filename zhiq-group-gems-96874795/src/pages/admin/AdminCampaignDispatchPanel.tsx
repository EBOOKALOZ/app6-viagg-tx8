import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
    Send, CheckCircle, XCircle, Loader2,
    Search, RefreshCw, Inbox, MapPin, User, Store,
    AlertTriangle, Zap, Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ═══ TYPES ═══
interface DispatchItem {
    id: string;
    campaign_queue_id: string | null;
    campaign_title: string | null;
    campaign_message: string | null;
    campaign_media_url: string | null;
    source_type: string | null;
    source_id: string | null;
    assigned_to_user_id: string | null;
    assigned_to_name: string | null;
    assigned_profile_type: string | null;
    city: string | null;
    region: string | null;
    dispatch_status: string;
    priority: number;
    notes: string | null;
    created_at: string;
    assigned_at: string | null;
    processed_at: string | null;
    completed_at: string | null;
    store_name: string | null;
    creator_name: string | null;
    target_city: string | null;
    target_region: string | null;
}

// ═══ HELPERS ═══
const fmtDate = (d: string | null | undefined) => {
    if (!d) return "—";
    try { return format(new Date(d), "dd/MM/yy HH:mm", { locale: ptBR }); } catch { return "—"; }
};

const DISPATCH_STATUS: Record<string, { label: string; color: string; bg: string; dot: string }> = {
    queued: { label: "Na Fila", color: "text-amber-600", bg: "bg-amber-500/10", dot: "bg-amber-500" },
    assigned: { label: "Atribuído", color: "text-blue-600", bg: "bg-blue-500/10", dot: "bg-blue-500" },
    in_progress: { label: "Em Andamento", color: "text-indigo-600", bg: "bg-indigo-500/10", dot: "bg-indigo-500" },
    posted: { label: "Postado", color: "text-emerald-600", bg: "bg-emerald-500/10", dot: "bg-emerald-500" },
    failed: { label: "Falha", color: "text-red-600", bg: "bg-red-500/10", dot: "bg-red-500" },
    cancelled: { label: "Cancelado", color: "text-gray-500", bg: "bg-gray-500/10", dot: "bg-gray-400" },
};

const StatusBadge = ({ status }: { status: string }) => {
    const s = DISPATCH_STATUS[status] || DISPATCH_STATUS.queued;
    return (
        <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider", s.bg, s.color)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} /> {s.label}
        </span>
    );
};

function KpiCard({ label, value, color, active, onClick }: {
    label: string; value: number; color: string; active?: boolean; onClick?: () => void;
}) {
    return (
        <Card className={cn("bg-card border shadow-sm transition-all cursor-pointer hover:shadow-md hover:scale-[1.02]", active && "ring-2 ring-primary")} onClick={onClick}>
            <CardContent className="p-3 text-center">
                <p className="text-xl font-black text-foreground leading-none">{value}</p>
                <p className={cn("text-[9px] font-bold uppercase tracking-widest mt-1", color)}>{label}</p>
            </CardContent>
        </Card>
    );
}

// ═══ MAIN ═══
export default function AdminCampaignDispatchPanel() {
    const { user } = useAuth();
    const qc = useQueryClient();

    // Shared
    const [actionLoading, setActionLoading] = useState(false);
    const [showAssign, setShowAssign] = useState(false);
    const [assignCampaignId, setAssignCampaignId] = useState("");
    const [assignUserId, setAssignUserId] = useState("");
    const [assignProfileType, setAssignProfileType] = useState("motoboy");
    const [assignCity, setAssignCity] = useState("");
    const [assignRegion, setAssignRegion] = useState("");
    const [assignNotes, setAssignNotes] = useState("");
    const [showBatch, setShowBatch] = useState(false);
    const [batchCampaignId, setBatchCampaignId] = useState("");
    const [batchProfileType, setBatchProfileType] = useState("motoboy");
    const [batchCity, setBatchCity] = useState("");
    const [batchRegion, setBatchRegion] = useState("");
    const [batchNotes, setBatchNotes] = useState("");

    // Dispatch state
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [cityFilter, setCityFilter] = useState("all");
    const [profileFilter, setProfileFilter] = useState("all");
    const [selected, setSelected] = useState<DispatchItem | null>(null);
    const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

    // ══════════════════════════════
    // QUERIES
    // ══════════════════════════════
    const { data: dispatches = [], isLoading: dLoading, refetch: dRefetch } = useQuery({
        queryKey: ["admin-dispatch-panel"],
        queryFn: async (): Promise<DispatchItem[]> => {
            const { data, error } = await (supabase.from as any)("admin_campaign_dispatch_panel_view")
                .select("*").order("created_at", { ascending: false }).limit(300);
            if (error) { console.error("[DispatchPanel]", error); return []; }
            return data || [];
        },
        refetchInterval: 12_000,
    });

    // Lightweight summary of merchant campaigns (counts only)
    const { data: adSummary } = useQuery({
        queryKey: ["admin-ad-summary"],
        queryFn: async () => {
            const { data, error } = await (supabase.from as any)("admin_campaign_queue_view")
                .select("id, status").limit(500);
            if (error) return [];
            return data || [];
        },
        refetchInterval: 20_000,
    });

    const { data: readyCampaigns = [] } = useQuery({
        queryKey: ["ready-campaigns-for-dispatch"],
        queryFn: async () => {
            const { data, error } = await (supabase.from as any)("admin_campaign_queue_view")
                .select("id, title, target_city, target_region, store_name, media_url, priority")
                .eq("status", "ready").order("priority", { ascending: false }).limit(50);
            if (error) return [];
            return data || [];
        },
        refetchInterval: 15_000,
    });

    // ── Ad summary KPIs ──
    const adKpis = useMemo(() => {
        const rows = adSummary || [];
        const dispatchedIds = new Set(dispatches.map(d => d.campaign_queue_id));
        const c = { total: rows.length, ready: 0, pending: 0, posted: 0, failed: 0, withDispatch: 0, noDispatch: 0 };
        rows.forEach((r: any) => {
            if (r.status === "ready") c.ready++;
            if (r.status === "pending") c.pending++;
            if (r.status === "posted") c.posted++;
            if (r.status === "failed") c.failed++;
            if (dispatchedIds.has(r.id)) c.withDispatch++;
            else c.noDispatch++;
        });
        return c;
    }, [adSummary, dispatches]);

    // ── Dispatch KPIs ──
    const dKpis = useMemo(() => {
        const c = { total: dispatches.length, queued: 0, assigned: 0, in_progress: 0, posted: 0, failed: 0, cancelled: 0 };
        dispatches.forEach(i => { if (c[i.dispatch_status as keyof typeof c] !== undefined) (c as any)[i.dispatch_status]++; });
        return c;
    }, [dispatches]);

    // ── Filters ──
    const cities = useMemo(() => [...new Set(dispatches.map(i => i.city || i.target_city).filter(Boolean) as string[])].sort(), [dispatches]);
    const filtered = useMemo(() => dispatches.filter(item => {
        if (statusFilter !== "all" && item.dispatch_status !== statusFilter) return false;
        if (cityFilter !== "all" && (item.city || item.target_city) !== cityFilter) return false;
        if (profileFilter !== "all" && item.assigned_profile_type !== profileFilter) return false;
        if (search) { const t = search.toLowerCase(); return [item.campaign_title, item.city, item.region, item.assigned_to_name, item.store_name].some(f => f?.toLowerCase().includes(t)); }
        return true;
    }), [dispatches, statusFilter, cityFilter, profileFilter, search]);

    // ══════════════════════════════
    // ACTIONS
    // ══════════════════════════════
    const handleAssignToUser = async () => {
        if (!assignCampaignId || !assignUserId) { toast.error("Preencha campanha e usuário"); return; }
        setActionLoading(true);
        try {
            const { error } = await (supabase.rpc as any)("dispatch_campaign_to_user", {
                p_campaign_queue_id: assignCampaignId, p_assigned_to_user_id: assignUserId,
                p_assigned_profile_type: assignProfileType, p_city: assignCity.trim() || null,
                p_region: assignRegion.trim() || null, p_notes: assignNotes.trim() || null,
            });
            if (error) throw error;
            toast.success("Campanha atribuída com sucesso");
            setShowAssign(false); setAssignCampaignId(""); setAssignUserId(""); setAssignCity(""); setAssignRegion(""); setAssignNotes("");
            dRefetch();
        } catch (err: any) { toast.error(err?.message || "Erro ao atribuir"); }
        finally { setActionLoading(false); }
    };

    const handleBatchDispatch = async () => {
        if (!batchCampaignId || !batchCity) { toast.error("Preencha campanha e cidade"); return; }
        setActionLoading(true);
        try {
            const { error } = await (supabase.rpc as any)("dispatch_campaign_to_city_region", {
                p_campaign_queue_id: batchCampaignId, p_profile_type: batchProfileType,
                p_city: batchCity.trim(), p_region: batchRegion.trim() || null, p_notes: batchNotes.trim() || null,
            });
            if (error) throw error;
            toast.success("Campanha enviada para cidade/região");
            setShowBatch(false); setBatchCampaignId(""); setBatchCity(""); setBatchRegion(""); setBatchNotes("");
            dRefetch();
        } catch (err: any) { toast.error(err?.message || "Erro ao despachar em lote"); }
        finally { setActionLoading(false); }
    };

    const handleCancelDispatch = async (id: string) => {
        setActionLoading(true);
        try {
            const { error } = await (supabase.rpc as any)("cancel_campaign_dispatch", { p_dispatch_id: id });
            if (error) throw error;
            toast.success("Dispatch cancelado"); dRefetch(); setSelected(null);
        } catch (err: any) { toast.error(err?.message || "Erro ao cancelar"); }
        finally { setActionLoading(false); setConfirmCancel(null); }
    };

    // ══════════════════════════════
    // LOADING
    // ══════════════════════════════
    if (dLoading) return (
        <div className="flex-1 flex items-center justify-center py-20">
            <div className="text-center space-y-3">
                <div className="h-10 w-10 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground font-medium">Carregando Central de Dispatch...</p>
            </div>
        </div>
    );

    // ══════════════════════════════
    // RENDER
    // ══════════════════════════════
    return (
        <div className="flex-1 overflow-auto bg-background">
            <div className="max-w-[1440px] mx-auto p-4 md:p-6 space-y-5">

                {/* ═══ HEADER ═══ */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-cyan-500/5 border border-emerald-500/10">
                            <Send className="h-7 w-7 text-emerald-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-foreground tracking-tight">Central de Dispatch</h1>
                            <p className="text-xs text-muted-foreground">Coordene o despacho de campanhas para motoboys e postadores</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] gap-1.5 px-3 py-1"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live</Badge>
                        <Button size="sm" className="gap-1.5 text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-white" disabled={actionLoading} onClick={async () => {
                            setActionLoading(true);
                            try {
                                const { data, error } = await (supabase.rpc as any)("run_marketing_engine", { p_limit_per_city: 3 });
                                if (error) throw error;
                                const result = data as any;
                                toast.success(`Motor de marketing: ${result?.total_enqueued || 0} campanhas criadas em ${result?.cities_processed || 0} cidades`);
                                dRefetch();
                            } catch (err: any) { toast.error(err?.message || "Erro no motor de marketing"); }
                            finally { setActionLoading(false); }
                        }}><Sparkles className="h-3.5 w-3.5" /> Gerar Campanhas</Button>
                        <Button size="sm" className="gap-1.5 text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600" disabled={actionLoading} onClick={async () => {
                            setActionLoading(true);
                            try {
                                const { data, error } = await (supabase.rpc as any)("auto_dispatch_all_ready_campaigns");
                                if (error) throw error;
                                const result = data as any;
                                toast.success(`Distribuição automática: ${result?.total_dispatched || 0} dispatches criados para ${result?.campaigns_processed || 0} campanhas`);
                                dRefetch();
                            } catch (err: any) { toast.error(err?.message || "Erro na distribuição automática"); }
                            finally { setActionLoading(false); }
                        }}><Zap className="h-3.5 w-3.5" /> Distribuir Tudo</Button>
                        <Button size="sm" className="gap-1.5 text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600" onClick={() => setShowAssign(true)}><User className="h-3.5 w-3.5" /> Atribuir Manual</Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs font-bold" onClick={() => setShowBatch(true)}><MapPin className="h-3.5 w-3.5" /> Enviar por Cidade</Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs font-bold" onClick={() => dRefetch()}><RefreshCw className="h-3.5 w-3.5" /></Button>
                    </div>
                </div>

                {/* ═══ MERCHANT ADS SUMMARY ═══ */}
                <div className="p-4 rounded-xl border bg-gradient-to-r from-blue-500/[0.03] via-indigo-500/[0.03] to-violet-500/[0.03]">
                    <div className="flex items-center gap-2 mb-3">
                        <Store className="h-4 w-4 text-blue-600" />
                        <p className="text-xs font-black text-foreground uppercase tracking-wider">Anúncios dos Lojistas</p>
                    </div>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                        {([
                            { label: "Total", value: adKpis.total, color: "text-slate-600" },
                            { label: "Prontos", value: adKpis.ready, color: "text-blue-600" },
                            { label: "Pendentes", value: adKpis.pending, color: "text-amber-600" },
                            { label: "Auto-dispatch", value: adKpis.withDispatch, color: "text-violet-600" },
                            { label: "Sem dispatch", value: adKpis.noDispatch, color: "text-orange-600" },
                            { label: "Postados", value: adKpis.posted, color: "text-teal-600" },
                        ]).map(k => (
                            <div key={k.label} className="text-center p-2.5 rounded-lg bg-white/60 dark:bg-white/5 border border-transparent hover:border-border/50 transition-colors">
                                <p className={cn("text-lg font-black leading-none", k.color)}>{k.value}</p>
                                <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{k.label}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ═══ DISPATCH KPIs ═══ */}
                <div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Dispatch Operacional</p>
                    <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
                        <KpiCard label="Total" value={dKpis.total} color="text-slate-600" active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
                        <KpiCard label="Na Fila" value={dKpis.queued} color="text-amber-600" active={statusFilter === "queued"} onClick={() => setStatusFilter("queued")} />
                        <KpiCard label="Atribuídos" value={dKpis.assigned} color="text-blue-600" active={statusFilter === "assigned"} onClick={() => setStatusFilter("assigned")} />
                        <KpiCard label="Em Progresso" value={dKpis.in_progress} color="text-indigo-600" active={statusFilter === "in_progress"} onClick={() => setStatusFilter("in_progress")} />
                        <KpiCard label="Postados" value={dKpis.posted} color="text-emerald-600" active={statusFilter === "posted"} onClick={() => setStatusFilter("posted")} />
                        <KpiCard label="Falhas" value={dKpis.failed} color="text-red-600" active={statusFilter === "failed"} onClick={() => setStatusFilter("failed")} />
                        <KpiCard label="Cancelados" value={dKpis.cancelled} color="text-gray-500" active={statusFilter === "cancelled"} onClick={() => setStatusFilter("cancelled")} />
                    </div>
                </div>

                {/* ═══ FILTERS ═══ */}
                <div className="flex flex-col md:flex-row gap-2">
                    <div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar título, loja, motoboy..." className="pl-8 h-9 text-xs" /></div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos Status</SelectItem>{Object.entries(DISPATCH_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select>
                    <Select value={profileFilter} onValueChange={setProfileFilter}><SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos Perfis</SelectItem><SelectItem value="motoboy">Motoboy</SelectItem><SelectItem value="postador">Postador</SelectItem></SelectContent></Select>
                    {cities.length > 0 && <Select value={cityFilter} onValueChange={setCityFilter}><SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas Cidades</SelectItem>{cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>}
                </div>

                {/* ═══ RESULT COUNT ═══ */}
                <p className="text-xs text-muted-foreground"><span className="font-bold text-foreground">{filtered.length}</span> de {dispatches.length} dispatches</p>

                {/* ═══ TABLE ═══ */}
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-center"><div className="p-5 rounded-2xl bg-muted/30 mb-4"><Inbox className="h-10 w-10 text-muted-foreground/30" /></div><p className="font-bold text-muted-foreground">Nenhum dispatch encontrado</p><p className="text-xs text-muted-foreground/70 mt-1">Atribua campanhas prontas para motoboys usando os botões acima.</p></div>
                ) : (
                    <div className="border rounded-xl overflow-hidden shadow-sm"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-muted/40 border-b">{["Campanha", "Cidade/Região", "Perfil", "Atribuído", "Status", "Prior.", "Atribuído em", "Concluído", "Ações"].map(h => <th key={h} className="text-left p-3 font-black text-[10px] text-muted-foreground uppercase tracking-wider">{h}</th>)}</tr></thead>
                        <tbody className="divide-y">{filtered.slice(0, 100).map(item => (
                            <tr key={item.id} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setSelected(item)}>
                                <td className="p-3 max-w-[220px]"><p className="font-bold text-foreground truncate">{item.campaign_title || "Sem título"}</p>{item.store_name && <p className="text-[10px] text-muted-foreground truncate">{item.store_name}</p>}</td>
                                <td className="p-3 text-xs text-muted-foreground">{item.city || item.target_city || "—"}{item.region && ` / ${item.region}`}</td>
                                <td className="p-3"><Badge variant="outline" className="text-[10px]">{item.assigned_profile_type || "—"}</Badge></td>
                                <td className="p-3 text-xs text-muted-foreground truncate max-w-[140px]">{item.assigned_to_name || "—"}</td>
                                <td className="p-3"><StatusBadge status={item.dispatch_status} /></td>
                                <td className="p-3 text-xs font-bold">{item.priority || "—"}</td>
                                <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(item.assigned_at)}</td>
                                <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(item.completed_at)}</td>
                                <td className="p-3" onClick={e => e.stopPropagation()}>{!["posted", "cancelled"].includes(item.dispatch_status) && <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-400" onClick={() => setConfirmCancel(item.id)}><XCircle className="h-3.5 w-3.5" /></Button>}</td>
                            </tr>
                        ))}</tbody></table></div></div>
                )}

                {/* ═══ DISPATCH DETAIL DRAWER ═══ */}
                <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
                    <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
                        {selected && (<>
                            <SheetHeader><SheetTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-primary" />{selected.campaign_title || "Dispatch"}</SheetTitle></SheetHeader>
                            <div className="mt-5 space-y-5">
                                <div className="flex flex-wrap gap-2"><StatusBadge status={selected.dispatch_status} /><Badge variant="outline" className="text-[10px]">{selected.assigned_profile_type || "—"}</Badge></div>
                                {selected.campaign_message && <div><Label className="text-[10px] text-muted-foreground uppercase font-bold">Mensagem</Label><div className="mt-1 p-3 bg-muted/20 rounded-lg text-sm whitespace-pre-wrap border">{selected.campaign_message}</div></div>}
                                {selected.campaign_media_url && <div className="aspect-video rounded-xl overflow-hidden bg-muted/30 border"><img src={selected.campaign_media_url} alt="" className="w-full h-full object-contain" /></div>}
                                <div className="grid grid-cols-2 gap-3">{[
                                    { l: "Loja", v: selected.store_name }, { l: "Criador", v: selected.creator_name }, { l: "Atribuído a", v: selected.assigned_to_name },
                                    { l: "Cidade", v: selected.city || selected.target_city }, { l: "Região", v: selected.region || selected.target_region }, { l: "Origem", v: selected.source_type },
                                    { l: "Criado", v: fmtDate(selected.created_at) }, { l: "Atribuído", v: fmtDate(selected.assigned_at) }, { l: "Processado", v: fmtDate(selected.processed_at) }, { l: "Concluído", v: fmtDate(selected.completed_at) },
                                ].filter(f => f.v && f.v !== "—").map((f, i) => <div key={i}><p className="text-[10px] text-muted-foreground uppercase font-bold">{f.l}</p><p className="text-sm font-medium">{f.v}</p></div>)}</div>
                                {selected.notes && <div><Label className="text-[10px] text-muted-foreground uppercase font-bold">Notas</Label><div className="mt-1 p-3 bg-muted/20 rounded-lg text-xs border">{selected.notes}</div></div>}
                                {!["posted", "cancelled"].includes(selected.dispatch_status) && <div className="pt-4 border-t"><Button size="sm" variant="destructive" className="gap-1.5 text-xs" onClick={() => setConfirmCancel(selected.id)}><XCircle className="h-3.5 w-3.5" /> Cancelar Dispatch</Button></div>}
                            </div>
                        </>)}
                    </SheetContent>
                </Sheet>

                {/* ═══ CONFIRM CANCEL ═══ */}
                <AlertDialog open={!!confirmCancel} onOpenChange={() => setConfirmCancel(null)}>
                    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar</AlertDialogTitle><AlertDialogDescription>Cancelar este dispatch?</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel disabled={actionLoading}>Não</AlertDialogCancel><AlertDialogAction disabled={actionLoading} onClick={() => confirmCancel && handleCancelDispatch(confirmCancel)}>{actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* ═══ ASSIGN MODAL ═══ */}
                <Dialog open={showAssign} onOpenChange={setShowAssign}>
                    <DialogContent className="max-w-md">
                        <DialogHeader><DialogTitle className="flex items-center gap-2"><User className="h-5 w-5 text-primary" /> Atribuir Campanha</DialogTitle><DialogDescription>Envie uma campanha para um motoboy/postador específico.</DialogDescription></DialogHeader>
                        <div className="space-y-4 py-2">
                            <div><Label className="text-xs font-bold">Campanha *</Label><Select value={assignCampaignId} onValueChange={setAssignCampaignId}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{readyCampaigns.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.title} {c.store_name && `(${c.store_name})`}</SelectItem>)}</SelectContent></Select></div>
                            <div><Label className="text-xs font-bold">User ID *</Label><Input value={assignUserId} onChange={e => setAssignUserId(e.target.value)} placeholder="UUID do motoboy/postador" /></div>
                            <div><Label className="text-xs font-bold">Tipo de Perfil</Label><Select value={assignProfileType} onValueChange={setAssignProfileType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="motoboy">Motoboy</SelectItem><SelectItem value="postador">Postador</SelectItem></SelectContent></Select></div>
                            <div className="grid grid-cols-2 gap-3"><div><Label className="text-xs font-bold">Cidade</Label><Input value={assignCity} onChange={e => setAssignCity(e.target.value)} /></div><div><Label className="text-xs font-bold">Região</Label><Input value={assignRegion} onChange={e => setAssignRegion(e.target.value)} /></div></div>
                            <div><Label className="text-xs font-bold">Observação</Label><Textarea value={assignNotes} onChange={e => setAssignNotes(e.target.value)} rows={2} /></div>
                        </div>
                        <DialogFooter><Button variant="outline" onClick={() => setShowAssign(false)}>Cancelar</Button><Button onClick={handleAssignToUser} disabled={actionLoading} className="gap-1.5">{actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Atribuir</Button></DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* ═══ BATCH MODAL ═══ */}
                <Dialog open={showBatch} onOpenChange={setShowBatch}>
                    <DialogContent className="max-w-md">
                        <DialogHeader><DialogTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> Enviar por Cidade/Região</DialogTitle><DialogDescription>Distribua para todos de uma cidade.</DialogDescription></DialogHeader>
                        <div className="space-y-4 py-2">
                            <div><Label className="text-xs font-bold">Campanha *</Label><Select value={batchCampaignId} onValueChange={setBatchCampaignId}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{readyCampaigns.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.title} {c.store_name && `(${c.store_name})`}</SelectItem>)}</SelectContent></Select></div>
                            <div><Label className="text-xs font-bold">Perfil</Label><Select value={batchProfileType} onValueChange={setBatchProfileType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="motoboy">Motoboy</SelectItem><SelectItem value="postador">Postador</SelectItem></SelectContent></Select></div>
                            <div className="grid grid-cols-2 gap-3"><div><Label className="text-xs font-bold">Cidade *</Label><Input value={batchCity} onChange={e => setBatchCity(e.target.value)} placeholder="Blumenau" /></div><div><Label className="text-xs font-bold">Região</Label><Input value={batchRegion} onChange={e => setBatchRegion(e.target.value)} /></div></div>
                            <div><Label className="text-xs font-bold">Observação</Label><Textarea value={batchNotes} onChange={e => setBatchNotes(e.target.value)} rows={2} /></div>
                        </div>
                        <DialogFooter><Button variant="outline" onClick={() => setShowBatch(false)}>Cancelar</Button><Button onClick={handleBatchDispatch} disabled={actionLoading} className="gap-1.5">{actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />} Enviar</Button></DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
