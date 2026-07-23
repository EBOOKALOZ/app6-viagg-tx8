import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { TravelFullView } from "@/components/travel/TravelFullView";
import { resolveTravelMediaRow } from "@/lib/viagem/travelMedia";
import { ViaggAIChat } from "@/components/public/ViaggAIChat";

/**
 * Página isolada do pacote (/viagens/:id) — casca fina sobre o TravelFullView.
 * O MESMO conteúdo é renderizado embutido na página pública da Agência
 * (StorePublicPage com ?product=&view=full), onde o cabeçalho da agência
 * permanece visível durante toda a navegação.
 */
export default function TravelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: exists, isLoading } = useQuery({
    queryKey: ["travel-detail-exists", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await (supabase.from("travel_listings") as any)
        .select("id").eq("id", id).maybeSingle();
      return !!data;
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
          const url = resolveTravelMediaRow(m);
          if (url) mediaMap.set(m.listing_id, url);
        }
      }
      return rows.map((r: any) => ({ ...r, thumbnail_url: mediaMap.get(r.id) ?? null }));
    },
  });

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
    </div>
  );

  if (!exists) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <p className="text-zinc-500">Viagem nao encontrada.</p>
      <Button onClick={() => navigate("/viagens")}>Ver todas as viagens</Button>
    </div>
  );

  return (
    <MarketLayout
      search={search}
      setSearch={setSearch}
      showSearch
      headerChildren={<MarketNavButtons />}
      mainClassName="flex flex-col bg-[#F5E62B]"
      blueFooter
      blueFooterLabel="Viagens & Turismo"
      hideStoreNav
      myAccountPath="/viagens/minha-conta"
    >
      <TravelFullView
        listingId={id!}
        relacionados={sideListings.map((t: any) => ({
          id: t.id,
          titulo: t.title || 'Viagem',
          imagem: t.thumbnail_url,
          preco: t.entry_price?.trim()
            || (t.price_per_person ? `R$ ${Number(t.price_per_person).toLocaleString('pt-BR')}/pessoa` : null)
            || (t.total_price ? `R$ ${Number(t.total_price).toLocaleString('pt-BR')}` : null),
          cidade: t.destination || t.city,
          href: `/viagens/${t.id}`,
        }))}
      />

      <ViaggAIChat welcomeMessage="Olá! 👋 Sou o Assistente da plataforma Viagg-TX8. Posso te ajudar com os detalhes e dúvidas desta viagem?" />
    </MarketLayout>
  );
}
