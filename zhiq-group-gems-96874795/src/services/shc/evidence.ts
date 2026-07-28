/**
 * Registro oficial de evidência por módulo (correção E2E-01).
 *
 * O motor v2.1 é FAIL CLOSED: executar sem evidência gera decisão FAILED e
 * derruba o módulo — foi o que aconteceu com toda execução disparada do
 * painel antes deste registro. Aqui cada vertical declara sua superfície de
 * infraestrutura (tabelas e RPCs), e o MOTOR verifica tudo server-side no
 * catálogo do Postgres: existência, RLS habilitado e ausência de grants de
 * escrita para anon (tabelas); presença em pg_proc (RPCs). O painel não
 * atesta nada por conta própria — checks client-side (build, testes) ficam
 * fora do fluxo de painel e pertencem ao pipeline de auditoria.
 *
 * As listas abaixo foram extraídas do banco de produção em 2026-07-27 com o
 * mesmo critério do motor. Tabela inexistente aqui = FAILED na próxima run
 * (comportamento desejado: regressão de schema bloqueia homologação).
 */
import type { ExecutorEvidence } from './executor';

type ModuleEvidence = Required<Pick<ExecutorEvidence, 'tables'>> &
  Pick<ExecutorEvidence, 'rpcs' | 'evidence_summary'>;

export const MODULE_EVIDENCE: Record<string, ModuleEvidence> = {
  veiculos: {
    tables: ['vehicle_listings', 'vehicle_media', 'vehicle_credit_balances',
             'vehicle_credit_ledger', 'vehicle_listing_contacts', 'vehicle_listing_click_log'],
    evidence_summary: 'Infra de anúncios, mídia e créditos de veículos verificada no catálogo do banco.',
  },
  imoveis: {
    tables: ['real_estate_listings', 'real_estate_media', 'real_estate_credit_balances',
             'real_estate_credit_ledger', 'real_estate_listing_contacts', 'real_estate_moderation_queue'],
    evidence_summary: 'Infra de anúncios, mídia, créditos e moderação de imóveis verificada no catálogo do banco.',
  },
  servicos: {
    tables: ['service_listings', 'service_media', 'service_credit_balances',
             'service_credit_ledger', 'service_listing_contacts', 'service_cities'],
    evidence_summary: 'Infra de anúncios, mídia, créditos e cobertura geográfica de serviços verificada.',
  },
  fretes: {
    tables: ['freight_listings', 'freight_media', 'freight_credit_balances',
             'freight_credit_ledger', 'freight_listing_contacts', 'freight_listing_click_log'],
    evidence_summary: 'Infra de anúncios, mídia e créditos de fretes verificada no catálogo do banco.',
  },
  viagens: {
    tables: ['travel_listings', 'travel_media', 'travel_credit_balances',
             'travel_credit_ledger', 'travel_listing_contacts', 'travel_audit_log'],
    evidence_summary: 'Infra de anúncios, mídia, créditos e auditoria de viagens verificada no catálogo do banco.',
  },
  turismo: {
    // Turismo opera sobre a infraestrutura de viagens (travel_*) — não há
    // tabelas próprias da vertical no banco de produção.
    tables: ['travel_listings', 'travel_media', 'travel_credit_balances', 'travel_listing_contacts'],
    evidence_summary: 'Vertical turismo compartilha a infra travel_* (sem tabelas próprias em produção).',
  },
  financeiro: {
    tables: ['pay_financial_accounts', 'pay_ledger_entries', 'pay_escrow_holds',
             'pay_payment_events', 'commissions_local', 'commission_rate_history'],
    evidence_summary: 'Núcleo financeiro (contas, ledger, escrow, eventos e comissões) verificado.',
  },
  leiloes: {
    tables: ['auction_listings', 'auction_bids', 'auction_media',
             'auction_events', 'arremate_offers', 'auction_fraud_alerts'],
    rpcs: ['auction_buy_now', 'auction_set_status', 'auction_statistics', 'auction_security_selftest'],
    evidence_summary: 'Infra de leilões (anúncios, lances, mídia, eventos, arremates, antifraude) e RPCs do front verificadas.',
  },
  admin: {
    tables: ['profiles', 'user_roles', 'system_roles',
             'system_permissions', 'role_permissions', 'user_role_assignments'],
    rpcs: ['is_admin', 'has_permission'],
    evidence_summary: 'Núcleo de identidade e RBAC da administração verificado no catálogo do banco.',
  },
  marketplace: {
    tables: ['products', 'stores'],
    evidence_summary: 'Infra base do marketplace (produtos e lojas) verificada no catálogo do banco.',
  },
  carteira: {
    tables: ['merchant_credit_balances', 'merchant_credit_ledger', 'ledger_entries',
             'merchant_credit_orders', 'courier_wallet_ledger'],
    evidence_summary: 'Infra de carteiras e ledgers de crédito verificada no catálogo do banco.',
  },
  'orion-ai': {
    tables: ['ai_decisions', 'ai_execution_log', 'ai_prompt_templates',
             'ai_platform_config', 'orion_access_sessions', 'ai_supervisor_alerts'],
    evidence_summary: 'Infra de decisão, execução, prompts e supervisão da ORION AI verificada.',
  },
};

/**
 * Evidência para uma execução disparada do painel. Slug fora do registro
 * retorna undefined — o motor então reprova por ausência de evidência
 * (FAIL CLOSED), que é o comportamento correto para módulo desconhecido.
 */
export function getModuleEvidence(slug: string): ExecutorEvidence | undefined {
  const entry = MODULE_EVIDENCE[slug];
  if (!entry) return undefined;
  return { ...entry, agents: ['SHC Painel v2.1'] };
}
