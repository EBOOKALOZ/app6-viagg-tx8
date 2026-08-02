/**
 * PartnerLeadModal — "Quero ser parceiro" (Comando Convênio).
 * Modal de captação de leads interessados no programa de convênios,
 * acionado pelo CTA da página pública /medprev. Grava em
 * convenio_partner_leads (RLS: insert público, leitura restrita ao Gestor).
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HeartHandshake, Loader2, CheckCircle, X } from "lucide-react";
import { toast } from "sonner";

interface PartnerLeadModalProps {
  open: boolean;
  onClose: () => void;
}

const PARTNER_TYPES: { value: string; label: string }[] = [
  { value: "hospital", label: "Hospital" },
  { value: "clinica", label: "Clínica" },
  { value: "laboratorio", label: "Laboratório" },
  { value: "farmacia", label: "Farmácia" },
  { value: "consultorio", label: "Consultório" },
  { value: "plano_saude", label: "Plano de Saúde" },
  { value: "empresa", label: "Empresa" },
  { value: "associacao", label: "Associação" },
  { value: "ong", label: "ONG" },
  { value: "outro", label: "Outro" },
];

const UF_LIST = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

function formatWhatsapp(value: string): string {
  const nums = value.replace(/\D/g, "").slice(0, 11);
  if (nums.length <= 2) return nums;
  if (nums.length <= 7) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`;
  return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`;
}

function isValidWhatsapp(value: string): boolean {
  const nums = value.replace(/\D/g, "");
  return nums.length >= 10 && nums.length <= 11;
}

function isValidEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

const initialState = {
  nome: "",
  instituicao: "",
  tipoParceiro: "",
  cidade: "",
  estado: "",
  whatsapp: "",
  email: "",
  mensagem: "",
  consentimento: false,
};

export function PartnerLeadModal({ open, onClose }: PartnerLeadModalProps) {
  const [form, setForm] = useState(initialState);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const lastSubmitAt = useRef<number>(0);

  useEffect(() => {
    if (!open) {
      setForm(initialState);
      setTouched({});
      setSubmitted(false);
    }
  }, [open]);

  useEffect(() => {
    if (!submitted) return;
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [submitted, onClose]);

  const errors = {
    nome: form.nome.trim().length < 2 ? "Informe seu nome completo" : "",
    tipoParceiro: !form.tipoParceiro ? "Selecione o tipo de parceiro" : "",
    cidade: form.cidade.trim().length < 2 ? "Informe a cidade" : "",
    estado: form.estado.length !== 2 ? "Selecione o estado" : "",
    whatsapp: !isValidWhatsapp(form.whatsapp) ? "Informe um WhatsApp válido com DDD" : "",
    email: form.email.trim() && !isValidEmail(form.email.trim()) ? "E-mail inválido" : "",
    consentimento: !form.consentimento ? "É necessário autorizar o contato" : "",
  };

  const isValid = Object.values(errors).every((e) => !e);

  const markTouched = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  const handleSubmit = async () => {
    setTouched({
      nome: true, tipoParceiro: true, cidade: true, estado: true,
      whatsapp: true, email: true, consentimento: true,
    });

    if (!isValid) {
      toast.error("Confira os campos obrigatórios do formulário");
      return;
    }

    const now = Date.now();
    if (now - lastSubmitAt.current < 4000) {
      return;
    }
    lastSubmitAt.current = now;

    setSubmitting(true);
    try {
      const { error } = await (supabase.from("convenio_partner_leads") as any).insert({
        nome: form.nome.trim(),
        instituicao: form.instituicao.trim() || null,
        tipo_parceiro: form.tipoParceiro,
        cidade: form.cidade.trim(),
        estado: form.estado,
        whatsapp: form.whatsapp.replace(/\D/g, ""),
        email: form.email.trim() || null,
        mensagem: form.mensagem.trim() || null,
        consentimento: true,
      });
      if (error) throw error;

      setSubmitted(true);
      toast.success("Solicitação enviada com sucesso!");
    } catch (err) {
      console.error("[PartnerLeadModal] error:", err);
      toast.error("Erro ao enviar solicitação. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent 
        className="sm:max-w-[480px] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-50/95 backdrop-blur-2xl border border-white/40 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.2)] rounded-3xl [&>button]:hidden"
        onEscapeKeyDown={(e) => { if (submitting) e.preventDefault(); }}
        onInteractOutside={(e) => { if (submitting) e.preventDefault(); }}
      >
        {/* Glowing orb background effect */}
        <div className="absolute top-[-20%] left-[-10%] w-[140%] h-[140%] bg-gradient-to-br from-blue-100/40 via-transparent to-emerald-100/40 pointer-events-none -z-10 blur-3xl" />

        {/* Cabeçalho */}
        <div className="shrink-0 relative bg-gradient-to-br from-blue-600 via-blue-600 to-emerald-500 px-5 pt-5 pb-4">
          <DialogClose asChild>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="absolute right-4 top-4 z-50 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white/90 backdrop-blur-md transition-all hover:bg-white/25 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogClose>
          <div className="flex items-center gap-3 pr-10 relative z-10">
            <div className="flex items-center justify-center shrink-0 overflow-hidden rounded-xl bg-white/90 p-1 shadow-md ring-1 ring-white/40 h-10 w-10">
              <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="h-full w-full object-contain rounded-lg" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">MedPrev</p>
              <DialogTitle className="text-white font-black text-lg leading-tight">
                Quero ser parceiro
              </DialogTitle>
              <p className="text-white/85 text-xs font-semibold leading-snug mt-0.5">
                Programa de Convênios Viagg-TX8
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {submitted ? (
            <div className="p-10 text-center space-y-5">
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 bg-emerald-400/20 rounded-full animate-ping" />
                <div className="relative flex items-center justify-center w-full h-full bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full shadow-lg shadow-emerald-500/30">
                  <CheckCircle className="h-10 w-10 text-white" />
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Solicitação enviada!</h2>
                <p className="text-sm text-slate-500 leading-relaxed mt-2 max-w-[280px] mx-auto">
                  Nossa equipe analisará seu cadastro e entrará em contato em breve para os próximos passos.
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-3.5 rounded-2xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 transition-all shadow-md active:scale-[0.98]"
              >
                Concluir
              </button>
            </div>
          ) : (
            <div className="p-6 space-y-4">
              <Field label="Nome completo" required error={touched.nome ? errors.nome : ""}>
                <input
                  type="text"
                  placeholder="Seu nome completo"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  onBlur={() => markTouched("nome")}
                  maxLength={150}
                  className={inputClass(touched.nome && !!errors.nome)}
                />
              </Field>

              <Field label="Instituição / Empresa">
                <input
                  type="text"
                  placeholder="Nome da instituição (opcional)"
                  value={form.instituicao}
                  onChange={(e) => setForm((f) => ({ ...f, instituicao: e.target.value }))}
                  maxLength={150}
                  className={inputClass(false)}
                />
              </Field>

              <Field label="Tipo de parceiro" required error={touched.tipoParceiro ? errors.tipoParceiro : ""}>
                <Select
                  value={form.tipoParceiro}
                  onValueChange={(v) => setForm((f) => ({ ...f, tipoParceiro: v }))}
                >
                  <SelectTrigger
                    onBlur={() => markTouched("tipoParceiro")}
                    className={inputClass(touched.tipoParceiro && !!errors.tipoParceiro)}
                  >
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-white/60 bg-white/90 backdrop-blur-xl shadow-xl">
                    {PARTNER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="rounded-xl focus:bg-blue-50">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="Cidade" required error={touched.cidade ? errors.cidade : ""}>
                    <input
                      type="text"
                      placeholder="Sua cidade"
                      value={form.cidade}
                      onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))}
                      onBlur={() => markTouched("cidade")}
                      maxLength={100}
                      className={inputClass(touched.cidade && !!errors.cidade)}
                    />
                  </Field>
                </div>
                <div>
                  <Field label="Estado" required error={touched.estado ? errors.estado : ""}>
                    <Select
                      value={form.estado}
                      onValueChange={(v) => setForm((f) => ({ ...f, estado: v }))}
                    >
                      <SelectTrigger
                        onBlur={() => markTouched("estado")}
                        className={inputClass(touched.estado && !!errors.estado)}
                      >
                        <SelectValue placeholder="UF" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-white/60 bg-white/90 backdrop-blur-xl shadow-xl">
                        {UF_LIST.map((uf) => (
                          <SelectItem key={uf} value={uf} className="rounded-xl focus:bg-blue-50">{uf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>

              <Field label="WhatsApp" required error={touched.whatsapp ? errors.whatsapp : ""}>
                <input
                  type="tel"
                  placeholder="(47) 99999-9999"
                  value={form.whatsapp}
                  onChange={(e) => setForm((f) => ({ ...f, whatsapp: formatWhatsapp(e.target.value) }))}
                  onBlur={() => markTouched("whatsapp")}
                  maxLength={15}
                  className={inputClass(touched.whatsapp && !!errors.whatsapp)}
                />
              </Field>

              <Field label="E-mail" error={touched.email ? errors.email : ""}>
                <input
                  type="email"
                  placeholder="voce@email.com (opcional)"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  onBlur={() => markTouched("email")}
                  maxLength={120}
                  className={inputClass(touched.email && !!errors.email)}
                />
              </Field>

              <Field label="Mensagem">
                <textarea
                  placeholder="Conte brevemente como gostaria de participar."
                  value={form.mensagem}
                  onChange={(e) => setForm((f) => ({ ...f, mensagem: e.target.value }))}
                  rows={3}
                  maxLength={1000}
                  className={`${inputClass(false)} resize-none py-3.5`}
                />
              </Field>

              <label className="flex items-start gap-3 pt-2 cursor-pointer select-none group">
                <div className="relative flex items-center justify-center shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={form.consentimento}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, consentimento: e.target.checked }));
                      markTouched("consentimento");
                    }}
                    className="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded-lg bg-white/50 checked:bg-blue-600 checked:border-blue-600 transition-all cursor-pointer focus:ring-4 focus:ring-blue-600/20"
                  />
                  <CheckCircle className="absolute w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                </div>
                <span className="text-[13px] text-slate-600 font-medium leading-snug group-hover:text-slate-800 transition-colors">
                  Autorizo o contato da equipe Viagg-TX8 para prosseguir com a parceria.
                </span>
              </label>
              {touched.consentimento && errors.consentimento && (
                <p className="text-[11px] text-red-500 font-bold ml-8">{errors.consentimento}</p>
              )}

              <div className="flex gap-3 pt-5 pb-2">
                <button
                  onClick={onClose}
                  disabled={submitting}
                  className="w-1/3 py-3.5 rounded-2xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-emerald-500 hover:opacity-90 transition-all active:scale-[0.98] shadow-[0_8px_20px_-6px_rgba(16,185,129,0.4)] disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {submitting ? "Enviando..." : "Enviar solicitação"}
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function inputClass(hasError: boolean): string {
  return [
    "w-full px-4 py-3.5 rounded-2xl border bg-white/60 backdrop-blur-md text-slate-800 placeholder:text-slate-400 text-sm font-medium outline-none transition-all duration-300 shadow-sm",
    hasError
      ? "border-red-400 bg-red-50/50 focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-500/15"
      : "border-slate-200 hover:bg-white/90 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/15",
  ].join(" ");
}

function Field({
  label, required, error, children,
}: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest pl-1">
        {label} {required && <span className="text-emerald-500">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-red-500 font-bold pl-1">{error}</p>}
    </div>
  );
}
