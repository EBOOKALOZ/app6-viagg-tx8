/**
 * M58.0 · Autorização do frontend — ESPELHO da camada única do banco.
 *
 * A decisão REAL acontece no banco (cio_authorize dentro das RPCs).
 * Este módulo só evita mostrar navegação/botões que o backend negaria:
 * o frontend nunca é a fronteira de segurança.
 * Fonte dos papéis do usuário: RPC `cio_my_roles()` (self-scoped).
 */

export const ROLES = [
  'ceo',
  'administrador',
  'operador',
  'analista',
  'auditor',
  'financeiro',
  'comercial',
  'marketing',
  'suporte',
] as const;

export type Role = (typeof ROLES)[number];

export type Resource =
  | 'governanca.leitura'
  | 'telemetria.leitura'
  | 'financeiro.leitura'
  | 'comercial.leitura'
  | 'dashboards.acesso'
  | 'admin.total';

/** Perfil de autorização retornado por cio_my_roles() */
export interface AuthzProfile {
  is_admin: boolean;
  roles: Role[];
  resources: string[];
}

export const EMPTY_AUTHZ: AuthzProfile = { is_admin: false, roles: [], resources: [] };

/** Mesma semântica do cio_authorize: admin passa em tudo; senão, recurso concedido. */
export function can(profile: AuthzProfile, resource: Resource): boolean {
  if (profile.is_admin) return true;
  if (resource === 'admin.total') return false;
  return profile.resources.includes(resource);
}

export function hasRole(profile: AuthzProfile, role: Role): boolean {
  return profile.is_admin || profile.roles.includes(role);
}

/** Normaliza o JSON da RPC (defensivo contra null/shape inesperado). */
export function parseAuthzProfile(raw: unknown): AuthzProfile {
  if (!raw || typeof raw !== 'object') return EMPTY_AUTHZ;
  const o = raw as Record<string, unknown>;
  return {
    is_admin: o.is_admin === true,
    roles: Array.isArray(o.roles) ? (o.roles.filter((r) => typeof r === 'string') as Role[]) : [],
    resources: Array.isArray(o.resources)
      ? (o.resources.filter((r) => typeof r === 'string') as string[])
      : [],
  };
}
