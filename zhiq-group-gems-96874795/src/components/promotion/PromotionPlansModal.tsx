/**
 * PromotionPlansModal.tsx
 *
 * Modal flutuante que encapsula e exibe o `PromotionPlansGrid`.
 * Reexporta os tipos e constantes para compatibilidade com os consumidores existentes.
 */

import { X, Megaphone } from "lucide-react";
import {
  PromotionPlansGrid,
  ProfileType,
  PromotionPackage,
  PROFILE_LABELS,
  PROFILE_MODULE,
  textOnColor,
  buildFallback,
} from "./PromotionPlansGrid";

export type { ProfileType, PromotionPackage };
export { PROFILE_LABELS, PROFILE_MODULE, textOnColor, buildFallback };

interface Props {
  open: boolean;
  onClose: () => void;
  profileType?: ProfileType;
  whatsappNumber?: string;
  listingModule?: string;
}

export function PromotionPlansModal({
  open,
  onClose,
  profileType,
  whatsappNumber,
  listingModule,
}: Props) {
  if (!open) return null;

  const profileMeta = profileType ? PROFILE_LABELS[profileType] : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-3xl bg-[#0D0F12] border border-[#2A3038]/60 shadow-2xl shadow-black custom-scrollbar">
        {/* ── Header ─────────────────────────────────────── */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 sm:px-7 py-4 bg-[#0D0F12] border-b border-[#2A3038]/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FF6A00]/15 border border-[#FF6A00]/30 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-[#FF6A00]" />
            </div>
            <div>
              <h2 className="text-white font-black text-base sm:text-lg uppercase tracking-wider">
                Planos de Promoção
                {profileMeta && (
                  <span className="ml-2 text-[#FF6A00]">{profileMeta.emoji} {profileMeta.label}</span>
                )}
              </h2>
              <p className="text-[#A7B0BE] text-[11px]">
                Impulsione seus anúncios e venda muito mais
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-[#1B1F24] border border-[#2A3038]/60 flex items-center justify-center text-[#A7B0BE] hover:text-white hover:bg-[#2A3038] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Plans Grid ─────────────────────────────────── */}
        <div className="p-4 sm:p-6">
          <PromotionPlansGrid
            profileType={profileType}
            whatsappNumber={whatsappNumber}
            listingModule={listingModule}
            showHeader={false}
          />
        </div>
      </div>
    </div>
  );
}
