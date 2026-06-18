/**
 * ContactIntentionModal
 *
 * Modal premium para visitantes registrarem interesse em um anúncio.
 * Chamado pelas páginas públicas de Imóveis e Veículos.
 *
 * Props:
 *   open           → controle externo de abertura
 *   onClose        → callback de fechamento
 *   listingId      → UUID do anúncio
 *   listingModule  → 'real_estate' | 'vehicles'
 *   interestType   → tipo de interesse (padrão: 'message_request')
 *   listingTitle   → título para exibição no modal
 */

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  MessageSquare,
  Phone,
  User,
  Mail,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import {
  useRegisterContactIntention,
  type ListingModule,
  type InterestType,
} from "@/hooks/useContactIntentions";
import { supabase } from "@/integrations/supabase/client";
import { getVisitorFingerprint } from "@/lib/cpcTracker";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ContactIntentionModalProps {
  open: boolean;
  onClose: () => void;
  listingId: string;
  listingModule: ListingModule;
  interestType?: InterestType;
  listingTitle?: string;
}

// ─── Máscara de telefone BR ───────────────────────────────────────────────────

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function ContactIntentionModal({
  open,
  onClose,
  listingId,
  listingModule,
  interestType = "message_request",
  listingTitle,
}: ContactIntentionModalProps) {
  const { register, isLoading } = useRegisterContactIntention();

  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const emailOk = /\S+@\S+\.\S+/.test(form.email.trim());
  const isValid =
    form.name.trim().length >= 2 &&
    form.phone.replace(/\D/g, "").length >= 10 &&
    emailOk;

  const handleSubmit = async () => {
    if (!isValid || isLoading) return;
    setError(null);

    // Dobra o e-mail dentro da mensagem (mesmo padrão do register_product_inquiry),
    // garantindo que o anunciante receba o contato de e-mail do interessado.
    const composedMessage = [
      form.message.trim(),
      form.email.trim() ? `E-mail: ${form.email.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await register({
      listingModule,
      listingId,
      interestType,
      visitorName: form.name.trim(),
      visitorPhone: form.phone,
      visitorMessage: composedMessage || undefined,
    });

    if (!result.success) {
      if (result.error === "self_contact_not_allowed") {
        setError("Você não pode demonstrar interesse no seu próprio anúncio.");
      } else if (result.error === "listing_not_found") {
        setError("Anúncio não encontrado. Tente novamente.");
      } else {
        console.error("Registro de interesse falhou com erro:", result.error);
        setError("Erro ao registrar interesse. Por favor tente novamente.");
      }
      return;
    }

    setSubmitted(true);
  };

  const handleClose = () => {
    setForm({ name: "", phone: "", email: "", message: "" });
    setSubmitted(false);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md rounded-[32px] border-0 shadow-2xl p-0 overflow-hidden">

        {/* ── Header Gradiente ── */}
        <div className="bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 px-8 pt-8 pb-6 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">
                {listingModule === "real_estate" ? "Imóvel" : "Veículo"}
              </p>
              <DialogTitle className="text-white font-black text-lg leading-tight">
                Demonstrar Interesse
              </DialogTitle>
            </div>
          </div>
          {listingTitle && (
            <p className="text-zinc-400 text-xs font-medium line-clamp-1 ml-[52px]">
              {listingTitle}
            </p>
          )}
        </div>

        {/* ── Body ── */}
        <div className="p-8 space-y-6 bg-white">

          {/* ── Estado de Sucesso ── */}
          {submitted ? (
            <div className="flex flex-col items-center text-center space-y-4 py-4">
              <div className="relative mb-2 flex items-center justify-center">
                <div className="relative">
                  <Logo size="lg" rounded />
                  <Sparkles className="w-6 h-6 text-orange-400 absolute -top-2 -right-4 animate-bounce" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-zinc-900">Interesse Registrado!</h3>
                <p className="text-zinc-500 text-sm font-medium max-w-xs mx-auto leading-relaxed">
                  O anunciante já recebeu sua mensagem e assim que possível vai entrar em contato com você.
                </p>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-full border border-emerald-100">
                <ShieldCheck className="w-3.5 h-3.5" />
                Suas informações estão protegidas
              </div>
              <Button
                onClick={handleClose}
                className="w-full h-12 rounded-2xl bg-zinc-900 text-white font-black uppercase text-xs tracking-widest mt-2"
              >
                Fechar
              </Button>
            </div>

          ) : (
            /* ── Formulário ── */
            <div className="space-y-5">
              <p className="text-zinc-500 text-sm font-medium leading-relaxed">
                Preencha seus dados para que o anunciante entre em contato com você.
              </p>

              {/* Nome */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Seu nome *
                </label>
                <Input
                  placeholder="Nome completo"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  className="h-12 rounded-xl border-zinc-200 focus-visible:ring-orange-500/30 focus-visible:border-orange-500 font-medium"
                />
              </div>

              {/* Telefone / WhatsApp */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> WhatsApp / Telefone *
                </label>
                <Input
                  placeholder="(00) 00000-0000"
                  value={form.phone}
                  onChange={(e) => update("phone", maskPhone(e.target.value))}
                  className="h-12 rounded-xl border-zinc-200 focus-visible:ring-orange-500/30 focus-visible:border-orange-500 font-medium"
                  inputMode="tel"
                />
              </div>

              {/* E-mail */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> E-mail *
                </label>
                <Input
                  type="email"
                  placeholder="voce@email.com"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  className="h-12 rounded-xl border-zinc-200 focus-visible:ring-orange-500/30 focus-visible:border-orange-500 font-medium"
                  inputMode="email"
                  autoComplete="email"
                />
              </div>

              {/* Mensagem */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> Mensagem (opcional)
                </label>
                <Textarea
                  placeholder="Ex: Gostaria de agendar uma visita..."
                  value={form.message}
                  onChange={(e) => update("message", e.target.value)}
                  className="rounded-xl border-zinc-200 focus-visible:ring-orange-500/30 focus-visible:border-orange-500 font-medium resize-none"
                  rows={3}
                  maxLength={400}
                />
                <p className="text-right text-[10px] text-zinc-300 tabular-nums">
                  {form.message.length}/400
                </p>
              </div>

              {/* Erro */}
              {error && (
                <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                  <p className="text-xs font-bold text-red-600">{error}</p>
                </div>
              )}

              {/* Aviso de privacidade */}
              <div className="flex items-start gap-2 bg-zinc-50 rounded-2xl p-4">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">
                  Seus dados são protegidos. Você não será adicionado a listas de email ou grupos sem sua autorização.
                </p>
              </div>

              {/* Botão */}
              <Button
                onClick={handleSubmit}
                disabled={!isValid || isLoading}
                className="w-full h-14 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-black uppercase text-xs tracking-widest shadow-lg shadow-orange-600/20 transition-all disabled:opacity-40"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Enviar Interesse
                  </>
                )}
              </Button>

              <p className="text-center text-[10px] text-zinc-400 font-medium">
                O anunciante verá sua mensagem somente após verificação da plataforma.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
