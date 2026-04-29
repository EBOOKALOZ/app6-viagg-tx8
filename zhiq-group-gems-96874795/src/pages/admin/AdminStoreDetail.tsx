import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Store, ArrowLeft, Loader2, User, Mail, Phone, MapPin,
    Package, Zap, Calendar, Tag, ShoppingBag, ExternalLink, BarChart3,
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

export default function AdminStoreDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // Fetch store
    const { data: store, isLoading } = useQuery({
        queryKey: ["admin-store-detail", id],
        queryFn: async () => {
            const { data } = await (supabase.from("merchant_stores") as any)
                .select("*")
                .eq("id", id)
                .single();
            if (!data) return null;

            // Get profile
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

    // Fetch products
    const { data: products = [] } = useQuery({
        queryKey: ["admin-store-products", id],
        queryFn: async () => {
            const { data } = await (supabase.from("merchant_marketing_products") as any)
                .select("*")
                .eq("merchant_store_id", id)
                .order("created_at", { ascending: false });
            return data || [];
        },
        enabled: !!id,
    });

    // Fetch M1 events
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

            {/* Store Info + Owner Info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Store Info */}
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

                {/* Owner Info */}
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

            {/* KPI Strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Produtos" value={products.length} icon={Package} color="text-blue-500" />
                <KpiCard label="Eventos M1" value={m1Events.length} icon={Zap} color="text-purple-500" />
                <KpiCard label="M1 Cobrado" value={`R$ ${m1TotalCharged.toFixed(2)}`} icon={BarChart3} color="text-emerald-500" />
                <KpiCard label="Status" value={store.status || "ativo"} icon={Store} color="text-primary" />
            </div>

            {/* Products Table */}
            <Card className="border-border/60">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Package className="h-4 w-4 text-blue-500" />
                        Produtos Cadastrados ({products.length})
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {products.length === 0 ? (
                        <div className="text-center py-10">
                            <ShoppingBag className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">Nenhum produto cadastrado</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/30">
                                        <TableHead>Produto</TableHead>
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
                                                {p.price_label ? (
                                                    <span className="font-mono text-sm font-bold">R$ {p.price_label}</span>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">Sob consulta</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-xs">{p.category || "—"}</span>
                                            </TableCell>
                                            <TableCell>
                                                {p.condition === "novo" ? (
                                                    <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">✨ Novo</Badge>
                                                ) : p.condition === "usado" ? (
                                                    <Badge className="bg-amber-100 text-amber-700 text-[10px]">🔄 Usado</Badge>
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

            {/* M1 Events */}
            {m1Events.length > 0 && (
                <Card className="border-border/60">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Zap className="h-4 w-4 text-purple-500" />
                            Eventos M1 Recentes ({m1Events.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/30">
                                        <TableHead>Tipo</TableHead>
                                        <TableHead>Valor Cobrado</TableHead>
                                        <TableHead>Data</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {m1Events.slice(0, 20).map((e: any, i: number) => (
                                        <TableRow key={e.id || i}>
                                            <TableCell>
                                                <Badge variant="outline" className="text-xs">
                                                    {e.event_type || e.billing_type || "evento"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-mono text-sm font-bold text-emerald-600">
                                                    R$ {(e.charged_value || 0).toFixed(2)}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {e.created_at ? new Date(e.created_at).toLocaleString("pt-BR") : "—"}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

// Helper components
function InfoRow({ icon: Icon, label, value, mono }: { icon: any; label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground w-20 shrink-0">{label}:</span>
            <span className={`text-sm font-medium truncate ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
        </div>
    );
}

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
    return (
        <Card className="border-border/60 bg-card/80">
            <CardContent className="flex items-center gap-3 py-3 px-4">
                <Icon className={`h-5 w-5 ${color} shrink-0`} />
                <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
                    <p className={`text-lg font-bold ${color}`}>{value}</p>
                </div>
            </CardContent>
        </Card>
    );
}
