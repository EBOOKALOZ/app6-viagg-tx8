/**
 * AdminRealEstateCharges — aba "Cobranças" dentro de /admin/imoveis/pacotes.
 *
 * Regras de CONSUMO de créditos do anunciante de imóveis (custo FIXO):
 *   1. Clique no anúncio           → feature_code = 'real_estate_listing_click'  (default 6)
 *   2. Desbloquear WhatsApp/contato → feature_code = 'real_estate_unlock_whatsapp' (default 9)
 *
 * Persiste em `merchant_credit_usage_rules` (reuso). Toggle global liga/desliga
 * a cobrança (regra inativa = evento gratuito).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Coins, KeyRound, MousePointerClick } from "lucide-react";

const SITUATIONS = [
  {
    key: "real_estate_listing_click",
    label: "Clique no anúncio",
    desc: "Cobrado do anunciante quando alguém clica/abre o anúncio dele.",
    icon: MousePointerClick,
    color: "text-sky-600",
    def: 6,
  },
  {
    key: "real_estate_unlock_whatsapp",
    label: "Desbloquear WhatsApp do cliente",
    desc: "Cobrado quando o anunciante desbloqueia o contato (WhatsApp + e-mail) do interessado.",
    icon: KeyRound,
    color: "text-emerald-600",
    def: 12,
  },
];

export default function AdminRealEstateCharges() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState(true);
  const [costs, setCosts] = useState<Record<string, number>>(
    Object.fromEntries(SITUATIONS.map((s) => [s.key, s.def]))
  );
  const [ruleIds, setRuleIds] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const codes = SITUATIONS.map((s) => s.key);
      const { data } = await (supabase.from("merchant_credit_usage_rules") as any)
        .select("id, feature_code, credits_cost, is_active")
        .in("feature_code", codes);
      if (data && data.length) {
        const nextCosts: Record<string, number> = { ...costs };
        const nextIds: Record<string, string> = {};
        let anyActive = false;
        for (const r of data) {
          nextCosts[r.feature_code] = Number(r.credits_cost) || nextCosts[r.feature_code];
          nextIds[r.feature_code] = r.id;
          if (r.is_active) anyActive = true;
        }
        setCosts(nextCosts);
        setRuleIds(nextIds);
        setActive(anyActive);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      for (const s of SITUATIONS) {
        const payload = {
          feature_code: s.key,
          feature_name: s.label,
          credits_cost: costs[s.key],
          pricing_mode: "fixed",
          metadata: { module: "real_estate" },
          is_active: active,
        };
        const id = ruleIds[s.key];
        if (id) {
          const { error } = await (supabase.from("merchant_credit_usage_rules") as any).update(payload).eq("id", id);
          if (error) throw error;
        } else {
          const { data, error } = await (supabase.from("merchant_credit_usage_rules") as any).insert(payload).select("id").single();
          if (error) throw error;
          if (data?.id) setRuleIds((prev) => ({ ...prev, [s.key]: data.id }));
        }
      }
      toast.success("Regras de cobrança salvas! ✅");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err?.message || "tente novamente"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando regras de cobrança...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3 py-4 border-b border-zinc-100">
        <Coins className="w-5 h-5 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-black uppercase tracking-tight text-zinc-900">Situações de Cobrança</h2>
          <p className="text-xs text-muted-foreground">Quanto cada evento consome de créditos do anunciante de imóveis</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="w-4 h-4 text-emerald-600" /> Consumo de créditos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <p className="font-semibold text-sm">Cobrança ativa</p>
              <p className="text-xs text-muted-foreground">Se desligado, os eventos abaixo não consomem créditos.</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>

          <div className="space-y-4">
            {SITUATIONS.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.key} className="flex items-start gap-3 rounded-xl border p-3">
                  <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0">
                    <Icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <Label className="font-bold text-sm">{s.label}</Label>
                    <p className="text-xs text-muted-foreground leading-snug">{s.desc}</p>
                  </div>
                  <div className="relative w-28 shrink-0">
                    <Input
                      type="number"
                      min={0}
                      value={costs[s.key]}
                      onChange={(e) => setCosts((prev) => ({ ...prev, [s.key]: Number(e.target.value) }))}
                      className="pr-10 text-right font-black"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">cr</span>
                  </div>
                </div>
              );
            })}
          </div>

          <Button onClick={save} disabled={saving} className="gap-2 bg-[#FF6A00] hover:bg-[#e65c00]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar cobranças
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
