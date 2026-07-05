import { usePostadorPremium } from '@/hooks/usePostadorPremium';
import { RIDVResultados } from '@/components/ridv/RIDVResultados';
import { BarChart3 } from 'lucide-react';

export default function RIDVResultadosPage() {
  const { kpis, loadingKpis } = usePostadorPremium();

  return (
    <div className="flex-1 overflow-auto pb-28 bg-background">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">

        {/* Section header */}
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-xl"
            style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.20)' }}
          >
            <BarChart3 className="h-5 w-5 text-sky-400" />
          </div>
          <div>
            <h2 className="text-base font-black text-foreground/90 leading-none">Meus Resultados</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Desempenho das suas campanhas de divulgação
            </p>
          </div>
        </div>

        <RIDVResultados
          /* Dados reais disponíveis via hook */
          visualizacoes={kpis?.posted_count ?? 0}
          /* Demais campos ficarão em "em breve" até integração RIDV */
          isLoading={loadingKpis}
        />

      </div>
    </div>
  );
}
