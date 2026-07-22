/**
 * MercadoAuctionsSection — Seção de Leilões dentro da vitrine do Mercado.
 *
 * Self-contained: busca os leilões ATIVOS (auction_listings) e renderiza cards
 * com foto/preço/valor atual/cronômetro ao vivo/lances/loja, faixa "🔥 Em Alta"
 * e link "Ver todos" (/leiloes). Realtime nos lances. NÃO altera nada do Mercado —
 * é só um bloco inserido na página. Card → /leilao/:id.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Gavel, ChevronRight, Users } from "lucide-react";
import { HorizontalCarousel } from "@/components/ui/HorizontalCarousel";
import { MarketAuctionCard } from "@/components/advertiser/MarketAuctionCard";
import type { AuctionListing } from "@/hooks/useAuctions";

interface AuctionRow {
  id: string;
  store_id: string | null;
  title: string;
  description: string | null;
  product_image_url: string | null;
  starting_bid: number | null;
  current_bid: number | null;
  city: string | null;
  ends_at: string;
  total_bids: number | null;
  watchers_count: number | null;
  status: string;
  listing_type: string | null;
}

// AuctionCard inline (Modelo 3) REMOVIDO na padronização ORION 07-21 — o
// carrossel agora usa o componente ÚNICO MarketAuctionCard (variant="carousel").

export function MercadoAuctionsSection({ search = "" }: { search?: string }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AuctionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Busca TODOS os leilões cadastrados (exceto cancelados/removidos). O recorte
  // "ativos" vs "todos" é feito no cliente — assim a busca por "leilão" mostra
  // todos os cadastrados sem novo round-trip.
  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase
      .from("auction_listings")
      .select("id, store_id, title, description, product_image_url, starting_bid, current_bid, city, ends_at, total_bids, watchers_count, status, listing_type")
      .not("status", "in", "(canceled,cancelled,cancelado,deleted,removed,draft)")
      .order("ends_at", { ascending: true })
      .limit(48);
    if (!error && data) setRows(data as AuctionRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
    const channel = supabase
      .channel("mercado-auctions-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_bids" }, () => fetchRows())
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_listings" }, () => fetchRows())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRows]);

  const q = (search || "").trim().toLowerCase();
  const isLeiloesQuery = /leil/.test(q); // "leilão", "leilões", "leilao", "leiloes"

  // Leilões ativos (status vivo + ainda não encerrados) para o carrossel padrão.
  const activeRows = useMemo(() => {
    const now = Date.now();
    return rows.filter(r =>
      ["active", "ativo", "published", "live"].includes(r.status) &&
      new Date(r.ends_at).getTime() > now
    );
  }, [rows]);

  // Linhas a exibir: sem busca → ativos; busca "leilão" → TODOS cadastrados;
  // busca por termo → casa por título/cidade (em todos os cadastrados).
  const displayRows = useMemo(() => {
    if (!q) return activeRows;
    if (isLeiloesQuery) return rows;
    return rows.filter(r =>
      r.title.toLowerCase().includes(q) ||
      (r.city || "").toLowerCase().includes(q)
    );
  }, [q, isLeiloesQuery, rows, activeRows]);

  // Não renderiza se não há nada a mostrar (não polui o Mercado / resultados)
  if (!loading && displayRows.length === 0) return null;

  const heading = !q ? "Leilões" : isLeiloesQuery ? "Todos os Leilões" : "Leilões encontrados";
  const countLabel = !q
    ? `${displayRows.length} ativos`
    : `${displayRows.length} ${displayRows.length === 1 ? "resultado" : "resultados"}`;

  return (
    <section className="w-full px-3 sm:px-4 py-4">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🏷️</span>
            <h2 className="text-base sm:text-lg font-black text-gray-900 uppercase tracking-tight">{heading}</h2>
            <span className="text-[10px] font-black text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full uppercase">{countLabel}</span>
          </div>
          <button
            onClick={() => navigate("/leiloes")}
            className="flex items-center gap-1 text-xs font-black text-orange-600 hover:text-orange-700 uppercase tracking-wide"
          >
            Ver todos <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex gap-4 overflow-hidden">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="shrink-0 w-[90vw] sm:w-[340px] md:w-[360px] lg:w-[380px] h-[420px] rounded-2xl bg-[#252B33] animate-pulse" />
            ))}
          </div>
        ) : (
          <HorizontalCarousel cardWidth="w-[90vw] sm:w-[340px] md:w-[360px] lg:w-[380px]" gap="gap-4">
            {[
              ...displayRows.map(a => (
                <MarketAuctionCard key={a.id} listing={a as unknown as AuctionListing} variant="carousel" />
              )),
              <button
                key="ver-todos"
                onClick={() => navigate("/leiloes")}
                className="w-full h-full min-h-[420px] rounded-2xl border-2 border-dashed border-[#323A45] bg-[#252B33]/60 hover:bg-[#252B33] transition-all flex flex-col items-center justify-center gap-2 text-[#FF6A00] font-black text-xs sm:text-sm uppercase"
              >
                <Users className="h-6 w-6" />
                Ver todos os leilões
                <ChevronRight className="h-4 w-4" />
              </button>
            ]}
          </HorizontalCarousel>
        )}
      </div>
    </section>
  );
}
