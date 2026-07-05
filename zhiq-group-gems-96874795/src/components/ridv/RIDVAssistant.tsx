import { cn } from '@/lib/utils';
import { Sparkles, Radio } from 'lucide-react';

interface RIDVAssistantProps {
  /** Sugestão de mensagem da IA (placeholder) */
  message?: string;
  compact?: boolean;
}

const DEFAULT_MESSAGE =
  'Hoje existem campanhas prioritárias disponíveis para sua região. Compartilhe agora e maximize seu impacto!';

const MOCK_SUGGESTIONS = [
  { emoji: '📢', text: 'Restaurante Sabor da Terra está com alta demanda de divulgação.', time: 'Agora' },
  { emoji: '⭐', text: 'Você tem 3 grupos elegíveis para o Hotel Villa Serena.', time: '2h atrás' },
  { emoji: '💡', text: 'Campanha de Vitamina D expira em 5 dias. Divulgue logo!', time: '5h atrás' },
];

export function RIDVAssistant({ message = DEFAULT_MESSAGE, compact = false }: RIDVAssistantProps) {
  return (
    <div className="space-y-3">
      {/* Main card */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #1B1F24 0%, #0D0F12 100%)',
          border: '1px solid rgba(255,149,0,0.30)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.35), 0 0 40px rgba(255,106,0,0.05)',
        }}
      >
        {/* Animated top line */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{
            background: 'linear-gradient(90deg, transparent, #FF6A00, #FF9500, #FF6A00, transparent)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 3s linear infinite',
          }}
        />
        {/* Ambient glow */}
        <div
          className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-20 blur-3xl opacity-10"
          style={{ background: '#FF6A00' }}
        />

        <div className="relative z-10 p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div
                className="relative p-2 rounded-xl"
                style={{ background: 'rgba(255,149,0,0.12)', border: '1px solid rgba(255,149,0,0.22)' }}
              >
                <Sparkles className="h-4 w-4 text-amber-400" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
                {/* Inner glow */}
                <div className="absolute inset-0 rounded-xl bg-amber-500/10 blur-md" />
              </div>
              <div>
                <p className="text-sm font-black text-white leading-none">IA RIDV</p>
                <p className="text-[10px] text-[#A7B0BE]/45 font-medium mt-0.5">Rede Inteligente de Divulgação</p>
              </div>
            </div>
            <span
              className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,106,0,0.12)', color: '#FF9500', border: '1px solid rgba(255,149,0,0.20)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
              Beta
            </span>
          </div>

          {/* Message */}
          <div
            className="rounded-xl p-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-[12px] text-[#A7B0BE]/80 leading-relaxed font-medium">
              🤖 {message}
            </p>
          </div>

          {!compact && (
            <p className="text-[10px] text-[#A7B0BE]/30 text-center mt-3 font-medium">
              Lógica de IA será ativada em breve · apenas interface nesta fase
            </p>
          )}
        </div>
      </div>

      {/* Suggestion list */}
      {!compact && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 text-[#A7B0BE]/35" />
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#A7B0BE]/35">
              Sugestões da IA
            </p>
          </div>

          {MOCK_SUGGESTIONS.map((s, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-xl p-3 transition-all hover:bg-white/[0.02]"
              style={{
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(42,48,56,0.60)',
              }}
            >
              <span className="text-base shrink-0">{s.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-[#A7B0BE]/75 font-medium leading-relaxed">{s.text}</p>
              </div>
              <span className="text-[10px] text-[#A7B0BE]/30 font-medium shrink-0 whitespace-nowrap">{s.time}</span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          from { background-position: 0% 50%; }
          to { background-position: 200% 50%; }
        }
      `}</style>
    </div>
  );
}
