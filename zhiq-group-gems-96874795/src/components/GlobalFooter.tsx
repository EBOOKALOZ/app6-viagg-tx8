/**
 * GlobalFooter — RODAPÉ GLOBAL ÚNICO da plataforma Viagg-TX8.
 *
 * FONTE ÚNICA DE VERDADE do rodapé. Todo o sistema deve reutilizar EXCLUSIVAMENTE
 * este componente — nada de rodapé copiado/inline em páginas ou layouts.
 *
 * Visual aprovado (imagem oficial):
 *   ┌─────────────────────────────────────────────┐
 *   │      [logo]  Viagg-TX8™ · Mercado Local      │
 *   │        © 2026 Desenvolvido por VIAGG-TX8      │
 *   └─────────────────────────────────────────────┘
 *   Barra azul (#68c7f2), logo à esquerda do nome, linha inferior com copyright.
 *
 * Comportamento:
 *  - Sticky footer: os layouts usam `min-h-screen flex flex-col` + `<main class="flex-1">`,
 *    então com POUCO conteúdo o `mt-auto` empurra o rodapé para o fim da viewport;
 *    com MUITO conteúdo ele aparece naturalmente após o conteúdo. Nunca sobrepõe.
 *  - Responsivo: barra full-width, centralizada, tipografia fluida — idêntico em
 *    desktop/notebook/tablet/celular/PWA.
 *
 * Expansão futura (tudo opcional, default OFF — não muda o visual atual):
 *  - `links`     → links institucionais (Quem Somos, Privacidade, LGPD, Termos, Ajuda, Contato)
 *  - `social`    → redes sociais
 *  - `version`   → versão da plataforma / status do sistema
 *  Basta ligar a prop no futuro; o núcleo (logo + nome + copyright) permanece.
 */
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface GlobalFooterLink {
  label: string;
  to: string;
  /** Link externo (usa <a> em vez de <Link>). */
  external?: boolean;
}

export interface GlobalFooterProps {
  /** Nome do módulo exibido ao lado da marca (ex.: "Mercado Local", "🏠 Imóveis"). */
  label?: string;
  /** Variante compacta (menos padding) — para rodapés de telas densas. */
  compact?: boolean;
  /** Links institucionais (expansão futura). Default: nenhum. */
  links?: GlobalFooterLink[];
  /** Rótulo/versão da plataforma (expansão futura). Default: oculto. */
  version?: string;
  /** Classe extra opcional para o <footer>. */
  className?: string;
}

// Ano do copyright — dinâmico, mas com fallback fixo porque `new Date()` sem
// argumentos é proibido em alguns contextos do harness. Em runtime do navegador
// funciona normal; se indisponível, cai para o ano oficial da identidade (2026).
function currentYear(): number {
  try {
    return new Date().getFullYear();
  } catch {
    return 2026;
  }
}

export function GlobalFooter({
  label = "Mercado Local",
  compact = false,
  links,
  version,
  className,
}: GlobalFooterProps) {
  const year = currentYear();

  return (
    <footer
      className={cn(
        // mt-auto = sticky footer quando o layout é flex-col min-h-screen
        "mt-auto w-full border-t border-white/10 bg-[#68c7f2] text-center text-zinc-900",
        compact ? "py-1.5 text-xs" : "py-3 text-xs sm:text-sm",
        "relative z-10 space-y-0.5",
        className
      )}
    >
      {/* Marca: logo + nome + módulo */}
      <p className="flex items-center justify-center gap-1.5 font-medium">
        <img
          src="/logo.png"
          alt="Viagg-TX8"
          className="h-8 w-auto object-contain rounded-lg shadow-sm"
          loading="lazy"
          decoding="async"
        />
        <span className="font-black">Viagg-TX8™</span>
        <span aria-hidden className="text-zinc-900/50">·</span>
        <span>{label}</span>
      </p>

      {/* Links institucionais (expansão futura — só renderiza se houver) */}
      {links && links.length > 0 && (
        <nav className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-1 text-[11px] font-semibold">
          {links.map((l, i) => (
            <span key={l.to} className="flex items-center gap-3">
              {l.external ? (
                <a href={l.to} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {l.label}
                </a>
              ) : (
                <Link to={l.to} className="hover:underline">
                  {l.label}
                </Link>
              )}
              {i < links.length - 1 && <span aria-hidden className="text-zinc-900/30">•</span>}
            </span>
          ))}
        </nav>
      )}

      {/* Copyright — sempre presente */}
      <p className="text-[10px] text-zinc-900/70">
        © {year} Desenvolvido por VIAGG-TX8
      </p>

      {/* Versão da plataforma (expansão futura — só renderiza se houver) */}
      {version && (
        <p className="text-[9px] tracking-wider text-zinc-900/50">{version}</p>
      )}
    </footer>
  );
}

export default GlobalFooter;
