import { useState } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RIDVHistoryEntry {
  id: string;
  date: string;
  company: string;
  product: string;
  category: string;
  shares: number;
  visits: number;
  conversions: number;
  revenue: number | null;
}

const MOCK_HISTORY: RIDVHistoryEntry[] = [
  {
    id: '1', date: '2026-07-04T14:30:00Z', company: 'Restaurante Sabor da Terra',
    product: 'Prato do Dia', category: 'Restaurante', shares: 3, visits: 12, conversions: 2, revenue: 39.8,
  },
  {
    id: '2', date: '2026-07-03T09:00:00Z', company: 'Hotel Villa Serena',
    product: 'Pacote Fim de Semana', category: 'Hotel', shares: 5, visits: 20, conversions: 1, revenue: null,
  },
  {
    id: '3', date: '2026-07-02T11:15:00Z', company: 'Auto Elétrica Melo',
    product: 'Revisão Completa', category: 'Serviço', shares: 2, visits: 8, conversions: 1, revenue: 89.0,
  },
  {
    id: '4', date: '2026-07-01T16:00:00Z', company: 'Imobiliária Centro Sul',
    product: 'Apartamento 2 Quartos', category: 'Imóvel', shares: 1, visits: 5, conversions: 0, revenue: null,
  },
  {
    id: '5', date: '2026-06-30T10:00:00Z', company: 'Revendas Centro-Oeste',
    product: 'Honda Civic 2023', category: 'Veículo', shares: 4, visits: 18, conversions: 0, revenue: null,
  },
  {
    id: '6', date: '2026-06-29T13:45:00Z', company: 'Farmácia Saúde & Vida',
    product: 'Vitamina D + Ômega 3', category: 'Produto', shares: 6, visits: 25, conversions: 4, revenue: 234.0,
  },
];

const PERIODS = ['Hoje', '7 dias', '30 dias', 'Tudo'];

const PAGE_SIZE = 5;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
const fmtBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);

interface RIDVHistoryProps {
  entries?: RIDVHistoryEntry[];
}

export function RIDVHistory({ entries = MOCK_HISTORY }: RIDVHistoryProps) {
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState('Tudo');
  const [page, setPage] = useState(0);

  const filtered = entries.filter((e) => {
    const q = search.toLowerCase();
    if (q && !e.company.toLowerCase().includes(q) && !e.product.toLowerCase().includes(q)) return false;
    if (period !== 'Tudo') {
      const days = period === 'Hoje' ? 1 : period === '7 dias' ? 7 : 30;
      const since = Date.now() - days * 86_400_000;
      if (new Date(e.date).getTime() < since) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex gap-2">
        <div
          className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <Search className="h-3.5 w-3.5 text-[#A7B0BE]/40 shrink-0" />
          <input
            type="text"
            placeholder="Buscar empresa ou produto..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="flex-1 bg-transparent text-xs text-white placeholder-[#A7B0BE]/40 outline-none"
          />
        </div>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setPage(0); }}
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all',
                period === p
                  ? 'bg-orange-500/15 text-orange-400 border border-orange-500/25'
                  : 'text-[#A7B0BE]/45 hover:text-[#A7B0BE]/70 border border-transparent'
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {pageItems.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{
            background: 'linear-gradient(145deg, #1B1F24, #0D0F12)',
            border: '2px dashed rgba(42,48,56,0.80)',
          }}
        >
          <p className="text-2xl mb-2">📚</p>
          <p className="font-black text-[#A7B0BE]/50 text-sm">Nenhum histórico encontrado</p>
          <p className="text-[11px] text-[#A7B0BE]/30 mt-1.5 leading-relaxed">
            Comece a compartilhar campanhas para ver o histórico aqui.
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(145deg, #1B1F24, #0D0F12)',
            border: '1px solid rgba(42,48,56,0.80)',
          }}
        >
          {/* Header */}
          <div
            className="grid gap-2 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.14em] text-[#A7B0BE]/40"
            style={{ gridTemplateColumns: '1fr 1fr 0.7fr 0.5fr 0.5fr 0.5fr 0.7fr', borderBottom: '1px solid rgba(42,48,56,0.80)' }}
          >
            <span>Data</span>
            <span>Empresa / Produto</span>
            <span>Categoria</span>
            <span>Comp.</span>
            <span>Visitas</span>
            <span>Conv.</span>
            <span>Receita</span>
          </div>

          {/* Rows */}
          <div className="divide-y" style={{ borderColor: 'rgba(42,48,56,0.50)' }}>
            {pageItems.map((entry) => (
              <div
                key={entry.id}
                className="grid gap-2 px-4 py-3 text-[11px] hover:bg-white/[0.02] transition-colors"
                style={{ gridTemplateColumns: '1fr 1fr 0.7fr 0.5fr 0.5fr 0.5fr 0.7fr' }}
              >
                <span className="text-[#A7B0BE]/55 font-medium">{fmtDate(entry.date)}</span>
                <div className="min-w-0">
                  <p className="text-white font-bold truncate leading-tight">{entry.company}</p>
                  <p className="text-[#A7B0BE]/40 text-[10px] truncate">{entry.product}</p>
                </div>
                <span className="text-[#A7B0BE]/55">{entry.category}</span>
                <span className="font-black text-emerald-400">{entry.shares}</span>
                <span className="font-black text-sky-400">{entry.visits}</span>
                <span className="font-black text-violet-400">{entry.conversions}</span>
                <span className={cn('font-black', entry.revenue ? 'text-amber-400' : 'text-zinc-600')}>
                  {entry.revenue != null ? fmtBRL(entry.revenue) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-[#A7B0BE]/40">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg disabled:opacity-30 transition-all hover:scale-105 active:scale-95"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#A7B0BE' }}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="p-1.5 rounded-lg disabled:opacity-30 transition-all hover:scale-105 active:scale-95"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#A7B0BE' }}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
