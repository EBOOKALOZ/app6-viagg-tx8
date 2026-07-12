import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  MapPin, Eye, Clock, Megaphone, Send, X, Copy, ExternalLink,
  CheckCircle, Users, Sparkles, ImageOff, Target,
} from 'lucide-react';
import {
  useDivulgacaoFeed, scoreAd, normCity, FeedAd,
} from '@/hooks/useDivulgacaoFeed';
import type { PostingLot } from '@/types/postador';
import { cn } from '@/lib/utils';

/**
 * DivulgacaoFeed — marketplace unificado de oportunidades de divulgação.
 * Junta num único feed: anúncios reais dos usuários (📢 Divulgação) e
 * campanhas/lotes do motor Postador (🎯 Campanha), ordenados pelo motor
 * de recomendação. "Divulgar" prepara a postagem nos grupos do próprio
 * profissional (sem escrita no banco — a confirmação oficial continua
 * no fluxo de Lotes).
 */

type FeedItem = {
  key: string;
  tipo: 'divulgacao' | 'campanha';
  ad?: FeedAd;
  lot?: PostingLot;
  title: string;
  storeName: string | null;
  price: number | null;
  city: string | null;
  category: string;
  image: string | null;
  createdAt: string;
  views: number | null;
  isPromoted: boolean;
  score: number;
};

const FILTERS = [
  'Todos', 'Divulgações', 'Campanhas', 'Patrocinados', 'Próximos',
  'Mais recentes', 'Mais populares', 'Imóveis', 'Veículos', 'Produtos',
] as const;
type Filter = typeof FILTERS[number];

const fmtBRL = (v: number | null) =>
  v == null ? null : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

function timeAgo(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? 's' : ''}`;
}

function categoryEmoji(cat: string, tipo: 'divulgacao' | 'campanha'): string {
  if (tipo === 'campanha') return '🎯';
  const c = cat.toLowerCase();
  if (/imóve|imove/.test(c)) return '🏠';
  if (/veícul|veicul|moto|carro/.test(c)) return '🚗';
  if (/celular|smart|eletr|comput|inform/.test(c)) return '📱';
  if (/restaurante|pizza|comida|lanche|sushi/.test(c)) return '🍔';
  if (/mercado|padaria/.test(c)) return '🛒';
  if (/farm/.test(c)) return '💊';
  if (/serviç|servic/.test(c)) return '🛠️';
  if (/pet/.test(c)) return '🐶';
  if (/roupa|loja|moda/.test(c)) return '👕';
  return '🛍️';
}

// ── Modal "Divulgar" ─────────────────────────────────────────────
function DivulgarModal({ item, onClose }: { item: FeedItem; onClose: () => void }) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['divulgar-grupos', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase.from('whatsapp_groups') as any)
        .select('id, group_name, group_link, city_name, validation_status, is_active')
        .eq('owner_user_id', user!.id)
        .eq('is_active', true);
      return (data || []) as any[];
    },
  });

  // Grupos compatíveis primeiro (mesma cidade do anúncio)
  const sorted = useMemo(() => {
    const adCity = normCity(item.city);
    return [...groups].sort((a, b) => {
      const am = normCity(a.city_name) === adCity ? 0 : 1;
      const bm = normCity(b.city_name) === adCity ? 0 : 1;
      return am - bm;
    });
  }, [groups, item.city]);

  const defaultMsg = [
    `${categoryEmoji(item.category, item.tipo)} *${item.title}*`,
    item.storeName ? `🏪 ${item.storeName}` : null,
    item.price != null ? `💰 ${fmtBRL(item.price)}` : null,
    item.city ? `📍 ${item.city}` : null,
    '',
    `👉 Veja no Viagg-TX8: ${window.location.origin}${item.ad?.path ?? '/mercado'}`,
  ].filter((l) => l !== null).join('\n');

  const [msg, setMsg] = useState(defaultMsg);

  const copyMsg = () => {
    navigator.clipboard.writeText(msg);
    setCopied(true);
    toast.success('Mensagem copiada! Cole no grupo do WhatsApp.');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[24px] bg-white p-5 sm:rounded-[24px]"
        style={{ boxShadow: '0 24px 80px -20px rgba(15,23,42,.45)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {item.image ? (
              <img src={item.image} alt="" className="h-12 w-12 rounded-xl object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-xl">
                {categoryEmoji(item.category, item.tipo)}
              </div>
            )}
            <div>
              <p className="text-sm text-slate-900" style={{ fontWeight: 700 }}>Divulgar anúncio</p>
              <p className="line-clamp-1 text-xs" style={{ color: '#64748b' }}>{item.title}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mensagem pronta */}
        <p className="mt-4 text-[10px] uppercase tracking-widest" style={{ color: '#64748b', fontWeight: 700 }}>
          1 · Mensagem pronta (edite se quiser)
        </p>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={6}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800 outline-none focus:border-green-500"
        />
        <button
          type="button"
          onClick={copyMsg}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm text-white transition-transform active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)', fontWeight: 600, boxShadow: '0 8px 18px -8px rgba(22,163,74,.5)' }}
        >
          {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copiada!' : 'Copiar mensagem'}
        </button>

        {/* Grupos sugeridos */}
        <p className="mt-5 text-[10px] uppercase tracking-widest" style={{ color: '#64748b', fontWeight: 700 }}>
          2 · Poste nos seus grupos {item.city ? `(compatíveis com ${item.city} primeiro)` : ''}
        </p>
        <div className="mt-1.5 space-y-1.5">
          {isLoading ? (
            <p className="py-4 text-center text-xs" style={{ color: '#64748b' }}>Carregando seus grupos…</p>
          ) : !sorted.length ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center">
              <Users className="mx-auto mb-1 h-6 w-6 text-slate-300" />
              <p className="text-xs" style={{ color: '#64748b' }}>
                Você ainda não tem grupos ativos. Vincule grupos na aba Grupos para divulgar.
              </p>
            </div>
          ) : (
            sorted.map((g) => {
              const match = normCity(g.city_name) === normCity(item.city);
              return (
                <div key={g.id} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
                    style={{ background: match ? '#dcfce7' : '#f1f5f9' }}
                  >
                    💬
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-slate-900" style={{ fontWeight: 600 }}>{g.group_name}</p>
                    <p className="text-[10px]" style={{ color: match ? '#16a34a' : '#64748b', fontWeight: match ? 700 : 400 }}>
                      {g.city_name || 'Sem cidade'}{match ? ' · compatível ✓' : ''}
                    </p>
                  </div>
                  {g.group_link && (
                    <a
                      href={g.group_link}
                      target="_blank"
                      rel="noreferrer"
                      className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] text-white"
                      style={{ background: '#16a34a', fontWeight: 600 }}
                    >
                      <ExternalLink className="h-3 w-3" /> Abrir grupo
                    </a>
                  )}
                </div>
              );
            })
          )}
        </div>

        <button
          type="button"
          onClick={() => { toast.success('Divulgação preparada! Postar mantém seus grupos ativos e sua comissão baixa. 🎉'); onClose(); }}
          className="mt-5 w-full rounded-full border border-slate-200 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
          style={{ fontWeight: 600 }}
        >
          Concluir
        </button>
      </div>
    </div>
  );
}

// ── Feed principal ───────────────────────────────────────────────
export function DivulgacaoFeed({
  campaigns,
  onOpenCampaign,
}: {
  campaigns: PostingLot[];
  onOpenCampaign?: (lot: PostingLot) => void;
}) {
  const { data, isLoading } = useDivulgacaoFeed();
  const [filter, setFilter] = useState<Filter>('Todos');
  const [divulgar, setDivulgar] = useState<FeedItem | null>(null);

  const items: FeedItem[] = useMemo(() => {
    const ctx = data?.ctx ?? { profileCity: null, groupCities: [] };
    const list: FeedItem[] = [];

    for (const ad of (data?.ads ?? [])) {
      list.push({
        key: `ad-${ad.kind}-${ad.id}`,
        tipo: 'divulgacao',
        ad,
        title: ad.title,
        storeName: ad.storeName,
        price: ad.price,
        city: ad.city,
        category: ad.category,
        image: ad.image,
        createdAt: ad.createdAt,
        views: ad.views,
        isPromoted: ad.isPromoted,
        score: scoreAd(ad, ctx),
      });
    }

    for (const lot of campaigns) {
      const first = lot.items?.[0];
      const cityMatch = normCity(lot.target_city) === normCity(ctx.profileCity);
      list.push({
        key: `lot-${lot.lot_id}`,
        tipo: 'campanha',
        lot,
        title: first?.product_name
          ? `${first.product_name}${lot.items_count > 1 ? ` +${lot.items_count - 1} produtos` : ''}`
          : `Lote #${lot.lot_number} · ${lot.items_count} produto${lot.items_count > 1 ? 's' : ''}`,
        storeName: lot.store_name,
        price: first?.product_price != null ? Number(first.product_price) : null,
        city: lot.target_city,
        category: 'Campanha da plataforma',
        image: first?.product_image_url || lot.store_logo_url,
        createdAt: lot.lot_created_at,
        views: lot.click_count ?? null,
        isPromoted: false,
        score: 30 + (cityMatch ? 40 : 0) + Math.min(10, (lot.click_count ?? 0) / 5), // campanha real > divulgação avulsa
      });
    }
    return list;
  }, [data, campaigns]);

  const filtered = useMemo(() => {
    const ctx = data?.ctx ?? { profileCity: null, groupCities: [] };
    let out = items;
    if (filter === 'Divulgações') out = out.filter(i => i.tipo === 'divulgacao');
    if (filter === 'Campanhas') out = out.filter(i => i.tipo === 'campanha');
    if (filter === 'Patrocinados') out = out.filter(i => i.isPromoted);
    if (filter === 'Próximos') out = out.filter(i => normCity(i.city) && normCity(i.city) === normCity(ctx.profileCity));
    if (filter === 'Imóveis') out = out.filter(i => i.ad?.kind === 'imovel');
    if (filter === 'Veículos') out = out.filter(i => i.ad?.kind === 'veiculo');
    if (filter === 'Produtos') out = out.filter(i => i.ad?.kind === 'divulgacao');

    /* ── RANKING EM FAIXAS (mídia paga primeiro, SEMPRE) ──────────────
       Faixa 0: ⭐ patrocinados DENTRO da área do profissional (cidade do
                perfil ou cidades dos grupos; sem cidade definida = geral).
                Patrocinado FORA da área contratada não ganha prioridade
                paga (cai para a faixa orgânica, mantendo o selo).
       Faixa 1: 🎯 campanhas da plataforma (lotes reais do Postador).
       Faixa 2: 📢 orgânicos, ordenados pelo motor de relevância
                (proximidade, grupos, recência, engajamento).
       Dentro da faixa paga, distribuição round-robin por anunciante para
       não repetir o mesmo anunciante em sequência. Orgânico NUNCA sobe
       acima de patrocinado, em nenhum filtro de ordenação. */
    const inArea = (i: FeedItem) => {
      const c = normCity(i.city);
      if (!c) return true; // segmentação geral
      return c === normCity(ctx.profileCity) || ctx.groupCities.includes(c);
    };
    const band = (i: FeedItem) =>
      i.isPromoted && inArea(i) ? 0 : i.tipo === 'campanha' ? 1 : 2;

    const innerSort = (a: FeedItem, b: FeedItem) => {
      if (filter === 'Mais recentes') return +new Date(b.createdAt) - +new Date(a.createdAt);
      if (filter === 'Mais populares') return (b.views ?? 0) - (a.views ?? 0);
      // empate entre patrocinados: relevância → conversão/engajamento → mais recente
      return (b.score - a.score) || ((b.views ?? 0) - (a.views ?? 0))
        || (+new Date(b.createdAt) - +new Date(a.createdAt));
    };

    const bands: FeedItem[][] = [[], [], []];
    for (const i of out) bands[band(i)].push(i);
    bands.forEach(bnd => bnd.sort(innerSort));

    // Distribuição na faixa paga: round-robin por anunciante
    const byAdvertiser = new Map<string, FeedItem[]>();
    for (const i of bands[0]) {
      const k = i.storeName || i.ad?.kind || 'anunciante';
      if (!byAdvertiser.has(k)) byAdvertiser.set(k, []);
      byAdvertiser.get(k)!.push(i);
    }
    const paidDistributed: FeedItem[] = [];
    const queues = [...byAdvertiser.values()];
    while (queues.some(q => q.length)) {
      for (const q of queues) { const n = q.shift(); if (n) paidDistributed.push(n); }
    }

    return [...paidDistributed, ...bands[1], ...bands[2]];
  }, [items, filter, data]);

  // Painel de oportunidades
  const stats = useMemo(() => {
    const hoje = items.filter(i => (Date.now() - +new Date(i.createdAt)) < 86_400_000).length;
    const catCount: Record<string, number> = {};
    const cityCount: Record<string, number> = {};
    for (const i of items) {
      const c = i.category.split('·')[0].trim();
      catCount[c] = (catCount[c] || 0) + 1;
      if (i.city) cityCount[i.city] = (cityCount[i.city] || 0) + 1;
    }
    const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
    return {
      total: items.length,
      campanhas: items.filter(i => i.tipo === 'campanha').length,
      hoje,
      topCategoria: top(catCount),
      topCidade: top(cityCount),
    };
  }, [items]);

  const ctxCity = data?.ctx?.profileCity ?? null;

  return (
    <div
      className="df-enter rounded-[24px] p-4 sm:p-5"
      style={{
        background: 'rgba(255,255,255,.85)',
        backdropFilter: 'blur(14px)',
        border: '1px solid rgba(255,255,255,.65)',
        boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 16px 44px -18px rgba(15,23,42,.14)',
        fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <style>{`
        @keyframes dfEnter { from { opacity: 0; transform: translateY(12px);} to { opacity: 1; transform: none;} }
        .df-enter { animation: dfEnter .5s ease-out both; }
        .df-card { transition: transform .25s ease, box-shadow .25s ease; }
        .df-card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px -16px rgba(15,23,42,.22); }
        .df-card img { transition: transform .4s ease; }
        .df-card:hover img { transform: scale(1.04); }
      `}</style>

      {/* Painel de oportunidades */}
      <div
        className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl px-5 py-4"
        style={{ background: 'linear-gradient(135deg,#f0fdf4,#ecfeff)', border: '1px solid rgba(22,163,74,.15)' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full text-xl" style={{ background: '#dcfce7' }}>📢</div>
          <div>
            <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}>Oportunidades disponíveis hoje</p>
            <p className="text-xs" style={{ color: '#64748b' }}>
              Divulgue anúncios reais e mantenha seus grupos ativos — atividade real sustenta sua comissão mínima.
            </p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-x-6 gap-y-2">
          {[
            { v: stats.total, l: 'Oportunidades' },
            { v: stats.campanhas, l: 'Campanhas' },
            { v: stats.hoje, l: 'Novas hoje' },
            { v: stats.topCategoria, l: 'Top categoria', small: true },
            { v: stats.topCidade, l: 'Maior demanda', small: true },
          ].map((s) => (
            <div key={s.l} className="text-center">
              <p className={cn('tabular-nums text-slate-900', s.small ? 'max-w-[110px] truncate text-xs' : 'text-xl')} style={{ fontWeight: 800 }}>{s.v}</p>
              <p className="text-[10px]" style={{ color: '#64748b' }}>{s.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className="shrink-0 rounded-full px-3.5 py-1.5 text-xs transition-all duration-[250ms]"
            style={filter === f
              ? { background: '#16a34a', color: '#fff', fontWeight: 700, boxShadow: '0 6px 14px -6px rgba(22,163,74,.5)' }
              : { background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', fontWeight: 600 }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Grid do feed */}
      {isLoading ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="animate-pulse rounded-[20px] border border-slate-100 bg-white p-3">
              <div className="h-36 rounded-xl bg-slate-100" />
              <div className="mt-3 h-4 w-3/4 rounded bg-slate-100" />
              <div className="mt-2 h-3 w-1/2 rounded bg-slate-50" />
              <div className="mt-3 h-9 rounded-full bg-slate-100" />
            </div>
          ))}
        </div>
      ) : !filtered.length ? (
        <div className="mt-4 rounded-[20px] border border-dashed border-slate-200 bg-white/60 p-10 text-center">
          <Sparkles className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-700" style={{ fontWeight: 600 }}>Nenhuma oportunidade neste filtro</p>
          <p className="mt-1 text-xs" style={{ color: '#64748b' }}>Novos anúncios e campanhas aparecem aqui automaticamente.</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item, idx) => {
            const isNew = (Date.now() - +new Date(item.createdAt)) < 172_800_000;
            const near = normCity(item.city) && normCity(item.city) === normCity(ctxCity);
            const hot = (item.views ?? 0) >= 10;
            return (
              <div
                key={item.key}
                className="df-card df-enter overflow-hidden rounded-[20px] border border-slate-200/80 bg-white/90"
                style={{ animationDelay: `${Math.min(idx, 9) * 50}ms`, backdropFilter: 'blur(6px)' }}
              >
                {/* Imagem + badges */}
                <div className="relative h-36 w-full overflow-hidden bg-slate-100">
                  {item.image ? (
                    <img src={item.image} alt={item.title} className="h-full w-full object-cover" loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-4xl">{categoryEmoji(item.category, item.tipo)}</div>
                  )}
                  <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                    <span className="rounded-full px-2 py-0.5 text-[10px] text-white" style={{ background: item.tipo === 'campanha' ? '#7c3aed' : '#16a34a', fontWeight: 700 }}>
                      {item.tipo === 'campanha' ? '🎯 Campanha' : '📢 Divulgação'}
                    </span>
                    {item.isPromoted && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] text-white" style={{ fontWeight: 700 }}>⭐ Patrocinado</span>}
                    {hot && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] text-white" style={{ fontWeight: 700 }}>🔥 Em alta</span>}
                    {near && <span className="rounded-full bg-sky-500 px-2 py-0.5 text-[10px] text-white" style={{ fontWeight: 700 }}>📍 Próximo</span>}
                    {isNew && <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] text-white" style={{ fontWeight: 700 }}>🆕 Novo</span>}
                  </div>
                </div>

                <div className="p-3.5">
                  <p className="line-clamp-1 text-sm text-slate-900" style={{ fontWeight: 700 }}>{item.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-[11px]" style={{ color: '#64748b' }}>
                    {item.storeName ? `${item.storeName} · ` : ''}{item.category}
                  </p>

                  <div className="mt-1.5 flex items-baseline justify-between gap-2">
                    {item.price != null ? (
                      <p className="tabular-nums text-base" style={{ color: '#16a34a', fontWeight: 800 }}>{fmtBRL(item.price)}</p>
                    ) : <span />}
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]" style={{ color: '#94a3b8' }}>
                    {item.city && (
                      <span className="inline-flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" />{item.city}
                        {item.ad?.distanceKm != null && item.ad.distanceKm > 0 && ` · ~${item.ad.distanceKm} km`}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-0.5"><Clock className="h-3 w-3" />{timeAgo(item.createdAt)}</span>
                    {item.views != null && <span className="inline-flex items-center gap-0.5"><Eye className="h-3 w-3" />{item.views}</span>}
                  </div>

                  {item.tipo === 'campanha' ? (
                    <button
                      type="button"
                      onClick={() => item.lot && onOpenCampaign?.(item.lot)}
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full py-2 text-xs text-white transition-transform active:scale-[0.98]"
                      style={{ background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', fontWeight: 700, boxShadow: '0 8px 18px -8px rgba(124,58,237,.5)' }}
                    >
                      <Target className="h-3.5 w-3.5" /> Atender campanha
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDivulgar(item)}
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full py-2 text-xs text-white transition-transform active:scale-[0.98]"
                      style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)', fontWeight: 700, boxShadow: '0 8px 18px -8px rgba(22,163,74,.5)' }}
                    >
                      <Megaphone className="h-3.5 w-3.5" /> Divulgar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {divulgar && <DivulgarModal item={divulgar} onClose={() => setDivulgar(null)} />}
    </div>
  );
}
