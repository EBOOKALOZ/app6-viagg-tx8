import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Coins, TrendingUp, TrendingDown, ShoppingCart, RefreshCw,
    Calendar, Zap, Package, Crown, AlertTriangle, Activity,
    ArrowUpCircle, ArrowDownCircle, Filter, Eye,
    Flame, Snowflake, Target,
} from "lucide-react";

// ═══════════════════════════════════════
// Types
// ═══════════════════════════════════════
interface CreditEntry {
    id?: string;
    credits: number;
    balance_after: number;
    reason: string;
    created_at: string | null;
    reference_type?: string;
    reference_id?: string;
}

interface CreditIntelligence {
    saldoAtual: number;
    totalComprado: number;
    totalGasto: number;
    totalRecargas: number;
    ticketMedio: number;
    ultimaRecarga: string | null;
    ultimaAtividade: string | null;
    ultimoPacote: string | null;
    // Commercial signals
    sinalComercial: CreditSignal[];
}

type CreditSignal = {
    key: string;
    label: string;
    color: string;
    icon: React.ElementType;
    description: string;
};

interface Props {
    store: {
        credit_balance: number;
        credits_earned: number;
        credits_spent: number;
        activity_badge: string;
        upgrade_signal: boolean;
        subscription_ready: boolean;
        days_since_last_activity: number | null;
        intention_count: number;
        order_count: number;
    };
    credits: CreditEntry[];
}

// ═══════════════════════════════════════
// Compute Intelligence
// ═══════════════════════════════════════
function computeIntelligence(store: Props["store"], credits: CreditEntry[]): CreditIntelligence {
    const recargas = credits.filter(c => c.credits > 0);
    const gastos = credits.filter(c => c.credits < 0);

    const totalComprado = recargas.reduce((sum, c) => sum + c.credits, 0);
    const totalGasto = Math.abs(gastos.reduce((sum, c) => sum + c.credits, 0));
    const totalRecargas = recargas.length;
    const ticketMedio = totalRecargas > 0 ? Math.round(totalComprado / totalRecargas) : 0;

    const sortedByDate = [...credits].sort((a, b) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
    const sortedRecargas = [...recargas].sort((a, b) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    const ultimaRecarga = sortedRecargas[0]?.created_at || null;
    const ultimaAtividade = sortedByDate[0]?.created_at || null;
    const ultimoPacote = sortedRecargas[0]?.reason || null;

    // ─── Commercial signals ───
    const signals: CreditSignal[] = [];

    // Saldo baixo + alta atividade
    if (store.credit_balance <= 20 && (store.activity_badge === "quente" || store.activity_badge === "ativa")) {
        signals.push({
            key: "upgrade_creditos",
            label: "Upgrade de Créditos",
            color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
            icon: ArrowUpCircle,
            description: `Saldo de ${store.credit_balance} créditos com atividade ${store.activity_badge}. Oportunidade de propor upgrade.`,
        });
    }

    // Muitas recargas → propor assinatura
    if (totalRecargas >= 3) {
        signals.push({
            key: "propor_assinatura",
            label: "Propor Assinatura",
            color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
            icon: Crown,
            description: `${totalRecargas} recargas realizadas. Perfil compatível com plano de assinatura recorrente.`,
        });
    }

    // Alto consumo com pouco saldo
    if (totalGasto > 50 && store.credit_balance <= 10) {
        signals.push({
            key: "alto_consumo",
            label: "Alto Consumo",
            color: "bg-red-500/20 text-red-400 border-red-500/30",
            icon: Flame,
            description: `${totalGasto} créditos consumidos com saldo atual de ${store.credit_balance}. Ponto de atenção.`,
        });
    }

    // Consumo ativo sem recarga recente
    if (totalGasto > 0 && ultimaRecarga) {
        const daysSinceRecarga = Math.floor((Date.now() - new Date(ultimaRecarga).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceRecarga > 15 && store.credit_balance <= 20) {
            signals.push({
                key: "atencao_comercial",
                label: "Atenção Comercial",
                color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
                icon: AlertTriangle,
                description: `Última recarga há ${daysSinceRecarga} dias. Saldo baixo e sem reposição. Risco de inatividade.`,
            });
        }
    }

    // Recarga sem conversão
    if (totalComprado > 30 && store.order_count === 0 && store.intention_count === 0) {
        signals.push({
            key: "acompanhar_retorno",
            label: "Acompanhar Retorno",
            color: "bg-sky-500/20 text-sky-400 border-sky-500/30",
            icon: Target,
            description: `${totalComprado} créditos comprados mas sem intenções ou pedidos. Acompanhar uso.`,
        });
    }

    // Sem saldo
    if (store.credit_balance <= 0) {
        signals.push({
            key: "sem_saldo",
            label: "Sem Saldo",
            color: "bg-red-500/20 text-red-400 border-red-500/30",
            icon: Snowflake,
            description: "Loja sem créditos disponíveis.",
        });
    }

    // Saldo saudável
    if (store.credit_balance > 50 && (store.activity_badge === "quente" || store.activity_badge === "ativa")) {
        signals.push({
            key: "saldo_saudavel",
            label: "Saldo Saudável",
            color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
            icon: Activity,
            description: `Saldo confortável de ${store.credit_balance} créditos com boa atividade.`,
        });
    }

    return {
        saldoAtual: store.credit_balance,
        totalComprado,
        totalGasto,
        totalRecargas,
        ticketMedio,
        ultimaRecarga,
        ultimaAtividade,
        ultimoPacote,
        sinalComercial: signals,
    };
}

// ═══════════════════════════════════════
// Reason Badge
// ═══════════════════════════════════════
function ReasonBadge({ reason }: { reason: string }) {
    const r = (reason || "").toLowerCase();
    if (r.includes("compra") || r.includes("purchase") || r.includes("recarga") || r.includes("pacote")) {
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px] gap-0.5"><ShoppingCart className="h-2.5 w-2.5" />Compra</Badge>;
    }
    if (r.includes("intenção") || r.includes("intention") || r.includes("intencao")) {
        return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[9px] gap-0.5"><Zap className="h-2.5 w-2.5" />Intenção</Badge>;
    }
    if (r.includes("leilão") || r.includes("leilao") || r.includes("auction")) {
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[9px] gap-0.5"><Package className="h-2.5 w-2.5" />Leilão</Badge>;
    }
    if (r.includes("arremate")) {
        return <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30 text-[9px] gap-0.5"><Crown className="h-2.5 w-2.5" />Arremate</Badge>;
    }
    if (r.includes("campanha") || r.includes("campaign")) {
        return <Badge className="bg-sky-500/20 text-sky-400 border-sky-500/30 text-[9px] gap-0.5"><Target className="h-2.5 w-2.5" />Campanha</Badge>;
    }
    if (r.includes("bônus") || r.includes("bonus") || r.includes("promocional")) {
        return <Badge className="bg-pink-500/20 text-pink-400 border-pink-500/30 text-[9px] gap-0.5"><TrendingUp className="h-2.5 w-2.5" />Bônus</Badge>;
    }
    return <Badge className="bg-zinc-700/40 text-zinc-400 border-zinc-600/30 text-[9px]">{reason?.slice(0, 24) || "—"}</Badge>;
}

// ═══════════════════════════════════════
// KPI Card
// ═══════════════════════════════════════
function CreditKpi({ label, value, sub, color, icon: Icon }: {
    label: string; value: string | number; sub?: string;
    color: string; icon: React.ElementType;
}) {
    return (
        <div className="flex items-start gap-2.5 bg-zinc-900/80 border border-zinc-800/60 rounded-xl px-3.5 py-3">
            <Icon className={`h-4 w-4 mt-0.5 ${color} shrink-0`} />
            <div className="min-w-0">
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-bold leading-tight">{label}</p>
                <p className={`text-lg font-bold leading-tight ${color}`}>{value}</p>
                {sub && <p className="text-[9px] text-zinc-600 truncate mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════
export function CreditIntelligenceBlock({ store, credits }: Props) {
    const [filterType, setFilterType] = useState<"all" | "compra" | "gasto">("all");

    const intel = useMemo(() => computeIntelligence(store, credits), [store, credits]);

    const sortedCredits = useMemo(() => {
        const sorted = [...credits].sort((a, b) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        if (filterType === "compra") return sorted.filter(c => c.credits > 0);
        if (filterType === "gasto") return sorted.filter(c => c.credits < 0);
        return sorted;
    }, [credits, filterType]);

    const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";
    const fmtDateTime = (d: string | null) => d
        ? `${new Date(d).toLocaleDateString("pt-BR")} ${new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
        : "—";

    // Saldo color
    const saldoColor = store.credit_balance <= 0
        ? "text-red-400"
        : store.credit_balance <= 20
            ? "text-amber-400"
            : "text-emerald-400";

    return (
        <Card className="bg-gradient-to-br from-zinc-900/80 via-zinc-900/60 to-zinc-950/80 border-zinc-800/60 border-l-4 border-l-amber-500/50 shadow-xl">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm text-zinc-200 flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
                        <Coins className="h-4 w-4 text-amber-400" />
                    </div>
                    Créditos e Consumo
                    <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700 text-[9px] ml-auto">
                        {credits.length} movimentações
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* ─── KPI Grid ─── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <CreditKpi
                        label="Saldo Atual"
                        value={intel.saldoAtual}
                        icon={Coins}
                        color={saldoColor}
                    />
                    <CreditKpi
                        label="Total Comprado"
                        value={intel.totalComprado}
                        icon={TrendingUp}
                        color="text-emerald-400"
                    />
                    <CreditKpi
                        label="Total Gasto"
                        value={intel.totalGasto}
                        icon={TrendingDown}
                        color="text-red-400"
                    />
                    <CreditKpi
                        label="Recargas"
                        value={intel.totalRecargas}
                        sub={intel.ticketMedio > 0 ? `Ticket médio: ${intel.ticketMedio}` : undefined}
                        icon={RefreshCw}
                        color="text-sky-400"
                    />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <CreditKpi
                        label="Ticket Médio"
                        value={intel.ticketMedio > 0 ? intel.ticketMedio : "—"}
                        icon={ShoppingCart}
                        color="text-blue-400"
                    />
                    <CreditKpi
                        label="Última Recarga"
                        value={fmtDate(intel.ultimaRecarga)}
                        icon={Calendar}
                        color="text-zinc-300"
                    />
                    <CreditKpi
                        label="Última Atividade"
                        value={fmtDate(intel.ultimaAtividade)}
                        icon={Activity}
                        color="text-zinc-300"
                    />
                    <CreditKpi
                        label="Último Pacote"
                        value={intel.ultimoPacote?.slice(0, 20) || "—"}
                        icon={Package}
                        color="text-purple-400"
                    />
                </div>

                {/* ─── Commercial Signals ─── */}
                {intel.sinalComercial.length > 0 && (
                    <div className="bg-zinc-950/60 border border-zinc-800/50 rounded-lg p-3 space-y-2">
                        <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-bold flex items-center gap-1.5">
                            <Zap className="h-3 w-3 text-amber-400" />
                            Sinais Comerciais de Crédito
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {intel.sinalComercial.map(s => (
                                <Badge key={s.key} className={`${s.color} text-[10px] gap-1 px-2 py-0.5`}>
                                    <s.icon className="h-3 w-3" />
                                    {s.label}
                                </Badge>
                            ))}
                        </div>
                        <div className="space-y-1 mt-2">
                            {intel.sinalComercial.map(s => (
                                <p key={s.key} className="text-[10px] text-zinc-500 flex items-start gap-1.5">
                                    <s.icon className="h-3 w-3 shrink-0 mt-0.5" style={{ opacity: 0.6 }} />
                                    {s.description}
                                </p>
                            ))}
                        </div>
                    </div>
                )}

                {/* ─── Filter Buttons ─── */}
                <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-zinc-600" />
                    <div className="flex gap-1">
                        {([
                            { key: "all", label: "Todos" },
                            { key: "compra", label: "Compras" },
                            { key: "gasto", label: "Gastos" },
                        ] as const).map(f => (
                            <Button
                                key={f.key}
                                variant="ghost"
                                size="sm"
                                className={`h-6 text-[10px] px-2.5 ${filterType === f.key
                                    ? "bg-primary/15 text-primary border border-primary/30"
                                    : "text-zinc-500 hover:text-zinc-300"}`}
                                onClick={() => setFilterType(f.key)}
                            >
                                {f.label}
                            </Button>
                        ))}
                    </div>
                    <span className="text-[10px] text-zinc-600 ml-auto">
                        {sortedCredits.length} registros
                    </span>
                </div>

                {/* ─── History Table ─── */}
                {sortedCredits.length > 0 ? (
                    <div className="overflow-x-auto max-h-72 rounded-lg border border-zinc-800/40">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-zinc-900/80 border-zinc-800">
                                    <TableHead className="text-[10px] text-zinc-500 font-bold">Data</TableHead>
                                    <TableHead className="text-[10px] text-zinc-500 font-bold">Tipo</TableHead>
                                    <TableHead className="text-[10px] text-zinc-500 font-bold text-right">Qtde</TableHead>
                                    <TableHead className="text-[10px] text-zinc-500 font-bold text-right">Saldo</TableHead>
                                    <TableHead className="text-[10px] text-zinc-500 font-bold">Descrição</TableHead>
                                    <TableHead className="text-[10px] text-zinc-500 font-bold">Origem</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedCredits.slice(0, 25).map((c, i) => {
                                    const isPositive = c.credits > 0;
                                    return (
                                        <TableRow key={c.id || i} className="border-zinc-800/40 hover:bg-zinc-800/30 transition-colors">
                                            <TableCell className="text-[10px] text-zinc-400 whitespace-nowrap">
                                                {fmtDateTime(c.created_at)}
                                            </TableCell>
                                            <TableCell>
                                                {isPositive ? (
                                                    <div className="flex items-center gap-1">
                                                        <ArrowUpCircle className="h-3 w-3 text-emerald-400" />
                                                        <span className="text-[10px] text-emerald-400 font-semibold">Entrada</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1">
                                                        <ArrowDownCircle className="h-3 w-3 text-red-400" />
                                                        <span className="text-[10px] text-red-400 font-semibold">Saída</span>
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <span className={`text-xs font-mono font-bold ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                                                    {isPositive ? "+" : ""}{c.credits}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <span className="text-xs font-mono text-zinc-400">{c.balance_after}</span>
                                            </TableCell>
                                            <TableCell className="max-w-[180px]">
                                                <span className="text-[10px] text-zinc-400 truncate block">{c.reason || "—"}</span>
                                            </TableCell>
                                            <TableCell>
                                                <ReasonBadge reason={c.reason} />
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="text-center py-8 bg-zinc-900/40 rounded-lg border border-zinc-800/30">
                        <Coins className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                        <p className="text-xs text-zinc-600">Nenhuma movimentação de créditos</p>
                    </div>
                )}

                {/* ─── Footer Actions (prepared for future) ─── */}
                {sortedCredits.length > 25 && (
                    <div className="flex justify-center pt-1">
                        <Button variant="ghost" size="sm" className="text-[10px] text-zinc-500 hover:text-primary gap-1.5">
                            <Eye className="h-3 w-3" />
                            Ver histórico completo ({credits.length} registros)
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
