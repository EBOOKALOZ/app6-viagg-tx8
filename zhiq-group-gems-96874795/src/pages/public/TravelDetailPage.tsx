import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { ContactIntentionModal } from "@/components/listings/ContactIntentionModal";
import { Button } from "@/components/ui/button";
import { Plane, MapPin, Calendar, Users, Check, ArrowLeft, Loader2 } from "lucide-react";
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
    if (!user) {
      navigate(`/auth?entry=buyer&redirect=${encodeURIComponent(`/viagens/minha-conta?interest=${id}`)}`);
      return;
    }
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
      <div style={{ backgroundColor: "#E0F2FE" }} className="min-h-screen">
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
          <button onClick={() => navigate("/viagens")} className="flex items-center gap-2 text-sm font-bold text-zinc-600 hover:text-sky-600">
            <ArrowLeft className="w-4 h-4" /> Voltar para Viagens
          </button>

          {(media as string[]).length > 0 && (
            <div className="rounded-3xl overflow-hidden aspect-video bg-sky-100">
              <img src={(media as string[])[0]} alt={listing.title} className="w-full h-full object-contain bg-zinc-900" />
            </div>
          )}

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

            <Button onClick={handleInterest} className="w-full bg-sky-600 hover:bg-sky-700 text-white rounded-2xl font-black py-4 h-auto text-sm shadow-lg flex items-center justify-center gap-2 text-center whitespace-normal">
              <Plane className="w-4 h-4 shrink-0" /> TENHO INTERESSE NESTA VIAGEM
            </Button>
          </div>
        </div>
      </div>

      {contactOpen && (
        <ContactIntentionModal
          open={contactOpen}
          onClose={() => setContactOpen(false)}
          listingId={id!}
          listingModule={"travel" as any}
          listingTitle={listing.title}
        />
      )}

      <footer className="w-full bg-sky-700 text-white text-center py-3 text-xs font-medium space-y-1">
        <p>✈️ Viagg-TX8™ · Viagens &amp; Turismo · viagg-tx8.com</p>
        <p className="text-white/70 text-[10px]">© 2026 Desenvolvido por VIAGG-TX8</p>
      </footer>
    </MarketLayout>
  );
}
