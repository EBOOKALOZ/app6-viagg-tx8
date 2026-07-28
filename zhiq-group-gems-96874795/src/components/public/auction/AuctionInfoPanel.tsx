/**
 * AuctionInfoPanel — painel "Informações do Produto" da página de detalhes do leilão.
 *
 * Preenche a área abaixo da descrição com blocos informativos carregados do banco:
 *   📍 Localização · 🚚 Entrega · 📋 Especificações · 📦 Informações do Anúncio ·
 *   📊 Dados do Leilão · 🛡 Garantias · 🏪 Informações da Loja
 *
 * Regras: nenhum dado fictício — campo sem valor no banco fica oculto; seção sem
 * nenhum campo não é renderizada. Formas de pagamento não existem no schema do
 * vendedor, então o bloco 💳 não é exibido.
 *
 * Também exporta:
 *   useAuctionStoreInfo — fonte única da loja do leilão (evita query duplicada);
 *   AuctionCtaRow — "Dar Lance Agora" + "Tenho Interesse" (observar via
 *     auction_watchers, RLS de escrita própria) para o rodapé dos blocos.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Gavel, Store, ShieldCheck, CheckCircle2, Eye, Loader2, Award,
} from "lucide-react";
import { toast } from "sonner";
import { differenceInMonths } from "date-fns";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { CardInfo } from "@/components/ui/dark-card";
import { useAuth } from "@/contexts/AuthContext";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { registerResumeHandler } from "@/components/auth/AuthGateProvider";
import type { AuctionListing } from "@/hooks/useAuctions";

// ─── Loja do leilão (fonte única — reutilizada pelas páginas de detalhe) ─────

export interface AuctionStoreInfo {
  id: string;
  nome: string | null;
  cidade: string | null;
  estado: string | null;
  bairro: string | null;
  logo_url: string | null;
  created_at: string | null;
  status: string | null;
}

export function useAuctionStoreInfo(storeId?: string | null) {
  return useQuery<AuctionStoreInfo | null>({
    queryKey: ["auction-store-info", storeId],
    queryFn: async () => {
      if (!storeId) return null;
      const { data } = await supabase
        .from("merchant_stores")
        .select("id, nome_loja, store_name, cidade, city, estado, region, bairro, neighborhood, logo_url, created_at, status")
        .eq("id", storeId)
        .maybeSingle();
      if (!data) return null;
      const s = data as any;
      return {
        id: s.id,
        nome: s.nome_loja || s.store_name || null,
        cidade: s.cidade || s.city || null,
        estado: s.estado || s.region || null,
        bairro: s.bairro || s.neighborhood || null,
        logo_url: s.logo_url || null,
        created_at: s.created_at || null,
        status: s.status || null,
      };
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Helpers de exibição ─────────────────────────────────────────────────────

const CONDITION_LABEL: Record<string, string> = {
  novo: "Novo",
  usado: "Usado",
  seminovo: "Seminovo",
  recondicionado: "Recondicionado",
};

function conditionLabel(v?: string | null) {
  if (!v) return null;
  return CONDITION_LABEL[v.toLowerCase()] || v.charAt(0).toUpperCase() + v.slice(1);
}

function fulfillmentItems(v?: string | null): string[] {
  if (v === "both") return ["Retirada no local", "Entrega pelo vendedor"];
  if (v === "delivery") return ["Entrega pelo vendedor"];
  return ["Retirada no local"]; // default da coluna é 'pickup'
}

function formatDate(v?: string | null) {
  if (!v) return null;
  return new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(v?: string | null) {
  if (!v) return null;
  return new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function tenureLabel(createdAt?: string | null) {
  if (!createdAt) return null;
  const months = Math.max(1, differenceInMonths(new Date(), new Date(createdAt)));
  if (months < 12) return `Há ${months} ${months === 1 ? "mês" : "meses"} na plataforma`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `Há ${years} ${years === 1 ? "ano" : "anos"}${rest > 0 ? ` e ${rest} ${rest === 1 ? "mês" : "meses"}` : ""} na plataforma`;
}

/** Contagem regressiva "grossa" (dias/horas/min) — o hero já tem a de segundos. */
function useCoarseCountdown(endsAt?: string | null) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!endsAt) { setLabel(null); return; }
    const tick = () => {
      const diff = new Date(endsAt).getTime() - Date.now();
      if (diff <= 0) { setLabel("Encerrado"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setLabel(d > 0 ? `${d}d ${h}h ${m}min` : h > 0 ? `${h}h ${m}min` : `${m}min`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [endsAt]);
  return label;
}

// ─── Blocos visuais ──────────────────────────────────────────────────────────

function Section({ emoji, title, className, children }: {
  emoji: string; title: string; className?: string; children: ReactNode;
}) {
  return (
    <CardInfo className={cn("p-4 md:p-5 rounded-2xl", className)}>
      <h4 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.15em] text-[#8E98A3] mb-3">
        <span className="text-base leading-none">{emoji}</span> {title}
      </h4>
      {children}
    </CardInfo>
  );
}

function InfoRow({ label, value }: { label: string; value?: ReactNode | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-[#323A45]/60 last:border-0">
      <span className="text-xs font-bold text-[#8E98A3] shrink-0">{label}</span>
      <span className="text-xs font-black text-white text-right break-words min-w-0">{value}</span>
    </div>
  );
}

function CheckItem({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2 py-1 text-xs font-bold text-[#B8C2CC]">
      <CheckCircle2 className="w-4 h-4 text-[#00C58E] shrink-0" /> {label}
    </li>
  );
}

// ─── Painel principal ────────────────────────────────────────────────────────

export function AuctionInfoPanel({ listing }: { listing: AuctionListing }) {
  const isArremate = listing.listing_type === "arremate";

  const { data: store } = useAuctionStoreInfo(listing.store_id);

  // Nome da categoria (auction_categories) — só consulta se o anúncio tem categoria
  const { data: categoryName } = useQuery<string | null>({
    queryKey: ["auction-category", listing.category_id || listing.category_slug],
    queryFn: async () => {
      const base = supabase.from("auction_categories").select("name");
      const { data } = listing.category_id
        ? await base.eq("id", listing.category_id).maybeSingle()
        : await base.eq("slug", listing.category_slug!).maybeSingle();
      return (data as any)?.name || null;
    },
    enabled: !!(listing.category_id || listing.category_slug),
    staleTime: Infinity,
  });

  // Participantes reais = lances com user_id distinto
  const { data: participants } = useQuery<number>({
    queryKey: ["auction-participants", listing.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("auction_bids")
        .select("user_id")
        .eq("listing_id", listing.id);
      return new Set((data || []).map((b: any) => b.user_id).filter(Boolean)).size;
    },
    staleTime: 30 * 1000,
  });

  // Favoritos reais = linhas em auction_watchers (a coluna watchers_count não tem trigger)
  const { data: watchersCount } = useQuery<number>({
    queryKey: ["auction-watchers-count", listing.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("auction_watchers")
        .select("id", { count: "exact", head: true })
        .eq("auction_listing_id", listing.id);
      return count ?? 0;
    },
    staleTime: 60 * 1000,
  });

  // Selos reais da loja (mesma queryKey do SellerTransparencyCenter → dedupe)
  const { data: badges = [] } = useQuery<any[]>({
    queryKey: ["store-badges", listing.store_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_badges")
        .select("*")
        .eq("store_id", listing.store_id!);
      if (error) return [];
      return data || [];
    },
    enabled: !!listing.store_id,
    staleTime: 5 * 60 * 1000,
  });

  // Estatísticas da loja em uma única consulta (status de todos os anúncios dela)
  const { data: storeStats } = useQuery<{ active: number; sold: number; total: number } | null>({
    queryKey: ["auction-store-stats", listing.store_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("auction_listings")
        .select("status")
        .eq("store_id", listing.store_id!);
      const rows = (data || []) as { status: string }[];
      return {
        active: rows.filter((r) => r.status === "active").length,
        sold: rows.filter((r) => r.status === "sold").length,
        total: rows.length,
      };
    },
    enabled: !!listing.store_id,
    staleTime: 5 * 60 * 1000,
  });

  const countdown = useCoarseCountdown(listing.ends_at);

  // ── Dados derivados (null ⇒ campo oculto) ──
  const cidade = listing.city || store?.cidade || null;
  const estado = listing.state || store?.estado || null;
  const regiao = listing.neighborhood || store?.bairro || null;
  const hasLocation = !!(store?.nome || cidade || estado || regiao);

  const specs: Array<[string, string | null]> = [
    ["Marca", listing.brand || null],
    ["Modelo", listing.model || null],
    ["Condição", conditionLabel(listing.item_condition)],
    ["Categoria", categoryName || null],
  ];
  const hasSpecs = specs.some(([, v]) => v);

  const currentBid = listing.current_bid || listing.starting_bid || 0;
  const storeVerified = !!store && ["active", "ativa"].includes((store.status || "").toLowerCase());
  const productVerified = listing.moderation_status === "approved";

  const guarantees: string[] = [
    ...(productVerified ? ["Produto verificado pela moderação da plataforma"] : []),
    ...(storeVerified ? ["Loja ativa e verificada na plataforma"] : []),
    "Compra segura — lances e ofertas registrados na plataforma",
  ];

  const tenure = tenureLabel(store?.created_at);

  return (
    <div className="space-y-4">
      {/* Divisor + título da seção (spec: "Informações do Produto") */}
      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-[#323A45]" />
        <h3 className="text-lg font-black text-white">Informações do Produto</h3>
        <div className="h-px flex-1 bg-[#323A45]" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 📍 Localização — sem endereço completo antes do fechamento do negócio */}
        {hasLocation && (
          <Section emoji="📍" title="Localização">
            <InfoRow label="Loja" value={store?.nome} />
            <InfoRow label="Cidade" value={cidade} />
            <InfoRow label="Estado" value={estado} />
            <InfoRow label="Região" value={regiao} />
          </Section>
        )}

        {/* 🚚 Entrega — direto do fulfillment_type do anúncio */}
        <Section emoji="🚚" title="Entrega">
          <ul>
            {fulfillmentItems(listing.fulfillment_type).map((item) => (
              <CheckItem key={item} label={item} />
            ))}
          </ul>
        </Section>

        {/* 📋 Especificações — só atributos realmente cadastrados */}
        {hasSpecs && (
          <Section emoji="📋" title="Especificações do Produto">
            {specs.map(([label, value]) => (
              <InfoRow key={label} label={label} value={value} />
            ))}
          </Section>
        )}

        {/* 📦 Informações do Anúncio */}
        <Section emoji="📦" title="Informações do Anúncio">
          <InfoRow label="Código do anúncio" value={`#${listing.id.split("-")[0].toUpperCase()}`} />
          <InfoRow label="Publicado em" value={formatDate(listing.created_at)} />
          <InfoRow label="Última atualização" value={formatDate(listing.updated_at)} />
          <InfoRow
            label="Visualizações"
            value={listing.views_count != null ? (
              <span className="inline-flex items-center gap-1">
                <Eye className="w-3.5 h-3.5 text-[#00C58E]" /> {listing.views_count}
              </span>
            ) : null}
          />
          <InfoRow label="Interessados observando" value={watchersCount != null ? watchersCount : null} />
        </Section>

        {/* 📊 Dados do Leilão — largura total */}
        <Section emoji="📊" title={isArremate ? "Dados do Arremate" : "Dados do Leilão"} className="md:col-span-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6">
            <InfoRow label={isArremate ? "Preço inicial" : "Lance inicial"} value={formatCurrencyBRL(listing.starting_bid || 0)} />
            <InfoRow
              label={isArremate ? "Preço atual" : "Lance atual"}
              value={<span className="text-[#FF7A00]">{formatCurrencyBRL(currentBid)}</span>}
            />
            <InfoRow label="Incremento mínimo" value={formatCurrencyBRL(listing.minimum_increment || 1)} />
            <InfoRow label={isArremate ? "Ofertas" : "Lances"} value={listing.total_bids ?? 0} />
            <InfoRow label="Participantes" value={participants != null ? participants : null} />
            <InfoRow label="Tempo restante" value={countdown} />
            <InfoRow label="Encerramento previsto" value={formatDateTime(listing.ends_at)} />
            {listing.buy_now_price ? (
              <InfoRow label="Compra imediata" value={formatCurrencyBRL(listing.buy_now_price)} />
            ) : null}
          </div>
        </Section>

        {/* 🛡 Garantias — apenas indicadores reais */}
        <Section emoji="🛡" title="Garantias" className="md:col-span-2">
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
            {guarantees.map((g) => (
              <li key={g} className="flex items-center gap-2 py-1 text-xs font-bold text-[#B8C2CC]">
                <ShieldCheck className="w-4 h-4 text-[#00C58E] shrink-0" /> {g}
              </li>
            ))}
          </ul>
        </Section>

        {/* 🏪 Informações da Loja */}
        {store && (
          <Section emoji="🏪" title="Informações da Loja" className="md:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-[#1A1F24] border border-[#323A45] flex items-center justify-center overflow-hidden shrink-0">
                  {store.logo_url ? (
                    <img src={store.logo_url} alt={store.nome || "Loja"} className="w-full h-full object-cover" />
                  ) : (
                    <Store className="w-5 h-5 text-[#8E98A3]" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-black text-white truncate">
                    {store.nome || "Loja parceira"}
                    {storeVerified && <ShieldCheck className="w-4 h-4 text-[#00C58E] shrink-0" />}
                  </p>
                  {tenure && <p className="text-[11px] font-bold text-[#8E98A3]">{tenure}</p>}
                </div>
              </div>
              {storeStats && (
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-center">
                    <p className="text-base font-black text-white">{storeStats.active}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8E98A3]">Ativos</p>
                  </div>
                  <div className="text-center">
                    <p className="text-base font-black text-[#00C58E]">{storeStats.sold}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8E98A3]">Vendidos</p>
                  </div>
                  <div className="text-center">
                    <p className="text-base font-black text-white">{storeStats.total}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8E98A3]">Anúncios</p>
                  </div>
                </div>
              )}
            </div>
            {badges.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-[#323A45]/60">
                {badges.map((b: any) => (
                  <span key={b.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00C58E]/10 text-[#00C58E] text-[10px] font-black uppercase tracking-wider">
                    <Award className="w-3 h-3" /> {b.badge_name}
                  </span>
                ))}
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}

// ─── CTAs após os blocos: Dar Lance Agora + Tenho Interesse ──────────────────

export function AuctionCtaRow({ listing, isActive, onBid }: {
  listing: AuctionListing;
  isActive: boolean;
  onBid: () => void;
}) {
  const { user } = useAuth();
  const requireAuth = useRequireAuth();
  const queryClient = useQueryClient();

  // "Tenho Interesse" = observar o leilão (auction_watchers, escrita própria via RLS)
  const { data: watching = false } = useQuery<boolean>({
    queryKey: ["auction-watching", listing.id, user?.id ?? "anon"],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("auction_watchers")
        .select("id")
        .eq("auction_listing_id", listing.id)
        .eq("user_id", user.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user,
  });

  const toggleWatch = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error("Faça login para demonstrar interesse.");
      if (watching) {
        const { error } = await supabase
          .from("auction_watchers")
          .delete()
          .eq("auction_listing_id", listing.id)
          .eq("user_id", uid);
        if (error) throw error;
        return false;
      }
      const { error } = await supabase
        .from("auction_watchers")
        .insert({ auction_listing_id: listing.id, user_id: uid });
      // 23505 = já estava observando (idempotente após retomada de login)
      if (error && (error as any).code !== "23505") throw error;
      return true;
    },
    onSuccess: (nowWatching) => {
      toast.success(nowWatching
        ? "Interesse registrado! Você está observando este leilão. 👀"
        : "Você deixou de observar este leilão.");
      queryClient.invalidateQueries({ queryKey: ["auction-watching", listing.id] });
      queryClient.invalidateQueries({ queryKey: ["auction-watchers-count", listing.id] });
    },
    onError: (e: any) => toast.error(e.message || "Não foi possível registrar interesse."),
  });

  const handleInterest = () => {
    requireAuth(() => toggleWatch.mutate(), {
      kind: "auction_watch",
      label: "demonstrar interesse neste leilão",
      payload: { id: listing.id },
    });
  };

  // Retoma o "Tenho Interesse" após o login (mesmo padrão do lance)
  useEffect(() => {
    return registerResumeHandler("auction_watch", (payload) => {
      if (payload?.id === listing.id) toggleWatch.mutate();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id]);

  return (
    <div className={cn("grid gap-3", isActive ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
      {isActive && (
        <button
          onClick={onBid}
          className="h-14 rounded-2xl bg-[#FF7A00] hover:bg-[#FF8E1F] text-white font-black text-base uppercase tracking-wide shadow-[0_6px_18px_rgba(255,122,0,0.30)] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <Gavel className="w-5 h-5" />
          {listing.listing_type === "arremate" ? "Fazer Oferta Agora" : "Dar Lance Agora"}
        </button>
      )}
      <button
        onClick={handleInterest}
        disabled={toggleWatch.isPending}
        className={cn(
          "h-14 rounded-2xl border-2 font-black text-base uppercase tracking-wide transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60",
          watching
            ? "border-[#00C58E] bg-[#00C58E]/15 text-[#00C58E]"
            : "border-[#00C58E] bg-transparent text-[#00C58E] hover:bg-[rgba(0,197,142,0.12)]"
        )}
      >
        {toggleWatch.isPending ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Eye className="w-5 h-5" />
        )}
        {watching ? "Observando ✓" : "Tenho Interesse"}
      </button>
    </div>
  );
}

export default AuctionInfoPanel;
