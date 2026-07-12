import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  ListOrdered, RefreshCw, Search, MapPin, Store, Tag, Users,
  Clock, Hourglass, ImageOff, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * /admin/fila-divulgacoes — Fila Inteligente de Divulgações (visão ADMIN).
 * Transparência total sobre a campaign_queue: tipo, prioridade da IA e motivo,
 * status derivado, grupos previstos/concluídos, profissional e reserva.
 * Tempo real via canal postgres_changes. Profissional NUNCA vê esta tela —
 * ele recebe apenas a próxima divulgação no Despachante (AutoPilot).
 */

interface FilaItem {
  id: string; codigo: string; titulo: string; imagem: string | null;
  anunciante: string; categoria: string; cidade: string | null;
  tipo: 'patrocinada' | 'pacote' | 'gratuita_diaria' | 'organica';
  prioridade: number; motivo_prioridade: string; entrada: string;
  status: string; status_bruto: string;
  grupos_previstos: number; grupos_concluidos: number;
  profissional: string | null; reserva_expira: string | null;
}

const TIPO_META: Record<string, { label: string; badge: string; color: string; bg: string }> = {
  patrocinada:     { label: '⭐ Patrocinada', badge: 'Patrocinada', color: '#b45309', bg: '#fef3c7' },
  pacote:          { label: '💳 Pacote Pago', badge: 'Pacote', color: '#1d4ed8', bg: '#dbeafe' },
  gratuita_diaria: { label: '🎁 Gratuita', badge: 'Gratuita', color: '#15803d', bg: '#dcfce7' },
  organica:        { label: '📢 Orgânica', badge: 'Orgânica', color: '#475569', bg: '#f1f5f9' },
};

const STATUS_COLOR: Record<string, string> = {
  'Aguardando': 'bg-slate-100 text-slate-600',
  'Em preparação': 'bg-sky-100 text-sky-700',
  'Reservada': 'bg-amber-100 text-amber-700',
  'Em postagem': 'bg-violet-100 text-violet-700',
  'Concluída': 'bg-emerald-100 text-emerald-700',
  'Expirada': 'bg-rose-100 text-rose-700',
};

const ABAS = [
  { key: 'todas', label: 'Fila completa' },
  { key: 'patrocinada', label: '⭐ Patrocinados' },
  { key: 'pacote', label: '💳 Pacotes Pagos' },
  { key: 'gratuita_diaria', label: '🎁 Gratuitos' },
  { key: 'andamento', label: '⏳ Em andamento' },
  { key: 'concluida', label: '✅ Concluídos' },
] as const;

function tempoRestante(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return 'expirada';
  const m = Math.floor(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m}min ${Math.floor((ms % 60000) / 1000)}s`;
}

export default function AdminFilaDivulgacoes() {
  const queryClient = useQueryClient();
  const [aba, setAba] = useState<(typeof ABAS)[number]['key']>('todas');
  const [busca, setBusca] = useState('');
  const [fCidade, setFCidade] = useState('todas');
  const [fCategoria, setFCategoria] = useState('todas');
  const [fAnunciante, setFAnunciante] = useState('todos');
  const [fStatus, setFStatus] = useState('todos');
  const [fData, setFData] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const { data: fila = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-fila-divulgacoes'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('admin_fila_divulgacoes');
      if (error) throw error;
      return (data || []) as FilaItem[];
    },
  });

  /* Tempo real: qualquer mudança na fila → refetch */
  useEffect(() => {
    const ch = supabase
      .channel('admin-fila-divulgacoes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_queue' },
        () => queryClient.invalidateQueries({ queryKey: ['admin-fila-divulgacoes'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_posting_targets' },
        () => queryClient.invalidateQueries({ queryKey: ['admin-fila-divulgacoes'] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  /* relógio p/ contagem regressiva das reservas */
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const opcoes = useMemo(() => ({
    cidades: [...new Set(fila.map(i => i.cidade).filter(Boolean))].sort() as string[],
    categorias: [...new Set(fila.map(i => i.categoria).filter(Boolean))].sort(),
    anunciantes: [...new Set(fila.map(i => i.anunciante).filter(Boolean))].sort(),
    statuses: [...new Set(fila.map(i => i.status))].sort(),
  }), [fila]);

  const filtrada = useMemo(() => {
    let out = fila;
    if (aba === 'andamento') out = out.filter(i => ['Reservada', 'Em postagem', 'Em preparação'].includes(i.status));
    else if (aba === 'concluida') out = out.filter(i => i.status === 'Concluída');
    else if (aba !== 'todas') out = out.filter(i => i.tipo === aba);

    if (fCidade !== 'todas') out = out.filter(i => i.cidade === fCidade);
    if (fCategoria !== 'todas') out = out.filter(i => i.categoria === fCategoria);
    if (fAnunciante !== 'todos') out = out.filter(i => i.anunciante === fAnunciante);
    if (fStatus !== 'todos') out = out.filter(i => i.status === fStatus);
    if (fData) out = out.filter(i => i.entrada.slice(0, 10) === fData);

    const q = busca.trim().toLowerCase();
    if (q) {
      out = out.filter(i =>
        i.titulo.toLowerCase().includes(q) ||
        i.anunciante.toLowerCase().includes(q) ||
        i.codigo.toLowerCase().includes(q));
    }
    return out; // já vem ordenada pela IA (patrocinada > pacote > gratuita > orgânica)
  }, [fila, aba, fCidade, fCategoria, fAnunciante, fStatus, fData, busca]);

  const contagem = (k: string) =>
    k === 'todas' ? fila.length
      : k === 'andamento' ? fila.filter(i => ['Reservada', 'Em postagem', 'Em preparação'].includes(i.status)).length
      : k === 'concluida' ? fila.filter(i => i.status === 'Concluída').length
      : fila.filter(i => i.tipo === k).length;

  return (
    <div className="min-h-screen flex-1 space-y-5 bg-background p-4 sm:p-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10">
            <ListOrdered className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight">Fila Inteligente de Divulgações</h1>
            <p className="text-xs text-muted-foreground">
              Transparência total · ordenada pela IA (patrocinada → pacote → gratuita → orgânica) · tempo real
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-accent"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} /> Atualizar
        </button>
      </div>

      {/* Abas */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {ABAS.map(a => (
          <button
            key={a.key}
            type="button"
            onClick={() => setAba(a.key)}
            className={cn(
              'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all',
              aba === a.key
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'border border-border bg-card text-muted-foreground hover:bg-accent',
            )}
          >
            {a.label}
            <span className="ml-1.5 rounded-full bg-black/10 px-1.5 text-[10px]">{contagem(a.key)}</span>
          </button>
        ))}
      </div>

      {/* Busca + filtros */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <div className="relative col-span-2 md:col-span-3 xl:col-span-2">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar produto, empresa ou código…"
            className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-xs outline-none focus:border-emerald-500"
          />
        </div>
        {[
          { v: fCidade, set: setFCidade, opts: opcoes.cidades, all: 'todas', label: 'Cidade' },
          { v: fCategoria, set: setFCategoria, opts: opcoes.categorias, all: 'todas', label: 'Categoria' },
          { v: fAnunciante, set: setFAnunciante, opts: opcoes.anunciantes, all: 'todos', label: 'Anunciante' },
          { v: fStatus, set: setFStatus, opts: opcoes.statuses, all: 'todos', label: 'Status' },
        ].map(f => (
          <select
            key={f.label}
            value={f.v}
            onChange={e => f.set(e.target.value)}
            className="rounded-lg border border-border bg-card px-2.5 py-2 text-xs outline-none"
          >
            <option value={f.all}>{f.label}: {f.all}</option>
            {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        <input
          type="date"
          value={fData}
          onChange={e => setFData(e.target.value)}
          className="rounded-lg border border-border bg-card px-2.5 py-2 text-xs outline-none"
          title="Filtrar por data de entrada"
        />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/50" />)}
        </div>
      ) : !filtrada.length ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
          <Filter className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-bold text-muted-foreground">Nenhuma divulgação nesta visão</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Novas divulgações (gratuitas, de pacote ou patrocinadas) entram aqui automaticamente, em tempo real.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrada.map((item, idx) => {
            const tm = TIPO_META[item.tipo] ?? TIPO_META.organica;
            const resta = ['Reservada', 'Em postagem'].includes(item.status)
              ? tempoRestante(item.reserva_expira, now) : null;
            return (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:shadow-md sm:flex-row sm:items-center"
              >
                {/* posição + imagem */}
                <div className="flex items-center gap-3">
                  <span className="w-7 shrink-0 text-center text-sm font-black tabular-nums text-muted-foreground">
                    {idx + 1}º
                  </span>
                  {item.imagem ? (
                    <img src={item.imagem} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted">
                      <ImageOff className="h-5 w-5 text-muted-foreground/40" />
                    </div>
                  )}
                </div>

                {/* infos principais */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black">{item.titulo}</p>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-black"
                      style={{ background: tm.bg, color: tm.color }}>{tm.label}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black', STATUS_COLOR[item.status] ?? 'bg-slate-100 text-slate-600')}>
                      {item.status}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/60">#{item.codigo}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Store className="h-3 w-3" />{item.anunciante}</span>
                    <span className="inline-flex items-center gap-1"><Tag className="h-3 w-3" />{item.categoria}</span>
                    {item.cidade && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{item.cidade}</span>}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(item.entrada).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-emerald-700">
                    IA · prioridade {item.prioridade} — {item.motivo_prioridade}
                  </p>
                </div>

                {/* progresso / profissional / reserva */}
                <div className="flex shrink-0 flex-wrap items-center gap-4 text-center sm:flex-col sm:items-end sm:gap-1">
                  <p className="inline-flex items-center gap-1 text-xs font-black tabular-nums">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    {item.grupos_concluidos}/{item.grupos_previstos || '—'}
                    <span className="text-[10px] font-medium text-muted-foreground">grupos</span>
                  </p>
                  {item.profissional && (
                    <p className="text-[11px] text-muted-foreground">👤 {item.profissional}</p>
                  )}
                  {resta && (
                    <p className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600">
                      <Hourglass className="h-3 w-3" /> reserva: {resta}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
