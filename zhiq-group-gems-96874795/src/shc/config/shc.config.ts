import { SHC_AUDIT_CONFIG, SHCProfile, SHCRule } from './SHCAuditConfig';

/**
 * SHC v2.0 — Configuração canônica consolidada.
 *
 * A Matriz Oficial vive em SHCAuditConfig.ts (array SHC_AUDIT_CONFIG).
 * Este arquivo expõe a mesma matriz no formato de mapa por categoria
 * (SHC_CONFIG.audits.<categoria>), que é o contrato usado pelo gate de
 * build (scripts/verify-shc.mjs), pelos testes e pelos painéis.
 */

export interface SHCAuditEntry extends SHCRule {
  /** Alias de blocksDeployment no contrato público do SHC v2.0. */
  blocksDeploy: boolean;
}

const audits: Record<string, SHCAuditEntry> = {};
for (const rule of SHC_AUDIT_CONFIG) {
  audits[rule.category] = { ...rule, blocksDeploy: rule.blocksDeployment };
}

export const SHC_CONFIG = {
  version: '2.0',
  /** Perfil usado quando o chamador não informa um — o mais estrito. */
  defaultProfile: 'production' as SHCProfile,
  audits,
  rules: SHC_AUDIT_CONFIG,
} as const;

export type { SHCProfile, SHCRule };
export { SHC_AUDIT_CONFIG };
