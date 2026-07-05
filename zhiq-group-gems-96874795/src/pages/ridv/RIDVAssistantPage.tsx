import { Sparkles } from 'lucide-react';
import { RIDVAssistant } from '@/components/ridv/RIDVAssistant';
import { MOCK_RIDV_CAMPAIGNS } from '@/components/ridv/RIDVCampaignList';
import { RIDVCampaignCard } from '@/components/ridv/RIDVCampaignCard';

export default function RIDVAssistantPage() {
  return (
    <div className="flex-1 overflow-auto pb-28 bg-background">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-6">

        {/* Section header */}
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-xl"
            style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.20)' }}
          >
            <Sparkles className="h-5 w-5 text-amber-400" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
          </div>
          <div>
            <h2 className="text-base font-black text-foreground/90 leading-none">IA RIDV</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Recomendações inteligentes da Rede de Divulgação
            </p>
          </div>
        </div>

        {/* Assistant card */}
        <RIDVAssistant />

        {/* Recommended campaigns placeholder */}
        <div className="space-y-3">
          <div
            className="rounded-xl px-3 py-2.5 flex items-center gap-2"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400/60 shrink-0" />
            <p className="text-[11px] text-[#A7B0BE]/55 font-medium">
              Campanhas recomendadas pela IA para seu perfil e região:
            </p>
          </div>

          <div className="space-y-3">
            {MOCK_RIDV_CAMPAIGNS.filter((c) => c.priority !== 'normal').slice(0, 3).map((c) => (
              <RIDVCampaignCard
                key={c.id}
                campaign={c}
                compact
                onShare={(id) => console.log('[RIDV] IA share', id)}
                onView={(id) => console.log('[RIDV] IA view', id)}
              />
            ))}
          </div>
        </div>

        {/* Coming soon badge */}
        <div
          className="rounded-2xl p-4 text-center"
          style={{
            background: 'linear-gradient(145deg, #1B1F24, #0D0F12)',
            border: '1px dashed rgba(245,158,11,0.20)',
          }}
        >
          <p className="text-2xl mb-2">🤖</p>
          <p className="text-sm font-black text-[#A7B0BE]/50">Lógica de IA em desenvolvimento</p>
          <p className="text-[11px] text-[#A7B0BE]/30 mt-1 leading-relaxed max-w-[240px] mx-auto">
            Seleção automática por perfil, região e horário de pico. Em breve.
          </p>
        </div>

      </div>
    </div>
  );
}
