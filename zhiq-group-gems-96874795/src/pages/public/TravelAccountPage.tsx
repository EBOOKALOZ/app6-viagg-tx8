import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { PersonalProfileCard } from "@/components/profile/PersonalProfileCard";
import { Plane, MapPin, Calendar, ArrowLeft, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveTravelCategoryEmoji } from "@/lib/viagem/travelCategories";

const PROFILE_QUERY_KEY = ["travel-account-profile"];

export default function TravelAccountPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

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
      hideFooter
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
          ) : intentions.length === 0 ? (
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
              {intentions.map((item: any) => {
                const listing = item.listing;
                const emoji = listing ? resolveTravelCategoryEmoji(listing.category) : "✈️";
                const price = listing?.entry_price?.trim()
                  || (listing?.price_per_person ? `R$ ${Number(listing.price_per_person).toLocaleString("pt-BR")}/p.` : null)
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

      <footer className="w-full bg-sky-700 text-white text-center py-3 text-xs font-medium space-y-1">
        <p>✈️ Viagg-TX8™ · Viagens &amp; Turismo · viagg-tx8.com</p>
        <p className="text-white/70 text-[10px]">© 2026 Desenvolvido por VIAGG-TX8</p>
      </footer>
    </MarketLayout>
  );
}
