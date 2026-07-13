import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, FolderSearch } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * /admin/auditoria-categorias — segmentação dos módulos.
 * Relatório (RPC admin_auditoria_categorias) + correção inline de categoria
 * (RPC admin_corrigir_categoria). Somente leitura + update pontual gated admin.
 */

const MODULOS: { key: string; label: string; emoji: string; cor: string }[] = [
  { key: 'mercado_produtos', label: 'Mercado (produtos)', emoji: '🛒', cor: '#16a34a' },
  { key: 'imoveis', label: 'Imóveis', emoji: '🏠', cor: '#2563eb' },
  { key: 'veiculos', label: 'Veículos', emoji: '🚗', cor: '#dc2626' },
  { key: 'servicos', label: 'Serviços', emoji: '🛠️', cor: '#7c3aed' },
  { key: 'fretes', label: 'Fretes', emoji: '🚚', cor: '#ca8a04' },
  { key: 'viagens', label: 'Viagens', emoji: '✈️', cor: '#0284c7' },
];

export default function AdminAuditoriaCategorias() {
  const [novasCat, setNovasCat] = useState<Record<string, string>>({});

  const { data: rel, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-auditoria-categorias'],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('admin_auditoria_categorias');
      if (error) throw error;
      return data as any;
    },
  });

  const corrigir = async (id: string) => {
    const nova = (novasCat[id] || '').trim();
    if (!nova) { toast.error('Informe a nova categoria.'); return; }
    const { error } = await (supabase.rpc as any)('admin_corrigir_categoria', {
      p_listing_id: id, p_nova_categoria: nova,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Categoria corrigida!');
    refetch();
  };

  const Lista = ({ titulo, itens, comFix }: { titulo: string; itens: any[]; comFix?: boolean }) => (
    <div className="rounded-[20px] bg-white p-5" style={{ boxShadow: '0 12px 36px -16px rgba(15,23,42,.12)' }}>
      <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}>
        {titulo} <span className={cn('ml-1 rounded-full px-2 py-0.5 text-[10px]', itens.length ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>{itens.length}</span>
      </p>
      {!itens.length ? (
        <p className="mt-2 text-xs" style={{ color: '#64748b' }}>Nenhum registro — tudo certo. ✅</p>
      ) : (
        <div className="mt-3 space-y-2">
          {itens.map((i: any) => (
            <div key={`${i.id}-${i.tambem_em ?? ''}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-slate-800" style={{ fontWeight: 700 }}>{i.titulo}</p>
                <p className="text-[10px]" style={{ color: '#64748b' }}>
                  {i.categoria ? `categoria atual: ${i.categoria}` : i.tambem_em ? `mesmo título também em: ${i.tambem_em}` : 'sem categoria'}
                  <span className="ml-2 font-mono text-slate-400">#{String(i.id).slice(0, 8)}</span>
                </p>
              </div>
              {comFix && (
                <div className="flex items-center gap-1.5">
                  <input
                    value={novasCat[i.id] ?? ''}
                    onChange={e => setNovasCat(s => ({ ...s, [i.id]: e.target.value }))}
                    placeholder="Nova categoria…"
                    className="w-44 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => corrigir(i.id)}
                    className="rounded-full px-3.5 py-1.5 text-[11px] text-white"
                    style={{ background: '#16a34a', fontWeight: 700 }}
                  >
                    Corrigir
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex-1 space-y-4 p-4 sm:p-6" style={{ background: '#f1f5f9', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-white p-5" style={{ boxShadow: '0 12px 36px -16px rgba(15,23,42,.12)' }}>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
            <FolderSearch className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg text-slate-900" style={{ fontWeight: 800 }}>Auditoria de Categorias</h1>
            <p className="text-xs" style={{ color: '#64748b' }}>
              Segmentação por módulo · sem categoria · suspeitos de classificação errada · duplicados entre módulos
            </p>
          </div>
        </div>
        <button type="button" onClick={() => refetch()} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-700 hover:bg-slate-50" style={{ fontWeight: 700 }}>
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} /> Atualizar
        </button>
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-[20px] bg-white/80" />
      ) : !rel?.success ? (
        <div className="rounded-[20px] bg-white p-8 text-center text-sm text-slate-500">Acesso restrito a administradores.</div>
      ) : (
        <>
          {/* Contagem por módulo */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {MODULOS.map(m => (
              <div key={m.key} className="rounded-[18px] bg-white p-4 text-center" style={{ boxShadow: '0 10px 28px -16px rgba(15,23,42,.12)' }}>
                <p className="text-xl">{m.emoji}</p>
                <p className="tabular-nums text-2xl" style={{ fontWeight: 800, color: m.cor }}>{rel.por_modulo?.[m.key] ?? 0}</p>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: '#94a3b8', fontWeight: 700 }}>{m.label}</p>
              </div>
            ))}
          </div>

          <Lista titulo="🚫 Anúncios sem categoria (Mercado)" itens={rel.sem_categoria ?? []} comFix />
          <Lista titulo="⚠️ Suspeitos de pertencer a outro módulo" itens={rel.suspeitos_outro_modulo ?? []} comFix />
          <Lista titulo="👯 Possíveis duplicados entre módulos (mesmo título)" itens={rel.duplicados_entre_modulos ?? []} />

          <p className="px-1 text-[11px]" style={{ color: '#94a3b8' }}>
            A correção altera apenas a categoria do anúncio no Mercado (advertiser_listings). Mover um anúncio para outro
            módulo exige recadastro no módulo correto — os "suspeitos" servem como fila de revisão manual.
          </p>
        </>
      )}
    </div>
  );
}
