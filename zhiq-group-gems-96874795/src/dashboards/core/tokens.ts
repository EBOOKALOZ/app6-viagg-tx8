/**
 * M58.0 · Enterprise Design Tokens
 *
 * Tokens oficiais da Plataforma de Dashboards. NÃO alteram a identidade
 * visual existente: cores referenciam as variáveis CSS do tema shadcn já
 * instalado (index.css), então light/dark seguem o toggle atual do app.
 * Tudo aqui é a ÚNICA fonte de espaçamento/tipografia/elevação dos painéis.
 */

export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  xxl: '3rem',
} as const;

export const grid = {
  /** colunas do grid de widgets por breakpoint */
  columns: { sm: 1, md: 2, lg: 3, xl: 4 },
  gap: spacing.md,
  /** altura-base de um widget (multiplicada por `rows` do widget) */
  rowUnit: '7rem',
} as const;

/** Breakpoints idênticos aos do Tailwind do projeto (não introduzir novos) */
export const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280, xxl: 1536 } as const;

export const typography = {
  kpiValue: 'text-3xl font-bold tabular-nums tracking-tight',
  kpiLabel: 'text-xs font-medium text-muted-foreground uppercase tracking-wide',
  cardTitle: 'text-sm font-semibold',
  cardSubtitle: 'text-xs text-muted-foreground',
  sectionTitle: 'text-lg font-semibold tracking-tight',
  mono: 'font-mono tabular-nums',
} as const;

/** Cores SEMÂNTICAS de estado (saúde/severidade) — únicas cores próprias do módulo.
 *  Mapeiam a escala oficial do Health/Alert Center; nunca usar para decoração. */
export const stateColors = {
  excelente: 'hsl(142 60% 40%)',
  bom: 'hsl(165 55% 38%)',
  atencao: 'hsl(38 85% 45%)',
  critico: 'hsl(4 70% 48%)',
  offline: 'hsl(215 10% 55%)',
  // severidades de alerta
  informacao: 'hsl(215 60% 50%)',
  aviso: 'hsl(45 85% 45%)',
  alto: 'hsl(25 85% 48%)',
  emergencia: 'hsl(340 75% 42%)',
} as const;

export type StateColorKey = keyof typeof stateColors;

export const elevation = {
  card: 'shadow-sm',
  raised: 'shadow-md',
  overlay: 'shadow-lg',
} as const;

export const borders = {
  radius: 'rounded-lg',
  radiusSm: 'rounded-md',
  edge: 'border border-border',
} as const;

export const motion = {
  /** transições curtas; respeitar prefers-reduced-motion via Tailwind (motion-safe:) */
  fast: 'motion-safe:transition-all motion-safe:duration-150',
  normal: 'motion-safe:transition-all motion-safe:duration-300',
} as const;

/** Ícones: usar exclusivamente lucide-react (já é o padrão do app). */
export const iconSizes = { sm: 14, md: 18, lg: 24 } as const;

export const tokens = {
  spacing,
  grid,
  breakpoints,
  typography,
  stateColors,
  elevation,
  borders,
  motion,
  iconSizes,
} as const;
