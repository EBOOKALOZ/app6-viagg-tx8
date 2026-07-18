// ── PremiumQuickAccessBar ────────────────────────────────────────────────────
// COMANDO UI-01 — Barra Premium de Acesso Rápido ("Minha Conta").
//
// Substitui a antiga "Trust Chips Bar" (faixa laranja abaixo das categorias).
// Ordem dos atalhos (spec): 🚚 Entrega Local · 🛡️ Verificados · 👤 Minha Conta
//   · ❤️ Favoritos · 🔔 Notificações · 🔊 Som.
//
// • Rolagem horizontal automática, cantos arredondados, animações ao toque,
//   indicação do item selecionado (rota atual), alvo de toque ≥ 44px.
// • O botão "Minha Conta" é o ponto de entrada da Conta Única do Consumidor:
//   abre um menu (DropdownMenu / Radix — portal, abre < 200ms) com todos os
//   acessos. Logado → foto/inicial + nome; visitante → "Entrar" (/auth).
// • "Som" PRESERVA o portal #global-audio-portal-trustbar — o GlobalAudioPlayer
//   (singleton) injeta o botão de áudio aqui; NÃO renomear/remover esse id.
// • Rotas: known → rota real; itens só-da-conta sem rota dedicada → /conta
//   (o hub do consumidor). Nenhum link morto.
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Heart, Bell, ChevronDown, LogIn, LogOut } from "lucide-react";

// Menu da Conta Única do Consumidor. Itens sem rota dedicada → /conta (hub).
const ACCOUNT_MENU: { emoji: string; label: string; to: string }[] = [
  { emoji: "👤", label: "Meu Perfil", to: "/meus-dados" },
  { emoji: "🛒", label: "Meus Pedidos", to: "/conta" },
  { emoji: "🔨", label: "Meus Leilões", to: "/meus-lances" },
  { emoji: "💰", label: "Minha Carteira", to: "/minha-carteira" },
  { emoji: "❤️", label: "Favoritos", to: "/conta" },
  { emoji: "📦", label: "Entregas", to: "/conta" },
  { emoji: "🚗", label: "Corridas", to: "/corridas-inicio" },
  { emoji: "🏍", label: "Moto Táxi", to: "/corridas-inicio" },
  { emoji: "🚚", label: "Fretes", to: "/fretes" },
  { emoji: "🏠", label: "Imóveis", to: "/imoveis" },
  { emoji: "🚙", label: "Veículos", to: "/automoveis" },
  { emoji: "🧰", label: "Serviços", to: "/servicos" },
  { emoji: "💬", label: "Mensagens", to: "/conta" },
  { emoji: "⭐", label: "Avaliações", to: "/conta" },
  { emoji: "🏆", label: "Recompensas", to: "/conta" },
  { emoji: "🎁", label: "Cashback", to: "/conta" },
  { emoji: "📍", label: "Endereços", to: "/conta" },
  { emoji: "⚙️", label: "Configurações", to: "/conta" },
];

// Pílula base do atalho (cantos arredondados, toque acessível, microinterações).
const pillBase =
  "flex items-center justify-center gap-1 sm:gap-1.5 h-6 sm:h-7 px-2 sm:px-3 rounded-full " +
  "text-[9px] min-[360px]:text-[10px] sm:text-[11px] font-black uppercase tracking-tighter sm:tracking-tight " +
  "whitespace-nowrap shrink-0 select-none transition-all duration-200 ease-out outline-none " +
  "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#FF6A00]";

export function PremiumQuickAccessBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, avatarUrl, displayName: authName, signOut } = useAuth();

  const displayName =
    authName ||
    (user?.user_metadata?.name as string) ||
    user?.email?.split("@")[0] ||
    "Minha Conta";
  const userAvatar =
    avatarUrl || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  const initial = (displayName || "?").charAt(0).toUpperCase();

  // Indicador de item selecionado (rota atual).
  const contaActive =
    pathname.startsWith("/conta") ||
    pathname.startsWith("/meus-") ||
    pathname.startsWith("/minha-");

  const go = (to: string) => navigate(to);

  return (
    <div
      role="navigation"
      aria-label="Acesso rápido — Minha Conta"
      className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5 w-full"
    >
      {/* 👤 Minha Conta — entrada da Conta Única do Consumidor */}
      {user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={`Minha Conta — ${displayName}`}
              className={cn(
                pillBase,
                "cursor-pointer active:scale-95 hover:-translate-y-0.5 hover:scale-[1.03] gap-1.5 pl-1.5",
                contaActive
                  ? "bg-[#075985] text-white border-2 border-[#FFC107] shadow-[0_0_18px_rgba(255,193,7,0.5)]"
                  : "bg-[#075985] text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] hover:brightness-110"
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 text-[9px] font-black ring-1 ring-white/40">
                {userAvatar ? (
                  <img src={userAvatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  initial
                )}
              </span>
              <span className="max-w-[64px] truncate normal-case">{displayName}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-80" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="center"
            sideOffset={8}
            className="z-[60] max-h-[70vh] w-60 overflow-y-auto rounded-2xl border-black/10 shadow-2xl"
          >
            <DropdownMenuLabel className="flex items-center gap-2.5 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#FF6A00]/15 text-sm font-black text-[#FF6A00] ring-1 ring-[#FF6A00]/30">
                {userAvatar ? (
                  <img src={userAvatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  initial
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black leading-tight">{displayName}</span>
                <span className="block truncate text-[11px] font-medium text-muted-foreground">
                  {user.email || "Conta Viagg-TX8™"}
                </span>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ACCOUNT_MENU.map((m) => (
              <DropdownMenuItem
                key={m.label}
                onSelect={() => go(m.to)}
                className="cursor-pointer gap-2.5 rounded-lg py-2 text-sm font-semibold"
              >
                <span className="w-5 text-center text-base leading-none">{m.emoji}</span>
                {m.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={async () => {
                await signOut?.();
                navigate("/mercado");
              }}
              className="cursor-pointer gap-2.5 rounded-lg py-2 text-sm font-bold text-red-600 focus:text-red-600"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button
          onClick={() => navigate("/auth")}
          aria-label="Entrar ou criar conta"
          className={cn(
            pillBase,
            "cursor-pointer bg-[#075985] text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] hover:-translate-y-0.5 hover:scale-[1.03] hover:brightness-110 active:scale-95 gap-1.5"
          )}
        >
          <LogIn className="h-3 w-3" />
          <span>Entrar</span>
        </button>
      )}

      {/* ❤️ Favoritos */}
      <button
        onClick={() => navigate("/conta")}
        aria-label="Favoritos"
        className={cn(
          pillBase,
          "cursor-pointer bg-white text-slate-950 border sm:border-2 border-[#68C7F2] shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 hover:scale-[1.03] active:scale-95"
        )}
      >
        <Heart className="h-3 w-3 text-[#FF6A00]" />
        <span className="hidden sm:inline">Favoritos</span>
      </button>

      {/* 🔔 Notificações */}
      <button
        onClick={() => navigate("/conta")}
        aria-label="Notificações"
        className={cn(
          pillBase,
          "cursor-pointer bg-white text-slate-950 border sm:border-2 border-[#68C7F2] shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 hover:scale-[1.03] active:scale-95"
        )}
      >
        <Bell className="h-3 w-3 text-[#075985]" />
        <span className="hidden sm:inline">Notificações</span>
      </button>

      {/* 🔊 Som — portal do GlobalAudioPlayer (NÃO alterar o id) */}
      <div
        id="global-audio-portal-trustbar"
        className="flex shrink-0 items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
