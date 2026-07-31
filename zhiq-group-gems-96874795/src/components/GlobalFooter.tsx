/**
 * GlobalFooter — RODAPÉ GLOBAL ÚNICO da plataforma Viagg-TX8.
 *
 * FONTE ÚNICA DE VERDADE do rodapé. Todo o sistema deve reutilizar EXCLUSIVAMENTE
 * este componente — nada de rodapé copiado/inline em páginas ou layouts.
 *
 * Visual aprovado — redesign premium (ORION-522):
 *   ┌─────────────────────────────────────────────┐
 *   │ ▔▔▔▔▔▔▔▔▔▔▔▔▔ borda dourada 2-3px ▔▔▔▔▔▔▔▔▔▔ │
 *   │      [logo]  Viagg-TX8™ · 🛒 Mercado Local   │
 *   │        © 2026 Desenvolvido por VIAGG-TX8      │
 *   │     [card] 🛡 Software Registrado no INPI     │
 *   └─────────────────────────────────────────────┘
 *   Fundo preto grafite (#111111) com leve gradiente, borda superior dourada
 *   (#F5C542), textos brancos, ícone do Mercado Local em dourado, card do
 *   registro INPI com fundo levemente mais claro + brilho/sombra sutis.
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
import { ShieldCheck } from "lucide-react";
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
  label = "🛒 Mercado Local",
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
        "mt-auto w-full border-t-2 sm:border-t-[3px] border-[#F5C542] text-center text-white",
        "bg-[#111111] bg-gradient-to-b from-[#161616] to-[#0B0B0B]",
        compact ? "py-2.5 text-xs" : "py-4 sm:py-5 text-xs sm:text-sm",
        "relative z-10 space-y-1.5",
        className
      )}
    >
      {/* Marca: logo + nome + módulo */}
      <p className="flex items-center justify-center gap-2 font-medium">
        <img
          src="/logo.png"
          alt="Viagg-TX8"
          className="h-8 w-auto object-contain rounded-lg shadow-sm"
          loading="lazy"
          decoding="async"
        />
        <span className="font-semibold text-white">Viagg-TX8™</span>
        <span aria-hidden className="text-[#F5C542]/60">·</span>
        <span className="text-white/90">{label}</span>
      </p>

      {/* Links institucionais (expansão futura — só renderiza se houver) */}
      {links && links.length > 0 && (
        <nav className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-1 text-[11px] font-semibold">
          {links.map((l, i) => (
            <span key={l.to} className="flex items-center gap-3">
              {l.external ? (
                <a href={l.to} target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-[#F5C542] hover:underline">
                  {l.label}
                </a>
              ) : (
                <Link to={l.to} className="text-white/80 hover:text-[#F5C542] hover:underline">
                  {l.label}
                </Link>
              )}
              {i < links.length - 1 && <span aria-hidden className="text-white/20">•</span>}
            </span>
          ))}
        </nav>
      )}

      {/* Copyright — sempre presente */}
      <p className="text-[10px] text-zinc-400">
        © {year} Desenvolvido por VIAGG-TX8
      </p>

      {/* Versão da plataforma (expansão futura — só renderiza se houver) */}
      {version && (
        <p className="text-[9px] tracking-wider text-zinc-500">{version}</p>
      )}

      {/* Bloco institucional — Registro INPI (ORION-520 · texto ORION-521 · visual premium ORION-522) */}
      <p className="mx-auto mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-white shadow-[0_0_16px_rgba(245,197,66,0.08)] ring-1 ring-white/10">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
        🛡 Software Registrado no INPI • Registro BR512026003461-2
      </p>
    </footer>
  );
}

export default GlobalFooter;
