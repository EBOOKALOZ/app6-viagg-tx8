import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ContactIntentionModal } from "@/components/listings/ContactIntentionModal";
import { StoreLocationMap } from "@/components/StoreLocationMap";
import { InstitutionalSafetyBanner } from "@/components/public/InstitutionalSafetyBanner";
import { Plane, MapPin, Calendar, Users, Check, Loader2, DollarSign, Clock, ShieldCheck } from "lucide-react";
import { TRAVEL_INCLUDES, resolveTravelCategoryEmoji } from "@/lib/viagem/travelCategories";
import { DetailPageLayout, DetailRelated } from "@/components/detail/DetailPageLayout";
import { AdvertiserSummaryCard } from "@/components/public/advertiser/AdvertiserSummaryCard";

export interface TravelFullViewProps {
  listingId: string;
  /**
   * Modo EMBUTIDO (página pública da Agência): sem card do anunciante, sem
   * banner institucional e sem "relacionados" — o cabeçalho e os demais
   * pacotes da agência já estão na página anfitriã.
   */
  embedded?: boolean;
  /** Voltar do modo embutido (fecha o pacote completo sem sair da Agência). */
  onBack?: () => void;
  /** Relacionados do modo página (montados pelo chamador). */
  relacionados?: DetailRelated[];
}

/**
 * Pacote completo de VIAGEM — conteúdo único usado pela página isolada
 * (/viagens/:id) e pelo modo embutido dentro da página pública da Agência.
 * O mesmo padrão (FullView por módulo + DetailPageLayout embedded) deve ser
 * replicado em Mercado/Imóveis/Veículos/Fretes/Leilões/Arremates.
 */
export function TravelFullView({ listingId, embedded = false, onBack, relacionados }: TravelFullViewProps) {
  const [contactOpen, setContactOpen] = useState(false);
  const chargedClick = useRef<string | null>(null);

  const { data: listing, isLoading } = useQuery({
    queryKey: ["travel-detail", listingId],
    enabled: !!listingId,
    queryFn: async () => {
      const { data } = await (supabase.from("travel_listings") as any)
        .select("*").eq("id", listingId).maybeSingle();
      if (data) return data;
      // Fallback: anúncios de viagem criados no schema antigo (viagem_listings)
      const { data: alt } = await (supabase.from("viagem_listings") as any)
        .select("*").eq("id", listingId).maybeSingle();
      return alt ?? null;
    },
  });

  const { data: media = [] } = useQuery({
    queryKey: ["travel-detail-media", listingId],
    enabled: !!listingId,
    queryFn: async () => {
      const { data } = await (supabase.from("travel_media") as any)
        .select("original_storage_path, public_masked_storage_path, sort_order")
        .eq("listing_id", listingId)
        .order("sort_order", { ascending: true });
      return ((data || []) as any[]).map((m: any) => {
        const p = m.public_masked_storage_path || m.original_storage_path;
        return p?.startsWith("http") ? p : supabase.storage.from("real-estate-original").getPublicUrl(p).data.publicUrl;
      }).filter(Boolean);
    },
  });

  useEffect(() => {
    if (!listingId || chargedClick.current === listingId) return;
    chargedClick.current = listingId;
    const fpKey = `travel_click_${listingId}`;
    const fp = sessionStorage.getItem(fpKey) ?? (() => {
      const v = Math.random().toString(36).slice(2);
      sessionStorage.setItem(fpKey, v);
      return v;
    })();
    supabase.rpc("charge_travel_listing_click" as any, { p_listing_id: listingId, p_fingerprint: fp }).then(() => {}, () => {});
  }, [listingId]);

  const handleInterest = () => {
    supabase.rpc("charge_travel_interest_click" as any, { p_listing_id: listingId, p_fingerprint: null }).then(() => {}, () => {});
    setContactOpen(true);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
    </div>
  );

  if (!listing) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <p className="text-zinc-500">Viagem não encontrada.</p>
    </div>
  );

  const emoji = resolveTravelCategoryEmoji(listing.category);
  const activeIncludes = TRAVEL_INCLUDES.filter(i => listing[`includes_${i.key}`]);

  const priceDisplay = listing.entry_price?.trim()
    || (listing.price_per_person ? `R$ ${Number(listing.price_per_person).toLocaleString("pt-BR")}/pessoa` : null)
    || (listing.total_price ? `R$ ${Number(listing.total_price).toLocaleString("pt-BR")}` : null)
    || "Consulte";

  return (
    <>
      <DetailPageLayout
        embedded={embedded}
        onVoltar={embedded ? onBack : undefined}
        voltarLabel={embedded ? "Voltar aos pacotes" : undefined}
        bg={embedded ? undefined : "#F5E62B"}
        accent="#0284c7"
        moduloLabel="Viagens & Turismo"
        titulo={listing.title}
        preco={priceDisplay}
        categoria={`${emoji} ${listing.category}`}
        cidade={listing.destination || `${listing.city ?? ''}${listing.state ? '/' + listing.state : ''}`}
        badges={listing.is_featured ? [{ label: '⭐ Destaque', bg: '#fef3c7', color: '#b45309' }] : []}
        imagens={((media as string[]).length ? media : [listing.cover_image_url].filter(Boolean)) as string[]}
        caracteristicas={[
          ...(listing.departure_date ? [{ icone: <Calendar className="h-3.5 w-3.5" />, label: `Saída: ${new Date(listing.departure_date + 'T12:00:00').toLocaleDateString('pt-BR')}` }] : []),
          ...(listing.duration_days ? [{ icone: <Plane className="h-3.5 w-3.5" />, label: `${listing.duration_days} dias` }] : []),
          ...(listing.available_spots ? [{ icone: <Users className="h-3.5 w-3.5" />, label: `${listing.available_spots} vagas` }] : []),
        ]}
        descricao={listing.description}
        especificacoes={[
          { label: 'Categoria', value: listing.category },
          { label: 'Valor', value: priceDisplay },
          ...(listing.destination ? [{ label: 'Destino', value: listing.destination }] : []),
          ...(listing.departure_date ? [{ label: 'Saída', value: new Date(listing.departure_date + 'T12:00:00').toLocaleDateString('pt-BR') }] : []),
          ...(listing.duration_days ? [{ label: 'Duração', value: `${listing.duration_days} dias` }] : []),
          ...(listing.available_spots ? [{ label: 'Vagas', value: String(listing.available_spots) }] : []),
        ]}
        mapa={listing.latitude && listing.longitude ? (
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <MapPin className="h-4 w-4" style={{ color: '#0284c7' }} />
              <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}>Localização da agência</p>
            </div>
            {listing.endereco_formatado && <p className="mb-2 text-xs text-slate-500">{listing.endereco_formatado}</p>}
            <div className="h-52 overflow-hidden rounded-2xl border border-slate-200">
              <StoreLocationMap
                initialLat={listing.latitude}
                initialLng={listing.longitude}
                addressLabel={listing.endereco_formatado ?? listing.city}
                markerLabel={listing.title}
                readOnly hasConfirmedLocation onLocationSelect={() => {}}
                className="h-full w-full"
              />
            </div>
          </div>
        ) : undefined}
        extras={(
          <>
            {activeIncludes.length > 0 && (
              <div className="rounded-[22px] bg-white/80 p-5" style={{ border: '1px solid rgba(255,255,255,.85)', boxShadow: '0 16px 40px -18px rgba(15,23,42,.14)', backdropFilter: 'blur(16px)' }}>
                <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}>O que está incluso</p>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {activeIncludes.map(inc => (
                    <div key={inc.key} className="flex items-center gap-2 text-sm text-slate-700">
                      <Check className="h-4 w-4 shrink-0" style={{ color: '#0284c7' }} /> {inc.label}
                    </div>
                  ))}
                </div>
                {listing.not_included && (
                  <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
                    <strong>Não incluso:</strong> {listing.not_included}
                  </p>
                )}
              </div>
            )}
            {!embedded && (
              <AdvertiserSummaryCard
                advertiserId={listing.store_id || listing.profile_id || listing.owner_user_id}
                profileType="viagem"
              />
            )}
            <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p className="text-[11px] leading-relaxed text-emerald-800" style={{ fontWeight: 600 }}>
                Contato seguro protegido. Suas informações não são expostas sem sua autorização.
                A plataforma não é responsável por negociações ou pagamentos entre as partes.
              </p>
            </div>
            {!embedded && <InstitutionalSafetyBanner />}
          </>
        )}
        acoes={{ onInteresse: handleInterest, interesseLabel: 'Tenho Interesse nesta Viagem' }}
        relacionados={embedded ? undefined : relacionados}
      />

      {contactOpen && (
        <ContactIntentionModal
          open={contactOpen}
          onClose={() => setContactOpen(false)}
          listingId={listingId}
          listingModule={"travel" as any}
          listingTitle={listing.title}
          listingMeta={{
            image: (media as string[])[0] ?? null,
            chips: [
              ...(priceDisplay ? [{ icon: <DollarSign className="w-3 h-3" />, label: priceDisplay, color: "#22c55e" }] : []),
              ...(listing.destination ? [{ icon: <MapPin className="w-3 h-3" />, label: listing.destination, color: "#0ea5e9" }] : []),
              ...(listing.departure_date ? [{ icon: <Calendar className="w-3 h-3" />, label: new Date(listing.departure_date + "T12:00:00").toLocaleDateString("pt-BR") }] : []),
              ...(listing.duration_days ? [{ icon: <Clock className="w-3 h-3" />, label: `${listing.duration_days} dias`, color: "#f59e0b" }] : []),
              ...(listing.available_spots ? [{ icon: <Users className="w-3 h-3" />, label: `${listing.available_spots} vagas`, color: "#8b5cf6" }] : []),
            ],
          }}
        />
      )}
    </>
  );
}

export default TravelFullView;
