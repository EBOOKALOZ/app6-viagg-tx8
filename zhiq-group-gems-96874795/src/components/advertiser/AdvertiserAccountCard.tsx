import React from "react";
import { User, Mail, Smartphone, Calendar, ShieldCheck, Edit3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  const statusColors = {
    ativa: "bg-emerald-100 text-emerald-700 border-emerald-200",
    inativa: "bg-amber-100 text-amber-700 border-amber-200",
    bloqueada: "bg-red-100 text-red-700 border-red-200",
  };

  const statusLabel = {
    ativa: "Ativa",
    inativa: "Inativa",
    bloqueada: "Bloqueada",
  };

  const formattedDate = new Date(account.created_at).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <Card className="border-none shadow-2xl shadow-zinc-200/50 rounded-[32px] overflow-hidden bg-white group">
      <CardHeader className="p-8 pb-4 flex flex-row items-center justify-between border-b border-zinc-50">
        <div className="space-y-1">
          <CardTitle className="text-xl font-black text-zinc-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-orange-500" />
            IDENTIFICAÇÃO DA CONTA
          </CardTitle>
          <CardDescription className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Detalhes do seu perfil administrativo</CardDescription>
        </div>
        <Button variant="outline" className="rounded-2xl font-bold border-zinc-100 hover:bg-zinc-50 gap-2 h-10 px-4 group-hover:border-orange-200 transition-all">
          <Edit3 className="w-4 h-4" /> Editar Conta
        </Button>
      </CardHeader>
      
      <CardContent className="p-8 space-y-8">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          {/* Avatar / Icon */}
          <div className="w-24 h-24 rounded-[40px] bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-100 flex items-center justify-center text-orange-600 shadow-inner group-hover:scale-105 transition-all duration-500">
             <User className="w-10 h-10" />
          </div>

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6">
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
