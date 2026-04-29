import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Logo } from "@/components/Logo";
import { Loader2, Store } from "lucide-react";
import { brazilianStates } from "@/lib/brazilianStates";
import { cn } from "@/lib/utils";
import { CategoriaAutocomplete } from "@/components/merchant/CategoriaAutocomplete";



export default function MerchantOnboarding() {
  const navigate = useNavigate();
  const { user, refreshProfiles } = useAuth();
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome_loja: "",
    categoria_id: "",
    categoria_nome: "",
    whatsapp: "",
    cidade: "",
    estado: "",
    endereco: "",
  });

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const isValid =
    form.nome_loja.trim().length >= 2 &&
    form.categoria_id.length > 0 &&
    form.whatsapp.length >= 10 &&
    form.cidade.trim().length >= 2 &&
    form.estado.length === 2 &&
    form.endereco.trim().length >= 5;

  const handleSubmit = async () => {
    if (!user || !isValid || saving) return;
    setSaving(true);

    try {
      // Update merchant_stores
      const { error: storeError } = await supabase
        .from("merchant_stores")
        .update({
          nome_loja: form.nome_loja.trim(),
          categoria: form.categoria_nome, // Salva o nome ou slug para manter retrocompatibilidade visual
          cidade: form.cidade.trim(),
          estado: form.estado,
          endereco_formatado: form.endereco.trim(),
        })
        .eq("user_id", user.id);

      if (storeError) throw storeError;

      // Update main profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          cidade: form.cidade.trim(),
          estado: form.estado,
          whatsapp: form.whatsapp.trim(),
        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      // Mark onboarding complete
      const { error: onboardingError } = await supabase.rpc(
        "complete_profile_onboarding" as any,
        { p_profile_type: "merchant" }
      );

      if (onboardingError) throw onboardingError;

      // Re-sync profile data in context
      await refreshProfiles();

      toast({ title: "Loja configurada!", description: "Bem-vindo ao painel Lojista." });
      navigate("/merchant", { replace: true });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-950 via-emerald-900 to-black">
      <div className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center space-y-3 text-center">
            <Logo size="xl" />
            <div className="flex items-center gap-2 mt-4">
              <Store className="h-6 w-6 text-emerald-400" />
              <h1 className="text-xl font-bold text-white">Configure sua Loja</h1>
            </div>
            <p className="text-sm text-white/60">Preencha os dados para começar a receber pedidos</p>
          </div>

          <div className="space-y-4 rounded-xl border border-white/10 bg-black/30 p-5">
            <div className="space-y-2">
              <Label className="text-white/80">Nome da Loja</Label>
              <Input
                placeholder="Ex: Pizzaria do João"
                value={form.nome_loja}
                onChange={(e) => update("nome_loja", e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>

            <div className="space-y-2 relative z-50">
              <Label className="text-white/80">Categoria da Loja</Label>
              <CategoriaAutocomplete
                valueId={form.categoria_id}
                valueName={form.categoria_nome}
                onChange={(id, nome) => {
                  update("categoria_id", id);
                  update("categoria_nome", nome);
                }}
                theme="dark"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white/80">WhatsApp</Label>
              <Input
                placeholder="(11) 99999-9999"
                value={form.whatsapp}
                onChange={(e) => update("whatsapp", e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-white/80">Cidade</Label>
                <Input
                  placeholder="Sua cidade"
                  value={form.cidade}
                  onChange={(e) => update("cidade", e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/80">Estado</Label>
                <Select value={form.estado} onValueChange={(v) => update("estado", v)}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {brazilianStates.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-white/80">Endereço</Label>
              <Input
                placeholder="Rua, número, bairro"
                value={form.endereco}
                onChange={(e) => update("endereco", e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || saving}
            className={cn(
              "w-full h-12 rounded-md font-medium text-sm transition-all",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "bg-emerald-700 text-white hover:bg-emerald-600",
            )}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando…
              </span>
            ) : (
              "Confirmar e Entrar"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
