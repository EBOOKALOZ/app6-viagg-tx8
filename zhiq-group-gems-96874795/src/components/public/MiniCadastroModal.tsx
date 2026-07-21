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
  const CtxIcon = isArremate ? Tag : Gavel;

  const accentHex = isArremate ? "#7C3AED" : "#FF6A00";
  const accentHex2 = isArremate ? "#A855F7" : "#FF9A00";

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

      {/* Modal — visual premium escuro (consistente com o detalhe do leilão) */}
      <div className="relative w-full sm:max-w-md overflow-hidden rounded-t-[28px] border border-white/10 bg-gradient-to-b from-[#15181E] via-[#101216] to-[#0B0D10] text-white shadow-[0_30px_80px_-12px_rgba(0,0,0,0.8)] animate-in fade-in slide-in-from-bottom-4 duration-300 sm:rounded-[28px]">
        {/* glow decorativo colorido pela categoria */}
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[130%] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
             style={{ background: `radial-gradient(ellipse at center, ${accentHex}66, transparent 70%)` }} />

        {/* ── Header ── */}
        <div className="relative px-6 pb-4 pt-6">
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/70 backdrop-blur-md transition-all hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg"
                 style={{ background: `linear-gradient(135deg, ${accentHex}, ${accentHex2})`, boxShadow: `0 8px 22px -8px ${accentHex}` }}>
              <CtxIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-black leading-tight">
                {sent ? "Oferta enviada! ✅" : isArremate ? "Fazer Oferta" : "Dar Lance"}
              </h2>
              <p className="truncate text-xs text-white/50">
                {sent ? "A loja entrará em contato" : listingTitle}
              </p>
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="space-y-4 px-6 pb-6">
          {sent ? (
            /* ═══ SUCCESS STATE ═══ */
            <div className="space-y-4 py-2 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/30">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <div>
                <p className="text-base font-black text-white">{isAuction ? "Lance registrado! 🔥" : "Sua oferta foi registrada!"}</p>
                <p className="mt-1 text-sm text-white/50">
                  {isAuction
                    ? "Você está participando do leilão. Acompanhe seus lances na sua conta, em Meus Lances."
                    : "O lojista receberá sua proposta e, se aceita, entrará em contato pelo WhatsApp informado."}
                </p>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: `${accentHex}40`, background: `linear-gradient(160deg, ${accentHex}22, transparent)` }}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/50">{isAuction ? "Seu lance" : "Valor da oferta"}</span>
                  <span className="text-lg font-black" style={{ color: accentHex2 }}>{formatBRL(parseFloat(amount) || 0)}</span>
                </div>
                {!isAuction && (
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span className="text-white/50">WhatsApp</span>
                    <span className="font-bold text-white/80">{formatPhone(whatsapp)}</span>
                  </div>
                )}
              </div>
              {isAuction ? (
                <Button
                  onClick={() => { onClose(); navigate("/meus-lances"); }}
                  className="h-11 w-full rounded-xl border border-white/15 bg-white/5 text-sm font-bold text-white hover:bg-white/10"
                >
                  <Gavel className="mr-2 h-4 w-4" /> Ver Meus Lances
                </Button>
              ) : (
                <div className="flex items-center justify-center gap-1.5 text-[10px] text-white/40">
                  <ShieldCheck className="h-3 w-3" />
                  Seus dados são compartilhados apenas com a loja
                </div>
              )}
              <div className="px-2 text-center text-[9px] leading-relaxed text-white/30">
                A plataforma atua apenas como intermediadora de produtos locais, facilitando o acesso entre consumidores e lojas da região. Não nos envolvemos nem nos responsabilizamos pelas transações realizadas entre as partes.
              </div>
              <Button
                onClick={onClose}
                className="h-12 w-full rounded-xl text-sm font-black text-white hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${accentHex}, ${accentHex2})` }}
              >
                Fechar
              </Button>
            </div>
          ) : (
            /* ═══ FORM STATE ═══ */
            <>
              {/* Valor da Oferta */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-xs font-bold text-white/60">
                  <DollarSign className="h-3.5 w-3.5" /> Valor da oferta (R$) <span style={{ color: accentHex2 }}>*</span>
                </Label>
                {allowCustomAmount ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 150,00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="h-14 rounded-2xl border-white/10 bg-black/40 text-xl font-black text-white placeholder:text-white/25 focus-visible:ring-2"
                    style={{ ["--tw-ring-color" as any]: `${accentHex}80` }}
                    autoFocus
                  />
                ) : (
                  <div className="flex h-14 items-center rounded-2xl border px-4"
                       style={{ borderColor: `${accentHex}40`, background: `linear-gradient(160deg, ${accentHex}22, transparent)` }}>
                    <span className="text-xl font-black" style={{ color: accentHex2 }}>{formatBRL(defaultAmount || 0)}</span>
                    <span className="ml-auto text-[10px] font-medium text-white/40">valor fixo</span>
                  </div>
                )}
              </div>

              {isAuction ? (
                /* ═══ LEILÃO: identidade pela conta (sem nome/WhatsApp) ═══ */
                user ? (
                  <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
                    <User className="h-4 w-4 shrink-0" style={{ color: accentHex2 }} />
                    <p className="text-xs leading-snug text-white/60">
                      Dando lance como <b className="text-white">{user.email || "sua conta"}</b> — fica registrado em <b className="text-white/90">Meus Lances</b>.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center">
                    <p className="text-xs font-semibold text-white/70">Entre na sua conta para dar lance no leilão.</p>
                    <Button
                      onClick={() => { onClose(); navigate("/auth"); }}
                      className="h-11 w-full rounded-xl text-sm font-black text-white hover:opacity-90"
                      style={{ background: `linear-gradient(135deg, ${accentHex}, ${accentHex2})` }}
                    >
                      <LogIn className="mr-2 h-4 w-4" /> Entrar
                    </Button>
                  </div>
                )
              ) : (
                <>
                  {/* Nome */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5 text-xs font-bold text-white/60">
                      <User className="h-3.5 w-3.5" /> Seu nome <span style={{ color: accentHex2 }}>*</span>
                    </Label>
                    <Input
                      placeholder="Como quer ser chamado(a)"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="h-12 rounded-2xl border-white/10 bg-black/40 text-white placeholder:text-white/25"
                    />
                  </div>

                  {/* WhatsApp (obrigatório) */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5 text-xs font-bold text-white/60">
                      <Phone className="h-3.5 w-3.5" /> WhatsApp
                      <span style={{ color: accentHex2 }}>*</span>
                      <span className="ml-auto rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-red-300">obrigatório</span>
                    </Label>
                    <Input
                      placeholder="(11) 99999-9999"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(formatPhone(e.target.value))}
                      className="h-12 rounded-2xl border-white/10 bg-black/40 text-white placeholder:text-white/25"
                    />
                    <p className="text-[10px] text-white/40">Sem WhatsApp, a loja não consegue entrar em contato</p>
                  </div>
                </>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-xl border border-red-400/30 bg-red-500/15 px-3 py-2 text-center text-xs font-medium text-red-300">
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
                  className="h-14 w-full rounded-2xl text-base font-black text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                  style={{ background: `linear-gradient(135deg, ${accentHex}, ${accentHex2})`, boxShadow: `0 14px 34px -10px ${accentHex}` }}
                >
                  {sending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      {isArremate ? <Send className="mr-2 h-5 w-5" /> : <Gavel className="mr-2 h-5 w-5" />}
                      {isArremate ? "Enviar Oferta" : "Dar Lance"}
                    </>
                  )}
                </Button>
              )}

              {/* Info */}
              <div className="flex items-start gap-2 text-[10px] leading-relaxed text-white/45">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/30" />
                <p>
                  {isAuction
                    ? "Seu lance fica registrado na sua conta única Viagg-TX8™ e aparece em Meus Lances. O maior lance ao encerramento vence."
                    : "Sem cadastro necessário. A loja receberá sua oferta e, se aceita, entrará em contato pelo WhatsApp informado."}
                </p>
              </div>
              <div className="border-t border-white/10 px-1 pt-3 text-[9px] leading-relaxed text-white/30">
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
