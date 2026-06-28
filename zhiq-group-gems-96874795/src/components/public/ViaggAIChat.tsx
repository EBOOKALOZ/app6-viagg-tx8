import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { viaggAI, type AIMessage } from "@/lib/viaggAI";

interface ViaggAIChatProps {
  context?: string;
  placeholder?: string;
  welcomeMessage?: string;
  className?: string;
}

export function ViaggAIChat({
  context,
  placeholder = "Pergunte à IA Viagg-TX8...",
  welcomeMessage = "Olá! 👋 Sou a IA Viagg-TX8. Como posso te ajudar com sua entrega?",
  className,
}: ViaggAIChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([
    { role: "assistant", content: welcomeMessage },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg: AIMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const { content } = await viaggAI.chat([...messages, userMsg], { context, maxTokens: 400 });
      setMessages((prev) => [...prev, { role: "assistant", content }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Não consegui responder agora. Tente novamente." },
      ]);
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
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white font-black text-sm leading-none">IA Viagg-TX8</p>
                <p className="text-orange-100 text-[10px]">Assistente inteligente</p>
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
                  <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center mr-2 shrink-0 mt-1">
                    <Bot className="w-3 h-3 text-[#FF6A00]" />
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
                <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center mr-2 shrink-0 mt-1">
                  <Bot className="w-3 h-3 text-[#FF6A00]" />
                </div>
                <div className="bg-white shadow-sm border border-zinc-100 rounded-2xl rounded-tl-sm px-3 py-2">
                  <Loader2 className="w-4 h-4 text-[#FF6A00] animate-spin" />
                </div>
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
          "w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all",
          open
            ? "bg-zinc-700 hover:bg-zinc-800"
            : "bg-gradient-to-br from-[#FF6A00] to-[#FF8C00] hover:scale-105"
        )}
      >
        {open ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <MessageCircle className="w-6 h-6 text-white" />
        )}
      </button>
    </div>
  );
}
