import React, { useState } from "react";
import { Sparkles, Copy, Check, RefreshCw, Send, Bot, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAIImpulsionar } from "@/hooks/useAIImpulsionar";

interface ImpulsionarAIAssistantProps {
  profileType?: 'motoboy' | 'mototaxi' | 'driver' | string;
  defaultTopic?: string;
  onCopy?: (text: string) => void;
}

export function ImpulsionarAIAssistant({
  profileType = 'motoboy',
  defaultTopic = "Corridas Rápidas e Descontos",
  onCopy,
}: ImpulsionarAIAssistantProps) {
  const { sendToImpulsionar, sending, result, error } = useAIImpulsionar(profileType as any);
  const [copied, setCopied] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  
  const [generatedText, setGeneratedText] = useState(
    profileType === 'mototaxi'
      ? "🚀 *MOTO-TÁXI EXPRESS NA SUA REGIÃO!*\n\nPrecisa chegar rápido e com segurança no trabalho ou no shopping? Chega de perder tempo no trânsito!\n\n✅ Motoristas avaliados\n✅ Chegada em até 5 minutos\n✅ Preço justo e sem surpresas\n\n👉 *Chame agora no link abaixo e garanta desconto na primeira viagem:*\nhttps://viagg.app/tx8/promo"
      : profileType === 'driver'
      ? "🚗 *VIAGENS EXECUTIVAS E TRASLADOS COM CONFORTO!*\n\nVai para o aeroporto ou tem reunião importante? Viaje com tranquilidade em veículos climatizados e motoristas de alto padrão.\n\n✨ Atendimento VIP 24h\n✨ Agendamento prévio garantido\n✨ Segurança em primeiro lugar\n\n👉 *Solicite ou agende sua corrida no link exclusivo:*\nhttps://viagg.app/tx8/vip"
      : "🏍️ *DELIVERY RÁPIDO PARA O SEU NEGÓCIO!*\n\nSeu restaurante ou farmácia precisa de entregas em tempo recorde no bairro? Conecte-se aos melhores motoboys da região!\n\n⚡ Entregas monitoradas em tempo real\n⚡ Taxas imbatíveis para parceiros\n⚡ Suporte humanizado\n\n👉 *Cadastre seu comércio e ganhe bônus de ativação:*\nhttps://viagg.app/tx8/delivery"
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedText);
    setCopied(true);
    if (onCopy) onCopy(generatedText);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleGenerateAI = async () => {
    const res = await sendToImpulsionar();
    if (res && (res as any).message) {
      setGeneratedText((res as any).message);
    } else {
      // Fallback de variação IA se a ponte não retornar texto formatado
      const variations = [
        `🔥 *OFERTA IMPERDÍVEL RIDV NA SUA REGIÃO!*\n\nGaranta rapidez, economia e segurança total com nossos operadores credenciados!\n\n👉 *Acesse agora e confira as condições exclusivas:*\nhttps://viagg.app/tx8/promo`,
        `⚡ *PRECISA DE AGILIDADE HOJE?*\n\nNossos operadores já estão prontos no seu bairro para te atender com máxima excelência!\n\n✨ Fale conosco agora:\nhttps://viagg.app/tx8/express`,
      ];
      const randomVar = variations[Math.floor(Math.random() * variations.length)];
      setGeneratedText(randomVar);
    }
  };

  return (
    <div className="rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-950/40 via-zinc-900/90 to-zinc-950 p-5 relative overflow-hidden shadow-2xl space-y-4">
      {/* Background glow */}
      <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/25">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-white">Assistente IA de Marketing</span>
              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                GLM 4 Powered
              </span>
            </div>
            <p className="text-xs text-zinc-400">Gere legendas persuasivas e otimizadas para WhatsApp</p>
          </div>
        </div>

        <Button
          onClick={handleGenerateAI}
          disabled={sending}
          size="sm"
          className="bg-purple-500 hover:bg-purple-600 text-white font-bold text-xs h-9 px-3.5 rounded-xl shadow-lg shadow-purple-500/20 transition-all active:scale-95 gap-1.5"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", sending && "animate-spin")} />
          {sending ? "Gerando..." : "Gerar Nova IA"}
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 font-medium">
          ⚠️ {error}
        </div>
      )}

      {/* Generated Preview Box */}
      <div className="relative rounded-2xl bg-black/40 border border-white/10 p-4 space-y-3">
        <div className="flex items-center justify-between text-[11px] text-zinc-400 font-bold border-b border-white/5 pb-2">
          <span className="flex items-center gap-1.5 text-purple-300">
            <MessageSquare className="w-3.5 h-3.5" /> Legenda Pronta para Disparo
          </span>
          <span className="text-zinc-500">Formatação WhatsApp (*negrito*)</span>
        </div>

        <pre className="text-xs text-zinc-200 font-sans whitespace-pre-wrap leading-relaxed select-all">
          {generatedText}
        </pre>

        <div className="pt-2 flex items-center justify-end gap-2">
          <Button
            onClick={handleCopy}
            size="sm"
            className={cn(
              "h-8 px-4 rounded-xl font-bold text-xs transition-all gap-1.5",
              copied
                ? "bg-emerald-500 text-black hover:bg-emerald-500"
                : "bg-white text-black hover:bg-zinc-200"
            )}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 stroke-[3]" /> Copiado com Sucesso!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" /> Copiar Legenda
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
