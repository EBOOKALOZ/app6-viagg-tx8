/**
 * useCardTopBarActions — ações padrão do Header Universal dos Cards (CardTopBar).
 *
 * share    → Web Share API com fallback para copiar o link (toast de feedback).
 * favorite → informação é pública, mas GRAVAR favorito é ação pessoal: passa
 *            pela porta única useRequireAuth (deslogado abre o modal de login
 *            e a ação é retomada automaticamente após autenticar).
 */
import { useState } from "react";
import type { MouseEvent } from "react";
import { toast } from "sonner";
import { useRequireAuth } from "@/hooks/useRequireAuth";

/** Compartilha um link com Web Share API; fallback copia para a área de transferência. */
export function shareCardLink(title: string, url: string) {
  if (navigator.share) {
    navigator.share({ title, url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url)
      .then(() => toast.success("Link copiado! 🔗"))
      .catch(() => {});
  }
}

export function useCardTopBarActions(
  shareTitle: string,
  shareUrl?: string,
  favoritePayload?: Record<string, unknown>
) {
  const requireAuth = useRequireAuth();
  const [favorited, setFavorited] = useState(false);

  const onShare = (e: MouseEvent) => {
    e.stopPropagation();
    shareCardLink(shareTitle, shareUrl || window.location.href);
  };

  const onFavorite = (e: MouseEvent) => {
    e.stopPropagation();
    requireAuth(() => setFavorited((v) => !v), {
      kind: "favorite",
      label: "favoritar este anúncio",
      payload: favoritePayload,
    });
  };

  return { favorited, onShare, onFavorite };
}

export default useCardTopBarActions;
