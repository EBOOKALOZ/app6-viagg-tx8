import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bike, Store, Car, LogOut } from "lucide-react";
import { toast } from "sonner";
import motoboyHero from "@/assets/motoboy-hero.png";

const profiles = [
  {
    id: "passenger",
    label: "Passageiro",
    description: "Solicite corridas",
    icon: Car,
    disabled: true,
  },
  {
    id: "motoboy",
    label: "Motoboy",
    description: "Entregas rápidas de moto",
    icon: Bike,
    disabled: false,
  },
  {
    id: "merchant",
    label: "Lojista",
    description: "Gerencie sua loja e envie pedidos",
    icon: Store,
    disabled: false,
  },
] as const;

export default function ChooseProfile() {
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const handleContinue = async () => {
    if (!selected || !user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ active_profile: selected })
        .eq("id", user.id);

      if (error) throw error;
      navigate("/redirect-by-profile", { replace: true });
    } catch (err) {
      console.error("[ChooseProfile] erro:", err);
      toast.error("Erro ao salvar perfil. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    // Hard reload pra garantir que React state + listeners do auth sumam de vez
    window.location.replace("/auth");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B3D2E] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Logo size="lg" rounded />
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            Selecione seu perfil
          </h1>
          <p className="text-sm text-gray-500">
            Escolha como deseja usar a plataforma
          </p>
        </div>

        <div className="space-y-3">
          {profiles.map((p) => {
            const Icon = p.icon;
            const isSelected = selected === p.id;
            return (
              <button
                key={p.id}
                disabled={p.disabled}
                onClick={() => setSelected(p.id)}
                className={`relative flex w-full items-center gap-4 rounded-xl border-2 p-4 text-left transition-all ${
                  p.disabled
                    ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-60"
                    : isSelected
                    ? "border-[#C9A443] bg-[#C9A443]/5 shadow-md"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                }`}
              >
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full overflow-hidden ${
                    isSelected
                      ? "bg-[#C9A443]/20 text-[#C9A443]"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {p.id === "motoboy" ? (
                    <>
                      <img src={motoboyHero} alt="Motoboy" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling!.classList.remove('hidden'); }} />
                      <Icon className="h-6 w-6 hidden" />
                    </>
                  ) : p.id === "passenger" ? (
                    <>
                      <img src="https://broifhfqmnzqoongtokm.supabase.co/storage/v1/object/public/motorista-card.png/Motorista.png" alt="Motorista" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling!.classList.remove('hidden'); }} />
                      <Icon className="h-6 w-6 hidden" />
                    </>
                  ) : (
                    <Icon className="h-6 w-6" />
                  )}
                </div>
                <div className="flex-1">
                  <span className="block font-semibold text-gray-900">
                    {p.label}
                  </span>
                  <span className="block text-sm text-gray-500">
                    {p.description}
                  </span>
                </div>
                {p.disabled && (
                  <Badge className="absolute right-3 top-3 bg-gray-400 text-white text-[10px]">
                    Em breve
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        <Button
          className="mt-6 w-full bg-[#C9A443] text-white hover:bg-[#b8933a]"
          disabled={!selected || saving}
          onClick={handleContinue}
        >
          {saving ? "Salvando..." : "Continuar"}
        </Button>

        <p className="mt-4 text-center text-xs text-gray-400">
          Você pode alterar seu perfil a qualquer momento nas configurações
        </p>

        <button
          onClick={handleLogout}
          className="mt-4 flex w-full items-center justify-center gap-2 text-sm text-gray-400 hover:text-red-500 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Deslogar da conta
        </button>
      </div>
    </div>
  );
}
