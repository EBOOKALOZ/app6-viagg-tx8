import { useEffect, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Search, Loader2, Package, Home, Car, Wrench, Plane, ArrowRight } from "lucide-react";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { GlobalSearchService, GlobalSearchResult, SearchCategory } from "@/services/GlobalSearchService";
import { formatCurrencyBRL } from "@/lib/utils";

export function GlobalSearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [activeTab, setActiveTab] = useState<SearchCategory | 'all'>('all');

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      return;
    }

    let active = true;
    setIsLoading(true);

    GlobalSearchService.searchAll(query).then((data) => {
      if (!active) return;
      setResults(data);
      setIsLoading(false);
    });

    return () => { active = false; };
  }, [query]);

  // Grouping results
  const groupedResults = useMemo(() => {
    const groups: Record<string, GlobalSearchResult[]> = {
      mercado: [], imoveis: [], veiculos: [], servicos: [], viagens: [], fretes: []
    };
    results.forEach(r => groups[r.category].push(r));
    return groups;
  }, [results]);

  const filteredResults = activeTab === 'all' ? results : groupedResults[activeTab];

  const getCategoryIcon = (category: string) => {
    switch(category) {
      case 'mercado': return <Package className="w-4 h-4" />;
      case 'imoveis': return <Home className="w-4 h-4" />;
      case 'veiculos': return <Car className="w-4 h-4" />;
      case 'servicos': return <Wrench className="w-4 h-4" />;
      case 'viagens': return <Plane className="w-4 h-4" />;
      default: return <Search className="w-4 h-4" />;
    }
  };

  const tabs: { id: SearchCategory | 'all'; label: string; count: number }[] = [
    { id: 'all', label: 'Todos os resultados', count: results.length },
    { id: 'mercado', label: 'Mercado', count: groupedResults.mercado.length },
    { id: 'imoveis', label: 'Imóveis', count: groupedResults.imoveis.length },
    { id: 'veiculos', label: 'Veículos', count: groupedResults.veiculos.length },
    { id: 'servicos', label: 'Serviços', count: groupedResults.servicos.length },
    { id: 'viagens', label: 'Viagens', count: groupedResults.viagens.length },
    { id: 'fretes', label: 'Fretes', count: groupedResults.fretes.length },
  ].filter(tab => tab.id === 'all' || tab.count > 0);

  return (
    <MarketLayout blueFooter blueFooterLabel="🔎 Pesquisa">
      <div className="max-w-[1920px] mx-auto px-4 lg:px-6 py-6 lg:py-8 w-full">
        
        <div className="mb-6 lg:mb-8">
          <h1 className="text-2xl lg:text-3xl font-black text-zinc-900 tracking-tight">
            Resultados para "{query}"
          </h1>
          <p className="text-zinc-500 mt-1">
            {isLoading ? "Buscando em toda a plataforma..." : `Encontramos ${results.length} resultados em toda a plataforma`}
          </p>
        </div>

        {/* Tabs */}
        {!isLoading && results.length > 0 && (
          <div className="flex overflow-x-auto pb-2 mb-6 gap-2 snap-x hide-scrollbar">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap snap-start transition-colors font-bold text-sm border
                  ${activeTab === tab.id 
                    ? 'bg-zinc-900 text-white border-zinc-900' 
                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`}
              >
                {tab.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-zinc-800' : 'bg-zinc-100 text-zinc-500'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
            <Loader2 className="w-10 h-10 animate-spin mb-4 text-[#FF6A00]" />
            <p className="font-medium">Procurando as melhores opções...</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && results.length === 0 && query.trim().length >= 2 && (
          <div className="bg-white rounded-3xl p-10 flex flex-col items-center justify-center text-center border border-zinc-100 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-zinc-50 flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-zinc-300" />
            </div>
            <h3 className="text-xl font-black text-zinc-800 mb-2">Nenhum resultado encontrado</h3>
            <p className="text-zinc-500 max-w-md">
              Não encontramos nada para "{query}" em nenhuma das categorias.
              Tente verificar a ortografia ou buscar por termos mais genéricos.
            </p>
          </div>
        )}

        {/* Results Grid */}
        {!isLoading && filteredResults.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 lg:gap-6">
            {filteredResults.map(item => (
              <div 
                key={`${item.category}-${item.id}`}
                onClick={() => navigate(item.routePath)}
                className="bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden flex flex-col group"
              >
                {/* Image */}
                <div className="aspect-video sm:aspect-square bg-zinc-100 relative overflow-hidden shrink-0">
                  {item.thumbnail_url ? (
                    <img src={item.thumbnail_url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt={item.title} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-300">
                      {getCategoryIcon(item.category)}
                    </div>
                  )}
                  {/* Category Badge */}
                  <div className="absolute top-2 left-2 bg-white/90 backdrop-blur text-zinc-900 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg flex items-center gap-1.5 shadow-sm">
                    {getCategoryIcon(item.category)}
                    {item.categoryLabel}
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-bold text-zinc-900 line-clamp-2 text-sm lg:text-base leading-tight group-hover:text-sky-600 transition-colors">
                    {item.title}
                  </h3>
                  
                  {item.location && (
                    <p className="text-xs text-zinc-500 mt-1 truncate">{item.location}</p>
                  )}

                  <div className="mt-auto pt-3 flex items-center justify-between">
                    <div className="font-black text-zinc-900">
                      {item.price_brl ? formatCurrencyBRL(item.price_brl) : 'Consulte'}
                    </div>
                    <div className="w-8 h-8 rounded-full bg-zinc-50 flex items-center justify-center text-zinc-400 group-hover:bg-sky-50 group-hover:text-sky-600 transition-colors">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </MarketLayout>
  );
}
