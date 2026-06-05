import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Store, ArrowLeft, Loader2, User, Mail, Phone, MapPin,
    Package, Zap, Calendar, Tag, ShoppingBag, BarChart3,
    Wallet, Coins, MousePointerClick, Bike, ArrowUpRight, ArrowDownRight,
    TrendingUp, Activity,
} from "lucide-react";

function normalizeImageUrl(url: string | null | undefined): string | null {
    if (!url || typeof url !== "string") return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
    if (!/^https?:\/\//i.test(trimmed)) return null;
    return trimmed;
}

const fmtReais = (reais: number) =>
    reais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CLICK_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
    charged: { label: "Cobrado", cls: "bg-emerald-100 text-emerald-700" },
    deduped: { label: "Repetido", cls: "bg-zinc-100 text-zinc-600" },
    owner_skip: { label: "Próprio dono", cls: "bg-blue-100 text-blue-700" },
    insufficient_balance: { label: "Sem saldo", cls: "bg-red-100 text-red-700" },
    dry_run: { label: "Simulação", cls: "bg-amber-100 text-amber-700" },
};

export default function AdminStoreDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // ── Loja + dono ────────────────────────────────────────
    const { data: store, isLoading } = useQuery({
        queryKey: ["admin-store-detail", id],
        queryFn: async () => {
            const { data } = await (supabase.from("merchant_stores") as any)
                .select("*")
                .eq("id", id)
                .single();
            if (!data) return null;

            let profile: any = {};
            if (data.user_id) {
                const { data: p } = await (supabase.from("profiles") as any)
                    .select("*")
                    .eq("id", data.user_id)
                    .single();
                if (p) profile = p;
            }

            return {
                ...data,
                owner_name: profile.full_name || profile.nome || null,
                owner_email: profile.email || data.email || null,
                owner_phone: profile.telefone || data.phone || null,
                owner_logo: data.logo_url || profile.logo_url || null,
                city: data.city || data.cidade || profile.cidade || null,
                bairro: data.bairro || profile.bairro || null,
                state: data.region || data.estado || profile.estado || null,
                store_name: data.store_name || data.nome_loja || profile.nome_loja || null,
                category: data.categoria || profile.categoria || null,
                cnpj: data.cnpj || profile.cnpj || null,
            };
        },
        enabled: !!id,
    });

    // ── Produtos (vitrine + anunciantes do mesmo dono) ─────
    const { data: products = [] } = useQuery({
        queryKey: ["admin-store-products", id, store?.user_id],
        queryFn: async () => {
            const { data: vitrine } = await (supabase.from("merchant_marketing_products") as any)
                .select("*")
                .eq("merchant_store_id", id)
                .order("created_at", { ascending: false });

            const vitrineRows = ((vitrine as any[]) || []).map((p) => ({
                ...p,
                source: "vitrine" as const,
            }));

            let advertiserRows: any[] = [];
            if (store?.user_id) {
                try {
                    const { data: acct } = await (supabase.from("advertiser_accounts") as any)
                        .select("id")
                        .eq("user_id", store.user_id)
                        .maybeSingle();
                    if (acct?.id) {
                        const { data: adv } = await (supabase.from("advertiser_listings") as any)
                            .select("id, title, description, cover_image_url, price, category, condition, listing_status, created_at")
                            .eq("advertiser_account_id", acct.id)
                            .order("created_at", { ascending: false });
                        advertiserRows = ((adv as any[]) || []).map((p) => ({
                            id: p.id,
                            title: p.title || "Sem título",
                            short_description: p.description || null,
                            image_url: p.cover_image_url || null,
                            price_label: p.price ? String(p.price) : null,
                            category: p.category || null,
                            condition: p.condition || null,
                            is_active: ["active", "published"].includes(String(p.listing_status || "").toLowerCase()),
                            created_at: p.created_at,
                            source: "advertiser" as const,
                        }));
                    }
                } catch (e) {
                    console.warn("[admin-store-products] advertiser_listings", e);
                }
            }

            return [...vitrineRows, ...advertiserRows];
        },
        enabled: !!id,
    });

    // ── M1 events ──────────────────────────────────────────
    const { data: m1Events = [] } = useQuery({
        queryKey: ["admin-store-m1", id],
        queryFn: async () => {
            try {
                const { data } = await (supabase.from("m1_billing_events") as any)
                    .select("*")
                    .eq("merchant_store_id", id)
                    .order("created_at", { ascending: false })
                    .limit(50);
                return data || [];
            } catch {
                return [];
            }
        },
        enabled: !!id,
    });

    // ── Finanças (admin RPC SECURITY DEFINER, bypassa RLS) ──
    const { data: finances, error: financesError } = useQuery({
        queryKey: ["admin-store-finances", id],
        queryFn: async () => {
            if (!id) return null;
            const { data, error } = await (supabase.rpc as any)("admin_get_store_finances", {
                p_store_id: id,
            });
            if (error) {
                console.warn("[admin_get_store_finances] RPC ERROR:", error);
                throw error;
            }
            console.log("[admin_get_store_finances] response:", data);
            return data;
        },
        enabled: !!id,
        retry: false,
    });

    const walletReais = (() => {
        const w: any = finances?.wallet;
        if (!w) return { saldo: 0, current: 0, recharged: 0, spent: 0, reserved: 0, pending: 0, transactions: [] as any[] };
        const payTxs: any[] = Array.isArray(w.pay_txs) ? w.pay_txs : [];
        const legacyTxs: any[] = Array.isArray(w.legacy_txs) ? w.legacy_txs : [];
        return {
            saldo: Number(w.saldo_total ?? 0),
            current: Number(w.pay_current ?? 0),
            recharged: Number(w.pay_recharged ?? 0),
            spent: Number(w.pay_spent ?? 0),
            reserved: Number(w.pay_reserved ?? 0),
            pending: Number(w.pay_pending ?? 0),
            transactions: payTxs.length > 0 ? payTxs : legacyTxs,
        };
    })();

    const creditsData = (() => {
        const c: any = finances?.credits;
        if (!c) return { balance: { available_credits: 0, reserved_credits: 0, consumed_credits: 0 }, ledger: [] as any[] };
        return {
            balance: c.balance || { available_credits: 0, reserved_credits: 0, consumed_credits: 0 },
            ledger: Array.isArray(c.ledger) ? c.ledger : [],
        };
    })();

    // ── Acessos via /mercado (cliques cobrados + recentes) ─
    const { data: clicksData } = useQuery({
        queryKey: ["admin-store-clicks", id],
        queryFn: async () => {
            const { data } = await (supabase.from("marketplace_product_click_events") as any)
                .select("id, status, credits_charged, source, city, neighborhood, created_at, visitor_user_id, anon_id")
                .eq("store_id", id)
                .order("created_at", { ascending: false })
                .limit(100);
            const rows = (data as any[]) || [];
            const counts: Record<string, number> = {};
            let totalCobrados = 0;
            let totalCreditosGastos = 0;
            let visitantesUnicos = new Set<string>();
            for (const r of rows) {
                counts[r.status] = (counts[r.status] || 0) + 1;
                if (r.status === "charged") {
                    totalCobrados += 1;
                    totalCreditosGastos += r.credits_charged || 0;
                }
                const id = r.visitor_user_id || r.anon_id;
                if (id) visitantesUnicos.add(id);
            }
            return {
                rows,
                counts,
                totalCobrados,
                totalCreditosGastos,
                visitantesUnicos: visitantesUnicos.size,
                totalEventos: rows.length,
            };
        },
        enabled: !!id,
    });

    const m1TotalCharged = m1Events.reduce((sum: number, e: any) => sum + (e.charged_value || 0), 0);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!store) {
        return (
            <div className="text-center py-20">
                <Store className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground">Loja não encontrada</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/lojas")}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" onClick={() => navigate("/admin/lojas")}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
                        {store.owner_logo ? (
                            <img src={store.owner_logo} alt="" className="h-8 w-8 rounded-lg object-cover" />
                        ) : (
                            <Store className="h-6 w-6 text-primary" />
                        )}
                        {store.store_name || "Loja sem nome"}
                    </h1>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">ID: {store.id}</p>
                </div>
                <Badge className={store.status === "ativo" || !store.status
                    ? "bg-emerald-500/15 text-emerald-600 border-emerald-400/30"
                    : "bg-red-500/15 text-red-600 border-red-400/30"
                }>
                    {store.status || "ativo"}
                </Badge>
            </div>

            {/* DEBUG strip — mostra estado da RPC de finanças */}
            {(financesError || (finances && (finances as any).error)) && (
                <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs">
                    <p className="font-bold text-red-700 mb-1">⚠ Erro ao carregar finanças via RPC admin_get_store_finances:</p>
                    <pre className="text-red-700 whitespace-pre-wrap">
                        {financesError ? JSON.stringify(financesError, null, 2) : JSON.stringify(finances, null, 2)}
                    </pre>
                    <p className="text-red-600 mt-2">
                        Se aparecer <code>forbidden</code>: seu usuário não tem flag admin (profiles.is_admin=true ou user_roles.role='admin').
                        Se aparecer <code>unauthenticated</code>: sessão expirou (faça logout e login).
                    </p>
                </div>
            )}

            {/* KPI Strip — visão executiva */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <KpiCard
                    label="Saldo R$ (motoboy)"
                    value={fmtReais(walletReais?.saldo ?? 0)}
                    icon={Wallet}
                    color="text-emerald-500"
                    bg="bg-emerald-50/70"
                />
                <KpiCard
                    label="Saldo créditos"
                    value={(creditsData?.balance.available_credits ?? 0).toLocaleString("pt-BR")}
                    icon={Coins}
                    color="text-amber-600"
                    bg="bg-amber-50/70"
                />
                <KpiCard
                    label="Acessos /mercado"
                    value={clicksData?.totalCobrados ?? 0}
                    icon={MousePointerClick}
                    color="text-orange-500"
                    bg="bg-orange-50/70"
                />
                <KpiCard
                    label="Visitantes únicos"
                    value={clicksData?.visitantesUnicos ?? 0}
                    icon={User}
                    color="text-blue-500"
                    bg="bg-blue-50/70"
                />
                <KpiCard
                    label="Produtos"
                    value={products.length}
                    icon={Package}
                    color="text-violet-500"
                    bg="bg-violet-50/70"
                />
                <KpiCard
                    label="M1 cobrado"
                    value={`R$ ${m1TotalCharged.toFixed(2)}`}
                    icon={BarChart3}
                    color="text-rose-500"
                    bg="bg-rose-50/70"
                />
            </div>

            {/* Abas — organização limpa */}
            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-6 h-auto p-1 bg-muted/50 rounded-xl">
                    <TabsTrigger value="overview" className="py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">
                        <Store className="w-4 h-4 mr-2" /> Visão Geral
                    </TabsTrigger>
                    <TabsTrigger value="wallet" className="py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">
                        <Wallet className="w-4 h-4 mr-2" /> Carteira R$
                    </TabsTrigger>
                    <TabsTrigger value="credits" className="py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">
                        <Coins className="w-4 h-4 mr-2" /> Créditos
                    </TabsTrigger>
                    <TabsTrigger value="access" className="py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">
                        <MousePointerClick className="w-4 h-4 mr-2" /> Acessos
                    </TabsTrigger>
                    <TabsTrigger value="products" className="py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">
                        <Package className="w-4 h-4 mr-2" /> Produtos
                    </TabsTrigger>
                    <TabsTrigger value="m1" className="py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">
                        <Zap className="w-4 h-4 mr-2" /> M1
                    </TabsTrigger>
                </TabsList>

                {/* ─── VISÃO GERAL ─── */}
                <TabsContent value="overview">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Card className="border-border/60">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <Store className="h-4 w-4 text-primary" /> Dados da Loja
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <InfoRow icon={MapPin} label="Cidade" value={`${store.city || "—"}${store.state ? ` - ${store.state}` : ""}`} />
                                {store.bairro && <InfoRow icon={MapPin} label="Bairro" value={store.bairro} />}
                                {store.category && <InfoRow icon={Tag} label="Categoria" value={store.category} />}
                                {store.cnpj && <InfoRow icon={Tag} label="CNPJ" value={store.cnpj} />}
                                <InfoRow icon={Calendar} label="Criada em" value={store.created_at ? new Date(store.created_at).toLocaleDateString("pt-BR") : "—"} />
                                <InfoRow icon={Store} label="user_id" value={store.user_id || "—"} mono />
                            </CardContent>
                        </Card>

                        <Card className="border-border/60">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <User className="h-4 w-4 text-primary" /> Responsável
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <InfoRow icon={User} label="Nome" value={store.owner_name || "—"} />
                                <InfoRow icon={Mail} label="Email" value={store.owner_email || "—"} />
                                <InfoRow icon={Phone} label="Telefone" value={store.owner_phone || store.whatsapp || "—"} />
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* ─── CARTEIRA R$ ─── */}
                <TabsContent value="wallet" className="space-y-4">
                    {(() => {
                        const txs = (walletReais?.transactions || []).map((t: any) => {
                            // Normaliza pay_ledger_entries vs merchant_wallet_transactions
                            const isPay = !!t.direction;
                            const dir = String(t.direction || "").toLowerCase();
                            const value = isPay ? Number(t.amount || 0) : Math.abs(Number(t.valor || 0));
                            const positive = isPay
                                ? ["credit", "in", "inflow"].includes(dir)
                                : Number(t.valor) >= 0;
                            return {
                                id: t.id,
                                positive,
                                value,
                                tipo: isPay ? t.entry_type : t.tipo,
                                descricao: t.description || t.descricao || "—",
                                ref: t.reference_id || t.referencia_id || null,
                                created_at: t.created_at,
                            };
                        });
                        // Prefere os totais agregados na RPC; cai pra contagem das txs se zerado.
                        const totalRecarregado = walletReais.recharged > 0
                            ? walletReais.recharged
                            : txs.filter((t) => t.positive).reduce((s, t) => s + t.value, 0);
                        const totalGasto = walletReais.spent > 0
                            ? walletReais.spent
                            : txs.filter((t) => !t.positive).reduce((s, t) => s + t.value, 0);
                        return (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                    <KpiCard
                                        label="Saldo disponível"
                                        value={fmtReais(walletReais.saldo)}
                                        icon={Wallet}
                                        color="text-emerald-600"
                                        bg="bg-emerald-50"
                                    />
                                    <KpiCard
                                        label="Saldo atual (total)"
                                        value={fmtReais(walletReais.current || walletReais.saldo)}
                                        icon={Activity}
                                        color="text-blue-600"
                                        bg="bg-blue-50"
                                    />
                                    <KpiCard
                                        label="Total recarregado"
                                        value={fmtReais(totalRecarregado)}
                                        icon={ArrowDownRight}
                                        color="text-emerald-500"
                                        bg="bg-white"
                                    />
                                    <KpiCard
                                        label="Total gasto (motoboy, etc.)"
                                        value={fmtReais(totalGasto)}
                                        icon={ArrowUpRight}
                                        color="text-red-500"
                                        bg="bg-white"
                                    />
                                </div>
                                {walletReais.reserved > 0 || walletReais.pending > 0 ? (
                                    <div className="text-xs text-muted-foreground flex gap-3 px-1">
                                        {walletReais.reserved > 0 && <span>Reservado: {fmtReais(walletReais.reserved)}</span>}
                                        {walletReais.pending > 0 && <span>Pendente: {fmtReais(walletReais.pending)}</span>}
                                    </div>
                                ) : null}
                                <TxTable txs={txs} />
                            </>
                        );
                    })()}

                </TabsContent>

                {/* ─── CRÉDITOS ─── */}
                <TabsContent value="credits" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <KpiCard
                            label="Disponíveis"
                            value={(creditsData?.balance.available_credits ?? 0).toLocaleString("pt-BR")}
                            icon={Coins}
                            color="text-amber-600"
                            bg="bg-amber-50"
                        />
                        <KpiCard
                            label="Reservados"
                            value={(creditsData?.balance.reserved_credits ?? 0).toLocaleString("pt-BR")}
                            icon={Activity}
                            color="text-zinc-600"
                            bg="bg-white"
                        />
                        <KpiCard
                            label="Total consumido"
                            value={(creditsData?.balance.consumed_credits ?? 0).toLocaleString("pt-BR")}
                            icon={TrendingUp}
                            color="text-red-500"
                            bg="bg-white"
                        />
                    </div>

                    <Card className="border-border/60">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Coins className="h-4 w-4 text-amber-600" />
                                Extrato de créditos — visitação, M1, leilões
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {(creditsData?.ledger ?? []).length === 0 ? (
                                <EmptyRow text="Sem movimentações de crédito" />
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/30">
                                            <TableHead>Tipo</TableHead>
                                            <TableHead>Motivo</TableHead>
                                            <TableHead>Descrição</TableHead>
                                            <TableHead className="text-right">Qtde</TableHead>
                                            <TableHead className="text-right">Saldo após</TableHead>
                                            <TableHead>Data</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {creditsData!.ledger.map((e: any) => {
                                            const credit = e.entry_type === "credit";
                                            return (
                                                <TableRow key={e.id}>
                                                    <TableCell>
                                                        <Badge className={`text-[10px] ${credit ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                                            {credit ? "Crédito" : "Débito"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-[10px] font-mono text-muted-foreground">
                                                        {e.reason_code || "—"}
                                                    </TableCell>
                                                    <TableCell className="text-xs max-w-[260px] truncate">
                                                        {e.description || "—"}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-sm font-bold">
                                                        <span className={credit ? "text-emerald-600" : "text-red-500"}>
                                                            {credit ? "+" : "−"}{e.amount}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-xs">
                                                        {e.balance_after ?? "—"}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">
                                                        {e.created_at ? new Date(e.created_at).toLocaleString("pt-BR") : "—"}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ─── ACESSOS ─── */}
                <TabsContent value="access" className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <KpiCard
                            label="Total de eventos"
                            value={clicksData?.totalEventos ?? 0}
                            icon={Activity}
                            color="text-zinc-700"
                            bg="bg-white"
                        />
                        <KpiCard
                            label="Cliques cobrados"
                            value={clicksData?.totalCobrados ?? 0}
                            icon={MousePointerClick}
                            color="text-emerald-600"
                            bg="bg-emerald-50"
                        />
                        <KpiCard
                            label="Créditos consumidos"
                            value={clicksData?.totalCreditosGastos ?? 0}
                            icon={Coins}
                            color="text-amber-600"
                            bg="bg-amber-50"
                        />
                        <KpiCard
                            label="Visitantes únicos"
                            value={clicksData?.visitantesUnicos ?? 0}
                            icon={User}
                            color="text-blue-600"
                            bg="bg-blue-50"
                        />
                    </div>

                    {clicksData?.counts && (
                        <Card className="border-border/60">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <BarChart3 className="h-4 w-4 text-orange-500" />
                                    Distribuição por status
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(clicksData.counts).map(([status, count]) => {
                                        const meta = CLICK_STATUS_LABEL[status] || { label: status, cls: "bg-zinc-100 text-zinc-600" };
                                        return (
                                            <Badge key={status} className={`${meta.cls} text-xs`}>
                                                {meta.label}: {count}
                                            </Badge>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Card className="border-border/60">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <MousePointerClick className="h-4 w-4 text-orange-500" />
                                Acessos recentes vindos de /mercado
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {(clicksData?.rows ?? []).length === 0 ? (
                                <EmptyRow text="Nenhum acesso registrado ainda" />
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/30">
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Créditos</TableHead>
                                            <TableHead>Origem</TableHead>
                                            <TableHead>Visitante</TableHead>
                                            <TableHead>Cidade / Bairro</TableHead>
                                            <TableHead>Data</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {clicksData!.rows.slice(0, 50).map((e: any) => {
                                            const meta = CLICK_STATUS_LABEL[e.status] || { label: e.status, cls: "bg-zinc-100 text-zinc-600" };
                                            const visitor = e.visitor_user_id
                                                ? `user ${String(e.visitor_user_id).slice(0, 8)}…`
                                                : e.anon_id
                                                ? `anon ${String(e.anon_id).slice(0, 8)}…`
                                                : "—";
                                            return (
                                                <TableRow key={e.id}>
                                                    <TableCell>
                                                        <Badge className={`text-[10px] ${meta.cls}`}>{meta.label}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-sm">
                                                        {e.credits_charged > 0 ? `−${e.credits_charged}` : "0"}
                                                    </TableCell>
                                                    <TableCell className="text-xs">{e.source || "—"}</TableCell>
                                                    <TableCell className="text-[10px] font-mono text-muted-foreground">{visitor}</TableCell>
                                                    <TableCell className="text-xs">
                                                        {e.city || "—"}{e.neighborhood ? ` · ${e.neighborhood}` : ""}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">
                                                        {e.created_at ? new Date(e.created_at).toLocaleString("pt-BR") : "—"}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ─── PRODUTOS ─── */}
                <TabsContent value="products">
                    <Card className="border-border/60">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Package className="h-4 w-4 text-blue-500" />
                                Produtos Cadastrados ({products.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {products.length === 0 ? (
                                <EmptyRow text="Nenhum produto cadastrado" icon={ShoppingBag} />
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/30">
                                                <TableHead>Produto</TableHead>
                                                <TableHead>Origem</TableHead>
                                                <TableHead>Preço</TableHead>
                                                <TableHead>Categoria</TableHead>
                                                <TableHead>Condição</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Criado</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {products.map((p: any) => (
                                                <TableRow key={p.id}>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            {normalizeImageUrl(p.image_url) ? (
                                                                <img src={normalizeImageUrl(p.image_url)!} alt="" className="h-8 w-8 rounded object-cover" />
                                                            ) : (
                                                                <div className="h-8 w-8 rounded bg-gray-100 flex items-center justify-center">
                                                                    <ShoppingBag className="h-4 w-4 text-gray-300" />
                                                                </div>
                                                            )}
                                                            <span className="text-sm font-medium truncate max-w-[200px]">{p.title}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {p.source === "advertiser" ? (
                                                            <Badge className="bg-violet-100 text-violet-700 text-[10px]">Anunciante</Badge>
                                                        ) : (
                                                            <Badge className="bg-blue-100 text-blue-700 text-[10px]">Vitrine</Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {p.price_label ? (
                                                            <span className="font-mono text-sm font-bold">R$ {p.price_label}</span>
                                                        ) : (
                                                            <span className="text-muted-foreground text-xs">Sob consulta</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell><span className="text-xs">{p.category || "—"}</span></TableCell>
                                                    <TableCell>
                                                        {p.condition === "novo" ? (
                                                            <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Novo</Badge>
                                                        ) : p.condition === "usado" ? (
                                                            <Badge className="bg-amber-100 text-amber-700 text-[10px]">Usado</Badge>
                                                        ) : (
                                                            <span className="text-muted-foreground text-xs">—</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {p.is_active ? (
                                                            <Badge className="bg-emerald-500/15 text-emerald-600 text-[10px]">Ativo</Badge>
                                                        ) : (
                                                            <Badge variant="destructive" className="text-[10px]">Inativo</Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">
                                                        {p.created_at ? new Date(p.created_at).toLocaleDateString("pt-BR") : "—"}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ─── M1 ─── */}
                <TabsContent value="m1">
                    <Card className="border-border/60">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Zap className="h-4 w-4 text-purple-500" />
                                Eventos M1 ({m1Events.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {m1Events.length === 0 ? (
                                <EmptyRow text="Nenhum evento M1 registrado" />
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/30">
                                            <TableHead>Tipo</TableHead>
                                            <TableHead className="text-right">Valor cobrado</TableHead>
                                            <TableHead>Data</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {m1Events.slice(0, 50).map((e: any, i: number) => (
                                            <TableRow key={e.id || i}>
                                                <TableCell>
                                                    <Badge variant="outline" className="text-xs">
                                                        {e.event_type || e.billing_type || "evento"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-sm font-bold text-emerald-600">
                                                    R$ {(e.charged_value || 0).toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {e.created_at ? new Date(e.created_at).toLocaleString("pt-BR") : "—"}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

// ─── helpers ──────────────────────────────────────────────
function InfoRow({ icon: Icon, label, value, mono }: { icon: any; label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground w-20 shrink-0">{label}:</span>
            <span className={`text-sm font-medium truncate ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
        </div>
    );
}

function KpiCard({ label, value, icon: Icon, color, bg }: { label: string; value: string | number; icon: any; color: string; bg?: string }) {
    return (
        <Card className={`border-border/60 ${bg ?? "bg-card/80"}`}>
            <CardContent className="flex items-center gap-3 py-3 px-4">
                <Icon className={`h-5 w-5 ${color} shrink-0`} />
                <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
                    <p className={`text-lg font-bold ${color} truncate`}>{value}</p>
                </div>
            </CardContent>
        </Card>
    );
}

interface NormalizedTx {
    id: string;
    positive: boolean;
    value: number;
    tipo: string | null;
    descricao: string;
    ref: string | null;
    created_at: string | null;
}

function TxTable({ txs }: { txs: NormalizedTx[] }) {
    return (
        <Card className="border-border/60">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                    <Bike className="h-4 w-4 text-emerald-600" />
                    Histórico de movimentações (R$) — chamadas de motoboy e recargas
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                {txs.length === 0 ? (
                    <EmptyRow text="Nenhuma movimentação financeira" />
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/30">
                                <TableHead>Tipo</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                                <TableHead>Referência</TableHead>
                                <TableHead>Data</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {txs.map((t) => (
                                <TableRow key={t.id}>
                                    <TableCell>
                                        <Badge variant="outline" className="text-[10px] uppercase">
                                            {t.tipo || (t.positive ? "credit" : "debit")}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs">{t.descricao}</TableCell>
                                    <TableCell className="text-right">
                                        <span className={`font-mono text-sm font-bold ${t.positive ? "text-emerald-600" : "text-red-500"}`}>
                                            {t.positive ? "+" : "−"}{fmtReais(t.value)}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-[10px] font-mono text-muted-foreground truncate max-w-[160px]">
                                        {t.ref || "—"}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {t.created_at ? new Date(t.created_at).toLocaleString("pt-BR") : "—"}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}

function EmptyRow({ text, icon: Icon = ShoppingBag }: { text: string; icon?: any }) {
    return (
        <div className="text-center py-10">
            <Icon className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{text}</p>
        </div>
    );
}
