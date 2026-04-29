/**
 * MerchantPaymentSettings — Direct payment configuration for the store
 *
 * The platform does NOT process payments. The store registers its
 * own payment details (PIX, bank, etc.) and consumers pay directly.
 */
import { useState, useEffect } from "react";
import {
  QrCode, Banknote, CreditCard, Building2,
  Save, Loader2, Settings, ToggleLeft, ToggleRight,
  ChevronLeft, AlertCircle, Phone, FileText,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useStorePaymentSettings, StorePaymentSettings } from "@/hooks/useStorePaymentSettings";
import { useNavigate } from "react-router-dom";

// ─── Toggle Switch ──────────────────────
function ToggleSwitch({ label, description, enabled, onChange, icon: Icon }: {
  label: string;
  description?: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
  icon?: typeof QrCode;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
        enabled
          ? "border-blue-200 bg-blue-50/50"
          : "border-gray-100 bg-white hover:border-gray-200"
      }`}
    >
      {Icon && (
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          enabled ? "bg-blue-100" : "bg-gray-100"
        }`}>
          <Icon className={`h-5 w-5 ${enabled ? "text-blue-600" : "text-gray-400"}`} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold ${enabled ? "text-gray-800" : "text-gray-600"}`}>
          {label}
        </p>
        {description && (
          <p className="text-[11px] text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
      {enabled ? (
        <ToggleRight className="h-6 w-6 text-blue-600 shrink-0" />
      ) : (
        <ToggleLeft className="h-6 w-6 text-gray-300 shrink-0" />
      )}
    </button>
  );
}

const PIX_KEY_TYPES = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "Email" },
  { value: "telefone", label: "Telefone" },
  { value: "aleatoria", label: "Chave Aleatória" },
];

// ─── Main Component ─────────────────────
export default function MerchantPaymentSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [storeId, setStoreId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await (supabase.from("merchant_stores") as any)
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (data) setStoreId(data.id);
    })();
  }, [user?.id]);

  const { settings, isLoading, save, isSaving } = useStorePaymentSettings(storeId);
  const [form, setForm] = useState<Partial<StorePaymentSettings>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (settings && !initialized) {
      setForm({ ...settings });
      setInitialized(true);
    }
  }, [settings, initialized]);

  const update = (key: keyof StorePaymentSettings, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    await save(form);
  };

  if (isLoading || !storeId) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF6A00] mb-3" />
        <p className="text-sm text-gray-400">Carregando configurações...</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-24 lg:px-10 xl:px-16 max-w-2xl w-full mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/merchant")}
          className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
          <Settings className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">Formas de Pagamento</h1>
          <p className="text-xs text-white/50">Defina como sua loja recebe pagamentos</p>
        </div>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 bg-blue-50 rounded-xl p-3 mb-6">
        <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-[11px] text-blue-600 leading-relaxed">
          A plataforma <b>não processa pagamentos</b>. Os dados que você cadastrar aqui serão exibidos
          ao comprador para que ele pague <b>diretamente para a sua loja</b>.
        </p>
      </div>

      {/* ═══ PIX DIRETO ═══ */}
      <div className="space-y-3 mb-6">
        <p className="text-xs font-bold text-white/40 uppercase tracking-wider px-1">PIX Direto</p>
        <ToggleSwitch
          label="Aceitar PIX"
          description="O comprador poderá ver sua chave PIX e pagar diretamente"
          enabled={!!form.accepts_direct_pix}
          onChange={(v) => update("accepts_direct_pix", v)}
          icon={QrCode}
        />
      </div>

      {form.accepts_direct_pix && (
        <div className="bg-white rounded-xl p-4 border border-gray-100 mb-6 space-y-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
            <QrCode className="h-3.5 w-3.5" /> Dados do PIX
          </p>

          {/* Key type */}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Tipo da Chave</label>
            <div className="flex flex-wrap gap-2">
              {PIX_KEY_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => update("pix_key_type", t.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    form.pix_key_type === t.value
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Key */}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Chave PIX</label>
            <input
              type="text"
              value={form.pix_key || ""}
              onChange={(e) => update("pix_key", e.target.value)}
              placeholder="Sua chave PIX"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Holder name */}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Nome do Favorecido</label>
            <input
              type="text"
              value={form.pix_holder_name || ""}
              onChange={(e) => update("pix_holder_name", e.target.value)}
              placeholder="Nome que aparece no PIX"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Holder document */}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">CPF/CNPJ do Favorecido</label>
            <input
              type="text"
              value={form.pix_holder_document || ""}
              onChange={(e) => update("pix_holder_document", e.target.value)}
              placeholder="000.000.000-00"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Bank */}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Banco</label>
            <input
              type="text"
              value={form.bank_name || ""}
              onChange={(e) => update("bank_name", e.target.value)}
              placeholder="Ex: Nubank, Itaú, Bradesco"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>
      )}

      {/* ═══ OUTRAS FORMAS ═══ */}
      <div className="space-y-3 mb-6">
        <p className="text-xs font-bold text-white/40 uppercase tracking-wider px-1">Outras Formas</p>
        <ToggleSwitch
          label="Transferência Bancária"
          description="Aceita TED/DOC"
          enabled={!!form.accepts_bank_transfer}
          onChange={(v) => update("accepts_bank_transfer", v)}
          icon={Building2}
        />
        <ToggleSwitch
          label="Cartão na Loja"
          description="Aceita cartão de crédito/débito presencialmente"
          enabled={!!form.accepts_card_on_site}
          onChange={(v) => update("accepts_card_on_site", v)}
          icon={CreditCard}
        />
        <ToggleSwitch
          label="Pagamento Presencial"
          description="Aceita dinheiro e pagamento na retirada"
          enabled={form.accepts_in_store_payment !== false}
          onChange={(v) => update("accepts_in_store_payment", v)}
          icon={Banknote}
        />
      </div>

      {/* ═══ CONTATO E INSTRUÇÕES ═══ */}
      <div className="space-y-3 mb-6">
        <p className="text-xs font-bold text-white/40 uppercase tracking-wider px-1">Contato e Instruções</p>

        <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 flex items-center gap-1">
              <Phone className="h-3 w-3" /> WhatsApp da Loja
            </label>
            <input
              type="tel"
              value={form.store_whatsapp || ""}
              onChange={(e) => update("store_whatsapp", e.target.value)}
              placeholder="(00) 00000-0000"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 flex items-center gap-1">
              <FileText className="h-3 w-3" /> Instruções de Pagamento
            </label>
            <textarea
              value={form.payment_instructions || ""}
              onChange={(e) => update("payment_instructions", e.target.value)}
              placeholder="Ex: Após pagar via PIX, envie o comprovante no WhatsApp da loja."
              rows={3}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-blue-500 transition-colors resize-none"
            />
          </div>
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full py-4 bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] text-white font-bold rounded-xl text-base shadow-lg hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isSaving ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Salvando...
          </>
        ) : (
          <>
            <Save className="h-5 w-5" />
            Salvar Formas de Pagamento
          </>
        )}
      </button>
    </div>
  );
}
