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
import { Gavel, Timer, Flame, MapPin, Eye, ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";

function formatBRL(value: number | undefined | null) {
  if (value == null || isNaN(Number(value))) return "R$ 0,00";
  const v = Number(value);
  // valores de auction_listings estão em reais
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

function normalizeImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const t = url.trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) return null;
  return t;
}

// ── Countdown ao vivo (1s) ──
function useCountdown(endsAt: string) {
  const calc = useCallback(() => {
    const diff = new Date(endsAt).getTime() - Date.now();
    if (diff <= 0) return { ended: true, total: 0, label: "Encerrado" };
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const label = d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
    return { ended: false, total: diff, label };
  }, [endsAt]);
  const [state, setState] = useState(calc);
  useEffect(() => {
    const tick = () => setState(calc());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [calc]);
  return state;
}

interface AuctionRow {
  id: string;
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

function AuctionCard({ a, hot, onClick }: { a: AuctionRow; hot: boolean; onClick: () => void }) {
  const { ended, total, label } = useCountdown(a.ends_at);
  const urgent = !ended && total < 3600000; // < 1h
  const img = normalizeImageUrl(a.product_image_url);
  const price = a.current_bid ?? a.starting_bid ?? 0;

  return (
    <button
      onClick={onClick}
      className="shrink-0 w-[280px] sm:w-[300px] text-left bg-white rounded-2xl shadow-md hover:shadow-xl transition-all border border-gray-100 overflow-hidden group flex flex-col"
    >
      <div className="relative bg-gray-50 aspect-[16/10] overflow-hidden">
        {img ? (
          <img src={img} alt={a.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Gavel className="h-10 w-10 text-gray-200" /></div>
        )}
        {/* ─── LOGO DA PLATAFORMA (topo-esquerdo — identidade visual) ─── */}
        <img src="/viagg-logo.png" alt="Viagg-TX8" width={28} height={28} loading="lazy" decoding="async" className="absolute top-2 left-2 z-20 h-7 w-7 rounded-lg object-cover shadow-md ring-1 ring-white/20 pointer-events-none" />
        {/* Watermark central VX (marca / anti-print) */}
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-[6]">
          <span className="font-black tracking-tighter text-white/[0.08] mix-blend-overlay text-4xl drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)]">VX</span>
        </span>
        {/* badge tipo (movido p/ baixo-esquerda p/ não colidir com o logo) */}
        <span className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/90 text-white text-[10px] font-bold uppercase backdrop-blur-sm">
          <Gavel className="h-3 w-3" /> Leilão
        </span>
        {hot && (
          <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black uppercase animate-pulse">
            <Flame className="h-3 w-3" /> Em Alta
          </span>
        )}
        {/* cronômetro */}
        <span className={cn(
          "absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono backdrop-blur-sm",
          ended ? "bg-gray-600/90 text-white" : urgent ? "bg-red-500/90 text-white animate-pulse" : "bg-emerald-600/90 text-white"
        )}>
          <Timer className="h-3 w-3" /> {label}
        </span>
      </div>

      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <h3 className="font-bold text-gray-800 text-sm leading-tight line-clamp-2 min-h-[36px]">{a.title}</h3>
        {a.description && (
          <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">{a.description}</p>
        )}
        <p className="text-lg font-black text-gray-900 leading-none">{formatBRL(price)}</p>
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          <span className="flex items-center gap-1"><Gavel className="h-3 w-3" /> {a.total_bids || 0}</span>
          <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {a.watchers_count || 0}</span>
          {a.city && <span className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3" /> {a.city}</span>}
        </div>
        <span className={cn(
          "mt-1 w-full py-2 rounded-xl text-[11px] font-black text-white text-center shadow",
          ended ? "bg-gray-400" : "bg-gradient-to-r from-orange-500 to-amber-500"
        )}>
          {ended ? "Encerrado" : "🔨 Dar Lance"}
        </span>
      </div>
    </button>
  );
}

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
      .select("id, title, description, product_image_url, starting_bid, current_bid, city, ends_at, total_bids, watchers_count, status, listing_type")
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

  // "Em Alta": os 3 com mais lances (e pelo menos 1 lance)
  const hotIds = useMemo(() => {
    return new Set(
      [...displayRows].filter(r => (r.total_bids || 0) > 0)
        .sort((a, b) => (b.total_bids || 0) - (a.total_bids || 0))
        .slice(0, 3)
        .map(r => r.id)
    );
  }, [displayRows]);

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
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="shrink-0 w-[280px] sm:w-[300px] h-[260px] rounded-2xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
            {displayRows.map(a => (
              <div key={a.id} className="snap-start">
                <AuctionCard a={a} hot={hotIds.has(a.id)} onClick={() => navigate(`/leilao/${a.id}`)} />
              </div>
            ))}
            {/* Card "ver todos" no fim */}
            <button
              onClick={() => navigate("/leiloes")}
              className="shrink-0 w-[160px] rounded-2xl border-2 border-dashed border-orange-300 bg-orange-50/60 hover:bg-orange-100 transition-all flex flex-col items-center justify-center gap-2 text-orange-600 font-black text-xs uppercase"
            >
              <Users className="h-6 w-6" />
              Ver todos os leilões
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
