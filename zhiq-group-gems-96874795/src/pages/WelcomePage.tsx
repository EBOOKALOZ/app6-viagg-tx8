import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { ArrowRight, LogOut, Loader2 } from "lucide-react";
import { useState } from "react";

export default function WelcomePage() {
  const { user, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B3D2E]">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (!user) {
    navigate("/auth", { replace: true });
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-4">
      <div className="w-full max-w-md text-center space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <Logo size="2xl" rounded />
        </div>

        {/* Title */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-white">
            Bem-vindo à Viagg-Tx8
          </h1>
          <p className="text-lg text-white/75 leading-relaxed">
            A plataforma que conecta motoboys, lojistas e passageiros.
            Escolha seu perfil para começar a usar todos os recursos disponíveis.
          </p>
        </div>

        {/* CTA Button */}
        <Button
          className="w-full h-12 bg-[#C9A443] text-white hover:bg-[#b8933a] font-semibold text-base"
          onClick={() => navigate("/select-profile", { replace: true })}
        >
          Escolher meu perfil
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>

        {/* Info */}
        <p className="text-sm text-white/50">
          Você pode alterar seu perfil a qualquer momento nas configurações
        </p>

        {/* Logout */}
        <button
          onClick={async () => {
            setIsLoggingOut(true);
            await signOut();
            navigate("/auth", { replace: true });
          }}
          disabled={isLoggingOut}
          className="flex w-full items-center justify-center gap-2 text-sm text-white/50 hover:text-red-400 transition-colors"
        >
          {isLoggingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          Deslogar da conta
        </button>
      </div>
    </div>
  );
}
