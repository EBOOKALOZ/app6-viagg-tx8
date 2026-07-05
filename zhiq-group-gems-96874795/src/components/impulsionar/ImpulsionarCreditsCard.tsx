import React from "react";
import { Wallet, Sparkles, ArrowRight, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImpulsionarCreditsCardProps {
  balance?: number;
  pendingEarnings?: number;
  onWithdraw?: () => void;
  onExplore?: () => void;
}

export function ImpulsionarCreditsCard({
  balance = 48.50,
  pendingEarnings = 12.00,
  onWithdraw,
  onExplore,
}: ImpulsionarCreditsCardProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 border border-amber-500/30 p-5 shadow-2xl">
      {/* Background glowing effects */}
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-40 h-40 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-black shadow-lg shadow-amber-500/20">
              <Wallet className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400 block">
                Carteira RIDV
              </span>
              <h4 className="text-sm font-bold text-white">Ganhos por Divulgação</h4>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span className="text-[11px] font-bold text-amber-300">Nível Prata</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5">
            <span className="text-[11px] font-medium text-zinc-400 block mb-0.5">Saldo Disponível</span>
            <span className="text-2xl font-black text-white tracking-tight">
              R$ {balance.toFixed(2).replace('.', ',')}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5">
            <span className="text-[11px] font-medium text-zinc-400 block mb-0.5">A Receber / Em Análise</span>
            <span className="text-xl font-bold text-amber-400 tracking-tight">
              + R$ {pendingEarnings.toFixed(2).replace('.', ',')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={onExplore}
            className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black font-extrabold text-xs h-10 rounded-xl shadow-lg shadow-orange-500/20 transition-all active:scale-95 gap-1.5"
          >
            <Zap className="w-4 h-4 fill-current" />
            Impulsionar Agora
          </Button>

          {onWithdraw && (
            <Button
              onClick={onWithdraw}
              variant="outline"
              className="border-white/10 hover:bg-white/5 text-zinc-200 font-bold text-xs h-10 px-4 rounded-xl transition-all"
            >
              Resgatar
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px] text-zinc-400 font-medium">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Pagamentos automáticos via PIX
          </span>
          <span className="text-amber-400/80 hover:underline cursor-pointer flex items-center gap-0.5">
            Regras <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </div>
  );
}
