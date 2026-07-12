import { useEffect, useState } from 'react';

/**
 * RIDVInteligenciaPanel — identidade da IA RIDV incorporada à página
 * Divulgações (a aba própria foi unificada em 2026-07-12; o motor segue
 * vivo por trás do Despachante). Visual laranja suave premium; sem
 * lógica de negócio — apenas presença viva da IA + insights.
 */

const STATUSES = ['Analisando…', 'Otimizando…', 'Calculando…', 'Preparando…', 'Recalculando…'];

const INSIGHTS = [
  { icone: '⏰', texto: 'Melhor horário estimado: 18h às 20h.' },
  { icone: '🍔', texto: 'Hoje restaurantes possuem maior demanda na rede.' },
  { icone: '🎯', texto: 'Sua região possui campanhas aguardando divulgação.' },
  { icone: '💬', texto: 'Você possui grupos compatíveis para novas divulgações.' },
];

export function RIDVInteligenciaPanel() {
  const [statusIdx, setStatusIdx] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setStatusIdx(i => (i + 1) % STATUSES.length), 3200);
    return () => clearInterval(iv);
  }, []);

  return (
    <div
      className="relative overflow-hidden rounded-[22px] p-5"
      style={{
        background: 'rgba(255,255,255,.72)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,.8)',
        boxShadow: '0 1px 2px rgba(91,58,0,.04), 0 18px 44px -20px rgba(255,138,0,.18)',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <style>{`
        @keyframes ridvpScan { 0%{transform:translateX(-120%)} 100%{transform:translateX(320%)} }
        @keyframes ridvpPulse { 0%,100%{opacity:.45; transform:scale(1)} 50%{opacity:1; transform:scale(1.35)} }
        @keyframes ridvpFade { from{opacity:0; transform:translateY(4px)} to{opacity:1; transform:none} }
      `}</style>
      <div className="pointer-events-none absolute left-0 right-0 top-0 h-[2px] overflow-hidden">
        <div className="h-full w-1/3" style={{ background: 'linear-gradient(90deg,transparent,#FFB347,transparent)', animation: 'ridvpScan 3.2s ease-in-out infinite' }} />
      </div>
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl" style={{ background: 'rgba(255,179,71,.22)' }} />

      <div className="relative flex flex-wrap items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl"
          style={{ background: 'linear-gradient(150deg,#FFE7C2,#FFD089,#FFB347)', boxShadow: '0 10px 22px -10px rgba(255,138,0,.5)' }}
        >
          🤖
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base leading-none" style={{ color: '#5B3A00', fontWeight: 800 }}>IA RIDV</p>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px]" style={{ background: 'rgba(0,210,106,.1)', color: '#0f9d58', fontWeight: 700 }}>
              <span className="relative flex h-2 w-2">
                <span className="absolute h-2 w-2 rounded-full bg-emerald-500" style={{ animation: 'ridvpPulse 1.8s ease-in-out infinite' }} />
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              IA ativa
            </span>
            <span key={statusIdx} className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: '#FFE7C2', color: '#B4690E', fontWeight: 700, animation: 'ridvpFade .4s ease-out' }}>
              {STATUSES[statusIdx]}
            </span>
          </div>
          <p className="mt-1 text-[11px]" style={{ color: '#8a6a33' }}>
            Rede Inteligente de Divulgação Viagg — analisando campanhas, profissionais, grupos e oportunidades em tempo real.
          </p>
        </div>
      </div>

      {/* Insights */}
      <div className="relative mt-3 grid gap-1.5 sm:grid-cols-2">
        {INSIGHTS.map((i, idx) => (
          <div key={idx} className="flex items-start gap-2 rounded-xl px-3 py-2"
            style={{ background: 'linear-gradient(135deg,rgba(255,231,194,.5),rgba(255,208,137,.22))', border: '1px solid rgba(255,179,71,.25)' }}>
            <span className="text-sm">{i.icone}</span>
            <p className="text-[11px] leading-snug" style={{ color: '#5B3A00', fontWeight: 600 }}>{i.texto}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
