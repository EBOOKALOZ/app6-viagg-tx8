import React from "react";
import { CheckCircle2, XCircle, ChevronRight, AlertCircle, TrendingUp, ShieldCheck, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AdvertiserAccountData } from "@/hooks/useAdvertiserAccountData";

interface ProfileStatusChecklistProps {
  data: AdvertiserAccountData;
}

export function ProfileStatusChecklist({ data }: ProfileStatusChecklistProps) {
  const steps = [
    { label: "Cadastro Iniciado", status: !!data.id, required: true },
    { label: "Perfil Completo", status: data.onboarding_completed, required: true, cta: "Completar cadastro", href: "/anunciante/onboarding" },
    { label: "E-mail Confirmado", status: data.profile.email_confirmed, required: true, cta: "Confirmar e-mail", href: "/auth/verify" },
    { label: "Telefone Validado", status: !!data.whatsapp, required: true, cta: "Adicionar telefone", href: "/anunciante/conta" },
    { label: "Plano Ativo", status: !!data.plan, required: false, cta: "Ativar plano", href: "/anunciante/creditos" },
  ];

  const completedCount = steps.filter(s => s.status).length;
  const progressPercent = (completedCount / steps.length) * 100;

  return (
    <Card className="border-none shadow-xl shadow-zinc-200/50 rounded-[40px] overflow-hidden bg-white h-full flex flex-col">
       <CardHeader className="p-8 pb-4">
          <CardTitle className="text-sm font-black text-zinc-900 flex items-center justify-between gap-2 uppercase tracking-tight">
             <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-orange-500" /> STATUS DO PERFIL
             </div>
             <span className="text-[10px] font-black text-orange-600 bg-orange-50 px-3 py-1 rounded-full border border-orange-100 uppercase tracking-widest leading-none">
                {Math.round(progressPercent)}% Concluído
             </span>
          </CardTitle>
       </CardHeader>
       <CardContent className="p-8 pt-4 space-y-6 flex-1 flex flex-col">
          <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden shadow-inner">
             <div 
               className="h-full bg-orange-600 transition-all duration-1000" 
               style={{ width: `${progressPercent}%` }}
             />
          </div>

          <div className="space-y-4 flex-1">
             {steps.map((step, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-zinc-50 last:border-none group/step transition-all">
                   <div className="flex items-center gap-3">
                      {step.status ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-zinc-100 flex items-center justify-center shrink-0">
                          <div className="w-1.5 h-1.5 rounded-full bg-zinc-200" />
                        </div>
                      )}
                      <span className={cn(
                        "text-xs font-bold transition-all",
                        step.status ? "text-zinc-400 line-through" : "text-zinc-600 group-hover/step:translate-x-1"
                      )}>
                        {step.label}
                      </span>
                   </div>
                   
                   {!step.status && step.cta && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 rounded-lg text-[10px] font-black uppercase tracking-widest text-orange-600 hover:bg-orange-50 hover:text-orange-700 gap-1"
                        onClick={() => window.location.href = step.href}
                      >
                         {step.cta}
                         <ChevronRight className="w-3 h-3" />
                      </Button>
                   )}
                </div>
             ))}
          </div>

          <div className="pt-6 border-t border-zinc-50 space-y-3">
             <div className="flex items-center gap-2">
                <ShieldCheck className={cn("w-4 h-4", data.plan?.is_premium ? "text-emerald-500" : "text-zinc-300")} />
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                  Contato Liberado: {data.plan?.is_premium ? "Sim" : "Não (Exige Upgrade)"}
                </span>
             </div>
             {!data.plan?.is_premium && (
                <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 shadow-sm animate-in zoom-in-95 duration-500">
                   <div className="flex items-start gap-3">
                      <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
                      <div className="space-y-1">
                         <p className="text-[10px] font-black text-orange-950 uppercase tracking-tight">Recurso Bloqueado</p>
                         <p className="text-[10px] text-orange-800 leading-relaxed font-bold">
                            Para liberar os botões de contato ("Falar Agora") e aumentar suas chances de venda, ative um plano premium.
                         </p>
                         <Button 
                           variant="link" 
                           className="p-0 h-auto text-[10px] font-black text-orange-600 group/link"
                           onClick={() => window.location.href = '/anunciante/creditos'}
                         >
                           Ver benefícios agora <Zap className="w-3 h-3 ml-1 group-hover/link:animate-pulse" />
                         </Button>
                      </div>
                   </div>
                </div>
             )}
          </div>
       </CardContent>
    </Card>
  );
}
