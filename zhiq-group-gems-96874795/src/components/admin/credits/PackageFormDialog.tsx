/**
 * PackageFormDialog — Formulário para criar/editar pacotes de créditos.
 * Reutilizável entre módulos (real_estate, vehicles, products).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import type { AdminCreditProduct } from "@/hooks/useAdminCredits";

export function PackageFormDialog({
  pkg,
  initialCategory,
  onClose,
  onSave,
  isSubmitting,
  isProduct = false,
}: {
  pkg?: Partial<AdminCreditProduct>;
  initialCategory?: string;
  onClose: () => void;
  onSave: (data: Partial<AdminCreditProduct>) => void;
  isSubmitting: boolean;
  isProduct?: boolean;
}) {
  const [form, setForm] = useState({
    name: pkg?.name || "",
    description: pkg?.description || "",
    price_brl: pkg?.price_brl || 0,
    credits_amount: pkg?.credits_amount || 0,
    credits_base: pkg?.credits_base || pkg?.credits_amount || 0,
    credits_bonus: pkg?.credits_bonus || pkg?.bonus_credits || 0,
    package_type: pkg?.package_type || pkg?.product_type || "standard",
    product_type: pkg?.product_type || pkg?.package_type || "pacote",
    category: pkg?.category || initialCategory || "real_estate",
    badge_text: pkg?.badge_text || "",
    button_label: pkg?.button_label || pkg?.action_label || "Selecionar",
    is_recommended: pkg?.is_recommended || false,
    is_featured: pkg?.is_featured || false,
    sort_order: pkg?.sort_order || 0,
    features_json: pkg?.features_json || [],
    // campos específicos de produtos/rollover
    rollover_enabled: pkg?.rollover_enabled || false,
    rollover_percent: pkg?.rollover_percent || 0,
  });

  const [featuresText, setFeaturesText] = useState(
    Array.isArray(pkg?.features_json) ? pkg.features_json.join("\n") : ""
  );

  const handleSave = () => {
    const features_json = featuresText
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);

    onSave({ ...form, features_json });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pkg ? "Editar Pacote" : "Novo Pacote"}</DialogTitle>
          <DialogDescription>Preencha os dados comerciais do pacote de créditos.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6 py-4">
          {/* BASIC INFO */}
          <div className="col-span-2 sm:col-span-1 space-y-2">
            <Label className="text-xs font-black uppercase text-zinc-500">Nome Comercial</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Pacote Premium" className="font-bold" />
          </div>

          <div className="col-span-2 sm:col-span-1 space-y-2">
            <Label className="text-xs font-black uppercase text-zinc-500">Posição (Ordem)</Label>
            <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
          </div>

          {/* VALUES */}
          {isProduct ? (
            <div className="col-span-2 bg-zinc-50/50 p-4 rounded-2xl border border-zinc-100 space-y-4">
              <Label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Distribuição de Créditos</Label>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-zinc-600">Base</Label>
                  <Input
                    type="number" min="0"
                    value={form.credits_base}
                    onChange={(e) => {
                      const base = Number(e.target.value) || 0;
                      const bonus = Number(form.credits_bonus) || 0;
                      setForm({ ...form, credits_base: base, credits_amount: base + bonus });
                    }}
                    className="h-10 text-center font-mono font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-zinc-600">Bônus</Label>
                  <Input
                    type="number" min="0"
                    value={form.credits_bonus}
                    onChange={(e) => {
                      const bonus = Number(e.target.value) || 0;
                      const base = Number(form.credits_base) || 0;
                      setForm({ ...form, credits_bonus: bonus, credits_amount: base + bonus });
                    }}
                    className="h-10 text-center font-mono font-bold text-emerald-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-zinc-600">Total</Label>
                  <Input
                    type="number"
                    value={form.credits_amount}
                    className="h-10 text-center font-mono font-black bg-white border-zinc-200"
                    disabled
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="col-span-2 grid grid-cols-2 gap-4 bg-zinc-50/50 p-4 rounded-2xl border border-zinc-100">
              <div className="space-y-2">
                <Label className="text-xs font-bold">Total de Créditos</Label>
                <Input type="number" value={form.credits_amount} onChange={(e) => setForm({ ...form, credits_amount: parseInt(e.target.value) || 0 })} className="font-mono font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold">Créditos de Bônus</Label>
                <Input type="number" value={form.credits_bonus} onChange={(e) => setForm({ ...form, credits_bonus: parseInt(e.target.value) || 0 })} className="font-mono font-bold text-emerald-600" />
              </div>
            </div>
          )}

          {/* COMMERCIAL */}
          <div className="space-y-2">
            <Label className="text-xs font-black uppercase text-zinc-500">Preço (R$)</Label>
            <Input
              type="number" step="0.01" min="0"
              value={form.price_brl}
              onChange={(e) => setForm({ ...form, price_brl: parseFloat(e.target.value) || 0 })}
              className="font-mono font-bold text-blue-600"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-black uppercase text-zinc-500">Tipo do Plano</Label>
            {isProduct ? (
              <Select value={form.product_type} onValueChange={(v) => setForm({ ...form, product_type: v, package_type: v })}>
                <SelectTrigger className="font-medium"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pacote">Avulso / Pacote</SelectItem>
                  <SelectItem value="mensal">Assinatura Mensal</SelectItem>
                  <SelectItem value="semestral">Assinatura Semestral</SelectItem>
                  <SelectItem value="anual">Assinatura Anual</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input value={form.package_type} onChange={(e) => setForm({ ...form, package_type: e.target.value })} placeholder="standard, premium, exclusive" />
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-black uppercase text-zinc-500">Texto da Badge</Label>
            <Input value={form.badge_text} onChange={(e) => setForm({ ...form, badge_text: e.target.value })} placeholder="Ex: MAIS VENDIDO" className="uppercase font-black text-[11px]" />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-black uppercase text-zinc-500">Texto do Botão</Label>
            <Input value={form.button_label} onChange={(e) => setForm({ ...form, button_label: e.target.value })} placeholder="ADQUIRIR AGORA" />
          </div>

          {/* OPTIONS */}
          <div className="col-span-2 grid grid-cols-2 gap-4 py-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-100">
              <div className="space-y-0.5">
                <Label className="text-xs font-bold text-zinc-700">Sugerido ⭐</Label>
                <p className="text-[9px] text-zinc-400 italic font-medium leading-none">Marca como plano recomendado/melhor custo</p>
              </div>
              <Switch checked={form.is_recommended} onCheckedChange={(v) => setForm({ ...form, is_recommended: v })} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-100">
              <div className="space-y-0.5">
                <Label className="text-xs font-bold text-zinc-700">Destaque 🚀</Label>
                <p className="text-[9px] text-zinc-400 italic font-medium leading-none">Exibe estrela de destaque comercial no card</p>
              </div>
              <Switch checked={form.is_featured} onCheckedChange={(v) => setForm({ ...form, is_featured: v })} />
            </div>
          </div>

          {isProduct && (
            <div className="col-span-2 space-y-4 p-4 rounded-2xl bg-violet-50/50 border border-violet-100">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-black uppercase text-violet-700">Rollover (Acumular Créditos) 🔄</Label>
                  <p className="text-[10px] text-violet-500 italic">Créditos não usados acumulam para o próximo ciclo de faturamento.</p>
                </div>
                <Switch
                  checked={form.rollover_enabled}
                  onCheckedChange={(v) => setForm({ ...form, rollover_enabled: v })}
                />
              </div>
              {form.rollover_enabled && (
                <div className="flex items-center gap-3 pl-4 border-l-2 border-violet-200">
                  <Label className="text-xs font-bold text-violet-600 shrink-0">% Permitida:</Label>
                  <Input
                    type="number" min="0" max="100"
                    value={form.rollover_percent}
                    onChange={(e) => setForm({ ...form, rollover_percent: parseInt(e.target.value) || 0 })}
                    className="h-8 max-w-[80px] text-center font-bold"
                  />
                  <span className="text-xs font-bold text-violet-400">% do total base</span>
                </div>
              )}
            </div>
          )}

          {/* CONTENT */}
          <div className="col-span-2 space-y-2">
            <Label className="text-xs font-black uppercase text-zinc-500">Descrição Comercial (Curta)</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Breve resumo do pacote que aparece no card..." rows={2} className="text-sm" />
          </div>

          <div className="col-span-2 space-y-3 pt-4 border-t border-zinc-100">
            <div className="flex items-center justify-between">
              <Label className="text-indigo-600 font-black text-[10px] uppercase tracking-widest flex items-center gap-2">
                Benefícios e Features (Um por linha)
              </Label>
              <span className="text-[9px] text-zinc-400 font-bold uppercase">Aparecem com check de confirmação</span>
            </div>
            <Textarea
              value={featuresText}
              onChange={(e) => setFeaturesText(e.target.value)}
              placeholder="Ex:&#10;Exposição Premium&#10;Destaque no Marketplace&#10;Suporte VIP"
              className="min-h-[140px] font-mono text-xs leading-loose bg-zinc-50/30 border-zinc-200"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button
            className="bg-[#FF6A00] hover:bg-[#e65c00]"
            onClick={handleSave}
            disabled={isSubmitting || !form.name.trim()}
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {pkg ? "Salvar Alterações" : "Criar Pacote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
