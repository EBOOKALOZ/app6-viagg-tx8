import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Store, Users, Eye, MousePointerClick, Send, MapPin, Trophy,
  Flame, Crown, Rocket, Sparkles, Medal, Gem, Target, Clock,
} from 'lucide-react';

/**
 * MEU IMPACTO — dashboard executivo futurista (RIDV).
 * Dados 100% reais via RPC ridv_meu_impacto (posting_history,
 * campaign_queue.origem, whatsapp_groups, posting_lots). Sem regra
 * de negócio nova — apenas leitura + visual premium.
 */

const NEON = { verde: '#00D26A', azul: '#3B82F6', roxo: '#7C3AED', laranja: '#FF8A00' };

const NIVEIS = [
  { nome: 'Iniciante', icone: '🌱', min: 0 },
  { nome: 'Colaborador', icone: '🚀', min: 5 },
  { nome: 'Parceiro', icone: '⭐', min: 20 },
  { nome: 'Destaque Regional', icone: '💎', min: 50 },
  { nome: 'Embaixador Viagg', icone: '👑', min: 100 },
];

const ORIGEM_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  patrocinada: { label: '⭐ Patrocinada', bg: 'rgba(124,58,237,.12)', color: NEON.roxo },
  pacote: { label: '💳 Paga', bg: 'rgba(59,130,246,.12)', color: NEON.azul },
  gratuita_diaria: { label: '🎁 Gratuita', bg: 'rgba(255,138,0,.12)', color: NEON.laranja },
  organica: { label: '📢 Orgânica', bg: 'rgba(100,116,139,.12)', color: '#64748b' },
};

function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0);
  const done = useRef(false);
  useEffect(() => {
    if (done.current && v === target) return;
    const start = performance.now(); const from = v;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setV(Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick); else done.current = true;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return v;
}

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,.66)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,.75)',
  boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 18px 48px -20px rgba(15,23,42,.16)',
  borderRadius: 24,
};

function Tile({ icon, label, value, color, sub }: {
  icon: React.ReactNode; label: string; value: number; color: string; sub?: string;
}) {
  const n = useCountUp(value);
  return (
    <div className="imp-card p-4 text-center" style={glass}>
      <div
        className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl text-lg"
        style={{ background: `${color}18`, color, boxShadow: `0 0 18px -6px ${color}66` }}
      >
        {icon}
      </div>
      <p className="mt-2 tabular-nums text-2xl text-slate-900" style={{ fontWeight: 800 }}>
        {n.toLocaleString('pt-BR')}
      </p>
      <p className="text-[10px] uppercase tracking-widest" style={{ color: '#94a3b8', fontWeight: 700 }}>{label}</p>
      {sub && <p className="mt-0.5 text-[10px]" style={{ color }}>{sub}</p>}
    </div>
  );
}

export default function RIDVImpactoPage() {
  const { user } = useAuth();
  const { data: imp, isLoading } = useQuery({
    queryKey: ['ridv-meu-impacto', user?.id],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('ridv_meu_impacto');
      if (error) throw error;
      return data as any;
    },
  });

  const nome = (user?.user_metadata?.name || user?.email || 'Profissional').split(' ')[0].split('@')[0];
  const hora = new Date().getHours();
  const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  const post = imp?.postagens ?? 0;
  const nivel = [...NIVEIS].reverse().find(n => post >= n.min) ?? NIVEIS[0];
  const prox = NIVEIS.find(n => n.min > post);
  const pctNivel = prox ? Math.min(100, Math.round(((post - nivel.min) / (prox.min - nivel.min)) * 100)) : 100;
  const cresc = imp?.postagens_mes_anterior > 0
    ? Math.round(((imp.postagens_mes - imp.postagens_mes_anterior) / imp.postagens_mes_anterior) * 100)
    : null;

  const resumoIA = useMemo(() => {
    if (!imp) return '';
    if (post === 0) return 'Sua jornada de impacto começa na primeira divulgação confirmada. A IA já tem oportunidades preparadas para você no Despachante.';
    const p: string[] = [`Suas ${post} divulgações já ajudaram ${imp.empresas} empresa${imp.empresas === 1 ? '' : 's'} e alcançaram ~${Number(imp.pessoas).toLocaleString('pt-BR')} pessoas em ${imp.grupos} grupo${imp.grupos === 1 ? '' : 's'}.`];
    if (cresc != null && cresc > 0) p.push(`Você cresceu ${cresc}% este mês.`);
    p.push('Continue divulgando para aumentar ainda mais seu impacto na economia local.');
    return p.join(' ');
  }, [imp, post, cresc]);

  const insights = useMemo(() => {
    if (!imp) return [];
    const list: string[] = [];
    if (imp.melhor_hora) list.push(`Suas divulgações por volta das ${imp.melhor_hora}h têm o melhor desempenho — priorize essa faixa.`);
    if (imp.cidades?.[0]) list.push(`${imp.cidades[0].cidade} é sua praça mais forte, com ${imp.cidades[0].n} postagens confirmadas.`);
    if ((imp.streak_dias ?? 0) >= 2) list.push(`Você está há ${imp.streak_dias} dias consecutivos ativos — regularidade acelera sua evolução de nível.`);
    if (post > 0 && imp.postagens_semana === 0) list.push('Sem postagens nos últimos 7 dias — uma divulgação hoje reativa seu ritmo e seus grupos.');
    if (!list.length) list.push('Complete sua primeira divulgação para a IA começar a gerar insights personalizados do seu desempenho.');
    return list;
  }, [imp, post]);

  const conquistas = [
    { icone: '🏅', nome: 'Primeira divulgação', ok: post >= 1 },
    { icone: '🥇', nome: '100 divulgações', ok: post >= 100 },
    { icone: '🏆', nome: '1.000 pessoas alcançadas', ok: (imp?.pessoas ?? 0) >= 1000 },
    { icone: '💎', nome: '100 empresas ajudadas', ok: (imp?.empresas ?? 0) >= 100 },
    { icone: '🚀', nome: '30 dias consecutivos', ok: (imp?.streak_dias ?? 0) >= 30 },
    { icone: '🔥', nome: 'Top 3 da cidade', ok: (imp?.rank_cidade ?? 99) <= 3 && post > 0 },
    { icone: '👑', nome: 'Embaixador Viagg', ok: post >= 100 },
  ];

  const metas = [
    { label: 'Hoje', alvo: 2, atual: imp?.postagens_hoje ?? 0, cor: NEON.verde },
    { label: 'Semana', alvo: 10, atual: imp?.postagens_semana ?? 0, cor: NEON.azul },
    { label: 'Mês', alvo: 40, atual: imp?.postagens_mes ?? 0, cor: NEON.roxo },
  ];

  const porDia: { d: string; n: number }[] = imp?.por_dia ?? [];
  const maxDia = Math.max(1, ...porDia.map(x => x.n));
  const maxCid = Math.max(1, ...(imp?.cidades ?? []).map((c: any) => c.n));

  if (isLoading) {
    return (
      <div className="min-h-screen space-y-4 p-4" style={{ background: '#F4F7FB' }}>
        {[1, 2, 3].map(i => <div key={i} className="h-40 animate-pulse rounded-[24px] bg-white/70" />)}
      </div>
    );
  }

  return (
    <div
      className="imp-enter min-h-screen flex-1 space-y-5 p-4 pb-28 sm:p-6"
      style={{ background: 'radial-gradient(1200px 400px at 20% -10%, rgba(0,210,106,.08), transparent), radial-gradient(900px 400px at 90% 0%, rgba(124,58,237,.07), transparent), #F4F7FB', fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <style>{`
        @keyframes impIn { from { opacity:0; transform: translateY(14px);} to { opacity:1; transform:none;} }
        .imp-enter > * { animation: impIn .5s ease-out both; }
        .imp-enter > *:nth-child(2){animation-delay:.06s}.imp-enter > *:nth-child(3){animation-delay:.12s}
        .imp-enter > *:nth-child(4){animation-delay:.18s}.imp-enter > *:nth-child(5){animation-delay:.24s}
        .imp-card{transition:transform .25s ease, box-shadow .25s ease}
        .imp-card:hover{transform:translateY(-3px); box-shadow:0 22px 50px -20px rgba(15,23,42,.25)}
        @keyframes impGlow{0%,100%{opacity:.5}50%{opacity:1}}
      `}</style>

      {/* HERO */}
      <div className="relative overflow-hidden p-6 sm:p-8" style={{ ...glass }}>
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ background: 'rgba(0,210,106,.16)', animation: 'impGlow 4s ease-in-out infinite' }} />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full blur-3xl" style={{ background: 'rgba(124,58,237,.12)' }} />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <p className="text-2xl text-slate-900 sm:text-3xl" style={{ fontWeight: 800 }}>
              👋 {saud}, <span style={{ color: NEON.verde }}>{nome}</span>.
            </p>
            <p className="mt-1 text-sm text-slate-600" style={{ fontWeight: 600 }}>
              Hoje você está ajudando empresas da sua cidade a vender mais.
            </p>
            <div className="mt-3 flex items-start gap-2 rounded-2xl px-4 py-3" style={{ background: 'rgba(0,210,106,.08)', border: '1px solid rgba(0,210,106,.2)' }}>
              <span>🧠</span>
              <p className="text-xs leading-relaxed text-slate-700">{resumoIA}</p>
            </div>
          </div>
          {/* Nível */}
          <div className="w-full max-w-sm rounded-3xl p-5" style={{ background: 'linear-gradient(150deg,#0b1220,#111c33)', boxShadow: '0 20px 44px -18px rgba(2,6,23,.55)' }}>
            <p className="text-[10px] uppercase tracking-[.2em] text-white/50" style={{ fontWeight: 700 }}>Seu nível</p>
            <p className="mt-1 text-xl text-white" style={{ fontWeight: 800 }}>{nivel.icone} {nivel.nome}</p>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pctNivel}%`, background: `linear-gradient(90deg,${NEON.verde},#22c55e)`, boxShadow: `0 0 14px ${NEON.verde}88` }} />
            </div>
            <p className="mt-2 text-[11px] text-white/60">
              {prox ? <>Faltam <strong className="text-white">{prox.min - post}</strong> postagens para {prox.icone} {prox.nome}</> : 'Nível máximo — Embaixador Viagg 👑'}
            </p>
          </div>
        </div>
      </div>

      {/* IMPACTO NA ECONOMIA */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Tile icon={<Send className="h-5 w-5" />} label="Divulgações" value={post} color={NEON.verde}
          sub={cresc != null ? `${cresc >= 0 ? '+' : ''}${cresc}% no mês` : undefined} />
        <Tile icon={<Store className="h-5 w-5" />} label="Empresas ajudadas" value={imp?.empresas ?? 0} color={NEON.laranja} />
        <Tile icon={<Users className="h-5 w-5" />} label="Pessoas alcançadas" value={imp?.pessoas ?? 0} color={NEON.roxo} />
        <Tile icon={<Eye className="h-5 w-5" />} label="Grupos ativados" value={imp?.grupos ?? 0} color={NEON.azul} />
        <Tile icon={<MousePointerClick className="h-5 w-5" />} label="Cliques" value={imp?.cliques ?? 0} color={NEON.verde} />
        <Tile icon={<Flame className="h-5 w-5" />} label="Dias seguidos" value={imp?.streak_dias ?? 0} color={NEON.laranja} />
      </div>

      {/* GRÁFICO 14 DIAS + MAPA DE IMPACTO */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="p-5" style={glass}>
          <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}>📈 Divulgações — últimos 14 dias</p>
          {porDia.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">Sem atividade no período.</p>
          ) : (
            <div className="mt-4 flex h-28 items-end gap-1.5">
              {porDia.map(x => (
                <div key={x.d} className="group flex flex-1 flex-col items-center gap-1" title={`${x.d}: ${x.n}`}>
                  <div className="w-full max-w-[22px] rounded-t-lg transition-all group-hover:brightness-110"
                    style={{ height: `${(x.n / maxDia) * 100}%`, minHeight: 6, background: `linear-gradient(180deg,${NEON.verde},#16a34a)`, boxShadow: `0 0 12px -2px ${NEON.verde}66` }} />
                  <span className="text-[8px] text-slate-400">{x.d.slice(8)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-5" style={glass}>
          <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}>🗺️ Mapa de impacto — onde você atua</p>
          {!imp?.cidades?.length ? (
            <p className="py-8 text-center text-xs text-slate-400">Suas cidades aparecem aqui após as primeiras postagens.</p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {imp.cidades.map((c: any) => (
                <div key={c.cidade} className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: NEON.azul }} />
                  <span className="w-28 truncate text-xs text-slate-700" style={{ fontWeight: 600 }}>{c.cidade}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${(c.n / maxCid) * 100}%`, background: `linear-gradient(90deg,${NEON.azul},${NEON.roxo})`, boxShadow: `0 0 10px ${NEON.azul}55` }} />
                  </div>
                  <span className="tabular-nums text-xs text-slate-500">{c.n}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* INSIGHTS + RANKING + METAS */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="p-5" style={glass}>
          <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}>🧠 Insights Inteligentes</p>
          <div className="mt-3 space-y-2">
            {insights.map((t, i) => (
              <div key={i} className="rounded-xl px-3 py-2 text-xs leading-relaxed text-slate-700" style={{ background: 'rgba(124,58,237,.07)', border: '1px solid rgba(124,58,237,.14)' }}>
                {t}
              </div>
            ))}
          </div>
        </div>
        <div className="p-5 text-center" style={glass}>
          <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}>🏆 Ranking</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl p-4" style={{ background: 'rgba(0,210,106,.08)', border: '1px solid rgba(0,210,106,.2)' }}>
              <p className="tabular-nums text-3xl" style={{ fontWeight: 800, color: NEON.verde }}>{imp?.rank_cidade ?? '—'}º</p>
              <p className="text-[10px] uppercase tracking-widest text-slate-500" style={{ fontWeight: 700 }}>{imp?.cidade || 'Sua cidade'}</p>
            </div>
            <div className="rounded-2xl p-4" style={{ background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.2)' }}>
              <p className="tabular-nums text-3xl" style={{ fontWeight: 800, color: NEON.azul }}>{imp?.rank_geral ?? '—'}º</p>
              <p className="text-[10px] uppercase tracking-widest text-slate-500" style={{ fontWeight: 700 }}>Brasil</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">Você está entre os melhores profissionais da sua região. 🚀</p>
        </div>
        <div className="p-5" style={glass}>
          <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}><Target className="mr-1 inline h-4 w-4" style={{ color: NEON.laranja }} />Metas inteligentes</p>
          <div className="mt-3 space-y-3">
            {metas.map(m => {
              const pct = Math.min(100, Math.round((m.atual / m.alvo) * 100));
              return (
                <div key={m.label}>
                  <div className="flex justify-between text-[11px]" style={{ fontWeight: 700 }}>
                    <span className="text-slate-600">{m.label}</span>
                    <span style={{ color: m.cor }}>{m.atual}/{m.alvo} divulgações</span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: m.cor, boxShadow: `0 0 10px ${m.cor}66` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CONQUISTAS */}
      <div className="p-5" style={glass}>
        <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}>🎖️ Conquistas</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {conquistas.map(c => (
            <div key={c.nome} className="imp-card rounded-2xl p-3 text-center"
              style={{ background: c.ok ? 'rgba(124,58,237,.09)' : 'rgba(148,163,184,.08)', border: `1px solid ${c.ok ? 'rgba(124,58,237,.25)' : 'rgba(148,163,184,.18)'}`, opacity: c.ok ? 1 : .55 }}>
              <p className="text-2xl" style={{ filter: c.ok ? 'none' : 'grayscale(1)' }}>{c.icone}</p>
              <p className="mt-1 text-[10px] leading-tight text-slate-700" style={{ fontWeight: 700 }}>{c.nome}</p>
              <p className="text-[9px]" style={{ color: c.ok ? NEON.roxo : '#94a3b8', fontWeight: 700 }}>{c.ok ? 'Desbloqueada' : 'Bloqueada'}</p>
            </div>
          ))}
        </div>
      </div>

      {/* TIMELINE PREMIUM */}
      <div className="p-5" style={glass}>
        <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}>🕓 Linha do tempo das divulgações</p>
        {!imp?.timeline?.length ? (
          <p className="py-8 text-center text-xs text-slate-400">
            Suas divulgações confirmadas aparecem aqui — a primeira está a um POSTAR AGORA de distância. 🚀
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {imp.timeline.map((t: any) => {
              const b = ORIGEM_BADGE[t.origem] ?? ORIGEM_BADGE.organica;
              return (
                <div key={t.id} className="imp-card flex items-center gap-3 rounded-2xl border border-slate-100 bg-white/80 p-3">
                  {t.imagem
                    ? <img src={t.imagem} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                    : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg">📢</div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-xs text-slate-900" style={{ fontWeight: 700 }}>{t.titulo}</p>
                      <span className="rounded-full px-2 py-0.5 text-[9px]" style={{ background: b.bg, color: b.color, fontWeight: 700 }}>{b.label}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[10px] text-slate-500">
                      {t.empresa} · {t.categoria}{t.cidade ? ` · ${t.cidade}` : ''}{t.grupo ? ` · 💬 ${t.grupo}` : ''}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-[10px] text-slate-400">
                    <Clock className="mr-0.5 inline h-3 w-3" />
                    {new Date(t.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
