import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Bot, User, Sparkles, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SYSTEM_PROMPT = `Você é a assistente virtual da Viagg, uma plataforma de entregas, mobilidade urbana, veículos e imóveis. 
Seja sempre cordial, objetiva e responda em português brasileiro.
Ajude os usuários com dúvidas sobre:
- Entregas e fretes
- Corridas de mototáxi
- Compra e venda de veículos
- Imóveis (compra, venda, aluguel)
- Funcionamento da plataforma
- Pagamentos e carteira digital
Se não souber algo específico, oriente o usuário a entrar em contato com o suporte.`;

export function FloatingAIChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleOpen = () => {
    setIsOpen(true);
    setHasNewMessage(false);
    if (messages.length === 0) {
      // Welcome message
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: 'Olá! 👋 Sou a assistente virtual da **Viagg**. Como posso te ajudar hoje?',
          timestamp: new Date(),
        },
      ]);
    }
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const apiMessages = [
        { role: 'system' as const, content: SYSTEM_PROMPT },
        ...messages
          .filter((m) => m.id !== 'welcome')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: trimmed },
      ];

      // Chama via Edge Function `ai-chat` — a chave da IA nunca fica no client.
      const { data, error: fnError } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages: apiMessages,
          model: 'glm-5.2',
          max_tokens: 800,
          temperature: 0.7,
        },
      });

      if (fnError) throw fnError;

      const assistantContent =
        (data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content ||
        'Desculpe, não consegui processar sua mensagem.';

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      if (!isOpen) setHasNewMessage(true);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: '⚠️ Ops! Ocorreu um erro. Tente novamente em instantes.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Chat limpo! 🧹 Como posso te ajudar?',
        timestamp: new Date(),
      },
    ]);
  };

  const formatContent = (content: string) => {
    // Simple markdown-like bold
    return content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  };

  return (
    <>
      {/* Floating Chat Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            id="ai-chat-toggle"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleOpen}
            className={cn(
              'fixed bottom-6 right-6 z-[9999] flex h-14 w-14 items-center justify-center',
              'rounded-full shadow-lg transition-shadow hover:shadow-xl',
              'bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700',
              'text-white'
            )}
            aria-label="Abrir chat com IA"
          >
            <Sparkles className="h-6 w-6" />
            {/* Notification badge */}
            {hasNewMessage && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
              >
                !
              </motion.span>
            )}
            {/* Pulse ring */}
            <span className="absolute inset-0 rounded-full animate-ping bg-violet-500 opacity-20" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              'fixed bottom-4 right-4 z-[9999] flex flex-col',
              'w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-2rem)]',
              'rounded-2xl overflow-hidden',
              'shadow-2xl border border-white/10',
              'bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950'
            )}
          >
            {/* Header */}
            <div className="relative flex items-center justify-between px-5 py-4 bg-gradient-to-r from-violet-600/90 via-purple-600/90 to-indigo-700/90 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                  <Bot className="h-5 w-5 text-white" />
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-purple-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Viagg IA</h3>
                  <p className="text-[11px] text-white/70">Assistente virtual • Online</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearChat}
                  className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                  title="Limpar conversa"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                  title="Fechar chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* Decorative gradient line */}
              <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    'flex gap-2.5',
                    msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  )}
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      'flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-xs',
                      msg.role === 'user'
                        ? 'bg-violet-500/20 text-violet-300'
                        : 'bg-emerald-500/20 text-emerald-300'
                    )}
                  >
                    {msg.role === 'user' ? (
                      <User className="h-3.5 w-3.5" />
                    ) : (
                      <Bot className="h-3.5 w-3.5" />
                    )}
                  </div>

                  {/* Bubble */}
                  <div
                    className={cn(
                      'max-w-[75%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-violet-600 text-white rounded-tr-md'
                        : 'bg-slate-800/80 text-slate-200 rounded-tl-md border border-slate-700/50'
                    )}
                    dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
                  />
                </motion.div>
              ))}

              {/* Typing indicator */}
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-2.5"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md bg-slate-800/80 border border-slate-700/50 px-4 py-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-slate-700/50 bg-slate-900/95 backdrop-blur-sm px-4 py-3">
              <div className="flex items-end gap-2 rounded-xl bg-slate-800/60 border border-slate-700/50 px-3 py-2 focus-within:border-violet-500/50 focus-within:ring-1 focus-within:ring-violet-500/20 transition-all">
                <textarea
                  ref={inputRef}
                  id="ai-chat-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Digite sua mensagem..."
                  rows={1}
                  className={cn(
                    'flex-1 resize-none bg-transparent text-[13px] text-slate-200',
                    'placeholder:text-slate-500 outline-none',
                    'max-h-20 min-h-[20px]'
                  )}
                  disabled={isLoading}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading}
                  className={cn(
                    'flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg transition-all',
                    input.trim() && !isLoading
                      ? 'bg-violet-600 text-white hover:bg-violet-500 shadow-lg shadow-violet-500/25'
                      : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-2 text-center text-[10px] text-slate-600">
                Powered by <span className="text-violet-400/80">AIAPI.world</span> • Viagg IA
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
