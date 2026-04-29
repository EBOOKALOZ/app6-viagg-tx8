/**
 * PALETA OFICIAL — Painel Lojista & Anunciante Viagg-TX8
 * Fonte única de verdade para cores, tipografia e utilitários do painel.
 *
 * Regras:
 * - sidebar escuro  > área de conteúdo  > cards (camadas crescentes de luminosidade)
 * - laranja é CTA, ativo, foco, marca
 * - verde aparece só em contextos positivos
 * - nunca preto absoluto, nunca cinza lavado
 */

// ─── Tokens de cor (hex) ─────────────────────────────────────────
export const COLORS = {
  bgMain:        "#14171B",   // fundo geral da área de conteúdo
  bgSidebar:     "#0D0F12",   // sidebar / menu esquerdo
  bgCard:        "#1B1F24",   // cards, containers, blocos
  border:        "#2A3038",   // bordas suaves
  textPrimary:   "#F5F7FA",   // texto principal
  textSecondary: "#A7B0BE",   // texto secondary / legendas
  brand:         "#FF6A00",   // laranja principal (CTA, ativo, destaque)
  brandHover:    "#FF7A1A",   // hover do laranja
  success:       "#22C55E",   // verde (sucesso, positivo, ativo)
  error:         "#EF4444",   // vermelho (erro, alerta crítico)
  brandMuted:    "#FF6A00/10",// laranja em fundo translúcido
  lavender:      "#E6E6FA",   // lavanda (info, destaque secundário, premium highlight)
  lavenderMuted: "#E6E6FA/10",// lavanda translúcida para fundos suaves
} as const;

// ─── Classes Tailwind reutilizáveis ──────────────────────────────

/** Fundo principal da área de conteúdo */
export const bgMain     = "bg-[#14171B]";

/** Fundo do sidebar / menu esquerdo */
export const bgSidebar  = "bg-[#0D0F12]";

/** Fundo de cards / containers */
export const bgCard     = "bg-[#1B1F24]";

/** Fundo de hover em linhas/itens de lista */
export const bgHover    = "hover:bg-[#1B1F24]";

/** Fundo dark mais sutil (sub-seções dentro de cards) */
export const bgSubtle   = "bg-[#14171B]";

/** Bordas elegantes */
export const border     = "border border-[#2A3038]";
export const borderColor = "border-[#2A3038]";

/** Divisor (hr / separador) */
export const divider    = "border-[#2A3038]";

/** Texto principal */
export const textPrimary    = "text-[#F5F7FA]";

/** Texto secundário */
export const textSecondary  = "text-[#A7B0BE]";

/** Texto da marca / destaques laranja */
export const textBrand      = "text-[#FF6A00]";

/** Texto sucesso */
export const textSuccess    = "text-[#22C55E]";

/** Texto erro */
export const textError      = "text-[#EF4444]";

/** Botão primário (laranja da marca) */
export const btnPrimary     = "bg-[#FF6A00] hover:bg-[#FF7A1A] text-white";

/** Botão secundário dark */
export const btnSecondary   = "bg-[#1B1F24] hover:bg-[#2A3038] text-[#F5F7FA] border border-[#2A3038]";

/** Botão ghost dark */
export const btnGhost       = "hover:bg-[#1B1F24] text-[#A7B0BE] hover:text-[#F5F7FA]";

/** Badge laranja (destaque de marca) */
export const badgeBrand     = "bg-[#FF6A00]/10 text-[#FF6A00] border border-[#FF6A00]/20";

/** Badge sucesso */
export const badgeSuccess   = "bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20";

/** Badge erro */
export const badgeError     = "bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20";

/** Badge neutro (rascunho, pausado) */
export const badgeNeutral   = "bg-[#2A3038] text-[#A7B0BE] border border-[#2A3038]";

/** Input dark */
export const inputDark      = "bg-[#14171B] border-[#2A3038] text-[#F5F7FA] placeholder:text-[#A7B0BE] focus-visible:border-[#FF6A00] focus-visible:ring-[#FF6A00]/20";

/** Tab ativa */
export const tabActive      = "bg-[#FF6A00] text-white shadow";

/** Tab inativa */
export const tabInactive    = "text-[#A7B0BE] hover:text-[#F5F7FA] hover:bg-[#1B1F24]";

/** Cabeçalho de seção */
export const sectionTitle   = "text-[#F5F7FA] font-black uppercase tracking-[0.15em] text-xs";

/** Classe base para cards do painel */
export const panelCard      = "bg-[#1B1F24] border border-[#2A3038] rounded-[28px] shadow-lg shadow-black/20";

// ─── Lavanda — cor informativa / destaque premium ────────────────
// #E6E6FA: usado em info badges, tags especiais, seções em destaque,
// elementos de informação que precisam de contraste cromático com o laranja.

/** Texto lavanda (informativo, premium tag) */
export const textLavender    = "text-[#E6E6FA]";

/** Fundo lavanda translúcido (info background, card destaque) */
export const bgLavender      = "bg-[#E6E6FA]/10";

/** Badge lavanda (informativo, novidade, premium, em destaque) */
export const badgeLavender   = "bg-[#E6E6FA]/10 text-[#E6E6FA] border border-[#E6E6FA]/20";

/** Bordas lavanda */
export const borderLavender  = "border-[#E6E6FA]/20";
