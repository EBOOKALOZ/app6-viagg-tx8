import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, Send, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { viaggAI, type AIMessage } from "@/lib/viaggAI";
import { consultarPlataforma } from "@/lib/ai/moduleRegistry";
import { useAuth } from "@/contexts/AuthContext";
import viaggLogo from "@/assets/logo.png";
import { buildViaggAIAssistantContext } from "@/lib/viaggAIContext";

interface ViaggAIChatProps {
  context?: string;
  placeholder?: string;
  welcomeMessage?: string;
  className?: string;
}

export function ViaggAIChat({
  context,
  placeholder = "Pergunte à IA Viagg-TX8...",
  welcomeMessage = "Olá! 👋 Somos a IA Viagg-TX8. Como posso te ajudar com sua entrega?",
  className,
}: ViaggAIChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([
    { role: "assistant", content: welcomeMessage },
  ]);
  const [acoes, setAcoes] = useState<{ label: string; path: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const auth = useAuth();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Abre o chat quando o card de IA na página de corridas é clicado
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("viagg-ai:open", handler);
    return () => window.removeEventListener("viagg-ai:open", handler);
  }, []);

  // Saudação personalizada: injeta o primeiro nome do usuário logado na
  // mensagem de boas-vindas (mantém o texto específico de cada página).
  useEffect(() => {
    const nome = String(auth?.displayName || auth?.user?.user_metadata?.full_name || "")
      .trim().split(/\s+/)[0];
    if (!nome) return;
    setMessages((prev) => {
      if (prev.length !== 1 || prev[0].role !== "assistant") return prev;
      const base = welcomeMessage;
      const comNome = /^Ol[áa]!?/.test(base)
        ? base.replace(/^Ol[áa]!?/, `Olá, ${nome}!`)
        : `Olá, ${nome}! ${base}`;
      return prev[0].content === comNome ? prev : [{ role: "assistant", content: comNome }];
    });
  }, [auth?.displayName, auth?.user?.id, welcomeMessage]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg: AIMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setAcoes([]);
    setLoading(true);

    /* Ritmo humano: cada resposta leva entre 6 e 9 segundos para aparecer
       (o indicador de "digitando" fica visível durante a espera). */
    const inicio = Date.now();
    const alvoMs = 6000 + Math.random() * 3000;
    const ritmoHumano = async () => {
      const falta = alvoMs - (Date.now() - inicio);
      if (falta > 0) await new Promise((r) => setTimeout(r, falta));
    };

    /* MODULE REGISTRY: consulta dados REAIS da plataforma para esta pergunta
       (via sessão do usuário — o RLS garante as permissões). Best-effort. */
    let plataforma: { contexto: string; acoes: { label: string; path: string }[] } = { contexto: "", acoes: [] };
    try {
      plataforma = await consultarPlataforma(text, {
        userId: auth?.user?.id ?? null,
        profile: auth?.activeProfile ?? null,
      });
    } catch { /* segue sem dados */ }

    try {
      // Constrói o contexto inteligente da IA com os dados do usuário atual
      const aiContext = buildViaggAIAssistantContext({
        id: auth?.user?.id,
        name: auth?.displayName || auth?.user?.user_metadata?.full_name,
        email: auth?.user?.email,
        role: auth?.role || undefined,
        activeProfile: auth?.activeProfile,
        availableProfiles: auth?.availableProfiles
      });

      // Contexto final: identidade + tela atual + DADOS REAIS consultados agora
      const finalContext = [
        aiContext,
        context ? `[CONTEXTO ESPECÍFICO DESTA TELA]\n${context}` : "",
        plataforma.contexto,
      ].filter(Boolean).join("\n\n");

      let { content } = await viaggAI.chat([...messages, userMsg], { context: finalContext, maxTokens: 600 });
      await ritmoHumano();

      // [NAVEGAÇÃO INTELIGENTE] - Intercepta comando [NAVIGATE:/rota]
      const navRegex = /\[NAVIGATE:([^\]]+)\]/i;
      const navMatch = content.match(navRegex);
      if (navMatch && navMatch[1]) {
        const route = navMatch[1].trim();
        // Remove a tag do texto visível
        content = content.replace(navRegex, "").trim();
        // Executa a navegação
        navigate(route);
      }

      setMessages((prev) => [...prev, { role: "assistant", content }]);
      setAcoes(plataforma.acoes);
    } catch {
      await ritmoHumano();
      if (plataforma.contexto) {
        // LLM indisponível, mas TEMOS os dados reais → responde direto com eles
        const dados = plataforma.contexto
          .split("\n")
          .filter((l) => l.startsWith("•"))
          .map((l) => l.replace(/^• \[[^\]]+\] /, ""))
          .join("\n");
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: dados || "Posso te mostrar saldo, ganhos, corridas, grupos, comissão, divulgações, notificações e saques. Qual desses você quer ver?",
        }]);
        setAcoes(plataforma.acoes);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "⚠️ Não consegui responder agora. Tente novamente." },
        ]);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn("fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3", className)}>
      {/* Chat window */}
      {open && (
        <div className="w-80 sm:w-96 rounded-3xl shadow-2xl border border-zinc-200 bg-white flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20">
                <img src={viaggLogo} alt="Viagg-TX8" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-white font-black text-sm leading-none">IA Viagg-TX8</p>
                <p className="text-orange-100 text-[10px]">Assistente inteligente completo</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 max-h-72 bg-zinc-50">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full overflow-hidden mr-2 shrink-0 mt-1">
                    <img src={viaggLogo} alt="IA" className="w-full h-full object-cover" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-[#FF6A00] text-white rounded-tr-sm"
                      : "bg-white text-zinc-800 shadow-sm border border-zinc-100 rounded-tl-sm"
                  )}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full overflow-hidden mr-2 shrink-0 mt-1">
                  <img src={viaggLogo} alt="IA" className="w-full h-full object-cover" />
                </div>
                <div className="bg-white shadow-sm border border-zinc-100 rounded-2xl rounded-tl-sm px-3 py-2">
                  <Loader2 className="w-4 h-4 text-[#FF6A00] animate-spin" />
                </div>
              </div>
            )}
            {/* Ações inteligentes (navegação sugerida pela IA) */}
            {!loading && acoes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pl-8">
                {acoes.map((a) => (
                  <button
                    key={a.path}
                    onClick={() => { setOpen(false); navigate(a.path); }}
                    className="inline-flex items-center gap-1 rounded-full bg-[#FF6A00] px-3 py-1.5 text-[11px] font-black text-white shadow-md transition-all hover:brightness-110 active:scale-95"
                  >
                    {a.label} <ArrowRight className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-zinc-100 bg-white flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={placeholder}
              className="flex-1 rounded-xl border-zinc-200 text-sm h-9"
              disabled={loading}
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="bg-[#FF6A00] hover:bg-[#e55a00] text-white rounded-xl h-9 w-9 p-0 shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all overflow-hidden border-2 border-amber-400/30",
          open
            ? "bg-zinc-800 hover:bg-zinc-900"
            : "bg-[#0d3728] hover:scale-105"
        )}
      >
        {open ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <img
            src={viaggLogo}
            alt="IA Viagg-TX8"
            className="w-full h-full object-cover"
          />
        )}
      </button>
    </div>
  );
}
