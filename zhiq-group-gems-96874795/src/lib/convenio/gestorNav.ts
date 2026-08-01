import {
  LayoutDashboard, Stethoscope, FlaskConical, Pill, Hospital,
  Landmark, Handshake, BadgeCheck, Megaphone, HeartHandshake, FileSpreadsheet,
  BarChart3, ShieldCheck, MessageSquare, Settings,
} from "lucide-react";

export interface GestorNavItem {
  label: string;
  path: string;
  icon: React.ElementType;
}

/**
 * Comando Convênio Fase 1 — menu lateral do Super Painel do Gestor.
 * Ordem segue exatamente o prompt de especificação da Fase 1.
 */
export const GESTOR_NAV_ITEMS: GestorNavItem[] = [
  { label: "Dashboard",            path: "/convenio-admin",                      icon: LayoutDashboard },
  { label: "Convênios",            path: "/convenio-admin/convenios",            icon: Handshake },
  { label: "Clínicas",             path: "/convenio-admin/credenciamento/clinicas",     icon: Stethoscope },
  { label: "Laboratórios",         path: "/convenio-admin/credenciamento/laboratorios", icon: FlaskConical },
  { label: "Farmácias",            path: "/convenio-admin/credenciamento/farmacias",    icon: Pill },
  { label: "Hospitais",            path: "/convenio-admin/credenciamento/hospitais",    icon: Hospital },
  { label: "Instituições",         path: "/convenio-admin/credenciamento/instituicoes", icon: Landmark },
  { label: "Parceiros",            path: "/convenio-admin/credenciamento/parceiros",    icon: BadgeCheck },
  { label: "Credenciamento",       path: "/convenio-admin/credenciamento",              icon: ShieldCheck },
  { label: "Campanhas",            path: "/convenio-admin/campanhas",            icon: Megaphone },
  { label: "Doações",              path: "/convenio-admin/doacoes",              icon: HeartHandshake },
  { label: "Prestação de Contas",  path: "/convenio-admin/prestacao-de-contas",  icon: FileSpreadsheet },
  { label: "Relatórios",           path: "/convenio-admin/relatorios",           icon: BarChart3 },
  { label: "Auditoria",            path: "/convenio-admin/auditoria",            icon: ShieldCheck },
  { label: "Mensagens",            path: "/convenio-admin/mensagens",            icon: MessageSquare },
  { label: "Configurações",        path: "/convenio-admin/configuracoes",        icon: Settings },
];
