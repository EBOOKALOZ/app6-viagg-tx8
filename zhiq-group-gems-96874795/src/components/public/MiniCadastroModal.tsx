/**
 * OfertaRapidaModal — Modal simplificado para ofertas de arremate/leilão
 *
 * Sem cadastro. Sem login. Só: Valor + Nome + WhatsApp.
 * O lojista recebe a oferta e entra em contato via WhatsApp.
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Sparkles, CheckCircle2, User, Phone, X, Tag, Gavel,
  DollarSign, Send, ShieldCheck, LogIn,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface OfertaRapidaModalProps {
  open: boolean;
  onClose: () => void;
  /** Listing ID to submit offer against */
  listingId: string;
  /** Product title for display */
  listingTitle: string;
  /** Pre-filled amount (e.g. opportunity price). User can edit if allowCustomAmount */
  defaultAmount?: number;
  /** If true, user can edit the amount. If false, amount is locked (arrematar direto) */
  allowCustomAmount?: boolean;
  /** "arremate" or "auction" for visual theming */
  context?: "arremate" | "auction";
  /** Callback after successful submission */
  onSuccess?: () => void;
}

const WHATSAPP_KEY = "vtx8_oferta_whatsapp";
const NAME_KEY = "vtx8_oferta_nome";

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatBRL(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export function OfertaRapidaModal({
  open,
  onClose,
  listingId,
  listingTitle,
  defaultAmount,
  allowCustomAmount = true,
  context = "arremate",
  onSuccess,
}: OfertaRapidaModalProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAuction = context === "auction";
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  // Auto-fill name/whatsapp from localStorage
  useEffect(() => {
    if (open) {
      try {
        const savedName = localStorage.getItem(NAME_KEY);
        const savedPhone = localStorage.getItem(WHATSAPP_KEY);
        if (savedName) setNome(savedName);
        if (savedPhone) setWhatsapp(savedPhone);
      } catch { /* ignore */ }

      // Pre-fill amount
      if (defaultAmount) {
        setAmount(defaultAmount.toFixed(2));
      }
      setSent(false);
      setError("");
    }
  }, [open, defaultAmount]);

  const handleSubmit = async () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) { setError("Informe um valor válido"); return; }

    setSending(true);
    setError("");
    const amountCents = Math.round(parsedAmount * 100);

    // ═══ LEILÃO: grava LANCE REAL em auction_bids (conta única via auth.uid()) ═══
    // Antes ia para arremate_offers (lead) e o lance NÃO ficava na conta do usuário.
    if (isAuction) {
      if (!user?.id) {
        setError("Entre na sua conta para dar lance.");
        setSending(false);
        return;
      }
      try {
        const { data, error: bidError } = await supabase.rpc("place_auction_bid", {
          p_listing_id: listingId,
          p_amount_cents: amountCents,
        });
        if (bidError) { setError(bidError.message); setSending(false); return; }
        const result = data as any;
        if (result && result.success === false) {
          setError(result.error || "Não foi possível registrar o lance");
          setSending(false);
          return;
        }
        setSent(true);
        toast.success("Lance registrado! 🔥 Acompanhe em Meus Lances.");
        onSuccess?.();
      } catch {
        setError("Erro ao registrar o lance. Tente novamente.");
      } finally {
        setSending(false);
      }
      return;
    }

    // ═══ ARREMATE: lead (nome + WhatsApp) → arremate_offers ═══
    if (!nome.trim()) { setError("Preencha seu nome"); setSending(false); return; }
    const digits = whatsapp.replace(/\D/g, "");
    if (digits.length < 10) { setError("WhatsApp obrigatório — sem ele, a loja não consegue entrar em contato"); setSending(false); return; }

    try {
      // Save name/whatsapp for next time
      localStorage.setItem(NAME_KEY, nome.trim());
      localStorage.setItem(WHATSAPP_KEY, formatPhone(whatsapp));

      const { data, error: rpcError } = await supabase.rpc("submit_arremate_offer", {
        p_listing_id: listingId,
        p_amount_cents: amountCents,
        p_message: null,
        p_customer_name: nome.trim(),
        p_customer_whatsapp: digits,
      });

      if (rpcError) {
        // If special params not supported, try direct insert
        if (rpcError.message.includes("p_customer_name") || rpcError.message.includes("unexpected")) {
          // Fallback: direct insert into arremate_offers
          const { error: insertError } = await (supabase.from("arremate_offers") as any).insert({
            arremate_listing_id: listingId,
            customer_name: nome.trim(),
            customer_whatsapp: digits,
            offer_amount: parsedAmount,
            quantity: 1,
            note: null,
            status: "pending",
          });
          if (insertError) {
            setError(insertError.message);
            setSending(false);
            return;
          }
        } else {
          setError(rpcError.message);
          setSending(false);
          return;
        }
      } else {
        const result = data as any;
        if (result && !result.success) {
          setError(result.error || "Erro ao enviar oferta");
          setSending(false);
          return;
        }
      }

      // Success!
      setSent(true);
      toast.success("Oferta enviada! A loja entrará em contato 🎉");
      onSuccess?.();
    } catch {
      setError("Erro ao enviar. Tente novamente.");
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  const isArremate = context === "arremate";
  const accentFrom = isArremate ? "from-violet-500" : "from-orange-500";
  const accentTo = isArremate ? "to-purple-500" : "to-amber-500";
  const accentBg = isArremate ? "bg-violet-50" : "bg-orange-50";
  const accentBorder = isArremate ? "border-violet-200" : "border-orange-200";
  const CtxIcon = isArremate ? Tag : Gavel;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full sm:max-w-md bg-white sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* ── Gradient header ── */}
        <div className={`bg-gradient-to-r ${accentFrom} ${accentTo} px-6 py-5 text-white relative`}>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-white/15 hover:bg-white/25 transition-all"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/20">
              <CtxIcon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-black">
                {sent ? "Oferta enviada! ✅" : isArremate ? "Fazer Oferta" : "Dar Lance"}
              </h2>
              <p className="text-xs text-white/80 line-clamp-1">
                {sent ? "A loja entrará em contato" : listingTitle}
              </p>
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="px-6 py-5 space-y-4">
          {sent ? (
            /* ═══ SUCCESS STATE ═══ */
            <div className="text-center space-y-4 py-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <div>
                <p className="text-base font-bold text-gray-800">{isAuction ? "Lance registrado! 🔥" : "Sua oferta foi registrada!"}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {isAuction
                    ? "Você está participando do leilão. Acompanhe seus lances na sua conta, em Meus Lances."
                    : "O lojista receberá sua proposta e, se aceita, entrará em contato pelo WhatsApp informado."}
                </p>
              </div>
              <div className={`rounded-xl ${accentBg} border ${accentBorder} p-3`}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{isAuction ? "Seu lance" : "Valor da oferta"}</span>
                  <span className="font-black text-gray-900">{formatBRL(parseFloat(amount) || 0)}</span>
                </div>
                {!isAuction && (
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-gray-600">WhatsApp</span>
                    <span className="font-bold text-gray-800">{formatPhone(whatsapp)}</span>
                  </div>
                )}
              </div>
              {isAuction ? (
                <Button
                  onClick={() => { onClose(); navigate("/meus-lances"); }}
                  variant="outline"
                  className="w-full h-10 text-sm font-bold rounded-xl border-orange-300 text-orange-700 hover:bg-orange-50"
                >
                  <Gavel className="h-4 w-4 mr-2" /> Ver Meus Lances
                </Button>
              ) : (
                <div className="flex items-center justify-center gap-1.5 text-[10px] text-gray-400">
                  <ShieldCheck className="h-3 w-3" />
                  Seus dados são compartilhados apenas com a loja
                </div>
              )}
              <div className="text-[9px] text-gray-400/80 text-center leading-relaxed mt-1 px-2">
                A plataforma atua apenas como intermediadora de produtos locais, facilitando o acesso entre consumidores e lojas da região. Não nos envolvemos nem nos responsabilizamos pelas transações realizadas entre as partes.
              </div>
              <Button
                onClick={onClose}
                className={`w-full h-11 text-sm font-bold bg-gradient-to-r ${accentFrom} ${accentTo} hover:opacity-90 text-white rounded-xl`}
              >
                Fechar
              </Button>
            </div>
          ) : (
            /* ═══ FORM STATE ═══ */
            <>
              {/* Valor da Oferta */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-600 flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5" /> Valor da oferta (R$) <span className="text-red-500">*</span>
                </Label>
                {allowCustomAmount ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 150.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="h-12 rounded-xl text-lg font-bold"
                    autoFocus
                  />
                ) : (
                  <div className={`h-12 rounded-xl ${accentBg} border ${accentBorder} flex items-center px-4`}>
                    <span className="text-lg font-black text-gray-900">
                      {formatBRL(defaultAmount || 0)}
                    </span>
                    <span className="ml-auto text-[10px] text-gray-400 font-medium">valor fixo</span>
                  </div>
                )}
              </div>

              {isAuction ? (
                /* ═══ LEILÃO: identidade pela conta (sem nome/WhatsApp) ═══ */
                user ? (
                  <div className="flex items-center gap-2.5 rounded-xl bg-orange-50 border border-orange-200 px-3 py-2.5">
                    <User className="h-4 w-4 text-orange-500 shrink-0" />
                    <p className="text-xs text-gray-600 leading-snug">
                      Dando lance como <b className="text-gray-900">{user.email || "sua conta"}</b> — fica registrado em <b>Meus Lances</b>.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl bg-orange-50 border border-orange-200 p-3 text-center space-y-2.5">
                    <p className="text-xs font-semibold text-gray-700">Entre na sua conta para dar lance no leilão.</p>
                    <Button
                      onClick={() => { onClose(); navigate("/auth"); }}
                      className="w-full h-10 text-sm font-bold bg-[#FF6A00] hover:bg-[#e85f00] text-white rounded-xl"
                    >
                      <LogIn className="h-4 w-4 mr-2" /> Entrar
                    </Button>
                  </div>
                )
              ) : (
                <>
                  {/* Nome */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-600 flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" /> Seu nome <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      placeholder="Como quer ser chamado(a)"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="h-11 rounded-xl"
                    />
                  </div>

                  {/* WhatsApp (obrigatório) */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-600 flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" /> WhatsApp
                      <span className="text-red-500">*</span>
                      <span className="ml-auto text-[9px] font-semibold text-red-400 bg-red-50 px-1.5 py-0.5 rounded-full">obrigatório</span>
                    </Label>
                    <Input
                      placeholder="(11) 99999-9999"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(formatPhone(e.target.value))}
                      className="h-11 rounded-xl"
                    />
                    <p className="text-[10px] text-gray-400">Sem WhatsApp, a loja não consegue entrar em contato</p>
                  </div>
                </>
              )}

              {/* Error */}
              {error && (
                <div className="text-red-500 text-xs font-medium bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-center">
                  {error}
                </div>
              )}

              {/* Submit (leilão deslogado mostra só o botão Entrar acima) */}
              {!(isAuction && !user) && (
                <Button
                  onClick={handleSubmit}
                  disabled={
                    sending ||
                    (!amount && !defaultAmount) ||
                    (!isAuction && (!nome.trim() || whatsapp.replace(/\D/g, "").length < 10))
                  }
                  className={`w-full h-12 text-sm font-bold bg-gradient-to-r ${accentFrom} ${accentTo} hover:opacity-90 text-white rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {sending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      {isArremate ? <Send className="h-4 w-4 mr-2" /> : <Gavel className="h-4 w-4 mr-2" />}
                      {isArremate ? "Enviar Oferta" : "Dar Lance"}
                    </>
                  )}
                </Button>
              )}

              {/* Info */}
              <div className="flex items-start gap-2 text-[10px] text-gray-400 leading-relaxed">
                <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-gray-300" />
                <p>
                  {isAuction
                    ? "Seu lance fica registrado na sua conta única Viagg-TX8™ e aparece em Meus Lances. O maior lance ao encerramento vence."
                    : "Sem cadastro necessário. A loja receberá sua oferta e, se aceita, entrará em contato pelo WhatsApp informado."}
                </p>
              </div>
              <div className="text-[9px] text-gray-400/70 leading-relaxed px-1 border-t border-gray-100 pt-2">
                A plataforma Viagg-TX8 atua exclusivamente como intermediadora de produtos locais, facilitando o acesso entre consumidores e lojas da região. A plataforma não participa, não intermedia e não se responsabiliza pelas transações, pagamentos ou acordos realizados diretamente entre comprador e loja.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Re-export with old name for backward compatibility
export { OfertaRapidaModal as MiniCadastroModal };
