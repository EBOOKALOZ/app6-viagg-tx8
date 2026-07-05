import { Globe2 } from 'lucide-react';
import { RIDVImpact } from '@/components/ridv/RIDVImpact';
import { RIDVHistory } from '@/components/ridv/RIDVHistory';

export default function RIDVImpactoPage() {
  return (
    <div className="flex-1 overflow-auto pb-28 bg-background">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-6">

        {/* Section header */}
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-xl"
            style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.20)' }}
          >
            <Globe2 className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <h2 className="text-base font-black text-foreground/90 leading-none">Meu Impacto</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Sua contribuição para a economia local
            </p>
          </div>
        </div>

        {/* Impact panel */}
        <RIDVImpact />

        {/* History section */}
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#A7B0BE]/40 px-0.5">
            📚 Histórico de Participação
          </p>
          <RIDVHistory />
        </div>

      </div>
    </div>
  );
}
