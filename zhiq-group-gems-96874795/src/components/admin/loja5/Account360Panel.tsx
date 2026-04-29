import { Account360Row, Store360Row, useAccount360 } from "@/hooks/useAdminLoja5";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, User, Mail, Phone, Calendar, Store, ArrowLeft, Users, X } from "lucide-react";

interface Account360PanelProps {
    userId: string;
    onClose: () => void;
    onViewStore?: (storeId: string) => void;
}

export function Account360Panel({ userId, onClose, onViewStore }: Account360PanelProps) {
    const { data, isLoading } = useAccount360(userId);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="text-center py-16">
                <User className="h-10 w-10 text-zinc-700 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">Conta não encontrada</p>
                <Button variant="ghost" size="sm" className="mt-3 text-zinc-400" onClick={onClose}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
            </div>
        );
    }

    const acc = data.account;

    return (
        <div className="space-y-5 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={onClose} className="text-zinc-400 hover:text-white">
                    <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <User className="h-5 w-5 text-primary" />
                        Conta 360 — {acc.user_name || "Sem nome"}
                    </h2>
                    <p className="text-[10px] text-zinc-500 font-mono ml-7">ID: {acc.user_id}</p>
                </div>
                {acc.is_multi_profile && (
                    <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30 text-[10px]">
                        🔗 Multi-Perfil
                    </Badge>
                )}
                <Button variant="ghost" size="icon" onClick={onClose} className="text-zinc-500 hover:text-white shrink-0">
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Account Info */}
            <Card className="bg-zinc-900/60 border-zinc-800/60">
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-zinc-400 flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-primary" /> Dados da Conta
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                    <InfoRow icon={User} label="Nome" value={acc.user_name || "—"} />
                    <InfoRow icon={Mail} label="Email" value={acc.email || "—"} />
                    <InfoRow icon={Phone} label="Telefone" value={acc.phone || "—"} />
                    <InfoRow icon={Calendar} label="Criado em" value={acc.created_at ? new Date(acc.created_at).toLocaleDateString("pt-BR") : "—"} />
                    <InfoRow icon={Users} label="Perfis" value={acc.profile_types.length ? acc.profile_types.join(", ") : "Nenhum"} />
                    <InfoRow icon={Store} label="Lojas" value={String(acc.store_count)} />
                </CardContent>
            </Card>

            {/* Profile Types */}
            <Card className="bg-zinc-900/60 border-zinc-800/60">
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-zinc-400 flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-indigo-400" /> Perfis Vinculados ({acc.profile_count})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-2">
                        {acc.profile_types.map((pt) => (
                            <Badge key={pt} className="bg-zinc-800/60 text-zinc-300 border-zinc-700/60 text-xs px-3 py-1">
                                {profileLabel(pt)}
                            </Badge>
                        ))}
                        {acc.profile_types.length === 0 && (
                            <span className="text-xs text-zinc-600">Nenhum perfil vinculado</span>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Stores */}
            <Card className="bg-zinc-900/60 border-zinc-800/60">
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-zinc-400 flex items-center gap-1.5">
                        <Store className="h-3.5 w-3.5 text-emerald-400" /> Lojas desta Conta ({data.stores.length})
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {data.stores.length === 0 ? (
                        <p className="text-xs text-zinc-600 text-center py-4">Nenhuma loja</p>
                    ) : (
                        data.stores.map((store) => (
                            <div
                                key={store.store_id}
                                className="flex items-center justify-between gap-3 bg-zinc-800/40 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-zinc-800/60 transition-colors"
                                onClick={() => onViewStore?.(store.store_id)}
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-zinc-200 font-medium truncate">{store.store_name || "Loja sem nome"}</p>
                                    <p className="text-[10px] text-zinc-500">{store.city || "—"}{store.state ? ` - ${store.state}` : ""} • {store.active_product_count} produtos • R$ {(store.estimated_revenue || 0).toFixed(2)} receita</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <ActivityBadgeMini badge={store.activity_badge} />
                                    {store.upgrade_signal && <Badge className="bg-amber-500/20 text-amber-400 text-[9px]">⬆</Badge>}
                                    {store.churn_signal && <Badge className="bg-red-500/20 text-red-400 text-[9px]">⚠</Badge>}
                                </div>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// Helpers
function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
    return (
        <div className="flex items-center gap-2.5 py-0.5">
            <Icon className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
            <span className="text-[11px] text-zinc-500 w-24 shrink-0 font-medium">{label}</span>
            <span className="text-[13px] text-zinc-200 font-medium truncate">{value}</span>
        </div>
    );
}

function ActivityBadgeMini({ badge }: { badge: string }) {
    const cfg: Record<string, { label: string; color: string }> = {
        quente: { label: "🔥", color: "bg-red-500/20 text-red-400" },
        ativa: { label: "✅", color: "bg-emerald-500/20 text-emerald-400" },
        morna: { label: "🟡", color: "bg-amber-500/20 text-amber-400" },
        fria: { label: "❄️", color: "bg-blue-500/20 text-blue-400" },
        sem_movimento: { label: "⏸", color: "bg-zinc-600/30 text-zinc-500" },
    };
    const c = cfg[badge] || cfg.sem_movimento;
    return <Badge className={`${c.color} text-[9px] px-1.5`}>{c.label}</Badge>;
}

function profileLabel(type: string): string {
    const map: Record<string, string> = {
        motoboy: "🏍 Motoboy",
        merchant: "🏪 Lojista",
        driver: "🚗 Motorista",
        passenger: "🚶 Passageiro",
        mototaxi: "⚡ Moto-Táxi",
        freteiro: "🚛 Freteiro",
    };
    return map[type] || type;
}
