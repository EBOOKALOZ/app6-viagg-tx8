import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Heart, Share2, MessageCircle,
  Phone, Star, MapPin, Tag, X, PlayCircle, ImageOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * DetailPageLayout — padrão ÚNICO de página de detalhes da plataforma.
 * Todos os módulos (Mercado, Imóveis, Veículos, Serviços, Fretes, Viagens)
 * usam esta casca; muda apenas o conteúdo e a cor de destaque (accent).
 * Estrutura fixa: Voltar → Galeria → Infos → Características → Descrição →
 * Especificações → Mapa/extras → Ações fixas → Relacionados → Avaliações.
 */

export interface DetailSpec { label: string; value: string }
export interface DetailRelated {
  id: string; titulo: string; imagem?: string | null;
  preco?: string | null; cidade?: string | null; href: string;
}
export interface DetailActions {
  onFavoritar?: () => void;
  onCompartilhar?: () => void;   // default: share/copy do link atual
  onConversar?: () => void;
  onContatar?: () => void;
  onInteresse?: () => void;
  interesseLabel?: string;
}

export interface DetailPageLayoutProps {
  accent: string;                 // cor do módulo (ex.: '#16a34a' mercado)
  moduloLabel: string;            // ex.: 'Imóveis'
  titulo: string;
  preco?: string | null;
  precoSufixo?: string | null;    // ex.: '/diária'
  categoria?: string | null;
  cidade?: string | null;
  badges?: { label: string; bg?: string; color?: string }[];
  imagens: string[];              // galeria (primeira = principal)
  videoUrl?: string | null;
  caracteristicas?: { icone?: ReactNode; label: string }[];
  descricao?: string | null;
  especificacoes?: DetailSpec[];
  mapa?: ReactNode;               // slot opcional (mapa quando aplicável)
  extras?: ReactNode;             // seções específicas do módulo
  acoes?: DetailActions;
  relacionados?: DetailRelated[];
  avaliacoes?: ReactNode;         // slot opcional
  loading?: boolean;
  bg?: string;
}

const glass: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid rgba(228, 228, 231, 0.9)',
  boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.06), 0 12px 36px -8px rgba(0, 0, 0, 0.04)',
  borderRadius: '24px',
};

export function DetailPageLayout(p: DetailPageLayoutProps) {
  const navigate = useNavigate();
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const imgs = p.imagens.filter(Boolean);
  const total = imgs.length;

  useEffect(() => { setIdx(0); }, [p.titulo]);

  const prev = () => setIdx(i => (i - 1 + total) % total);
  const next = () => setIdx(i => (i + 1) % total);

  const compartilhar = p.acoes?.onCompartilhar ?? (async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: p.titulo, url });
      else { await navigator.clipboard.writeText(url); toast.success('Link copiado!'); }
    } catch { /* cancelado */ }
  });

  if (p.loading) {
    return (
      <div className="min-h-screen space-y-4 p-4" style={{ background: '#F4F7FB' }}>
        <div className="h-10 w-28 animate-pulse rounded-full bg-white/80" />
        <div className="h-[340px] animate-pulse rounded-[22px] bg-white/80" />
        <div className="h-40 animate-pulse rounded-[22px] bg-white/80" />
      </div>
    );
  }

  return (
    <div
      className="dpl-enter min-h-screen pb-10"
      style={{
        background: p.bg ? p.bg : `radial-gradient(900px 300px at 15% -5%, ${p.accent}14, transparent), #F4F7FB`,
        fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <style>{`
        @keyframes dplIn { from{opacity:0; transform:translateY(12px)} to{opacity:1; transform:none} }
        .dpl-enter > div > * { animation: dplIn .45s ease-out both; }
        .dpl-enter > div > *:nth-child(2){animation-delay:.05s}.dpl-enter > div > *:nth-child(3){animation-delay:.1s}
        .dpl-enter > div > *:nth-child(4){animation-delay:.15s}.dpl-enter > div > *:nth-child(5){animation-delay:.2s}
        .dpl-thumb { transition: transform .2s ease, box-shadow .2s ease; }
        .dpl-thumb:hover { transform: translateY(-2px); }
        .dpl-rel { transition: transform .25s ease, box-shadow .25s ease; }
        .dpl-rel:hover { transform: translateY(-4px); box-shadow: 0 18px 40px -16px rgba(15,23,42,.22); }
      `}</style>

      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4">

        {/* ← Voltar */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs text-slate-700 shadow-sm transition-all hover:shadow-md"
          style={{ fontWeight: 700 }}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </button>

        {/* Galeria Premium */}
        <div className="overflow-hidden" style={glass}>
          <div className="relative h-[280px] w-full bg-slate-100 sm:h-[380px]">
            {imgs[idx] ? (
              <img
                src={imgs[idx]} alt={p.titulo}
                className="h-full w-full cursor-zoom-in object-cover"
                onClick={() => setZoom(true)}
                loading="eager"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-300">
                <ImageOff className="h-12 w-12" />
              </div>
            )}
            <span
              className="absolute left-3 top-3 rounded-full px-3 py-1 text-[10px] uppercase tracking-wider text-white"
              style={{ background: p.accent, fontWeight: 800 }}
            >
              {p.moduloLabel}
            </span>
            {p.videoUrl && (
              <button
                type="button"
                onClick={() => setShowVideo(true)}
                className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-[11px] text-white backdrop-blur"
                style={{ fontWeight: 700 }}
              >
                <PlayCircle className="h-3.5 w-3.5" /> Vídeo
              </button>
            )}
            {total > 1 && (
              <>
                <button type="button" onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 shadow-md hover:bg-white">
                  <ChevronLeft className="h-4 w-4 text-slate-700" />
                </button>
                <button type="button" onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 shadow-md hover:bg-white">
                  <ChevronRight className="h-4 w-4 text-slate-700" />
                </button>
                <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] text-white backdrop-blur" style={{ fontWeight: 700 }}>
                  {idx + 1}/{total}
                </span>
              </>
            )}
          </div>
          {total > 1 && (
            <div className="flex gap-2 overflow-x-auto p-3">
              {imgs.map((src, i) => (
                <button key={i} type="button" onClick={() => setIdx(i)}
                  className={cn('dpl-thumb h-14 w-20 shrink-0 overflow-hidden rounded-xl border-2', i === idx ? '' : 'border-transparent opacity-70')}
                  style={i === idx ? { borderColor: p.accent } : undefined}>
                  <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Informações principais */}
        <div className="p-6 sm:p-7 space-y-5" style={glass}>
          {/* Categoria / Badges no topo (sem competir com título/preço) */}
          {(p.categoria || (p.badges && p.badges.length > 0)) && (
            <div className="flex items-center flex-wrap gap-2">
              {p.categoria && (
                <span className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black uppercase tracking-wider text-white shadow-xs"
                  style={{ background: p.accent }}>
                  <Tag className="h-3.5 w-3.5 shrink-0" />
                  <span>{p.categoria}</span>
                </span>
              )}
              {p.badges?.map(b => (
                <span key={b.label} className="rounded-xl px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider shadow-2xs"
                  style={{ background: b.bg ?? `${p.accent}18`, color: b.color ?? p.accent }}>
                  {b.label}
                </span>
              ))}
            </div>
          )}

          {/* Título + Localização (largura integral p/ evitar esmagamento) */}
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-zinc-900 leading-tight tracking-tight">
              {p.titulo}
            </h1>
            {p.cidade && (
              <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-zinc-500">
                <MapPin className="h-4 w-4 shrink-0 text-sky-500" />
                <span>{p.cidade}</span>
              </div>
            )}
          </div>

          {/* Destaque Exclusivo de Valor / Preço */}
          {p.preco && (
            <div className="rounded-2xl bg-zinc-50 border border-zinc-100 p-4 sm:p-5 flex flex-wrap items-baseline justify-between gap-4 shadow-2xs">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-0.5">
                  Valor do {p.moduloLabel?.slice(0, -1) || 'Item'}
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="tabular-nums text-2xl sm:text-3xl font-black tracking-tight" style={{ color: p.accent }}>
                    {p.preco}
                  </span>
                  {p.precoSufixo && <span className="text-xs font-bold text-zinc-400">{p.precoSufixo}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Características / Especificações Rápidas (filtrando duplicatas exatas do topo) */}
          {(() => {
            const filtered = (p.caracteristicas || []).filter(
              c => c.label !== p.categoria && c.label !== p.cidade && !p.cidade?.includes(c.label)
            );
            if (filtered.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-2.5 pt-2 border-t border-zinc-100">
                {filtered.map((c, i) => (
                  <div key={i} className="inline-flex items-center gap-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/60 px-3.5 py-2 text-xs font-bold text-zinc-700 transition-all">
                    <span className="text-sky-600 shrink-0 flex items-center justify-center">{c.icone}</span>
                    <span>{c.label}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Descrição */}
        {p.descricao && (
          <div className="p-6 sm:p-7 space-y-3" style={glass}>
            <p className="text-sm font-black text-zinc-900 uppercase tracking-wider">Descrição</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 font-medium">{p.descricao}</p>
          </div>
        )}

        {/* Especificações */}
        {!!p.especificacoes?.length && (
          <div className="p-6 sm:p-7 space-y-4" style={glass}>
            <p className="text-sm font-black text-zinc-900 uppercase tracking-wider">Especificações</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {p.especificacoes.map(s => (
                <div key={s.label} className="rounded-2xl bg-zinc-50 border border-zinc-100 px-4 py-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">{s.label}</p>
                  <p className="mt-1 truncate text-sm font-bold text-zinc-800">{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mapa (quando aplicável) */}
        {p.mapa && <div className="overflow-hidden rounded-[24px]" style={glass}>{p.mapa}</div>}

        {/* Seções específicas do módulo */}
        {p.extras}

        {/* Card de interesse inline (logo abaixo do bloco de segurança) */}
        {(p.acoes?.onInteresse || p.acoes?.onContatar) && (
          <div className="p-6 sm:p-7 text-center space-y-3" style={glass}>
            <p className="text-base font-black text-zinc-900">Gostou deste anúncio?</p>
            <p className="text-xs font-medium text-zinc-500 max-w-md mx-auto">
              Demonstre interesse e o anunciante recebe seu contato com segurança.
            </p>
            <div className="mt-4 flex items-center gap-2.5">
              {p.acoes?.onFavoritar && (
                <button type="button" onClick={p.acoes.onFavoritar} title="Favoritar"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-600 hover:text-rose-500 hover:shadow-sm transition-all">
                  <Heart className="h-5 w-5" />
                </button>
              )}
              <button type="button" onClick={compartilhar} title="Compartilhar"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900 hover:shadow-sm transition-all">
                <Share2 className="h-5 w-5" />
              </button>
              {p.acoes?.onConversar && (
                <button type="button" onClick={p.acoes.onConversar} title="Conversar"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-600 hover:text-emerald-600 hover:shadow-sm transition-all">
                  <MessageCircle className="h-5 w-5" />
                </button>
              )}
              {p.acoes?.onContatar && (
                <button type="button" onClick={p.acoes.onContatar} title="Contatar"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-600 hover:text-sky-600 hover:shadow-sm transition-all">
                  <Phone className="h-5 w-5" />
                </button>
              )}
              <button
                type="button"
                onClick={p.acoes?.onInteresse ?? p.acoes?.onContatar}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-black text-zinc-900 transition-all hover:opacity-95 active:scale-[0.98]"
                style={{ background: '#68c7f2', boxShadow: '0 8px 24px -6px rgba(104,199,242,0.6)' }}
              >
                <Star className="h-4 w-4" /> {p.acoes?.interesseLabel ?? 'Tenho Interesse'}
              </button>
            </div>
          </div>
        )}

        {/* Relacionados */}
        {!!p.relacionados?.length && (
          <div className="p-6 sm:p-7 space-y-4" style={glass}>
            <p className="text-sm font-black text-zinc-900 uppercase tracking-wider">Você também pode gostar</p>
            <div className="flex gap-3.5 overflow-x-auto pb-2">
              {p.relacionados.map(r => (
                <a key={r.id} href={r.href}
                  className="dpl-rel w-44 shrink-0 overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-xs hover:shadow-md transition-all flex flex-col">
                  <div className="h-28 w-full bg-zinc-100 relative overflow-hidden shrink-0">
                    {r.imagem
                      ? <img src={r.imagem} alt="" className="h-full w-full object-cover transition-transform duration-300 hover:scale-105" loading="lazy" />
                      : <div className="flex h-full items-center justify-center text-zinc-300"><ImageOff className="h-6 w-6" /></div>}
                  </div>
                  <div className="p-3 flex flex-col flex-1 justify-between">
                    <div>
                      <p className="line-clamp-2 text-xs font-bold leading-tight text-zinc-800">{r.titulo}</p>
                      {r.cidade && <p className="text-[11px] font-medium text-zinc-400 mt-1 truncate">{r.cidade}</p>}
                    </div>
                    {r.preco && <p className="mt-2 tabular-nums text-xs font-black" style={{ color: p.accent }}>{r.preco}</p>}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Avaliações */}
        {p.avaliacoes}
      </div>

      {/* Zoom */}
      {zoom && imgs[idx] && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/90 p-4" onClick={() => setZoom(false)}>
          <button type="button" className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white"><X className="h-5 w-5" /></button>
          {total > 1 && (
            <button type="button" onClick={e => { e.stopPropagation(); prev(); }} className="absolute left-3 rounded-full bg-white/15 p-2.5 text-white"><ChevronLeft className="h-5 w-5" /></button>
          )}
          <img src={imgs[idx]} alt="" className="max-h-full max-w-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />
          {total > 1 && (
            <button type="button" onClick={e => { e.stopPropagation(); next(); }} className="absolute right-3 rounded-full bg-white/15 p-2.5 text-white"><ChevronRight className="h-5 w-5" /></button>
          )}
        </div>
      )}

      {/* Vídeo */}
      {showVideo && p.videoUrl && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/90 p-4" onClick={() => setShowVideo(false)}>
          <video src={p.videoUrl} controls autoPlay className="max-h-full w-full max-w-2xl rounded-xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
