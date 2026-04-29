import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
    Megaphone, Plus, Link as LinkIcon, Trash2, CheckCircle, Loader2,
    AlertTriangle, ImagePlus, Tag, MapPin, Send, Eye, Package, Sparkles, Pencil, Upload, X
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ─── Image URL Helpers ─────────────────────────────────────────────────────────
function normalizeImageUrl(url: string | null | undefined): string | null {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;

    // Convert Google Drive view links to direct download
    const driveViewMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveViewMatch) {
        return `https://drive.google.com/uc?export=view&id=${driveViewMatch[1]}`;
    }
    const driveOpenMatch = trimmed.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
    if (driveOpenMatch) {
        return `https://drive.google.com/uc?export=view&id=${driveOpenMatch[1]}`;
    }

    // Must start with http:// or https://
    if (!/^https?:\/\//i.test(trimmed)) return null;

    return trimmed;
}

function isGoogleDriveViewLink(url: string): boolean {
    return /drive\.google\.com\/(file\/d\/|open\?id=)/i.test(url);
}

// ─── Interfaces ──────────────────────────────────────────────────────────────
interface MarketingProduct {
    id: string;
    merchant_store_id: string | null;
    created_by_user_id: string;
    title: string;
    short_description: string | null;
    marketing_text: string | null;
    image_url: string | null;
    video_url: string | null;
    external_link: string | null;
    price_label: string | null;
    cta_label: string | null;
    target_city: string | null;
    target_region: string | null;
    campaign_type: string | null;
    is_active: boolean;
    display_order: number | null;
    starts_at: string | null;
    ends_at: string | null;
    clicks_count: number;
    conversions_count: number;
    created_at: string;
    updated_at: string | null;
    tracking_slug: string | null;
}

interface Campaign {
    id: string;
    title: string;
    status: string;
    message_text: string;
    media_url: string | null;
    campaign_type: string | null;
    target_city: string | null;
    target_region: string | null;
    created_at: string;
    // Dispatch counters from merchant_campaign_status_view
    total_dispatches: number;
    assigned_count: number;
    in_progress_count: number;
    posted_count: number;
    failed_count: number;
}

// ─── Component ───────────────────────────────────────────────────────────────
export function MerchantLocalMarketingSection() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    // Dialogs
    const [isCreateAdOpen, setIsCreateAdOpen] = useState(false);
    const [isDispatchOpen, setIsDispatchOpen] = useState(false);

    // New Ad form
    const [adTitle, setAdTitle] = useState('');
    const [adDescription, setAdDescription] = useState('');
    const [adPrice, setAdPrice] = useState('');
    const [adImageUrl, setAdImageUrl] = useState('');
    const [adVideoUrl, setAdVideoUrl] = useState('');
    const [adCta, setAdCta] = useState('Peça agora!');
    const [adCity, setAdCity] = useState('');
    const [adRegion, setAdRegion] = useState('');
    const [adType, setAdType] = useState('offer'); // persisted as campaign_type
    const [adExternalLink, setAdExternalLink] = useState('');
    const [isSavingAd, setIsSavingAd] = useState(false);
    const [editingAdId, setEditingAdId] = useState<string | null>(null);
    const [adImageFile, setAdImageFile] = useState<File | null>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    // Dispatch form
    const [selectedAdId, setSelectedAdId] = useState('');
    const [customPitch, setCustomPitch] = useState('');
    const [isDispatching, setIsDispatching] = useState(false);

    // ─── Queries ─────────────────────────────────────────────────────────────
    // Load merchant store — auto-create if missing
    const { data: merchantStore } = useQuery({
        queryKey: ['merchant-store-marketing', user?.id],
        queryFn: async () => {
            const { data } = await (supabase.from('merchant_stores') as any)
                .select('*')
                .eq('user_id', user!.id)
                .limit(1)
                .maybeSingle();
            if (data) return data;

            // Auto-create from profiles
            const { data: profile } = await (supabase.from('profiles') as any)
                .select('full_name, nome_loja, cidade, estado, bairro, rua, cep, categoria, logo_url')
                .eq('id', user!.id)
                .single();
            const storeName = profile?.nome_loja || profile?.full_name || 'Minha Loja';
            const { data: newStore, error: insertErr } = await (supabase.from('merchant_stores') as any)
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
                .select('*')
                .single();
            if (!insertErr && newStore) return newStore;
            console.error('[MerchantMarketing] Auto-create store error:', insertErr);
            // Retry minimal
            const { data: minStore } = await (supabase.from('merchant_stores') as any)
                .insert({ user_id: user!.id, nome_loja: storeName })
                .select('*')
                .single();
            return minStore || null;
        },
        enabled: !!user,
    });

    // Source: merchant_marketing_products (NOT delivery products)
    const { data: marketingProducts = [], isLoading: loadingProducts } = useQuery<MarketingProduct[]>({
        queryKey: ['merchant-marketing-products', user?.id],
        queryFn: async () => {
            const { data, error } = await (supabase
                .from('merchant_marketing_products') as any)
                .select('*')
                .eq('created_by_user_id', user!.id)
                .order('created_at', { ascending: false });
            if (error) {
                console.error('[MarketingProducts] Error:', error);
                return [];
            }
            return (data || []).map((p: any) => ({
                id: p.id,
                merchant_store_id: p.merchant_store_id || null,
                created_by_user_id: p.created_by_user_id,
                title: p.title || 'Sem título',
                short_description: p.short_description || null,
                marketing_text: p.marketing_text || null,
                image_url: p.image_url || null,
                video_url: p.video_url || null,
                external_link: p.external_link || null,
                price_label: p.price_label || null,
                cta_label: p.cta_label || null,
                target_city: p.target_city || null,
                target_region: p.target_region || null,
                campaign_type: p.campaign_type || 'offer',
                is_active: p.is_active ?? true,
                display_order: p.display_order ?? null,
                starts_at: p.starts_at || null,
                ends_at: p.ends_at || null,
                clicks_count: p.clicks_count ?? 0,
                conversions_count: p.conversions_count ?? 0,
                created_at: p.created_at,
                updated_at: p.updated_at || null,
                tracking_slug: p.tracking_slug || null,
            }));
        },
        enabled: !!user,
    });

    // Active campaigns WITH dispatch status counters
    const { data: campaigns = [], isLoading: loadingCampaigns } = useQuery<Campaign[]>({
        queryKey: ['merchant-campaigns', user?.id],
        queryFn: async () => {
            const { data, error } = await (supabase
                .from('merchant_campaign_status_view') as any)
                .select('campaign_id, title, status, message_text, media_url, campaign_type, target_city, target_region, created_at, total_dispatches, assigned_count, in_progress_count, posted_count, failed_count')
                .eq('created_by_user_id', user!.id)
                .order('created_at', { ascending: false })
                .limit(20);
            if (error) {
                // Fallback to campaign_queue if view doesn't exist yet
                const { data: fallback, error: fbErr } = await (supabase
                    .from('campaign_queue') as any)
                    .select('id, title, status, message_text, media_url, campaign_type, target_city, target_region, created_at')
                    .eq('created_by_user_id', user!.id)
                    .order('created_at', { ascending: false })
                    .limit(20);
                if (fbErr) throw fbErr;
                return (fallback || []).map((c: any) => ({
                    ...c, total_dispatches: 0, assigned_count: 0,
                    in_progress_count: 0, posted_count: 0, failed_count: 0,
                })) as Campaign[];
            }
            return (data || []).map((c: any) => ({
                id: c.campaign_id,
                title: c.title,
                status: c.status,
                message_text: c.message_text,
                media_url: c.media_url,
                campaign_type: c.campaign_type,
                target_city: c.target_city,
                target_region: c.target_region,
                created_at: c.created_at,
                total_dispatches: c.total_dispatches || 0,
                assigned_count: c.assigned_count || 0,
                in_progress_count: c.in_progress_count || 0,
                posted_count: c.posted_count || 0,
                failed_count: c.failed_count || 0,
            })) as Campaign[];
        },
        enabled: !!user,
    });

    const MAX_ACTIVE_MATERIALS = 9;
    const activeProducts = marketingProducts.filter(p => p.is_active);
    const activeProductCount = activeProducts.length;
    const isAtMaterialLimit = activeProductCount >= MAX_ACTIVE_MATERIALS;
    const activeAds = campaigns.filter(c => c.status === 'active' || c.status === 'pending').length;

    // ─── Handlers ────────────────────────────────────────────────────────────
    const handleSaveAd = async () => {
        if (!adTitle.trim()) { toast.error('Informe o título do anúncio'); return; }
        if (!merchantStore?.id) { toast.error('Loja não encontrada. Verifique seu cadastro.'); return; }
        const willBeActive = editingAdId ? undefined : (!isAtMaterialLimit);
        setIsSavingAd(true);
        try {
            const payload: any = {
                title: adTitle.trim(),
                short_description: adDescription.trim() || null,
                price_label: adPrice.trim() || null,
                video_url: adVideoUrl.trim() || null,
                cta_label: adCta.trim() || 'Peça agora!',
                target_city: adCity.trim() || null,
                target_region: adRegion.trim() || null,
                campaign_type: adType,
                external_link: adExternalLink.trim() && /^https?:\/\//i.test(adExternalLink.trim()) ? adExternalLink.trim() : null,
            };

            // Upload image file if selected
            if (adImageFile) {
                const ext = adImageFile.name.split('.').pop() || 'jpg';
                const path = `merchant/${user?.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
                const { error: uploadErr } = await supabase.storage
                    .from('marketing-materials')
                    .upload(path, adImageFile, { contentType: adImageFile.type, upsert: false });
                if (uploadErr) throw new Error(`Falha no upload: ${uploadErr.message}`);
                const { data: urlData } = supabase.storage.from('marketing-materials').getPublicUrl(path);
                payload.image_url = urlData.publicUrl;
            } else if (adImageUrl) {
                payload.image_url = normalizeImageUrl(adImageUrl) || null;
            } else {
                // No file and no URL = clear image (works for both create and edit)
                payload.image_url = null;
            }

            let error;
            if (editingAdId) {
                // UPDATE existing
                ({ error } = await (supabase.from('merchant_marketing_products') as any)
                    .update(payload).eq('id', editingAdId));
            } else {
                // INSERT new
                payload.merchant_store_id = merchantStore.id;
                payload.created_by_user_id = user?.id;
                if (!payload.external_link) {
                    payload.external_link = `https://app.viagg.com.br/m/${user?.id?.substring(0, 8)}/a/${Date.now().toString(36)}`;
                }
                payload.marketing_text = null;
                payload.is_active = willBeActive;
                ({ error } = await (supabase.from('merchant_marketing_products') as any).insert(payload));
            }
            if (error) throw error;
            if (editingAdId) {
                toast.success('Material atualizado!');
            } else if (willBeActive) {
                toast.success('Material criado e ativado!');
            } else {
                toast.info('Material salvo como inativo. Desative outro material para ativá-lo.');
            }
            setIsCreateAdOpen(false);
            resetAdForm();
            queryClient.invalidateQueries({ queryKey: ['merchant-marketing-products'] });
        } catch (err: any) {
            const msg = err?.message || '';
            if (msg.includes('limit') || msg.includes('3') || msg.includes('máximo')) {
                toast.error(`Limite de ${MAX_ACTIVE_MATERIALS} materiais ativos atingido. Desative um existente para criar outro.`);
            } else {
                toast.error(msg || 'Erro ao criar anúncio');
            }
        } finally {
            setIsSavingAd(false);
        }
    };

    const handleDispatch = async () => {
        if (!selectedAdId) { toast.error('Selecione um material de divulgação'); return; }
        if (!merchantStore?.id) { toast.error('Loja não encontrada.'); return; }
        setIsDispatching(true);
        try {
            const ad = marketingProducts.find(p => p.id === selectedAdId);
            if (!ad) throw new Error('Material não encontrado');

            const { data, error } = await (supabase.rpc as any)('create_merchant_campaign_queue_item', {
                p_merchant_store_id: merchantStore.id,
                p_created_by_user_id: user?.id,
                p_title: ad.title,
                p_message_text: customPitch.trim() || ad.short_description || ad.marketing_text || null,
                p_media_url: ad.image_url || null,
                p_campaign_type: 'store_product',
                p_target_city: merchantStore?.city || null,
                p_target_region: merchantStore?.region || null,
                p_target_bairro: merchantStore?.bairro || null,
                p_priority: 2,
                p_source_type: 'merchant_marketing_product',
                p_source_id: ad.id,
            });
            if (error) throw error;
            if (data && data.success === false) throw new Error(data.error || 'Erro ao criar campanha');

            toast.success(`Campanha enviada para divulgação local!${merchantStore?.bairro ? ` Bairro: ${merchantStore.bairro}` : ''}`);
            setIsDispatchOpen(false);
            setSelectedAdId('');
            setCustomPitch('');
            queryClient.invalidateQueries({ queryKey: ['merchant-campaigns'] });
            queryClient.invalidateQueries({ queryKey: ['merchant-marketing-products'] });
        } catch (err: any) {
            toast.error(err?.message || 'Erro ao despachar campanha');
        } finally {
            setIsDispatching(false);
        }
    };

    const handleArchive = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir esta campanha?')) return;
        try {
            await (supabase.from('campaign_queue') as any).delete().eq('id', id);
            queryClient.invalidateQueries({ queryKey: ['merchant-campaigns'] });
            toast.success('Campanha excluída.');
        } catch {
            toast.error('Erro ao excluir campanha.');
        }
    };

    const handleToggleAd = async (ad: MarketingProduct) => {
        // Block activate if at limit
        if (!ad.is_active && isAtMaterialLimit) {
            toast.error(`Limite de ${MAX_ACTIVE_MATERIALS} materiais ativos atingido. Desative outro primeiro.`);
            return;
        }
        try {
            const { error } = await (supabase.from('merchant_marketing_products') as any)
                .update({ is_active: !ad.is_active })
                .eq('id', ad.id);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['merchant-marketing-products'] });
            toast.success(ad.is_active ? 'Material desativado' : 'Material ativado');
        } catch (err: any) {
            const msg = err?.message || '';
            if (msg.includes('limit') || msg.includes('máximo')) {
                toast.error(`Limite de ${MAX_ACTIVE_MATERIALS} materiais ativos atingido.`);
            } else {
                toast.error('Erro ao alterar status');
            }
        }
    };

    const resetAdForm = () => {
        setAdTitle(''); setAdDescription(''); setAdPrice(''); setAdImageUrl(''); setAdVideoUrl('');
        setAdCta('Peça agora!'); setAdCity(''); setAdRegion(''); setAdType('offer'); setAdExternalLink('');
        setEditingAdId(null); setAdImageFile(null);
    };

    const handleEditAd = (ad: MarketingProduct) => {
        setEditingAdId(ad.id);
        setAdTitle(ad.title);
        setAdDescription(ad.short_description || '');
        setAdPrice(ad.price_label || '');
        setAdImageUrl(ad.image_url || '');
        setAdVideoUrl(ad.video_url || '');
        setAdCta(ad.cta_label || 'Peça agora!');
        setAdCity(ad.target_city || '');
        setAdRegion(ad.target_region || '');
        setAdType(ad.campaign_type || 'offer');
        setAdExternalLink(ad.external_link || '');
        setIsCreateAdOpen(true);
    };

    const handleDeleteAd = async (ad: MarketingProduct) => {
        if (!confirm(`Excluir "${ad.title}"? Essa ação não pode ser desfeita.`)) return;
        try {
            const { error } = await (supabase.from('merchant_marketing_products') as any).delete().eq('id', ad.id);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['merchant-marketing-products'] });
            toast.success('Material excluído.');
        } catch {
            toast.error('Erro ao excluir material.');
        }
    };

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <Card className="shadow-md border-primary/20 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden">
            <CardHeader className="pb-3 border-b border-primary/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <CardTitle className="text-sm font-bold text-primary flex items-center gap-2 uppercase tracking-wide">
                            <Megaphone className="h-4 w-4" />
                            Divulgação Local <Badge variant="secondary" className="bg-primary/20 text-primary font-bold ml-2">Beta</Badge>
                        </CardTitle>
                        <CardDescription className="text-xs pt-1">
                            Materiais de marketing local. Não confunda com produtos de entrega.
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setIsCreateAdOpen(true)}
                            className="border-primary/30 text-primary hover:bg-primary/10">
                            <Plus className="h-4 w-4 mr-1" /> Novo Anúncio ({activeProductCount}/{MAX_ACTIVE_MATERIALS})
                        </Button>
                        <Button size="sm" onClick={() => setIsDispatchOpen(true)}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                            disabled={activeAds >= 3 || activeProducts.length === 0}>
                            <Send className="h-4 w-4 mr-1" /> Disparar ({activeAds}/3)
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-4 px-4 sm:px-6 space-y-6">

                {/* ═══ MATERIAIS CADASTRADOS ═══ */}
                <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5" /> Materiais de Divulgação
                    </h4>
                    {loadingProducts ? (
                        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                    ) : marketingProducts.length === 0 ? (
                        <div className="text-center py-8 rounded-xl border border-dashed border-primary/30 bg-primary/5">
                            <ImagePlus className="h-8 w-8 text-primary/40 mx-auto mb-2" />
                            <p className="font-semibold text-sm text-foreground">Nenhum material cadastrado</p>
                            <p className="text-xs text-muted-foreground mt-1 max-w-[280px] mx-auto">
                                Crie seu primeiro anúncio local para divulgar nas redes territoriais.
                            </p>
                            <Button size="sm" variant="outline" className="mt-3 border-primary/30 text-primary"
                                onClick={() => setIsCreateAdOpen(true)}>
                                <Plus className="h-4 w-4 mr-1" /> Criar Material
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {marketingProducts.map(ad => (
                                <div key={ad.id} className={cn(
                                    "bg-card border rounded-xl p-3 relative transition-all hover:shadow-md group",
                                    ad.is_active ? "border-primary/30 hover:border-primary/50" : "border-muted opacity-60"
                                )}>
                                    {/* Image */}
                                    {(() => {
                                        const resolvedUrl = normalizeImageUrl(ad.image_url);
                                        return resolvedUrl ? (
                                            <div className="aspect-[16/9] rounded-lg overflow-hidden bg-muted/50 mb-3 relative">
                                                <img
                                                    src={resolvedUrl}
                                                    alt=""
                                                    className="w-full h-full object-contain"
                                                    onError={(e) => {
                                                        e.currentTarget.style.display = 'none';
                                                        const fb = e.currentTarget.parentElement?.querySelector('.img-fallback') as HTMLElement;
                                                        if (fb) fb.style.display = 'flex';
                                                    }}
                                                />
                                                <div className="img-fallback absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5 items-center justify-center" style={{ display: 'none' }}>
                                                    <Megaphone className="h-8 w-8 text-primary/30" />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="aspect-[16/9] rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-3">
                                                <Megaphone className="h-8 w-8 text-primary/30" />
                                            </div>
                                        );
                                    })()}

                                    {/* Content */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-start justify-between gap-2">
                                            <h5 className="font-bold text-sm truncate">{ad.title}</h5>
                                            <Badge variant={ad.is_active ? "default" : "secondary"} className="text-[9px] shrink-0">
                                                {ad.is_active ? 'Ativo' : 'Inativo'}
                                            </Badge>
                                        </div>
                                        {ad.short_description && (
                                            <p className="text-xs text-muted-foreground line-clamp-2">{ad.short_description}</p>
                                        )}
                                        {ad.price_label && (
                                            <p className="text-lg font-black text-primary">
                                                R$ {ad.price_label}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                            {ad.target_city && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{ad.target_city}</span>}
                                            {ad.campaign_type && <Badge variant="outline" className="text-[9px] h-4">{ad.campaign_type}</Badge>}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-1.5 mt-3 pt-2 border-t">
                                        <Button variant="ghost" size="sm" className="flex-1 h-7 text-[10px]"
                                            onClick={() => handleToggleAd(ad)}>
                                            <Eye className="h-3 w-3 mr-1" /> {ad.is_active ? 'Desativar' : 'Ativar'}
                                        </Button>
                                        <Button variant="ghost" size="sm" className="h-7 text-[10px]"
                                            onClick={() => handleEditAd(ad)}>
                                            <Pencil className="h-3 w-3 mr-1" /> Editar
                                        </Button>
                                        <Button variant="ghost" size="sm" className="h-7 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => handleDeleteAd(ad)}>
                                            <Trash2 className="h-3 w-3 mr-1" /> Excluir
                                        </Button>
                                        {ad.tracking_slug && (
                                            <Button variant="ghost" size="sm" className="h-7 text-[10px]"
                                                onClick={() => { 
                                                    const url = `${window.location.origin}/p/${ad.tracking_slug}`;
                                                    navigator.clipboard.writeText(url);
                                                    toast.success('Link rastreável copiado!', { description: url });
                                                }}>
                                                <LinkIcon className="h-3 w-3 mr-1" /> Link
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ═══ CAMPANHAS NA FILA ═══ */}
                <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                        <Send className="h-3.5 w-3.5" /> Campanhas na Fila
                    </h4>
                    {loadingCampaigns ? (
                        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                    ) : campaigns.length === 0 ? (
                        <div className="text-center py-6 rounded-xl border border-dashed border-muted bg-muted/10">
                            <Send className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">Nenhuma campanha na fila. Use "Disparar" acima.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {campaigns.map(camp => {
                                const hasDispatches = camp.total_dispatches > 0;
                                const postPct = hasDispatches ? Math.round((camp.posted_count / camp.total_dispatches) * 100) : 0;
                                return (
                                    <div key={camp.id} className="bg-card border border-border/80 shadow-sm rounded-lg p-3 relative hover:border-primary/40 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <p className="font-bold text-sm truncate pr-4">{camp.title}</p>
                                            <Badge variant={camp.status === 'pending' || camp.status === 'active' || camp.status === 'ready' ? 'default' : 'secondary'} className="text-[9px] shrink-0">
                                                {camp.status}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-2">
                                            <span>{new Date(camp.created_at).toLocaleDateString()}</span>
                                            {camp.target_city && (
                                                <span className="flex items-center gap-0.5">
                                                    <MapPin className="h-3 w-3" />{camp.target_city}
                                                </span>
                                            )}
                                            {camp.campaign_type && (
                                                <Badge variant="outline" className="text-[8px] h-4">{camp.campaign_type}</Badge>
                                            )}
                                        </div>

                                        {/* Dispatch Progress */}
                                        {hasDispatches ? (
                                            <div className="space-y-1.5 mb-2">
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-muted-foreground font-medium">Postagens</span>
                                                    <span className="font-bold text-primary">{camp.posted_count}/{camp.total_dispatches}</span>
                                                </div>
                                                <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                                                    <div className="h-full rounded-full bg-primary transition-all duration-500"
                                                        style={{ width: `${postPct}%` }} />
                                                </div>
                                                <div className="flex gap-2 text-[9px] text-muted-foreground">
                                                    {camp.assigned_count > 0 && <span>🔵 {camp.assigned_count} aguardando</span>}
                                                    {camp.in_progress_count > 0 && <span>🟣 {camp.in_progress_count} em andamento</span>}
                                                    {camp.posted_count > 0 && <span>🟢 {camp.posted_count} postadas</span>}
                                                    {camp.failed_count > 0 && <span>🔴 {camp.failed_count} falhas</span>}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-[10px] text-muted-foreground/60 mb-2 flex items-center gap-1">
                                                <Send className="h-3 w-3" /> Aguardando distribuição automática
                                            </div>
                                        )}

                                        <div className="flex gap-1.5 pt-2 border-t">
                                            <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px]" onClick={() => {
                                                navigator.clipboard.writeText(camp.message_text || '');
                                                toast.success('Texto copiado');
                                            }}>
                                                <LinkIcon className="h-3 w-3 mr-1" /> Copiar
                                            </Button>
                                            <Button variant="ghost" size="sm" className="h-7 text-[10px]"
                                                onClick={async () => {
                                                    // Edit: update title/message directly
                                                    const newTitle = prompt('Novo título:', camp.title);
                                                    if (!newTitle || !newTitle.trim()) return;
                                                    const newMsg = prompt('Nova mensagem (texto do anúncio):', camp.message_text || '');
                                                    try {
                                                        const { error } = await (supabase.from('campaign_queue') as any)
                                                            .update({
                                                                title: newTitle.trim(),
                                                                message_text: newMsg?.trim() || camp.message_text,
                                                            })
                                                            .eq('id', camp.id);
                                                        if (error) throw error;
                                                        queryClient.invalidateQueries({ queryKey: ['merchant-campaigns'] });
                                                        toast.success('Campanha atualizada!');
                                                    } catch {
                                                        toast.error('Erro ao editar campanha.');
                                                    }
                                                }}>
                                                <Pencil className="h-3 w-3 mr-1" /> Editar
                                            </Button>
                                            <Button variant="ghost" size="sm"
                                                className="h-7 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={() => handleArchive(camp.id)}>
                                                <Trash2 className="h-3 w-3 mr-1" /> Excluir
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </CardContent>

            {/* ═══ MODAL: NOVO ANÚNCIO LOCAL ═══ */}
            <Dialog open={isCreateAdOpen} onOpenChange={setIsCreateAdOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-primary" />
                            {editingAdId ? 'Editar Material' : 'Novo Material de Divulgação'}
                        </DialogTitle>
                        <DialogDescription>
                            Cadastre seu material promocional local. Isso <strong>não</strong> afeta seus produtos de entrega.
                        </DialogDescription>
                    </DialogHeader>

                    {isAtMaterialLimit && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start gap-2 mt-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                            <div className="text-xs">
                                <p className="font-bold text-amber-700 dark:text-amber-400">Limite de {MAX_ACTIVE_MATERIALS} materiais ativos atingido</p>
                                <p className="text-amber-600/80 dark:text-amber-400/70 mt-0.5">
                                    Este material será salvo como <strong>inativo</strong>. Desative um material existente para liberar espaço.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-4 pt-2 max-h-[60vh] overflow-y-auto pr-1">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase tracking-wider">Título do anúncio *</Label>
                            <Input placeholder="Ex: Combo Família R$ 49,90" value={adTitle} onChange={e => setAdTitle(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase tracking-wider">Descrição curta</Label>
                            <Textarea placeholder="Ex: 2 pizzas + refrigerante + entrega grátis" value={adDescription}
                                onChange={e => setAdDescription(e.target.value)} maxLength={200} className="resize-none h-20" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold uppercase tracking-wider">Preço</Label>
                                <Input placeholder="49,90" value={adPrice} onChange={e => setAdPrice(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold uppercase tracking-wider">CTA (botão)</Label>
                                <Input placeholder="Peça agora!" value={adCta} onChange={e => setAdCta(e.target.value)} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                                    <ImagePlus className="h-3 w-3" /> Imagem do Anúncio
                                </Label>
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0] || null;
                                        if (f) {
                                            setAdImageFile(f);
                                            setAdImageUrl('');
                                        }
                                    }}
                                />
                                {adImageFile ? (
                                    <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2">
                                        <img src={URL.createObjectURL(adImageFile)} alt="" className="h-12 w-12 rounded-md object-cover" />
                                        <span className="text-xs truncate flex-1">{adImageFile.name}</span>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setAdImageFile(null)}>
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ) : adImageUrl ? (
                                    <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2">
                                        <img src={normalizeImageUrl(adImageUrl) || ''} alt="" className="h-12 w-12 rounded-md object-cover"
                                            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                        <span className="text-xs truncate flex-1 text-muted-foreground">Imagem atual</span>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setAdImageUrl('')}>
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ) : (
                                    <Button variant="outline" className="w-full h-16 border-dashed border-primary/30 hover:border-primary/50 hover:bg-primary/5"
                                        onClick={() => imageInputRef.current?.click()}>
                                        <div className="flex flex-col items-center gap-1">
                                            <Upload className="h-5 w-5 text-primary/50" />
                                            <span className="text-[10px] text-muted-foreground">Clique para adicionar imagem</span>
                                        </div>
                                    </Button>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
                                    URL do Vídeo
                                </Label>
                                <Input placeholder="https://youtube.com/..." value={adVideoUrl} onChange={e => setAdVideoUrl(e.target.value)} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold uppercase tracking-wider">Cidade</Label>
                                <Input placeholder="Ex: Blumenau" value={adCity} onChange={e => setAdCity(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold uppercase tracking-wider">Região / Bairro</Label>
                                <Input placeholder="Ex: Centro" value={adRegion} onChange={e => setAdRegion(e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                                <LinkIcon className="h-3 w-3" /> Link de destino
                            </Label>
                            <Input placeholder="https://sualoja.com.br" value={adExternalLink}
                                onChange={e => setAdExternalLink(e.target.value)}
                                className={adExternalLink && !/^https?:\/\//i.test(adExternalLink.trim()) ? 'border-red-400 focus-visible:ring-red-400' : ''}
                            />
                            {adExternalLink && !/^https?:\/\//i.test(adExternalLink.trim()) && (
                                <p className="text-[10px] text-red-500">Informe uma URL válida começando com https://</p>
                            )}
                            {!adExternalLink && (
                                <p className="text-[10px] text-muted-foreground">Link para onde o cliente será redirecionado (opcional)</p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase tracking-wider">Tipo do anúncio</Label>
                            <Select value={adType} onValueChange={setAdType}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="offer">Oferta</SelectItem>
                                    <SelectItem value="store_highlight">Destaque da Loja</SelectItem>
                                    <SelectItem value="promotional">Promocional</SelectItem>
                                    <SelectItem value="institucional">Institucional</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 flex gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                            <span>Este material é exclusivo para divulgação local. Não será listado como produto de entrega.</span>
                        </div>

                        <Button disabled={isSavingAd} onClick={handleSaveAd} className="w-full bg-primary hover:bg-primary/90 text-white font-bold">
                            {isSavingAd ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                            {isSavingAd ? 'Salvando...' : editingAdId ? 'Atualizar Material' : 'Salvar Material'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ═══ MODAL: DISPARAR PARA A FILA ═══ */}
            <Dialog open={isDispatchOpen} onOpenChange={setIsDispatchOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Send className="h-5 w-5 text-primary" />
                            Disparar para a Fila
                        </DialogTitle>
                        <DialogDescription>
                            Selecione um material de divulgação para enviar à frota de motoboys.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 pt-2">
                        {activeProducts.length === 0 ? (
                            <div className="text-center py-6 text-muted-foreground text-sm">
                                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                <p>Nenhum material ativo. Crie um primeiro.</p>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-wider">Material de divulgação</Label>
                                    {/* Visual card selection */}
                                    <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                                        {activeProducts.map(ad => (
                                            <div key={ad.id}
                                                className={cn(
                                                    "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all",
                                                    selectedAdId === ad.id
                                                        ? "border-primary bg-primary/5 shadow-sm"
                                                        : "border-border/50 hover:border-primary/30"
                                                )}
                                                onClick={() => setSelectedAdId(ad.id)}>
                                                {/* Thumbnail */}
                                                {ad.image_url ? (
                                                    <img src={ad.image_url} alt={ad.title}
                                                        className="w-14 h-14 rounded-lg object-cover shrink-0" />
                                                ) : (
                                                    <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                        <Megaphone className="h-5 w-5 text-primary/40" />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-sm truncate">{ad.title}</p>
                                                    {ad.price_label && (
                                                        <p className="text-xs font-bold text-primary">R$ {ad.price_label}</p>
                                                    )}
                                                    {ad.short_description && <p className="text-[10px] text-muted-foreground truncate">{ad.short_description}</p>}
                                                </div>
                                                {selectedAdId === ad.id && (
                                                    <CheckCircle className="h-5 w-5 text-primary shrink-0" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold uppercase tracking-wider">Chamada especial (Opcional)</Label>
                                    <Input placeholder="Ex: Só hoje! Entrega Grátis!" value={customPitch}
                                        onChange={e => setCustomPitch(e.target.value)} maxLength={60} />
                                    <p className="text-[10px] text-primary/70 font-medium">
                                        Link tracking anti-desintermediação será acoplado automaticamente.
                                    </p>
                                </div>

                                <div className="bg-amber-50 dark:bg-amber-500/10 p-3 rounded-lg border border-amber-200 dark:border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 flex gap-2">
                                    <MapPin className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                    <span>
                                        {merchantStore?.bairro
                                            ? `Seus anúncios serão distribuídos para postadores da malha territorial do bairro ${merchantStore.bairro}.`
                                            : 'Seus anúncios serão distribuídos para postadores da sua região.'}
                                        {' '}Se você também possui perfil motoboy, poderá visualizá-los na Central de Postagens.
                                    </span>
                                </div>

                                <Button disabled={isDispatching || !selectedAdId} onClick={handleDispatch}
                                    className="w-full bg-primary hover:bg-primary/90 text-white font-bold">
                                    {isDispatching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                                    Enviar para divulgação local
                                </Button>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
