import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CardDark } from "@/components/ui/dark-card";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { Shield, Clock, Eye, Users, TrendingUp, History, Tag, MapPin, Package, CheckCircle2 } from "lucide-react";
import { format, differenceInMinutes, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AuctionTransparencyCenterProps {
  listingId: string;
}

export function AuctionTransparencyCenter({ listingId }: AuctionTransparencyCenterProps) {
  // 1. Fetch listing details and metrics
  const { data: listing, isLoading: isLoadingListing } = useQuery({
    queryKey: ["transparency-listing", listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auction_listings")
        .select("*")
        .eq("id", listingId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // 2. Fetch bid history for chronological transparency
  const { data: bids = [] } = useQuery({
    queryKey: ["transparency-bids", listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auction_bids")
        .select("id, amount_cents, created_at, user_id")
        .eq("listing_id", listingId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoadingListing || !listing) return null;

  // Índices calculados a partir de dados reais — views_count vem da
  // própria auction_listings (incrementada via RPC increment_auction_view).
  const viewsCount = listing.views_count ?? 0;
  const uniqueBidders = new Set(bids.map(b => b.user_id)).size;
  const popularityIndex = Math.min(100, Math.floor((uniqueBidders * 10) + (viewsCount / 10)));

  const statusMap: Record<string, { label: string; color: string }> = {
    active: { label: "Ativo", color: "text-[#00C58E]" },
    ended: { label: "Encerrado", color: "text-[#8E98A3]" },
    sold: { label: "Arrematado", color: "text-[#FF7A00]" },
    cancelled: { label: "Cancelado", color: "text-red-500" },
  };

  const currentStatus = statusMap[listing.status] || { label: listing.status, color: "text-white" };

  return (
    <CardDark className="p-6 md:p-8 rounded-3xl border border-[#323A45]/60 bg-gradient-to-b from-[#1B1F24] to-[#15181C]">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-xl bg-[#00C58E]/10 border border-[#00C58E]/20">
          <Shield className="w-6 h-6 text-[#00C58E]" />
        </div>
        <div>
          <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">Centro de Transparência</h2>
          <p className="text-sm font-bold text-[#8E98A3]">Informações auditáveis e histórico do leilão</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {/* Bloco 1: Status e Tempo */}
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 rounded-xl bg-[#252B33]">
            <span className="text-xs font-bold text-[#8E98A3] uppercase tracking-wider">Situação Atual</span>
            <span className={`text-sm font-black ${currentStatus.color}`}>{currentStatus.label}</span>
          </div>
          <div className="flex justify-between items-center p-3 rounded-xl bg-[#252B33]">
            <span className="text-xs font-bold text-[#8E98A3] uppercase tracking-wider">Criado em</span>
            <span className="text-sm font-bold text-white">
              {format(parseISO(listing.created_at), "dd/MM/yyyy HH:mm")}
            </span>
          </div>
          <div className="flex justify-between items-center p-3 rounded-xl bg-[#252B33]">
            <span className="text-xs font-bold text-[#8E98A3] uppercase tracking-wider">Última Atual.</span>
            <span className="text-sm font-bold text-white">
              {listing.updated_at ? format(parseISO(listing.updated_at), "dd/MM/yyyy HH:mm") : "-"}
            </span>
          </div>
        </div>

        {/* Bloco 2: Engajamento */}
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 rounded-xl bg-[#252B33]">
            <span className="text-xs font-bold text-[#8E98A3] uppercase tracking-wider flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Visualizações</span>
            <span className="text-sm font-black text-white">{viewsCount}</span>
          </div>
          <div className="flex justify-between items-center p-3 rounded-xl bg-[#252B33]">
            <span className="text-xs font-bold text-[#8E98A3] uppercase tracking-wider flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Participantes</span>
            <span className="text-sm font-black text-white">{uniqueBidders}</span>
          </div>
          <div className="flex justify-between items-center p-3 rounded-xl bg-[#252B33]">
            <span className="text-xs font-bold text-[#8E98A3] uppercase tracking-wider flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Total Lances</span>
            <span className="text-sm font-black text-white">{bids.length}</span>
          </div>
        </div>

        {/* Bloco 3: Índices & Info Produto */}
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 rounded-xl bg-[#252B33] border border-[#FF7A00]/20">
            <span className="text-xs font-bold text-[#FF7A00] uppercase tracking-wider flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Índice Popularidade</span>
            <span className="text-sm font-black text-[#FF7A00]">{popularityIndex}%</span>
          </div>
          <div className="flex justify-between items-center p-3 rounded-xl bg-[#252B33]">
            <span className="text-xs font-bold text-[#8E98A3] uppercase tracking-wider flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> Categoria</span>
            <span className="text-sm font-bold text-white capitalize">{listing.category_slug || "Geral"}</span>
          </div>
          <div className="flex justify-between items-center p-3 rounded-xl bg-[#252B33]">
            <span className="text-xs font-bold text-[#8E98A3] uppercase tracking-wider flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Condição</span>
            <span className="text-sm font-bold text-white capitalize">{listing.item_condition || "Não especificado"}</span>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-[#323A45]/60">
        <h3 className="text-lg font-black text-white mb-4">Histórico Cronológico (Privado)</h3>
        {bids.length > 0 ? (
          <ScrollArea className="h-[200px] w-full rounded-xl border border-[#323A45] bg-[#1A1F24] p-4">
            <div className="space-y-4">
              {bids.map((bid, i) => (
                <div key={bid.id} className="flex items-center justify-between relative pl-4 border-l-2 border-[#323A45]">
                  <div className="absolute w-2 h-2 rounded-full bg-[#00C58E] -left-[5px] top-1.5" />
                  <div>
                    <p className="text-sm font-bold text-white">Lance Confirmado</p>
                    <p className="text-xs font-medium text-[#8E98A3]">
                      Usuário ***{bid.user_id.substring(bid.user_id.length - 4)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-[#00C58E]">
                      {formatCurrencyBRL(bid.amount_cents / 100)}
                    </p>
                    <p className="text-xs font-medium text-[#8E98A3]">
                      {format(parseISO(bid.created_at), "dd/MM HH:mm:ss")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="p-6 rounded-xl bg-[#252B33] text-center">
            <p className="text-sm font-bold text-[#8E98A3]">Nenhum lance registrado até o momento.</p>
          </div>
        )}
      </div>
    </CardDark>
  );
}
