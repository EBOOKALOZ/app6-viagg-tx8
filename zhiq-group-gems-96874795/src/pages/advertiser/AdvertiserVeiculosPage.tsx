/**
 * AdvertiserVeiculosPage — /anunciante/veiculos
 *
 * Painel RESUMIDO do anunciante de veículos. Espelha AdvertiserImoveisPage,
 * porém com tema azul e SEM carteira própria (veículos não têm saldo dedicado;
 * o custo de desbloqueio é por anúncio). Lista os veículos da conta com
 * miniatura, status e atalho de edição.
 */
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getListingImageUrl } from "@/lib/real-estate/mediaUtils";
import { cn } from "@/lib/utils";
import { Car, PlusCircle, List, MessageSquare, Coins, Pencil, Loader2, ArrowRight, Eye, TrendingUp, Heart, type LucideIcon } from "lucide-react";

interface Action { to: string; icon: LucideIcon; title: string; desc: string; }

const ACTIONS: Action[] = [
  { to: "/anunciante/veiculos/anuncios/novo/veiculo", icon: PlusCircle, title: "Anunciar veículo", desc: "Publique um novo veículo" },
  { to: "/anunciante/veiculos/mensagens", icon: MessageSquare, title: "Interessados", desc: "Mensagens e contatos recebidos" },
  { to: "/anunciante/veiculos/creditos", icon: Coins, title: "Créditos", desc: "Compre créditos p/ desbloquear contatos" },
];

const TYPE_LABEL: Record<string, string> = {
  carro: "Carro", moto: "Moto", barco: "Barco", utilitario: "Utilitário",
};

export default function AdvertiserVeiculosPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: veiculos = [], isLoading } = useQuery({
    queryKey: ["veiculos-painel-lista", user?.id],
    enabled: !!user?.id,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data } = await (supabase.from("vehicle_listings") as any)
        .select("id, title, vehicle_type, brand, model, year, visibility_status, price_brl, city, state, view_count, created_at")
        .eq("owner_user_id", user!.id)
        .order("created_at", { ascending: false });
      const list = data || [];
      return Promise.all(list.map(async (v: any) => {
        const { data: media } = await (supabase.from("vehicle_media") as any)
          .select("original_storage_path, public_masked_storage_path")
          .eq("listing_id", v.id)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        const hasThumb = !!media?.public_masked_storage_path && media.public_masked_storage_path !== media.original_storage_path;
        const path = hasThumb ? media.public_masked_storage_path : media?.original_storage_path;
        return { ...v, thumb: path ? getListingImageUrl(path, hasThumb ? 'public' : 'original') : null };
      }));
    },
  });

  // Saldo de créditos PRÓPRIO de veículos (vehicle_credit_balances por owner_user_id).
  // NÃO usa a carteira do anunciante/marketplace (que é compartilhada com a loja).
  // Fica 0 até a carteira de veículos existir no backend.
  const { data: saldo = 0 } = useQuery({
    queryKey: ["veiculos-painel-saldo", user?.id],
    enabled: !!user?.id,
    refetchInterval: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data } = await (supabase.from("vehicle_credit_balances" as any)
        .select("available_credits").eq("owner_user_id", user!.id).maybeSingle()) as any;
      return Number((data as any)?.available_credits ?? 0);
    },
  });

  // Visitas e Interesses REAIS por anúncio (eventos no ledger de veículos).
  const { data: stats = { visits: {} as Record<string, number>, interests: {} as Record<string, number> } } = useQuery({
    queryKey: ["veiculos-visitas-map", user?.id],
    enabled: !!user?.id,
    refetchInterval: 20_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data } = await (supabase.from("vehicle_credit_ledger" as any)
        .select("listing_id, metadata").eq("owner_user_id", user!.id).limit(5000)) as any;
      const visits: Record<string, number> = {};
      const interests: Record<string, number> = {};
      (data || []).forEach((e: any) => {
        if (e?.metadata?.event === "listing_click" && e.listing_id) {
          visits[e.listing_id] = (visits[e.listing_id] || 0) + 1;
        }
        if (e?.metadata?.event === "interest_click" && e.listing_id) {
          interests[e.listing_id] = (interests[e.listing_id] || 0) + 1;
        }
      });
      return { visits, interests };
    },
  });

  const visitMap = stats.visits;
  const interestMap = stats.interests;

  // Mensagens AGUARDANDO desbloqueio (leads de veículo pendentes).
  const { data: pendingMsgs = 0 } = useQuery({
    queryKey: ["veiculos-painel-pendentes", user?.id],
    enabled: !!user?.id,
    refetchInterval: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count } = await (supabase.from("advertiser_contact_intentions") as any)
        .select("id", { count: "exact", head: true })
        .eq("advertiser_user_id", user!.id)
        .eq("listing_module", "vehicles")
        .eq("status", "pending_unlock");
      return count || 0;
    },
  });

  return (
    <div className="w-full max-w-3xl mx-auto px-1 sm:px-4 py-6 space-y-6 min-w-0">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
          <Car className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-black text-zinc-900">Painel de Veículos</h1>
          <p className="text-sm text-zinc-500">Anuncie seus veículos e fale com os interessados</p>
        </div>
      </div>

      {/* ── Card "Meus veículos": lista TODOS os veículos da conta ── */}
      <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-zinc-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <List className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-zinc-900 text-sm">Meus veículos ({veiculos.length})</p>
              <p className="text-xs text-zinc-500">Veja e edite seus anúncios</p>
            </div>
          </div>
          <Link
            to="/anunciante/veiculos/meus-anuncios"
            className="text-[11px] font-black uppercase tracking-wide text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-2 flex items-center gap-1 shrink-0"
          >
            Gerenciar <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-10 px-4 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando seus veículos...
          </div>
        ) : veiculos.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-zinc-400">Você ainda não tem veículos cadastrados.</p>
            <button
              onClick={() => navigate("/anunciante/veiculos/anuncios/novo/veiculo")}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl px-4 py-2"
            >
              <PlusCircle className="w-4 h-4" /> Anunciar veículo
            </button>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {veiculos.map((v: any) => (
              <div key={v.id} className="flex items-center gap-3 p-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-100 shrink-0 flex items-center justify-center">
                  {v.thumb ? (
                    <img src={v.thumb} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  ) : (
                    <Car className="w-5 h-5 text-zinc-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-zinc-900 text-sm truncate">{v.title || [v.brand, v.model].filter(Boolean).join(" ") || "Sem título"}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    {TYPE_LABEL[v.vehicle_type] || v.vehicle_type || "Veículo"}
                    {v.year ? ` · ${v.year}` : ""}
                    {" · "}{[v.city, v.state].filter(Boolean).join("/")}
                    {" · "}{v.visibility_status}
                  </p>
                </div>
                <span className="text-sm font-black text-blue-600 shrink-0">
                  {v.price_brl ? `R$ ${Number(v.price_brl).toLocaleString("pt-BR")}` : "—"}
                </span>
                <button
                  onClick={() => navigate(`/anunciante/veiculos/anuncios/editar/veiculo/${v.id}`)}
                  title="Editar"
                  className="p-2 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50 shrink-0"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Desempenho (visualizações e interesses por anúncio) ── */}
      <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-zinc-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-zinc-900 text-sm">Desempenho dos anúncios</p>
              <p className="text-xs text-zinc-500">Visualizações e Interesses</p>
            </div>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className="text-xl font-black text-blue-600 tabular-nums flex items-center gap-1.5" title="Total de visitas">
              <Eye className="w-4 h-4" /> {Object.values(visitMap).reduce((s: number, n: any) => s + Number(n || 0), 0)}
            </span>
            <span className="text-sm font-bold text-orange-500 tabular-nums flex items-center gap-1" title="Total de interesses">
              <Heart className="w-3 h-3" /> {Object.values(interestMap).reduce((s: number, n: any) => s + Number(n || 0), 0)}
            </span>
          </div>
        </div>
        {veiculos.length === 0 ? (
          <p className="p-4 text-sm text-zinc-400 text-center">Sem dados ainda — publique um veículo para começar.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {veiculos.map((v: any) => (
              <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <p className="text-sm text-zinc-700 truncate">{v.title || [v.brand, v.model].filter(Boolean).join(" ") || "Veículo"}</p>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs font-black text-zinc-500 inline-flex items-center gap-1" title="Visitas">
                    <Eye className="w-3.5 h-3.5" /> {Number(visitMap[v.id] || 0)}
                  </span>
                  <span className="text-xs font-black text-orange-500 inline-flex items-center gap-1" title="Interesses">
                    <Heart className="w-3.5 h-3.5" /> {Number(interestMap[v.id] || 0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Saldo atual de créditos */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-50 border-t border-zinc-100">
          <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-blue-500" /> Saldo atual de créditos
          </span>
          <span className={cn("text-lg font-black tabular-nums", saldo < 0 ? "text-red-600" : "text-blue-600")}>{saldo} cr</span>
        </div>
      </div>

      {/* ── Demais atalhos ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          const isCreditsCard = a.title === "Créditos";
          return (
            <div key={a.to} className="relative mt-3 sm:mt-0">
              <Link
                to={a.to}
                className="relative flex flex-col items-center text-center gap-2 sm:flex-row sm:items-start sm:text-left sm:gap-3 p-4 rounded-2xl border border-zinc-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all h-full"
              >
                {isCreditsCard && saldo > 0 && (
                  <span className="absolute top-2 right-2 text-[19px] font-black tracking-tight text-emerald-600">
                    {saldo} cr
                  </span>
                )}
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex flex-col items-center sm:items-start flex-1">
                  <p className="font-bold text-zinc-900 text-sm">{a.title}</p>
                  <p className="text-xs text-zinc-500 leading-snug text-left mt-0.5">{a.desc}</p>
                  {isCreditsCard && saldo <= 0 && (
                    <span className="mt-1.5 text-[19px] font-black tracking-tight text-red-600">
                      {saldo} cr
                    </span>
                  )}
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

      <div className="flex items-start gap-2 bg-blue-50 rounded-2xl p-3 border border-blue-100">
        <Coins className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-[11px] text-blue-700 leading-relaxed">
          Para falar com um interessado, você desbloqueia o contato dele usando créditos.
          O consumo só entra na conta no desbloqueio — e ao adquirir um pacote os créditos são abatidos.
        </p>
      </div>
    </div>
  );
}
