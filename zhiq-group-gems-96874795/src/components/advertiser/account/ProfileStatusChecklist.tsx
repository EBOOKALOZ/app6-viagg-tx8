import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, AlertCircle, TrendingUp, ShieldCheck, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AdvertiserAccountData } from "@/hooks/useAdvertiserAccountData";

interface Step {
  label: string;
  status: boolean;
  required: boolean;
  cta?: string;
  href?: string;
  scrollTo?: string;
}

interface ProfileStatusChecklistProps {
  data: AdvertiserAccountData;
}

export function ProfileStatusChecklist({ data }: ProfileStatusChecklistProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isOnAccountPage = location.pathname === "/anunciante/conta";

  const steps: Step[] = [
    { label: "Cadastro Iniciado", status: !!data.id, required: true },
    { label: "Perfil Completo", status: data.onboarding_completed, required: true, cta: "Completar cadastro", href: "/anunciante/conta", scrollTo: "store-settings-section" },
    { label: "E-mail Confirmado", status: data.profile.email_confirmed, required: true, cta: "Confirmar e-mail", href: "/anunciante/conta", scrollTo: "security-settings-section" },
    { label: "Telefone Validado", status: !!data.whatsapp, required: true, cta: "Adicionar telefone", href: "/anunciante/conta", scrollTo: "store-settings-section" },
    { label: "Plano Ativo", status: !!data.plan, required: false, cta: "Ativar plano", href: "/anunciante/creditos" },
  ];

  const completedCount = steps.filter(s => s.status).length;
  const progressPercent = (completedCount / steps.length) * 100;

  const handleStepClick = (step: Step) => {
    if (step.scrollTo && isOnAccountPage) {
      const el = document.getElementById(step.scrollTo);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        // Highlight flash
        el.classList.add("ring-2", "ring-orange-400", "ring-offset-4");
        setTimeout(() => el.classList.remove("ring-2", "ring-orange-400", "ring-offset-4"), 2000);
        return;
      }
    }
    // Fallback: navigate via link
    if (step.href) {
      navigate(step.href);
    }
  };

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
                   
                   {!step.status && step.cta && step.href && (
                      <button
                        type="button"
                        onClick={() => handleStepClick(step)}
                        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest text-orange-600 hover:bg-orange-50 hover:text-orange-700 transition-colors cursor-pointer"
                      >
                        {step.cta}
                        <ChevronRight className="w-3 h-3" />
                      </button>
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
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 shadow-sm animate-in zoom-in-95 duration-500">
                   <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div className="space-y-1.5">
                         <p className="text-[13px] font-black text-emerald-950 uppercase tracking-tight">Anunciar é gratuito</p>
                         <p className="text-[13px] text-emerald-800 leading-relaxed font-bold">
                            Publicar seus anúncios não custa nada. Créditos servem apenas para liberar o contato dos compradores interessados.
                         </p>
                         <Link
                           to="/anunciante/creditos"
                           className="inline-flex items-center gap-1 text-[13px] font-black text-emerald-600 hover:text-emerald-700 transition-colors group/link pt-1"
                         >
                           Ver carteira e créditos <Zap className="w-4 h-4 ml-1 group-hover/link:animate-pulse" />
                         </Link>
                      </div>
                   </div>
                </div>
             )}
          </div>
       </CardContent>
    </Card>
  );
}
