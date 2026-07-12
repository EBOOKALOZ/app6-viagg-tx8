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
  background: 'rgba(255,255,255,.78)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,.85)',
  boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 16px 40px -18px rgba(15,23,42,.14)',
  borderRadius: 22,
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
        <div className="p-5" style={glass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl leading-tight text-slate-900 sm:text-2xl" style={{ fontWeight: 800 }}>{p.titulo}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                {p.categoria && <span className="inline-flex items-center gap-1"><Tag className="h-3 w-3" />{p.categoria}</span>}
                {p.cidade && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{p.cidade}</span>}
              </div>
              {!!p.badges?.length && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.badges.map(b => (
                    <span key={b.label} className="rounded-full px-2.5 py-0.5 text-[10px]"
                      style={{ background: b.bg ?? `${p.accent}18`, color: b.color ?? p.accent, fontWeight: 700 }}>
                      {b.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {p.preco && (
              <div className="shrink-0 text-right">
                <p className="tabular-nums text-2xl sm:text-3xl" style={{ color: p.accent, fontWeight: 800 }}>{p.preco}</p>
                {p.precoSufixo && <p className="text-[11px] text-slate-400">{p.precoSufixo}</p>}
              </div>
            )}
          </div>

          {!!p.caracteristicas?.length && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {p.caracteristicas.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 text-xs text-slate-700" style={{ fontWeight: 600 }}>
                  {c.icone}{c.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Descrição */}
        {p.descricao && (
          <div className="p-5" style={glass}>
            <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}>Descrição</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{p.descricao}</p>
          </div>
        )}

        {/* Especificações */}
        {!!p.especificacoes?.length && (
          <div className="p-5" style={glass}>
            <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}>Especificações</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {p.especificacoes.map(s => (
                <div key={s.label} className="rounded-xl bg-slate-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400" style={{ fontWeight: 700 }}>{s.label}</p>
                  <p className="mt-0.5 truncate text-sm text-slate-800" style={{ fontWeight: 700 }}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mapa (quando aplicável) */}
        {p.mapa && <div className="overflow-hidden" style={glass}>{p.mapa}</div>}

        {/* Seções específicas do módulo */}
        {p.extras}

        {/* Card de interesse inline (logo abaixo do bloco de segurança) */}
        {(p.acoes?.onInteresse || p.acoes?.onContatar) && (
          <div className="p-5 text-center" style={glass}>
            <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}>Gostou deste anúncio?</p>
            <p className="mt-0.5 text-xs" style={{ color: '#64748b' }}>
              Demonstre interesse e o anunciante recebe seu contato com segurança.
            </p>
            <div className="mt-3 flex items-center gap-2">
              {p.acoes?.onFavoritar && (
                <button type="button" onClick={p.acoes.onFavoritar} title="Favoritar"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:text-rose-500">
                  <Heart className="h-5 w-5" />
                </button>
              )}
              <button type="button" onClick={compartilhar} title="Compartilhar"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:text-slate-900">
                <Share2 className="h-5 w-5" />
              </button>
              {p.acoes?.onConversar && (
                <button type="button" onClick={p.acoes.onConversar} title="Conversar"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:text-emerald-600">
                  <MessageCircle className="h-5 w-5" />
                </button>
              )}
              {p.acoes?.onContatar && (
                <button type="button" onClick={p.acoes.onContatar} title="Contatar"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:text-sky-600">
                  <Phone className="h-5 w-5" />
                </button>
              )}
              <button
                type="button"
                onClick={p.acoes?.onInteresse ?? p.acoes?.onContatar}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-sm text-white transition-transform active:scale-[0.98]"
                style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.accent}dd)`, fontWeight: 800, boxShadow: `0 12px 26px -10px ${p.accent}88` }}
              >
                <Star className="h-4 w-4" /> {p.acoes?.interesseLabel ?? 'Tenho Interesse'}
              </button>
            </div>
          </div>
        )}

        {/* Relacionados */}
        {!!p.relacionados?.length && (
          <div className="p-5" style={glass}>
            <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}>Você também pode gostar</p>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
              {p.relacionados.map(r => (
                <a key={r.id} href={r.href}
                  className="dpl-rel w-40 shrink-0 overflow-hidden rounded-2xl border border-slate-100 bg-white">
                  <div className="h-24 w-full bg-slate-100">
                    {r.imagem
                      ? <img src={r.imagem} alt="" className="h-full w-full object-cover" loading="lazy" />
                      : <div className="flex h-full items-center justify-center text-slate-300"><ImageOff className="h-6 w-6" /></div>}
                  </div>
                  <div className="p-2.5">
                    <p className="line-clamp-2 text-[11px] leading-tight text-slate-800" style={{ fontWeight: 700 }}>{r.titulo}</p>
                    {r.preco && <p className="mt-1 tabular-nums text-xs" style={{ color: p.accent, fontWeight: 800 }}>{r.preco}</p>}
                    {r.cidade && <p className="text-[10px] text-slate-400">{r.cidade}</p>}
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
