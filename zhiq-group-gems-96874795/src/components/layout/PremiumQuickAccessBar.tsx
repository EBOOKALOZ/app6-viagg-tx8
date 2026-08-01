// ── PremiumQuickAccessBar ────────────────────────────────────────────────────
// COMANDO UI-01 — Barra Premium de Acesso Rápido ("Minha Conta").
//
// Substitui a antiga "Trust Chips Bar" (faixa laranja abaixo das categorias).
// Ordem dos atalhos (UI-02): 👤 Minha Conta/Entrar · 🔊 Som · ❤️ Favoritos
//   · 🔔 Notificações · 🔗 Compartilhar — distribuídos em toda a largura da faixa.
//
// • Rolagem horizontal automática, cantos arredondados, animações ao toque,
//   indicação do item selecionado (rota atual), alvo de toque ≥ 44px.
// • O botão "Minha Conta" é o ponto de entrada da Conta Única do Consumidor:
//   abre um menu (DropdownMenu / Radix — portal, abre < 200ms) com todos os
//   acessos. Logado → foto/inicial + nome; visitante → "Entrar" (/auth).
// • "Som" PRESERVA o portal #global-audio-portal-trustbar — o GlobalAudioPlayer
//   (singleton) injeta o botão de áudio aqui; NÃO renomear/remover esse id.
// • UI-02 (2026-07-27): o antigo botão VERMELHO circular de som (mute) e o botão
//   branco "Rádio" (ícone de transmissão) foram FUNDIDOS num único botão branco
//   "Som", imediatamente à direita do seletor de conta/loja. O GlobalAudioPlayer
//   continua dono de todo o estado/eventos e injeta o botão aqui via portal —
//   nenhum listener novo foi criado. Rollback rápido: bloco "ROLLBACK UI-02"
//   comentado abaixo + estilo antigo comentado em GlobalAudioPlayer.tsx.
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
import { Heart, Bell, ChevronDown, LogIn, LogOut, Share2, ShoppingCart } from "lucide-react";

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
// Exportadas (UI-02) para o GlobalAudioPlayer renderizar o botão "Som" (portal)
// com o MESMO estilo das demais pílulas brancas — barra visualmente uniforme.
export const pillBase =
  "flex items-center justify-center gap-1 sm:gap-1.5 h-6 sm:h-7 px-2 sm:px-3 rounded-full " +
  "text-[9px] min-[360px]:text-[10px] sm:text-[11px] font-black uppercase tracking-tighter sm:tracking-tight " +
  "whitespace-nowrap shrink-0 select-none transition-all duration-200 ease-out outline-none " +
  "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#FF6A00]";

// Variante branca da pílula (Favoritos/Notificações/Compartilhar/Som).
export const pillWhite =
  "cursor-pointer bg-white text-slate-950 border sm:border-2 border-[#68C7F2] " +
  "shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 hover:scale-[1.03] active:scale-95";

interface PremiumQuickAccessBarProps {
  onCartOpen?: () => void;
  cartItemCount?: number;
}

export function PremiumQuickAccessBar({ onCartOpen, cartItemCount = 0 }: PremiumQuickAccessBarProps) {
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

  // Compartilhar a plataforma: Web Share API quando disponível; fallback WhatsApp.
  const compartilhar = () => {
    const url = window.location.origin + "/mercado";
    const text = "🛒 Viagg-TX8™ — Mercado Local: compre, venda e receba na sua cidade!";
    if (navigator.share) {
      navigator.share({ title: "Viagg-TX8™", text, url }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n👉 ${url}`)}`, "_blank");
    }
  };

  return (
    <div
      role="navigation"
      aria-label="Acesso rápido — Minha Conta"
      className="flex flex-wrap items-center justify-between gap-1 sm:gap-1.5 w-full"
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

      {/* 🔊 Som (UI-02) — botão branco com ícone de transmissão, injetado pelo
          GlobalAudioPlayer via portal (NÃO alterar o id). Concentra TODO o
          controle de áudio do antigo botão vermelho circular: ativar/desativar
          som, estado visual (ícone vermelho = mudo · verde = ativo) e o painel
          Audio Center. */}
      <div
        id="global-audio-portal-trustbar"
        className="flex shrink-0 items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      />

      {/* ❤️ Favoritos */}
      <button
        onClick={() => navigate("/conta")}
        aria-label="Favoritos"
        className={cn(pillBase, pillWhite)}
      >
        <Heart className="h-3 w-3 text-[#FF6A00]" />
        <span className="hidden sm:inline">Favoritos</span>
      </button>

      {/* 🔔 Notificações */}
      <button
        onClick={() => navigate("/conta")}
        aria-label="Notificações"
        className={cn(pillBase, pillWhite)}
      >
        <Bell className="h-3 w-3 text-[#075985]" />
        <span className="hidden sm:inline">Notificações</span>
      </button>

      {/* 🛒 Cesta */}
      {onCartOpen && (
        <button
          onClick={(e) => { e.stopPropagation(); onCartOpen(); }}
          aria-label="Abrir Cesta / Carrinho"
          className={cn(pillBase, pillWhite, "relative")}
        >
          <ShoppingCart className="h-3 w-3 text-[#FF6A00]" />
          <span className="hidden sm:inline">Cesta</span>
          {cartItemCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF6A00] px-0.5 text-[8px] font-black text-white shadow-sm border border-white">
              {cartItemCount}
            </span>
          )}
        </button>
      )}

      {/* 🔗 Compartilhar */}
      <button
        onClick={compartilhar}
        aria-label="Compartilhar"
        className={cn(pillBase, pillWhite)}
      >
        <Share2 className="h-3 w-3 text-[#16A34A]" />
        <span className="hidden sm:inline">Compartilhar</span>
      </button>

      {/* ROLLBACK UI-02 — antigo botão "Rádio" (branco, ícone de transmissão),
          que só abria o Audio Center na aba Rádio. Foi fundido com o botão
          vermelho de som no botão único "Som" (portal acima). Para reverter:
          1) restaurar este bloco; 2) reimportar { Radio } de lucide-react;
          3) devolver o portal #global-audio-portal-trustbar ao FINAL da barra;
          4) restaurar o estilo circular vermelho/verde comentado em
             GlobalAudioPlayer.tsx (isMarketPortal).

      <button
        onClick={() => window.dispatchEvent(new Event("viagg:open-radio"))}
        aria-label="Rádio Mundial"
        className={cn(pillBase, pillWhite)}
      >
        <Radio className="h-3 w-3 text-[#FF6A00]" />
        <span className="hidden sm:inline">Rádio</span>
      </button>
      */}
    </div>
  );
}
