/**
 * OperatorPromotionPage
 * Página de auto-promoção para Motorista, Moto Táxi e Motoboy.
 * Um único componente aceita profileType como prop — sem código duplicado.
 * Usa o Motor Universal (Tier 2.1) para postar nos grupos WhatsApp.
 */

import { useState } from "react";
import {
  Plus, Send, Pause, Play, Trash2, ChevronRight,
  TrendingUp, Zap, MapPin, Clock, DollarSign, Star,
  Megaphone, AlertCircle, CheckCircle2, RefreshCw,
} from "lucide-react";
import { useOperatorPromotion } from "@/hooks/useOperatorPromotion";
import { OperatorServicePicker } from "@/components/operator/OperatorServicePicker";
import type { OperatorProfileType } from "@/lib/ai/postadorBridge";
import type { OperatorPromotionalSlot } from "@/hooks/useOperatorPromotion";

/* ── Configurações visuais por perfil ────────────────────────────────────── */
const PROFILE_CONFIG = {
  driver: {
    label:       "Motorista",
    color:       "amber",
    accent:      "bg-amber-500",
    ring:        "ring-amber-500",
    text:        "text-amber-600 dark:text-amber-400",
    badge:       "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
    description: "Divulgue suas corridas, viagens e serviços de transporte nos grupos locais",
  },
  mototaxi: {
    label:       "Moto Táxi",
    color:       "sky",
    accent:      "bg-sky-500",
    ring:        "ring-sky-500",
    text:        "text-sky-600 dark:text-sky-400",
    badge:       "bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300",
    description: "Anuncie suas corridas e atendimentos nos grupos da sua região",
  },
  motoboy: {
    label:       "Motoboy",
    color:       "emerald",
    accent:      "bg-emerald-500",
    ring:        "ring-emerald-500",
    text:        "text-emerald-600 dark:text-emerald-400",
    badge:       "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
    description: "Divulgue suas entregas, fretes e serviços express nos grupos locais",
  },
} as const;

interface Props {
  profileType: OperatorProfileType;
}

export default function OperatorPromotionPage({ profileType }: Props) {
  const cfg = PROFILE_CONFIG[profileType];
  const {
    slots, categories, summary, loading, posting, error,
    fetchSlots, createSlot, updateSlotStatus, postSlots,
  } = useOperatorPromotion(profileType);

  const [showForm, setShowForm]         = useState(false);
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [toast, setToast]               = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  function showToast(msg: string, type: "ok" | "err") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handlePost() {
    if (selected.size === 0) { showToast("Selecione pelo menos 1 serviço para postar", "err"); return; }
    const result = await postSlots(Array.from(selected));
    if (result.ok) {
      setSelected(new Set());
      showToast(`✅ Lote gerado! ID: ${result.lotId?.slice(0,8)}…`, "ok");
    } else {
      showToast(result.error ?? "Erro ao postar", "err");
    }
  }

  async function handleStatus(slot: OperatorPromotionalSlot, status: "active" | "paused" | "removed") {
    const result = await updateSlotStatus(slot.id, status);
    if (!result.ok) showToast(result.error ?? "Erro", "err");
    else showToast(
      status === "active"  ? "Serviço reativado" :
      status === "paused"  ? "Serviço pausado"   : "Serviço removido", "ok",
    );
  }

  const activeSlots  = slots.filter(s => s.status === "active");
  const pausedSlots  = slots.filter(s => s.status === "paused");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-24">

      {/* ── Header ── */}
      <div className={`${cfg.accent} px-4 pt-12 pb-6`}>
        <div className="flex items-center gap-2 mb-1">
          <Megaphone size={20} className="text-white" />
          <h1 className="text-white font-bold text-lg">Minha Divulgação</h1>
        </div>
        <p className="text-white/80 text-sm">{cfg.description}</p>
      </div>

      <div className="px-4 -mt-3 space-y-4">

        {/* ── KPI Summary ── */}
        {summary && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Ativos", value: summary.active_slots,         icon: <CheckCircle2 size={16} className={cfg.text} /> },
              { label: "Postagens", value: summary.total_posts ?? 0,  icon: <Send size={16} className={cfg.text} /> },
              { label: "Campanhas", value: summary.completed_campaigns ?? 0, icon: <Star size={16} className={cfg.text} /> },
            ].map(({ label, value, icon }) => (
              <div key={label} className="bg-white dark:bg-zinc-900 rounded-xl p-3 shadow-sm">
                <div className="flex items-center gap-1 mb-1">{icon}<span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span></div>
                <p className="font-bold text-xl text-zinc-900 dark:text-white">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
            <AlertCircle size={16} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* ── Botão Postar ── */}
        {selected.size > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-sm border border-zinc-100 dark:border-zinc-800">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
              <strong className={cfg.text}>{selected.size}</strong> serviço(s) selecionado(s)
            </p>
            <button
              onClick={handlePost}
              disabled={posting}
              className={`w-full flex items-center justify-center gap-2 ${cfg.accent} hover:opacity-90 disabled:opacity-60 text-white rounded-lg py-3 text-sm font-semibold transition-all`}
            >
              {posting ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
              {posting ? "Postando..." : "Postar Agora nos Grupos"}
            </button>
          </div>
        )}

        {/* ── Formulário ── */}
        {showForm ? (
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-sm border border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-zinc-900 dark:text-white">Novo Serviço</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>
            <OperatorServicePicker
              profileType={profileType}
              categories={categories}
              loading={loading}
              onCancel={() => setShowForm(false)}
              onSave={async (input) => {
                const result = await createSlot(input);
                if (result.ok) { setShowForm(false); showToast("Serviço criado com sucesso!", "ok"); }
                return result;
              }}
            />
          </div>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className={`w-full flex items-center justify-center gap-2 bg-white dark:bg-zinc-900 border-2 border-dashed ${cfg.ring.replace("ring","border")} rounded-xl py-4 text-sm font-medium ${cfg.text} hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors`}
          >
            <Plus size={18} /> Adicionar Novo Serviço
          </button>
        )}

        {/* ── Slots Ativos ── */}
        {loading ? (
          <div className="space-y-3">
            {[1,2].map(i => (
              <div key={i} className="h-20 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {activeSlots.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Serviços Ativos ({activeSlots.length})
                  </h2>
                  <button
                    onClick={fetchSlots}
                    className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1"
                  >
                    <RefreshCw size={11} /> Atualizar
                  </button>
                </div>
                <div className="space-y-2">
                  {activeSlots.map(slot => (
                    <SlotCard
                      key={slot.id}
                      slot={slot}
                      cfg={cfg}
                      selected={selected.has(slot.id)}
                      onSelect={() => toggleSelect(slot.id)}
                      onPause={() => handleStatus(slot, "paused")}
                      onRemove={() => handleStatus(slot, "removed")}
                    />
                  ))}
                </div>
              </div>
            )}

            {pausedSlots.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  Pausados ({pausedSlots.length})
                </h2>
                <div className="space-y-2">
                  {pausedSlots.map(slot => (
                    <SlotCard
                      key={slot.id}
                      slot={slot}
                      cfg={cfg}
                      selected={false}
                      onSelect={() => {}}
                      onActivate={() => handleStatus(slot, "active")}
                      onRemove={() => handleStatus(slot, "removed")}
                    />
                  ))}
                </div>
              </div>
            )}

            {slots.length === 0 && (
              <div className="text-center py-12 text-zinc-400 dark:text-zinc-600">
                <Megaphone size={40} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">Nenhum serviço cadastrado</p>
                <p className="text-xs mt-1">Adicione seu primeiro serviço para começar a divulgar!</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-24 left-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-lg text-sm font-medium text-white transition-all ${
          toast.type === "ok" ? "bg-emerald-600" : "bg-red-600"
        }`}>
          {toast.type === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ── Slot Card ────────────────────────────────────────────────────────────── */
function SlotCard({
  slot, cfg, selected, onSelect, onPause, onActivate, onRemove,
}: {
  slot:       OperatorPromotionalSlot;
  cfg:        typeof PROFILE_CONFIG[OperatorProfileType];
  selected:   boolean;
  onSelect:   () => void;
  onPause?:   () => void;
  onActivate?:() => void;
  onRemove:   () => void;
}) {
  const isPaused = slot.status === "paused";
  return (
    <div
      className={`bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-sm border transition-colors cursor-pointer ${
        selected
          ? `border-2 ${cfg.ring}`
          : "border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>
              {slot.service_type}
            </span>
            {isPaused && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                Pausado
              </span>
            )}
          </div>
          <p className="font-semibold text-zinc-900 dark:text-white text-sm truncate">{slot.title}</p>
          {slot.description && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5">{slot.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400 dark:text-zinc-500">
            {slot.coverage_city && (
              <span className="flex items-center gap-1"><MapPin size={11} />{slot.coverage_city}</span>
            )}
            {slot.price_from && (
              <span className="flex items-center gap-1"><DollarSign size={11} />R$ {slot.price_from.toFixed(2)}</span>
            )}
            <span className="flex items-center gap-1"><Send size={11} />{slot.post_count} posts</span>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          {!isPaused && onPause && (
            <button
              onClick={onPause}
              title="Pausar"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            >
              <Pause size={15} />
            </button>
          )}
          {isPaused && onActivate && (
            <button
              onClick={onActivate}
              title="Reativar"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
            >
              <Play size={15} />
            </button>
          )}
          <button
            onClick={onRemove}
            title="Remover"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 size={15} />
          </button>
          <ChevronRight size={15} className="text-zinc-300 dark:text-zinc-600" />
        </div>
      </div>
    </div>
  );
}
