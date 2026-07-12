import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDivulgacaoFeed, scoreAd, normCity, FeedAd } from '@/hooks/useDivulgacaoFeed';
import type { PostingLot, GroupRuntimeView } from '@/types/postador';
import { toast } from 'sonner';
import {
  Bot, MapPin, Store, Tag, Users, Timer, Send, CheckCircle,
  Sparkles, Hourglass, ExternalLink, Copy,
} from 'lucide-react';

/**
 * PostadorAutoPilot — despachante inteligente de divulgações.
 * O profissional NÃO escolhe nada: o motor prioriza (1) lotes/campanhas
 * reais do Postador (reserva de verdade via claim → claimed_until) e,
 * na falta deles, (2) anúncios patrocinados do marketplace dentro da
 * área, preparando mensagem + grupo automaticamente (reserva local 5min).
 * Uma única ação: POSTAR AGORA.
 */

type Oportunidade =
  | { tipo: 'lote'; lot: PostingLot; score: number }
  | { tipo: 'anuncio'; ad: FeedAd; grupo: any | null; score: number };

const RESERVA_LOCAL_MS = 5 * 60 * 1000;

function fmtMMSS(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function PostadorAutoPilot({
  lots,
  groupRuntimes,
  actionState,
  onClaim,
  onOpenProof,
}: {
  lots: PostingLot[];
  groupRuntimes: GroupRuntimeView[];
  actionState: Record<string, string>;
  onClaim: (lotId: string) => void | Promise<any>;
  onOpenProof: (lot: PostingLot) => void;
}) {
  const { user } = useAuth();
  const { data: feed } = useDivulgacaoFeed();

  /* Janela operacional (07:00–23:00 configurável) + estimativa dinâmica */
  const { data: janela } = useQuery({
    queryKey: ['janela-status'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('janela_status');
      if (error) throw error;
      return data as any;
    },
  });
  const { data: estim } = useQuery({
    queryKey: ['divulgacao-estimativa'],
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data } = await (supabase.rpc as any)('divulgacao_estimativa');
      return data as any;
    },
  });
  const janelaFechada = janela ? !janela.aberta : false;
  const estimativaTxt = estim?.minutos != null
    ? (estim.minutos >= 60 ? `até ${Math.ceil(estim.minutos / 60)}h` : `até ${estim.minutos}min`)
    : `até ${estim?.horas_padrao ?? 3}h`;

  const [now, setNow] = useState(() => Date.now());
  const [preparing, setPreparing] = useState(true);
  const [skipped, setSkipped] = useState<string[]>([]);      // oportunidades locais expiradas/puladas
  const [reservaLocalAte, setReservaLocalAte] = useState<number | null>(null);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  /* Grupos do profissional (link + cidade) com cooldown do runtime */
  const { data: myGroups = [] } = useQuery({
    queryKey: ['autopilot-grupos', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase.from('whatsapp_groups') as any)
        .select('id, group_name, group_link, city_name, is_active, validation_status')
        .eq('owner_user_id', user!.id)
        .eq('is_active', true);
      return (data || []) as any[];
    },
  });

  const cooldownIds = useMemo(
    () => new Set(groupRuntimes.filter(r => r.is_in_cooldown).map(r => r.whatsapp_group_id)),
    [groupRuntimes],
  );

  /* ── MOTOR DE SELEÇÃO (prioridade fixa, sem escolha manual) ────── */
  const oportunidade: Oportunidade | null = useMemo(() => {
    const ctx = feed?.ctx ?? { profileCity: null, groupCities: [] };

    // 1-2) Lotes/campanhas reais: reservado por mim primeiro, depois disponíveis
    const meus = lots.filter(l => l.lot_status === 'claimed' && l.operator_user_id === user?.id
      && l.claimed_until && new Date(l.claimed_until).getTime() > now);
    const disponiveis = lots.filter(l => l.lot_status === 'available');
    const rankLot = (l: PostingLot) =>
      (normCity(l.target_city) === normCity(ctx.profileCity) ? 40 : 0)
      + (ctx.groupCities.includes(normCity(l.target_city)) ? 20 : 0)
      + Math.min(10, (l.click_count ?? 0) / 5);
    const lot = [...meus, ...disponiveis].sort((a, b) => rankLot(b) - rankLot(a))[0];
    if (lot) return { tipo: 'lote', lot, score: rankLot(lot) };

    // 3-7) Anúncios do marketplace: patrocinados na área primeiro
    const inArea = (ad: FeedAd) => {
      const c = normCity(ad.city);
      return !c || c === normCity(ctx.profileCity) || ctx.groupCities.includes(c);
    };
    const elegiveis = (feed?.ads ?? [])
      .filter(ad => !skipped.includes(ad.id))
      .filter(inArea)
      .sort((a, b) => {
        if (a.isPromoted !== b.isPromoted) return a.isPromoted ? -1 : 1; // pago SEMPRE primeiro
        return scoreAd(b, ctx) - scoreAd(a, ctx);
      });
    const ad = elegiveis[0];
    if (!ad) return null;

    // grupo mais compatível: mesma cidade > fora de cooldown > qualquer ativo
    const candidatos = myGroups
      .filter(g => g.group_link)
      .sort((a, b) => {
        const am = normCity(a.city_name) === normCity(ad.city) ? 0 : 1;
        const bm = normCity(b.city_name) === normCity(ad.city) ? 0 : 1;
        if (am !== bm) return am - bm;
        const ac = cooldownIds.has(a.id) ? 1 : 0;
        const bc = cooldownIds.has(b.id) ? 1 : 0;
        return ac - bc;
      });
    return { tipo: 'anuncio', ad, grupo: candidatos[0] ?? null, score: scoreAd(ad, ctx) };
  }, [lots, feed, myGroups, cooldownIds, skipped, user?.id, now]);

  /* animação "preparando" a cada troca de oportunidade */
  const opKey = oportunidade
    ? (oportunidade.tipo === 'lote' ? `lote-${oportunidade.lot.lot_id}` : `ad-${oportunidade.ad.id}`)
    : 'vazio';
  const prevKey = useRef<string>('');
  useEffect(() => {
    if (prevKey.current === opKey) return;
    prevKey.current = opKey;
    setPreparing(true);
    setReservaLocalAte(null);
    const t = setTimeout(() => {
      setPreparing(false);
      if (opKey.startsWith('ad-')) setReservaLocalAte(Date.now() + RESERVA_LOCAL_MS);
    }, 1600);
    return () => clearTimeout(t);
  }, [opKey]);

  /* reserva local de anúncio expira → devolve à fila e prepara a próxima
     (congelada durante a pausa noturna — nada expira fora da janela) */
  useEffect(() => {
    if (!reservaLocalAte || preparing || janelaFechada) return;
    if (now >= reservaLocalAte && oportunidade?.tipo === 'anuncio') {
      toast.info('Reserva expirada — oportunidade devolvida à fila. Preparando a próxima…');
      setSkipped(s => [...s, (oportunidade as any).ad.id]);
    }
  }, [now, reservaLocalAte, preparing, oportunidade]);

  /* ── AÇÃO ÚNICA ────────────────────────────────────────────────── */
  const lotClaimed = oportunidade?.tipo === 'lote'
    && oportunidade.lot.lot_status === 'claimed'
    && oportunidade.lot.operator_user_id === user?.id;
  const isActing = oportunidade?.tipo === 'lote'
    && actionState[oportunidade.lot.lot_id] === 'loading';

  const handlePostar = async () => {
    if (!oportunidade) return;
    if (oportunidade.tipo === 'lote') {
      if (lotClaimed) { onOpenProof(oportunidade.lot); return; }
      await onClaim(oportunidade.lot.lot_id);
      return;
    }
    // anúncio do marketplace: mensagem pronta → copiar + abrir grupo
    const { ad, grupo } = oportunidade;
    const msg = [
      `🛍️ *${ad.title}*`,
      ad.price != null ? `💰 ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ad.price)}` : null,
      ad.city ? `📍 ${ad.city}` : null,
      '',
      `👉 Veja no Viagg-TX8: ${window.location.origin}${ad.path}`,
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(msg);
    if (grupo?.group_link) {
      window.open(grupo.group_link, '_blank');
      toast.success(`Mensagem copiada! Cole no grupo "${grupo.group_name}" e envie. 🎉`);
    } else {
      toast.success('Mensagem copiada! Cole em um dos seus grupos do WhatsApp.');
    }
    // conclui esta e libera a próxima automaticamente
    setTimeout(() => setSkipped(s => [...s, ad.id]), 1200);
  };

  /* countdown exibido */
  const deadline = oportunidade?.tipo === 'lote'
    ? (lotClaimed && oportunidade.lot.claimed_until ? new Date(oportunidade.lot.claimed_until).getTime() : null)
    : reservaLocalAte;
  const restanteMs = deadline ? deadline - now : null;

  /* infos objetivas */
  const info = useMemo(() => {
    if (!oportunidade) return null;
    if (oportunidade.tipo === 'lote') {
      const l = oportunidade.lot;
      return {
        anunciante: l.store_name || 'Loja parceira',
        categoria: `Campanha · ${l.items_count} produto${l.items_count > 1 ? 's' : ''}`,
        cidade: l.target_city || '—',
        grupos: myGroups.length,
        imagem: l.items?.[0]?.product_image_url || l.store_logo_url,
        titulo: l.items?.[0]?.product_name || `Lote #${l.lot_number}`,
      };
    }
    const { ad, grupo } = oportunidade;
    return {
      anunciante: ad.storeName || 'Anunciante Viagg',
      categoria: ad.category,
      cidade: ad.city || '—',
      grupos: grupo ? 1 : 0,
      imagem: ad.image,
      titulo: ad.title,
    };
  }, [oportunidade, myGroups.length]);

  return (
    <div
      className="ap-enter relative overflow-hidden rounded-[24px] p-5 sm:p-6"
      style={{
        background: 'linear-gradient(160deg,#052e16 0%,#14532d 55%,#166534 100%)',
        boxShadow: '0 20px 50px -20px rgba(5,46,22,.6)',
        fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <style>{`
        @keyframes apEnter { from { opacity: 0; transform: translateY(12px);} to { opacity: 1; transform: none;} }
        .ap-enter { animation: apEnter .5s ease-out both; }
        @keyframes apPulse { 0%,100% { opacity:.35; transform: scale(1);} 50% { opacity:.9; transform: scale(1.25);} }
        @keyframes apOrbit { from { transform: rotate(0);} to { transform: rotate(360deg);} }
        @keyframes apGlow { 0%,100% { box-shadow: 0 12px 34px -10px rgba(34,197,94,.55);} 50% { box-shadow: 0 12px 44px -6px rgba(34,197,94,.85);} }
        .ap-btn { animation: apGlow 2.2s ease-in-out infinite; transition: transform .2s ease; }
        .ap-btn:active { transform: scale(.97); }
        @keyframes apShimmer { 0% { background-position: -400px 0;} 100% { background-position: 400px 0;} }
        .ap-skel { background: linear-gradient(90deg, rgba(255,255,255,.07) 25%, rgba(255,255,255,.16) 37%, rgba(255,255,255,.07) 63%); background-size: 400px 100%; animation: apShimmer 1.3s linear infinite; }
      `}</style>

      {/* status do operador IA */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
          <Bot className="h-5 w-5 text-emerald-300" />
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400" style={{ animation: 'apPulse 1.6s ease-in-out infinite' }} />
        </div>
        <div>
          <p className="text-sm text-white" style={{ fontWeight: 700 }}>Despachante Inteligente</p>
          <p className="text-[11px] text-emerald-200/80">
            {janelaFechada
              ? `Operação pausada (${(janela?.fim ?? '23:00').slice(0, 5)}–${(janela?.inicio ?? '07:00').slice(0, 5)}) · contadores congelados.`
              : preparing
                ? 'Analisando prioridades, grupos e horários…'
                : oportunidade
                  ? 'Divulgação pronta — só confirmar.'
                  : 'Monitorando novas oportunidades para você.'}
          </p>
        </div>
        {restanteMs != null && !preparing && (
          <div className="ml-auto rounded-2xl bg-white/10 px-3.5 py-2 text-center">
            <p className="text-[9px] uppercase tracking-widest text-emerald-200/80" style={{ fontWeight: 700 }}>
              <Hourglass className="mr-0.5 inline h-3 w-3" /> Reserva expira em
            </p>
            <p className="tabular-nums text-lg leading-tight text-white" style={{ fontWeight: 800 }}>
              {fmtMMSS(restanteMs)}
            </p>
          </div>
        )}
      </div>

      {/* corpo */}
      {janelaFechada ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-2xl">⏸️</p>
          <p className="mt-1 text-sm text-white" style={{ fontWeight: 700 }}>
            Operação pausada ({(janela?.fim ?? '23:00').slice(0, 5)}–{(janela?.inicio ?? '07:00').slice(0, 5)})
          </p>
          <p className="mt-1 text-xs text-emerald-200/70">
            Retorna às {(janela?.inicio ?? '07:00').slice(0, 5)} — suas reservas estão congeladas e
            voltam exatamente do ponto em que pararam. A IA segue organizando a fila em segundo plano.
          </p>
        </div>
      ) : preparing ? (
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0">
              <span className="absolute inset-0 rounded-full border-2 border-emerald-400/20" />
              <span className="absolute inset-0 rounded-full border-t-2 border-emerald-300" style={{ animation: 'apOrbit 1s linear infinite' }} />
              <span className="absolute inset-3 flex items-center justify-center rounded-full bg-white/10 text-xl">🤖</span>
            </div>
            <div className="flex-1">
              <p className="text-base text-white" style={{ fontWeight: 700 }}>Preparando sua próxima divulgação…</p>
              <p className="mt-0.5 text-xs text-emerald-200/70">
                Selecionando anúncio prioritário · conferindo grupos e cooldown · montando texto e imagem
              </p>
            </div>
          </div>
          <div className="ap-skel h-14 rounded-2xl" />
          <div className="ap-skel h-12 w-2/3 rounded-2xl" />
        </div>
      ) : !oportunidade || !info ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <Sparkles className="mx-auto mb-2 h-7 w-7 text-emerald-300/60" />
          <p className="text-sm text-white" style={{ fontWeight: 700 }}>Nenhuma divulgação disponível agora</p>
          <p className="mt-1 text-xs text-emerald-200/70">
            O despachante segue monitorando — assim que surgir uma oportunidade, ela aparece aqui pronta para postar.
          </p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-center">
          {/* resumo objetivo */}
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {info.imagem ? (
              <img src={info.imagem} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-2 ring-white/15" />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-3xl">🛍️</div>
            )}
            <div className="min-w-0">
              <p className="line-clamp-1 text-lg text-white" style={{ fontWeight: 800 }}>{info.titulo}</p>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-emerald-100/85">
                <span className="inline-flex items-center gap-1"><Store className="h-3 w-3" />{info.anunciante}</span>
                <span className="inline-flex items-center gap-1"><Tag className="h-3 w-3" />{info.categoria}</span>
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{info.cidade}</span>
                <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{info.grupos} grupo{info.grupos === 1 ? '' : 's'}</span>
                <span className="inline-flex items-center gap-1"><Timer className="h-3 w-3" />~2 min</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5" style={{ fontWeight: 700 }}>
                  ⏱ Estimativa: {estimativaTxt}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-emerald-200/80">
                ✅ Postagem confirmada mantém seus grupos ativos na plataforma.
              </p>
            </div>
          </div>

          {/* AÇÃO ÚNICA */}
          <button
            type="button"
            onClick={handlePostar}
            disabled={isActing}
            className="ap-btn flex shrink-0 items-center justify-center gap-2.5 rounded-full px-10 py-5 text-base text-white disabled:opacity-70 lg:px-12"
            style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)', fontWeight: 800, letterSpacing: '.02em' }}
          >
            {isActing ? (
              <>Reservando…</>
            ) : oportunidade.tipo === 'lote' && lotClaimed ? (
              <><CheckCircle className="h-5 w-5" /> CONFIRMAR POSTAGEM</>
            ) : oportunidade.tipo === 'lote' ? (
              <><Send className="h-5 w-5" /> POSTAR AGORA</>
            ) : (
              <><Send className="h-5 w-5" /> POSTAR AGORA</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
