/**
 * M58.0 · Navigation Framework — árvore oficial de navegação.
 *
 * As 13 seções da spec; cada uma declara o recurso exigido (espelho do
 * cio_authorize) e o status de implantação. Seções 'planejada' aparecem
 * desabilitadas até o módulo visual correspondente (M58.1+) existir —
 * navegação nunca inventa conteúdo, igual às métricas.
 */

import type { Resource } from '../core/roles';

export interface NavSection {
  key: string;
  label: string;
  /** rota-base sob /dashboards */
  path: string;
  resource: Resource;
  /** lucide icon name — resolvido pelo módulo visual */
  icon: string;
  /** disponivel = página existe; planejada = aparece desabilitada */
  status: 'disponivel' | 'fundacao' | 'planejada';
  /** dataset(s) do registry que a seção consome */
  datasets: string[];
}

export const NAV_TREE: readonly NavSection[] = [
  // M58.1: Executive Dashboard implementado — rota atual /admin/executivo
  // (path abaixo é o canônico futuro da shell /dashboards)
  { key: 'visao-geral', label: 'Visão Geral', path: '/dashboards', resource: 'dashboards.acesso', icon: 'LayoutDashboard', status: 'disponivel', datasets: ['health-executive', 'alert-executive', 'metric-bundle', 'operational', 'alert-dashboard', 'motor-metrics'] },
  // M58.2: NOC implementado — rota atual /admin/operacional
  { key: 'operacoes', label: 'Operações', path: '/dashboards/operacoes', resource: 'telemetria.leitura', icon: 'Activity', status: 'disponivel', datasets: ['operational', 'noc', 'alert-dashboard', 'alert-executive', 'health-executive', 'motor-metrics'] },
  { key: 'financeiro', label: 'Financeiro', path: '/dashboards/financeiro', resource: 'financeiro.leitura', icon: 'Wallet', status: 'planejada', datasets: ['metric-bundle'] },
  { key: 'comercial', label: 'Comercial', path: '/dashboards/comercial', resource: 'comercial.leitura', icon: 'Handshake', status: 'planejada', datasets: ['metric-bundle'] },
  { key: 'marketplace', label: 'Marketplace', path: '/dashboards/marketplace', resource: 'dashboards.acesso', icon: 'Store', status: 'planejada', datasets: ['metric-bundle'] },
  { key: 'corridas', label: 'Corridas', path: '/dashboards/corridas', resource: 'dashboards.acesso', icon: 'Car', status: 'planejada', datasets: ['metric-bundle'] },
  { key: 'entregas', label: 'Entregas', path: '/dashboards/entregas', resource: 'dashboards.acesso', icon: 'Package', status: 'planejada', datasets: ['metric-bundle'] },
  { key: 'fretes', label: 'Fretes', path: '/dashboards/fretes', resource: 'dashboards.acesso', icon: 'Truck', status: 'planejada', datasets: ['metric-bundle'] },
  { key: 'ia', label: 'IA', path: '/dashboards/ia', resource: 'telemetria.leitura', icon: 'Bot', status: 'planejada', datasets: ['metric'] },
  { key: 'health', label: 'Health Center', path: '/dashboards/health', resource: 'telemetria.leitura', icon: 'HeartPulse', status: 'planejada', datasets: ['operational', 'noc'] },
  { key: 'alertas', label: 'Alert Center', path: '/dashboards/alertas', resource: 'telemetria.leitura', icon: 'Siren', status: 'planejada', datasets: ['alert-dashboard'] },
  // M58.4: Governance Dashboard implementado — rota atual /admin/governanca
  { key: 'governanca', label: 'Governança', path: '/dashboards/governanca', resource: 'governanca.leitura', icon: 'ShieldCheck', status: 'disponivel', datasets: ['governance', 'data-dictionary', 'metric-lineage', 'health-executive', 'alert-dashboard'] },
  { key: 'administracao', label: 'Administração', path: '/dashboards/admin', resource: 'admin.total', icon: 'Settings', status: 'planejada', datasets: ['motor', 'my-roles'] },
  // M58.5: estrutura do painel narrativo (conteúdo chega no M59)
  { key: 'resumo-ia', label: 'Resumo IA', path: '/dashboards/resumo-ia', resource: 'dashboards.acesso', icon: 'Sparkles', status: 'disponivel', datasets: ['health-executive', 'alert-executive', 'governance'] },
] as const;

export interface Breadcrumb {
  label: string;
  path: string;
}

/** Breadcrumbs a partir de um path sob /dashboards. */
export function breadcrumbsFor(path: string): Breadcrumb[] {
  const crumbs: Breadcrumb[] = [{ label: 'Dashboards', path: '/dashboards' }];
  const section = NAV_TREE.find((s) => s.path !== '/dashboards' && path.startsWith(s.path));
  if (section) {
    crumbs.push({ label: section.label, path: section.path });
    const rest = path.slice(section.path.length).split('/').filter(Boolean);
    let acc = section.path;
    for (const part of rest) {
      acc += `/${part}`;
      crumbs.push({ label: decodeURIComponent(part), path: acc });
    }
  }
  return crumbs;
}

/** M58.5 · Busca global — filtra seções por rótulo/chave (pura; a Shell decide navegar). */
export function searchSections(term: string): NavSection[] {
  const t = term.trim().toLowerCase();
  if (!t) return [];
  return NAV_TREE.filter(
    (s) => s.label.toLowerCase().includes(t) || s.key.includes(t),
  ).slice(0, 8);
}

/** M58.5 · Resolve seção a partir de um pathname da Shell. */
export function sectionForPath(pathname: string): NavSection | null {
  const exact = NAV_TREE.find((s) => s.path === pathname);
  if (exact) return exact;
  const prefix = NAV_TREE.filter((s) => s.path !== '/dashboards' && pathname.startsWith(s.path))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return prefix ?? (pathname === '/dashboards' || pathname === '/dashboards/'
    ? NAV_TREE.find((s) => s.key === 'visao-geral') ?? null
    : null);
}

/** Atalhos rápidos (command palette / header) — apontam só p/ seções existentes. */
export const SHORTCUTS: readonly { key: string; label: string; section: string }[] = [
  { key: 'g h', label: 'Ir para Health Center', section: 'health' },
  { key: 'g a', label: 'Ir para Alert Center', section: 'alertas' },
  { key: 'g o', label: 'Ir para Operações', section: 'operacoes' },
  { key: 'g g', label: 'Ir para Governança', section: 'governanca' },
  { key: 'r', label: 'Atualizar painel atual', section: '__refresh__' },
] as const;
