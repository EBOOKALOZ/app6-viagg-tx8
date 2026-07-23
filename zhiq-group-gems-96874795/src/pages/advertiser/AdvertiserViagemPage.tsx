import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { resolveTravelMediaRow } from "@/lib/viagem/travelMedia";
import { cn } from "@/lib/utils";
import { Plane, PlusCircle, List, MessageSquare, Coins, Wallet, Pencil, Loader2, ArrowRight, Eye, TrendingUp, Heart } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Action { to: string; icon: LucideIcon; title: string; desc: string; }

const ACTIONS: Action[] = [
  { to: "/anunciante/viagens/anuncios/novo/viagem", icon: PlusCircle, title: "Anunciar viagem", desc: "Publique um novo pacote" },
  { to: "/anunciante/viagens/mensagens", icon: MessageSquare, title: "Interessados", desc: "Mensagens e contatos recebidos" },
  { to: "/anunciante/carteira", icon: Wallet, title: "Carteira", desc: "Saldo oficial p/ desbloquear contatos" },
];

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AdvertiserViagemPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: viagens = [], isLoading } = useQuery({
    queryKey: ["viagens-painel-lista", user?.id],
    enabled: !!user?.id,
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data } = await (supabase.from("travel_listings") as any)
        .select("id, title, category, destination, visibility_status, entry_price, price_per_person, city, state, is_featured, created_at")
        .eq("owner_user_id", user!.id)
        .order("created_at", { ascending: false });
      const list = (data || []) as any[];
      if (list.length === 0) return [];
      // Mídia de todos os anúncios em UMA consulta (.in) — sem N+1.
      const ids = list.map((s: any) => s.id);
      const { data: mediaRows } = await (supabase.from("travel_media") as any)
        .select("listing_id, original_storage_path, public_masked_storage_path, sort_order")
        .in("listing_id", ids)
        .order("sort_order", { ascending: true });
      const thumbMap = new Map<string, string>();
      for (const m of (mediaRows as any[]) || []) {
        if (!thumbMap.has(m.listing_id)) {
          const url = resolveTravelMediaRow(m);
          if (url) thumbMap.set(m.listing_id, url);
        }
      }
      return list.map((s: any) => ({ ...s, thumb: thumbMap.get(s.id) || null }));
    },
  });

  // Saldo OFICIAL em R$ (carteira pay_* — a mesma debitada no desbloqueio
  // de contato a 2%). O saldo legado em créditos foi aposentado (20260723).
  const { data: saldoCents = 0 } = useQuery({
    queryKey: ["viagens-painel-saldo-wallet", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30000,
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data } = await (supabase.from("pay_financial_accounts") as any)
        .select("balance_cents")
        .eq("owner_user_id", user!.id)
        .eq("kind", "customer_wallet")
        .maybeSingle();
      return Number((data as any)?.balance_cents ?? 0);
    },
  });

  // Métricas de visualizações/interesses: travel_listing_click_log
  // (telemetria sem débito — travel_track_event, 20260723).
  const { data: stats = { visits: {} as Record<string, number>, interests: {} as Record<string, number> } } = useQuery({
    queryKey: ["viagens-visitas-map", user?.id],
    enabled: !!user?.id && viagens.length > 0,
    refetchInterval: 30000,
    queryFn: async () => {
      const ids = (viagens as any[]).map((s) => s.id);
      const { data } = await (supabase.from("travel_listing_click_log") as any)
        .select("listing_id, event_type")
        .in("listing_id", ids)
        .limit(5000);
      const visits: Record<string, number> = {};
      const interests: Record<string, number> = {};
      ((data as any[]) || []).forEach((e: any) => {
        if (e.event_type === "interest_click") interests[e.listing_id] = (interests[e.listing_id] || 0) + 1;
        else visits[e.listing_id] = (visits[e.listing_id] || 0) + 1;
      });
      return { visits, interests };
    },
  });

  const { data: pendingMsgs = 0 } = useQuery({
    queryKey: ["viagens-painel-pendentes", user?.id],
    enabled: !!user?.id,
    refetchInterval: 15000,
    queryFn: async () => {
      const { count } = await (supabase.from("advertiser_contact_intentions") as any)
        .select("id", { count: "exact", head: true })
        .eq("advertiser_user_id", user!.id)
        .eq("listing_module", "travel")
        .eq("status", "pending_unlock");
      return count || 0;
    },
  });

  const visitMap = stats.visits;
  const interestMap = stats.interests;

  return (
    <div className="w-full max-w-3xl mx-auto px-1 sm:px-4 py-6 space-y-6 min-w-0">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0">
          <img src="/viagg-logo.png" alt="Viagg" className="w-full h-full object-contain" />
        </div>
        <div>
          <h1 className="text-xl font-black text-zinc-900">Painel de Viagens</h1>
          <p className="text-sm text-zinc-500">Anuncie seus pacotes e fale com os interessados</p>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-zinc-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
              <List className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-zinc-900 text-sm">Meus anuncios ({viagens.length})</p>
              <p className="text-xs text-zinc-500">Veja e edite seus pacotes</p>
            </div>
          </div>
          <Link to="/anunciante/viagens/meus-anuncios" className="text-[11px] font-black uppercase tracking-wide text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg px-3 py-2 flex items-center gap-1 shrink-0">
            Gerenciar <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 py-10 px-4 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
          </div>
        ) : viagens.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-zinc-400">Voce ainda nao tem viagens cadastradas.</p>
            <button onClick={() => navigate("/anunciante/viagens/anuncios/novo/viagem")} className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm rounded-xl px-4 py-2">
              <PlusCircle className="w-4 h-4" /> Anunciar viagem
            </button>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {viagens.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 p-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-100 shrink-0 flex items-center justify-center">
                  {s.thumb ? <img src={s.thumb} alt="" className="w-full h-full object-cover" /> : <Plane className="w-5 h-5 text-zinc-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-zinc-900 text-sm truncate">{s.title || "Sem titulo"}</p>
                  <p className="text-xs text-zinc-500 truncate">{s.category}{s.destination && ` - ${s.destination}`} - {[s.city, s.state].filter(Boolean).join("/")} - {s.visibility_status}{s.is_featured && " - destaque"}</p>
                </div>
                <span className="text-sm font-black text-sky-600 shrink-0">
                  {s.entry_price?.trim() || (s.price_per_person ? `R$ ${Number(s.price_per_person).toLocaleString("pt-BR")}/ pessoa` : "Consulte")}
                </span>
                <button onClick={() => navigate(`/anunciante/viagens/anuncios/editar/viagem/${s.id}`)} className="p-2 rounded-lg text-zinc-400 hover:text-sky-600 hover:bg-sky-50 shrink-0">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-zinc-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-zinc-900 text-sm">Desempenho dos anuncios</p>
              <p className="text-xs text-zinc-500">Visualizacoes e Interesses</p>
            </div>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className="text-xl font-black text-sky-600 tabular-nums flex items-center gap-1.5"><Eye className="w-4 h-4" /> {Object.values(visitMap).reduce((s: number, n: any) => s + Number(n || 0), 0)}</span>
            <span className="text-sm font-bold text-orange-500 tabular-nums flex items-center gap-1"><Heart className="w-3 h-3" /> {Object.values(interestMap).reduce((s: number, n: any) => s + Number(n || 0), 0)}</span>
          </div>
        </div>
        {viagens.length === 0 ? <p className="p-4 text-sm text-zinc-400 text-center">Publique uma viagem para comecar.</p> : (
          <div className="divide-y divide-zinc-100">
            {viagens.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <p className="text-sm text-zinc-700 truncate">{s.title || "Viagem"}</p>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs font-black text-zinc-500 inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {Number(visitMap[s.id] || 0)}</span>
                  <span className="text-xs font-black text-orange-500 inline-flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> {Number(interestMap[s.id] || 0)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-50 border-t border-zinc-100">
          <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5 text-sky-500" /> Saldo da carteira</span>
          <span className={cn("text-lg font-black tabular-nums", saldoCents < 0 ? "text-red-600" : "text-sky-600")}>{brl(saldoCents)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          const isWalletCard = a.title === "Carteira";
          return (
            <div key={a.to}>
              <Link to={a.to} className="flex flex-col items-center text-center gap-2 sm:flex-row sm:items-start sm:text-left sm:gap-3 p-4 rounded-2xl border border-zinc-200 bg-white hover:border-sky-300 hover:shadow-sm transition-all h-full">
                <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></div>
                <div className="min-w-0 flex flex-col items-center sm:items-start flex-1">
                  <p className="font-bold text-zinc-900 text-sm">{a.title}</p>
                  {!isWalletCard && <p className="text-xs text-zinc-500 leading-snug text-left mt-0.5">{a.desc}</p>}
                  {isWalletCard && <span className={cn("mt-0.5 text-[22px] font-black tracking-tight leading-none", saldoCents > 0 ? "text-emerald-600" : "text-red-600")}>{brl(saldoCents)}</span>}
                  {a.to.includes("/mensagens") && pendingMsgs > 0 && (
                    <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">
                      <MessageSquare className="w-3.5 h-3.5" /> <span className="text-[15px] leading-none">{pendingMsgs}</span> aguardando
                    </span>
                  )}
                </div>
              </Link>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-2 bg-sky-50 rounded-2xl p-3 border border-sky-100">
        <Coins className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
        <p className="text-[11px] text-sky-700 leading-relaxed">
          Para falar com um interessado, voce desbloqueia o contato dele pela carteira oficial:
          e cobrado um percentual do valor anunciado (em reais), direto do seu saldo.
        </p>
      </div>
    </div>
  );
}
