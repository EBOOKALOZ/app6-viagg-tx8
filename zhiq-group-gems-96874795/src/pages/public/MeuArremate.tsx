/**
 * MeuArremate — Painel "Meu Arremate" (FASE C · comunicação e confirmação P2P).
 * Modelo direto comprador↔vendedor: a plataforma NÃO intermedia pagamento — só
 * registra/acompanha/audita. Papel (comprador/vendedor) resolvido pelo backend;
 * cada botão chama a RPC guardada correspondente (arremate_*). Chat + contato via RPC.
 * A mesma tela serve os 2 lados; os botões aparecem conforme o papel.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { toast } from "sonner";
import {
  Gavel, Loader2, CheckCircle2, Truck, PackageCheck, HandCoins, MessageCircle,
  ShieldAlert, Phone, Paperclip, Send, User, ArrowLeft, Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS: { key: string; label: string }[] = [
  { key: "aguardando_contato", label: "Aguardando contato" },
  { key: "contato_liberado", label: "Contato liberado" },
  { key: "pagamento_informado_comprador", label: "Pagamento informado" },
  { key: "pagamento_confirmado_vendedor", label: "Pagamento confirmado" },
  { key: "entregue", label: "Produto enviado" },
  { key: "recebido", label: "Produto recebido" },
  { key: "concluido", label: "Concluído" },
];
const brl = (v: any) => `R$ ${Number(v ?? 0).toFixed(2).replace(".", ",")}`;

interface Msg { id: string; sender_party: string; sender_user_id: string; body: string | null; attachments: any[]; created_at: string; }

export default function MeuArremate() {
  const { id: listingId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [settlement, setSettlement] = useState<any>(null);
  const [role, setRole] = useState<"buyer" | "seller" | "admin" | null>(null);
  const [contato, setContato] = useState<any>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!listingId || !user) return;
    const { data: s } = await (supabase.from("orion_auction_settlements") as any)
      .select("*").eq("listing_id", listingId).maybeSingle();
    setSettlement(s);
    if (s) setRole(s.winner_user_id === user.id ? "buyer" : s.seller_user_id === user.id ? "seller" : "admin");
    const { data: m } = await (supabase.rpc as any)("arremate_list_messages", { p_listing_id: listingId });
    setMsgs(Array.isArray(m) ? m : []);
    setLoading(false);
  }, [listingId, user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const call = async (rpc: string, extra: Record<string, any> = {}, okMsg?: string) => {
    setBusy(rpc);
    try {
      const { data, error } = await (supabase.rpc as any)(rpc, { p_listing_id: listingId, ...extra });
      if (error) throw error;
      if (okMsg) toast.success(okMsg);
      await load();
      return data;
    } catch (e: any) {
      toast.error(e?.message || "Erro na operação");
    } finally {
      setBusy(null);
    }
  };

  const verContato = async () => {
    const c = await call("arremate_get_contato");
    if (c) setContato(c);
  };

  const enviarMsg = async () => {
    if (!body.trim() && !file) return;
    setBusy("send");
    try {
      let attachments: any[] = [];
      if (file) {
        const path = `${listingId}/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage.from("arremate-anexos").upload(path, file);
        if (upErr) throw upErr;
        attachments = [{ path, name: file.name, type: file.type, size: file.size }];
      }
      const { error } = await (supabase.rpc as any)("arremate_send_message", {
        p_listing_id: listingId, p_body: body.trim() || null, p_attachments: attachments,
      });
      if (error) throw error;
      setBody(""); setFile(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar");
    } finally { setBusy(null); }
  };

  if (loading) return <MarketLayout><div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-[#FF6A00]" /></div></MarketLayout>;
  if (!settlement) return <MarketLayout><div className="max-w-lg mx-auto py-24 text-center text-gray-500">Arremate não encontrado ou sem acesso.</div></MarketLayout>;

  const st = settlement.arremate_status || "aguardando_contato";
  const stepIdx = Math.max(0, STEPS.findIndex((s) => s.key === st));
  const isBuyer = role === "buyer", isSeller = role === "seller" || role === "admin";
  const terminal = st === "concluido" || st === "cancelado";
  const disputa = st === "em_disputa";

  const Btn = ({ onClick, icon: Icon, children, tone = "orange", disabled }: any) => (
    <button onClick={onClick} disabled={!!busy || disabled}
      className={cn("flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all disabled:opacity-50 active:scale-95",
        tone === "orange" && "bg-[#FF6A00] text-white hover:brightness-110",
        tone === "green" && "bg-emerald-600 text-white hover:brightness-110",
        tone === "sky" && "bg-sky-600 text-white hover:brightness-110",
        tone === "ghost" && "bg-white text-slate-800 border-2 border-slate-200 hover:border-slate-300",
        tone === "red" && "bg-white text-red-600 border-2 border-red-200 hover:bg-red-50")}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />} {children}
    </button>
  );

  return (
    <MarketLayout>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>

        {/* Cabeçalho do arremate */}
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FF6A00]/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-[#FF6A00]">
                <Gavel className="h-3 w-3" /> {isBuyer ? "Meu arremate (comprador)" : "Arremate (vendedor)"}
              </span>
              <h1 className="mt-2 text-xl font-black text-slate-900">{settlement.titulo || "Item arrematado"}</h1>
              <p className="text-sm text-slate-500">{settlement.cidade}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold uppercase text-slate-400">Valor final</p>
              <p className="text-2xl font-black text-slate-900">{brl(settlement.valor_final)}</p>
            </div>
          </div>
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">
            💡 O pagamento é <b>direto entre você e a outra parte</b> (PIX, dinheiro, transferência…). A plataforma apenas registra e acompanha — nunca recebe o valor do produto.
          </p>
        </div>

        {/* Timeline de estados */}
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          {disputa && <p className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700"><ShieldAlert className="h-4 w-4" /> Em disputa — aguardando decisão do suporte.</p>}
          {st === "cancelado" && <p className="mb-3 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600"><Ban className="h-4 w-4" /> Arremate cancelado.</p>}
          <ol className="space-y-2">
            {STEPS.map((s, i) => (
              <li key={s.key} className="flex items-center gap-3">
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black",
                  i <= stepIdx && !disputa ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500")}>
                  {i < stepIdx ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </span>
                <span className={cn("text-sm font-semibold", i === stepIdx && !terminal && !disputa && "text-[#FF6A00]", i <= stepIdx ? "text-slate-900" : "text-slate-400")}>{s.label}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Ações por papel */}
        {!terminal && (
          <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <p className="mb-3 text-sm font-black text-slate-900">Ações</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {st === "aguardando_contato" && <Btn onClick={() => call("arremate_release_contact", {}, "Contato liberado")} icon={Phone} tone="orange">Liberar contato</Btn>}
              {st !== "aguardando_contato" && <Btn onClick={verContato} icon={Phone} tone="ghost">Ver contato da outra parte</Btn>}

              {isBuyer && st === "contato_liberado" && <Btn onClick={() => call("arremate_buyer_informar_pagamento", {}, "Pagamento informado")} icon={HandCoins} tone="green">Informar pagamento</Btn>}
              {isBuyer && st === "entregue" && <Btn onClick={() => call("arremate_buyer_receber", {}, "Recebimento confirmado")} icon={PackageCheck} tone="green">Recebi o produto</Btn>}

              {isSeller && st === "pagamento_informado_comprador" && <Btn onClick={() => call("arremate_seller_confirmar_pagamento", {}, "Pagamento confirmado")} icon={CheckCircle2} tone="green">Confirmar pagamento</Btn>}
              {isSeller && st === "pagamento_confirmado_vendedor" && <Btn onClick={() => call("arremate_seller_enviar", {}, "Envio confirmado")} icon={Truck} tone="sky">Produto enviado</Btn>}
              {isSeller && st === "recebido" && <Btn onClick={() => call("arremate_concluir", {}, "Arremate concluído")} icon={CheckCircle2} tone="green">Confirmar conclusão</Btn>}

              <Btn onClick={() => { const m = prompt("Descreva o motivo da disputa:"); if (m) call("arremate_abrir_disputa", { p_motivo: m }, "Disputa aberta"); }} icon={ShieldAlert} tone="red">Abrir disputa</Btn>
            </div>
          </div>
        )}

        {/* Contato revelado */}
        {contato && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
            <p className="mb-1 flex items-center gap-1.5 font-black text-emerald-800"><User className="h-4 w-4" /> Contato {contato.papel || "das partes"}</p>
            <pre className="whitespace-pre-wrap text-emerald-900">{JSON.stringify(contato, null, 1)}</pre>
          </div>
        )}

        {/* Chat */}
        <div className="rounded-2xl border border-black/10 bg-white shadow-sm">
          <p className="flex items-center gap-2 border-b border-black/5 px-5 py-3 text-sm font-black text-slate-900"><MessageCircle className="h-4 w-4 text-[#FF6A00]" /> Conversa</p>
          <div className="max-h-80 space-y-2 overflow-y-auto px-4 py-3">
            {msgs.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Nenhuma mensagem ainda.</p>}
            {msgs.map((m) => {
              const mine = m.sender_user_id === user?.id;
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-[#FF6A00] text-white" : "bg-slate-100 text-slate-800")}>
                    {m.body && <p>{m.body}</p>}
                    {(m.attachments || []).map((a: any, i: number) => (
                      <a key={i} className="mt-1 flex items-center gap-1 text-[12px] underline opacity-90"
                        href="#" onClick={async (e) => { e.preventDefault(); const { data } = await supabase.storage.from("arremate-anexos").createSignedUrl(a.path, 120); if (data?.signedUrl) window.open(data.signedUrl, "_blank"); }}>
                        <Paperclip className="h-3 w-3" /> {a.name}
                      </a>
                    ))}
                    <p className={cn("mt-0.5 text-[10px]", mine ? "text-white/70" : "text-slate-400")}>{new Date(m.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                </div>
              );
            })}
            <div ref={chatEnd} />
          </div>
          {!terminal && (
            <div className="flex items-center gap-2 border-t border-black/5 p-3">
              <label className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <Paperclip className="h-5 w-5" />
                <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
              <input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enviarMsg()}
                placeholder={file ? `Anexo: ${file.name}` : "Mensagem / comprovante…"}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#FF6A00]" />
              <button onClick={enviarMsg} disabled={busy === "send"} className="rounded-xl bg-[#FF6A00] p-2.5 text-white hover:brightness-110 disabled:opacity-50">
                {busy === "send" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </MarketLayout>
  );
}
