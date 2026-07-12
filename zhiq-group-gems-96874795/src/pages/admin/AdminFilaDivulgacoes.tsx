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
    <div
      className="min-h-screen flex-1 space-y-5 p-4 sm:p-6"
      style={{ background: '#f1f5f9', fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" }}
    >
      {/* Cabeçalho */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-white p-5"
        style={{ boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 12px 36px -16px rgba(15,23,42,.12)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)', boxShadow: '0 8px 18px -8px rgba(22,163,74,.5)' }}
          >
            <ListOrdered className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg text-slate-900" style={{ fontWeight: 800 }}>Fila Inteligente de Divulgações</h1>
            <p className="text-xs" style={{ color: '#64748b' }}>
              Transparência total · ordenada pela IA (patrocinada → pacote → gratuita → orgânica) · tempo real
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-700 transition-all hover:bg-slate-50"
          style={{ fontWeight: 700 }}
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
              'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all duration-[250ms]',
              aba === a.key
                ? 'bg-[#16a34a] text-white shadow-md shadow-emerald-600/30'
                : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
            )}
          >
            {a.label}
            <span className={cn('ml-1.5 rounded-full px-1.5 text-[10px]', aba === a.key ? 'bg-white/25' : 'bg-slate-100')}>{contagem(a.key)}</span>
          </button>
        ))}
      </div>

      {/* Busca + filtros */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <div className="relative col-span-2 md:col-span-3 xl:col-span-2">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar produto, empresa ou código…"
            className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-500"
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
            className="rounded-full border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 shadow-sm outline-none focus:border-emerald-500"
          >
            <option value={f.all}>{f.label}: {f.all}</option>
            {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        <input
          type="date"
          value={fData}
          onChange={e => setFData(e.target.value)}
          className="rounded-full border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 shadow-sm outline-none focus:border-emerald-500"
          title="Filtrar por data de entrada"
        />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/60" />)}
        </div>
      ) : !filtrada.length ? (
        <div
          className="rounded-[20px] bg-white p-12 text-center"
          style={{ border: '2px dashed #e2e8f0', boxShadow: '0 8px 24px -16px rgba(15,23,42,.1)' }}
        >
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl">📭</div>
          <p className="text-sm text-slate-800" style={{ fontWeight: 700 }}>Fila vazia por enquanto</p>
          <p className="mx-auto mt-1 max-w-sm text-xs" style={{ color: '#64748b' }}>
            Novas divulgações (gratuitas, de pacote ou patrocinadas) entram aqui automaticamente, em tempo real —
            assim que um anunciante disparar pela Central de Divulgações.
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
                className="flex flex-col gap-3 rounded-[18px] border border-slate-200 bg-white p-4 transition-all duration-[250ms] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/70 sm:flex-row sm:items-center"
              >
                {/* posição + imagem */}
                <div className="flex items-center gap-3">
                  <span className="w-7 shrink-0 text-center text-sm font-black tabular-nums text-slate-400">
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
                    <p className="text-sm font-black text-slate-900">{item.titulo}</p>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-black"
                      style={{ background: tm.bg, color: tm.color }}>{tm.label}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black', STATUS_COLOR[item.status] ?? 'bg-slate-100 text-slate-600')}>
                      {item.status}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">#{item.codigo}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
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
                  <p className="inline-flex items-center gap-1 text-xs font-black tabular-nums text-slate-800">
                    <Users className="h-3.5 w-3.5 text-slate-400" />
                    {item.grupos_concluidos}/{item.grupos_previstos || '—'}
                    <span className="text-[10px] font-medium text-slate-400">grupos</span>
                  </p>
                  {item.profissional && (
                    <p className="text-[11px] text-slate-500">👤 {item.profissional}</p>
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
