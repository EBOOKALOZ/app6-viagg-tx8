/**
 * VisitorMiniSignup — Lightweight visitor registration component
 *
 * Premium, mobile-first form with 4 mandatory accepts.
 * Reusable across CESTA1, perguntas, leilão, arremate.
 * If visitor already registered, shows compact summary with edit option.
 */
import { useState } from "react";
import { User, Phone, Mail, MapPin, Building2, Loader2, ChevronDown, ChevronUp, CheckCircle, Edit3 } from "lucide-react";
import { VisitorProfile, useVisitorProfile } from "@/hooks/useVisitorProfile";

interface Props {
  visitor: ReturnType<typeof useVisitorProfile>;
  onComplete: (profile: VisitorProfile) => void;
  storeName?: string;
  isSubmitting?: boolean;
  cartSummaryNode?: React.ReactNode;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function AcceptCheckbox({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const borderColor = checked
    ? "border-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]"
    : expanded
      ? "border-amber-200/80 shadow-[0_0_0_1px_rgba(245,158,11,0.06)]"
      : "border-gray-100 hover:border-gray-200";

  const bgColor = checked
    ? "bg-gradient-to-br from-emerald-50/40 to-white"
    : expanded
      ? "bg-gradient-to-br from-amber-50/30 to-white"
      : "bg-white";

  return (
    <div className={`rounded-2xl border transition-all duration-300 overflow-hidden ${borderColor} ${bgColor}`}
      style={{ boxShadow: checked ? '0 1px 3px rgba(16,185,129,0.06)' : expanded ? '0 1px 3px rgba(245,158,11,0.04)' : '0 1px 2px rgba(0,0,0,0.03)' }}
    >
      <div className="flex items-start gap-3.5 p-4">
        {/* Checkbox — independent click */}
        <button
          type="button"
          aria-label={checked ? "Desmarcar aceite" : "Marcar aceite"}
          onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
          className={`w-[22px] h-[22px] rounded-lg border-2 flex items-center justify-center shrink-0 mt-[1px] transition-all duration-200 ${
            checked
              ? "border-emerald-500 bg-emerald-500 shadow-sm shadow-emerald-200"
              : "border-gray-300 hover:border-gray-400 bg-white"
          }`}
        >
          {checked && (
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* Title + expand toggle */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-start justify-between gap-3 text-left min-h-[24px]"
        >
          <span className={`text-[13px] leading-[1.5] transition-colors duration-200 ${
            checked ? "text-gray-800 font-semibold" : "text-gray-600 font-medium"
          }`}>
            {label}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 mt-1 transition-all duration-300 ${
            expanded ? "rotate-180 text-amber-500" : checked ? "text-emerald-400" : "text-gray-300"
          }`} />
        </button>
      </div>

      {/* Expandable description */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
        expanded ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
      }`}>
        <div className="mx-4 mb-4 ml-[54px] pt-3 border-t border-gray-100">
          <p className="text-[12px] text-gray-500 leading-[1.7] font-normal">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

export function VisitorMiniSignup({ visitor, onComplete, storeName, isSubmitting = false, cartSummaryNode }: Props) {
  const { profile, update, save, isSaving, hasProfile } = visitor;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);

  // If already registered, show compact summary
  if (hasProfile && !isEditing) {
    return (
      <div className="space-y-3">
        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-700">Dados confirmados</p>
                <p className="text-[10px] text-emerald-500">Mini-cadastro ativo</p>
              </div>
            </div>
            <button
              onClick={() => setIsEditing(true)}
              className="text-emerald-600 hover:text-emerald-700 transition-colors p-1"
            >
              <Edit3 className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1 text-xs text-emerald-700">
            <p className="flex items-center gap-1.5"><User className="h-3 w-3" /> {profile.full_name}</p>
            <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {profile.whatsapp}</p>
            {profile.email && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> {profile.email}</p>}
            {(profile.bairro || profile.city) && (
              <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {[profile.bairro, profile.city].filter(Boolean).join(", ")}</p>
            )}
          </div>
          {cartSummaryNode && (
            <div className="mt-3 pt-3 border-t border-emerald-200/60">
              {cartSummaryNode}
            </div>
          )}
        </div>
        <button
          onClick={() => onComplete(profile)}
          disabled={isSubmitting}
          className="w-full py-3.5 bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] text-white font-bold rounded-xl text-sm shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</>
          ) : (
            <>Eu Quero esses Produtos</>
          )}
        </button>
      </div>
    );
  }

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!profile.full_name.trim()) errs.name = "Nome é obrigatório";
    const digits = profile.whatsapp.replace(/\D/g, "");
    if (digits.length < 10) errs.whatsapp = "WhatsApp inválido";
    if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) errs.email = "Email inválido";
    if (!profile.accepted_terms) errs.terms = "Aceite obrigatório";
    if (!profile.accepted_privacy) errs.privacy = "Aceite obrigatório";
    if (!profile.accepted_direct_payment) errs.payment = "Aceite obrigatório";
    if (!profile.accepted_store_contact) errs.contact = "Aceite obrigatório";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate() || isSaving || isSubmitting) return;
        try {
          const saved = await save(profile);
          setIsEditing(false);
          await onComplete(saved);
        } catch { /* handled by hook */ }
      };

  const allAccepted = profile.accepted_terms && profile.accepted_privacy &&
    profile.accepted_direct_payment && profile.accepted_store_contact;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Header */}
      <div className="text-center pb-1">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FF6A00] to-[#FF8C00] flex items-center justify-center mx-auto mb-2 shadow-lg">
          <User className="h-6 w-6 text-white" />
        </div>
        <h3 className="text-lg font-black text-gray-800">Seus Dados</h3>
        <p className="text-xs text-gray-400 mt-0.5">Identificação leve para enviar sua intenção</p>
      </div>

      {/* Name */}
      <div>
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
          Nome Completo *
        </label>
        <div className="relative">
          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
          <input
            type="text"
            value={profile.full_name}
            onChange={(e) => update("full_name", e.target.value)}
            placeholder="Como o vendedor deve te chamar?"
            className={`w-full pl-11 pr-4 py-3 border-2 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm font-medium focus:outline-none transition-colors ${
              errors.name ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-[#FF6A00]"
            }`}
          />
        </div>
        {errors.name && <p className="text-[11px] text-red-500 mt-1">{errors.name}</p>}
      </div>

      {/* WhatsApp */}
      <div>
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
          WhatsApp *
        </label>
        <div className="relative">
          <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
          <input
            type="tel"
            value={profile.whatsapp}
            onChange={(e) => update("whatsapp", formatPhone(e.target.value))}
            placeholder="(00) 00000-0000"
            className={`w-full pl-11 pr-4 py-3 border-2 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm font-medium focus:outline-none transition-colors ${
              errors.whatsapp ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-[#FF6A00]"
            }`}
          />
        </div>
        {errors.whatsapp && <p className="text-[11px] text-red-500 mt-1">{errors.whatsapp}</p>}
      </div>

      {/* Email */}
      <div>
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
          Email <span className="text-gray-300">(opcional)</span>
        </label>
        <div className="relative">
          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
          <input
            type="email"
            value={profile.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="seu@email.com"
            className={`w-full pl-11 pr-4 py-3 border-2 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm font-medium focus:outline-none transition-colors ${
              errors.email ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-[#FF6A00]"
            }`}
          />
        </div>
        {errors.email && <p className="text-[11px] text-red-500 mt-1">{errors.email}</p>}
      </div>

      {/* Bairro + Cidade */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
            Bairro <span className="text-gray-300">(opc.)</span>
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
            <input
              type="text"
              value={profile.bairro}
              onChange={(e) => update("bairro", e.target.value)}
              placeholder="Seu bairro"
              className="w-full pl-10 pr-3 py-3 border-2 border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm font-medium focus:outline-none focus:border-[#FF6A00] transition-colors"
            />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
            Cidade <span className="text-gray-300">(opc.)</span>
          </label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
            <input
              type="text"
              value={profile.city}
              onChange={(e) => update("city", e.target.value)}
              placeholder="Sua cidade"
              className="w-full pl-10 pr-3 py-3 border-2 border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm font-medium focus:outline-none focus:border-[#FF6A00] transition-colors"
            />
          </div>
        </div>
      </div>

      {/* ═══ Premium Confirmations Section ═══ */}
      <div className="rounded-2xl bg-gradient-to-b from-gray-50/80 to-white border border-gray-100 overflow-hidden"
        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
      >
        {/* Section Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h4 className="text-[13px] font-bold text-gray-800 tracking-wide">Confirmações obrigatórias</h4>
              <p className="text-[11px] text-gray-400 font-normal">Leia com atenção antes de continuar seu pedido</p>
            </div>
          </div>
          <p className="text-[10.5px] text-gray-400 mt-2 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-gray-300 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            Essas confirmações ajudam a garantir mais transparência entre você e a loja.
          </p>
        </div>

        {/* Transparency Block */}
        <div className="mx-4 mb-3 rounded-xl bg-amber-50/60 border border-amber-100/80 px-4 py-3">
          <p className="text-[11px] text-amber-700/90 leading-[1.65] font-normal">
            Você está enviando uma intenção de compra para uma loja da sua região. A plataforma atua como vitrine e canal de organização do pedido. O pagamento é combinado e realizado diretamente com a loja. A plataforma não intermedeia nem processa pagamentos.
          </p>
        </div>

        {/* Checkbox Cards */}
        <div className="px-4 pb-3 space-y-2.5">
          <AcceptCheckbox
            label="Li e aceito os Termos de Uso da plataforma"
            description="Ao continuar, você declara que leu e concorda com as regras gerais de uso da plataforma, incluindo o envio de intenção de compra, uso responsável dos dados informados e funcionamento do contato entre consumidor e loja."
            checked={profile.accepted_terms}
            onChange={(v) => update("accepted_terms", v)}
          />
          <AcceptCheckbox
            label="Li e aceito a Política de Privacidade"
            description="Seus dados serão utilizados para registrar sua intenção de compra e permitir o contato da loja sobre este pedido, conforme as regras de privacidade da plataforma."
            checked={profile.accepted_privacy}
            onChange={(v) => update("accepted_privacy", v)}
          />
          <AcceptCheckbox
            label="Entendo que esta plataforma atua como vitrine e canal de contato, e que o pagamento será feito diretamente com a loja"
            description="A plataforma atua como vitrine e canal de organização da intenção de compra, conectando consumidores e lojas da mesma região, bairro ou cidade quando aplicável. O pagamento dos produtos será tratado diretamente com a loja, conforme as opções informadas por ela. A plataforma não intermedeia, não garante nem processa esse pagamento."
            checked={profile.accepted_direct_payment}
            onChange={(v) => update("accepted_direct_payment", v)}
          />
          <AcceptCheckbox
            label="Autorizo a loja a entrar em contato comigo via WhatsApp sobre este pedido"
            description="Ao aceitar esta opção, você autoriza a loja a entrar em contato pelo WhatsApp informado para confirmar itens, disponibilidade, valores, retirada, entrega ou outras informações relacionadas ao pedido."
            checked={profile.accepted_store_contact}
            onChange={(v) => update("accepted_store_contact", v)}
          />
        </div>

        {/* Section Footer */}
        <div className="px-5 py-3 bg-gray-50/60 border-t border-gray-100/80">
          <p className="text-[10px] text-gray-400 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-gray-300 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
              <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
            </svg>
            Pagamento e condições da compra são tratados diretamente com a loja.
          </p>
        </div>
      </div>

      {/* Submit */}
       <button
         type="submit"
         disabled={isSaving || isSubmitting || !allAccepted || !profile.full_name.trim() || profile.whatsapp.replace(/\D/g, "").length < 10}
         className="w-full py-4 bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] text-white font-bold rounded-xl text-base shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
       >
         {(isSaving || isSubmitting) ? (
           <><Loader2 className="h-5 w-5 animate-spin" /> Processando...</>
         ) : (
           <>Eu Quero esses Produtos</>
         )}
       </button>
    </form>
  );
}
