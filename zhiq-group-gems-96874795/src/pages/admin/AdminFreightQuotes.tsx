/**
 * AdminFreightQuotes — métricas do marketplace de cotações de frete +
 * CONFIGURAÇÃO DA COMISSÃO da plataforma (percentual/mín/máx/por categoria),
 * parametrizável sem alterar código (RPC admin_set_freight_commission,
 * protegida por has_role admin). Métricas via get_freight_quote_metrics
 * (agregados — nenhuma linha sensível exposta).
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { freightQuoteActions } from "@/hooks/useFreightQuotes";
import { brlLabel } from "@/lib/freight/quoteEngine";
import { Loader2, Truck, Save, HandCoins, BarChart3 } from "lucide-react";

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm">
      <p className="text-xl font-black text-zinc-900 tabular-nums">{value}</p>
      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</p>
    </div>
  );
}

export default function AdminFreightQuotes() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ["admin-freight-quote-metrics"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_freight_quote_metrics");
      if (error) throw new Error(error.message);
      return data as any;
    },
  });

  const { data: settings, refetch } = useQuery({
    queryKey: ["admin-freight-commission-settings"],
    queryFn: async () => {
      const { data } = await (supabase.from("freight_commission_settings") as any).select("*").eq("id", 1).maybeSingle();
      return data as any;
    },
  });

  const [form, setForm] = useState({ enabled: false, percent: "", min_brl: "", max_brl: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!settings) return;
    setForm({
      enabled: !!settings.enabled,
      percent: settings.percent != null ? String(settings.percent) : "",
      min_brl: settings.min_brl != null ? String(settings.min_brl) : "",
      max_brl: settings.max_brl != null ? String(settings.max_brl) : "",
    });
  }, [settings]);

  const saveCommission = async () => {
    setSaving(true);
    try {
      await freightQuoteActions.adminSetCommission({
        enabled: form.enabled,
        percent: form.percent || "0",
        min_brl: form.min_brl || "",
        max_brl: form.max_brl || "",
      });
      toast.success("Comissão atualizada! Vale a partir do próximo aceite.");
      await refetch();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar (apenas admins).");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-black text-zinc-900 uppercase tracking-tight flex items-center gap-2">
          <Truck className="w-6 h-6 text-[#FF6A00]" /> Fretes — Marketplace de Cotações
        </h1>
        <p className="text-xs font-bold text-zinc-500">Métricas do Solicitar Frete + configuração da comissão da plataforma.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-zinc-400"><Loader2 className="w-6 h-6 animate-spin" /> Carregando métricas…</div>
      ) : metrics ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Metric label="Solicitações abertas" value={metrics.abertas ?? 0} />
            <Metric label="Concluídas" value={metrics.concluidas ?? 0} />
            <Metric label="Canceladas" value={metrics.canceladas ?? 0} />
            <Metric label="Propostas enviadas" value={metrics.propostas ?? 0} />
            <Metric label="Tempo médio de resposta" value={metrics.tempo_medio_resposta_min != null ? `${metrics.tempo_medio_resposta_min} min` : "—"} />
            <Metric label="Taxa de conversão" value={`${metrics.taxa_conversao_pct ?? 0}%`} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-sm">
              <h3 className="text-[11px] font-black text-zinc-700 uppercase tracking-widest mb-3 flex items-center gap-1.5"><BarChart3 className="w-4 h-4 text-[#FF6A00]" /> Valor médio (aceitas)</h3>
              <p className="text-2xl font-black text-emerald-600">{brlLabel(Number(metrics.valor_medio_brl) || null)}</p>
            </div>
            <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-sm">
              <h3 className="text-[11px] font-black text-zinc-700 uppercase tracking-widest mb-3">Regiões com maior demanda</h3>
              <ul className="space-y-1.5">
                {(metrics.top_regioes || []).slice(0, 6).map((r: any, i: number) => (
                  <li key={i} className="flex justify-between text-xs font-bold text-zinc-600">
                    <span>{r.cidade}</span><span className="tabular-nums text-zinc-900">{r.solicitacoes}</span>
                  </li>
                ))}
                {(metrics.top_regioes || []).length === 0 && <li className="text-xs text-zinc-400">Sem dados ainda.</li>}
              </ul>
            </div>
            <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-sm">
              <h3 className="text-[11px] font-black text-zinc-700 uppercase tracking-widest mb-3">Categorias mais solicitadas</h3>
              <ul className="space-y-1.5">
                {(metrics.top_categorias || []).slice(0, 6).map((c: any, i: number) => (
                  <li key={i} className="flex justify-between text-xs font-bold text-zinc-600">
                    <span>{c.categoria}</span><span className="tabular-nums text-zinc-900">{c.solicitacoes}</span>
                  </li>
                ))}
                {(metrics.top_categorias || []).length === 0 && <li className="text-xs text-zinc-400">Sem dados ainda.</li>}
              </ul>
            </div>
          </div>
          <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-sm">
            <h3 className="text-[11px] font-black text-zinc-700 uppercase tracking-widest mb-3">Transportadores mais ativos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(metrics.top_transportadores || []).slice(0, 10).map((t: any, i: number) => (
                <div key={i} className="flex justify-between items-center bg-zinc-50 rounded-xl px-3 py-2 text-xs font-bold text-zinc-600">
                  <span className="font-mono text-[10px] truncate">{String(t.transporter_user_id).slice(0, 8)}…</span>
                  <span>{t.propostas} proposta(s) · {t.aceitas} aceita(s)</span>
                </div>
              ))}
              {(metrics.top_transportadores || []).length === 0 && <p className="text-xs text-zinc-400">Sem dados ainda.</p>}
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-zinc-400">Sem métricas (a migration foi aplicada?).</p>
      )}

      {/* COMISSÃO CONFIGURÁVEL */}
      <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-sm space-y-4">
        <h2 className="text-xs font-black text-zinc-800 uppercase tracking-widest flex items-center gap-2">
          <HandCoins className="w-4 h-4 text-[#FF6A00]" /> Comissão da plataforma (configurável)
        </h2>
        <p className="text-[11px] text-zinc-500 font-bold">
          Aplicada SOMENTE no aceite definitivo do serviço. Enquanto desligada, nenhum valor é registrado.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div>
            <span className="block text-[10px] font-black text-zinc-600 uppercase tracking-wider mb-1">Status</span>
            <button type="button" onClick={() => setForm((s) => ({ ...s, enabled: !s.enabled }))}
              className={cn("w-full h-10 rounded-xl text-[11px] font-black uppercase tracking-wider border",
                form.enabled ? "bg-emerald-500 border-emerald-500 text-white" : "bg-zinc-100 border-zinc-200 text-zinc-500")}>
              {form.enabled ? "Ativa" : "Desligada"}
            </button>
          </div>
          <label className="block">
            <span className="block text-[10px] font-black text-zinc-600 uppercase tracking-wider mb-1">Percentual (%)</span>
            <input value={form.percent} onChange={(e) => setForm((s) => ({ ...s, percent: e.target.value }))}
              placeholder="5" className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-xs outline-none focus:border-[#FF6A00]/60" />
          </label>
          <label className="block">
            <span className="block text-[10px] font-black text-zinc-600 uppercase tracking-wider mb-1">Mínima (R$)</span>
            <input value={form.min_brl} onChange={(e) => setForm((s) => ({ ...s, min_brl: e.target.value }))}
              placeholder="10" className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-xs outline-none focus:border-[#FF6A00]/60" />
          </label>
          <label className="block">
            <span className="block text-[10px] font-black text-zinc-600 uppercase tracking-wider mb-1">Máxima (R$)</span>
            <input value={form.max_brl} onChange={(e) => setForm((s) => ({ ...s, max_brl: e.target.value }))}
              placeholder="500" className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-xs outline-none focus:border-[#FF6A00]/60" />
          </label>
        </div>
        <button onClick={saveCommission} disabled={saving}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#FF6A00] text-white text-xs font-black uppercase tracking-widest hover:bg-[#E65C00] disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar comissão
        </button>
        <p className="text-[10px] text-zinc-400">
          Comissão por categoria e por km já têm estrutura no banco (per_category/per_km) — configuráveis via API quando necessário.
        </p>
      </div>
    </div>
  );
}
