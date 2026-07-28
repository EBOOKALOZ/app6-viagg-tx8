import { useState, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAdvertiserAuctions, type AuctionListing, type AdvertiserCreateListingInput as CreateListingInput } from "@/hooks/useAdvertiserAuctions";
import { useArremate, type ArremateOffer } from "@/hooks/useArremate";
import { useMerchantCredits } from "@/hooks/useMerchantCredits";
import { useCompressedImageUpload } from "@/hooks/useCompressedImageUpload";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";
import {
  Gavel, Tag, Plus, Clock, Eye, Users, TrendingUp, CheckCircle, XCircle,
  ChevronRight, Package, Loader2, AlertCircle, Crown, Zap, Timer, Edit, Trash2,
  ShoppingBag, ImagePlus, RefreshCw, Search, ClipboardList, Coins, PauseCircle,
  Settings, Calendar, DollarSign, Shield, ArrowUpDown, Truck, MapPin,
  ToggleLeft, ToggleRight, Save, Hash, X, PlayCircle, StopCircle, ExternalLink, Megaphone, Gift
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { MerchantRecentEvents } from "@/components/merchant/MerchantRecentEvents";
import { PromotionPlansModal } from "@/components/promotion/PromotionPlansModal";
import { PromotionPlansGrid } from "@/components/promotion/PromotionPlansGrid";
import { INCREMENT_PRESETS } from "@/lib/auctions/incrementPresets";

// ─── Helpers ────────────────────────────

function normalizeImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

// Presets de incremento mínimo do lance — FONTE ÚNICA compartilhada com a página
// pública (o participante vê a MESMA régua). O lojista escolhe um preset OU
// "Personalizado". O valor vira `form.minimum_increment` e é ENFORÇADO no backend
// (place_auction_bid): todo lance deve respeitar o incremento a partir da base.

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function CountdownTimer({ endsAt, onEnd }: { endsAt: string; onEnd?: () => void }) {
  const [now, setNow] = useState(Date.now());
  const [hasEnded, setHasEnded] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const diff = new Date(endsAt).getTime() - now;

  useEffect(() => {
    if (diff <= 0 && !hasEnded) {
      setHasEnded(true);
      if (onEnd) onEnd();
    }
  }, [diff, hasEnded, onEnd]);

  if (diff <= 0) return <span className="text-red-500 font-black uppercase tracking-widest text-[10px]">Encerrado</span>;

  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  const isUrgent = diff < 3600000; // < 1 hora

  return (
    <span className={`font-mono font-black tabular-nums tracking-tighter ${isUrgent ? "text-red-500 animate-pulse" : "text-[#FF6A00]"}`}>
      {d > 0 && <>{String(d).padStart(2, "0")}d </>}
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; color: string }> = {
    active: { label: "Ativo", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    sold: { label: "Vendido", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    ended: { label: "Encerrado", color: "bg-gray-800 text-gray-400 border-gray-700" },
    cancelled: { label: "Cancelado", color: "bg-red-500/20 text-red-400 border-red-500/30" },
    draft: { label: "Rascunho", color: "bg-[#FF6A00]/20 text-[#FF6A00] border-[#FF6A00]/30" },
  };
  const s = map[status] || { label: status, color: "bg-gray-800 text-gray-400 border-gray-700" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-sm ${s.color}`}>
      {s.label}
    </span>
  );
}

// ─── KPI Card ───────────────────────────
function KPICard({ icon: Icon, label, value, color, accent }: {
  icon: typeof Tag; label: string; value: number; color: string; accent: string;
}) {
  return (
    <div className="bg-[#1A1F24] rounded-2xl p-4 shadow-lg shadow-black/20 border border-[#323A45] flex items-center gap-4 min-w-0 hover:border-[#FF6A00]/30 transition-all group">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 ${accent}`}>
        <Icon className={`h-6 w-6 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-black text-[#FFFFFF] leading-tight">{value}</p>
        <p className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.1em] truncate">{label}</p>
      </div>
    </div>
  );
}

// ─── CreateListingModal ─────────────────

function CreateListingModal({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  initialData,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (input: CreateListingInput) => void;
  isSubmitting: boolean;
  initialData?: { title: string; description?: string; image_url?: string; price?: number } | null;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
   const [productSearch, setProductSearch] = useState("");
   const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
   const dropdownRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    listing_type: "auction" as "auction" | "arremate",
    starting_price: "",
    minimum_increment: "1",
    buy_now_price: "",
    duration_hours: "24",
    fulfillment: "pickup",
    product_image_url: "",
  });
  // Modo do seletor de incremento: false = preset (botões), true = personalizado.
  const [incrementCustom, setIncrementCustom] = useState(false);

  // Query for catalog: Todos os produtos cadastrados (Loja + Marketplace + Imóveis + Veículos)
  const { data: catalog = [] } = useQuery({
    queryKey: ["auction-catalog-all", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Resolver advertiser account para buscar produtos do marketplace
      const { data: advertiserData } = await supabase
        .from('advertiser_accounts' as any)
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      const [pRes, aRes, rRes, vRes] = await Promise.all([
        // 1. Produtos da loja (product_listings)
        supabase.from("product_listings" as any)
          .select("id, title, price, cover_image_url, description, is_active")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: false }),
        // 2. Anúncios do marketplace (advertiser_listings)
        advertiserData?.id
          ? supabase.from("advertiser_listings" as any)
              .select("id, title, description, cover_image_url, price, advertiser_listing_media(media_url)")
              .eq("advertiser_account_id", advertiserData.id)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] }),
        // 3. Imóveis (real_estate_listings)
        supabase.from("real_estate_listings" as any)
          .select("id, title, price_brl, description, visibility_status, real_estate_media(original_storage_path, public_masked_storage_path)")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: false }),
        // 4. Veículos (vehicle_listings)
        supabase.from("vehicle_listings" as any)
          .select("id, title, price_brl, description, visibility_status, cover_image_url, vehicle_media(original_storage_path, public_masked_storage_path)")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      const formats: any[] = [];
      const seenIds = new Set<string>();

      // Produtos da loja
      if (pRes.data) {
        for (const p of pRes.data as any[]) {
          if (seenIds.has(p.id)) continue;
          seenIds.add(p.id);
          let imgUrl = p.cover_image_url || null;
          if (imgUrl && !imgUrl.startsWith('http')) {
            imgUrl = supabase.storage.from('marketing-materials').getPublicUrl(imgUrl).data.publicUrl;
          }
          formats.push({
            id: p.id,
            title: `[Produto] ${p.title || 'Sem título'}`,
            description: p.description,
            cover_image_url: imgUrl,
            price: p.price || 0,
          });
        }
      }

      // Anúncios do marketplace
      if (aRes.data) {
        for (const a of aRes.data as any[]) {
          if (seenIds.has(a.id)) continue;
          seenIds.add(a.id);
          const mediaFallback = a.advertiser_listing_media?.[0]?.media_url ?? null;
          let imgUrl = a.cover_image_url || mediaFallback;
          if (imgUrl && !imgUrl.startsWith('http')) {
            imgUrl = supabase.storage.from('marketing-materials').getPublicUrl(imgUrl).data.publicUrl;
          }
          formats.push({
            id: a.id,
            title: `[Anúncio] ${a.title || 'Sem título'}`,
            description: a.description,
            cover_image_url: imgUrl,
            price: a.price || 0,
          });
        }
      }

      // Imóveis
      if (rRes.data) {
        for (const r of rRes.data as any[]) {
          if (seenIds.has(r.id)) continue;
          seenIds.add(r.id);
          let img = null;
          if (r.real_estate_media?.length > 0) {
            const path = r.real_estate_media[0].public_masked_storage_path || r.real_estate_media[0].original_storage_path;
            if (path) img = supabase.storage.from('real-estate-public').getPublicUrl(path).data.publicUrl;
          }
          formats.push({
            id: r.id,
            title: `[Imóvel] ${r.title || 'Sem título'}`,
            description: r.description,
            cover_image_url: img,
            price: r.price_brl || 0,
          });
        }
      }

      // Veículos
      if (vRes.data) {
        for (const v of vRes.data as any[]) {
          if (seenIds.has(v.id)) continue;
          seenIds.add(v.id);
          let img: string | null = v.cover_image_url || null;
          if (!img && v.vehicle_media?.length > 0) {
            const path = v.vehicle_media[0].public_masked_storage_path || v.vehicle_media[0].original_storage_path;
            if (path) img = path.startsWith('http') ? path : supabase.storage.from('real-estate-original').getPublicUrl(path).data.publicUrl;
          }
          formats.push({
            id: v.id,
            title: `[Veículo] ${v.title || 'Sem título'}`,
            description: v.description,
            cover_image_url: img,
            price: v.price_brl || 0,
          });
        }
      }

      return formats;
    },
    enabled: !!user?.id && open,
  });

  const handleProductSelect = (product: any) => {
    setSelectedProductId(product.id);
    setForm(f => ({
      ...f,
      title: product.title,
      description: product.description || "",
      starting_price: product.price ? String(product.price) : "",
      product_image_url: product.cover_image_url || "",
    }));
    setProductSearch("");
    setSearchOpen(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!searchOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchOpen]);

  const filteredCatalog = useMemo(() => {
    if (!productSearch.trim()) return catalog;
    const q = productSearch.toLowerCase();
    return catalog.filter((p: any) => p.title.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
  }, [catalog, productSearch]);

   useEffect(() => {
     if (initialData && open) {
       setForm(f => ({
         ...f,
         title: initialData.title || "",
         description: initialData.description || "",
         starting_price: initialData.price ? String(initialData.price) : "",
       }));
     }
   }, [initialData, open]);

   const handleSubmit = async () => {
     if (!form.title.trim() || !form.starting_price) return;

     const imageUrl = form.product_image_url || null;

    onSubmit({
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      product_image_url: imageUrl,
      starting_bid: parseFloat(form.starting_price) || 0,
      minimum_increment: form.listing_type === "auction" ? (parseFloat(form.minimum_increment) || 1) : undefined,
      buy_now_price: form.buy_now_price ? parseFloat(form.buy_now_price) : undefined,
      duration_hours: parseInt(form.duration_hours) || 24,
      listing_type: form.listing_type,
      fulfillment_type: form.fulfillment,
      product_id: selectedProductId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto bg-[#252B33] border-[#323A45] text-[#FFFFFF]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl font-black uppercase tracking-tight">
            <div className="p-2 rounded-xl bg-[#FF6A00]/10">
              <Gavel className="h-6 w-6 text-[#FF6A00]" />
            </div>
            Novo Anúncio
          </DialogTitle>
          <DialogDescription className="text-[#8E98A3] font-bold">
            {initialData ? `Produto: ${initialData.title}` : "Preencha os dados do anúncio e defina as condições."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">


          {/* Seletor de Produto (Fluxo Completo) */}
          {!initialData && (
            <div className="space-y-4 p-4 rounded-2xl bg-[#1A1F24] border border-[#323A45] shadow-inner">
              <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1">Vincular Produto do Catálogo</Label>
              
              <div className="flex flex-col gap-3">
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setSearchOpen(!searchOpen)}
                    className="w-full flex items-center justify-between bg-[#252B33] border border-[#323A45] text-[#FFFFFF] hover:bg-[#1A1F24] h-14 rounded-2xl font-bold px-4 transition-all focus:border-[#FF6A00]/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Search className="h-4 w-4 text-[#FF6A00] shrink-0" />
                      <span className="truncate">
                        {selectedProductId
                          ? catalog.find((p) => p.id === selectedProductId)?.title
                          : "Buscar no seu catálogo..."}
                      </span>
                    </div>
                    <ChevronRight className={cn("ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform", searchOpen && "rotate-90")} />
                  </button>

                  {searchOpen && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#1A1F24] border border-[#323A45] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
                      <div className="flex items-center border-b border-[#323A45] px-3">
                        <Search className="mr-2 h-4 w-4 shrink-0 text-[#8E98A3]" />
                        <input
                          type="text"
                          placeholder="Digite o nome do produto..."
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          autoFocus
                          className="flex h-11 w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-[#8E98A3]/50"
                        />
                      </div>
                      <div className="flex flex-col items-center justify-center min-h-[150px] overflow-y-auto w-full">
                        {filteredCatalog.length > 0 && (<p className="px-3 py-1.5 text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.15em]">Seus Produtos</p>)}
                        {filteredCatalog.length === 0 ? (
                          <p className="py-6 text-center font-bold text-sm !text-[#FF6A00]" style={{ color: '#FF6A00' }}>Nenhum produto encontrado.</p>
                        ) : (
                          filteredCatalog.map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              onClick={() => handleProductSelect(product)}
                              className={cn(
                                "w-full flex items-center justify-between p-3 cursor-pointer transition-colors text-left",
                                selectedProductId === product.id
                                  ? "bg-[#FF6A00]/15 text-white"
                                  : "text-[#8E98A3] hover:bg-[#FF6A00]/10 hover:text-white"
                              )}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {product.cover_image_url && (
                                  <img src={product.cover_image_url} alt="" className="w-8 h-8 rounded-lg object-cover border border-[#323A45] shrink-0" />
                                )}
                                <div className="flex flex-col min-w-0">
                                  <span className="font-bold text-sm truncate">{product.title}</span>
                                  <span className="text-[10px] opacity-70">R$ {product.price?.toFixed(2)}</span>
                                </div>
                              </div>
                              <CheckCircle2
                                className={cn(
                                  "h-4 w-4 text-[#FF6A00] shrink-0 ml-2 transition-opacity",
                                  selectedProductId === product.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Preview do produto selecionado */}
                {selectedProductId && (() => {
                  const selectedProduct = catalog.find(p => p.id === selectedProductId);
                  if (!selectedProduct) return null;
                  return (
                    <div className="flex items-center gap-4 p-3 rounded-2xl bg-[#252B33] border border-[#FF6A00]/30 shadow-lg">
                      {selectedProduct.cover_image_url ? (
                        <img
                          src={selectedProduct.cover_image_url}
                          alt={selectedProduct.title}
                          className="w-16 h-16 rounded-xl object-cover border border-[#323A45] shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-[#1A1F24] border border-[#323A45] flex items-center justify-center shrink-0">
                          <Package className="h-6 w-6 text-[#8E98A3]/40" />
                        </div>
                      )}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-black text-sm text-[#FFFFFF] truncate">{selectedProduct.title}</span>
                        <span className="text-xs font-bold text-[#FF6A00]">R$ {selectedProduct.price?.toFixed(2)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProductId(null);
                          setForm(f => ({ ...f, title: "", description: "", starting_price: "", product_image_url: "" }));
                          setSearchOpen(true);
                        }}
                        className="text-[9px] font-black text-[#8E98A3] uppercase tracking-widest px-3 py-1.5 rounded-lg border border-[#323A45] hover:border-[#FF6A00]/40 hover:text-[#FF6A00] transition-all shrink-0"
                      >
                        Trocar
                      </button>
                    </div>
                  );
                })()}

                <div className="flex items-center gap-2">
                  <div className="h-px bg-[#323A45] flex-1" />
                  <span className="text-[9px] font-black text-[#8E98A3] uppercase tracking-[0.2em]">ou</span>
                  <div className="h-px bg-[#323A45] flex-1" />
                </div>

                <Button 
                  variant="outline" 
                  onClick={() => navigate('/anunciante/meus-anuncios')}
                  className="w-full h-12 rounded-xl border-dashed border-[#323A45] text-[9px] font-black uppercase tracking-widest gap-2 bg-[#FF6A00]/5 text-[#FF6A00] hover:bg-[#FF6A00]/10"
                >
                  <Plus className="w-4 h-4" /> Cadastrar Novo Produto (Fluxo Completo)
                </Button>
              </div>
            </div>
          )}

          {/* Título (Somente se não houver produto selecionado ou para ajuste fino) */}
          <div className="space-y-2">
            <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1 text-xs">Ajuste do título no Leilão</Label>
            <Input
              placeholder="Ex: iPhone 14 Pro 256GB"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="h-14 rounded-2xl border-[#323A45] bg-[#1A1F24] font-black text-[#FFFFFF] focus:border-[#FF6A00]/50 shadow-xl shadow-black/10"
            />
          </div>

          {/* Preço */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1 text-xs">
                {form.listing_type === "auction" ? "Lance Inicial (R$)" : "Preço (R$)"}
              </Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-[#FF6A00] text-sm">R$</span>
                <Input
                  type="number"
                  placeholder="0,00"
                  value={form.starting_price}
                  onChange={(e) => setForm((f) => ({ ...f, starting_price: e.target.value }))}
                  className="pl-12 h-14 rounded-2xl border-[#323A45] bg-[#1A1F24] font-black text-[#FFFFFF] text-lg focus:border-[#FF6A00]/50 shadow-xl shadow-black/10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1 text-xs">Duração (Horas)</Label>
              <div className="relative">
                <Clock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#8E98A3]" />
                <Input
                  type="number"
                  value={form.duration_hours}
                  onChange={(e) => setForm((f) => ({ ...f, duration_hours: e.target.value }))}
                  className="pl-12 h-14 rounded-2xl border-[#323A45] bg-[#1A1F24] font-black text-[#FFFFFF] focus:border-[#FF6A00]/50 shadow-xl shadow-black/10 text-center"
                />
              </div>
            </div>
          </div>

          {/* ═══ Configuração dos Lances — Incremento entre os lances ═══ */}
          {form.listing_type === "auction" && (() => {
            const incValue = parseFloat(form.minimum_increment) || 0;
            const baseValue = parseFloat(form.starting_price) || 0;
            const proximo = baseValue + (incValue || 1);
            return (
            <div className="space-y-3 rounded-2xl border border-blue-500/20 bg-blue-500/[0.04] p-4">
              <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] flex items-center gap-2">
                <ArrowUpDown className="h-3 w-3 text-blue-400" /> Incremento mínimo entre os lances
              </Label>
              <p className="text-[10px] text-[#8E98A3]/70 -mt-1">
                Você define de quanto em quanto os lances sobem — aplica-se a <span className="font-black text-blue-300">todos</span> os lances deste leilão. Escolha um valor rápido ou personalize.
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {INCREMENT_PRESETS.map((preset) => {
                  const selected = !incrementCustom && incValue === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => { setIncrementCustom(false); setForm(f => ({ ...f, minimum_increment: String(preset) })); }}
                      className={cn(
                        "h-11 rounded-xl border font-black text-sm transition-all active:scale-95",
                        selected
                          ? "bg-blue-500 border-blue-400 text-white shadow-lg shadow-blue-500/30"
                          : "bg-[#1A1F24] border-[#323A45] text-[#8E98A3] hover:border-blue-400/50 hover:text-[#FFFFFF]"
                      )}
                    >
                      R$ {preset},00
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => { setIncrementCustom(true); setForm(f => ({ ...f, minimum_increment: "" })); }}
                  className={cn(
                    "h-11 rounded-xl border font-black text-[11px] uppercase tracking-wider transition-all active:scale-95 col-span-3 sm:col-span-1",
                    incrementCustom
                      ? "bg-blue-500 border-blue-400 text-white shadow-lg shadow-blue-500/30"
                      : "bg-[#1A1F24] border-[#323A45] text-[#8E98A3] hover:border-blue-400/50 hover:text-[#FFFFFF]"
                  )}
                >
                  Personalizado
                </button>
              </div>
              {incrementCustom && (
                <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-blue-400 text-sm">R$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    autoFocus
                    placeholder="Digite o incremento personalizado"
                    value={form.minimum_increment}
                    onChange={(e) => setForm(f => ({ ...f, minimum_increment: e.target.value }))}
                    className="pl-12 h-14 rounded-2xl border-[#323A45] bg-[#1A1F24] font-black text-[#FFFFFF] text-lg focus:border-blue-400/50 shadow-xl shadow-black/10"
                  />
                </div>
              )}
              <p className="text-[11px] text-blue-200 font-bold">
                Cada lance subirá no mínimo <span className="font-black text-white">{formatBRL(incValue || 1)}</span>.
                {baseValue > 0 && <> Da base {formatBRL(baseValue)}, o próximo lance permitido é <span className="font-black text-white">{formatBRL(proximo)}</span>.</>}
              </p>
            </div>
            );
          })()}

          {/* ═══ Tipo de Entrega ═══ */}
          <div className="space-y-2">
            <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
              <Truck className="h-3 w-3" /> Tipo de Entrega
            </Label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: "pickup", label: "A Retirar", desc: "Loja física", emoji: "🏪" },
                { value: "delivery", label: "Entrega Grátis", desc: "Envio ao cliente", emoji: "🚚" },
                { value: "both", label: "Ambos", desc: "Cliente escolhe", emoji: "🔄" },
              ].map(({ value, label, desc, emoji }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, fulfillment: value }))}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all text-center",
                    form.fulfillment === value
                      ? "border-[#FF6A00] bg-[#FF6A00]/10 text-white"
                      : "border-[#323A45] bg-[#1A1F24] text-[#8E98A3] hover:border-[#FF6A00]/30"
                  )}
                >
                  <span className="text-xl">{emoji}</span>
                  <span className="font-black text-[10px] uppercase tracking-wider">{label}</span>
                  <span className="text-[8px] opacity-50">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          <Button
            className="w-full h-16 text-base font-black bg-gradient-to-r from-[#FF6A01] to-[#FF8C33] hover:from-[#FF7A1A] hover:to-[#FFA357] text-white rounded-2xl shadow-2xl shadow-[#FF6A00]/30 active:scale-[0.98] transition-all uppercase tracking-[0.2em] mt-4"
            onClick={handleSubmit}
            disabled={isSubmitting || !form.title.trim() || !form.starting_price}
          >
            {isSubmitting ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <><Zap className="h-6 w-6 mr-3 stroke-[3px]" /> PUBLICAR ANÚNCIO AGORA</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── EditListingModal (Mega Config) ─────────────────────

function EditListingModal({
  listing,
  onClose,
  onSave,
  isSaving,
}: {
  listing: AuctionListing | null;
  onClose: () => void;
  onSave: (updates: { id: string; [key: string]: any }) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    listing_type: "auction" as "auction" | "arremate",
    starting_bid: "",
    current_bid: "",
    buy_now_price: "",
    reserve_price: "",
    minimum_increment: "",
    product_image_url: "",
    starts_at: "",
    ends_at: "",
    status: "active" as string,
    fulfillment_type: "pickup",
    city: "",
    neighborhood: "",
  });

  const [activeSection, setActiveSection] = useState<string>("basic");

  // Modo do seletor de incremento: false = preset (botões), true = personalizado (input).
  // Ao editar, se o valor salvo não bater com nenhum preset, entra em personalizado.
  const [incrementCustom, setIncrementCustom] = useState(false);

  // ── ORION Leilões AI: sugestões de setup ──
  const [aiSug, setAiSug] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const runAi = async () => {
    if (!listing) return;
    setAiLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)("orion_auction_suggest", {
        p_owner_user_id: (listing as any).owner_user_id ?? null,
        p_starting_bid: parseFloat(form.starting_bid) || null,
        p_category: null,
        p_listing_id: listing.id,
      });
      if (error) throw error;
      setAiSug(data);
    } catch (e: any) {
      toast.error("Não foi possível gerar sugestões: " + (e?.message || ""));
    } finally {
      setAiLoading(false);
    }
  };
  const applyAi = () => {
    if (!aiSug) return;
    setForm((f) => ({
      ...f,
      starting_bid: aiSug.preco_inicial_ideal != null ? String(aiSug.preco_inicial_ideal) : f.starting_bid,
      minimum_increment: aiSug.incremento_recomendado != null ? String(aiSug.incremento_recomendado) : f.minimum_increment,
      ends_at: aiSug.duracao_horas
        ? new Date(Date.now() + aiSug.duracao_horas * 3600000).toISOString().slice(0, 16)
        : f.ends_at,
    }));
    toast.success("Sugestões da IA aplicadas ao formulário");
  };

  useEffect(() => {
    if (listing) {
      setForm({
        title: listing.title || "",
        description: listing.description || "",
        listing_type: listing.listing_type || "auction",
        starting_bid: listing.starting_bid ? String(listing.starting_bid) : "",
        current_bid: listing.current_bid ? String(listing.current_bid) : "",
        buy_now_price: listing.buy_now_price ? String(listing.buy_now_price) : "",
        reserve_price: listing.reserve_price ? String(listing.reserve_price) : "",
        minimum_increment: listing.minimum_increment ? String(listing.minimum_increment) : "1",
        product_image_url: listing.product_image_url || "",
        starts_at: listing.starts_at ? listing.starts_at.slice(0, 16) : "",
        ends_at: listing.ends_at ? listing.ends_at.slice(0, 16) : "",
        status: listing.status || "active",
        fulfillment_type: (listing as any).fulfillment_type || "pickup",
        city: listing.city || "",
        neighborhood: listing.neighborhood || "",
      });
      // Se o incremento salvo não é um dos presets, o seletor abre em "Personalizado".
      const inc = Number(listing.minimum_increment) || 1;
      setIncrementCustom(!INCREMENT_PRESETS.includes(inc));
    }
  }, [listing]);

  const handleSave = () => {
    if (!listing) return;
    const updates: any = {
      id: listing.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      listing_type: form.listing_type,
      starting_bid: parseFloat(form.starting_bid) || 0,
      buy_now_price: form.buy_now_price ? parseFloat(form.buy_now_price) : null,
      reserve_price: form.reserve_price ? parseFloat(form.reserve_price) : null,
      minimum_increment: parseFloat(form.minimum_increment) || 1,
      product_image_url: form.product_image_url || null,
      status: form.status,
      fulfillment_type: form.fulfillment_type || "pickup",
      city: form.city || null,
      neighborhood: form.neighborhood || null,
    };
    if (form.starts_at) updates.starts_at = new Date(form.starts_at).toISOString();
    if (form.ends_at) updates.ends_at = new Date(form.ends_at).toISOString();
    onSave(updates);
  };

  const sections = [
    { id: "basic", label: "Básico", icon: Edit },
    { id: "pricing", label: "Preços", icon: DollarSign },
    { id: "timing", label: "Temporização", icon: Calendar },
    { id: "rules", label: "Regras", icon: Shield },
    { id: "location", label: "Localização", icon: MapPin },
    { id: "advanced", label: "Avançado", icon: Settings },
  ];

  if (!listing) return null;

  return (
    <Dialog open={!!listing} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-[#252B33] border-[#323A45] text-[#FFFFFF] p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#252B33] border-b border-[#323A45] px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl font-black uppercase tracking-tight">
              <div className="p-2 rounded-xl bg-[#FF6A00]/10">
                <Settings className="h-6 w-6 text-[#FF6A00]" />
              </div>
              Configurações do Leilão
            </DialogTitle>
            <DialogDescription className="text-[#8E98A3] font-bold">
              {listing.title} • {statusBadge(listing.status)}
            </DialogDescription>
          </DialogHeader>

          {/* Section Navigation */}
          <div className="flex gap-1.5 mt-4 overflow-x-auto scrollbar-hide pb-1">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap border",
                  activeSection === id
                    ? "bg-[#FF6A00] border-[#FF6A00] text-white shadow-lg shadow-[#FF6A00]/20"
                    : "bg-[#1A1F24] border-[#323A45] text-[#8E98A3] hover:border-[#FF6A00]/30 hover:text-white"
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 pb-6 space-y-6">

          {/* ═══ ORION LEILÕES AI ═══ */}
          <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-r from-violet-950/40 to-[#1A1F24] p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg">🤖</span>
                <div className="min-w-0">
                  <p className="text-[12px] font-black text-violet-200 uppercase tracking-wide">Viagg-TX8 Leilões AI</p>
                  <p className="text-[10px] text-violet-300/70">Sugestões de preço, incremento, duração e sucesso — você aceita ou ajusta.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={runAi}
                disabled={aiLoading}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider bg-violet-600 hover:bg-violet-500 text-white transition-all disabled:opacity-50"
              >
                {aiLoading ? "Analisando..." : "✨ Sugerir com IA"}
              </button>
            </div>

            {aiSug && (
              <div className="mt-3 space-y-3 animate-in fade-in duration-200">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    ["Melhor horário", String(aiSug.melhor_horario ?? "—")],
                    ["Duração", (aiSug.duracao_horas ?? 0) + "h"],
                    ["Preço inicial", "R$ " + (aiSug.preco_inicial_ideal ?? 0)],
                    ["Incremento", "R$ " + (aiSug.incremento_recomendado ?? 0)],
                    ["Participantes", "~" + (aiSug.estimativa_participantes ?? 0)],
                    ["Valor final", "R$ " + (aiSug.estimativa_valor_final ?? 0)],
                    ["Sucesso", (aiSug.expectativa_sucesso ?? 0) + "%"],
                    ["Confiança", (aiSug.confianca ?? 0) + "%"],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded-xl bg-[#1A1F24] border border-[#323A45] p-2 text-center">
                      <p className="text-[8px] font-black text-[#8E98A3] uppercase tracking-wider">{l}</p>
                      <p className="text-[12px] font-black text-white truncate">{v}</p>
                    </div>
                  ))}
                </div>
                {aiSug.evidencia?.nota && (
                  <p className="text-[9px] text-violet-300/60 leading-snug">{aiSug.evidencia.nota}</p>
                )}
                <button
                  type="button"
                  onClick={applyAi}
                  className="w-full py-2 rounded-xl text-[11px] font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white transition-all"
                >
                  Aplicar sugestões ao formulário
                </button>
              </div>
            )}
          </div>

          {/* ═══ SEÇÃO: BÁSICO ═══ */}
          {activeSection === "basic" && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 mb-2">
                <Edit className="h-5 w-5 text-[#FF6A00]" />
                <h3 className="text-sm font-black text-[#FFFFFF] uppercase tracking-widest">Informações Básicas</h3>
              </div>

              {/* Tipo de Listagem */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1">Modalidade</Label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "auction", label: "Leilão", desc: "Lances competitivos", icon: Gavel, color: "from-[#FF6A00] to-[#FF8C33]" },
                    { value: "arremate", label: "Arremate", desc: "Oferta direta", icon: Tag, color: "from-blue-500 to-blue-600" },
                  ].map(({ value, label, desc, icon: Icon, color }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, listing_type: value as any }))}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                        form.listing_type === value
                          ? `border-[#FF6A00] bg-gradient-to-br ${color} text-white shadow-xl`
                          : "border-[#323A45] bg-[#1A1F24] text-[#8E98A3] hover:border-[#FF6A00]/30"
                      )}
                    >
                      <Icon className="h-6 w-6" />
                      <span className="font-black text-xs uppercase tracking-widest">{label}</span>
                      <span className={cn("text-[9px] font-medium", form.listing_type === value ? "text-white/70" : "text-[#8E98A3]/50")}>{desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1">Status</Label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: "active", label: "Ativo", color: "emerald" },
                    { value: "ended", label: "Encerrado", color: "gray" },
                    { value: "sold", label: "Vendido", color: "blue" },
                    { value: "cancelled", label: "Cancelado", color: "red" },
                  ].map(({ value, label, color }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, status: value }))}
                      className={cn(
                        "px-3 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all text-center",
                        form.status === value
                          ? `bg-${color}-500/20 text-${color}-400 border-${color}-500/40 shadow-lg`
                          : "bg-[#1A1F24] border-[#323A45] text-[#8E98A3] hover:border-[#FF6A00]/20"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Título */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1">Título do Anúncio</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                  className="h-14 rounded-2xl border-[#323A45] bg-[#1A1F24] font-black text-[#FFFFFF] focus:border-[#FF6A00]/50 shadow-xl shadow-black/10"
                />
              </div>

              {/* Descrição */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1">Descrição</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={4}
                  className="rounded-2xl border-[#323A45] bg-[#1A1F24] font-medium text-[#FFFFFF] focus:border-[#FF6A00]/50 shadow-xl shadow-black/10 resize-none"
                  placeholder="Descreva os detalhes do produto, condições, etc."
                />
              </div>

              {/* URL da Imagem */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1">URL da Imagem</Label>
                <div className="flex gap-3">
                  <Input
                    value={form.product_image_url}
                    onChange={(e) => setForm(f => ({ ...f, product_image_url: e.target.value }))}
                    className="h-12 rounded-2xl border-[#323A45] bg-[#1A1F24] font-medium text-[#FFFFFF] focus:border-[#FF6A00]/50 flex-1"
                    placeholder="https://..."
                  />
                  {form.product_image_url && (
                    <img src={form.product_image_url} alt="" className="w-12 h-12 rounded-xl object-cover border border-[#323A45] shrink-0" />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══ SEÇÃO: PREÇOS ═══ */}
          {activeSection === "pricing" && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-5 w-5 text-[#FF6A00]" />
                <h3 className="text-sm font-black text-[#FFFFFF] uppercase tracking-widest">Configuração de Preços</h3>
              </div>

              {/* Lance Inicial / Preço Base */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1">
                  {form.listing_type === "auction" ? "Lance Inicial (R$)" : "Preço Base (R$)"}
                </Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-[#FF6A00] text-sm">R$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.starting_bid}
                    onChange={(e) => setForm(f => ({ ...f, starting_bid: e.target.value }))}
                    className="pl-12 h-14 rounded-2xl border-[#323A45] bg-[#1A1F24] font-black text-[#FFFFFF] text-xl focus:border-[#FF6A00]/50 shadow-xl shadow-black/10"
                  />
                </div>
                <p className="text-[10px] text-[#8E98A3]/60 ml-1">Valor mínimo para o primeiro lance ou oferta</p>
              </div>

              {/* Lance Atual (readonly info) */}
              {form.listing_type === "auction" && (
                <div className="bg-[#1A1F24] border border-[#323A45] rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-[#8E98A3] uppercase tracking-wider">Lance Atual</span>
                    <span className="text-2xl font-black text-emerald-400">{formatBRL(parseFloat(form.current_bid) || 0)}</span>
                  </div>
                  <p className="text-[9px] text-[#8E98A3]/50 mt-1">Atualizado automaticamente com cada lance recebido</p>
                </div>
              )}

              {/* Compre Agora */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                  <Zap className="h-3 w-3 text-amber-400" /> Compre Agora (R$)
                </Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-amber-400 text-sm">R$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.buy_now_price}
                    onChange={(e) => setForm(f => ({ ...f, buy_now_price: e.target.value }))}
                    className="pl-12 h-14 rounded-2xl border-[#323A45] bg-[#1A1F24] font-black text-[#FFFFFF] text-lg focus:border-amber-400/50 shadow-xl shadow-black/10"
                    placeholder="Opcional"
                  />
                </div>
                <p className="text-[10px] text-[#8E98A3]/60 ml-1">Se preenchido, permite compra instantânea neste valor (encerra o leilão)</p>
              </div>

              {/* Preço de Reserva */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                  <Shield className="h-3 w-3 text-emerald-400" /> Preço de Reserva (R$)
                </Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-emerald-400 text-sm">R$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.reserve_price}
                    onChange={(e) => setForm(f => ({ ...f, reserve_price: e.target.value }))}
                    className="pl-12 h-14 rounded-2xl border-[#323A45] bg-[#1A1F24] font-black text-[#FFFFFF] text-lg focus:border-emerald-400/50 shadow-xl shadow-black/10"
                    placeholder="Opcional"
                  />
                </div>
                <p className="text-[10px] text-[#8E98A3]/60 ml-1">Valor mínimo secreto — abaixo deste, o leilão não é arrematado automaticamente</p>
              </div>

              {/* Incremento Mínimo do Lance — presets + personalizado */}
              {form.listing_type === "auction" && (() => {
                const incValue = parseFloat(form.minimum_increment) || 0;
                const baseValue = parseFloat(form.starting_bid) || 0;
                const proximoEsperado = baseValue + (incValue || 1);
                return (
                <div className="space-y-3">
                  <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                    <ArrowUpDown className="h-3 w-3 text-blue-400" /> Incremento Mínimo do Lance
                  </Label>
                  <p className="text-[11px] text-[#FFFFFF] font-bold ml-1 -mt-1">
                    Você determina de quanto em quanto os lances vão subir.
                  </p>
                  <p className="text-[10px] text-[#8E98A3]/70 ml-1 -mt-1">
                    O valor que você escolher aqui será aplicado a <span className="font-black text-blue-300">todos</span> os lances deste leilão. Escolha um valor rápido ou personalize.
                  </p>

                  {/* Grade de presets + Personalizado */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {INCREMENT_PRESETS.map((preset) => {
                      const selected = !incrementCustom && incValue === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => { setIncrementCustom(false); setForm(f => ({ ...f, minimum_increment: String(preset) })); }}
                          className={cn(
                            "h-12 rounded-xl border font-black text-sm transition-all active:scale-95",
                            selected
                              ? "bg-blue-500 border-blue-400 text-white shadow-lg shadow-blue-500/30"
                              : "bg-[#1A1F24] border-[#323A45] text-[#8E98A3] hover:border-blue-400/50 hover:text-[#FFFFFF]"
                          )}
                        >
                          R$ {preset},00
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => { setIncrementCustom(true); setForm(f => ({ ...f, minimum_increment: "" })); }}
                      className={cn(
                        "h-12 rounded-xl border font-black text-[11px] uppercase tracking-wider transition-all active:scale-95 col-span-3 sm:col-span-1",
                        incrementCustom
                          ? "bg-blue-500 border-blue-400 text-white shadow-lg shadow-blue-500/30"
                          : "bg-[#1A1F24] border-[#323A45] text-[#8E98A3] hover:border-blue-400/50 hover:text-[#FFFFFF]"
                      )}
                    >
                      Personalizado
                    </button>
                  </div>

                  {/* Campo numérico do modo Personalizado */}
                  {incrementCustom && (
                    <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-blue-400 text-sm">R$</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        autoFocus
                        placeholder="Digite o incremento personalizado"
                        value={form.minimum_increment}
                        onChange={(e) => setForm(f => ({ ...f, minimum_increment: e.target.value }))}
                        className="pl-12 h-14 rounded-2xl border-[#323A45] bg-[#1A1F24] font-black text-[#FFFFFF] text-lg focus:border-blue-400/50 shadow-xl shadow-black/10"
                      />
                    </div>
                  )}

                  {/* Feedback: regra definida pelo lojista + próximo lance esperado */}
                  <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 px-3 py-2 space-y-0.5">
                    <p className="text-[11px] text-blue-200 font-bold">
                      Você definiu que cada lance subirá no mínimo <span className="font-black text-white">{formatBRL(incValue || 1)}</span> em relação ao anterior.
                    </p>
                    {baseValue > 0 && (
                      <p className="text-[10px] text-blue-200/70">
                        Ex.: da base de {formatBRL(baseValue)}, o próximo lance permitido será <span className="font-black text-white">{formatBRL(proximoEsperado)}</span>.
                      </p>
                    )}
                  </div>
                </div>
                );
              })()}

              {/* Resumo visual */}
              <div className="bg-gradient-to-br from-[#FF6A00]/5 to-transparent border border-[#FF6A00]/20 rounded-2xl p-4 space-y-2">
                <span className="text-[9px] font-black text-[#FF6A00] uppercase tracking-widest">Resumo de Preços</span>
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-[9px] text-[#8E98A3] block">Base</span><span className="font-black text-[#FFFFFF]">{formatBRL(parseFloat(form.starting_bid) || 0)}</span></div>
                  <div><span className="text-[9px] text-[#8E98A3] block">Compre Agora</span><span className="font-black text-amber-400">{form.buy_now_price ? formatBRL(parseFloat(form.buy_now_price)) : "—"}</span></div>
                  <div><span className="text-[9px] text-[#8E98A3] block">Reserva</span><span className="font-black text-emerald-400">{form.reserve_price ? formatBRL(parseFloat(form.reserve_price)) : "—"}</span></div>
                  <div><span className="text-[9px] text-[#8E98A3] block">Incremento</span><span className="font-black text-[#00C58E] animate-blink-3hz inline-block">{formatBRL(parseFloat(form.minimum_increment) || 1)}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ SEÇÃO: TEMPORIZAÇÃO ═══ */}
          {activeSection === "timing" && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-5 w-5 text-[#FF6A00]" />
                <h3 className="text-sm font-black text-[#FFFFFF] uppercase tracking-widest">Temporização</h3>
              </div>

              {/* Início */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                  <Clock className="h-3 w-3 text-emerald-400" /> Início do Leilão
                </Label>
                <Input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm(f => ({ ...f, starts_at: e.target.value }))}
                  className="h-14 rounded-2xl border-[#323A45] bg-[#1A1F24] font-bold text-[#FFFFFF] focus:border-[#FF6A00]/50 shadow-xl shadow-black/10"
                />
                <p className="text-[10px] text-[#8E98A3]/60 ml-1">Quando o leilão começa a aceitar lances</p>
              </div>

              {/* Fim */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                  <Timer className="h-3 w-3 text-red-400" /> Fim do Leilão
                </Label>
                <Input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setForm(f => ({ ...f, ends_at: e.target.value }))}
                  className="h-14 rounded-2xl border-[#323A45] bg-[#1A1F24] font-bold text-[#FFFFFF] focus:border-red-400/50 shadow-xl shadow-black/10"
                />
                <p className="text-[10px] text-[#8E98A3]/60 ml-1">Quando o leilão encerra automaticamente</p>
              </div>

              {/* Contagem regressiva visual */}
              {listing.status === "active" && (
                <div className="bg-[#1A1F24] border border-[#323A45] rounded-2xl p-5 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-black text-[#8E98A3] uppercase tracking-widest block mb-1">Tempo Restante</span>
                    <div className="text-3xl">
                      <CountdownTimer endsAt={listing.ends_at} />
                    </div>
                  </div>
                  <div className="w-16 h-16 rounded-full bg-[#FF6A00]/10 flex items-center justify-center">
                    <Timer className="h-8 w-8 text-[#FF6A00] animate-pulse" />
                  </div>
                </div>
              )}

              {/* Atalhos de duração */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1">Atalhos de Duração (a partir de agora)</Label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "1h", hours: 1 },
                    { label: "6h", hours: 6 },
                    { label: "12h", hours: 12 },
                    { label: "24h", hours: 24 },
                    { label: "48h", hours: 48 },
                    { label: "3 dias", hours: 72 },
                    { label: "7 dias", hours: 168 },
                    { label: "30 dias", hours: 720 },
                  ].map(({ label, hours }) => (
                    <button
                      key={hours}
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const end = new Date(now.getTime() + hours * 60 * 60 * 1000);
                        setForm(f => ({
                          ...f,
                          starts_at: now.toISOString().slice(0, 16),
                          ends_at: end.toISOString().slice(0, 16),
                        }));
                      }}
                      className="px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider border border-[#323A45] bg-[#1A1F24] text-[#8E98A3] hover:border-[#FF6A00]/40 hover:text-[#FF6A00] transition-all"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══ SEÇÃO: REGRAS ═══ */}
          {activeSection === "rules" && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-5 w-5 text-[#FF6A00]" />
                <h3 className="text-sm font-black text-[#FFFFFF] uppercase tracking-widest">Regras do Leilão</h3>
              </div>

              {/* Tipo de Entrega */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                  <Truck className="h-3 w-3" /> Tipo de Entrega
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: "pickup", label: "Retirada", desc: "Loja física", emoji: "🏪" },
                    { value: "delivery", label: "Entrega", desc: "Envio ao cliente", emoji: "🚚" },
                    { value: "both", label: "Ambos", desc: "Cliente escolhe", emoji: "🔄" },
                  ].map(({ value, label, desc, emoji }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, fulfillment_type: value }))}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all text-center",
                        form.fulfillment_type === value
                          ? "border-[#FF6A00] bg-[#FF6A00]/10 text-white"
                          : "border-[#323A45] bg-[#1A1F24] text-[#8E98A3] hover:border-[#FF6A00]/30"
                      )}
                    >
                      <span className="text-xl">{emoji}</span>
                      <span className="font-black text-[10px] uppercase tracking-wider">{label}</span>
                      <span className="text-[8px] opacity-50">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Info cards */}
              <div className="space-y-3">
                <div className="bg-[#1A1F24] border border-[#323A45] rounded-2xl p-4 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Hash className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-[#FFFFFF] uppercase">Total de Lances</p>
                    <p className="text-2xl font-black text-amber-400 mt-1">{listing.total_bids}</p>
                    <p className="text-[9px] text-[#8E98A3] mt-1">Lances registrados neste leilão</p>
                  </div>
                </div>

                <div className="bg-[#1A1F24] border border-[#323A45] rounded-2xl p-4 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Eye className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-[#FFFFFF] uppercase">Observadores</p>
                    <p className="text-2xl font-black text-blue-400 mt-1">{listing.watchers_count}</p>
                    <p className="text-[9px] text-[#8E98A3] mt-1">Pessoas acompanhando este leilão</p>
                  </div>
                </div>

                {listing.winner_user_id && (
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <Crown className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-emerald-400 uppercase">Vencedor</p>
                      <p className="text-xs font-mono text-[#8E98A3] mt-1 break-all">{listing.winner_user_id}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ SEÇÃO: LOCALIZAÇÃO ═══ */}
          {activeSection === "location" && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-5 w-5 text-[#FF6A00]" />
                <h3 className="text-sm font-black text-[#FFFFFF] uppercase tracking-widest">Localização</h3>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1">Cidade</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))}
                  className="h-14 rounded-2xl border-[#323A45] bg-[#1A1F24] font-bold text-[#FFFFFF] focus:border-[#FF6A00]/50 shadow-xl shadow-black/10"
                  placeholder="Ex: São Paulo"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1">Bairro</Label>
                <Input
                  value={form.neighborhood}
                  onChange={(e) => setForm(f => ({ ...f, neighborhood: e.target.value }))}
                  className="h-14 rounded-2xl border-[#323A45] bg-[#1A1F24] font-bold text-[#FFFFFF] focus:border-[#FF6A00]/50 shadow-xl shadow-black/10"
                  placeholder="Ex: Jardins"
                />
              </div>
            </div>
          )}

          {/* ═══ SEÇÃO: AVANÇADO ═══ */}
          {activeSection === "advanced" && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="h-5 w-5 text-[#FF6A00]" />
                <h3 className="text-sm font-black text-[#FFFFFF] uppercase tracking-widest">Configurações Avançadas</h3>
              </div>

              {/* ID e Metadados */}
              <div className="bg-[#1A1F24] border border-[#323A45] rounded-2xl p-4 space-y-3">
                <p className="text-[9px] font-black text-[#8E98A3] uppercase tracking-widest">Metadados do Leilão</p>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-[#8E98A3]">ID</span>
                    <span className="text-[10px] font-mono text-[#FFFFFF] bg-[#252B33] px-2 py-1 rounded-lg">{listing.id}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-[#8E98A3]">Criado em</span>
                    <span className="text-[10px] font-bold text-[#FFFFFF]">{new Date(listing.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-[#8E98A3]">Atualizado em</span>
                    <span className="text-[10px] font-bold text-[#FFFFFF]">{new Date(listing.updated_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-[#8E98A3]">Product ID</span>
                    <span className="text-[10px] font-mono text-[#FFFFFF] bg-[#252B33] px-2 py-1 rounded-lg">{listing.product_id || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-[#8E98A3]">Store ID</span>
                    <span className="text-[10px] font-mono text-[#FFFFFF] bg-[#252B33] px-2 py-1 rounded-lg">{listing.store_id || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Imagem Storage */}
              {(listing.image_storage_path || listing.image_original_name) && (
                <div className="bg-[#1A1F24] border border-[#323A45] rounded-2xl p-4 space-y-2">
                  <p className="text-[9px] font-black text-[#8E98A3] uppercase tracking-widest">Imagem (Storage)</p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {listing.image_storage_path && (
                      <div className="flex justify-between text-[10px]"><span className="text-[#8E98A3]">Path</span><span className="font-mono text-[#FFFFFF] truncate max-w-[200px]">{listing.image_storage_path}</span></div>
                    )}
                    {listing.image_original_name && (
                      <div className="flex justify-between text-[10px]"><span className="text-[#8E98A3]">Nome</span><span className="text-[#FFFFFF]">{listing.image_original_name}</span></div>
                    )}
                    {listing.image_mime_type && (
                      <div className="flex justify-between text-[10px]"><span className="text-[#8E98A3]">MIME</span><span className="text-[#FFFFFF]">{listing.image_mime_type}</span></div>
                    )}
                    {listing.image_size_bytes && (
                      <div className="flex justify-between text-[10px]"><span className="text-[#8E98A3]">Tamanho</span><span className="text-[#FFFFFF]">{(listing.image_size_bytes / 1024).toFixed(1)} KB</span></div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ BOTÃO SALVAR (sempre visível) ═══ */}
          <div className="sticky bottom-0 bg-[#252B33] pt-4 border-t border-[#323A45]">
            <Button
              className="w-full h-16 text-base font-black bg-gradient-to-r from-[#FF6A01] to-[#FF8C33] hover:from-[#FF7A1A] hover:to-[#FFA357] text-white rounded-2xl shadow-2xl shadow-[#FF6A00]/30 active:scale-[0.98] transition-all uppercase tracking-[0.2em]"
              onClick={handleSave}
              disabled={isSaving || !form.title.trim()}
            >
              {isSaving ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <><Save className="h-6 w-6 mr-3 stroke-[2.5px]" /> SALVAR CONFIGURAÇÕES</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ─────────────────────

export default function MerchantAuctions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { myListings, loadingMyListings, createListing, refetchMyListings, endListing: endAuction, pauseListing, republishListing, updateListing, deleteListing } = useAdvertiserAuctions();
  const { receivedOffers, refetchOffers, loadingOffers } = useArremate();
  const { usageRules, balance, debitCredits, refetch: refetchCredits } = useMerchantCredits();
   const [showCreateModal, setShowCreateModal] = useState(false);
   const [editingListing, setEditingListing] = useState<AuctionListing | null>(null);
   const [refreshing, setRefreshing] = useState(false);
   const [searchQuery, setSearchQuery] = useState("");
   const [statusFilter, setStatusFilter] = useState<"all" | "active" | "ended">("all");

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchMyListings(), refetchOffers()]);
    setRefreshing(false);
  };

  // ── Auto-refresh: Realtime + polling a cada 30s ──
  useEffect(() => {
    if (!user?.id) return;

    // Polling a cada 30 segundos como garantia
    const pollInterval = setInterval(() => {
      refetchMyListings();
      refetchOffers();
    }, 30_000);

    // Realtime: auction_listings
    const listingsChannel = supabase
      .channel("merchant-auctions-listings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "auction_listings", filter: `owner_user_id=eq.${user.id}` },
        () => { refetchMyListings(); }
      )
      .subscribe();

    // Realtime: arremate_offers (novas ofertas recebidas)
    const offersChannel = supabase
      .channel("merchant-auctions-offers")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "arremate_offers" },
        () => { refetchOffers(); }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(listingsChannel);
      supabase.removeChannel(offersChannel);
    };
  }, [user?.id, refetchMyListings, refetchOffers]);




  const filteredListings = useMemo(() => {
    let result = myListings;
    if (statusFilter !== "all") {
      result = result.filter(l => l.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l => l.title?.toLowerCase().includes(q));
    }
    return result;
  }, [myListings, statusFilter, searchQuery]);

  const kpis = useMemo(() => ({
    total: myListings.length,
    active: myListings.filter(l => l.status === "active").length,
    ended: myListings.filter(l => l.status === "ended" || l.status === "sold").length,
    offers: receivedOffers.length,
  }), [myListings, receivedOffers]);

  const isLoading = loadingMyListings || loadingOffers;
  const [showPlans, setShowPlans] = useState(false);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  // Loja do usuário — exigida pela porta única merchant_dispatch_divulgacao
  const { data: merchantStore } = useQuery({
    queryKey: ["merchant-store-auctions", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: profile } = await (supabase.from("profiles") as any)
        .select("full_name, nome_loja, avatar_url, logo_url")
        .eq("id", user!.id)
        .maybeSingle();

      const { data } = await (supabase.from("merchant_stores") as any)
        .select("id, city, region, logo_url, nome_loja")
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();

      if (data) {
        return {
          ...data,
          logo_url: data.logo_url || profile?.logo_url || profile?.avatar_url || null,
          nome_loja: data.nome_loja || profile?.nome_loja || profile?.full_name || "Minha Loja",
        };
      }

      const { data: newStore } = await (supabase.from("merchant_stores") as any)
        .insert({
          user_id: user!.id,
          nome_loja: profile?.nome_loja || profile?.full_name || "Minha Loja",
          logo_url: profile?.logo_url || profile?.avatar_url || null,
        })
        .select("id, city, region, logo_url, nome_loja")
        .single();

      return {
        ...newStore,
        logo_url: newStore?.logo_url || profile?.logo_url || profile?.avatar_url || null,
        nome_loja: newStore?.nome_loja || profile?.nome_loja || profile?.full_name || "Minha Loja",
      };
    },
  });

  // Divulgação do leilão pela porta única: 1 gratuita/dia → crédito de pacote → SEM_SALDO
  const handleDivulgar = async (listing: AuctionListing) => {
    if (dispatchingId) return;
    if (!merchantStore?.id) {
      toast.error("Loja não encontrada — recarregue a página e tente novamente.");
      return;
    }
    setDispatchingId(listing.id);
    try {
      const publicPath = (listing as any).listing_type === "arremate"
        ? `/arremate/${listing.id}`
        : `/leilao/${listing.id}`;
      const { data, error } = await (supabase.rpc as any)("merchant_dispatch_divulgacao", {
        p_merchant_store_id: merchantStore.id,
        p_product_id: null,
        p_campaign_type: "store_product",
        p_title: listing.title,
        p_message_text: [listing.description, `Participe: ${window.location.origin}${publicPath}`]
          .filter(Boolean)
          .join("\n\n"),
        p_media_url: listing.product_image_url || null,
        p_target_city: listing.city || merchantStore.city || null,
        p_target_region: merchantStore.region || null,
        p_source_type: "auction_listing",
        p_source_id: listing.id,
      });
      if (error) {
        if (String(error.message || "").includes("SEM_SALDO")) {
          toast.error("Sua divulgação gratuita de hoje já foi utilizada e você não tem créditos de pacote.", {
            description: "Adquira um pacote para continuar divulgando.",
          });
          setShowPlans(true);
          return;
        }
        throw error;
      }
      if (data?.success === false) throw new Error(data.error || "Erro ao divulgar");
      if (data?.origem === "gratuita_diaria") {
        toast.success("🎁 Divulgação GRATUITA de hoje enviada à fila inteligente!");
      } else {
        toast.success(`📦 Divulgação enviada à fila! Saldo restante: ${data?.saldo_restante ?? "—"} divulgação(ões).`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao divulgar leilão");
    } finally {
      setDispatchingId(null);
    }
  };

  return (
    <div className="px-4 pt-4 pb-28 lg:px-10 xl:px-16 max-w-5xl w-full mx-auto space-y-6">
      <PromotionPlansModal
        open={showPlans}
        onClose={() => setShowPlans(false)}
        profileType={"leiloes" as any}
        listingModule="auction"
      />
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between bg-[#1A1F24] border border-[#323A45] p-6 rounded-3xl shadow-2xl shadow-black/40">
        <div className="flex items-center gap-4">
          {(() => {
            const storeImage = normalizeImageUrl(merchantStore?.logo_url);
            return storeImage ? (
              <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-[#FF6A00]/40 bg-[#121418] shadow-lg shadow-[#FF6A00]/20 flex items-center justify-center shrink-0">
                <img src={storeImage} alt={merchantStore?.nome_loja || "Loja"} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6A00] to-[#FF8C33] flex items-center justify-center shadow-lg shadow-[#FF6A00]/20 shrink-0">
                <Gavel className="h-8 w-8 text-white stroke-[2.5px]" />
              </div>
            );
          })()}
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-black text-[#FFFFFF] uppercase tracking-tight">Meus Leilões</h1>
              {merchantStore?.nome_loja && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FF6A00]/10 border border-[#FF6A00]/30 text-[#FF6A00] text-xs font-bold uppercase tracking-wider">
                  {merchantStore.nome_loja}
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-[#8E98A3]">Gerencie seus leilões e arremates</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-3 rounded-2xl bg-[#1A1F24] border border-[#323A45] hover:border-[#FF6A00]/40 transition-all"
          >
            <RefreshCw className={`h-5 w-5 text-[#8E98A3] ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setShowPlans(true)}
            className="hidden sm:flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#1A1F24] border border-violet-500/40 text-violet-200 font-black text-sm uppercase tracking-wider hover:border-violet-400 hover:text-white active:scale-95 transition-all"
          >
            <Megaphone className="h-5 w-5" />
            Pacotes de Divulgação
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C33] text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-[#FF6A00]/30 hover:shadow-[#FF6A00]/50 active:scale-95 transition-all"
          >
            <Plus className="h-5 w-5" />
            Novo Leilão
          </button>
        </div>
      </div>

      {/* ═══ KPIs ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Gavel, label: "Total", value: kpis.total, color: "text-[#FF6A00]", accent: "bg-[#FF6A00]/10" },
          { icon: PlayCircle, label: "Ativos", value: kpis.active, color: "text-emerald-400", accent: "bg-emerald-500/10" },
          { icon: PauseCircle, label: "Encerrados", value: kpis.ended, color: "text-[#8E98A3]", accent: "bg-[#8E98A3]/10" },
          { icon: Users, label: "Ofertas", value: kpis.offers, color: "text-blue-400", accent: "bg-blue-500/10" },
        ].map(({ icon: Icon, label, value, color, accent }) => (
          <div key={label} className="bg-[#1A1F24] border border-[#323A45] rounded-2xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${accent} flex items-center justify-center`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <div>
              <p className="text-[9px] font-black text-[#8E98A3] uppercase tracking-widest">{label}</p>
              <p className={`text-2xl font-black ${color}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ PACOTES DE DIVULGAÇÃO DE LEILÕES ═══ */}
      <div className="bg-[#1A1F24] border border-violet-500/30 rounded-3xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Megaphone className="h-5 w-5 text-violet-400 shrink-0" />
          <div>
            <h2 className="text-sm font-black text-[#FFFFFF] uppercase tracking-widest">Pacotes de Divulgação de Leilões</h2>
            <p className="text-[11px] text-[#8E98A3]">Contrate um plano para divulgar seus leilões nos grupos e receber mais lances.</p>
          </div>
        </div>
        <PromotionPlansGrid profileType={"leiloes" as any} listingModule="auction" inline showHeader={false} />
      </div>

      {/* ═══ FILTROS ═══ */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8E98A3]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar leilões..."
            className="w-full h-12 pl-10 pr-4 rounded-2xl bg-[#1A1F24] border border-[#323A45] text-[#FFFFFF] font-bold text-sm placeholder:text-[#8E98A3] focus:border-[#FF6A00]/50 focus:outline-none transition-all"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "active", "ended"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${
                statusFilter === s
                  ? "bg-[#FF6A00] text-white shadow-lg shadow-[#FF6A00]/30"
                  : "bg-[#1A1F24] border border-[#323A45] text-[#8E98A3] hover:border-[#FF6A00]/40"
              }`}
            >
              {s === "all" ? "Todos" : s === "active" ? "Ativos" : "Encerrados"}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ LISTA DE LEILÕES ═══ */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#FF6A00]" />
          <p className="text-sm font-bold text-[#8E98A3] mt-4 uppercase tracking-widest">Carregando...</p>
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-[#1A1F24] border border-[#323A45] rounded-3xl">
          <Gavel className="h-16 w-16 text-[#FF6A00]/20 mb-4" />
          <p className="text-lg font-black text-[#FFFFFF] uppercase">Nenhum leilão encontrado</p>
          <p className="text-sm font-bold text-[#8E98A3] mt-2">
            Inicie um novo leilão ou arremate para começar a receber lances e ofertas.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredListings.map((listing) => {
            const detailUrl = (listing as any).listing_type === 'arremate'
              ? `/arremate/${listing.id}`
              : `/leilao/${listing.id}`;
            
            const isOngoing = listing.status === 'active' || listing.status === 'approved' || (listing.status !== 'ended' && listing.status !== 'cancelled' && listing.status !== 'sold' && new Date(listing.ends_at).getTime() > Date.now());

            return (
            <div key={listing.id} className="bg-[#1A1F24] border border-[#323A45] rounded-3xl overflow-hidden hover:border-[#FF6A00]/40 transition-all shadow-2xl shadow-black/20 group">

              {/* ── Área clicável: imagem + título → detalhe público ── */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => navigate(detailUrl)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(detailUrl)}
                className="cursor-pointer"
                title="Ver página pública do leilão"
              >
                {/* Image Preview */}
                <div className="relative aspect-video bg-[#252B33] overflow-hidden border-b border-[#323A45]">
                  {listing.product_image_url ? (
                    <img src={listing.product_image_url} alt={listing.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3 opacity-20">
                      <Package className="h-12 w-12 text-[#8E98A3]" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#8E98A3]">Sem imagem de destaque</span>
                    </div>
                  )}

                  {/* Float badges */}
                  <div className="absolute top-4 left-4 flex flex-col gap-2">
                    <div className={`px-4 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-widest border shadow-xl ${
                      (listing as any).listing_type === 'arremate'
                        ? 'bg-blue-500/90 text-white border-blue-400'
                        : 'bg-[#FF6A00]/90 text-white border-[#FF8C33]'
                    }`}>
                      {(listing as any).listing_type === 'arremate' ? 'Arremate' : 'Leilão'}
                    </div>
                    <div className={`px-3 py-1 rounded-lg font-black text-[9px] uppercase tracking-widest border ${
                      listing.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : listing.status === 'ended' ? 'bg-[#8E98A3]/20 text-[#8E98A3] border-[#8E98A3]/40'
                      : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                    }`}>
                      {listing.status === 'active' ? 'Ativo' : listing.status === 'ended' ? 'Encerrado' : listing.status}
                    </div>
                  </div>

                  {/* Ver detalhes hint */}
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div className="bg-black/70 backdrop-blur-md border border-white/20 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                      <ExternalLink className="h-3.5 w-3.5 text-white" />
                      <span className="text-[10px] font-black text-white uppercase tracking-widest">Ver Detalhes</span>
                    </div>
                  </div>

                  {listing.status === 'active' && (
                    <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md border border-white/20 px-4 py-2 rounded-2xl flex items-center gap-2">
                      <Timer className="h-4 w-4 text-[#FF6A00]" />
                      <CountdownTimer endsAt={listing.ends_at} onEnd={() => endAuction.mutate(listing.id, { onSuccess: () => refetchMyListings() })} />
                    </div>
                  )}
                </div>

                {/* Título — clicável também */}
                <div className="px-6 pt-5 pb-0 flex justify-between items-start gap-4 group/title hover:opacity-80 transition-opacity">
                  <h3 className="text-lg font-black text-[#FFFFFF] leading-tight uppercase truncate flex-1">{listing.title}</h3>
                  <ExternalLink className="h-4 w-4 text-[#8E98A3]/40 group-hover/title:text-[#FF6A00] transition-colors shrink-0 mt-1" />
                </div>
              </div>

              <div className="px-6 pb-6 space-y-4 pt-3">

                {/* Ações principais */}
                <div className={`grid gap-3 ${listing.status === 'active' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {/* EDITAR */}
                  <button
                    onClick={() => setEditingListing(listing)}
                    className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-[#FF6A00]/10 border-2 border-[#FF6A00]/30 hover:bg-[#FF6A00]/20 hover:border-[#FF6A00]/50 transition-all group"
                    title="Editar leilão"
                  >
                    <Edit className="h-5 w-5 text-[#FF6A00] group-hover:scale-110" />
                    <span className="text-[10px] font-black text-[#FF6A00] uppercase tracking-wider">Editar</span>
                  </button>

                  {/* PAUSAR (reversível) — só quando ativo */}
                  {listing.status === 'active' && (
                    <button
                      onClick={() => pauseListing.mutate(listing.id, { onSuccess: () => refetchMyListings() })}
                      disabled={pauseListing.isPending}
                      className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/50 transition-all"
                      title="Pausar leilão (reversível)"
                    >
                      {pauseListing.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                        <>
                          <PauseCircle className="h-5 w-5 text-amber-400" />
                          <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider">Pausar</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* REPUBLICAR — só quando pausado */}
                  {listing.status === 'paused' && (
                    <button
                      onClick={() => republishListing.mutate(listing.id, { onSuccess: () => refetchMyListings() })}
                      disabled={republishListing.isPending}
                      className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/30 hover:bg-emerald-500/20 transition-all"
                      title="Republicar leilão"
                    >
                      {republishListing.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                        <>
                          <PlayCircle className="h-5 w-5 text-emerald-400" />
                          <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Republicar</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* ENCERRAR definitivo — quando ativo ou pausado */}
                  {(listing.status === 'active' || listing.status === 'paused') && (
                    <button
                      onClick={() => {
                        if (confirm("Deseja ENCERRAR definitivamente este leilão? Esta ação não pode ser desfeita.")) {
                          endAuction.mutate(listing.id, { onSuccess: () => refetchMyListings() });
                        }
                      }}
                      disabled={endAuction.isPending}
                      className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-red-500/10 border-2 border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 transition-all"
                      title="Encerrar leilão (definitivo)"
                    >
                      {endAuction.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                        <>
                          <StopCircle className="h-5 w-5 text-red-400" />
                          <span className="text-[10px] font-black text-red-400 uppercase tracking-wider">Encerrar</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* EXCLUIR */}
                  {!isOngoing && (
                    <button
                      onClick={() => {
                        if (confirm("⚠️ ATENÇÃO: Deseja realmente EXCLUIR este leilão? Esta ação é IRREVERSÍVEL e todos os lances serão perdidos.")) {
                          deleteListing.mutate(listing.id, {
                            onSuccess: () => {
                              refetchMyListings();
                              toast.success("Leilão excluído!");
                            }
                          });
                        }
                      }}
                      className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-red-500/10 border-2 border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 transition-all group"
                      title="Excluir leilão permanentemente"
                    >
                      <Trash2 className="h-5 w-5 group-hover:scale-110" />
                      <span className="text-[10px] font-black text-red-400 uppercase tracking-wider">Excluir</span>
                    </button>
                  )}
                </div>

                {/* Divulgação: 1 anúncio grátis/dia + pacotes */}
                <div className={`grid gap-3 ${listing.status === 'active' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {listing.status === 'active' && (
                    <button
                      onClick={() => handleDivulgar(listing)}
                      disabled={dispatchingId === listing.id}
                      className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all group disabled:opacity-60"
                      title="Divulgar este leilão nos grupos — 1 anúncio grátis por dia"
                    >
                      {dispatchingId === listing.id ? (
                        <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
                      ) : (
                        <Gift className="h-5 w-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                      )}
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider text-center leading-tight">
                        Anúncio Grátis
                        <span className="block text-[8px] text-emerald-400/70 normal-case font-bold tracking-normal">1 por dia</span>
                      </span>
                    </button>
                  )}

                  <button
                    onClick={() => setShowPlans(true)}
                    className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-violet-500/10 border-2 border-violet-500/30 hover:bg-violet-500/20 hover:border-violet-500/50 transition-all group"
                    title="Ver opções de pacotes de divulgação"
                  >
                    <Megaphone className="h-5 w-5 text-violet-400 group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-black text-violet-300 uppercase tracking-wider text-center leading-tight">
                      Pacotes de
                      <span className="block">Divulgação</span>
                    </span>
                  </button>
                </div>

                {/* Informações principais */}
                <div className="grid grid-cols-2 gap-3 bg-[#252B33] p-4 rounded-2xl border border-[#323A45] shadow-inner">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-[#8E98A3] uppercase tracking-widest mb-1">
                      {listing.listing_type === 'arremate' ? 'Preço' : 'Lance Inicial'}
                    </span>
                    <span className="text-xl font-black text-[#FF6A00]">{formatBRL(listing.starting_bid)}</span>
                  </div>
                  <div className="flex flex-col border-l border-[#323A45] pl-3">
                    <span className="text-[9px] font-black text-[#8E98A3] uppercase tracking-widest mb-1">
                      {listing.listing_type === 'arremate' ? 'Ofertas' : 'Lances'}
                    </span>
                    <span className="text-xl font-black text-[#FFFFFF] flex items-center gap-2">
                      <Users className="h-4 w-4 text-emerald-400" />
                      {listing.listing_type === 'arremate'
                        ? receivedOffers.filter(o => o.arremate_listing_id === listing.id).length
                        : (listing.total_bids || 0)
                      }
                    </span>
                  </div>
                </div>

                {/* Datas e localização */}
                <div className="grid grid-cols-2 gap-3 text-[10px] font-bold text-[#8E98A3]">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-[#FF6A00]" />
                    <span>Criação: {new Date(listing.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Timer className="h-3.5 w-3.5 text-red-400" />
                    <span>Encerra: {new Date(listing.ends_at).toLocaleString("pt-BR", { day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' })}</span>
                  </div>
                  {listing.city && (
                    <div className="flex items-center gap-2 col-span-2">
                      <MapPin className="h-3.5 w-3.5 text-blue-500" />
                      <span>{listing.city}{listing.neighborhood ? `, ${listing.neighborhood}` : ''}</span>
                    </div>
                  )}
                </div>

                {/* Dar Lance (apenas ativos) */}
                {listing.status === 'active' && (
                  <div className="pt-2 border-t border-[#323A45]">
                    <MerchantRecentEvents module="auctions" limit={3} />
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}


      <CreateListingModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        isSubmitting={createListing.isPending}
        onSubmit={(data) => {
          // [TESTE] Verificação de créditos desativada para testes
          // const publishCost = usageRules?.find(r => r.feature_code === 'auction_listing_create')?.credits_cost ?? 7;
          // if ((balance?.available_credits ?? 0) < publishCost) {
          //   toast.error(
          //     `Créditos insuficientes! Necessário: ${publishCost}. Saldo: ${balance?.available_credits ?? 0}.`,
          //     { description: "Recarregue seus créditos para publicar leilões." }
          //   );
          //   return;
          // }

          createListing.mutate(data, {
            onSuccess: async (result) => {
              // [TESTE] Débito de créditos desativado para testes
              // const publishCost = usageRules?.find(r => r.feature_code === 'auction_listing_create')?.credits_cost ?? 7;
              // await debitCredits({
              //   amount: publishCost,
              //   reasonCode: "auction_listing_create",
              //   description: `Publicação de leilão: ${data.title}`,
              //   metadata: { listing_id: (result as any)?.listing_id },
              // });
              // refetchCredits();
              setShowCreateModal(false);
              refetchMyListings();
            }
          });
        }}
      />

      {/* ═══ EDIT LISTING MODAL ═══ */}
      <EditListingModal
        listing={editingListing}
        onClose={() => setEditingListing(null)}
        onSave={(updates) => {
          updateListing.mutate(updates, {
            onSuccess: () => {
              setEditingListing(null);
              refetchMyListings();
            },
          });
        }}
        isSaving={updateListing.isPending}
      />

    </div>
  );
}

