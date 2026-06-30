/**
 * PromotionFloatingBalloon
 *
 * Balão flutuante de conversão na página "Divulgar Grátis".
 * · Aparece 2 s após a página carregar (não intromete no load)
 * · Detecta se o usuário já tem plano pago → mensagem adaptada
 * · Botão abre o modal de escolha de pacotes (callback `onOpenPlans`)
 * · X fecha e guarda timestamp no localStorage → reaparece após 8 h
 * · Posição: canto inferior-direito, acima da barra de navegação mobile
 */
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Sparkles, Rocket, CheckCircle2, ChevronRight, Zap } from "lucide-react";

const DISMISS_KEY = "promo_balloon_dismissed_at";
const REAPPEAR_MS = 8 * 60 * 60 * 1000; // 8 horas

interface Props {
  userId: string;
  onOpenPlans: () => void;
}

export function PromotionFloatingBalloon({ userId, onOpenPlans }: Props) {
  const [visible, setVisible] = useState(false);
  const [animIn, setAnimIn] = useState(false);
  const [hasPaid, setHasPaid] = useState(false);
  const [pulse, setPulse] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Verifica dismissal e carrega dados
  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const elapsed = Date.now() - Number(dismissed);
      if (elapsed < REAPPEAR_MS) return; // ainda dentro do prazo de silêncio
    }

    // Verifica plano pago em background
    (async () => {
      try {
        const { data } = await (supabase.from("promotion_purchases") as any)
          .select("id")
          .eq("user_id", userId)
          .in("status", ["active", "paid", "approved"])
          .limit(1)
          .maybeSingle();
        setHasPaid(!!data);
      } catch {
        // ignora — mostra mensagem padrão
      }

      // Delay de 2 s para não incomodar no carregamento inicial
      timerRef.current = setTimeout(() => {
        setVisible(true);
        requestAnimationFrame(() => setAnimIn(true));
      }, 2000);
    })();

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [userId]);

  // Pulso periódico suave no ícone (a cada 4 s)
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 800);
    }, 4000);
    return () => clearInterval(id);
  }, [visible]);

  const dismiss = () => {
    setAnimIn(false);
    setTimeout(() => setVisible(false), 350);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const handleCta = () => {
    dismiss();
    onOpenPlans();
  };

  if (!visible) return null;

  return (
    <div
      className={`fixed z-50 bottom-24 right-4 sm:bottom-8 sm:right-6 max-w-[320px] w-[calc(100vw-2rem)] sm:max-w-sm
        transition-all duration-350 ease-out
        ${animIn
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 translate-y-6 scale-95 pointer-events-none"
        }`}
      style={{ filter: "drop-shadow(0 8px 32px rgba(255,106,0,0.28))" }}
    >
      {/* Tail / seta para baixo */}
      <div className="absolute -bottom-2.5 right-8 sm:right-10 w-5 h-5 rotate-45 rounded-sm bg-[#1B1F24] border-r border-b border-[#FF6A00]/30" />

      {/* Card principal */}
      <div className="relative rounded-2xl overflow-hidden border border-[#FF6A00]/35 bg-[#1B1F24]">

        {/* Faixa gradiente decorativa no topo */}
        <div className="h-1 w-full bg-gradient-to-r from-[#FF6A00] via-[#EAB308] to-[#FF6A00] bg-[length:200%_100%] animate-[shimmer_2s_linear_infinite]" />

        {/* Botão fechar */}
        <button
          onClick={dismiss}
          aria-label="Fechar balão"
          className="absolute top-3 right-3 p-1 rounded-full text-[#A7B0BE]/50 hover:text-[#F5F7FA] hover:bg-[#2A3038] transition-all"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="p-4 pt-3 pb-4 pr-8">
          {hasPaid ? (
            // ── Usuário com plano ativo ──────────────────────
            <>
              <div className="flex items-start gap-2.5 mb-3">
                <div className={`mt-0.5 shrink-0 transition-transform duration-300 ${pulse ? "scale-125" : "scale-100"}`}>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-[13px] font-black text-[#F5F7FA] leading-snug">
                    Você já tem uma campanha ativa!
                  </p>
                  <p className="text-[11px] text-[#A7B0BE] mt-1 leading-relaxed">
                    Acompanhe o desempenho ou conheça outros pacotes para ampliar ainda mais seus resultados.
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCta}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wide bg-[#FF6A00] text-white hover:bg-[#FF8533] active:scale-95 transition-all"
                >
                  <Zap className="w-3.5 h-3.5 shrink-0" />
                  Ver outros pacotes
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                </button>
              </div>
            </>
          ) : (
            // ── Usuário com plano gratuito ───────────────────
            <>
              <div className="flex items-start gap-2.5 mb-3">
                <div className={`mt-0.5 shrink-0 transition-transform duration-300 ${pulse ? "scale-125 rotate-12" : "scale-100 rotate-0"}`}>
                  <Sparkles className="w-5 h-5 text-[#EAB308]" />
                </div>
                <div>
                  <p className="text-[13px] font-black text-[#F5F7FA] leading-snug">
                    🎉 1 publicação gratuita por dia!
                  </p>
                  <p className="text-[11px] text-[#A7B0BE] mt-1 leading-relaxed">
                    Quer aumentar suas vendas e alcançar muito mais clientes? Conheça nossos pacotes de promoção.
                  </p>
                </div>
              </div>

              {/* Mini benefícios rápidos */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {["Mais alcance", "Badge PROMOVIDO", "+8× publicações"].map((b) => (
                  <span
                    key={b}
                    className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-[#FF6A00]/12 text-[#FF6A00] border border-[#FF6A00]/25"
                  >
                    {b}
                  </span>
                ))}
              </div>

              <button
                onClick={handleCta}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-black text-[12px] uppercase tracking-wide
                  bg-gradient-to-r from-[#FF6A00] to-[#EAB308] text-black
                  hover:brightness-110 active:scale-95 transition-all shadow-md shadow-[#FF6A00]/25"
              >
                <Rocket className="w-4 h-4 shrink-0" />
                Conhecer Pacotes de Promoção
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
