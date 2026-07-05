/**
 * OperatorServicePicker
 * Formulário para criação/edição de um slot de auto-promoção de operador.
 * Usado dentro de OperatorPromotionPage — funciona para driver, mototaxi e motoboy.
 */

import { useState } from "react";
import { X, Plus, MapPin, Clock, DollarSign, Phone, Tag } from "lucide-react";
import type { OperatorProfileType } from "@/lib/ai/postadorBridge";
import type { ServiceCategory, CreateSlotInput } from "@/hooks/useOperatorPromotion";

interface Props {
  profileType:  OperatorProfileType;
  categories:   ServiceCategory[];
  onSave:       (input: CreateSlotInput) => Promise<{ ok: boolean; error?: string }>;
  onCancel:     () => void;
  loading?:     boolean;
}

const DAYS = [
  { key: "seg", label: "Seg" },
  { key: "ter", label: "Ter" },
  { key: "qua", label: "Qua" },
  { key: "qui", label: "Qui" },
  { key: "sex", label: "Sex" },
  { key: "sab", label: "Sáb" },
  { key: "dom", label: "Dom" },
];

export function OperatorServicePicker({ profileType, categories, onSave, onCancel, loading }: Props) {
  const [form, setForm] = useState<{
    service_type:       string;
    title:              string;
    description:        string;
    coverage_city:      string;
    coverage_state:     string;
    price_from:         string;
    price_to:           string;
    whatsapp:           string;
    availability_days:  string[];
    hour_start:         string;
    hour_end:           string;
  }>({
    service_type:      categories[0]?.service_type ?? "",
    title:             "",
    description:       "",
    coverage_city:     "",
    coverage_state:    "",
    price_from:        "",
    price_to:          "",
    whatsapp:          "",
    availability_days: ["seg","ter","qua","qui","sex"],
    hour_start:        "08:00",
    hour_end:          "18:00",
  });

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggle(day: string) {
    setForm(f => ({
      ...f,
      availability_days: f.availability_days.includes(day)
        ? f.availability_days.filter(d => d !== day)
        : [...f.availability_days, day],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("Título é obrigatório"); return; }
    if (!form.service_type)  { setError("Selecione o tipo de serviço"); return; }
    setError(null);
    setSaving(true);
    const result = await onSave({
      profile_type:        profileType,
      service_type:        form.service_type,
      title:               form.title.trim(),
      description:         form.description.trim()  || undefined,
      coverage_city:       form.coverage_city.trim() || undefined,
      coverage_state:      form.coverage_state.trim() || undefined,
      price_from:          form.price_from ? parseFloat(form.price_from) : undefined,
      price_to:            form.price_to   ? parseFloat(form.price_to)   : undefined,
      whatsapp:            form.whatsapp.trim() || undefined,
      availability_days:   form.availability_days,
      availability_hours:  { start: form.hour_start, end: form.hour_end },
    });
    setSaving(false);
    if (!result.ok) setError(result.error ?? "Erro ao salvar");
  }

  const inp = "w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const lbl = "block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Tipo de serviço */}
      <div>
        <label className={lbl}><Tag size={12} className="inline mr-1" />Tipo de Serviço</label>
        <select
          className={inp}
          value={form.service_type}
          onChange={e => setForm(f => ({ ...f, service_type: e.target.value }))}
        >
          <option value="">Selecione...</option>
          {categories.map(c => (
            <option key={c.service_type} value={c.service_type}>
              {c.icon} {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Título */}
      <div>
        <label className={lbl}>Título do Anúncio *</label>
        <input
          className={inp}
          placeholder="Ex: Corridas com A/C no centro da cidade"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          maxLength={120}
        />
      </div>

      {/* Descrição */}
      <div>
        <label className={lbl}>Descrição</label>
        <textarea
          className={inp}
          placeholder="Detalhe seu serviço, diferenciais, áreas atendidas..."
          rows={3}
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          maxLength={400}
        />
      </div>

      {/* Cobertura */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}><MapPin size={12} className="inline mr-1" />Cidade</label>
          <input
            className={inp}
            placeholder="Ex: São Paulo"
            value={form.coverage_city}
            onChange={e => setForm(f => ({ ...f, coverage_city: e.target.value }))}
          />
        </div>
        <div>
          <label className={lbl}>Estado</label>
          <input
            className={inp}
            placeholder="SP"
            maxLength={2}
            value={form.coverage_state}
            onChange={e => setForm(f => ({ ...f, coverage_state: e.target.value.toUpperCase() }))}
          />
        </div>
      </div>

      {/* Preço */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}><DollarSign size={12} className="inline mr-1" />Preço a partir de (R$)</label>
          <input
            className={inp}
            type="number"
            min="0"
            step="0.01"
            placeholder="0,00"
            value={form.price_from}
            onChange={e => setForm(f => ({ ...f, price_from: e.target.value }))}
          />
        </div>
        <div>
          <label className={lbl}>Preço máximo (R$)</label>
          <input
            className={inp}
            type="number"
            min="0"
            step="0.01"
            placeholder="0,00"
            value={form.price_to}
            onChange={e => setForm(f => ({ ...f, price_to: e.target.value }))}
          />
        </div>
      </div>

      {/* WhatsApp */}
      <div>
        <label className={lbl}><Phone size={12} className="inline mr-1" />WhatsApp para contato</label>
        <input
          className={inp}
          placeholder="(11) 99999-9999"
          value={form.whatsapp}
          onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
        />
      </div>

      {/* Dias disponíveis */}
      <div>
        <label className={lbl}><Clock size={12} className="inline mr-1" />Dias de Atendimento</label>
        <div className="flex gap-1 flex-wrap">
          {DAYS.map(d => (
            <button
              key={d.key}
              type="button"
              onClick={() => toggle(d.key)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                form.availability_days.includes(d.key)
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Horário */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Horário início</label>
          <input
            className={inp}
            type="time"
            value={form.hour_start}
            onChange={e => setForm(f => ({ ...f, hour_start: e.target.value }))}
          />
        </div>
        <div>
          <label className={lbl}>Horário fim</label>
          <input
            className={inp}
            type="time"
            value={form.hour_end}
            onChange={e => setForm(f => ({ ...f, hour_end: e.target.value }))}
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <X size={12} /> {error}
        </p>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={saving || loading}
          className="flex-1 flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          {saving ? "Salvando..." : "Salvar Serviço"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
