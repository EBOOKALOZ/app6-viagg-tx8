import { RIDVAssistant } from '@/components/ridv/RIDVAssistant';
import { MOCK_RIDV_CAMPAIGNS } from '@/components/ridv/RIDVCampaignList';
import { RIDVCampaignCard } from '@/components/ridv/RIDVCampaignCard';

/**
 * IA RIDV — centro de inteligência da Rede de Divulgação Viagg.
 * REDESIGN visual premium (laranja suave #FFB347 / texto #5B3A00):
 * toda a lógica preservada — RIDVAssistant, mocks e handlers intactos.
 */

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,.72)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,.8)',
  boxShadow: '0 1px 2px rgba(91,58,0,.04), 0 18px 44px -20px rgba(255,138,0,.18)',
  borderRadius: 22,
};

const INSIGHTS = [
  { icone: '⏰', texto: 'Melhor horário hoje: 18h–20h (pico de atenção nos grupos).' },
  { icone: '🍔', texto: 'Restaurantes possuem a maior procura na sua região agora.' },
  { icone: '📈', texto: 'Divulgações no início da noite têm probabilidade alta de conversão.' },
  { icone: '🎯', texto: 'Existem campanhas aguardando profissionais no Despachante.' },
];

export default function RIDVAssistantPage() {
  return (
    <div
      className="ridv-enter flex-1 overflow-auto pb-28"
      style={{
        background:
          'radial-gradient(900px 320px at 15% -5%, rgba(255,179,71,.14), transparent), ' +
          'radial-gradient(700px 300px at 95% 5%, rgba(255,208,137,.12), transparent), #FAFAF7',
        fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <style>{`
        @keyframes ridvIn { from { opacity:0; transform: translateY(14px);} to { opacity:1; transform:none;} }
        .ridv-enter > div > * { animation: ridvIn .5s ease-out both; }
        .ridv-enter > div > *:nth-child(2){animation-delay:.07s}
        .ridv-enter > div > *:nth-child(3){animation-delay:.14s}
        .ridv-enter > div > *:nth-child(4){animation-delay:.21s}
        .ridv-enter > div > *:nth-child(5){animation-delay:.28s}
        @keyframes ridvPulse { 0%,100%{opacity:.45; transform:scale(1)} 50%{opacity:1; transform:scale(1.35)} }
        @keyframes ridvScan { 0%{transform:translateX(-120%)} 100%{transform:translateX(320%)} }
        .ridv-card { transition: transform .25s ease, box-shadow .25s ease; }
        .ridv-card:hover { transform: translateY(-3px); box-shadow: 0 24px 52px -20px rgba(255,138,0,.3); }
      `}</style>

      <div className="mx-auto max-w-2xl space-y-5 px-4 py-5">

        {/* ── HERO PREMIUM ── */}
        <div className="ridv-card relative overflow-hidden p-6" style={glass}>
          {/* linha de processamento */}
          <div className="pointer-events-none absolute left-0 right-0 top-0 h-[2px] overflow-hidden">
            <div
              className="h-full w-1/3"
              style={{ background: 'linear-gradient(90deg,transparent,#FFB347,transparent)', animation: 'ridvScan 3.2s ease-in-out infinite' }}
            />
          </div>
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl" style={{ background: 'rgba(255,179,71,.25)' }} />

          <div className="relative flex items-start gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl"
              style={{ background: 'linear-gradient(150deg,#FFE7C2,#FFD089,#FFB347)', boxShadow: '0 10px 24px -10px rgba(255,138,0,.5)' }}
            >
              🤖
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl leading-none" style={{ color: '#5B3A00', fontWeight: 800 }}>IA RIDV</h2>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px]"
                  style={{ background: 'rgba(0,210,106,.1)', color: '#0f9d58', fontWeight: 700 }}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="absolute h-2 w-2 rounded-full bg-emerald-500" style={{ animation: 'ridvPulse 1.8s ease-in-out infinite' }} />
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  IA Ativa
                </span>
              </div>
              <p className="mt-1 text-xs" style={{ color: '#5B3A00', fontWeight: 600, opacity: .75 }}>
                Rede Inteligente de Divulgação Viagg
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: '#8a6a33' }}>
                A IA está analisando campanhas, profissionais e oportunidades em tempo real.
              </p>
            </div>
          </div>
        </div>

        {/* ── ASSISTENTE (lógica intacta) ── */}
        <div className="ridv-card overflow-hidden" style={{ ...glass, padding: 6 }}>
          <RIDVAssistant />
        </div>

        {/* ── INSIGHTS INTELIGENTES ── */}
        <div className="ridv-card p-5" style={glass}>
          <p className="text-sm" style={{ color: '#5B3A00', fontWeight: 800 }}>🧠 Insights Inteligentes</p>
          <div className="mt-3 space-y-2">
            {INSIGHTS.map((i, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5"
                style={{ background: 'linear-gradient(135deg,rgba(255,231,194,.55),rgba(255,208,137,.25))', border: '1px solid rgba(255,179,71,.28)' }}
              >
                <span className="text-base">{i.icone}</span>
                <p className="text-xs leading-relaxed" style={{ color: '#5B3A00', fontWeight: 600 }}>{i.texto}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── CAMPANHAS RECOMENDADAS (handlers preservados) ── */}
        <div className="space-y-3">
          <div
            className="flex items-center gap-2 rounded-2xl px-4 py-3"
            style={{ background: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,179,71,.25)', backdropFilter: 'blur(12px)' }}
          >
            <span>🧠</span>
            <p className="text-[11px]" style={{ color: '#5B3A00', fontWeight: 700 }}>
              IA detectou oportunidades compatíveis com seu perfil e região
            </p>
            <span
              className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[9px]"
              style={{ background: '#FFE7C2', color: '#B4690E', fontWeight: 800 }}
            >
              📈 Alta conversão
            </span>
          </div>

          <div className="space-y-3">
            {MOCK_RIDV_CAMPAIGNS.filter((c) => c.priority !== 'normal').slice(0, 3).map((c) => (
              <div key={c.id} className="ridv-card overflow-hidden rounded-[22px]" style={{ boxShadow: '0 14px 34px -18px rgba(255,138,0,.25)' }}>
                <RIDVCampaignCard
                  campaign={c}
                  compact
                  onShare={(id) => console.log('[RIDV] IA share', id)}
                  onView={(id) => console.log('[RIDV] IA view', id)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── EM DESENVOLVIMENTO ── */}
        <div
          className="ridv-card p-5 text-center"
          style={{ ...glass, border: '1.5px dashed rgba(255,179,71,.45)' }}
        >
          <p className="mb-1 text-2xl">🛰️</p>
          <p className="text-sm" style={{ color: '#5B3A00', fontWeight: 800 }}>Motor de seleção automática em evolução</p>
          <p className="mx-auto mt-1 max-w-[280px] text-[11px] leading-relaxed" style={{ color: '#8a6a33' }}>
            Seleção por perfil, região e horário de pico ganhará novas camadas de inteligência em breve.
          </p>
        </div>

      </div>
    </div>
  );
}
