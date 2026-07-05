import { useState, useMemo } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { RIDVCampaignCard, type RIDVCampaign, type RIDVCategory, type RIDVPriority } from './RIDVCampaignCard';

// ─── Mock Data ──────────────────────────────────────────────────────────────
export const MOCK_RIDV_CAMPAIGNS: RIDVCampaign[] = [
  {
    id: '1',
    company_name: 'Restaurante Sabor da Terra',
    product_title: 'Prato do Dia Especial — R$ 19,90',
    description: 'Prato completo com filé de frango grelhado, arroz, feijão, salada e suco natural. Promoção válida no almoço.',
    category: 'restaurant',
    city: 'Rondonópolis',
    state: 'MT',
    priority: 'high',
    valid_until: new Date(Date.now() + 2 * 86400000).toISOString(),
  },
  {
    id: '2',
    company_name: 'Hotel Villa Serena',
    product_title: 'Pacote Fim de Semana — 2 noites',
    description: 'Diária dupla com café da manhã incluso, piscina e área de lazer. Reserve agora e garanta 20% de desconto.',
    category: 'hotel',
    city: 'Cuiabá',
    state: 'MT',
    priority: 'featured',
    valid_until: new Date(Date.now() + 7 * 86400000).toISOString(),
  },
  {
    id: '3',
    company_name: 'Auto Elétrica Melo',
    product_title: 'Revisão Completa — R$ 89,00',
    description: 'Revisão elétrica completa, verificação de bateria, alternador e motor de partida. Atendimento rápido.',
    category: 'service',
    city: 'Rondonópolis',
    state: 'MT',
    priority: 'normal',
    valid_until: new Date(Date.now() + 14 * 86400000).toISOString(),
  },
  {
    id: '4',
    company_name: 'Imobiliária Centro Sul',
    product_title: 'Apartamento 2 Quartos — Varanda Gourmet',
    description: 'Apartamento 65m², 2 quartos, 1 suíte, varanda gourmet, 1 vaga. Documentação facilitada.',
    category: 'real-estate',
    city: 'Cuiabá',
    state: 'MT',
    priority: 'high',
    valid_until: new Date(Date.now() + 30 * 86400000).toISOString(),
  },
  {
    id: '5',
    company_name: 'Revendas Centro-Oeste',
    product_title: 'Honda Civic 2023 — Seminovo Revisado',
    description: 'Honda Civic EXL 2023, apenas 18.000 km, revisões feitas em concessionária, IPVA pago.',
    category: 'vehicle',
    city: 'Rondonópolis',
    state: 'MT',
    priority: 'normal',
    valid_until: new Date(Date.now() + 10 * 86400000).toISOString(),
  },
  {
    id: '6',
    company_name: 'Farmácia Saúde & Vida',
    product_title: 'Vitamina D + Ômega 3 — 30% Off',
    description: 'Combo vitamínico com desconto especial. Vitamina D 2000UI + Ômega 3 1000mg. Promoção da semana.',
    category: 'product',
    city: 'Primavera do Leste',
    state: 'MT',
    priority: 'featured',
    valid_until: new Date(Date.now() + 5 * 86400000).toISOString(),
  },
];

const CATEGORIES: { value: RIDVCategory | ''; label: string }[] = [
  { value: '', label: 'Todas as categorias' },
  { value: 'restaurant', label: '🍽️ Restaurante' },
  { value: 'hotel', label: '🏨 Hotel' },
  { value: 'service', label: '🔧 Serviço' },
  { value: 'product', label: '📦 Produto' },
  { value: 'real-estate', label: '🏠 Imóvel' },
  { value: 'vehicle', label: '🚗 Veículo' },
  { value: 'company', label: '🏢 Empresa' },
];

const PRIORITIES: { value: RIDVPriority | ''; label: string }[] = [
  { value: '', label: 'Toda prioridade' },
  { value: 'featured', label: '⭐ Destaque' },
  { value: 'high', label: '⚡ Alta' },
  { value: 'normal', label: '• Normal' },
];

function SkeletonCard() {
  return (
    <div
      className="rounded-2xl animate-pulse"
      style={{ background: 'linear-gradient(145deg, #1B1F24, #0D0F12)', border: '1px solid rgba(42,48,56,0.80)' }}
    >
      <div className="aspect-video bg-white/5 rounded-t-2xl" />
      <div className="p-3.5 space-y-2">
        <div className="flex gap-1.5">
          <div className="h-4 w-16 rounded-md bg-white/5" />
          <div className="h-4 w-12 rounded-md bg-white/5" />
        </div>
        <div className="h-3 w-24 rounded bg-white/5" />
        <div className="h-4 w-full rounded bg-white/5" />
        <div className="h-3 w-3/4 rounded bg-white/5" />
        <div className="flex gap-2 pt-1">
          <div className="flex-1 h-8 rounded-xl bg-white/5" />
          <div className="w-14 h-8 rounded-xl bg-white/5" />
          <div className="w-8 h-8 rounded-xl bg-white/5" />
        </div>
      </div>
    </div>
  );
}

interface RIDVCampaignListProps {
  campaigns?: RIDVCampaign[];
  isLoading?: boolean;
  onShare?: (id: string) => void;
  onView?: (id: string) => void;
  onFavorite?: (id: string) => void;
  favoritedIds?: Set<string>;
}

export function RIDVCampaignList({
  campaigns = MOCK_RIDV_CAMPAIGNS,
  isLoading = false,
  onShare,
  onView,
  onFavorite,
  favoritedIds = new Set(),
}: RIDVCampaignListProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<RIDVCategory | ''>('');
  const [priority, setPriority] = useState<RIDVPriority | ''>('');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      const q = search.toLowerCase();
      if (q && !c.company_name.toLowerCase().includes(q) && !c.product_title.toLowerCase().includes(q)) return false;
      if (category && c.category !== category) return false;
      if (priority && c.priority !== priority) return false;
      return true;
    });
  }, [campaigns, search, category, priority]);

  return (
    <div className="space-y-4">
      {/* Search + filter bar */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div
            className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Search className="h-3.5 w-3.5 text-[#A7B0BE]/40 shrink-0" />
            <input
              type="text"
              placeholder="Buscar empresa ou produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs text-white placeholder-[#A7B0BE]/40 outline-none"
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="p-2 rounded-xl transition-all hover:scale-105 active:scale-95"
            style={{
              background: showFilters ? 'rgba(255,106,0,0.15)' : 'rgba(255,255,255,0.04)',
              border: showFilters ? '1px solid rgba(255,106,0,0.30)' : '1px solid rgba(255,255,255,0.08)',
              color: showFilters ? '#FF6A00' : '#A7B0BE',
            }}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>

        {showFilters && (
          <div className="flex gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as RIDVCategory | '')}
              className="flex-1 text-[11px] rounded-xl px-2 py-1.5 outline-none font-medium"
              style={{
                background: '#1B1F24',
                border: '1px solid rgba(42,48,56,0.80)',
                color: '#A7B0BE',
              }}
            >
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as RIDVPriority | '')}
              className="flex-1 text-[11px] rounded-xl px-2 py-1.5 outline-none font-medium"
              style={{
                background: '#1B1F24',
                border: '1px solid rgba(42,48,56,0.80)',
                color: '#A7B0BE',
              }}
            >
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Count */}
      {!isLoading && (
        <p className="text-[10px] font-bold text-[#A7B0BE]/40 uppercase tracking-widest">
          {filtered.length} campanha{filtered.length !== 1 ? 's' : ''} disponíve{filtered.length !== 1 ? 'is' : 'l'}
        </p>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        /* Empty State */
        <div
          className="rounded-2xl p-12 text-center"
          style={{
            background: 'linear-gradient(145deg, #1B1F24, #0D0F12)',
            border: '2px dashed rgba(42,48,56,0.80)',
          }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl"
            style={{ background: 'rgba(255,106,0,0.08)', border: '1px solid rgba(255,106,0,0.15)' }}
          >
            📢
          </div>
          <p className="font-black text-[#A7B0BE]/60 text-sm">
            {search || category || priority ? 'Nenhum resultado' : 'Nenhuma campanha disponível'}
          </p>
          <p className="text-[11px] text-[#A7B0BE]/35 mt-2 max-w-[220px] mx-auto leading-relaxed">
            {search || category || priority
              ? 'Tente ajustar os filtros ou a busca.'
              : 'Novas campanhas chegam automaticamente conforme a demanda da sua região.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <RIDVCampaignCard
              key={c.id}
              campaign={c}
              onShare={onShare}
              onView={onView}
              onFavorite={onFavorite}
              isFavorited={favoritedIds.has(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
