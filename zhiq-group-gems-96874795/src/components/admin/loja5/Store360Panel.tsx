import { Store360Detail, Store360Row } from "@/hooks/useAdminLoja5";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Store, User, ShoppingBag, Package, Zap, Coins, Gavel, Tag,
    MapPin, Mail, Phone, Calendar, ArrowLeft, TrendingUp, AlertTriangle,
    Flame, Snowflake, Activity, Users, Truck, Eye, Crown, X,
} from "lucide-react";
import { CreditIntelligenceBlock } from "./CreditIntelligenceBlock";

// ═══════════════════════════════════════
// Activity Badge Component
// ═══════════════════════════════════════
const activityConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    quente: { label: "Quente", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: Flame },
    ativa: { label: "Ativa", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: Activity },
    morna: { label: "Morna", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: TrendingUp },
    fria: { label: "Fria", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Snowflake },
    sem_movimento: { label: "Sem Movimento", color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30", icon: AlertTriangle },
};

function ActivityBadge({ badge }: { badge: string }) {
    const cfg = activityConfig[badge] || activityConfig.sem_movimento;
    return (
        <Badge className={`${cfg.color} text-[10px] gap-1`}>
            <cfg.icon className="h-3 w-3" />
            {cfg.label}
        </Badge>
    );
}

function SignalBadge({ active, label, color }: { active: boolean; label: string; color: string }) {
    if (!active) return <span className="text-[10px] text-zinc-600">—</span>;
    return <Badge className={`${color} text-[10px]`}>{label}</Badge>;
}

// ═══════════════════════════════════════
// Info Row
// ═══════════════════════════════════════
function InfoRow({ icon: Icon, label, value, mono }: { icon: any; label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-center gap-2.5 py-1">
            <Icon className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
            <span className="text-[11px] text-zinc-500 w-28 shrink-0 font-medium">{label}</span>
            <span className={`text-[13px] text-zinc-200 font-medium truncate ${mono ? "font-mono text-[11px]" : ""}`}>{value}</span>
        </div>
    );
}

// ═══════════════════════════════════════
// KPI Mini Card
// ═══════════════════════════════════════
function KpiMini({ label, value, color, icon: Icon }: { label: string; value: string | number; color: string; icon: any }) {
    return (
        <div className="flex items-center gap-2.5 bg-zinc-900/80 border border-zinc-800/60 rounded-lg px-3 py-2.5">
            <Icon className={`h-4 w-4 ${color} shrink-0`} />
            <div>
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-bold">{label}</p>
                <p className={`text-base font-bold ${color}`}>{value}</p>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════
interface Store360PanelProps {
    data: Store360Detail;
    onClose: () => void;
    onViewAccount?: (userId: string) => void;
}

export function Store360Panel({ data, onClose, onViewAccount }: Store360PanelProps) {
    const s = data.store;
    const acc = data.account;

    return (
        <div className="space-y-5 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={onClose} className="text-zinc-400 hover:text-white">
                    <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        {s.logo_url ? (
                            <img src={s.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover ring-1 ring-zinc-700" />
                        ) : (
                            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-zinc-700">
                                <Store className="h-4 w-4 text-primary" />
                            </div>
                        )}
                        <h2 className="text-lg font-bold text-white truncate">{s.store_name || "Loja sem nome"}</h2>
                        <ActivityBadge badge={s.activity_badge} />
                    </div>
                    <p className="text-[10px] text-zinc-500 font-mono ml-10">ID: {s.store_id}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} className="text-zinc-500 hover:text-white shrink-0">
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* KPI Strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
                <KpiMini label="Produtos Ativos" value={s.active_product_count} color="text-blue-400" icon={Package} />
                <KpiMini label="Intenções" value={s.intention_count} color="text-purple-400" icon={ShoppingBag} />
                <KpiMini label="Pedidos" value={s.order_count} color="text-emerald-400" icon={Zap} />
                <KpiMini label="Saldo Créditos" value={s.credit_balance} color={s.credit_balance <= 5 ? "text-red-400" : "text-amber-400"} icon={Coins} />
                <KpiMini label="Receita" value={`R$ ${s.estimated_revenue.toFixed(2)}`} color="text-emerald-400" icon={TrendingUp} />
                <KpiMini label="Entregas" value={s.delivery_count} color="text-sky-400" icon={Truck} />
            </div>

            {/* Signals */}
            <div className="flex flex-wrap gap-2 bg-zinc-900/60 border border-zinc-800/60 rounded-lg p-3">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mr-2 self-center">Sinais:</span>
                <SignalBadge active={s.upgrade_signal} label="⬆ Upgrade" color="bg-amber-500/20 text-amber-400 border-amber-500/30" />
                <SignalBadge active={s.churn_signal} label="⚠ Churn" color="bg-red-500/20 text-red-400 border-red-500/30" />
                <SignalBadge active={s.subscription_ready} label="👑 Assinatura" color="bg-purple-500/20 text-purple-400 border-purple-500/30" />
                <SignalBadge active={s.traffic_no_conversion} label="👁 Tráfego s/ Conversão" color="bg-orange-500/20 text-orange-400 border-orange-500/30" />
                <SignalBadge active={s.new_no_activation} label="🆕 Sem Ativação" color="bg-zinc-600/30 text-zinc-400 border-zinc-600/40" />
                <SignalBadge active={s.multi_profile_strategic} label="🔗 Multi-Perfil" color="bg-indigo-500/20 text-indigo-400 border-indigo-500/30" />
            </div>

            {/* Two-column: Identity + Account */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Identity */}
                <Card className="bg-zinc-900/60 border-zinc-800/60">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs text-zinc-400 flex items-center gap-1.5">
                            <Store className="h-3.5 w-3.5 text-primary" /> Identidade da Loja
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-0.5">
                        <InfoRow icon={Store} label="Nome" value={s.store_name || "—"} />
                        <InfoRow icon={MapPin} label="Cidade / UF" value={`${s.city || "—"}${s.state ? ` - ${s.state}` : ""}`} />
                        {s.bairro && <InfoRow icon={MapPin} label="Bairro" value={s.bairro} />}
                        <InfoRow icon={Tag} label="Categoria" value={s.category || "—"} />
                        <InfoRow icon={Tag} label="CNPJ" value={s.cnpj || "—"} />
                        <InfoRow icon={Calendar} label="Criada em" value={s.created_at ? new Date(s.created_at).toLocaleDateString("pt-BR") : "—"} />
                        <InfoRow icon={Activity} label="Última atividade" value={s.days_since_last_activity != null ? `${s.days_since_last_activity} dias atrás` : "Nunca"} />
                    </CardContent>
                </Card>

                {/* Account */}
                <Card className="bg-zinc-900/60 border-zinc-800/60">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs text-zinc-400 flex items-center gap-1.5 justify-between">
                            <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-primary" /> Conta Responsável</span>
                            {acc && s.user_id && onViewAccount && (
                                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary" onClick={() => onViewAccount(s.user_id!)}>
                                    <Eye className="h-3 w-3 mr-1" /> Conta 360
                                </Button>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-0.5">
                        <InfoRow icon={User} label="Nome" value={s.owner_name || "—"} />
                        <InfoRow icon={Mail} label="Email" value={s.owner_email || "—"} />
                        <InfoRow icon={Phone} label="Telefone" value={s.owner_phone || "—"} />
                        <InfoRow icon={User} label="user_id" value={s.user_id || "—"} mono />
                        <InfoRow icon={Users} label="Perfis" value={s.profile_types.length ? s.profile_types.join(", ") : "—"} />
                        {acc && (
                            <InfoRow icon={Store} label="Lojas da Conta" value={String(acc.store_count)} />
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Credits & Consumption — Premium Intelligence Block */}
            <CreditIntelligenceBlock store={s} credits={data.credits} />

            {/* Products */}
            <Card className="bg-zinc-900/60 border-zinc-800/60">
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-zinc-400 flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-blue-400" /> Produtos ({s.product_count} total, {s.active_product_count} ativos)
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {data.products.length === 0 ? (
                        <div className="text-center py-8">
                            <ShoppingBag className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                            <p className="text-xs text-zinc-600">Nenhum produto</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto max-h-60">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-zinc-800">
                                        <TableHead className="text-[10px] text-zinc-500">Produto</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500">Preço</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500">Status</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500">Criado</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.products.slice(0, 20).map((p: any, i: number) => (
                                        <TableRow key={p.id || i} className="border-zinc-800/50">
                                            <TableCell>
                                                <span className="text-xs text-zinc-200 truncate block max-w-[200px]">{p.title || "—"}</span>
                                            </TableCell>
                                            <TableCell className="text-xs font-mono text-zinc-300">{p.price_label ? `R$ ${p.price_label}` : "—"}</TableCell>
                                            <TableCell>
                                                {p.is_active ? (
                                                    <Badge className="bg-emerald-500/20 text-emerald-400 text-[9px]">Ativo</Badge>
                                                ) : (
                                                    <Badge className="bg-zinc-700/40 text-zinc-500 text-[9px]">Inativo</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-[10px] text-zinc-500">
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

            {/* Intentions */}
            {data.intentions.length > 0 && (
                <Card className="bg-zinc-900/60 border-zinc-800/60">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs text-zinc-400 flex items-center gap-1.5">
                            <ShoppingBag className="h-3.5 w-3.5 text-purple-400" /> Intenções Recentes ({data.intentions.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto max-h-48">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-zinc-800">
                                        <TableHead className="text-[10px] text-zinc-500">Cliente</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500">Itens</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500">Valor</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500">Status</TableHead>
                                        <TableHead className="text-[10px] text-zinc-500">Data</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.intentions.slice(0, 15).map((intent: any, i: number) => (
                                        <TableRow key={intent.id || i} className="border-zinc-800/50">
                                            <TableCell className="text-xs text-zinc-300 truncate max-w-[120px]">{intent.customer_name || "—"}</TableCell>
                                            <TableCell className="text-xs text-zinc-400">{intent.total_items}</TableCell>
                                            <TableCell className="text-xs font-mono text-emerald-400">R$ {(intent.subtotal || 0).toFixed(2)}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-[9px] text-zinc-400">{intent.status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-[10px] text-zinc-500">{intent.created_at ? new Date(intent.created_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Auctions + Arremates */}
            {(data.auctions.length > 0 || data.arremates.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {data.auctions.length > 0 && (
                        <Card className="bg-zinc-900/60 border-zinc-800/60">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs text-zinc-400 flex items-center gap-1.5">
                                    <Gavel className="h-3.5 w-3.5 text-amber-400" /> Leilões ({data.auctions.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {data.auctions.slice(0, 5).map((a: any, i: number) => (
                                    <div key={a.id || i} className="flex items-center justify-between gap-2 bg-zinc-800/40 rounded-lg px-3 py-2">
                                        <div className="min-w-0">
                                            <p className="text-xs text-zinc-200 truncate">{a.title}</p>
                                            <p className="text-[10px] text-zinc-500">Lance: R$ {(a.current_bid || a.starting_price || 0).toFixed(2)}</p>
                                        </div>
                                        <Badge className={a.status === "active" ? "bg-emerald-500/20 text-emerald-400 text-[9px]" : "bg-zinc-700/40 text-zinc-500 text-[9px]"}>
                                            {a.status}
                                        </Badge>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                    {data.arremates.length > 0 && (
                        <Card className="bg-zinc-900/60 border-zinc-800/60">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs text-zinc-400 flex items-center gap-1.5">
                                    <Crown className="h-3.5 w-3.5 text-purple-400" /> Arremates ({data.arremates.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {data.arremates.slice(0, 5).map((ar: any, i: number) => (
                                    <div key={ar.id || i} className="flex items-center justify-between gap-2 bg-zinc-800/40 rounded-lg px-3 py-2">
                                        <div className="min-w-0">
                                            <p className="text-xs text-zinc-200 truncate">{ar.title}</p>
                                            <p className="text-[10px] text-zinc-500">Pedido: R$ {(ar.asking_price || 0).toFixed(2)}</p>
                                        </div>
                                        <Badge className={ar.status === "active" ? "bg-emerald-500/20 text-emerald-400 text-[9px]" : "bg-zinc-700/40 text-zinc-500 text-[9px]"}>
                                            {ar.status}
                                        </Badge>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {/* Strategic Reading */}
            <Card className="bg-gradient-to-r from-zinc-900/80 to-zinc-900/40 border-zinc-800/60 border-l-4 border-l-primary/50">
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-zinc-400 flex items-center gap-1.5">
                        📊 Leitura Estratégica
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {s.traffic_no_conversion && (
                        <p className="text-[11px] text-orange-400 flex items-center gap-1.5">
                            <Eye className="h-3 w-3" /> Tráfego alto ({s.intention_count} intenções) mas sem conversão em pedidos. Oportunidade de abordagem comercial.
                        </p>
                    )}
                    {s.upgrade_signal && s.credit_balance <= 5 && (
                        <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
                            <Coins className="h-3 w-3" /> Saldo baixo ({s.credit_balance} créditos) com alta intenção. Pronta para upgrade de créditos.
                        </p>
                    )}
                    {s.multi_profile_strategic && (
                        <p className="text-[11px] text-indigo-400 flex items-center gap-1.5">
                            <Users className="h-3 w-3" /> Conta multi-perfil ({s.profile_types.join(", ")}). Alto potencial de cross-sell.
                        </p>
                    )}
                    {s.subscription_ready && (
                        <p className="text-[11px] text-purple-400 flex items-center gap-1.5">
                            <Crown className="h-3 w-3" /> Loja madura com receita consistente. Pronta para assinatura premium.
                        </p>
                    )}
                    {s.churn_signal && (
                        <p className="text-[11px] text-red-400 flex items-center gap-1.5">
                            <AlertTriangle className="h-3 w-3" /> Risco de churn: loja ativa anteriormente, agora sem movimento há {s.days_since_last_activity || "30+"} dias.
                        </p>
                    )}
                    {s.new_no_activation && (
                        <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                            <Store className="h-3 w-3" /> Loja nova sem ativação: criada mas sem produtos cadastrados.
                        </p>
                    )}
                    {!s.traffic_no_conversion && !s.upgrade_signal && !s.multi_profile_strategic && !s.subscription_ready && !s.churn_signal && !s.new_no_activation && (
                        <p className="text-[11px] text-zinc-500">Sem sinais especiais no momento.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
