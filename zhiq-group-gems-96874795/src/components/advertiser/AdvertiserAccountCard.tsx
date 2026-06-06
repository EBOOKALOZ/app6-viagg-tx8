import React from "react";
import { useNavigate } from "react-router-dom";
import { User, Mail, Smartphone, Calendar, ShieldCheck, Edit3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface AdvertiserAccountCardProps {
  account: {
    full_name: string | null;
    email: string | null;
    whatsapp: string | null;
    account_status: "ativa" | "inativa" | "bloqueada" | string;
    created_at: string;
  };
}

export function AdvertiserAccountCard({ account }: AdvertiserAccountCardProps) {
  const { avatarUrl } = useAuth();
  const navigate = useNavigate();
  const statusColors = {
    ativa: "bg-emerald-100 text-emerald-700 border-emerald-200",
    active: "bg-emerald-100 text-emerald-700 border-emerald-200",
    inativa: "bg-amber-100 text-amber-700 border-amber-200",
    inactive: "bg-amber-100 text-amber-700 border-amber-200",
    bloqueada: "bg-red-100 text-red-700 border-red-200",
    blocked: "bg-red-100 text-red-700 border-red-200",
  };

  const statusLabel = {
    ativa: "Ativo",
    active: "Ativo",
    inativa: "Inativo",
    inactive: "Inativo",
    bloqueada: "Bloqueado",
    blocked: "Bloqueado",
  };

  const formatDateBR = (raw: string | null | undefined): string => {
    if (!raw) return "—";
    const d = new Date(raw);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  };
  const formattedDate = formatDateBR(account.created_at);

  return (
    <Card className="border-none shadow-2xl shadow-zinc-200/50 rounded-2xl sm:rounded-[32px] overflow-hidden bg-white group">
      <CardHeader className="p-5 sm:p-8 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 border-b border-zinc-50">
        <div className="space-y-1 min-w-0 flex-1">
          <CardTitle className="text-base sm:text-xl font-black text-zinc-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 shrink-0" />
            <span className="truncate">IDENTIFICAÇÃO DA CONTA</span>
          </CardTitle>
          <CardDescription className="text-[10px] sm:text-xs font-bold text-zinc-400 uppercase tracking-widest">Detalhes do seu perfil administrativo</CardDescription>
        </div>
        <Button
          onClick={() => navigate('/anunciante/conta')}
          className="rounded-xl sm:rounded-2xl font-bold bg-yellow-400 hover:bg-yellow-300 text-black border-none gap-2 h-10 px-4 transition-all w-full sm:w-auto shrink-0 shadow-md shadow-yellow-400/30"
        >
          <Edit3 className="w-4 h-4" /> Editar Conta
        </Button>
      </CardHeader>
      
      <CardContent className="p-5 sm:p-8 space-y-6 sm:space-y-8">
        <div className="flex flex-col md:flex-row gap-4 sm:gap-8 items-start">
          {/* Avatar / Icon */}
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl sm:rounded-[40px] bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-100 flex items-center justify-center text-orange-600 shadow-inner overflow-hidden group-hover:scale-105 transition-all duration-500 shrink-0 self-center md:self-start">
             {avatarUrl ? (
               <img
                 src={avatarUrl}
                 alt={account.full_name || 'Avatar'}
                 className="w-full h-full object-cover"
                 onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
               />
             ) : (
               <User className="w-8 h-8 sm:w-10 sm:h-10" />
             )}
          </div>

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 sm:gap-x-12 gap-y-4 sm:gap-y-6 w-full min-w-0">
             <div className="space-y-1">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                   <User className="w-3 h-3" /> Nome Completo
                </p>
                <p className="font-black text-zinc-900 text-lg tracking-tight">{account.full_name || "—"}</p>
             </div>

             <div className="space-y-1">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                   <Mail className="w-3 h-3" /> E-mail de Acesso
                </p>
                <p className="font-bold text-zinc-700">{account.email || "—"}</p>
             </div>

             <div className="space-y-1">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                   <Smartphone className="w-3 h-3" /> WhatsApp
                </p>
                <p className="font-bold text-zinc-700">{account.whatsapp || "—"}</p>
             </div>

             <div className="space-y-1">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                   <ShieldCheck className="w-3 h-3" /> Status da Conta
                </p>
                <div className={cn(
                  "inline-flex items-center px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border transition-all",
                  statusColors[account.account_status as keyof typeof statusColors] || "bg-zinc-100 text-zinc-700 border-zinc-200"
                )}>
                  <div className="w-2 h-2 rounded-full bg-current mr-2 animate-pulse" />
                  {statusLabel[account.account_status as keyof typeof statusLabel] || account.account_status || "Desconhecido"}
                </div>
             </div>

             <div className="space-y-1">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                   <Calendar className="w-3 h-3" /> Membro desde
                </p>
                <p className="font-bold text-zinc-700">{formattedDate}</p>
             </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
