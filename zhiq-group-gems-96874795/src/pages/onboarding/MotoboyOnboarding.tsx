import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Logo } from "@/components/Logo";
import { Loader2, Bike } from "lucide-react";
import { brazilianStates } from "@/lib/brazilianStates";
import { cn } from "@/lib/utils";

const VEHICLE_COLORS = [
  "Preto", "Branco", "Prata", "Cinza", "Vermelho",
  "Azul", "Amarelo", "Verde", "Marrom", "Laranja",
];

export default function MotoboyOnboarding() {
  const navigate = useNavigate();
  const { user, refreshProfiles } = useAuth();
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    whatsapp: "",
    cidade: "",
    estado: "",
    veiculo_modelo: "",
    veiculo_placa: "",
    veiculo_cor: "",
  });

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const isValid =
    form.whatsapp.length >= 10 &&
    form.cidade.trim().length >= 2 &&
    form.estado.length === 2 &&
    form.veiculo_modelo.trim().length >= 2 &&
    form.veiculo_placa.trim().length >= 6 &&
    form.veiculo_cor.length > 0;

  const handleSubmit = async () => {
    if (!user || !isValid || saving) return;
    setSaving(true);

    try {
      // Update motoboy_profiles
      const { error: profileError } = await supabase
        .from("motoboy_profiles")
        .update({
          whatsapp: form.whatsapp.trim(),
          cidade: form.cidade.trim(),
          estado: form.estado,
          veiculo_modelo: form.veiculo_modelo.trim(),
          veiculo_placa: form.veiculo_placa.trim().toUpperCase(),
          veiculo_cor: form.veiculo_cor,
        })
        .eq("user_id", user.id);

      if (profileError) throw profileError;

      // Also update main profiles table
      const { error: mainProfileError } = await supabase
        .from("profiles")
        .update({
          cidade: form.cidade.trim(),
          estado: form.estado,
          whatsapp: form.whatsapp.trim(),
        })
        .eq("id", user.id);

      if (mainProfileError) throw mainProfileError;

      // Mark onboarding as complete
      const { error: onboardingError } = await supabase.rpc(
        "complete_profile_onboarding" as any,
        { p_profile_type: "motoboy" }
      );

      if (onboardingError) throw onboardingError;

      // Re-sync profile data in context
      await refreshProfiles();

      toast({ title: "Perfil completo!", description: "Bem-vindo ao painel Motoboy." });
      navigate("/motoboy", { replace: true });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-950 via-orange-900 to-black">
      <div className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center space-y-3 text-center">
            <Logo size="xl" />
            <div className="flex items-center gap-2 mt-4">
              <Bike className="h-6 w-6 text-orange-400" />
              <h1 className="text-xl font-bold text-white">Complete seu Perfil Motoboy</h1>
            </div>
            <p className="text-sm text-white/60">Preencha os dados obrigatórios para acessar o painel</p>
          </div>

          <div className="space-y-4 rounded-xl border border-white/10 bg-black/30 p-5">
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
              <Label className="text-white/80">Modelo da Moto</Label>
              <Input
                placeholder="Ex: Honda CG 160"
                value={form.veiculo_modelo}
                onChange={(e) => update("veiculo_modelo", e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-white/80">Placa</Label>
                <Input
                  placeholder="ABC-1234"
                  value={form.veiculo_placa}
                  onChange={(e) => update("veiculo_placa", e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30 uppercase"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/80">Cor do Veículo</Label>
                <Select value={form.veiculo_cor} onValueChange={(v) => update("veiculo_cor", v)}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="Cor" />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_COLORS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || saving}
            className={cn(
              "w-full h-12 rounded-md font-medium text-sm transition-all",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "bg-orange-600 text-white hover:bg-orange-500",
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
