import React from "react";
import { Building2, CheckCircle, PauseCircle, Clock, CreditCard, UserCheck, ShieldCheck, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AdvertiserAccountData } from "@/hooks/useAdvertiserAccountData";

interface OperationalSummarySectionProps {
  data: AdvertiserAccountData;
}

export function OperationalSummarySection({ data }: OperationalSummarySectionProps) {
  const stats = [
    { label: "Anúncios Criados", value: data.stats.total_listings, icon: Building2, color: "text-blue-500", bg: "bg-blue-50" },
    { label: "Anúncios Ativos", value: data.stats.active_listings, icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-50" },
    { label: "Pausados", value: data.stats.paused_listings, icon: PauseCircle, color: "text-amber-500", bg: "bg-amber-50" },
    { label: "Vencidos", value: data.stats.expired_listings, icon: Clock, color: "text-red-500", bg: "bg-red-50" },
  ];

  return (
    <Card className="border-none shadow-xl shadow-zinc-200/50 rounded-[40px] overflow-hidden bg-white">
       <CardHeader className="p-8 pb-4">
          <CardTitle className="text-sm font-black text-zinc-900 flex items-center gap-2 uppercase tracking-tight">
             <UserCheck className="w-5 h-5 text-orange-500" /> RESUMO OPERACIONAL
          </CardTitle>
       </CardHeader>
       <CardContent className="p-8 pt-4 space-y-6">
          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 gap-4">
             {stats.map((stat, i) => (
                <div key={i} className={cn("p-5 rounded-3xl border border-zinc-50 flex items-center gap-4 transition-all hover:scale-[1.02]", stat.bg)}>
                   <div className={cn("w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-sm", stat.color)}>
                      <stat.icon className="w-5 h-5" />
                   </div>
                   <div className="space-y-0.5">
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-none">{stat.label}</p>
                      <p className="text-xl font-black text-zinc-900 tracking-tighter">{stat.value}</p>
                   </div>
                </div>
             ))}
          </div>

          <div className="space-y-4 pt-6 border-t border-zinc-50">
             <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Estado de Recursos</p>
             
             <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 border border-zinc-100/50">
                <div className="flex items-center gap-3">
                   <CreditCard className="w-4 h-4 text-zinc-400" />
                   <span className="text-[11px] font-bold text-zinc-600 uppercase tracking-tight">Saldo de Créditos</span>
                </div>
                <Badge variant="secondary" className="font-black text-[10px] px-3 py-1 rounded-full uppercase border-transparent" style={{ backgroundColor: '#FF6A00', color: '#FFFFFF' }}>
                   {data.stats.available_credits.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </Badge>
             </div>

             <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 border border-zinc-100/50">
                <div className="flex items-center gap-3">
                   <ShieldCheck className={cn("w-4 h-4", data.stats.contacts_unlocked ? "text-emerald-500" : "text-zinc-300")} />
                   <span className="text-[11px] font-bold text-zinc-600 uppercase tracking-tight">Contatos Desbloqueados</span>
                </div>
                {data.stats.contacts_unlocked ? (
                   <div className="text-emerald-600 flex items-center gap-1.5 font-black text-[9px] uppercase tracking-widest">
                      <CheckCircle className="w-3.5 h-3.5" /> Liberado
                   </div>
                ) : (
                   <div className="text-red-500 flex items-center gap-1.5 font-black text-[9px] uppercase tracking-widest">
                      <XCircle className="w-3.5 h-3.5" /> Bloqueado
                   </div>
                )}
             </div>
          </div>

          <div className="pt-4">
             <p className="text-center text-[9px] text-zinc-400 font-bold uppercase tracking-[0.2em] leading-relaxed">
                Dados atualizados em tempo real <br /> 
                Viagg-TX8 Administrative Hub
             </p>
          </div>
       </CardContent>
    </Card>
  );
}
