import React, { useState } from 'react';
import {
  Bell, CheckCircle2, AlertTriangle, Clock, TrendingUp,
  Sparkles, ShieldCheck, Trash2, CheckCheck, Filter, EyeOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface NotificationItem {
  id: string;
  type: 'aprovada' | 'saldo' | 'performance' | 'pausada' | 'rejeitada';
  title: string;
  msg: string;
  time: string;
  read: boolean;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n-1',
    type: 'performance',
    title: '🔥 Pico de Engajamento Detectado pelo Viagg-TX8™',
    msg: 'Sua campanha "Entregas Express 15min" atingiu 12.5% de CTR hoje! Recomendamos manter o orçamento diário para aproveitar o tráfego da sexta-feira.',
    time: 'Há 15 minutos',
    read: false,
  },
  {
    id: 'n-2',
    type: 'aprovada',
    title: '✅ Campanha Aprovada na Auditoria RIDV',
    msg: 'A campanha "Promoção Exclusiva de Frete & Delivery" foi revisada e aprovada com prioridade Destaque.',
    time: 'Há 2 horas',
    read: false,
  },
  {
    id: 'n-3',
    type: 'saldo',
    title: '⚠️ Aviso de Consumo de Créditos',
    msg: 'Sua previsão de consumo indica que seus créditos atuais (350) durarão cerca de 7 dias. Adquira um pacote com desconto na loja.',
    time: 'Ontem às 18:40',
    read: true,
  },
  {
    id: 'n-4',
    type: 'pausada',
    title: '⏸️ Campanha Pausada por Programação',
    msg: 'A campanha "Motoboy Corujão 24h" concluiu seu período de 5 dias e foi pausada automaticamente.',
    time: '03 Jul às 05:00',
    read: true,
  },
  {
    id: 'n-5',
    type: 'aprovada',
    title: '🛡️ Verificação de Perfil Concluída',
    msg: 'Seu selo de parceiro verificado RIDV foi ativado com sucesso para divulgação na sua região.',
    time: '01 Jul às 14:15',
    read: true,
  },
];

const lsGet = (k: string): string[] => {
  try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; }
};

export function ImpulsionarNotificationsCenter() {
  const [items, setItems] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [filter, setFilter] = useState<'todas' | 'nao-lidas' | 'alertas'>('todas');
  // Escondidas (recuperáveis) e excluídas (definitivo) — persistem entre sessões
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => lsGet('ridvNotifHidden'));
  const [deletedIds, setDeletedIds] = useState<string[]>(() => lsGet('ridvNotifDeleted'));

  const hideOne = (id: string) => {
    const next = [...new Set([...hiddenIds, id])];
    setHiddenIds(next);
    localStorage.setItem('ridvNotifHidden', JSON.stringify(next));
  };
  const deleteOne = (id: string) => {
    const next = [...new Set([...deletedIds, id])];
    setDeletedIds(next);
    localStorage.setItem('ridvNotifDeleted', JSON.stringify(next));
  };
  const unhideAll = () => {
    setHiddenIds([]);
    localStorage.setItem('ridvNotifHidden', '[]');
  };

  const visible = items.filter((i) => !deletedIds.includes(i.id) && !hiddenIds.includes(i.id));
  const hiddenCount = items.filter((i) => !deletedIds.includes(i.id) && hiddenIds.includes(i.id)).length;

  const unreadCount = visible.filter((i) => !i.read).length;

  const markAllRead = () => {
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
  };

  const clearAll = () => {
    const next = [...new Set([...deletedIds, ...items.map((i) => i.id)])];
    setDeletedIds(next);
    localStorage.setItem('ridvNotifDeleted', JSON.stringify(next));
  };

  const filtered = visible.filter((i) => {
    if (filter === 'nao-lidas') return !i.read;
    if (filter === 'alertas') return i.type === 'saldo' || i.type === 'pausada';
    return true;
  });

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'aprovada':
        return { icon: CheckCircle2, col: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' };
      case 'performance':
        return { icon: TrendingUp, col: 'text-orange-500 bg-orange-500/10 border-orange-500/20' };
      case 'saldo':
        return { icon: AlertTriangle, col: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
      case 'pausada':
        return { icon: Clock, col: 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20' };
      case 'rejeitada':
        return { icon: AlertTriangle, col: 'text-rose-500 bg-rose-500/10 border-rose-500/20' };
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-transparent border border-blue-500/20">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/20 shrink-0 relative">
            <Bell className="h-6 w-6" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-500 text-white font-black text-[10px] flex items-center justify-center animate-pulse">
                {unreadCount}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-zinc-900 dark:text-white tracking-tight leading-none">
              Central de Notificações Inteligentes
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Avisos em tempo real da auditoria RIDV, picos de engajamento e status de saldo.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {unreadCount > 0 && (
            <Button
              onClick={markAllRead}
              variant="outline"
              size="sm"
              className="h-9 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5"
            >
              <CheckCheck className="h-4 w-4 text-emerald-500" /> Marcar lidas
            </Button>
          )}

          {items.length > 0 && (
            <Button
              onClick={clearAll}
              variant="ghost"
              size="sm"
              className="h-9 px-3 rounded-xl font-bold text-xs text-zinc-400 hover:text-rose-500 flex items-center gap-1.5"
            >
              <Trash2 className="h-4 w-4" /> Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
        {[
          { id: 'todas', label: 'Todas', count: visible.length },
          { id: 'nao-lidas', label: 'Não Lidas', count: unreadCount },
          { id: 'alertas', label: 'Alertas de Saldo & Status', count: visible.filter((i) => i.type === 'saldo' || i.type === 'pausada').length },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id as any)}
            className={cn(
              'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5',
              filter === f.id
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            )}
          >
            <span>{f.label}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/20 dark:bg-black/20">{f.count}</span>
          </button>
        ))}
        {hiddenCount > 0 && (
          <button
            onClick={unhideAll}
            className="ml-auto flex items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] font-bold text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            title="Restaurar notificações escondidas"
          >
            <EyeOff className="h-3 w-3" /> Mostrar ocultas ({hiddenCount})
          </button>
        )}
      </div>

      {/* Lista de notificações */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 rounded-3xl bg-zinc-50 dark:bg-zinc-900/50 border border-dashed border-zinc-200 dark:border-zinc-800 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center mx-auto">
            <Bell className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Nenhuma notificação encontrada</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Sua central está limpa e atualizada. Novos alertas sobre suas campanhas aparecerão aqui automaticamente.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const { icon: Icon, col } = getIcon(item.type);
            return (
              <div
                key={item.id}
                onClick={() => {
                  setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
                }}
                className={cn(
                  'rounded-2xl p-4 transition-all duration-200 border flex items-start gap-3.5 cursor-pointer',
                  item.read
                    ? 'bg-white dark:bg-zinc-900/80 border-zinc-200/60 dark:border-zinc-800/60 opacity-75'
                    : 'bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-transparent border-blue-500/30 shadow-sm'
                )}
              >
                <div className={cn('p-2.5 rounded-xl shrink-0 border', col)}>
                  <Icon className="h-5 w-5" />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={cn('text-xs sm:text-sm font-black truncate', item.read ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-900 dark:text-white')}>
                      {item.title}
                    </h3>
                    <span className="text-[10px] font-bold text-zinc-400 shrink-0">{item.time}</span>
                  </div>

                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {item.msg}
                  </p>
                </div>

                {/* Ações do card: esconder / excluir */}
                <div className="flex shrink-0 flex-col items-center gap-1 self-center">
                  {!item.read && <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                  <button
                    type="button"
                    title="Esconder notificação"
                    onClick={(e) => { e.stopPropagation(); hideOne(item.id); }}
                    className="rounded-lg p-1.5 text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Excluir notificação"
                    onClick={(e) => { e.stopPropagation(); deleteOne(item.id); }}
                    className="rounded-lg p-1.5 text-zinc-300 transition-colors hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
