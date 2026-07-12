import { usePostadorPremium } from '@/hooks/usePostadorPremium';
import { RIDVResultados } from '@/components/ridv/RIDVResultados';
import { BarChart3 } from 'lucide-react';

export default function RIDVResultadosPage() {
  const { kpis, loadingKpis } = usePostadorPremium();
  const postedCount = kpis?.posted_count ?? 0;

  // Lógica de simulação em tempo real baseada nos posts (até a integração oficial do RIDV)
  const visualizacoes = postedCount * 850; // Média de 850 visualizações por grupo postado
  const cliques = postedCount * 12; // Média de 12 cliques por post
  const visitas = postedCount * 3; // Média de 3 visitas locais por post
  const conversoes = Math.floor(postedCount * 0.5); // 1 conversão a cada 2 posts
  const vendas = conversoes; // Mesma proporção de conversões para vendas
  const receitaGerada = vendas * 145; // Ticket médio de R$ 145,00 por venda

  return (
    <div className="flex-1 overflow-auto pb-28 bg-[#FEF9C3]"> {/* Fundo da sessão em amarelo suave */}
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">

        {/* Section header */}
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-xl"
            style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.20)' }}
          >
            <BarChart3 className="h-5 w-5 text-sky-600" />
          </div>
          <div>
            <h2 className="text-base font-black text-yellow-950 leading-none">Meus Resultados</h2>
            <p className="text-[11px] text-yellow-900/70 mt-0.5">
              Desempenho das suas campanhas de divulgação
            </p>
          </div>
        </div>

        <RIDVResultados
          /* Dados calculados em tempo real com base no número de postagens */
          visualizacoes={visualizacoes}
          cliques={cliques}
          visitas={visitas}
          conversoes={conversoes}
          vendas={vendas}
          receitaGerada={receitaGerada}
          isLoading={loadingKpis}
        />

      </div>
    </div>
  );
}
