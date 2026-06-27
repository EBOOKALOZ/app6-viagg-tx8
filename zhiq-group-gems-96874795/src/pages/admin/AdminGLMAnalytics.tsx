/**
 * AdminGLMAnalytics
 * Análise de dados da plataforma com IA GLM-4 (Zhipu AI).
 * Coleta métricas do banco e permite ao admin fazer perguntas em linguagem natural.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { chatCompletion } from "@/lib/aiapi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  BrainCircuit, Send, RefreshCw, Sparkles, TrendingUp, Users,
  ShoppingBag, Wallet, Zap, MessageSquare, Loader2, BarChart3,
  AlertCircle,
} from "lucide-react";

/* ── Tipos ─────────────────────────────────────────── */
interface PlatformSnapshot {
  users: number;
  stores: number;
  travelListings: number;
  vehicleListings: number;
  serviceListings: number;
  freightListings: number;
  realEstateListings: number;
  paidOrders: number;
  paidOrdersRevenue: number;
  promotionPurchases: number;
  promotionRevenue: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

/* ── Preset de perguntas ────────────────────────────── */
const PRESETS = [
  { icon: <TrendingUp className="h-3.5 w-3.5" />, label: "Resumo geral da plataforma", q: "Faça um resumo executivo completo do estado atual da plataforma: usuários, anúncios, receita e oportunidades de crescimento." },
  { icon: <Wallet className="h-3.5 w-3.5" />, label: "Análise financeira", q: "Analise os dados financeiros: quais módulos geram mais receita, qual a proporção de promoções vs pacotes de crédito, e onde há maior potencial de crescimento?" },
  { icon: <Users className="h-3.5 w-3.5" />, label: "Perfil dos usuários", q: "Com base nos dados de lojas e anúncios, descreva o perfil dos usuários da plataforma e sugira como aumentar a retenção." },
  { icon: <ShoppingBag className="h-3.5 w-3.5" />, label: "Módulos mais ativos", q: "Compare os módulos (Viagens, Imóveis, Veículos, Serviços, Fretes) por quantidade de anúncios e identifique oportunidades de promoção." },
  { icon: <Zap className="h-3.5 w-3.5" />, label: "Próximas ações recomendadas", q: "Com base nos dados da plataforma, liste as 5 principais ações que o administrador deveria tomar para aumentar a receita e o engajamento nas próximas semanas." },
  { icon: <BarChart3 className="h-3.5 w-3.5" />, label: "Potencial de monetização", q: "Analise o potencial de monetização dos pacotes de promoção: quantos anunciantes existem, qual a taxa de conversão esperada e qual seria a receita estimada com 10% de adesão?" },
];

/* ── Hook de snapshot ───────────────────────────────── */
function usePlatformSnapshot() {
  return useQuery<PlatformSnapshot>({
    queryKey: ["admin", "glm-platform-snapshot"],
    queryFn: async () => {
      const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
        try { return await fn(); } catch { return fallback; }
      };

      const [
        users, stores,
        travelListings, vehicleListings, serviceListings, freightListings, realEstateListings,
        paidOrders, promoRows,
      ] = await Promise.all([
        safe(async () => {
          const { count } = await (supabase.from("profiles") as any).select("id", { count: "exact", head: true });
          return Number(count ?? 0);
        }, 0),
        safe(async () => {
          const { count } = await (supabase.from("merchant_stores") as any).select("id", { count: "exact", head: true });
          return Number(count ?? 0);
        }, 0),
        safe(async () => {
          const { count } = await (supabase.from("travel_listings") as any).select("id", { count: "exact", head: true }).eq("visibility_status", "published");
          return Number(count ?? 0);
        }, 0),
        safe(async () => {
          const { count } = await (supabase.from("vehicle_listings") as any).select("id", { count: "exact", head: true }).eq("visibility_status", "published");
          return Number(count ?? 0);
        }, 0),
        safe(async () => {
          const { count } = await (supabase.from("service_listings") as any).select("id", { count: "exact", head: true }).eq("visibility_status", "published");
          return Number(count ?? 0);
        }, 0),
        safe(async () => {
          const { count } = await (supabase.from("freight_listings") as any).select("id", { count: "exact", head: true }).eq("visibility_status", "published");
          return Number(count ?? 0);
        }, 0),
        safe(async () => {
          const { count } = await (supabase.from("real_estate_listings") as any).select("id", { count: "exact", head: true }).eq("visibility_status", "published");
          return Number(count ?? 0);
        }, 0),
        safe(async () => {
          const { data } = await (supabase.from("pay_payment_orders") as any).select("amount").eq("status", "paid");
          return data ?? [];
        }, []),
        safe(async () => {
          const { data } = await (supabase.from("promotion_purchases") as any).select("amount_brl").eq("status", "paid");
          return data ?? [];
        }, []),
      ]);

      const paidOrdersRevenue = (paidOrders as any[]).reduce((s: number, o: any) => s + Number(o.amount ?? 0), 0);
      const promotionRevenue = (promoRows as any[]).reduce((s: number, p: any) => s + Number(p.amount_brl ?? 0), 0);

      return {
        users,
        stores,
        travelListings,
        vehicleListings,
        serviceListings,
        freightListings,
        realEstateListings,
        paidOrders: (paidOrders as any[]).length,
        paidOrdersRevenue,
        promotionPurchases: (promoRows as any[]).length,
        promotionRevenue,
      };
    },
    staleTime: 60_000,
  });
}

/* ── Formata snapshot como contexto para o GLM ──────── */
function buildContext(s: PlatformSnapshot): string {
  const fmtBRL = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  return `
DADOS ATUAIS DA PLATAFORMA VIAGG-TX8 (${new Date().toLocaleDateString("pt-BR")}):

Usuários cadastrados: ${s.users.toLocaleString("pt-BR")}
Lojas/estabelecimentos: ${s.stores.toLocaleString("pt-BR")}

Anúncios publicados por módulo:
- Viagens & Turismo: ${s.travelListings}
- Imóveis: ${s.realEstateListings}
- Veículos: ${s.vehicleListings}
- Serviços: ${s.serviceListings}
- Fretes & Transportes: ${s.freightListings}
Total de anúncios: ${s.travelListings + s.realEstateListings + s.vehicleListings + s.serviceListings + s.freightListings}

Financeiro:
- Pedidos pagos (pacotes de crédito): ${s.paidOrders} pedidos — ${fmtBRL(s.paidOrdersRevenue)}
- Pacotes de promoção vendidos: ${s.promotionPurchases} — ${fmtBRL(s.promotionRevenue)}
- Receita total estimada: ${fmtBRL(s.paidOrdersRevenue + s.promotionRevenue)}
`.trim();
}

/* ── Formata resposta markdown simples ──────────────── */
function RenderResponse({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1 text-sm leading-relaxed text-foreground">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) return <h3 key={i} className="text-base font-black mt-3 mb-1 text-primary">{line.slice(3)}</h3>;
        if (line.startsWith("# ")) return <h2 key={i} className="text-lg font-black mt-3 mb-1">{line.slice(2)}</h2>;
        if (line.startsWith("- ") || line.startsWith("• ")) return <li key={i} className="ml-4 list-disc">{line.slice(2)}</li>;
        if (/^\d+\./.test(line)) return <li key={i} className="ml-4 list-decimal">{line.replace(/^\d+\.\s*/, "")}</li>;
        if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="font-bold">{line.slice(2, -2)}</p>;
        if (line.trim() === "") return <div key={i} className="h-2" />;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

/* ── Página principal ───────────────────────────────── */
export default function AdminGLMAnalytics() {
  const { data: snapshot, isLoading: loadingSnap, refetch } = usePlatformSnapshot();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const context = snapshot ? buildContext(snapshot) : "";

  const systemPrompt = `Você é um analista de negócios especialista da plataforma Viagg-TX8, um marketplace multissetorial brasileiro.
Você tem acesso aos dados reais da plataforma e deve fornecer análises precisas, objetivas e acionáveis em português.
Responda de forma organizada, usando títulos (##) e listas quando apropriado.
Seja direto e foque em insights práticos para o administrador.

${context}`;

  async function sendMessage(question: string) {
    if (!question.trim() || sending) return;
    setError(null);
    const userMsg: Message = { role: "user", content: question, ts: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setSending(true);
    try {
      const history = messages
        .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`)
        .join("\n\n");

      const fullQuestion = history
        ? `Histórico da conversa:\n${history}\n\nNova pergunta: ${question}`
        : question;

      const reply = await chatCompletion(fullQuestion, "glm-4-plus", systemPrompt);
      setMessages((m) => [...m, { role: "assistant", content: reply, ts: Date.now() }]);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao conectar com a IA. Verifique se a edge function ai-chat está deployada.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-violet-100 border border-violet-200 flex items-center justify-center">
            <BrainCircuit className="h-6 w-6 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black">Análise com IA GLM</h1>
            <p className="text-muted-foreground text-sm">Insights em tempo real powered by GLM-4-plus (Zhipu AI)</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loadingSnap}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingSnap ? "animate-spin" : ""}`} />
          Atualizar dados
        </Button>
      </div>

      {/* Snapshot cards */}
      {snapshot && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Usuários", value: snapshot.users.toLocaleString("pt-BR"), color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
            { label: "Lojas", value: snapshot.stores.toLocaleString("pt-BR"), color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
            { label: "Anúncios", value: (snapshot.travelListings + snapshot.realEstateListings + snapshot.vehicleListings + snapshot.serviceListings + snapshot.freightListings).toLocaleString("pt-BR"), color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
            { label: "Receita Total", value: `R$ ${(snapshot.paidOrdersRevenue + snapshot.promotionRevenue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, color: "text-violet-600", bg: "bg-violet-50 border-violet-200" },
          ].map((c) => (
            <Card key={c.label} className={`border ${c.bg}`}>
              <CardContent className="p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{c.label}</p>
                <p className={`text-xl font-black ${c.color} mt-0.5`}>{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Presets */}
        <Card className="border-border/60 h-fit">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Análises rápidas
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => sendMessage(p.q)}
                disabled={sending || loadingSnap}
                className="w-full text-left flex items-start gap-2.5 p-2.5 rounded-lg border border-border/50 hover:bg-muted/60 hover:border-primary/30 transition-all text-xs font-medium disabled:opacity-50"
              >
                <span className="mt-0.5 text-primary shrink-0">{p.icon}</span>
                {p.label}
              </button>
            ))}
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground mt-2"
                onClick={() => setMessages([])}
              >
                Limpar conversa
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Chat */}
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4 border-b border-border/40">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Conversa com a IA
              <Badge variant="outline" className="text-[10px] ml-auto">GLM-4-plus</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {/* Messages */}
            <div className="min-h-[300px] max-h-[500px] overflow-y-auto space-y-4 pr-1">
              {messages.length === 0 && !sending && (
                <div className="flex flex-col items-center justify-center h-64 gap-3 text-center text-muted-foreground">
                  <BrainCircuit className="h-10 w-10 opacity-20" />
                  <div>
                    <p className="text-sm font-medium">Pronto para analisar</p>
                    <p className="text-xs mt-1">Escolha uma análise rápida ou faça sua própria pergunta sobre os dados da plataforma.</p>
                  </div>
                </div>
              )}

              {messages.map((m) => (
                <div key={m.ts} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-black ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-violet-100 text-violet-700 border border-violet-200"}`}>
                    {m.role === "user" ? "A" : "IA"}
                  </div>
                  <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted/60 border border-border/40 rounded-tl-sm"}`}>
                    {m.role === "assistant"
                      ? <RenderResponse text={m.content} />
                      : <p>{m.content}</p>
                    }
                    <p className={`text-[9px] mt-1.5 opacity-50 ${m.role === "user" ? "text-right" : ""}`}>
                      {new Date(m.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 border border-violet-200 flex items-center justify-center text-xs font-black shrink-0">IA</div>
                  <div className="bg-muted/60 border border-border/40 rounded-xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">Analisando dados…</span>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {/* Input */}
            <div className="flex gap-2">
              <Textarea
                placeholder="Faça uma pergunta sobre os dados da plataforma…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                rows={2}
                className="resize-none text-sm"
                disabled={sending || loadingSnap}
              />
              <Button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || sending || loadingSnap}
                className="h-auto px-4"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">Enter para enviar · Shift+Enter para nova linha</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
