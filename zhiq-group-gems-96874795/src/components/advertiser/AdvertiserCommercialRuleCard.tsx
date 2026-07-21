import React from "react";
import { Zap, Lock, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function AdvertiserCommercialRuleCard() {
  const navigate = useNavigate();

  return (
    <div className="relative overflow-hidden rounded-[28px] bg-[#1B1F24] text-[#F5F7FA] shadow-2xl shadow-black/30 border border-[#2A3038] animate-in slide-in-from-top duration-700">
      {/* Visual Background Elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF6A00]/8 blur-[100px] -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#FF6A00]/4 blur-[80px] translate-y-1/2 -translate-x-1/2" />

      <div className="relative z-10 p-8 md:p-10 flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
        {/* Icon & Badge Area */}
        <div className="flex-shrink-0 flex flex-col items-center lg:items-start space-y-4">
          <div className="w-20 h-20 rounded-3xl bg-white/10 p-0.5 border border-white/20 overflow-hidden shadow-xl shadow-orange-600/20 flex items-center justify-center">
             <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="w-full h-full object-cover rounded-[20px]" />
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF6A00]/10 border border-[#FF6A00]/20">
             <Sparkles className="w-3.5 h-3.5 text-[#FF6A00]" />
             <span className="text-[10px] font-black uppercase tracking-widest text-[#FF6A00]">Oportunidade Comercial</span>
          </div>
        </div>

        {/* Text Area */}
        <div className="flex-1 text-center lg:text-left space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-tight">
              DIVULGAÇÃO <span className="text-emerald-400 uppercase">GRÁTIS</span>, CONTATO <span className="text-orange-500 uppercase">BLOQUEADO</span> COM PLANO
            </h2>
            <div className="h-1 w-20 bg-orange-600 rounded-full mx-auto lg:mx-0" />
          </div>

          <div className="space-y-4 text-[#A7B0BE] font-medium text-sm md:text-base leading-relaxed max-w-2xl">
            <p>
              Seus anúncios podem ser publicados e exibidos <span className="text-[#F5F7FA] font-bold italic underline decoration-[#22C55E]/50 underline-offset-4">gratuitamente</span> na plataforma para ajudar seu produto a ganhar visibilidade imediata.
            </p>
            <p className="flex flex-col sm:flex-row items-center gap-2 bg-[#14171B] p-4 rounded-2xl border border-[#2A3038]">
              <Lock className="w-5 h-5 text-[#FF6A00] shrink-0" />
              <span>
                No entanto, os botões de contato, como <span className="text-[#F5F7FA] font-bold italic">"Perguntar"</span> e <span className="text-[#F5F7FA] font-bold italic">"Falar com o vendedor"</span>, permanecem <span className="text-[#FF6A00] font-black uppercase tracking-wider">bloqueados</span> sem um plano ativo.
              </span>
            </p>
            <p>
              Para aumentar suas chances de venda e receber contatos reais, ative um <span className="text-[#FF6A00] font-black uppercase tracking-widest bg-[#FF6A00]/10 px-2 py-0.5 rounded-md">plano de desbloqueio</span> hoje mesmo.
            </p>
          </div>
        </div>

        {/* CTA Area */}
        <div className="flex-shrink-0 w-full lg:w-auto">
          <Button 
            onClick={() => navigate("/anunciante/creditos")}
            className="w-full lg:w-64 h-16 bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black uppercase text-xs tracking-[0.2em] rounded-2xl shadow-2xl shadow-[#FF6A00]/20 transition-all hover:scale-[1.02] active:scale-[0.98] gap-3"
          >
            <Zap className="w-5 h-5 fill-white text-white" />
            Ativar Plano
            <ArrowRight className="w-4 h-4" />
          </Button>
          <p className="mt-4 text-[10px] text-[#A7B0BE] font-bold uppercase tracking-widest text-center">
            Mais visibilidade é grátis. Conversão é desbloqueio.
          </p>
        </div>
      </div>
    </div>
  );
}
