import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Maximize2, BedDouble, Bath, MapPin, 
  ChevronLeft, Share2, ShieldCheck, 
  Phone, MessageSquare, Loader2, Info
} from 'lucide-react';
import { getListingImageUrl } from '@/lib/real-estate/mediaUtils';
import { cn, formatCurrencyBRL } from '@/lib/utils';
import { toast } from 'sonner';
import { ContactIntentionModal } from '@/components/listings/ContactIntentionModal';
import { getVisitorFingerprint } from '@/lib/cpcTracker';
import { MarketLayout } from '@/components/layout/MarketLayout';
import { StoreHeader } from '@/components/public/store/StoreHeader';

export const RealEstateDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [intentionModal, setIntentionModal] = useState<{ open: boolean; interestType: 'whatsapp_click' | 'message_request' }>({ open: false, interestType: 'message_request' });
  
  // ─── QUERY: Listing Principal ─────────────────────────────────────────────
  const { data: property, isLoading: isPropertyLoading, error: propertyError } = useQuery({
    queryKey: ['public-real-estate-detail', id],
    queryFn: async () => {
      // 1ª tentativa: view pública (imóveis com status published)
      const { data: viewData, error: viewError } = await supabase
        .from('public_real_estate_listings' as any)
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!viewError && viewData) {
        return viewData;
      }

      // 2ª tentativa: tabela direta (caso a view não exista ainda no Supabase)
      const { data: rawData, error: rawError } = await supabase
        .from('real_estate_listings' as any)
        .select('*')
        .eq('id', id)
        .in('visibility_status', ['published', 'approved', 'active'])
        .maybeSingle();

      if (rawError) throw rawError;

      // Gera campos calculados ausentes na tabela direta
      if (rawData) {
        const d = rawData as any;
        if (!d.public_address_label) {
          d.public_address_label = d.neighborhood
            ? `${d.neighborhood}, ${d.city}/${d.state}`
            : `${d.city}/${d.state}`;
        }
        if (!d.public_location) {
          d.public_location = `${d.city}/${d.state}`;
        }
      }

      return rawData;
    },
    enabled: !!id,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  // ─── QUERY: Mídias ───────────────────────────────────────────────────────
  const { data: media = [], isLoading: isMediaLoading } = useQuery({
    queryKey: ['public-real-estate-media', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('real_estate_media' as any)
        .select('original_storage_path, thumb_masked_storage_path, sort_order')
        .eq('listing_id', id)
        .order('sort_order', { ascending: true });
      
      if (error) return [];
      return data || [];
    },
    enabled: !!id,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  // ─── QUERY: Store Info ───────────────────────────────────────────────────
  const { data: storeInfo } = useQuery({
    queryKey: ['public-store-info-by-user', property?.user_id],
    enabled: !!property?.user_id,
    queryFn: async () => {
      const { data: storeData } = await (supabase.from('merchant_stores') as any).select('*').eq('user_id', property.user_id).maybeSingle();
      const { data: pData } = await (supabase.from("profiles") as any).select("*").eq("id", property.user_id).single();
      
      return {
          ...storeData,
          store_name: storeData?.nome_loja || pData?.nome_loja || storeData?.store_name || "Imobiliária / Corretor",
          logo_url: storeData?.logo_url || pData?.logo_url,
          city: storeData?.cidade || pData?.cidade || storeData?.city,
          region: storeData?.estado || pData?.estado || storeData?.region,
          bairro: storeData?.bairro || storeData?.neighborhood || pData?.bairro,
          logradouro: storeData?.rua || storeData?.street || pData?.rua || storeData?.endereco || pData?.endereco || storeData?.logradouro,
          description: storeData?.descricao || pData?.descricao || storeData?.description,
          categoria: storeData?.categoria || "Imóveis"
      };
    },
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });


  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: property?.title,
        text: property?.description?.slice(0, 100),
        url: window.location.href
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link copiado para a área de transferência!');
    }
  };

  const handleInterest = () => {
    // Tenta descontar 5 créditos pelo botão de interesse da página de detalhes
    try {
      supabase.rpc('rpc_register_property_click', {
        p_listing_id: id,
        p_visitor_fingerprint: getVisitorFingerprint(),
        p_amount: 5
      }).then((result) => console.log("[CPC_RESULT_INTEREST]", result));
    } catch (err) {
      console.error("[CPC_TRY_CATCH]", err);
    }
    setIntentionModal({ open: true, interestType: 'message_request' });
  };

  const handleWhatsApp = () => {
    setIntentionModal({ open: true, interestType: 'whatsapp_click' });
  };

  if (isPropertyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5E62B]">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-[#FF6A00] animate-spin mx-auto" />
          <p className="font-black text-zinc-400 uppercase tracking-widest text-xs">Sincronizando Módulo Imobiliário...</p>
        </div>
      </div>
    );
  }

  if (propertyError || !property) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5E62B] p-6">
        <Card className="max-w-md w-full border-none shadow-2xl rounded-3xl p-10 text-center space-y-6">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto">
             <Info className="w-10 h-10 text-red-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black tracking-tight">Anúncio Indisponível</h2>
            <p className="text-zinc-500 font-medium leading-relaxed">
              Não foi possível localizar este anúncio. Ele pode ter sido pausado, removido ou ainda está em análise.
            </p>
          </div>
          <Button onClick={() => navigate('/imoveis')} className="w-full h-12 rounded-2xl font-black">
            VOLTAR PARA LISTAGEM
          </Button>
        </Card>
      </div>
    );
  }

  const mainImageUrl = activeImage || (media.length > 0 ? getListingImageUrl(media[0].original_storage_path) : null);

  return (
    <>
      <MarketLayout showSearch={false} hideCart={true} mainClassName="bg-[#F5E62B] pb-20">
      {/* ─── HEADER BAR ─── */}
      <div className="sticky top-0 z-40 bg-[#F5E62B]/90 backdrop-blur-md border-b border-zinc-900/10">
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="rounded-full gap-2 font-bold">
            <ChevronLeft className="w-4 h-4" /> Voltar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleShare} className="rounded-full h-10 w-10 p-0 shadow-sm">
               <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ─── STORE HEADER ─── */}
      {storeInfo && (
          <div className="container max-w-6xl mx-auto px-4 mt-6">
              <StoreHeader 
                store={storeInfo}
                stats={null}
                productsCount={0}
                whatsappNumber={null}
                onShare={handleShare}
                logoUrl={storeInfo.logo_url || null}
                bannerUrl={storeInfo.banner_url || null} 
              />
          </div>
      )}

      <div className="container max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* ─── LADO ESQUERDO: GALERIA E DESCRIÇÃO ─── */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* Galeria Premium */}
            <div className="space-y-4">
              <div className="relative aspect-[4/3] rounded-[40px] overflow-hidden bg-zinc-100 shadow-2xl ring-1 ring-zinc-200">
                {mainImageUrl ? (
                  <img 
                    src={mainImageUrl} 
                    alt={property.title}
                    className="w-full h-full object-cover animate-in fade-in zoom-in duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="w-10 h-10 text-zinc-300 animate-spin" />
                  </div>
                )}
                <Badge className="absolute top-6 left-6 font-black uppercase text-[10px] bg-[#FF6A00] text-white py-1.5 px-4 backdrop-blur-md">
                  {property.property_type}
                </Badge>
              </div>

              {/* Thumbnails */}
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide py-2">
                {media.map((m: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImage(getListingImageUrl(m.original_storage_path))}
                    className={cn(
                      "flex-shrink-0 w-24 h-24 rounded-2xl overflow-hidden border-2 transition-all",
                      activeImage === getListingImageUrl(m.original_storage_path) || (!activeImage && idx === 0) 
                        ? "border-[#FF6A00] scale-105 shadow-lg" 
                        : "border-transparent opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
                    )}
                  >
                    <img src={getListingImageUrl(m.original_storage_path)} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {/* Informações Principais */}
            <div className="space-y-6">
              <div className="space-y-2">
                <h1 className="text-4xl font-black text-zinc-900 tracking-tighter leading-tight">
                  {property.title}
                </h1>
                <div className="flex items-center gap-2 text-zinc-900 font-bold text-xs uppercase tracking-widest">
                  <MapPin className="w-4 h-4 text-zinc-900" />
                  {property.public_address_label}
                </div>
              </div>

              <div className="flex flex-wrap gap-10 py-6 border-y border-zinc-100">
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Área Total</span>
                  <div className="flex items-center gap-2 font-black text-xl text-[#FF6A00]">
                    <Maximize2 className="w-5 h-5 text-[#FF6A00]" />
                    {property.total_area_m2 ? (property.total_area_m2 / 10000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '—'} ha
                  </div>
                </div>
                {property.bedrooms > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Quartos</span>
                    <div className="flex items-center gap-2 font-black text-xl text-[#FF6A00]">
                      <BedDouble className="w-5 h-5 text-[#FF6A00]" />
                      {property.bedrooms}
                    </div>
                  </div>
                )}
                {property.bathrooms > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Banheiros</span>
                    <div className="flex items-center gap-2 font-black text-xl text-[#FF6A00]">
                      <Bath className="w-5 h-5 text-[#FF6A00]" />
                      {property.bathrooms}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="text-xl font-black uppercase tracking-tight text-[#FF6A00]">Descrição do Imóvel</h3>
                <p className="text-[#FF6A00] font-medium leading-relaxed whitespace-pre-line text-lg">
                  {property.description}
                </p>
              </div>
            </div>
          </div>

          {/* ─── LADO DIREITO: PRICE & CONTACT ─── */}
          <div className="lg:col-span-4 space-y-6">
            <div className="sticky top-28 space-y-6">
              <Card className="border-none shadow-2xl rounded-[35px] overflow-hidden ring-1 ring-zinc-200">
                <CardContent className="p-8 space-y-8">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Valor de Investimento</span>
                    <div className="text-4xl font-black text-[#FF6A00] tracking-tighter">
                      {formatCurrencyBRL(property.price_brl)}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Button 
                      onClick={handleInterest}
                      className="w-full h-16 rounded-2xl font-black text-lg text-white shadow-xl shadow-orange-500/20 bg-[#FF6A00] hover:bg-orange-700 transition-all active:scale-95"
                    >
                      ESTOU INTERESSADO
                    </Button>
                  </div>

                  <div className="pt-6 border-t border-zinc-100 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <p className="text-[10px] text-zinc-400 font-bold uppercase leading-relaxed tracking-tight">
                      Contato Seguro Protegido por IA. Suas informações não são expostas sem sua autorização.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Sidebar Tip */}
              <div className="p-6 bg-zinc-50 rounded-3xl space-y-3">
                 <h4 className="font-black text-zinc-900 text-sm uppercase flex items-center gap-2">
                   <Info className="w-4 h-4 text-[#FF6A00]" /> Dica de Segurança
                 </h4>
                 <p className="text-xs text-zinc-500 font-medium leading-relaxed">
                   Sempre agende visitas em horários comerciais e em locais públicos antes de ir a propriedades rurais isoladas. Negocie através da plataforma para sua segurança.
                 </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </MarketLayout>

    {/* Modal de interesse de contato */}
    {id && property && (
      <ContactIntentionModal
        open={intentionModal.open}
        onClose={() => setIntentionModal(prev => ({ ...prev, open: false }))}
        listingId={id}
        listingModule="real_estate"
        interestType={intentionModal.interestType}
        listingTitle={property.title}
      />
    )}
  </>);
};

export default RealEstateDetailPage;
