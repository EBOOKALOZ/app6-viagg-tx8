import React, { useState } from 'react';
import {
  Megaphone, Plus, Search, Filter, Play, Pause,
  Edit3, Trash2, TrendingUp, Eye, MousePointerClick,
  Calendar, Clock, CheckCircle2, AlertCircle, Zap, ShieldCheck, MapPin, Sliders
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ImpulsionarCampaignModal, CampaignFormData } from './ImpulsionarCampaignModal';

export interface CampaignItem extends CampaignFormData {
  id: string;
  status: 'ativa' | 'agendada' | 'analise' | 'encerrada' | 'pausada';
  views: number;
  clicks: number;
  spent: number;
  createdAt: string;
}

const INITIAL_CAMPAIGNS: CampaignItem[] = [
  {
    id: 'c-1',
    title: '⚡ Entregas Express 15min — Prioridade Total na Região!',
    description: 'Atendimento de agilidade incomparável em toda Zona Sul e Centro com rastreio ao vivo.',
    imageUrl: 'https://images.unsplash.com/photo-1526367790999-0150786686a2?auto=format&fit=crop&q=80&w=600',
    videoUrl: '',
    category: 'Entregas Rápidas (Motoboy)',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Centro & Paulista',
    radiusKm: 20,
    daysOfWeek: ['seg', 'ter', 'qua', 'qui', 'sex'],
    startTime: '08:00',
    endTime: '22:00',
    budgetDaily: 35,
    durationDays: 10,
    priority: 'destaque',
    targetAudience: ['passageiros', 'lojistas'],
    status: 'ativa',
    views: 5420,
    clicks: 680,
    spent: 175.00,
    createdAt: '2026-07-01',
  },
  {
    id: 'c-2',
    title: '🔥 Promoção Exclusiva de Frete & Delivery para Comerciantes',
    description: 'Especial para restaurantes e lojas do bairro. Tarifas fixas promocionais para parceiros RIDV.',
    imageUrl: '',
    videoUrl: '',
    category: 'Oferta Lojista & Delivery',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Pinheiros & Itaim',
    radiusKm: 12,
    daysOfWeek: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'],
    startTime: '10:00',
    endTime: '23:30',
    budgetDaily: 50,
    durationDays: 15,
    priority: 'urgente',
    targetAudience: ['lojistas'],
    status: 'ativa',
    views: 7890,
    clicks: 1420,
    spent: 350.00,
    createdAt: '2026-06-28',
  },
  {
    id: 'c-3',
    title: '🚀 Corridas de Moto Táxi — Chegue no Horário com Segurança!',
    description: 'Evite o trânsito nos horários de pico. Pilotos verificados e com capacetes higienizados.',
    imageUrl: '',
    videoUrl: '',
    category: 'Corridas Urbanas (Moto Táxi)',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Zona Oeste',
    radiusKm: 15,
    daysOfWeek: ['seg', 'ter', 'qua', 'qui', 'sex'],
    startTime: '07:00',
    endTime: '20:00',
    budgetDaily: 25,
    durationDays: 7,
    priority: 'normal',
    targetAudience: ['passageiros'],
    status: 'agendada',
    views: 0,
    clicks: 0,
    spent: 0.00,
    createdAt: '2026-07-04',
  },
  {
    id: 'c-4',
    title: '📦 Frete Rápido para Mudanças Residenciais e Comerciais',
    description: 'Caminhonetes e utilitários prontos para transporte seguro em toda Grande São Paulo.',
    imageUrl: '',
    videoUrl: '',
    category: 'Frete & Mudanças',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Grande SP',
    radiusKm: 40,
    daysOfWeek: ['sab', 'dom'],
    startTime: '08:00',
    endTime: '18:00',
    budgetDaily: 40,
    durationDays: 4,
    priority: 'normal',
    targetAudience: ['passageiros', 'lojistas'],
    status: 'analise',
    views: 0,
    clicks: 0,
    spent: 0.00,
    createdAt: '2026-07-05',
  },
  {
    id: 'c-5',
    title: '🛵 Motoboy Corujão 24h — Entregas de Madrugada',
    description: 'Atendimento exclusivo noturno para farmácias 24h e lanchonetes. Rapidez e segurança na madrugada.',
    imageUrl: '',
    videoUrl: '',
    category: 'Entregas Rápidas (Motoboy)',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Centro & Augusta',
    radiusKm: 10,
    daysOfWeek: ['sex', 'sab', 'dom'],
    startTime: '22:00',
    endTime: '05:00',
    budgetDaily: 30,
    durationDays: 5,
    priority: 'normal',
    targetAudience: ['lojistas'],
    status: 'encerrada',
    views: 3120,
    clicks: 410,
    spent: 150.00,
    createdAt: '2026-06-15',
  },
];

interface ImpulsionarCampaignManagerProps {
  onSelectTab?: (tab: string) => void;
  userBalance?: number;
}

export function ImpulsionarCampaignManager({ onSelectTab, userBalance = 145.50 }: ImpulsionarCampaignManagerProps) {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>(INITIAL_CAMPAIGNS);
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CampaignItem | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleCreateOrUpdate = (data: CampaignFormData) => {
    if (editingCampaign) {
      setCampaigns((prev) =>
        prev.map((c) => (c.id === editingCampaign.id ? { ...c, ...data } : c))
      );
      showToast('✅ Campanha atualizada com sucesso!');
    } else {
      const newC: CampaignItem = {
        ...data,
        id: `c-${Date.now()}`,
        status: 'ativa',
        views: 0,
        clicks: 0,
        spent: 0.00,
        createdAt: new Date().toISOString().split('T')[0],
      };
      setCampaigns((prev) => [newC, ...prev]);
      showToast('🚀 Nova campanha publicada no ar!');
    }
    setEditingCampaign(null);
  };

  const toggleStatus = (id: string, current: string) => {
    setCampaigns((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        if (current === 'ativa') {
          showToast('⏸️ Campanha pausada.');
          return { ...c, status: 'pausada' };
        } else {
          showToast('▶️ Campanha retomada com sucesso!');
          return { ...c, status: 'ativa' };
        }
      })
    );
  };

  const handleDelete = (id: string) => {
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    showToast('🗑️ Campanha removida.');
  };

  const filtered = campaigns.filter((c) => {
    const matchStatus = filterStatus === 'todos' || c.status === filterStatus;
    const matchSearch =
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.neighborhood.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  const getStatusBadge = (status: CampaignItem['status']) => {
    switch (status) {
      case 'ativa':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
            Ativa no Ar
          </span>
        );
      case 'agendada':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Calendar className="h-3 w-3" /> Agendada
          </span>
        );
      case 'analise':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="h-3 w-3" /> Em Análise RIDV
          </span>
        );
      case 'pausada':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border border-zinc-500/20">
            <Pause className="h-3 w-3" /> Pausada
          </span>
        );
      case 'encerrada':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-zinc-400/10 text-zinc-400 border border-zinc-400/20">
            <CheckCircle2 className="h-3 w-3" /> Encerrada
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Toast flutuante */}
      {successToast && (
        <div className="fixed top-6 right-6 z-50 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-4 py-3 rounded-2xl shadow-2xl border border-zinc-800 font-bold text-xs flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
          <Zap className="h-4 w-4 text-orange-500" />
          {successToast}
        </div>
      )}

      {/* Cabeçalho superior com botão de Nova Campanha */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-transparent border border-orange-500/20">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/20 shrink-0">
            <Megaphone className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-zinc-900 dark:text-white tracking-tight leading-none">
              Gerenciador de Campanhas RIDV
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Controle suas divulgações, edite orçamentos e acompanhe o engajamento na região.
            </p>
          </div>
        </div>

        <Button
          onClick={() => {
            setEditingCampaign(null);
            setIsModalOpen(true);
          }}
          className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-extrabold text-xs px-5 h-11 rounded-2xl shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 shrink-0"
        >
          <Plus className="h-4 w-4 stroke-[3]" />
          Criar Nova Campanha
        </Button>
      </div>

      {/* Barra de Busca & Filtros por Status */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        
        {/* Chips de filtro */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {[
            { id: 'todos', label: 'Todas', count: campaigns.length },
            { id: 'ativa', label: 'Ativas', count: campaigns.filter((c) => c.status === 'ativa').length },
            { id: 'agendada', label: 'Agendadas', count: campaigns.filter((c) => c.status === 'agendada').length },
            { id: 'analise', label: 'Em Análise', count: campaigns.filter((c) => c.status === 'analise').length },
            { id: 'pausada', label: 'Pausadas', count: campaigns.filter((c) => c.status === 'pausada').length },
            { id: 'encerrada', label: 'Encerradas', count: campaigns.filter((c) => c.status === 'encerrada').length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={cn(
                'px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border',
                filterStatus === tab.id
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 border-zinc-900 dark:border-white shadow-sm'
                  : 'bg-white dark:bg-zinc-900/80 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
              )}
            >
              <span>{tab.label}</span>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md', filterStatus === tab.id ? 'bg-zinc-800 text-zinc-300 dark:bg-zinc-200 dark:text-zinc-800' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500')}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Input de busca */}
        <div className="relative w-full md:w-64 shrink-0">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por título, bairro..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-10 pr-4 py-2.5 text-xs text-zinc-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* Lista de Cards de Campanha */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 rounded-3xl bg-zinc-50 dark:bg-zinc-900/50 border border-dashed border-zinc-200 dark:border-zinc-800 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 text-orange-500 flex items-center justify-center mx-auto">
            <Filter className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Nenhuma campanha encontrada</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Não há campanhas correspondentes aos filtros selecionados. Tente mudar o status ou crie uma nova.
          </p>
          <Button
            onClick={() => {
              setFilterStatus('todos');
              setSearchQuery('');
            }}
            variant="outline"
            size="sm"
            className="text-xs font-bold mt-2"
          >
            Limpar Filtros
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((camp) => {
            const ctr = camp.views > 0 ? ((camp.clicks / camp.views) * 100).toFixed(1) : '0.0';
            const totalBudget = camp.budgetDaily * camp.durationDays;
            const progress = totalBudget > 0 ? Math.min(100, Math.round((camp.spent / totalBudget) * 100)) : 0;

            return (
              <div
                key={camp.id}
                className="rounded-3xl p-5 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col lg:flex-row lg:items-center justify-between gap-5"
              >
                {/* Info & Badges */}
                <div className="flex-1 min-w-0 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {getStatusBadge(camp.status)}
                    <span className="text-[11px] font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
                      {camp.category}
                    </span>
                    {camp.priority !== 'normal' && (
                      <span className={cn('text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full', camp.priority === 'urgente' ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400' : 'bg-orange-500/15 text-orange-600 dark:text-orange-400')}>
                        {camp.priority === 'urgente' ? '⚡ Urgente' : '🔥 Destaque'}
                      </span>
                    )}
                  </div>

                  <h3 className="text-base sm:text-lg font-black text-zinc-900 dark:text-white leading-snug truncate">
                    {camp.title}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                    {camp.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-zinc-500 dark:text-zinc-400 pt-1">
                    <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                      <MapPin className="h-3.5 w-3.5 text-orange-500" />
                      {camp.neighborhood}, {camp.city} ({camp.radiusKm} km)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-zinc-400" />
                      {camp.startTime} às {camp.endTime} ({camp.daysOfWeek.length} dias/semana)
                    </span>
                  </div>
                </div>

                {/* Métricas rápidas & Progresso do Orçamento */}
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between lg:justify-end gap-6 border-t lg:border-t-0 pt-4 lg:pt-0 border-zinc-100 dark:border-zinc-800 shrink-0">
                  
                  <div className="grid grid-cols-3 gap-4 text-center sm:text-left min-w-[200px]">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase flex items-center justify-center sm:justify-start gap-1">
                        <Eye className="h-3 w-3" /> Alcance
                      </span>
                      <p className="text-sm sm:text-base font-black text-zinc-900 dark:text-white">
                        {camp.views.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase flex items-center justify-center sm:justify-start gap-1">
                        <MousePointerClick className="h-3 w-3" /> Cliques
                      </span>
                      <p className="text-sm sm:text-base font-black text-indigo-500 dark:text-indigo-400">
                        {camp.clicks.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase flex items-center justify-center sm:justify-start gap-1">
                        <TrendingUp className="h-3 w-3" /> CTR
                      </span>
                      <p className="text-sm sm:text-base font-black text-emerald-500 dark:text-emerald-400">
                        {ctr}%
                      </p>
                    </div>
                  </div>

                  {/* Barra de Gasto */}
                  <div className="w-full sm:w-36 space-y-1.5 shrink-0">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-zinc-500">Gasto:</span>
                      <span className="text-zinc-900 dark:text-white">R$ {camp.spent.toFixed(0)} / R$ {totalBudget}</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', progress > 85 ? 'bg-rose-500' : 'bg-gradient-to-r from-orange-500 to-amber-500')}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Ações operacionais */}
                  <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                    {(camp.status === 'ativa' || camp.status === 'pausada') && (
                      <button
                        onClick={() => toggleStatus(camp.id, camp.status)}
                        title={camp.status === 'ativa' ? 'Pausar exibição' : 'Retomar exibição'}
                        className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
                      >
                        {camp.status === 'ativa' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setEditingCampaign(camp);
                        setIsModalOpen(true);
                      }}
                      title="Editar campanha"
                      className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>

                    <button
                      onClick={() => onSelectTab?.('estatisticas')}
                      title="Ver relatórios de estatísticas"
                      className="p-2 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 transition-colors"
                    >
                      <TrendingUp className="h-4 w-4" />
                    </button>

                    <button
                      onClick={() => handleDelete(camp.id)}
                      title="Remover campanha"
                      className="p-2 rounded-xl hover:bg-rose-500/10 text-zinc-400 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Criação / Edição */}
      <ImpulsionarCampaignModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingCampaign(null);
        }}
        onSave={handleCreateOrUpdate}
        initialData={editingCampaign || undefined}
        userBalance={userBalance}
      />
    </div>
  );
}
