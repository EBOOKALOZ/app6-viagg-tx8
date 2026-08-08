import {
  LayoutDashboard, Stethoscope, FlaskConical, Pill, Hospital,
  Landmark, Handshake, BadgeCheck, Megaphone, HeartHandshake, FileSpreadsheet,
  BarChart3, ShieldCheck, MessageSquare, Settings, Inbox, UserCog, Building2,
} from "lucide-react";

export interface GestorNavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  children?: GestorNavItem[];
}

export interface GestorNavSection {
  label: string;
  items: GestorNavItem[];
}

const CREDENCIAMENTO_CATEGORIAS: GestorNavItem[] = [
  { label: "Clínicas",     path: "/convenio-admin/credenciamento/clinicas",     icon: Stethoscope },
  { label: "Laboratórios", path: "/convenio-admin/credenciamento/laboratorios", icon: FlaskConical },
  { label: "Farmácias",    path: "/convenio-admin/credenciamento/farmacias",    icon: Pill },
  { label: "Hospitais",    path: "/convenio-admin/credenciamento/hospitais",    icon: Hospital },
  { label: "Instituições", path: "/convenio-admin/credenciamento/instituicoes", icon: Landmark },
  { label: "Parceiros",    path: "/convenio-admin/credenciamento/parceiros",    icon: BadgeCheck },
];

/**
 * Comando Convênio Fase 1 — menu lateral do Super Painel do Gestor.
 * Agrupado em seções temáticas; credenciamento aninha as 6 categorias sob o
 * hub em vez de listá-las soltas no mesmo nível (19 páginas ficavam difíceis
 * de escanear como lista plana única).
 */
export const GESTOR_NAV_SECTIONS: GestorNavSection[] = [
  {
    label: "Visão Geral",
    items: [
      { label: "Dashboard", path: "/convenio-admin", icon: LayoutDashboard },
    ],
  },
  {
    label: "Captação",
    items: [
      { label: "Convênios",          path: "/convenio-admin/convenios",       icon: Handshake },
      { label: "Leads de Parceiros", path: "/convenio-admin/leads-parceiros", icon: Inbox },
      { label: "Indicações",         path: "/convenio-admin/indicacoes",      icon: Building2 },
    ],
  },
  {
    label: "Credenciamento",
    items: [
      { label: "Credenciamento", path: "/convenio-admin/credenciamento", icon: ShieldCheck, children: CREDENCIAMENTO_CATEGORIAS },
    ],
  },
  {
    label: "Doações & Campanhas",
    items: [
      { label: "Campanhas",           path: "/convenio-admin/campanhas",           icon: Megaphone },
      { label: "Doações",             path: "/convenio-admin/doacoes",             icon: HeartHandshake },
      { label: "Prestação de Contas", path: "/convenio-admin/prestacao-de-contas", icon: FileSpreadsheet },
    ],
  },
  {
    label: "Operação",
    items: [
      { label: "Relatórios",       path: "/convenio-admin/relatorios",    icon: BarChart3 },
      { label: "Auditoria",        path: "/convenio-admin/auditoria",     icon: ShieldCheck },
      { label: "Mensagens",        path: "/convenio-admin/mensagens",     icon: MessageSquare },
      { label: "Gestão de Acesso", path: "/convenio-admin/acesso",        icon: UserCog },
      { label: "Configurações",    path: "/convenio-admin/configuracoes", icon: Settings },
    ],
  },
];

/** Lista plana de todos os itens (inclusive filhos), na ordem de navegação. */
export const GESTOR_NAV_ITEMS: GestorNavItem[] = GESTOR_NAV_SECTIONS.flatMap((section) =>
  section.items.flatMap((item) => (item.children ? [item, ...item.children] : [item]))
);
