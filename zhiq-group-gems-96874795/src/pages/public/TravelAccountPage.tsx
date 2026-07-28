import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { PersonalProfileCard } from "@/components/profile/PersonalProfileCard";
import { ContactIntentionModal } from "@/components/listings/ContactIntentionModal";
import { Plane, MapPin, Calendar, ArrowLeft, Loader2, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveTravelCategoryEmoji } from "@/lib/viagem/travelCategories";

const PROFILE_QUERY_KEY = ["travel-account-profile"];

export default function TravelAccountPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const pendingInterestId = searchParams.get("interest");

  const { data: profile } = useQuery({
    queryKey: [...PROFILE_QUERY_KEY, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase.from("profiles") as any)
        .select("name, full_name, avatar_url, cidade, estado, telefone, whatsapp")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: pendingListing } = useQuery({
    queryKey: ["travel-pending-interest", pendingInterestId],
    enabled: !!pendingInterestId,
    queryFn: async () => {
      const { data } = await (supabase.from("travel_listings") as any)
        .select("id, title, category, destination, city, state, departure_date, entry_price, price_per_person")
        .eq("id", pendingInterestId)
        .maybeSingle();
      return data;
    },
  });

const { data: intentions = [], isLoading } = useQuery({
    queryKey: ["travel-my-interests", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase.from("advertiser_contact_intentions") as any)
        .select("id, listing_id, created_at, status, listing_module")
        .eq("contact_user_id", user!.id)
        .eq("listing_module", "travel")
        .order("created_at", { ascending: false })
        .limit(50);

      const rows = (data || []) as any[];
      if (rows.length === 0) return [];
      const ids = rows.map((r: any) => r.listing_id).filter(Boolean);
      if (ids.length === 0) return rows;

      const { data: listings } = await (supabase.from("travel_listings") as any)
        .select("id, title, category, destination, city, state, departure_date, entry_price, price_per_person")
        .in("id", ids);

      const listingMap = new Map((listings || []).map((l: any) => [l.id, l]));
      return rows.map((r: any) => ({ ...r, listing: listingMap.get(r.listing_id) || null }));
    },
  });

  return (
    <MarketLayout
      search={search}
      setSearch={setSearch}
      showSearch={false}
      headerChildren={<MarketNavButtons />}
      mainClassName="flex flex-col bg-sky-50"
      blueFooter
      blueFooterLabel="Viagens & Turismo"
      hideStoreNav
    >
      <div className="max-w-2xl mx-auto w-full px-4 py-8 space-y-6">
        <button
          onClick={() => navigate("/viagens")}
          className="flex items-center gap-2 text-sm font-bold text-zinc-500 hover:text-sky-600"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para Viagens
        </button>

        <PersonalProfileCard
          profile={profile}
          queryKey={[...PROFILE_QUERY_KEY, user?.id ?? ""]}
          onSignOut={() => navigate("/viagens")}
          accentClass="text-sky-500"
          accentBgClass="bg-sky-600 hover:bg-sky-700"
        />

        {/* Produto de interesse pendente */}
        {pendingListing && (
          <div className="bg-[#68c7f2] rounded-3xl p-5 space-y-3 shadow-xl relative">
            <button
              onClick={() => navigate("/viagens/minha-conta", { replace: true })}
              className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              title="Descartar"
            >
              <X className="w-3.5 h-3.5 text-white" />
            </button>
            <p className="text-xs font-black text-sky-200 uppercase tracking-widest">Você quis saber mais sobre</p>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{resolveTravelCategoryEmoji(pendingListing.category)}</span>
              <div className="min-w-0 flex-1">
                <p className="font-black text-white text-base leading-tight truncate">{pendingListing.title}</p>
                {pendingListing.destination && (
                  <p className="text-sky-200 text-xs flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" />{pendingListing.destination}
                  </p>
                )}
              </div>
              {(pendingListing.entry_price || pendingListing.price_per_person) && (
                <p className="text-white font-black text-sm shrink-0">
                  {pendingListing.entry_price?.trim() || `R$ ${Number(pendingListing.price_per_person).toLocaleString("pt-BR")}/ pessoa`}
                </p>
              )}
            </div>
            <Button
              onClick={() => setContactOpen(true)}
              className="w-full bg-institutional-yellow hover:brightness-95 text-zinc-900 font-black rounded-2xl text-sm"
            >
              <Plane className="w-4 h-4 mr-2" /> Confirmar meu interesse
            </Button>
          </div>
        )}

        {/* Meus Interesses */}
        <div className="bg-white rounded-3xl border border-zinc-200 overflow-hidden">
          <div className="flex items-center gap-3 p-5 border-b border-zinc-100">
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
              <Plane className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-zinc-900 text-sm">Meus Interesses</p>
              <p className="text-xs text-zinc-500">Viagens que você demonstrou interesse</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-10 px-5 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
            </div>
          ) : intentions.length === 0 && !pendingListing ? (
            <div className="py-12 px-5 text-center space-y-3">
              <div className="text-5xl">✈️</div>
              <p className="font-bold text-zinc-700">Nenhum interesse registrado ainda</p>
              <p className="text-sm text-zinc-400">Explore os pacotes e clique em "Tenho Interesse"</p>
              <Button
                onClick={() => navigate("/viagens")}
                className="bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-bold mt-2"
              >
                Ver viagens disponíveis
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {/* Interesse pendente de confirmação */}
              {pendingListing && (
                <div
                  onClick={() => setContactOpen(true)}
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-sky-50 transition-colors"
                >
                  <span className="text-2xl shrink-0">{resolveTravelCategoryEmoji(pendingListing.category)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-zinc-900 text-sm truncate">{pendingListing.title}</p>
                    {pendingListing.destination && (
                      <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />{pendingListing.destination}
                      </p>
                    )}
                    <span className="inline-block mt-1 text-[10px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      Aguardando confirmação
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    {(pendingListing.entry_price || pendingListing.price_per_person) && (
                      <p className="text-sm font-black text-sky-600">
                        {pendingListing.entry_price?.trim() || `R$ ${Number(pendingListing.price_per_person).toLocaleString("pt-BR")}/ pessoa`}
                      </p>
                    )}
                    <ChevronRight className="w-4 h-4 text-zinc-300 ml-auto mt-1" />
                  </div>
                </div>
              )}
              {intentions.map((item: any) => {
                const listing = item.listing;
                const emoji = listing ? resolveTravelCategoryEmoji(listing.category) : "✈️";
                const price = listing?.entry_price?.trim()
                  || (listing?.price_per_person ? `R$ ${Number(listing.price_per_person).toLocaleString("pt-BR")}/ pessoa` : null)
                  || "Consulte";
                return (
                  <div
                    key={item.id}
                    onClick={() => listing && navigate(`/viagens/${item.listing_id}`)}
                    className={`flex items-center gap-3 p-4 ${listing ? "cursor-pointer hover:bg-sky-50 transition-colors" : ""}`}
                  >
                    <span className="text-2xl shrink-0">{emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-zinc-900 text-sm truncate">
                        {listing?.title || "Pacote não disponível"}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                        {listing?.destination && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {listing.destination}
                          </span>
                        )}
                        {listing?.departure_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(listing.departure_date + "T12:00:00").toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        Interesse em {new Date(item.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    {listing && (
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black text-sky-600">{price}</p>
                        <ChevronRight className="w-4 h-4 text-zinc-300 ml-auto mt-1" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {pendingInterestId && (
        <ContactIntentionModal
          open={contactOpen}
          onClose={() => setContactOpen(false)}
          listingId={pendingInterestId}
          listingModule={"travel" as any}
          listingTitle={pendingListing?.title}
        />
      )}
    </MarketLayout>
  );
}
