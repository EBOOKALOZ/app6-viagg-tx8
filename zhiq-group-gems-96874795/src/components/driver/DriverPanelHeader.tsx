import { useState } from "react";
import { Menu, MapPin, Phone, Megaphone, HelpCircle, Repeat } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import NotificationCenter from "@/components/NotificationCenter";
import { cn } from "@/lib/utils";

interface DriverPanelHeaderProps {
  avatarUrl?: string;
  userName?: string;
  city?: string;
  state?: string;
  showBackButton?: boolean;
  isOnline?: boolean;
}

export function DriverPanelHeader({
  avatarUrl,
  userName = "Motorista",
  city = "Cidade",
  state = "UF",
  showBackButton = false,
  isOnline = false,
}: DriverPanelHeaderProps) {
  const { clearActiveProfile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <header className="relative px-3 py-1.5 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 shadow-md">
        <div className="flex items-center justify-between gap-2">
          {showBackButton && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { window.location.href = "/driver"; }}
              className="text-white hover:bg-white/10 h-8 w-8 mr-1 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}

          {/* Avatar + Info */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="relative shrink-0">
              <Avatar className="h-10 w-10 border border-white/30 shadow shrink-0">
                <AvatarImage src={avatarUrl} alt={userName} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-700 text-white font-bold text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className={cn(
                "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-blue-900 shadow-sm transition-colors duration-300",
                isOnline ? "bg-emerald-500" : "bg-slate-400"
              )} />
            </div>

            <div className="flex flex-col items-start min-w-0 justify-center gap-0.5">
              <span className="text-[9px] font-black uppercase tracking-widest text-white/90 leading-none shrink-0">
                Painel Motorista
              </span>
              <span className="text-xs sm:text-sm font-bold text-white max-w-full leading-tight break-words">
                {userName}
              </span>
              <div className="flex items-center gap-2 max-w-full">
                <span className={cn(
                  "text-[9px] font-bold uppercase tracking-wider shrink-0 leading-none",
                  isOnline ? "text-emerald-300" : "text-white/60"
                )}>
                  {isOnline ? "• Disponível" : "• Offline"}
                </span>
                <div className="flex items-center gap-0.5 text-white/70 text-[10px] truncate leading-none">
                  <MapPin className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">
                    {city} – {state}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <div id="global-audio-portal" className="relative flex items-center shrink-0" onClick={(e) => e.stopPropagation()} />
            {/* Sininho de notificações OCULTO a pedido (2026-07-12) — descomentar para reativar */}
            {/* <NotificationCenter profileType="driver" /> */}
            <Button variant="ghost" size="icon" onClick={() => setMenuOpen(true)} className="text-white hover:bg-white/10 h-8 w-8">
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="right"
          className="bg-gradient-to-b from-blue-900 via-blue-950 to-black border-l-0 p-0 text-white [&>button]:text-white/70 [&>button]:hover:text-white"
        >
          <div className="flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center gap-4 p-6 pb-4">
                <Avatar className="h-14 w-14 border-2 border-white/30 shadow-lg">
                  <AvatarImage src={avatarUrl} alt={userName} />
                  <AvatarFallback className="bg-white/10 text-white font-bold text-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="font-semibold text-base text-white">{userName}</span>
                  <span className="text-xs text-blue-200/80">
                    Motorista • {isOnline ? "Disponível" : "Offline"}
                  </span>
                </div>
              </div>

              <div className="border-t border-white/10 mx-4" />

              <nav className="flex flex-col gap-1 px-4 pt-4">
                {[
                  { icon: Phone,     label: "Corridas",   path: "/driver/calls" },
                  { icon: Megaphone, label: "Campanhas",  path: "/driver/campanhas" },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => { setMenuOpen(false); window.location.href = item.path; }}
                    className="flex items-center gap-3 py-3.5 px-3 rounded-lg text-white font-medium transition-colors hover:bg-white/10 cursor-pointer"
                  >
                    <item.icon className="h-5 w-5 text-white/80" />
                    {item.label}
                  </button>
                ))}
              </nav>

              <div className="border-t border-white/10 mx-4 my-2" />

              <nav className="flex flex-col gap-1 px-4">
                <button
                  onClick={() => { setMenuOpen(false); window.location.href = "/support"; }}
                  className="flex items-center gap-3 py-3.5 px-3 rounded-lg text-white font-medium transition-colors hover:bg-white/10 cursor-pointer"
                >
                  <HelpCircle className="h-5 w-5 text-white/80" />
                  Suporte
                </button>
                <button
                  onClick={async () => { setMenuOpen(false); await clearActiveProfile(); window.location.href = "/select-profile"; }}
                  className="flex items-center gap-3 py-3.5 px-3 rounded-lg text-white font-medium transition-colors hover:bg-white/10 cursor-pointer"
                >
                  <Repeat className="h-5 w-5 text-white/80" />
                  Trocar Perfil
                </button>
              </nav>
            </div>

            <div className="pb-6" />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
