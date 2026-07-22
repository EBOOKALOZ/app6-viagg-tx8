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

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SessionSafetyFlash } from "@/components/public/SessionSafetyFlash";
import { GlobalFooter } from "@/components/GlobalFooter";
import { Textarea } from "@/components/ui/textarea";
import {
  MessageSquare,
  Phone,
  User,
  Mail,
  ShieldCheck,
  Loader2,
  Sparkles,
  X,
  AlertTriangle,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  useRegisterContactIntention,
  type ListingModule,
  type InterestType,
} from "@/hooks/useContactIntentions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ListingMetaChip {
  icon: React.ReactNode;
  label: string;
  color?: string;
}

export interface ListingMeta {
  image?: string | null;
  chips?: ListingMetaChip[];
}

interface ContactIntentionModalProps {
  open: boolean;
  onClose: () => void;
  listingId: string;
  listingModule: ListingModule;
  interestType?: InterestType;
  listingTitle?: string;
  listingMeta?: ListingMeta;
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

// ─── Tema do header por categoria (gradiente + rótulo) ────────────────────────
// Identidade visual por módulo, alinhada às cores usadas nos cards da plataforma.
const MODULE_THEME: Record<string, { label: string; gradient: string; accent: string; onDark: boolean }> = {
  real_estate: { label: "Imóvel",  gradient: "from-emerald-500 via-emerald-600 to-teal-700",   accent: "text-emerald-100", onDark: true },
  vehicles:    { label: "Veículo", gradient: "from-indigo-500 via-indigo-600 to-blue-700",     accent: "text-indigo-100",  onDark: true },
  services:    { label: "Serviço", gradient: "from-violet-500 via-purple-600 to-fuchsia-700",  accent: "text-violet-100",  onDark: true },
  freight:     { label: "Frete",   gradient: "from-blue-500 via-blue-600 to-sky-700",          accent: "text-blue-100",    onDark: true },
  travel:      { label: "Viagem",  gradient: "from-sky-500 via-cyan-600 to-teal-600",          accent: "text-sky-100",     onDark: true },
  product:     { label: "Produto", gradient: "from-orange-500 via-orange-600 to-amber-600",    accent: "text-orange-100",  onDark: true },
};
const DEFAULT_THEME = { label: "Anúncio", gradient: "from-zinc-700 via-zinc-800 to-zinc-900", accent: "text-zinc-300", onDark: true };

// ─── Componente ───────────────────────────────────────────────────────────────

export function ContactIntentionModal({
  open,
  onClose,
  listingId,
  listingModule,
  interestType = "message_request",
  listingTitle,
  listingMeta,
}: ContactIntentionModalProps) {
  const { register, isLoading } = useRegisterContactIntention();
  const { user } = useAuth();

  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Pré-preenche com os dados do usuário logado
  useEffect(() => {
    if (!open || !user) return;
    setForm(prev => ({
      ...prev,
      email: prev.email || user.email || "",
    }));
    (supabase.from("profiles") as any)
      .select("name, full_name, telefone, whatsapp")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }: any) => {
        if (!data) return;
        const name = data.name || data.full_name || "";
        const phone = data.whatsapp || data.telefone || "";
        setForm(prev => ({
          ...prev,
          name: prev.name || name,
          phone: prev.phone || (phone ? maskPhone(phone) : ""),
        }));
      });
  }, [open, user?.id]);

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

    // Dispara e-mail ao anunciante + confirmação ao visitante (sem depender do trigger)
    supabase.functions.invoke('swift-action', {
      body: {
        source: 'lead',
        lead_intention_id: result.intention_id || null,
        visitor_email: form.email.trim() || null,
        visitor_name: form.name.trim(),
        visitor_phone: form.phone.replace(/\D/g, ''),
        visitor_message: composedMessage || null,
        listing_module: listingModule,
        listing_id: listingId,
      },
    }).catch((e) => console.warn('[email lead]', e));

    setSubmitted(true);
  };

  const handleClose = () => {
    setForm({ name: "", phone: "", email: "", message: "" });
    setSubmitted(false);
    setError(null);
    onClose();
  };

  const theme = MODULE_THEME[listingModule as string] || DEFAULT_THEME;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      {open && <SessionSafetyFlash />}
      <DialogContent className="max-w-md max-h-[90vh] rounded-[32px] border-0 shadow-2xl p-0 overflow-hidden flex flex-col gap-0">

        {/* ── Header Padrão Oficial (gradiente por categoria) — FIXO ── */}
        <div className={`shrink-0 relative bg-gradient-to-br ${theme.gradient} px-6 pt-6 pb-5 space-y-4`}>

          {/* Botão de fechar */}
          <button
            onClick={handleClose}
            aria-label="Fechar"
            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white/90 backdrop-blur-md transition-all hover:bg-white/25 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Linha superior: logo + categoria + título */}
          <div className="flex items-center gap-3 pr-10">
            <div className="flex items-center justify-center shrink-0 overflow-hidden rounded-xl bg-white/90 p-1 shadow-md ring-1 ring-white/40">
              <img src="/logo.png" alt="Viagg-TX8" className="w-11 h-11 rounded-lg object-contain" />
            </div>
            <div className="min-w-0">
              <p className={`text-[10px] font-black uppercase tracking-widest ${theme.accent}`}>{theme.label}</p>
              <DialogTitle className="text-white font-black text-lg leading-tight">
                {listingTitle ? "Tenho Interesse" : "Demonstrar Interesse"}
              </DialogTitle>
              {listingTitle && (
                <p className="text-white/85 text-xs font-semibold leading-snug line-clamp-1 mt-0.5">{listingTitle}</p>
              )}
            </div>
          </div>

          {/* Mini card do anúncio (thumbnail + chips) */}
          {(listingMeta?.image || (listingMeta?.chips && listingMeta.chips.length > 0)) && (
            <div className="bg-white/90 border border-white/40 rounded-2xl overflow-hidden shadow-sm">
              {listingMeta?.image && (
                <div className="w-full h-28 bg-zinc-100 overflow-hidden">
                  <img
                    src={listingMeta.image}
                    alt={listingTitle}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              {listingMeta?.chips && listingMeta.chips.length > 0 && (
                <div className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {listingMeta.chips.map((chip, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-zinc-900/8 text-zinc-700 border border-zinc-200"
                        style={chip.color ? { backgroundColor: chip.color + "18", borderColor: chip.color + "44", color: chip.color } : undefined}
                      >
                        {chip.icon}
                        {chip.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-orange-50 text-zinc-900">

          {/* ── Estado de Sucesso ── */}
          {submitted ? (
            <div className="flex flex-col items-center text-center space-y-5 px-8 py-10">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center">
                  <ShieldCheck className="w-9 h-9 text-emerald-500" />
                </div>
                <Sparkles className="w-5 h-5 text-orange-400 absolute -top-1 -right-2 animate-bounce" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-orange-600 tracking-tight">Interesse Enviado!</h3>
                <p className="text-zinc-600 text-sm leading-relaxed max-w-xs mx-auto">
                  O anunciante recebeu sua mensagem e entrará em contato em breve.
                </p>
              </div>
              <div className="w-full bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
                <p className="text-xs font-semibold text-emerald-700 text-left leading-snug">
                  Seus dados estão protegidos e não serão compartilhados sem autorização.
                </p>
              </div>
              <Button
                onClick={handleClose}
                className="w-full h-12 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black uppercase text-xs tracking-widest transition-colors"
              >
                Fechar
              </Button>
              {listingModule === "travel" && user && (
                <button
                  onClick={() => { handleClose(); window.location.href = "/viagens/minha-conta"; }}
                  className="text-xs text-orange-600 font-bold underline underline-offset-2"
                >
                  Ver meus interesses →
                </button>
              )}
            </div>

          ) : (
            /* ── Formulário ── */
            <div className="px-6 py-6 space-y-4">

              <p className="text-zinc-600 text-[13px] leading-relaxed">
                Preencha seus dados e o anunciante entrará em contato com você.
              </p>

              {/* Nome */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] font-black text-orange-700 uppercase tracking-widest">
                  <User className="w-3 h-3" /> Seu nome <span className="text-orange-500">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <Input
                    placeholder="Nome completo"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    className="pl-10 h-12 rounded-xl border-orange-200 bg-white focus-visible:ring-2 focus-visible:ring-orange-400/30 focus-visible:border-orange-400 font-medium text-zinc-900 placeholder:text-zinc-400 shadow-sm transition-all"
                  />
                </div>
              </div>

              {/* Telefone / WhatsApp */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] font-black text-orange-700 uppercase tracking-widest">
                  <Phone className="w-3 h-3" /> WhatsApp / Telefone <span className="text-orange-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <Input
                    placeholder="(00) 00000-0000"
                    value={form.phone}
                    onChange={(e) => update("phone", maskPhone(e.target.value))}
                    className="pl-10 h-12 rounded-xl border-orange-200 bg-white focus-visible:ring-2 focus-visible:ring-orange-400/30 focus-visible:border-orange-400 font-medium text-zinc-900 placeholder:text-zinc-400 shadow-sm transition-all"
                    inputMode="tel"
                  />
                </div>
              </div>

              {/* E-mail */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] font-black text-orange-700 uppercase tracking-widest">
                  <Mail className="w-3 h-3" /> E-mail <span className="text-orange-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <Input
                    type="email"
                    placeholder="voce@email.com"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    className="pl-10 h-12 rounded-xl border-orange-200 bg-white focus-visible:ring-2 focus-visible:ring-orange-400/30 focus-visible:border-orange-400 font-medium text-zinc-900 placeholder:text-zinc-400 shadow-sm transition-all"
                    inputMode="email"
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Mensagem Opcional */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] font-black text-orange-700 uppercase tracking-widest">
                  <MessageSquare className="w-3 h-3" /> Mensagem <span className="text-zinc-500 normal-case font-medium">(opcional)</span>
                </label>
                <div className="relative">
                  <Textarea
                    placeholder="Ex: Gostaria de mais informações sobre disponibilidade..."
                    value={form.message}
                    onChange={(e) => update("message", e.target.value)}
                    maxLength={400}
                    className="min-h-[100px] rounded-xl border-orange-200 bg-white focus-visible:ring-2 focus-visible:ring-orange-400/30 focus-visible:border-orange-400 font-medium text-zinc-900 placeholder:text-zinc-400 shadow-sm resize-none transition-all"
                  />
                </div>
                <p className="text-right text-[10px] text-zinc-400 tabular-nums">{form.message.length}/400</p>
              </div>

              {/* Erro */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-bold text-red-600">{error}</p>
                </div>
              )}

              {/* Privacidade + Botão */}
              <div className="space-y-4 pt-2">
                <div className="flex items-start gap-2.5 bg-white border border-orange-200 rounded-2xl px-4 py-3 shadow-sm">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-zinc-600 leading-relaxed">
                    Seus dados são protegidos. Você não será adicionado a listas de email ou grupos sem autorização.
                  </p>
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={!isValid || isLoading}
                  className="w-full h-14 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-black uppercase text-sm tracking-widest shadow-lg shadow-orange-500/25 transition-all disabled:opacity-50 disabled:from-zinc-200 disabled:to-zinc-300 disabled:text-zinc-400 disabled:shadow-none disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <span className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Enviar Interesse
                    </span>
                  )}
                </Button>

                <p className="text-center text-[10px] text-zinc-500">
                  O anunciante verá sua mensagem após verificação da plataforma.
                </p>
              </div>
            </div>
          )}

          {/* ── Aviso de responsabilidade (acima do rodapé, visual integrado) ── */}
          <div className="px-6 pb-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 space-y-1.5 shadow-sm">
              <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Importante
              </p>
              <p className="text-[11px] text-amber-800/90 leading-relaxed">
                A Viagg-TX8 é uma plataforma de divulgação e conexão entre compradores e
                vendedores. A plataforma apresenta os anúncios, mas{" "}
                <strong className="font-black">não intermedeia pagamentos, entregas ou negociações</strong>.
                A responsabilidade pela negociação é exclusivamente das partes envolvidas.
              </p>
            </div>
          </div>

          {/* ── Faixa institucional ── */}
          <div className="bg-zinc-900 px-5 py-3 text-center space-y-1">
            <p className="flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white">
              <ShieldCheck className="w-3.5 h-3.5 text-[#68c7f2] shrink-0" />
              VIAGG-TX8 • Plataforma de conexão entre compradores e vendedores
            </p>
            <p className="text-[10px] text-white/70 leading-snug">
              A plataforma apresenta o produto. A negociação acontece diretamente entre
              comprador e vendedor.
            </p>
          </div>
        </div>

        {/* ── Rodapé Oficial Viagg-TX8 (componente único do sistema; fixo na base) ── */}
        <div className="shrink-0">
          <GlobalFooter
            compact
            label="Compradores & Vendedores"
            links={[
              { label: "Política de Privacidade", to: "/privacidade" },
              { label: "Termos de Uso", to: "/terms" },
              { label: "Central de Ajuda", to: "/suporte" },
              { label: "Contato", to: "/suporte/novo" },
            ]}
            version="Todos os direitos reservados."
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
