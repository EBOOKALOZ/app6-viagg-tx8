import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
    Plus, Pencil, Trash2, Upload, X, Loader2, CheckCircle,
    ImagePlus, Video, Link as LinkIcon, Palette, Eye,
    Instagram, Facebook, Globe, ShoppingBag, Link2,
    FileArchive, Sparkles, Zap, Tag, PackageCheck,
} from "lucide-react";
import {
    processImage, extractImagesFromZip, isArchiveFile, isImageFile,
    getAcceptedFileTypes, formatBytes,
    type ProcessedImage, type ProcessingProgress,
} from "@/utils/imageProcessor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ─── Types ──────────────────────────────
interface ShowcaseProduct {
    id: string;
    title: string;
    short_description: string | null;
    image_url: string | null;
    video_url: string | null;
    external_link: string | null;
    price_label: string | null;
    cta_label: string | null; // JSON: {label, bgColor, textColor, cardBg}
    campaign_type: string | null;
    is_active: boolean;
    created_at: string;
    merchant_store_id: string | null;
    created_by_user_id: string;
    tracking_slug: string | null;
    category?: string | null;
}

interface CardStyle {
    label: string;
    bgColor: string;
    textColor: string;
    cardBg: string;
    _showcase?: boolean;
}

function parseCardStyle(cta: string | null): CardStyle {
    try {
        if (cta && cta.startsWith("{")) return JSON.parse(cta);
    } catch { /* ignore */ }
    return { label: "Comprar", bgColor: "#FF6A00", textColor: "#FFFFFF", cardBg: "#FFFFFF", _showcase: true };
}

function serializeCardStyle(style: CardStyle): string {
    return JSON.stringify(style);
}

// ─── Color Presets ──────────────────────
const COLOR_PRESETS = [
    { label: "Branco", value: "#FFFFFF" },
    { label: "Preto", value: "#1A1A2E" },
    { label: "Laranja", value: "#FF6A00" },
    { label: "Verde", value: "#059669" },
    { label: "Azul", value: "#2563EB" },
    { label: "Roxo", value: "#7C3AED" },
    { label: "Rosa", value: "#EC4899" },
    { label: "Vermelho", value: "#DC2626" },
    { label: "Dourado", value: "#D97706" },
    { label: "Cinza", value: "#6B7280" },
];

// ─── Image normalizer ───────────────────
function normalizeImageUrl(url: string | null | undefined): string | null {
    if (!url || typeof url !== "string") return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
    if (!/^https?:\/\//i.test(trimmed)) return null;
    return trimmed;
}



// ═══════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════
interface ProductShowcaseProps {
    storeId: string | null;
}

export default function ProductShowcase({ storeId }: ProductShowcaseProps) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const queryClient = useQueryClient();

    // ── Form state ──
    const [isOpen, setIsOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);

    // Image processing state
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);
    const [processedResult, setProcessedResult] = useState<ProcessedImage | null>(null);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [videoUrl, setVideoUrl] = useState("");
    const [socialLink, setSocialLink] = useState("");
    const [ctaLabel, setCtaLabel] = useState("Comprar");
    const [category, setCategory] = useState("");
    const [catDropdownOpen, setCatDropdownOpen] = useState(false);
    const [condition, setCondition] = useState<"novo" | "usado">("novo");
    const [cardBg, setCardBg] = useState("#FFFFFF");
    const [textColor, setTextColor] = useState("#1A1A2E");
    const [btnColor, setBtnColor] = useState("#FF6A00");

    // ── Fetch categories from DB (same source as landing page) ──
    const { data: dbCategories = [] } = useQuery<{ id: string; nome: string }[]>({
        queryKey: ["categorias-loja"],
        queryFn: async () => {
            const { data, error } = await (supabase.from("categorias_loja") as any)
                .select("id, nome")
                .order("nome");
            if (error) { console.error("[ProductShowcase] Categories error:", error); return []; }
            return (data || []) as { id: string; nome: string }[];
        },
        staleTime: 5 * 60 * 1000,
    });

    // Categorias que pertencem a outros perfis (veículos e imóveis)
    const OTHER_PROFILE_CATEGORIES = new Set([
        'moto','carro','caminhao','caminhão','onibus','ônibus','van','utilitario','utilitário',
        'barco','lancha','jet','quadriciclo','trator','maquina','máquina',
        'sitio','sítio','fazenda','chacara','chácara','lote','terreno','apartamento',
        'casa','comercial','galpao','galpão','rural','imovel','imóvel','haras',
    ]);

    // ── Query: merchant_marketing_products + advertiser_listings (excluindo veículos/imóveis) ──
    const { data: products = [], isLoading } = useQuery<ShowcaseProduct[]>({
        queryKey: ["showcase-products", user?.id],
        queryFn: async () => {
            // 1. Produtos da vitrine (merchant_marketing_products)
            const { data: vitrineData } = await (supabase.from("merchant_marketing_products") as any)
                .select("*")
                .eq("created_by_user_id", user!.id)
                .order("created_at", { ascending: false })
                .limit(50);
            const vitrineProducts = (vitrineData || []) as ShowcaseProduct[];

            // 2. Anúncios gerais do painel (advertiser_listings) — exclui categorias de outros perfis
            const { data: accData } = await (supabase.from("advertiser_accounts") as any)
                .select("id").eq("user_id", user!.id).limit(1).maybeSingle();

            let advProducts: ShowcaseProduct[] = [];
            if (accData?.id) {
                const { data: advData } = await (supabase.from("advertiser_listings") as any)
                    .select("*, advertiser_listing_media(media_url)")
                    .eq("advertiser_account_id", accData.id)
                    .order("created_at", { ascending: false });

                advProducts = ((advData || []) as any[])
                    .filter((item: any) => {
                        const cat = (item.category || "").toLowerCase().trim();
                        return !OTHER_PROFILE_CATEGORIES.has(cat);
                    })
                    .map((item: any) => {
                        const mediaFallback = item.advertiser_listing_media?.[0]?.media_url ?? null;
                        const style: CardStyle = {
                            label: "Ver produto",
                            bgColor: "#FF6A00",
                            textColor: "#FFFFFF",
                            cardBg: "#FFFFFF",
                            _showcase: true,
                        };
                        return {
                            id: item.id,
                            title: item.title || "Sem título",
                            short_description: item.description || null,
                            image_url: item.cover_image_url || mediaFallback,
                            video_url: null,
                            external_link: null,
                            price_label: item.price ? String(item.price) : null,
                            category: item.category || null,
                            cta_label: serializeCardStyle(style),
                            campaign_type: "offer",
                            is_active: item.listing_status === "active" || item.listing_status === "published",
                            created_at: item.created_at,
                            merchant_store_id: storeId,
                            created_by_user_id: user!.id,
                            tracking_slug: null,
                        } as ShowcaseProduct;
                    });
            }

            // Merge sem duplicatas
            const vitrineIds = new Set(vitrineProducts.map(p => p.id));
            return [...vitrineProducts, ...advProducts.filter(p => !vitrineIds.has(p.id))];
        },
        enabled: !!user,
    });



    // ── Handlers ──
    const resetForm = () => {
        setTitle(""); setDescription(""); setPrice(""); setImageUrl(""); setImageFile(null);
        setVideoUrl(""); setSocialLink(""); setCtaLabel("Comprar"); setCardBg("#FFFFFF");
        setTextColor("#1A1A2E"); setBtnColor("#FF6A00"); setEditingId(null);
        setCategory(""); setCondition("novo");
        setCatDropdownOpen(false);
        setProcessedResult(null); setProcessingProgress(null); setIsProcessing(false);
    };

    // ── Image processing handler ──
    const handleImageSelect = useCallback(async (file: File) => {
        if (isArchiveFile(file)) {
            // Extract images from ZIP
            setIsProcessing(true);
            try {
                const images = await extractImagesFromZip(file, setProcessingProgress);
                if (images.length === 0) {
                    toast.error("Nenhuma imagem encontrada no arquivo ZIP");
                    setIsProcessing(false);
                    return;
                }
                // Process the first image found
                const result = await processImage(images[0], setProcessingProgress);
                setImageFile(result.file);
                setImageUrl("");
                setProcessedResult(result);
                toast.success(`Imagem extraída e otimizada! ${formatBytes(result.originalSize)} → ${formatBytes(result.compressedSize)}`);
            } catch (err: any) {
                toast.error(err?.message || "Erro ao processar arquivo");
            } finally {
                setIsProcessing(false);
            }
        } else if (isImageFile(file)) {
            // Process single image
            setIsProcessing(true);
            try {
                console.log(`[ProductShowcase] Processing image: name=${file.name} type="${file.type}" size=${file.size}`);
                const result = await processImage(file, setProcessingProgress);
                setImageFile(result.file);
                setImageUrl("");
                setProcessedResult(result);
                toast.success(`Imagem otimizada! ${formatBytes(result.originalSize)} → ${formatBytes(result.compressedSize)}`);
            } catch (err: any) {
                console.warn("[ProductShowcase] Processing failed, using original file:", err?.message);
                // Graceful fallback: use original file without processing
                setImageFile(file);
                setImageUrl("");
                setProcessedResult(null);
                toast.warning("Imagem carregada sem otimização (formato especial)", {
                    description: "O arquivo será enviado no formato original."
                });
            } finally {
                setIsProcessing(false);
            }
        } else {
            toast.error("Tipo de arquivo não suportado. Use imagens ou arquivos ZIP.");
        }
    }, []);

    const openCreate = () => {
        resetForm();
        setIsOpen(true);
    };

    const openEdit = (p: ShowcaseProduct) => {
        const style = parseCardStyle(p.cta_label);
        setEditingId(p.id);
        setTitle(p.title);
        setDescription(p.short_description || "");
        setPrice(p.price_label || "");
        setImageUrl(p.image_url || "");
        setVideoUrl(p.video_url || "");
        setSocialLink(p.external_link || "");
        setCtaLabel(style.label);
        setCategory((p as any).category || "");
        setCondition((p as any).condition === "usado" ? "usado" : "novo");
        setCardBg(style.cardBg);
        setTextColor(style.textColor);
        setBtnColor(style.bgColor);
        setIsOpen(true);
    };

    const handleSave = async () => {
        if (!title.trim()) { toast.error("Informe o nome do produto"); return; }
        if (!storeId) { toast.error("Loja não encontrada"); return; }
        setIsSaving(true);
        try {
            const style: CardStyle = { label: ctaLabel, bgColor: btnColor, textColor, cardBg, _showcase: true };
            const payload: any = {
                title: title.trim(),
                short_description: description.trim() || null,
                price_label: price.trim() || null,
                video_url: videoUrl.trim() || null,
                external_link: socialLink.trim() && /^https?:\/\//i.test(socialLink.trim()) ? socialLink.trim() : null,
                cta_label: serializeCardStyle(style),
                campaign_type: "offer",
                category: category.trim() || null,
                condition: condition,
            };

            // Handle image — converte para JPEG via Canvas para garantir compatibilidade
            if (imageFile) {
                const timestamp = Date.now();
                const baseName = imageFile.name
                    .replace(/\.[^/.]+$/, '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-zA-Z0-9_-]/g, '_')
                    .replace(/_+/g, '_')
                    .substring(0, 80);
                const path = `merchant/${user?.id}/${timestamp}-${baseName}.jpg`;

                let uploadBlob: Blob = imageFile;
                let processFile: File | Blob = imageFile;

                const isHeic = imageFile.name.toLowerCase().endsWith('.heic') || imageFile.name.toLowerCase().endsWith('.heif') || imageFile.type === 'image/heic' || imageFile.type === 'image/heif';
                
                if (isHeic) {
                   try {
                       const convertedBlob = await import("heic2any").then(m => m.default({ blob: imageFile, toType: "image/jpeg", quality: 0.88 }));
                       processFile = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
                       uploadBlob = processFile;
                   } catch(e) {}
                }

                let bitmap: ImageBitmap | null = null;
                try {
                    bitmap = await createImageBitmap(processFile);
                } catch (err) {
                    console.warn('[ProductShowcase] Canvas nativo falhou. Possível JPG camuflado. Acionando heic2any fallback...', err);
                    try {
                        const convertedBlob = await import("heic2any").then(m => m.default({ blob: processFile, toType: "image/jpeg", quality: 0.88 }));
                        processFile = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
                        uploadBlob = processFile;
                        bitmap = await createImageBitmap(processFile);
                    } catch(fallbackErr) {
                        console.error('[ProductShowcase] Blind fallback também falhou:', fallbackErr);
                    }
                }

                if (bitmap) {
                    try {
                        const MAX = 1600;
                        let w = bitmap.width;
                        let h = bitmap.height;
                        if (w > MAX || h > MAX) {
                            const ratio = Math.min(MAX / w, MAX / h);
                            w = Math.round(w * ratio);
                            h = Math.round(h * ratio);
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(bitmap, 0, 0, w, h);
                            const blob = await new Promise<Blob>((resolve) =>
                                canvas.toBlob((b) => resolve(b || processFile), 'image/jpeg', 0.88)
                            );
                            uploadBlob = blob;
                        }
                        bitmap.close();
                    } catch(e) {
                         console.error("[ProductShowcase] Erro na renderização do canvas:", e);
                    }
                }

                const { error: uploadErr } = await supabase.storage
                    .from("marketing-materials")
                    .upload(path, uploadBlob, { contentType: 'image/jpeg', upsert: false });
                if (uploadErr) throw new Error(`Upload falhou: ${uploadErr.message}`);
                const { data: urlData } = supabase.storage.from("marketing-materials").getPublicUrl(path);
                payload.image_url = urlData.publicUrl;
            } else if (imageUrl) {
                payload.image_url = normalizeImageUrl(imageUrl) || null;
            } else {
                payload.image_url = null;
            }

            if (editingId) {
                const { error } = await (supabase.from("merchant_marketing_products") as any)
                    .update(payload).eq("id", editingId);
                if (error) throw error;
                toast.success("Produto atualizado!");
            } else {
                payload.merchant_store_id = storeId;
                payload.created_by_user_id = user?.id;
                payload.is_active = true;
                const { error } = await (supabase.from("merchant_marketing_products") as any).insert(payload);
                if (error) throw error;
                toast.success("Produto criado!");
            }
            setIsOpen(false);
            resetForm();
            queryClient.invalidateQueries({ queryKey: ["showcase-products"] });
            queryClient.invalidateQueries({ queryKey: ["merchant-marketing-products"] });
        } catch (err: any) {
            toast.error(err?.message || "Erro ao salvar");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (p: ShowcaseProduct) => {
        if (!confirm(`Excluir "${p.title}"? Essa ação não pode ser desfeita.`)) return;
        try {
            await (supabase.from("merchant_marketing_products") as any).delete().eq("id", p.id);
            queryClient.invalidateQueries({ queryKey: ["showcase-products"] });
            queryClient.invalidateQueries({ queryKey: ["merchant-marketing-products"] });
            toast.success("Produto excluído.");
        } catch {
            toast.error("Erro ao excluir.");
        }
    };

    // ── Color picker helper ──
    const ColorPicker = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
        <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                <Palette className="h-3 w-3" /> {label}
            </Label>
            <div className="flex items-center gap-2">
                <div className="flex gap-1 flex-wrap flex-1">
                    {COLOR_PRESETS.map(c => (
                        <button key={c.value} title={c.label}
                            className={cn("w-6 h-6 rounded-full border-2 transition-all hover:scale-110",
                                value === c.value ? "border-gray-800 scale-110 ring-2 ring-gray-300" : "border-gray-200")}
                            style={{ backgroundColor: c.value }}
                            onClick={() => onChange(c.value)} />
                    ))}
                </div>
                <Input type="color" value={value} onChange={e => onChange(e.target.value)}
                    className="w-10 h-8 p-0.5 bg-transparent border-gray-200 rounded cursor-pointer" />
            </div>
        </div>
    );

    // ── Preview card ──
    const PreviewCard = () => {
        const img = imageFile ? URL.createObjectURL(imageFile) : normalizeImageUrl(imageUrl);
        return (
            <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm" style={{ backgroundColor: cardBg }}>
                {img ? (
                    <img src={img} alt="" className="w-full h-24 object-cover" />
                ) : (
                    <div className="w-full h-24 bg-gray-100 flex items-center justify-center">
                        <ImagePlus className="h-6 w-6 text-gray-300" />
                    </div>
                )}
                <div className="p-3">
                    <p className="font-bold text-sm truncate" style={{ color: textColor }}>{title || "Nome do Produto"}</p>
                    {price && <p className="text-lg font-black mt-0.5" style={{ color: btnColor }}>R$ {price}</p>}
                    <button className="mt-2 w-full text-xs font-bold py-1.5 rounded-lg" style={{ backgroundColor: btnColor, color: "#fff" }}>
                        {ctaLabel || "Comprar"}
                    </button>
                </div>
            </div>
        );
    };

    return (
        <>
            <div>
                <div className="flex items-center justify-between mb-3">
                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em] flex items-center gap-1.5">
                        <ShoppingBag className="h-3.5 w-3.5" /> Vitrine de Produtos
                    </p>
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] text-gray-400 font-bold">{products.length} produtos</span>
                        <Button size="sm" className="bg-orange-500/15 text-orange-600 hover:bg-orange-500/25 border border-orange-500/20 text-[10px] font-bold h-7 rounded-lg"
                            onClick={() => navigate("/anunciante/meus-anuncios")}>
                            <Plus className="h-3 w-3 mr-1" /> Adicionar
                        </Button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                ) : products.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center bg-white shadow-sm">
                        <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-4 border border-orange-100">
                            <ShoppingBag className="h-7 w-7 text-orange-300" />
                        </div>
                        <p className="text-sm font-bold text-gray-600">Monte sua loja</p>
                        <p className="text-[11px] text-gray-400 mt-2 max-w-[260px] mx-auto leading-relaxed">
                            Adicione produtos com fotos, vídeos, preços e personalização visual completa.
                        </p>
                        <Button size="sm" className="mt-4 bg-orange-500 text-white hover:bg-orange-600 text-xs font-bold rounded-lg"
                            onClick={() => navigate("/anunciante/meus-anuncios")}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Criar Primeiro Produto
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 bg-[#F5E62B] p-4 rounded-3xl">
                        {products.map(p => {
                            const style = parseCardStyle(p.cta_label);
                            const imgSrc = normalizeImageUrl(p.image_url);
                            return (
                                <div key={p.id} className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-all"
                                    style={{ backgroundColor: style.cardBg }}>
                                    {/* Image */}
                                    <a href={p.tracking_slug ? `/p/${p.tracking_slug}` : `/produto/${p.id}`} target="_blank" rel="noopener noreferrer" className="block relative group cursor-pointer">
                                        {imgSrc ? (
                                            <div className="aspect-[16/10] overflow-hidden bg-gray-50">
                                                <img src={imgSrc} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                    onError={async (e) => {
                                                        const el = e.currentTarget;
                                                        // Evitar loop infinito
                                                        if (el.dataset.retried) { el.style.display = "none"; return; }
                                                        el.dataset.retried = "1";
                                                        // Tenta carregar via fetch → blob para corrigir contentType errado
                                                        try {
                                                            const res = await fetch(imgSrc);
                                                            if (!res.ok) { el.style.display = "none"; return; }
                                                            const blob = await res.blob();
                                                            const fixedBlob = blob.type.startsWith('image/')
                                                                ? blob
                                                                : new Blob([blob], { type: 'image/jpeg' });
                                                            el.src = URL.createObjectURL(fixedBlob);
                                                        } catch {
                                                            el.style.display = "none";
                                                        }
                                                    }} />
                                            </div>
                                        ) : (
                                            <div className="aspect-[16/10] bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                                                <ImagePlus className="h-8 w-8 text-gray-200 group-hover:scale-110 transition-transform duration-500" />
                                            </div>
                                        )}
                                    </a>
                                    {/* Content */}
                                    <div className="p-4 space-y-2">
                                        <a href={p.tracking_slug ? `/p/${p.tracking_slug}` : `/produto/${p.id}`} target="_blank" rel="noopener noreferrer" className="block hover:opacity-80 transition-opacity">
                                            <h5 className="font-bold text-[15px] truncate" style={{ color: style.textColor }}>{p.title}</h5>
                                        </a>
                                        {p.category && (
                                            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider mb-1" style={{ backgroundColor: style.bgColor + '20', color: style.bgColor }}>
                                                {p.category}
                                            </span>
                                        )}
                                        {p.short_description && (
                                            <p className="text-[11px] line-clamp-2 leading-relaxed" style={{ color: style.textColor, opacity: 0.6 }}>
                                                {p.short_description}
                                            </p>
                                        )}
                                        {p.price_label ? (
                                            <p className="text-xl font-black" style={{ color: style.bgColor }}>
                                                R$ {(() => {
                                                    const clean = String(p.price_label).replace(/[^\d.,]/g, '');
                                                    let num = parseFloat(clean.replace(/\./g, '').replace(',', '.'));
                                                    if(isNaN(num)) return p.price_label;
                                                    return num.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
                                                })()}
                                            </p>
                                        ) : (
                                            <p className="text-[11px] italic text-gray-300">Sob consulta</p>
                                        )}
                                        {/* Social / Link */}
                                        {p.external_link && (
                                            <a href={p.external_link} target="_blank" rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-500 hover:text-blue-700 transition-colors">
                                                {p.external_link.includes("instagram") ? <Instagram className="h-3 w-3" /> :
                                                    p.external_link.includes("facebook") ? <Facebook className="h-3 w-3" /> :
                                                        <Globe className="h-3 w-3" />}
                                                Ver mais
                                            </a>
                                        )}
                                        {/* Video badge */}
                                        {p.video_url && (
                                            <a href={p.video_url} target="_blank" rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-500 hover:text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                                                <Video className="h-3 w-3" /> Vídeo
                                            </a>
                                        )}
                                        {/* CTA Button */}
                                        <a href={p.tracking_slug ? `/p/${p.tracking_slug}` : `/produto/${p.id}`} target="_blank" rel="noopener noreferrer" 
                                            className="w-full text-sm font-bold py-2 rounded-xl transition-opacity hover:opacity-90 flex items-center justify-center cursor-pointer"
                                            style={{ backgroundColor: style.bgColor, color: "#fff" }}>
                                            {style.label}
                                        </a>
                                        {/* Action bar */}
                                        <div className="flex gap-1 pt-2 border-t" style={{ borderColor: style.textColor + '1A' }}>
                                            <button onClick={() => navigate(`/anunciante/anuncios/editar/produto/${p.id}`)}
                                                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors">
                                                <Pencil className="h-3 w-3" /> Editar
                                            </button>
                                            {p.tracking_slug && (
                                                <button onClick={() => {
                                                    const url = `${window.location.origin}/p/${p.tracking_slug}`;
                                                    navigator.clipboard.writeText(url);
                                                    toast.success('Link rastreável copiado!', { description: url });
                                                }}
                                                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold text-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                                                    <Link2 className="h-3 w-3" /> Link
                                                </button>
                                            )}
                                            <button onClick={() => handleDelete(p)}
                                                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                                                <Trash2 className="h-3 w-3" /> Excluir
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {/* Add placeholder — always visible */}
                        <div className="rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center p-6 hover:border-orange-300 hover:bg-orange-50/30 cursor-pointer transition-all min-h-[200px]"
                            onClick={() => navigate("/anunciante/meus-anuncios")}>
                            <Plus className="h-8 w-8 text-gray-300 mb-2" />
                            <p className="text-xs font-bold text-gray-400">Adicionar produto</p>
                        </div>
                    </div>
                )}
            </div>

            {/* ═══ MODAL: CRIAR / EDITAR PRODUTO ═══ */}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-2xl bg-white border-gray-200 text-gray-800 max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShoppingBag className="h-5 w-5 text-orange-500" />
                            {editingId ? "Editar Produto" : "Novo Produto da Vitrine"}
                        </DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Personalize seu card de produto com cores, imagens e vídeos.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-6 pt-2">
                        {/* Left: Form Fields */}
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Nome do Produto *</Label>
                                <Input placeholder="Ex: Pizza Margherita" value={title} onChange={e => setTitle(e.target.value)}
                                    className="border-gray-200 text-white" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Descrição</Label>
                                <Textarea placeholder="Descreva seu produto..." value={description}
                                    onChange={e => setDescription(e.target.value)} maxLength={250}
                                    className="border-gray-200 resize-none h-20 text-white" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Preço (R$)</Label>
                                    <Input placeholder="49,90" value={price} onChange={e => setPrice(e.target.value)}
                                        className="border-gray-200 text-white" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Texto do Botão</Label>
                                    <Input placeholder="Comprar" value={ctaLabel} onChange={e => setCtaLabel(e.target.value)}
                                        className="border-gray-200 text-white" />
                                </div>
                            </div>

                            {/* Category & Condition */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5 relative">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                                        <Tag className="h-3 w-3" /> Categoria
                                    </Label>
                                    <Input
                                        placeholder="Digite para buscar..."
                                        value={category}
                                        onChange={e => setCategory(e.target.value)}
                                        onFocus={() => setCatDropdownOpen(true)}
                                        onBlur={() => setTimeout(() => setCatDropdownOpen(false), 200)}
                                        className="border-gray-200 text-white"
                                    />
                                    {catDropdownOpen && (() => {
                                        const q = category.toLowerCase().trim();
                                        const filtered = q
                                            ? dbCategories.filter(c => c.nome.toLowerCase().includes(q))
                                            : dbCategories;
                                        if (filtered.length === 0) return null;
                                        return (
                                            <div className="absolute z-[9999] w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-auto">
                                                {filtered.map(cat => (
                                                    <button key={cat.id} type="button"
                                                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 transition-colors"
                                                        onClick={() => { setCategory(cat.nome); setCatDropdownOpen(false); }}>
                                                        {cat.nome}
                                                    </button>
                                                ))}
                                            </div>
                                        );
                                    })()}
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                                        <PackageCheck className="h-3 w-3" /> Condição
                                    </Label>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setCondition("novo")}
                                            className={`flex-1 h-9 rounded-lg text-xs font-bold border-2 transition-all ${
                                                condition === "novo"
                                                    ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                                                    : "border-gray-200 bg-white text-gray-400 hover:border-gray-300"
                                            }`}>
                                            ✨ Novo
                                        </button>
                                        <button type="button" onClick={() => setCondition("usado")}
                                            className={`flex-1 h-9 rounded-lg text-xs font-bold border-2 transition-all ${
                                                condition === "usado"
                                                    ? "border-amber-400 bg-amber-50 text-amber-700"
                                                    : "border-gray-200 bg-white text-gray-400 hover:border-gray-300"
                                            }`}>
                                            🔄 Usado
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Image Upload — with processing pipeline */}
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                                    <ImagePlus className="h-3 w-3" /> Imagem do Produto
                                    <span className="ml-auto text-[8px] font-medium text-emerald-500 flex items-center gap-0.5">
                                        <Sparkles className="h-2.5 w-2.5" /> Auto-otimização
                                    </span>
                                </Label>
                                <input ref={imageInputRef} type="file" accept={getAcceptedFileTypes()} className="hidden"
                                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); e.target.value = ''; }} />

                                {/* Processing indicator */}
                                {isProcessing && processingProgress && (
                                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                            <span className="text-xs font-bold text-blue-600">{processingProgress.message}</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                                                style={{ width: `${processingProgress.percent}%` }} />
                                        </div>
                                    </div>
                                )}

                                {/* Image selected */}
                                {!isProcessing && imageFile ? (
                                    <div className="rounded-xl border border-orange-200 bg-orange-50 p-2 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <img src={processedResult?.preview || URL.createObjectURL(imageFile)} alt=""
                                                className="h-12 w-12 rounded-md object-cover" />
                                            <div className="flex-1 min-w-0">
                                                <span className="text-xs truncate block text-gray-600 font-medium">{imageFile.name}</span>
                                                {processedResult && (
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-bold flex items-center gap-0.5">
                                                            <Zap className="h-2.5 w-2.5" />
                                                            {formatBytes(processedResult.compressedSize)}
                                                        </span>
                                                        <span className="text-[9px] text-gray-400 line-through">
                                                            {formatBytes(processedResult.originalSize)}
                                                        </span>
                                                        <span className="text-[9px] text-emerald-600 font-bold">
                                                            -{Math.round((1 - processedResult.compressionRatio) * 100)}%
                                                        </span>
                                                        <span className="text-[8px] px-1 py-0.5 rounded bg-purple-100 text-purple-600 font-bold uppercase">
                                                            {processedResult.format}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0"
                                                onClick={() => { setImageFile(null); setProcessedResult(null); }}>
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                ) : !isProcessing && imageUrl ? (
                                    <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 p-2">
                                        <img src={normalizeImageUrl(imageUrl) || ""} alt="" className="h-12 w-12 rounded-md object-cover"
                                            onError={e => { e.currentTarget.style.display = "none"; }} />
                                        <span className="text-xs truncate flex-1 text-gray-400">Imagem atual</span>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setImageUrl("")}><X className="h-3 w-3" /></Button>
                                    </div>
                                ) : !isProcessing ? (
                                    <Button variant="outline" className="w-full h-20 border-dashed border-gray-200 hover:border-orange-300 hover:bg-orange-50/50"
                                        onClick={() => imageInputRef.current?.click()}>
                                        <div className="flex flex-col items-center gap-1.5">
                                            <div className="flex items-center gap-3">
                                                <Upload className="h-5 w-5 text-gray-300" />
                                                <FileArchive className="h-4 w-4 text-gray-200" />
                                            </div>
                                            <span className="text-[10px] text-gray-400">Clique para adicionar</span>
                                            <span className="text-[8px] text-gray-300">JPG, PNG, WebP, GIF, BMP, HEIC, AVIF, SVG ou ZIP</span>
                                        </div>
                                    </Button>
                                ) : null}

                                <div className="mt-1">
                                    <Input placeholder="Ou cole URL da imagem..." value={imageUrl}
                                        onChange={e => { setImageUrl(e.target.value); setImageFile(null); setProcessedResult(null); }}
                                        className="border-gray-200 text-xs h-8 text-white" />
                                </div>
                            </div>

                            {/* Video URL */}
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                                    <Video className="h-3 w-3" /> URL do Vídeo
                                </Label>
                                <Input placeholder="https://youtube.com/watch?v=..." value={videoUrl}
                                    onChange={e => setVideoUrl(e.target.value)} className="border-gray-200 text-white" />
                            </div>

                            {/* Social Link */}
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                                    <LinkIcon className="h-3 w-3" /> Link (Instagram, Facebook, Site)
                                </Label>
                                <Input placeholder="https://instagram.com/suapagina" value={socialLink}
                                    onChange={e => setSocialLink(e.target.value)}
                                    className={cn("border-gray-200 text-white", socialLink && !/^https?:\/\//i.test(socialLink.trim()) && "border-rose-300")} />
                            </div>

                            {/* ── Color Customization ── */}
                            <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 space-y-4">
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 flex items-center gap-1">
                                    <Palette className="h-3.5 w-3.5" /> Personalização Visual
                                </p>
                                <ColorPicker label="Cor do Fundo do Card" value={cardBg} onChange={setCardBg} />
                                <ColorPicker label="Cor do Texto" value={textColor} onChange={setTextColor} />
                                <ColorPicker label="Cor do Botão" value={btnColor} onChange={setBtnColor} />
                            </div>
                        </div>

                        {/* Right: Preview */}
                        <div className="space-y-2">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                <Eye className="h-3 w-3" /> Prévia
                            </p>
                            <PreviewCard />
                        </div>
                    </div>

                    <Button disabled={isSaving} onClick={handleSave}
                        className="w-full mt-4 bg-orange-500 hover:bg-orange-600 text-white font-bold">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                        {isSaving ? "Salvando..." : editingId ? "Atualizar Produto" : "Salvar Produto"}
                    </Button>
                </DialogContent>
            </Dialog>
        </>
    );
}
