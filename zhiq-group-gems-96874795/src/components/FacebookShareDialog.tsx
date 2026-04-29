import { useState } from "react";
import { X, Share2, Facebook, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FacebookShareDialogProps {
  onClose: () => void;
}

const SHARE_URL = "https://app.viagg-tx8.com.br";
const SHARE_QUOTE =
  "🚀 Acabei de entrar na plataforma Viagg-TX8! Entregas rápidas, lojistas conectados e muito mais. Confira você também!";
const SHARE_HASHTAG = "#ViaggTX8";

export function FacebookShareDialog({ onClose }: FacebookShareDialogProps) {
  const [closing, setClosing] = useState(false);

  const handleShare = () => {
    const fbShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
      SHARE_URL
    )}&quote=${encodeURIComponent(SHARE_QUOTE)}&hashtag=${encodeURIComponent(
      SHARE_HASHTAG
    )}`;
    window.open(fbShareUrl, "_blank", "width=600,height=400,noopener,noreferrer");
    handleClose();
  };

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 300);
  };

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
        closing ? "opacity-0" : "opacity-100"
      }`}
      onClick={handleClose}
    >
      <div
        className={`relative w-[90%] max-w-md rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-[#0B3D2E] via-[#0a3527] to-[#051F18] p-6 shadow-2xl transition-all duration-300 ${
          closing ? "scale-90 opacity-0" : "scale-100 opacity-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-3 top-3 rounded-full p-1.5 text-emerald-300/50 hover:bg-white/10 hover:text-emerald-200 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex flex-col items-center text-center mb-5">
          <div className="relative mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1877F2]/20 ring-2 ring-[#1877F2]/30">
              <Facebook className="h-8 w-8 text-[#1877F2]" />
            </div>
            <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#0a3527]">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
          </div>

          <h2 className="text-xl font-bold text-white mb-1">
            Você está dentro! 🎉
          </h2>
          <p className="text-sm text-emerald-200/70 max-w-[280px]">
            Compartilhe com seus amigos no Facebook que você está usando a Viagg-TX8!
          </p>
        </div>

        {/* Preview card */}
        <div className="mb-5 rounded-xl bg-white/5 border border-white/10 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
              <Share2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-emerald-100/90 leading-relaxed">
                "{SHARE_QUOTE}"
              </p>
              <p className="text-xs text-emerald-300/40 mt-2">
                app.viagg-tx8.com.br
              </p>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="space-y-2.5">
          <Button
            onClick={handleShare}
            className="w-full h-12 rounded-xl bg-[#1877F2] hover:bg-[#166FE5] text-white font-semibold text-base transition-all duration-200 hover:shadow-lg hover:shadow-[#1877F2]/25"
          >
            <Facebook className="mr-2 h-5 w-5" />
            Compartilhar no Facebook
          </Button>

          <button
            onClick={handleClose}
            className="w-full py-2.5 text-sm text-emerald-300/50 hover:text-emerald-200 transition-colors"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
