import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { ContactIntentionModal } from "@/components/listings/ContactIntentionModal";
import { MarketTravelCard } from "@/components/travel/MarketTravelCard";
import { StoreLocationMap } from "@/components/StoreLocationMap";
import { InstitutionalSafetyBanner } from "@/components/public/InstitutionalSafetyBanner";
import { Button } from "@/components/ui/button";
import { Plane, MapPin, Calendar, Users, Check, ArrowLeft, Loader2, DollarSign, Clock, ShieldCheck } from "lucide-react";
import { TRAVEL_INCLUDES, resolveTravelCategoryEmoji } from "@/lib/viagem/travelCategories";

export default function TravelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const chargedClick = useRef(false);

  const { data: listing, isLoading } = useQuery({
    queryKey: ["travel-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await (supabase.from("travel_listings") as any)
        .select("*").eq("id", id).single();
      return data;
    },
  });

  const { data: sideListings = [] } = useQuery({
    queryKey: ["travel-side", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await (supabase.from("travel_listings") as any)
        .select("id, title, category, destination, city, state, price_per_person, total_price, entry_price, is_featured, departure_date, duration_days, visibility_status, created_at")
        .eq("visibility_status", "published")
        .neq("id", id)
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(4);
      const rows = (data || []) as any[];
      if (rows.length === 0) return [];
      const ids = rows.map((r: any) => r.id);
      const { data: mediaRows } = await (supabase.from("travel_media") as any)
        .select("listing_id, original_storage_path, public_masked_storage_path, sort_order")
        .in("listing_id", ids)
        .order("sort_order", { ascending: true });
      const mediaMap = new Map<string, string>();
      for (const m of (mediaRows as any[]) || []) {
        if (!mediaMap.has(m.listing_id)) {
          const p = m.public_masked_storage_path || m.original_storage_path;
          if (p) mediaMap.set(m.listing_id, p.startsWith("http") ? p : supabase.storage.from("real-estate-original").getPublicUrl(p).data.publicUrl);
        }
      }
      return rows.map((r: any) => ({ ...r, thumbnail_url: mediaMap.get(r.id) ?? null }));
    },
  });

  const { data: media = [] } = useQuery({
    queryKey: ["travel-detail-media", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await (supabase.from("travel_media") as any)
        .select("original_storage_path, public_masked_storage_path, sort_order")
        .eq("listing_id", id)
        .order("sort_order", { ascending: true });
      return ((data || []) as any[]).map((m: any) => {
        const p = m.public_masked_storage_path || m.original_storage_path;
        return p?.startsWith("http") ? p : supabase.storage.from("real-estate-original").getPublicUrl(p).data.publicUrl;
      }).filter(Boolean);
    },
  });

  useEffect(() => {
    if (!id || chargedClick.current) return;
    chargedClick.current = true;
    const fpKey = `travel_click_${id}`;
    const fp = sessionStorage.getItem(fpKey) ?? (() => {
      const v = Math.random().toString(36).slice(2);
      sessionStorage.setItem(fpKey, v);
      return v;
    })();
    supabase.rpc("charge_travel_listing_click" as any, { p_listing_id: id, p_fingerprint: fp }).then(() => {}, () => {});
  }, [id]);

  const handleInterest = () => {
    supabase.rpc("charge_travel_interest_click" as any, { p_listing_id: id, p_fingerprint: null }).then(() => {}, () => {});
    setContactOpen(true);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
    </div>
  );

  if (!listing) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <p className="text-zinc-500">Viagem nao encontrada.</p>
      <Button onClick={() => navigate("/viagens")}>Ver todas as viagens</Button>
    </div>
  );

  const emoji = resolveTravelCategoryEmoji(listing.category);
  const activeIncludes = TRAVEL_INCLUDES.filter(i => listing[`includes_${i.key}`]);

  const priceDisplay = listing.entry_price?.trim()
    || (listing.price_per_person ? `R$ ${Number(listing.price_per_person).toLocaleString("pt-BR")}/pessoa` : null)
    || (listing.total_price ? `R$ ${Number(listing.total_price).toLocaleString("pt-BR")}` : null)
    || "Consulte";

  return (
    <MarketLayout
      search={search}
      setSearch={setSearch}
      showSearch
      headerChildren={<MarketNavButtons />}
      mainClassName="flex flex-col"
      hideFooter
      hideStoreNav
      myAccountPath="/viagens/minha-conta"
    >
      <div style={{ backgroundColor: "#F5E62B" }} className="min-h-screen">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <button onClick={() => navigate("/viagens")} className="flex items-center gap-2 text-sm font-bold text-zinc-600 hover:text-sky-600 mb-6">
            <ArrowLeft className="w-4 h-4" /> Voltar para Viagens
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_260px] gap-6 items-start">
            {/* Cards laterais esquerdos */}
            <div className="hidden lg:flex flex-col gap-4">
              {sideListings[0] && <MarketTravelCard travel={sideListings[0]} />}
              {sideListings[1] && <MarketTravelCard travel={sideListings[1]} />}
              <button
                onClick={() => navigate("/viagens")}
                className="text-xs font-black text-sky-600 hover:text-sky-700 underline underline-offset-2 text-center py-1"
              >
                Ver mais viagens →
              </button>
            </div>

            {/* Conteúdo principal */}
            <div className="space-y-6">
          <div className="rounded-3xl overflow-hidden aspect-video">
            {(media as string[]).length > 0 ? (
              <img src={(media as string[])[0]} alt={listing.title} className="w-full h-full object-contain bg-zinc-900" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ backgroundColor: "#F5E62B" }}>
                <span className="text-5xl">✈️</span>
                <p className="text-zinc-800 font-black text-lg tracking-tight">Viagens &amp; Turismo</p>
                <p className="text-zinc-600 text-sm font-medium">Sem foto cadastrada</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl p-6 space-y-4 border border-zinc-200">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-xs font-black text-sky-600 bg-sky-50 px-3 py-1 rounded-full">
                  {emoji} {listing.category}
                </span>
                <div className="text-xl font-black text-sky-600">{priceDisplay}</div>
              </div>
              <h1 className="text-2xl font-black text-zinc-900 leading-tight break-words">{listing.title}</h1>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-zinc-500">
              {listing.destination && (
                <span className="flex items-center gap-1"><MapPin className="w-4 h-4 text-sky-500" /> {listing.destination}</span>
              )}
              {listing.departure_date && (
                <span className="flex items-center gap-1"><Calendar className="w-4 h-4 text-sky-500" /> Saida: {new Date(listing.departure_date + "T12:00:00").toLocaleDateString("pt-BR")}</span>
              )}
              {listing.duration_days && (
                <span className="flex items-center gap-1"><Plane className="w-4 h-4 text-sky-500" /> {listing.duration_days} dias</span>
              )}
              {listing.available_spots && (
                <span className="flex items-center gap-1"><Users className="w-4 h-4 text-sky-500" /> {listing.available_spots} vagas</span>
              )}
            </div>

            {listing.description && (
              <p className="text-zinc-700 leading-relaxed whitespace-pre-line">{listing.description}</p>
            )}

            {activeIncludes.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-black text-zinc-900">O que esta incluso:</h3>
                <div className="grid grid-cols-2 gap-1.5">
                  {activeIncludes.map(inc => (
                    <div key={inc.key} className="flex items-center gap-2 text-sm text-zinc-700">
                      <Check className="w-4 h-4 text-sky-600 shrink-0" /> {inc.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {listing.not_included && (
              <div className="space-y-1">
                <h3 className="font-black text-zinc-900 text-sm">Nao incluso:</h3>
                <p className="text-sm text-zinc-500">{listing.not_included}</p>
              </div>
            )}

            {/* ── Mapa de localização da agência ── */}
            {listing.latitude && listing.longitude && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-sky-500" />
                  <h3 className="font-black text-zinc-900 text-sm">Localização da agência</h3>
                </div>
                {listing.endereco_formatado && (
                  <p className="text-xs text-zinc-500 font-medium">{listing.endereco_formatado}</p>
                )}
                <div className="rounded-2xl overflow-hidden border border-zinc-200 shadow-sm h-52">
                  <StoreLocationMap
                    initialLat={listing.latitude}
                    initialLng={listing.longitude}
                    addressLabel={listing.endereco_formatado ?? listing.city}
                    markerLabel={listing.title}
                    readOnly
                    hasConfirmedLocation
                    onLocationSelect={() => {}}
                    className="w-full h-full"
                  />
                </div>
              </div>
            )}

            <Button onClick={handleInterest} className="w-full bg-sky-600 hover:bg-sky-700 text-white rounded-2xl font-black py-4 h-auto text-sm shadow-lg flex items-center justify-center gap-2 text-center whitespace-normal">
              <Plane className="w-4 h-4 shrink-0" /> TENHO INTERESSE NESTA VIAGEM
            </Button>

            <div className="pt-4 border-t border-zinc-100 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-zinc-500 font-bold uppercase leading-relaxed tracking-tight">
                Contato seguro protegido. Suas informações não são expostas sem sua autorização. A plataforma não é responsável por negociações ou pagamentos entre as partes.
              </p>
            </div>
          </div>
            </div>{/* fim conteúdo principal */}

            {/* Cards laterais direitos */}
            <div className="hidden lg:flex flex-col gap-4">
              {sideListings[2] && <MarketTravelCard travel={sideListings[2]} />}
              {sideListings[3] && <MarketTravelCard travel={sideListings[3]} />}
              <button
                onClick={() => navigate("/viagens")}
                className="text-xs font-black text-sky-600 hover:text-sky-700 underline underline-offset-2 text-center py-1"
              >
                Ver mais viagens →
              </button>
            </div>
          </div>{/* fim grid 3 colunas */}
        </div>

        <div className="mt-8">
          <InstitutionalSafetyBanner />
        </div>
      </div>

      {contactOpen && (
        <ContactIntentionModal
          open={contactOpen}
          onClose={() => setContactOpen(false)}
          listingId={id!}
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

      <footer className="w-full bg-sky-700 text-white text-center py-3 text-xs font-medium space-y-1">
        <p>✈️ Viagg-TX8™ · Viagens &amp; Turismo · viagg-tx8.com</p>
        <p className="text-white/70 text-[10px]">© 2026 Desenvolvido por VIAGG-TX8</p>
      </footer>
    </MarketLayout>
  );
}
