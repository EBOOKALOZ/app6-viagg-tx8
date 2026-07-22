/**
 * StoreThemeScope — aplica o tema da loja (merchant_stores.appearance)
 * SOMENTE dentro da vitrine. Header/menu/rodapé da plataforma ficam fora
 * do escopo e mantêm a identidade Viagg-TX8.
 *
 * Sem tema (appearance null) o children é renderizado sem wrapper extra —
 * zero mudança visual para lojas que nunca personalizaram.
 */
import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  type StoreAppearance,
  buildThemeVars,
  buildBgLayerStyle,
  hexToRgba,
} from "@/lib/store-theme";
import "@/styles/store-theme.css";

const StoreThemeContext = createContext<StoreAppearance | null>(null);

/** Tema ativo da loja (null fora de um StoreThemeScope ou sem personalização). */
export function useStoreTheme(): StoreAppearance | null {
  return useContext(StoreThemeContext);
}

export function StoreThemeScope({
  appearance,
  children,
  className,
}: {
  appearance: StoreAppearance | null;
  children: ReactNode;
  className?: string;
}) {
  if (!appearance) return <>{children}</>;

  const vars = buildThemeVars(appearance);
  const bgStyle = buildBgLayerStyle(appearance);
  const showOverlay =
    appearance.bg.overlay > 0 && (appearance.bg.type === "image" || appearance.bg.type === "pattern");

  return (
    <StoreThemeContext.Provider value={appearance}>
      <div
        className={cn("st-skin relative", className)}
        style={vars}
        data-glass={appearance.cards.glass ? "1" : "0"}
        data-fx-fade={appearance.effects.fadeIn ? "1" : "0"}
        data-fx-zoom={appearance.effects.hoverZoom ? "1" : "0"}
      >
        {/* camada de fundo (cor/gradiente/imagem/padrão) */}
        <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0" style={bgStyle} />
          {showOverlay && (
            <div
              className="absolute inset-0"
              style={{ backgroundColor: hexToRgba("#000000", appearance.bg.overlay) }}
            />
          )}
        </div>
        <div className="relative z-[1]">{children}</div>
      </div>
    </StoreThemeContext.Provider>
  );
}

export default StoreThemeScope;
