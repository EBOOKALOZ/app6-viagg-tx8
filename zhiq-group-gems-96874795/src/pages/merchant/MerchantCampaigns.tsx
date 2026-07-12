import { useState, useRef } from "react";
import {
    Megaphone, RefreshCw, CheckCircle, Clock, Users,
    AlertTriangle, TrendingUp, Sparkles, Plus, Send,
    Loader2, Pencil, Trash2, Eye, Upload, X, MapPin,
    Link as LinkIcon, ImagePlus, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLojistaCampaigns, deriveCampaignStatus } from "@/hooks/useLojistaCampaigns";
import LojistaCampaignCard from "@/components/merchant/LojistaCampaignCard";
import ProductShowcase from "@/components/merchant/ProductShowcase";
import PromotionSlotCard from "@/components/merchant/PromotionSlotCard";
import type { PromotionSlotCardRef } from "@/components/merchant/PromotionSlotCard";
import MarketplaceLandingCard from "@/components/merchant/MarketplaceLandingCard";
import { MerchantRecentEvents } from "@/components/merchant/MerchantRecentEvents";

// ─── Image URL Helper ─────────────────────────────
function normalizeImageUrl(url: string | null | undefined): string | null {
    if (!url || typeof url !== "string") return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    const driveViewMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveViewMatch) return `https://drive.google.com/uc?export=view&id=${driveViewMatch[1]}`;
    const driveOpenMatch = trimmed.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
    if (driveOpenMatch) return `https://drive.google.com/uc?export=view&id=${driveOpenMatch[1]}`;
    if (!/^https?:\/\//i.test(trimmed)) return null;
    return trimmed;
}

// ─── Interfaces ─────────────────────────────────
interface MarketingProduct {
    id: string;
    merchant_store_id: string | null;
    created_by_user_id: string;
    title: string;
    short_description: string | null;
    image_url: string | null;
    video_url: string | null;
    external_link: string | null;
    price_label: string | null;
    cta_label: string | null;
    target_city: string | null;
    target_region: string | null;
    campaign_type: string | null;
    is_active: boolean;
    created_at: string;
}

// ═══════════════════════════════════════
// PAGE — Campanhas (unified hub)
// ═══════════════════════════════════════
export default function MerchantCampaigns() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const lojista = useLojistaCampaigns();
    const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);

    // ── Central de divulgações: gratuita diária + saldo de pacotes (RPC) ──
    const { data: divStatus, refetch: refetchDivStatus } = useQuery({
        queryKey: ["divulgacao-status", user?.id],
        enabled: !!user?.id,
        refetchInterval: 60_000,
        queryFn: async () => {
            const { data, error } = await (supabase.rpc as any)("divulgacao_status");
            if (error) throw error;
            return data as any;
        },
    });

    // ── Material form state ──
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [adTitle, setAdTitle] = useState("");
    const [adDescription, setAdDescription] = useState("");
    const [adPrice, setAdPrice] = useState("");
    const [adImageUrl, setAdImageUrl] = useState("");
    const [adVideoUrl, setAdVideoUrl] = useState("");
    const [adCta, setAdCta] = useState("Peça agora!");
    const [adCity, setAdCity] = useState("");
    const [adRegion, setAdRegion] = useState("");
    const [adType, setAdType] = useState("offer");
    const [adExternalLink, setAdExternalLink] = useState("");
    const [adImageFile, setAdImageFile] = useState<File | null>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const promotionSlotRef = useRef<PromotionSlotCardRef>(null);

    // ── Dispatch state ──
    const [isDispatchOpen, setIsDispatchOpen] = useState(false);
    const [selectedAdId, setSelectedAdId] = useState("");
    const [customPitch, setCustomPitch] = useState("");
    const [isDispatching, setIsDispatching] = useState(false);

    // ── Queries ──
    const { data: merchantStore } = useQuery({
        queryKey: ["merchant-store-marketing", user?.id],
        queryFn: async () => {
            // Try to find existing merchant_stores record
            const { data, error: selErr } = await (supabase.from("merchant_stores") as any)
                .select("*")
                .eq("user_id", user!.id)
                .limit(1)
                .maybeSingle();
            if (selErr) console.error("[MerchantCampaigns] Select error:", selErr);
            if (data) return data;

            // If no merchant_stores record, auto-create from profiles data
            const { data: profile } = await (supabase.from("profiles") as any)
                .select("full_name, nome_loja, cidade, estado, bairro, rua, cep, categoria, logo_url")
                .eq("id", user!.id)
                .single();
            
            const storeName = profile?.nome_loja || profile?.full_name || "Minha Loja";

            // Attempt full insert
            const { data: newStore, error: insertErr } = await (supabase.from("merchant_stores") as any)
                .insert({
                    user_id: user!.id,
                    nome_loja: storeName,
                    store_name: storeName,
                    cidade: profile?.cidade || null,
                    city: profile?.cidade || null,
                    estado: profile?.estado || null,
                    region: profile?.estado || null,
                    bairro: profile?.bairro || null,
                    rua: profile?.rua || null,
                    cep: profile?.cep || null,
                    categoria: profile?.categoria || null,
                    logo_url: profile?.logo_url || null,
                })
                .select("*")
                .single();
            
            if (!insertErr && newStore) return newStore;
            console.error("[MerchantCampaigns] Full insert error:", insertErr);

            // Retry with minimal columns (in case some columns don't exist)
            const { data: minStore, error: minErr } = await (supabase.from("merchant_stores") as any)
                .insert({
                    user_id: user!.id,
                    nome_loja: storeName,
                })
                .select("*")
                .single();
            if (minErr) console.error("[MerchantCampaigns] Minimal insert error:", minErr);
            return minStore || null;
        },
        enabled: !!user,
    });

    const { data: materials = [], isLoading: loadingMaterials } = useQuery<MarketingProduct[]>({
        queryKey: ["merchant-marketing-products", user?.id],
        queryFn: async () => {
            const { data, error } = await (supabase.from("merchant_marketing_products") as any)
                .select("*")
                .eq("created_by_user_id", user!.id)
                .order("created_at", { ascending: false });
            if (error) return [];
            return (data || []).map((p: any) => ({
                id: p.id,
                merchant_store_id: p.merchant_store_id,
                created_by_user_id: p.created_by_user_id,
                title: p.title || "Sem título",
                short_description: p.short_description || null,
                image_url: p.image_url || null,
                video_url: p.video_url || null,
                external_link: p.external_link || null,
                price_label: p.price_label || null,
                cta_label: p.cta_label || null,
                target_city: p.target_city || null,
                target_region: p.target_region || null,
                campaign_type: p.campaign_type || "offer",
                is_active: p.is_active ?? true,
                created_at: p.created_at,
            }));
        },
        enabled: !!user,
    });

    const MAX_ACTIVE = 9;
    const activeMaterials = materials.filter(m => m.is_active);
    const isAtLimit = activeMaterials.length >= MAX_ACTIVE;

    // ── Handlers ──
    const resetForm = () => {
        setAdTitle(""); setAdDescription(""); setAdPrice(""); setAdImageUrl(""); setAdVideoUrl("");
        setAdCta("Peça agora!"); setAdCity(""); setAdRegion(""); setAdType("offer"); setAdExternalLink("");
        setEditingId(null); setAdImageFile(null);
    };

    const handleEditMaterial = (m: MarketingProduct) => {
        setEditingId(m.id);
        setAdTitle(m.title);
        setAdDescription(m.short_description || "");
        setAdPrice(m.price_label || "");
        setAdImageUrl(m.image_url || "");
        setAdVideoUrl(m.video_url || "");
        setAdCta(m.cta_label || "Peça agora!");
        setAdCity(m.target_city || "");
        setAdRegion(m.target_region || "");
        setAdType(m.campaign_type || "offer");
        setAdExternalLink(m.external_link || "");
        setIsCreateOpen(true);
    };

    const handleSave = async () => {
        if (!adTitle.trim()) { toast.error("Informe o título"); return; }
        if (!merchantStore?.id) { toast.error("Loja não encontrada."); return; }
        setIsSaving(true);
        try {
            const payload: any = {
                title: adTitle.trim(),
                short_description: adDescription.trim() || null,
                price_label: adPrice.trim() || null,
                video_url: adVideoUrl.trim() || null,
                cta_label: adCta.trim() || "Peça agora!",
                target_city: adCity.trim() || null,
                target_region: adRegion.trim() || null,
                campaign_type: adType,
                external_link: adExternalLink.trim() && /^https?:\/\//i.test(adExternalLink.trim()) ? adExternalLink.trim() : null,
            };

            if (adImageFile) {
                const ext = adImageFile.name.split(".").pop() || "jpg";
                const path = `merchant/${user?.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
                const { error: uploadErr } = await supabase.storage
                    .from("marketing-materials")
                    .upload(path, adImageFile, { contentType: adImageFile.type, upsert: false });
                if (uploadErr) throw new Error(`Upload falhou: ${uploadErr.message}`);
                const { data: urlData } = supabase.storage.from("marketing-materials").getPublicUrl(path);
                payload.image_url = urlData.publicUrl;
            } else if (adImageUrl) {
                payload.image_url = normalizeImageUrl(adImageUrl) || null;
            } else {
                payload.image_url = null;
            }

            if (editingId) {
                const { error } = await (supabase.from("merchant_marketing_products") as any)
                    .update(payload).eq("id", editingId);
                if (error) throw error;
                toast.success("Material atualizado!");
            } else {
                payload.merchant_store_id = merchantStore.id;
                payload.created_by_user_id = user?.id;
                payload.is_active = !isAtLimit;
                const { error } = await (supabase.from("merchant_marketing_products") as any).insert(payload);
                if (error) throw error;
                toast.success(isAtLimit ? "Material salvo como inativo." : "Material criado e ativado!");
            }
            setIsCreateOpen(false);
            resetForm();
            queryClient.invalidateQueries({ queryKey: ["merchant-marketing-products"] });
        } catch (err: any) {
            toast.error(err?.message || "Erro ao salvar");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteMaterial = async (m: MarketingProduct) => {
        if (!confirm(`Excluir "${m.title}"? Essa ação não pode ser desfeita.`)) return;
        try {
            const { error } = await (supabase.from("merchant_marketing_products") as any).delete().eq("id", m.id);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ["merchant-marketing-products"] });
            toast.success("Material excluído.");
        } catch {
            toast.error("Erro ao excluir.");
        }
    };

    const handleToggle = async (m: MarketingProduct) => {
        if (!m.is_active && isAtLimit) { toast.error(`Limite de ${MAX_ACTIVE} ativos.`); return; }
        try {
            const { error } = await (supabase.from("merchant_marketing_products") as any)
                .update({ is_active: !m.is_active }).eq("id", m.id);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ["merchant-marketing-products"] });
            toast.success(m.is_active ? "Desativado" : "Ativado");
        } catch {
            toast.error("Erro ao alterar status");
        }
    };

    const handleDispatch = async () => {
        if (!selectedAdId || !merchantStore?.id) return;
        setIsDispatching(true);
        try {
            const ad = materials.find(m => m.id === selectedAdId);
            if (!ad) throw new Error("Material não encontrado");
            // Porta única do anunciante: aplica gratuita diária → pacote → bloqueio
            const { data, error } = await (supabase.rpc as any)("merchant_dispatch_divulgacao", {
                p_merchant_store_id: merchantStore.id,
                p_product_id: null,
                p_campaign_type: "store_product",
                p_title: ad.title,
                p_message_text: customPitch.trim() || ad.short_description || null,
                p_media_url: ad.image_url || null,
                p_target_city: merchantStore?.city || null,
                p_target_region: merchantStore?.region || null,
                p_source_type: "merchant_marketing_product",
                p_source_id: ad.id,
            });
            if (error) {
                if (String(error.message || "").includes("SEM_SALDO")) {
                    throw new Error("Sua divulgação gratuita de hoje já foi utilizada e você não tem créditos de pacote. Adquira um pacote para continuar divulgando.");
                }
                throw error;
            }
            if (data?.success === false) throw new Error(data.error || "Erro");
            if (data?.origem === "gratuita_diaria") {
                toast.success("🎁 Divulgação GRATUITA de hoje enviada à fila inteligente!");
            } else {
                toast.success(`📦 Divulgação enviada à fila! Saldo restante: ${data?.saldo_restante ?? "—"} divulgação(ões).`);
            }
            refetchDivStatus();
            setIsDispatchOpen(false);
            setSelectedAdId("");
            setCustomPitch("");
            queryClient.invalidateQueries({ queryKey: ["merchant-campaigns"] });
            queryClient.invalidateQueries({ queryKey: ["lojista-campaigns"] });
            lojista.refetchAll();
        } catch (err: any) {
            toast.error(err?.message || "Erro ao disparar");
        } finally {
            setIsDispatching(false);
        }
    };

    const handleDeleteCampaign = async (id: string) => {
        try {
            await (supabase.from("campaign_queue") as any).delete().eq("id", id);
            queryClient.invalidateQueries({ queryKey: ["lojista-campaigns"] });
            lojista.refetchAll();
            toast.success("Campanha excluída.");
        } catch {
            toast.error("Erro ao excluir.");
        }
    };

    const toggleCampaign = (id: string) => setExpandedCampaign(prev => prev === id ? null : id);

    // ── Loading ──
    if (lojista.isLoading && loadingMaterials) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-screen bg-background">
                <div className="text-center space-y-4">
                    <div className="relative mx-auto w-14 h-14">
                        <div className="absolute inset-0 rounded-full border-2 border-orange-500/15 animate-ping" />
                        <div className="absolute inset-2 rounded-full border-2 border-orange-400/30 animate-spin border-t-transparent" />
                        <div className="absolute inset-4 rounded-full bg-orange-500/[0.07] flex items-center justify-center">
                            <Megaphone className="h-4 w-4 text-orange-400/80" />
                        </div>
                    </div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">Carregando campanhas</p>
                </div>
            </div>
        );
    }

    const cancelledCount = lojista.campaigns.filter(c => c.status === "cancelled").length;

    return (
        <div className="flex-1 overflow-auto min-h-screen bg-background pb-28">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gradient-radial from-emerald-200/30 via-transparent to-transparent pointer-events-none" />

            <div className="max-w-4xl mx-auto px-4 py-6 relative z-10 space-y-6">

                {/* ── Header ── */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/15 to-amber-500/10 flex items-center justify-center border border-orange-500/10">
                            <Megaphone className="h-5 w-5 text-orange-400" />
                        </div>
                        <div>
                            <h1 className="text-base font-black text-gray-900 tracking-tight">Campanhas</h1>
                            <p className="text-[10px] text-gray-400 font-medium">Gerencie anúncios e materiais de divulgação local.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button size="sm" className="bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 border border-orange-500/20 text-xs font-bold h-8 rounded-lg"
                            onClick={() => { resetForm(); setIsCreateOpen(true); }}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Novo Anúncio
                        </Button>
                        <Button size="sm" className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/20 text-xs font-bold h-8 rounded-lg"
                            onClick={() => setIsDispatchOpen(true)} disabled={activeMaterials.length === 0}>
                            <Send className="h-3.5 w-3.5 mr-1" /> Disparar
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-500" onClick={lojista.refetchAll}>
                            <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>

                {/* ── KPI Grid ── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { label: "ATIVAS", value: lojista.kpis.activeCampaigns, sub: "em divulgação", from: "from-emerald-500/[0.06]", border: "border-emerald-500/[0.08]", lc: "text-emerald-400/80", icon: <CheckCircle className="h-3.5 w-3.5 text-emerald-400/40" /> },
                        { label: "PAUSADAS", value: cancelledCount, sub: "canceladas", from: "from-amber-500/[0.06]", border: "border-amber-500/[0.08]", lc: "text-amber-400/80", icon: <Clock className="h-3.5 w-3.5 text-amber-400/40" /> },
                        { label: "POSTAGENS", value: lojista.kpis.totalPosts, sub: "registradas", from: "from-sky-500/[0.06]", border: "border-sky-500/[0.08]", lc: "text-sky-400/80", icon: <TrendingUp className="h-3.5 w-3.5 text-sky-400/40" /> },
                        { label: "ALCANCE", value: lojista.kpis.uniqueGroups, sub: "grupos alcançados", from: "from-violet-500/[0.06]", border: "border-violet-500/[0.08]", lc: "text-violet-400/80", icon: <Users className="h-3.5 w-3.5 text-violet-400/40" /> },
                    ].map(k => (
                        <div key={k.label} className={cn("rounded-2xl p-4 border bg-white shadow-sm", k.border)}>
                            <div className="flex items-center gap-1.5 mb-2">{k.icon}<p className={cn("text-[8px] font-black uppercase tracking-[0.2em]", k.lc)}>{k.label}</p></div>
                            <p className="text-2xl font-black text-gray-800 tracking-tight">{k.value}</p>
                            <p className="text-[10px] text-gray-400 font-medium mt-0.5">{k.sub}</p>
                        </div>
                    ))}
                </div>

                {/* ══════════════════════════════════ */}
                {/* CENTRAL DE DIVULGAÇÕES (gratuita + pacotes + fila) */}
                {/* ══════════════════════════════════ */}
                <div className="rounded-2xl border border-emerald-500/[0.12] bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-lg">📢</div>
                            <div>
                                <h2 className="text-sm font-black tracking-tight text-gray-900">Central de Divulgações</h2>
                                <p className="text-[10px] font-medium text-gray-400">
                                    1 divulgação gratuita por dia · pacotes para divulgar mais · tudo na mesma fila inteligente do Postador.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {/* Gratuita de hoje */}
                        <div className={cn("rounded-2xl border p-4",
                            divStatus?.gratis_disponivel
                                ? "border-emerald-500/25 bg-emerald-50/60"
                                : "border-gray-200 bg-gray-50")}>
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-400">🎁 Gratuita de hoje</p>
                            <p className={cn("mt-1 text-lg font-black tracking-tight",
                                divStatus?.gratis_disponivel ? "text-emerald-600" : "text-gray-500")}>
                                {divStatus == null ? "…" : divStatus.gratis_disponivel ? "Disponível" : "Utilizada"}
                            </p>
                            <p className="mt-0.5 text-[10px] font-medium text-gray-400">
                                {divStatus?.gratis_disponivel ? "use no botão Disparar" : "renova à meia-noite"}
                            </p>
                        </div>

                        {/* Saldo de pacotes */}
                        <div className="rounded-2xl border border-sky-500/20 bg-sky-50/50 p-4">
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-400">📦 Saldo de pacotes</p>
                            <p className="mt-1 text-2xl font-black tracking-tight text-sky-600 tabular-nums">
                                {divStatus?.saldo_pacotes ?? "…"}
                            </p>
                            <p className="mt-0.5 text-[10px] font-medium text-gray-400">divulgações restantes</p>
                        </div>

                        {/* Na fila */}
                        <div className="rounded-2xl border border-amber-500/20 bg-amber-50/50 p-4">
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-400">⏳ Na fila</p>
                            <p className="mt-1 text-2xl font-black tracking-tight text-amber-600 tabular-nums">
                                {divStatus?.na_fila ?? "…"}
                            </p>
                            <p className="mt-0.5 text-[10px] font-medium text-gray-400">aguardando o Postador</p>
                        </div>

                        {/* Publicadas */}
                        <div className="rounded-2xl border border-violet-500/20 bg-violet-50/50 p-4">
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-400">✅ Publicadas</p>
                            <p className="mt-1 text-2xl font-black tracking-tight text-violet-600 tabular-nums">
                                {divStatus?.publicadas ?? "…"}
                            </p>
                            <p className="mt-0.5 text-[10px] font-medium text-gray-400">
                                {divStatus?.postagens_realizadas ?? 0} postagens · {divStatus?.grupos_alcancados ?? 0} grupos
                            </p>
                        </div>
                    </div>

                    {/* Catálogo de pacotes */}
                    {Array.isArray(divStatus?.pacotes) && divStatus.pacotes.length > 0 && (
                        <div className="mt-4">
                            <p className="mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-gray-400">Pacotes de divulgação</p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {divStatus.pacotes.map((p: any) => (
                                    <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-3 text-center transition-all hover:-translate-y-0.5 hover:shadow-md">
                                        <p className="text-[10px] font-bold text-gray-500">{p.nome}</p>
                                        <p className="mt-1 text-xl font-black text-gray-900 tabular-nums">{p.qtd}</p>
                                        <p className="text-[9px] text-gray-400">divulgações</p>
                                        <p className="mt-1 text-xs font-black text-emerald-600">
                                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(p.preco_brl))}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => toast.info("Compra de pacotes em integração com o pagamento — em breve disponível.")}
                                            className="mt-2 w-full rounded-full border border-emerald-500/30 bg-emerald-50 py-1 text-[10px] font-bold text-emerald-600 hover:bg-emerald-100"
                                        >
                                            Comprar
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <MerchantRecentEvents module="campaigns" />

                {/* ══════════════════════════════════ */}
                {/* VITRINE DE PRODUTOS                */}
                {/* ══════════════════════════════════ */}
                <ProductShowcase storeId={merchantStore?.id || null} />

                {/* ══════════════════════════════════ */}
                {/* SELEÇÃO PARA DIVULGAÇÃO (3 slots) */}
                {/* ══════════════════════════════════ */}
                <PromotionSlotCard ref={promotionSlotRef} storeId={merchantStore?.id || null} />

                {/* ══════════════════════════════════ */}
                {/* MERCADO LOCAL VIAGG (landing page)*/}
                {/* ══════════════════════════════════ */}
                <MarketplaceLandingCard
                    storeId={merchantStore?.id || null}
                    onAddProduct={() => { resetForm(); setIsCreateOpen(true); }}
                    onSelectForPromotion={(product) => {
                        promotionSlotRef.current?.addProduct(product);
                    }}
                />

                {/* ══════════════════════════════════ */}
                {/* MATERIAIS DE DIVULGAÇÃO (oculto)   */}
                {/* ══════════════════════════════════ */}
                {false && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5" /> Materiais de Divulgação
                        </p>
                        <span className="text-[9px] text-gray-300 font-bold">{activeMaterials.length}/{MAX_ACTIVE} ativos</span>
                    </div>

                    {loadingMaterials ? (
                        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                    ) : materials.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center bg-white shadow-sm">
                            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4 border border-emerald-200/50">
                                <ImagePlus className="h-7 w-7 text-gray-300" />
                            </div>
                            <p className="text-sm font-bold text-gray-500">Nenhum material cadastrado</p>
                            <p className="text-[11px] text-gray-400 mt-2 max-w-[240px] mx-auto leading-relaxed">
                                Crie seu primeiro anúncio local para divulgar nas redes territoriais.
                            </p>
                            <Button size="sm" className="mt-4 bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 border border-orange-500/20 text-xs font-bold rounded-lg"
                                onClick={() => { resetForm(); setIsCreateOpen(true); }}>
                                <Plus className="h-3.5 w-3.5 mr-1" /> Criar Material
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {materials.map(m => {
                                const imgSrc = normalizeImageUrl(m.image_url);
                                return (
                                    <div key={m.id} className={cn(
                                        "rounded-2xl border overflow-hidden transition-all duration-200 bg-white",
                                        m.is_active ? "border-emerald-200/60 hover:border-emerald-300/80" : "border-emerald-100 opacity-60",
                                    )}>
                                        {/* Image */}
                                        {imgSrc ? (
                                            <div className="aspect-[16/9] bg-emerald-50/50 overflow-hidden">
                                                <img src={imgSrc} alt="" className="w-full h-full object-contain"
                                                    onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                            </div>
                                        ) : (
                                            <div className="aspect-[16/9] bg-gradient-to-br from-emerald-50 to-gray-50 flex items-center justify-center">
                                                <Megaphone className="h-8 w-8 text-gray-200" />
                                            </div>
                                        )}
                                        {/* Content */}
                                        <div className="p-3 space-y-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <h5 className="font-bold text-[13px] text-gray-800 truncate">{m.title}</h5>
                                                <Badge className={cn(
                                                    "text-[8px] font-black uppercase shrink-0 border-0 px-1.5 py-0 h-4",
                                                    m.is_active ? "bg-emerald-500/15 text-emerald-400/80" : "bg-gray-100 text-white/30",
                                                )}>
                                                    {m.is_active ? "Ativo" : "Pausado"}
                                                </Badge>
                                            </div>
                                            {m.short_description && (
                                                <p className="text-[10px] text-white/35 line-clamp-2 leading-relaxed">{m.short_description}</p>
                                            )}
                                            {m.price_label && (
                                                <p className="text-lg font-black text-orange-400">R$ {m.price_label}</p>
                                            )}
                                            <div className="flex items-center gap-2 text-[9px] text-white/25">
                                                {m.target_city && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{m.target_city}</span>}
                                                {m.campaign_type && <Badge className="bg-violet-500/10 text-violet-400/60 border-0 text-[8px] h-4 px-1.5">{m.campaign_type}</Badge>}
                                            </div>
                                            {/* Actions */}
                                            <div className="flex gap-1 pt-2 border-t border-white/[0.04]">
                                                <button onClick={() => handleToggle(m)}
                                                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold text-gray-400 hover:text-gray-600 hover:bg-emerald-50 transition-colors">
                                                    <Eye className="h-3 w-3" /> {m.is_active ? "Pausar" : "Ativar"}
                                                </button>
                                                <button onClick={() => handleEditMaterial(m)}
                                                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold text-gray-400 hover:text-gray-600 hover:bg-emerald-50 transition-colors">
                                                    <Pencil className="h-3 w-3" /> Editar
                                                </button>
                                                <button onClick={() => handleDeleteMaterial(m)}
                                                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold text-rose-400/60 hover:text-rose-400 hover:bg-rose-500/[0.06] transition-colors">
                                                    <Trash2 className="h-3 w-3" /> Excluir
                                                </button>
                                                {m.external_link && (
                                                    <button onClick={() => { navigator.clipboard.writeText(m.external_link || ""); toast.success("Link copiado"); }}
                                                        className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold text-gray-400 hover:text-gray-600 hover:bg-emerald-50 transition-colors">
                                                        <LinkIcon className="h-3 w-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                )}

                {/* ══════════════════════════════════ */}
                {/* SUAS CAMPANHAS (oculto)            */}
                {/* ══════════════════════════════════ */}
                {false && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[9px] font-black text-white/25 uppercase tracking-[0.2em] flex items-center gap-1.5">
                            <Send className="h-3.5 w-3.5" /> Suas Campanhas
                        </p>
                        {lojista.loadingPostings && (
                            <span className="text-[9px] text-sky-400/60 animate-pulse font-bold">Atualizando…</span>
                        )}
                    </div>
                    {lojista.campaigns.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/[0.06] p-10 text-center bg-[#1A1F2B]/30">
                            <div className="w-16 h-16 rounded-2xl bg-[#1E2330] flex items-center justify-center mx-auto mb-4 border border-white/[0.06]">
                                <Sparkles className="h-7 w-7 text-white/15" />
                            </div>
                            <p className="text-sm font-bold text-white/50">Nenhuma campanha ainda</p>
                            <p className="text-[11px] text-white/25 mt-2 max-w-[240px] mx-auto leading-relaxed">
                                Suas campanhas aparecerão aqui quando você disparar materiais.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {lojista.campaigns.map(campaign => {
                                const stats = lojista.campaignStatsMap.get(campaign.id) || { totalPosts: 0, lastPostedAt: null, uniqueGroups: 0 };
                                const visualStatus = deriveCampaignStatus(campaign.status, campaign.available_until);
                                const postings = lojista.getPostingsForCampaign(campaign.id);
                                return (
                                    <LojistaCampaignCard key={campaign.id} campaign={campaign} stats={stats}
                                        visualStatus={visualStatus} postings={postings}
                                        isExpanded={expandedCampaign === campaign.id}
                                        onToggle={() => toggleCampaign(campaign.id)}
                                        onDelete={handleDeleteCampaign} />
                                );
                            })}
                        </div>
                    )}
                </div>
                )}
            </div>

            {/* ═══ MODAL: CRIAR / EDITAR MATERIAL ═══ */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="max-w-lg bg-[#1A1F2B] border-white/[0.08] text-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-white">
                            <Sparkles className="h-5 w-5 text-orange-400" />
                            {editingId ? "Editar Material" : "Novo Material de Divulgação"}
                        </DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Cadastre seu material promocional local.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 pt-2 max-h-[60vh] overflow-y-auto pr-1">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-white/50">Título do anúncio *</Label>
                            <Input placeholder="Ex: Combo Família R$ 49,90" value={adTitle} onChange={e => setAdTitle(e.target.value)}
                                className="bg-[#151922] border-white/[0.08] text-white placeholder:text-white/20" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-white/50">Descrição curta</Label>
                            <Textarea placeholder="Ex: 2 pizzas + refrigerante + entrega grátis" value={adDescription}
                                onChange={e => setAdDescription(e.target.value)} maxLength={200}
                                className="bg-[#151922] border-white/[0.08] text-white placeholder:text-white/20 resize-none h-20" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-white/50">Preço</Label>
                                <Input placeholder="49,90" value={adPrice} onChange={e => setAdPrice(e.target.value)}
                                    className="bg-[#151922] border-white/[0.08] text-white placeholder:text-white/20" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-white/50">CTA (botão)</Label>
                                <Input placeholder="Peça agora!" value={adCta} onChange={e => setAdCta(e.target.value)}
                                    className="bg-[#151922] border-white/[0.08] text-white placeholder:text-white/20" />
                            </div>
                        </div>

                        {/* Image Upload */}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-white/50 flex items-center gap-1">
                                <ImagePlus className="h-3 w-3" /> Imagem do Anúncio
                            </Label>
                            <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setAdImageFile(f); setAdImageUrl(""); } }} />
                            {adImageFile ? (
                                <div className="flex items-center gap-2 rounded-xl border border-orange-500/20 bg-orange-500/[0.05] p-2">
                                    <img src={URL.createObjectURL(adImageFile)} alt="" className="h-12 w-12 rounded-md object-cover" />
                                    <span className="text-xs truncate flex-1 text-white/60">{adImageFile.name}</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400" onClick={() => setAdImageFile(null)}>
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                            ) : adImageUrl ? (
                                <div className="flex items-center gap-2 rounded-xl border border-orange-500/20 bg-orange-500/[0.05] p-2">
                                    <img src={normalizeImageUrl(adImageUrl) || ""} alt="" className="h-12 w-12 rounded-md object-cover"
                                        onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                    <span className="text-xs truncate flex-1 text-gray-400">Imagem atual</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400" onClick={() => setAdImageUrl("")}>
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                            ) : (
                                <Button variant="outline" className="w-full h-16 border-dashed border-white/[0.08] hover:border-white/[0.15] hover:bg-emerald-50/50 bg-transparent"
                                    onClick={() => imageInputRef.current?.click()}>
                                    <div className="flex flex-col items-center gap-1">
                                        <Upload className="h-5 w-5 text-white/20" />
                                        <span className="text-[10px] text-white/30">Clique para adicionar imagem</span>
                                    </div>
                                </Button>
                            )}
                        </div>

                        {/* Video + Link */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-white/50">URL do Vídeo</Label>
                                <Input placeholder="https://youtube.com/..." value={adVideoUrl} onChange={e => setAdVideoUrl(e.target.value)}
                                    className="bg-[#151922] border-white/[0.08] text-white placeholder:text-white/20" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-white/50 flex items-center gap-1">
                                    <LinkIcon className="h-3 w-3" /> Link de destino
                                </Label>
                                <Input placeholder="https://sualoja.com.br" value={adExternalLink} onChange={e => setAdExternalLink(e.target.value)}
                                    className={cn("bg-[#151922] border-white/[0.08] text-white placeholder:text-white/20",
                                        adExternalLink && !/^https?:\/\//i.test(adExternalLink.trim()) && "border-rose-400/50")} />
                            </div>
                        </div>

                        {/* City + Region */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-white/50">Cidade</Label>
                                <Input placeholder="Ex: Blumenau" value={adCity} onChange={e => setAdCity(e.target.value)}
                                    className="bg-[#151922] border-white/[0.08] text-white placeholder:text-white/20" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-white/50">Região / Bairro</Label>
                                <Input placeholder="Ex: Centro" value={adRegion} onChange={e => setAdRegion(e.target.value)}
                                    className="bg-[#151922] border-white/[0.08] text-white placeholder:text-white/20" />
                            </div>
                        </div>

                        {/* Type */}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-white/50">Tipo do anúncio</Label>
                            <Select value={adType} onValueChange={setAdType}>
                                <SelectTrigger className="bg-[#151922] border-white/[0.08] text-white"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-[#1E2330] border-white/[0.08] text-white">
                                    <SelectItem value="offer">Oferta</SelectItem>
                                    <SelectItem value="store_highlight">Destaque da Loja</SelectItem>
                                    <SelectItem value="promotional">Promocional</SelectItem>
                                    <SelectItem value="institucional">Institucional</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Button disabled={isSaving} onClick={handleSave}
                            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold">
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                            {isSaving ? "Salvando..." : editingId ? "Atualizar Material" : "Salvar Material"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ═══ MODAL: DISPARAR ═══ */}
            <Dialog open={isDispatchOpen} onOpenChange={setIsDispatchOpen}>
                <DialogContent className="max-w-md bg-[#1A1F2B] border-white/[0.08] text-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-white">
                            <Send className="h-5 w-5 text-emerald-400" /> Disparar Campanha
                        </DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Selecione um material para enviar à frota de motoboys.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        {activeMaterials.length === 0 ? (
                            <div className="text-center py-6 text-white/30 text-sm">
                                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                <p>Nenhum material ativo. Crie um primeiro.</p>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                                    {activeMaterials.map(ad => (
                                        <div key={ad.id}
                                            className={cn(
                                                "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all",
                                                selectedAdId === ad.id
                                                    ? "border-orange-500/50 bg-orange-500/[0.05]"
                                                    : "border-emerald-200/40 hover:border-emerald-300/60",
                                            )}
                                            onClick={() => setSelectedAdId(ad.id)}>
                                            {ad.image_url ? (
                                                <img src={normalizeImageUrl(ad.image_url) || ""} alt={ad.title}
                                                    className="w-14 h-14 rounded-lg object-cover shrink-0" />
                                            ) : (
                                                <div className="w-14 h-14 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
                                                    <Megaphone className="h-5 w-5 text-white/20" />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-sm truncate text-gray-700">{ad.title}</p>
                                                {ad.price_label && <p className="text-xs font-bold text-orange-400">R$ {ad.price_label}</p>}
                                                {ad.short_description && <p className="text-[10px] text-white/30 truncate">{ad.short_description}</p>}
                                            </div>
                                            {selectedAdId === ad.id && <CheckCircle className="h-5 w-5 text-orange-400 shrink-0" />}
                                        </div>
                                    ))}
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-white/50">Chamada especial (Opcional)</Label>
                                    <Input placeholder="Ex: Só hoje! Entrega Grátis!" value={customPitch}
                                        onChange={e => setCustomPitch(e.target.value)} maxLength={60}
                                        className="bg-[#151922] border-white/[0.08] text-white placeholder:text-white/20" />
                                </div>

                                <Button disabled={isDispatching || !selectedAdId} onClick={handleDispatch}
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold">
                                    {isDispatching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                                    Enviar para divulgação
                                </Button>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
