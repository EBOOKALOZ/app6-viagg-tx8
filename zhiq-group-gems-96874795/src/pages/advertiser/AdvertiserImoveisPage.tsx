/**
 * AdvertiserImoveisPage — /anunciante/imoveis
 *
 * Painel RESUMIDO do anunciante de imóveis. O card "Meus imóveis" agora LISTA
 * todos os imóveis da própria conta (owner_user_id), com miniatura, status e
 * atalho de edição — não é mais só um link.
 */
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getListingImageUrl } from "@/lib/real-estate/mediaUtils";
import { cn } from "@/lib/utils";
import { Building2, PlusCircle, List, MessageSquare, Coins, Pencil, Loader2, ArrowRight, Eye, type LucideIcon } from "lucide-react";

interface Action { to: string; icon: LucideIcon; title: string; desc: string; }

const ACTIONS: Action[] = [
  { to: "/anunciante/imoveis/anuncios/novo/imovel", icon: PlusCircle, title: "Anunciar imóvel", desc: "Publique um novo imóvel" },
  { to: "/anunciante/imoveis/mensagens", icon: MessageSquare, title: "Interessados", desc: "Mensagens e contatos recebidos" },
  { to: "/anunciante/imoveis/creditos", icon: Coins, title: "Créditos", desc: "Compre créditos p/ desbloquear contatos" },
];

const TYPE_LABEL: Record<string, string> = {
  sitio: "Sítio", chacara: "Chácara", lote: "Lote Urbano", fazenda: "Fazenda", terreno: "Terreno",
};

export default function AdvertiserImoveisPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: imoveis = [], isLoading } = useQuery({
    queryKey: ["imoveis-painel-lista", user?.id],
    enabled: !!user?.id,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data } = await (supabase.from("real_estate_listings") as any)
        .select("id, title, property_type, visibility_status, price_brl, city, state, created_at")
        .eq("owner_user_id", user!.id)
        .order("created_at", { ascending: false });
      const list = data || [];
      return Promise.all(list.map(async (im: any) => {
        const { data: media } = await (supabase.from("real_estate_media") as any)
          .select("original_storage_path, thumb_masked_storage_path")
          .eq("listing_id", im.id)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        const hasThumb = !!media?.thumb_masked_storage_path;
        const path = media?.thumb_masked_storage_path || media?.original_storage_path;
        return { ...im, thumb: path ? getListingImageUrl(path, hasThumb ? 'public' : 'original') : null };
      }));
    },
  });

  // Saldo atual da carteira de IMÓVEIS (pode ficar negativo = dívida).
  const { data: reBalance = 0 } = useQuery({
    queryKey: ["imoveis-painel-saldo", user?.id],
    enabled: !!user?.id,
    refetchInterval: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data } = await (supabase.from("real_estate_credit_balances") as any)
        .select("available_credits")
        .eq("owner_user_id", user!.id)
        .maybeSingle();
      return Number((data as any)?.available_credits ?? 0);
    },
  });

  // Visitas REAIS por anúncio (cliques registrados no ledger — evento listing_click).
  // O view_count das listagens não é incrementado; a fonte real é o ledger.
  const { data: visitMap = {} } = useQuery({
    queryKey: ["imoveis-visitas-map", user?.id],
    enabled: !!user?.id,
    refetchInterval: 20_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data } = await (supabase.from("real_estate_credit_ledger") as any)
        .select("listing_id, metadata")
        .eq("owner_user_id", user!.id)
        .limit(5000);
      const map: Record<string, number> = {};
      (data || []).forEach((e: any) => {
        if (e?.metadata?.event === "listing_click" && e.listing_id) {
          map[e.listing_id] = (map[e.listing_id] || 0) + 1;
        }
      });
      return map as Record<string, number>;
    },
  });

  // Mensagens AGUARDANDO desbloqueio (leads de imóvel pendentes).
  const { data: pendingMsgs = 0 } = useQuery({
    queryKey: ["imoveis-painel-pendentes", user?.id],
    enabled: !!user?.id,
    refetchInterval: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count } = await (supabase.from("advertiser_contact_intentions") as any)
        .select("id", { count: "exact", head: true })
        .eq("advertiser_user_id", user!.id)
        .eq("listing_module", "real_estate")
        .eq("status", "pending_unlock");
      return count || 0;
    },
  });

  return (
    <div className="w-full max-w-3xl mx-auto px-1 sm:px-4 py-6 space-y-6 min-w-0">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-black text-zinc-900">Painel de Imóveis</h1>
          <p className="text-sm text-zinc-500">Anuncie seus imóveis e fale com os interessados</p>
        </div>
      </div>

      {/* ── Card "Meus imóveis": lista TODOS os imóveis da conta ── */}
      <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-zinc-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <List className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-zinc-900 text-sm">Meus imóveis ({imoveis.length})</p>
              <p className="text-xs text-zinc-500">Veja e edite seus anúncios</p>
            </div>
          </div>
          <Link
            to="/anunciante/imoveis/meus-anuncios"
            className="text-[11px] font-black uppercase tracking-wide text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg px-3 py-2 flex items-center gap-1 shrink-0"
          >
            Gerenciar <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-10 px-4 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando seus imóveis...
          </div>
        ) : imoveis.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-zinc-400">Você ainda não tem imóveis cadastrados.</p>
            <button
              onClick={() => navigate("/anunciante/imoveis/anuncios/novo/imovel")}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl px-4 py-2"
            >
              <PlusCircle className="w-4 h-4" /> Anunciar imóvel
            </button>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {imoveis.map((im: any) => (
              <div key={im.id} className="flex items-center gap-3 p-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-100 shrink-0 flex items-center justify-center">
                  {im.thumb ? (
                    <img src={im.thumb} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  ) : (
                    <Building2 className="w-5 h-5 text-zinc-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-zinc-900 text-sm truncate">{im.title || "Sem título"}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    {TYPE_LABEL[im.property_type] || im.property_type || "Imóvel"}
                    {" · "}{[im.city, im.state].filter(Boolean).join("/")}
                    {" · "}{im.visibility_status}
                  </p>
                </div>
                <span className="text-sm font-black text-emerald-600 shrink-0">
                  {im.price_brl ? `R$ ${Number(im.price_brl).toLocaleString("pt-BR")}` : "—"}
                </span>
                <button
                  onClick={() => navigate(`/anunciante/imoveis/anuncios/editar/imovel/${im.id}`)}
                  title="Editar"
                  className="p-2 rounded-lg text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 shrink-0"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Visitas (visualizações por anúncio) ── */}
      <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-zinc-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Eye className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-zinc-900 text-sm">Visitas dos seus anúncios</p>
              <p className="text-xs text-zinc-500">Total de visualizações recebidas</p>
            </div>
          </div>
          <span className="text-2xl font-black text-emerald-600 tabular-nums shrink-0">
            {Object.values(visitMap).reduce((s: number, n: any) => s + Number(n || 0), 0)}
          </span>
        </div>
        {imoveis.length === 0 ? (
          <p className="p-4 text-sm text-zinc-400 text-center">Sem visitas ainda — publique um imóvel para começar.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {imoveis.map((im: any) => (
              <div key={im.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <p className="text-sm text-zinc-700 truncate">{im.title || TYPE_LABEL[im.property_type] || "Imóvel"}</p>
                <span className="text-xs font-black text-zinc-500 shrink-0 inline-flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" /> {Number(visitMap[im.id] || 0)}
                </span>
              </div>
            ))}
          </div>
        )}
        {/* Saldo atual de créditos */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-50 border-t border-zinc-100">
          <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-emerald-500" /> Saldo atual de créditos
          </span>
          <span className={cn("text-lg font-black tabular-nums", reBalance < 0 ? "text-red-600" : "text-emerald-600")}>{reBalance} cr</span>
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
                className="relative flex flex-col items-center text-center gap-2 sm:flex-row sm:items-start sm:text-left sm:gap-3 p-4 rounded-2xl border border-zinc-200 bg-white hover:border-emerald-300 hover:shadow-sm transition-all h-full"
              >
                {isCreditsCard && reBalance > 0 && (
                  <span className="absolute top-2 right-2 text-[19px] font-black tracking-tight text-emerald-600">
                    {reBalance} cr
                  </span>
                )}
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex flex-col items-center sm:items-start flex-1">
                  <p className="font-bold text-zinc-900 text-sm">{a.title}</p>
                  <p className="text-xs text-zinc-500 leading-snug text-left mt-0.5">{a.desc}</p>
                  {isCreditsCard && reBalance <= 0 && (
                    <span className="mt-1.5 text-[19px] font-black tracking-tight text-red-600">
                      {reBalance} cr
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

      <div className="flex items-start gap-2 bg-emerald-50 rounded-2xl p-3 border border-emerald-100">
        <Coins className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
        <p className="text-[11px] text-emerald-700 leading-relaxed">
          Para falar com um interessado, você desbloqueia o contato dele usando créditos.
          O consumo só entra na conta no desbloqueio — e ao adquirir um pacote os créditos são abatidos.
        </p>
      </div>
    </div>
  );
}
