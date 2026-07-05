import React, { useState } from 'react';
import {
  History, Search, Download, CheckCircle2, Eye,
  MousePointerClick, Target, Calendar, Award, Sparkles, Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface HistoryRecord {
  id: string;
  date: string;
  title: string;
  category: string;
  target: string;
  budget: number;
  creditsUsed: number;
  views: number;
  clicks: number;
  conversions: number;
  status: 'concluida' | 'encerrada';
}

const MOCK_HISTORY: HistoryRecord[] = [
  {
    id: 'h-1',
    date: '03 Jul 2026',
    title: '🛵 Motoboy Corujão 24h — Entregas de Madrugada',
    category: 'Entregas Rápidas',
    target: 'Lojistas & Farmácias',
    budget: 150.00,
    creditsUsed: 180,
    views: 3120,
    clicks: 410,
    conversions: 82,
    status: 'concluida',
  },
  {
    id: 'h-2',
    date: '28 Jun 2026',
    title: '🔥 Promoção Fim de Semana — Frete Grátis',
    category: 'Oferta Lojista',
    target: 'Passageiros & Clientes',
    budget: 200.00,
    creditsUsed: 250,
    views: 5400,
    clicks: 890,
    conversions: 195,
    status: 'concluida',
  },
  {
    id: 'h-3',
    date: '20 Jun 2026',
    title: '🚀 Corridas Moto Táxi — Região Central',
    category: 'Corridas Urbanas',
    target: 'Passageiros',
    budget: 100.00,
    creditsUsed: 120,
    views: 2450,
    clicks: 310,
    conversions: 64,
    status: 'encerrada',
  },
  {
    id: 'h-4',
    date: '15 Jun 2026',
    title: '📦 Frete Rápido para Mudanças Comerciais',
    category: 'Frete & Mudanças',
    target: 'Comerciantes',
    budget: 80.00,
    creditsUsed: 95,
    views: 1890,
    clicks: 180,
    conversions: 32,
    status: 'concluida',
  },
];

export function ImpulsionarHistoryTable() {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'concluida' | 'encerrada'>('todos');

  const filtered = MOCK_HISTORY.filter((h) => {
    const matchStatus = statusFilter === 'todos' || h.status === statusFilter;
    const matchSearch = h.title.toLowerCase().includes(query.toLowerCase()) || h.category.toLowerCase().includes(query.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent border border-emerald-500/20">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20 shrink-0">
            <History className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-zinc-900 dark:text-white tracking-tight leading-none">
              Histórico Completo de Divulgação
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Registro de campanhas encerradas, créditos consumidos e auditoria de resultados.
            </p>
          </div>
        </div>

        <Button
          onClick={() => alert('📥 Relatório de histórico exportado em Excel/CSV!')}
          variant="outline"
          size="sm"
          className="h-9 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Download className="h-3.5 w-3.5" /> Exportar CSV
        </Button>
      </div>

      {/* Busca e Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'todos', label: 'Todos os Registros' },
            { id: 'concluida', label: 'Concluídas com Sucesso' },
            { id: 'encerrada', label: 'Encerradas / Parciais' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id as any)}
              className={cn(
                'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border',
                statusFilter === f.id
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 border-zinc-900 dark:border-white shadow-sm'
                  : 'bg-white dark:bg-zinc-900/80 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar campanha no histórico..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-10 pr-4 py-2.5 text-xs text-zinc-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Tabela de Histórico */}
      <div className="rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40 text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <th className="py-3.5 px-5">Campanha & Categoria</th>
                <th className="py-3.5 px-4">Público Alvo</th>
                <th className="py-3.5 px-4 text-center">Créditos</th>
                <th className="py-3.5 px-4 text-center">Alcance</th>
                <th className="py-3.5 px-4 text-center">Cliques (CTR)</th>
                <th className="py-3.5 px-4 text-center">Conversões</th>
                <th className="py-3.5 px-5 text-right">Data & Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-xs">
              {filtered.map((rec) => {
                const ctr = rec.views > 0 ? ((rec.clicks / rec.views) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={rec.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="py-4 px-5">
                      <div className="font-bold text-zinc-900 dark:text-white leading-tight max-w-xs truncate">
                        {rec.title}
                      </div>
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 inline-block">
                        {rec.category}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-semibold text-zinc-600 dark:text-zinc-400">
                      {rec.target}
                    </td>
                    <td className="py-4 px-4 text-center font-black text-amber-500">
                      {rec.creditsUsed} cr
                    </td>
                    <td className="py-4 px-4 text-center font-bold text-zinc-900 dark:text-white">
                      {rec.views.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-4 px-4 text-center font-bold text-indigo-500 dark:text-indigo-400">
                      {rec.clicks.toLocaleString('pt-BR')} <span className="text-[10px] text-zinc-400">({ctr}%)</span>
                    </td>
                    <td className="py-4 px-4 text-center font-black text-emerald-500 dark:text-emerald-400">
                      {rec.conversions}
                    </td>
                    <td className="py-4 px-5 text-right">
                      <div className="font-bold text-zinc-700 dark:text-zinc-300">{rec.date}</div>
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full mt-1">
                        <CheckCircle2 className="h-3 w-3" /> Concluída
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
