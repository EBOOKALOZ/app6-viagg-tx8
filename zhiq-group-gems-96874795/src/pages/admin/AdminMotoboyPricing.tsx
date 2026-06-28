import { useState, useEffect } from "react";
import { Settings, Save, Loader2, Bot, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { viaggAI } from "@/lib/viaggAI";

interface PricingConfig {
  id: string;
  label: string;
  min_price: number;
  base_price: number;
  price_per_km: number;
  platform_commission_pct: number;
  max_service_radius_km: number;
  is_active: boolean;
  updated_at: string;
}

interface RideStat {
  total: number;
  revenue: number;
  avg_distance: number;
}

export default function AdminMotoboyPricing() {
  const [config, setConfig] = useState<PricingConfig | null>(null);
  const [form, setForm] = useState({
    min_price: "8.00",
    base_price: "3.00",
    price_per_km: "2.50",
    platform_commission_pct: "20.00",
    max_service_radius_km: "20.00",
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<RideStat | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Preview do preço exemplo
  const examplePrice = Math.max(
    parseFloat(form.min_price) || 0,
    (parseFloat(form.base_price) || 0) + 5 * (parseFloat(form.price_per_km) || 0)
  );

  useEffect(() => {
    const load = async () => {
      // Config
      const { data: cfg } = await supabase
        .from("ride_pricing_config")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .single();

      if (cfg) {
        setConfig(cfg as PricingConfig);
        setForm({
          min_price: (cfg as PricingConfig).min_price.toFixed(2),
          base_price: (cfg as PricingConfig).base_price.toFixed(2),
          price_per_km: (cfg as PricingConfig).price_per_km.toFixed(2),
          platform_commission_pct: (cfg as PricingConfig).platform_commission_pct.toFixed(2),
          max_service_radius_km: (cfg as PricingConfig).max_service_radius_km.toFixed(2),
        });
      }

      // Stats de corridas
      const { data: ridesData } = await supabase
        .from("public_rides")
        .select("estimated_price, distance_km");

      if (ridesData && ridesData.length > 0) {
        const arr = ridesData as { estimated_price: number; distance_km: number | null }[];
        setStats({
          total: arr.length,
          revenue: arr.reduce((s, r) => s + (r.estimated_price ?? 0), 0),
          avg_distance: arr.reduce((s, r) => s + (r.distance_km ?? 0), 0) / arr.length,
        });
      }

      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("update_ride_pricing_config", {
        p_config_id: config.id,
        p_min_price: parseFloat(form.min_price),
        p_base_price: parseFloat(form.base_price),
        p_price_per_km: parseFloat(form.price_per_km),
        p_platform_commission_pct: parseFloat(form.platform_commission_pct),
        p_max_service_radius_km: parseFloat(form.max_service_radius_km),
      });
      if (error) throw error;
      toast.success("Configuração salva com sucesso!");
    } catch (err) {
      toast.error("Erro ao salvar configuração.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleAiSuggest = async () => {
    setAiLoading(true);
    setAiSuggestion(null);
    try {
      const context = `
Você é a IA Viagg-TX8 analisando a configuração de preços do módulo de motoboy.
Configuração atual:
- Preço mínimo: R$ ${form.min_price}
- Preço base: R$ ${form.base_price}
- Preço por km: R$ ${form.price_per_km}
- Comissão da plataforma: ${form.platform_commission_pct}%
- Raio máximo de atendimento: ${form.max_service_radius_km} km
${stats ? `Estatísticas: ${stats.total} corridas, receita total R$ ${stats.revenue.toFixed(2)}, distância média ${stats.avg_distance.toFixed(1)} km` : ""}
`.trim();

      const suggestion = await viaggAI.ask(
        "Analise esta configuração de preços e sugira ajustes para maximizar corridas e receita. Seja específico e objetivo. Máx 3 sugestões práticas.",
        { context, maxTokens: 300 }
      );
      setAiSuggestion(suggestion);
    } catch {
      toast.error("IA indisponível no momento.");
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-[#FF6A00] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center">
          <Settings className="w-5 h-5 text-[#FF6A00]" />
        </div>
        <div>
          <h1 className="text-xl font-black text-zinc-900">Precificação — Motoboy Público</h1>
          <p className="text-xs text-zinc-500">Configurado pela IA Viagg-TX8 · Atualizado em tempo real</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Corridas" value={String(stats.total)} />
          <StatCard label="Receita" value={`R$ ${stats.revenue.toFixed(0)}`} />
          <StatCard label="Distância média" value={`${stats.avg_distance.toFixed(1)} km`} />
        </div>
      )}

      {/* Formulário de configuração */}
      <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 p-6 space-y-5">
        <h2 className="font-black text-zinc-900">Parâmetros de Precificação</h2>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Preço mínimo (R$)"
            value={form.min_price}
            onChange={(v) => setForm((f) => ({ ...f, min_price: v }))}
            hint="Cobrado mesmo em corridas curtas"
          />
          <FormField
            label="Preço base (R$)"
            value={form.base_price}
            onChange={(v) => setForm((f) => ({ ...f, base_price: v }))}
            hint="Taxa de acionamento"
          />
          <FormField
            label="Preço por km (R$)"
            value={form.price_per_km}
            onChange={(v) => setForm((f) => ({ ...f, price_per_km: v }))}
            hint="Valor multiplicado pela distância"
          />
          <FormField
            label="Comissão da plataforma (%)"
            value={form.platform_commission_pct}
            onChange={(v) => setForm((f) => ({ ...f, platform_commission_pct: v }))}
            hint="% retido pela VIAGG"
          />
          <FormField
            label="Raio máximo (km)"
            value={form.max_service_radius_km}
            onChange={(v) => setForm((f) => ({ ...f, max_service_radius_km: v }))}
            hint="Área máxima de atendimento"
            className="col-span-2"
          />
        </div>

        {/* Preview */}
        <div className="bg-orange-50 rounded-2xl p-4 border border-orange-100">
          <p className="text-xs font-bold text-orange-600 uppercase tracking-wide mb-1">Preview — corrida de 5 km</p>
          <p className="text-2xl font-black text-zinc-900">
            R$ {examplePrice.toFixed(2).replace(".", ",")}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Motoboy recebe: R$ {(examplePrice * (1 - parseFloat(form.platform_commission_pct || "0") / 100)).toFixed(2).replace(".", ",")}
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-[#FF6A00] hover:bg-[#e55a00] text-white font-black rounded-2xl h-11"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (
            <span className="flex items-center gap-2"><Save className="w-4 h-4" /> Salvar configuração</span>
          )}
        </Button>
      </div>

      {/* IA Viagg-TX8 */}
      <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-3xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-orange-500/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <p className="font-black text-white text-sm">IA Viagg-TX8</p>
            <p className="text-zinc-400 text-xs">Análise inteligente de precificação</p>
          </div>
        </div>

        {aiSuggestion ? (
          <div className="bg-zinc-800/50 rounded-2xl p-4">
            <p className="text-zinc-200 text-sm leading-relaxed">{aiSuggestion}</p>
          </div>
        ) : (
          <p className="text-zinc-400 text-sm">
            A IA pode analisar sua configuração atual e sugerir ajustes para maximizar corridas e receita.
          </p>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleAiSuggest}
            disabled={aiLoading}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl"
          >
            {aiLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <span className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Analisar e sugerir
              </span>
            )}
          </Button>
          {aiSuggestion && (
            <Button
              onClick={() => setAiSuggestion(null)}
              variant="outline"
              className="rounded-2xl border-zinc-700 text-zinc-300 hover:bg-zinc-700"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-3 text-center shadow-sm">
      <p className="text-lg font-black text-zinc-900">{value}</p>
      <p className="text-[10px] text-zinc-400 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function FormField({
  label, value, onChange, hint, className,
}: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <label className="text-xs font-bold text-zinc-700">{label}</label>
      <Input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border-zinc-200 h-9 text-sm"
      />
      {hint && <p className="text-[10px] text-zinc-400">{hint}</p>}
    </div>
  );
}
