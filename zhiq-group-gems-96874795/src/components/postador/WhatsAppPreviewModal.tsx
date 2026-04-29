/**
 * WhatsAppPreviewModal
 * Mostra exatamente como a mensagem vai aparecer no grupo do WhatsApp
 * antes do motoboy confirmar a postagem.
 */
import { X, Send, Eye } from "lucide-react";

type WhatsAppPreviewModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Texto da mensagem que será enviada */
  messageText: string;
  /** URL da imagem do produto/campanha (og:image) */
  imageUrl?: string | null;
  /** Título do preview OG */
  ogTitle?: string | null;
  /** Descrição do preview OG */
  ogDesc?: string | null;
  /** Nome do motoboy (para o avatar) */
  motoboyName?: string;
};

// ─── Simulação da bolha WhatsApp ────────────────────────────────────────────

function WaBubble({
  messageText,
  imageUrl,
  ogTitle,
  ogDesc,
  motoboyName,
}: Omit<WhatsAppPreviewModalProps, "open" | "onClose" | "onConfirm">) {
  const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const initial = (motoboyName ?? "M")[0].toUpperCase();

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: "#0b141a",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cg fill='none' stroke='%23182229' stroke-width='1'%3E%3Cellipse cx='20' cy='20' rx='8' ry='5'/%3E%3Cellipse cx='60' cy='20' rx='8' ry='5'/%3E%3Cellipse cx='20' cy='60' rx='8' ry='5'/%3E%3Cellipse cx='60' cy='60' rx='8' ry='5'/%3E%3Ccircle cx='40' cy='40' r='6'/%3E%3Cpath d='M14 20 Q20 12 26 20'/%3E%3Cpath d='M54 20 Q60 12 66 20'/%3E%3Cpath d='M14 60 Q20 52 26 60'/%3E%3Cpath d='M54 60 Q60 52 66 60'/%3E%3C/g%3E%3C/svg%3E")`,
        backgroundRepeat: "repeat",
        padding: "16px 10px",
      }}
    >
      {/* Separador de data */}
      <div className="flex justify-center mb-3">
        <span className="text-[11px] px-3 py-0.5 rounded-md" style={{ background: "rgba(17,27,33,0.85)", color: "#e9edef" }}>
          Hoje
        </span>
      </div>

      {/* Bolha */}
      <div className="flex items-end gap-2">
        {/* Avatar motoboy */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0"
          style={{ background: "linear-gradient(135deg,#25D366,#128C7E)" }}
        >
          {initial}
        </div>

        <div className="flex-1 min-w-0 rounded-lg overflow-hidden" style={{ background: "#202c33", borderRadius: "8px 8px 8px 0" }}>
          {/* Nome */}
          <p className="text-[13px] font-bold px-3 pt-2 pb-0.5" style={{ color: "#53bdeb" }}>
            {motoboyName ?? "Motoboy Viagg"}
          </p>

          {/* Texto da mensagem */}
          <pre
            className="text-[13px] px-3 pb-2 leading-relaxed whitespace-pre-wrap break-words font-sans"
            style={{ color: "#e9edef" }}
          >
            {messageText}
          </pre>

          {/* OG Preview Card */}
          {(ogTitle || imageUrl) && (
            <div
              className="mx-2 mb-2 rounded-md overflow-hidden"
              style={{ borderLeft: "4px solid #25D366", background: "#1a2229" }}
            >
              {/* Imagem */}
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="preview"
                  className="w-full object-cover"
                  style={{ maxHeight: 160 }}
                />
              ) : (
                <div
                  className="w-full flex items-center justify-center text-3xl"
                  style={{ height: 100, background: "linear-gradient(135deg,#1e3a2f,#0d2b20)" }}
                >
                  🏪
                </div>
              )}
              {/* Texto OG */}
              <div className="px-2.5 py-2">
                <p className="text-[10px] mb-1" style={{ color: "#8696a0" }}>
                  Viagg · Promoção
                </p>
                {ogTitle && (
                  <p className="text-[12px] font-bold leading-tight mb-0.5" style={{ color: "#e9edef" }}>
                    {ogTitle}
                  </p>
                )}
                {ogDesc && (
                  <p
                    className="text-[11px] leading-snug line-clamp-2"
                    style={{ color: "#8696a0" }}
                  >
                    {ogDesc}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Timestamp + checks */}
          <div className="flex items-center justify-end gap-1 px-3 pb-2">
            <span className="text-[11px]" style={{ color: "#8696a0" }}>{now}</span>
            <span className="text-[13px]" style={{ color: "#53bdeb" }}>✓✓</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal principal ─────────────────────────────────────────────────────────

export default function WhatsAppPreviewModal({
  open,
  onClose,
  onConfirm,
  messageText,
  imageUrl,
  ogTitle,
  ogDesc,
  motoboyName,
}: WhatsAppPreviewModalProps) {
  if (!open) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Sheet */}
      <div
        className="w-full rounded-t-2xl overflow-hidden flex flex-col"
        style={{
          background: "#1b1f24",
          maxHeight: "92vh",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-emerald-400" />
            <p className="text-sm font-black text-white/90">Pré-visualização</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
          >
            <X className="h-4 w-4 text-white/60" />
          </button>
        </div>

        {/* Label */}
        <div className="px-4 py-2 shrink-0">
          <p className="text-[11px] text-white/40 font-medium">
            É assim que os membros do grupo vão ver sua mensagem
          </p>
        </div>

        {/* Preview scrollável */}
        <div className="overflow-y-auto flex-1 px-3 pb-2">
          <WaBubble
            messageText={messageText}
            imageUrl={imageUrl}
            ogTitle={ogTitle}
            ogDesc={ogDesc}
            motoboyName={motoboyName}
          />
        </div>

        {/* Botões */}
        <div className="flex gap-3 px-4 py-4 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            onClick={onClose}
            className="flex-1 h-12 rounded-xl text-sm font-bold text-white/50 transition-colors hover:bg-white/10"
            style={{ border: "1px solid rgba(255,255,255,0.10)" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            className="flex-[2] h-12 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg,#25D366,#128C7E)" }}
          >
            <Send className="h-4 w-4" />
            Confirmar e Abrir WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
