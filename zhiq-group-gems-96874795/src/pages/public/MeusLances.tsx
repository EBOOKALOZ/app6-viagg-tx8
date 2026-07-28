/**
 * MeusLances — Painel do Comprador: histórico de todos os lances do usuário.
 * Conta única (Supabase Auth): usa o mesmo user.id em todos os módulos.
 * Lê auction_bids (RLS bids_select_all) do usuário logado + auction_listings.
 * Envolvido no MarketLayout (cabeçalho completo do Mercado).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { Gavel, Loader2, Trophy, Flame, Timer, ChevronRight, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";

function formatBRL(v: number | null | undefined) {
  if (v == null || isNaN(v)) return "R$ 0,00";
  return `R$ ${Number(v).toFixed(2).replace(".", ",")}`;
}

interface Row {
  listing_id: string;
  myBid: number;
  count: number;
  lastAt: string;
  listing?: any;
}

export default function MeusLances() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data: bids } = await supabase
        .from("auction_bids")
        .select("id,listing_id,amount_cents,is_winning,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      const listingIds = [...new Set((bids ?? []).map((b: any) => b.listing_id))];
      const listingsMap: Record<string, any> = {};
      if (listingIds.length) {
        const { data: ls } = await supabase
          .from("auction_listings")
          .select("id,title,status,current_bid,starting_bid,ends_at,product_image_url,winner_user_id,total_bids")
          .in("id", listingIds);
        (ls ?? []).forEach((l: any) => { listingsMap[l.id] = l; });
      }

      const grouped: Record<string, Row> = {};
      (bids ?? []).forEach((b: any) => {
        const amt = (b.amount_cents ?? 0) / 100;
        const cur = grouped[b.listing_id];
        if (!cur) {
          grouped[b.listing_id] = { listing_id: b.listing_id, myBid: amt, count: 1, lastAt: b.created_at };
        } else {
          cur.count += 1;
          if (amt > cur.myBid) cur.myBid = amt;
        }
      });
      const list = Object.values(grouped)
        .map((g) => ({ ...g, listing: listingsMap[g.listing_id] }))
        .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
      setRows(list);
      setLoading(false);
    })();
  }, [user?.id]);

  const statusOf = (r: Row): { label: string; cls: string; icon: any } => {
    const l = r.listing;
    if (!l) return { label: "—", cls: "bg-gray-100 text-gray-500", icon: Timer };
    const ended = ["ended", "encerrado", "closed"].includes(l.status) || new Date(l.ends_at) <= new Date();
    if (ended) {
      if (l.winner_user_id && l.winner_user_id === user?.id) return { label: "Você ganhou!", cls: "bg-emerald-100 text-emerald-700", icon: Trophy };
      return { label: "Encerrado", cls: "bg-gray-200 text-gray-500", icon: Timer };
    }
    const current = Number(l.current_bid ?? l.starting_bid ?? 0);
    if (current <= r.myBid) return { label: "Vencendo", cls: "bg-orange-100 text-orange-700", icon: Flame };
    return { label: "Superado", cls: "bg-red-100 text-red-600", icon: Timer };
  };

  return (
    <MarketLayout
      headerChildren={<MarketNavButtons />}
      mainClassName="flex flex-col bg-institutional-yellow"
      blueFooter
      blueFooterLabel="🏷️ Meus Lances"
      myAccountPath="/minha-conta"
    >
      <div className="max-w-3xl mx-auto w-full px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF6A00] to-[#FF8C33] flex items-center justify-center shadow-lg">
            <Gavel className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Meus Lances</h1>
            <p className="text-sm text-gray-600">Todos os leilões em que você deu lance — na sua conta única.</p>
          </div>
        </div>

        {!user?.id ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center space-y-3">
            <LogIn className="h-10 w-10 text-gray-300 mx-auto" />
            <p className="text-gray-600 font-medium">Entre na sua conta para ver seus lances.</p>
            <button onClick={() => navigate("/auth")} className="px-5 py-2.5 rounded-xl bg-[#FF6A00] text-white font-bold text-sm">Entrar</button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-[#FF6A00]" /></div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center space-y-3">
            <Gavel className="h-14 w-14 text-gray-200 mx-auto" />
            <h2 className="text-lg font-bold text-gray-600">Você ainda não deu lances</h2>
            <p className="text-sm text-gray-400">Encontre um leilão e dispute produtos com lances em tempo real.</p>
            <button onClick={() => navigate("/leiloes")} className="mt-2 px-5 py-2.5 rounded-xl bg-[#FF6A00] text-white font-bold text-sm">Ver leilões</button>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const l = r.listing;
              const st = statusOf(r);
              const StIcon = st.icon;
              const img = l?.product_image_url && /^https?:\/\//.test(l.product_image_url) ? l.product_image_url : null;
              return (
                <button
                  key={r.listing_id}
                  onClick={() => navigate(`/leilao/${r.listing_id}`)}
                  className="w-full text-left bg-white rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-100 p-3 flex items-center gap-3"
                >
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-50 shrink-0 flex items-center justify-center">
                    {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <Gavel className="h-6 w-6 text-gray-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 text-sm truncate">{l?.title || "Leilão"}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs">
                      <span className="text-gray-500">Meu lance: <b className="text-gray-900">{formatBRL(r.myBid)}</b></span>
                      {l && <span className="text-gray-400">Atual: {formatBRL(Number(l.current_bid ?? l.starting_bid ?? 0))}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold", st.cls)}>
                        <StIcon className="h-3 w-3" /> {st.label}
                      </span>
                      <span className="text-[10px] text-gray-400">{r.count} lance{r.count > 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-300 shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </MarketLayout>
  );
}
