/**
 * Driver Registry
 *
 * Mapeia provider_code → implementação concreta. Quando um driver novo é
 * adicionado, basta importar aqui.
 *
 * NÃO carrega credenciais — credenciais vêm de payment_gateways no banco e
 * são passadas a cada chamada via ProviderContext.
 */

import type { GatewayProviderCode, PaymentProvider } from './types';
import { mockDriver } from './drivers/mock';
import { mercadopagoDriver } from './drivers/mercadopago';

const REGISTRY: Record<GatewayProviderCode, PaymentProvider | undefined> = {
  mock: mockDriver,
  mercadopago: mercadopagoDriver,
  asaas: undefined,
  pagarme: undefined,
  iugu: undefined,
  stripe: undefined,
};

export function getDriver(code: GatewayProviderCode): PaymentProvider {
  const driver = REGISTRY[code];
  if (!driver) {
    throw new Error(`Driver não registrado: ${code}`);
  }
  return driver;
}

export function listAvailableDrivers(): GatewayProviderCode[] {
  return Object.entries(REGISTRY)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k as GatewayProviderCode);
}

export function listAllDriverCodes(): GatewayProviderCode[] {
  return Object.keys(REGISTRY) as GatewayProviderCode[];
}

/* ─────────── Metadata para UI ─────────── */

export interface DriverMetadata {
  code: GatewayProviderCode;
  display_name: string;
  description: string;
  features: {
    pix_in: boolean;
    pix_out: boolean;
    credit_card: boolean;
    boleto: boolean;
    subscriptions: boolean;
  };
  implementation_status: 'ready' | 'skeleton' | 'planned';
  notes?: string;
}

export const DRIVER_CATALOG: Record<GatewayProviderCode, DriverMetadata> = {
  mock: {
    code: 'mock',
    display_name: 'Mock (Simulado)',
    description: 'Driver de desenvolvimento que simula todo o ciclo sem cobrar.',
    features: {
      pix_in: true,
      pix_out: true,
      credit_card: true,
      boleto: true,
      subscriptions: true,
    },
    implementation_status: 'ready',
    notes:
      'Bloqueado em produção. Use para validar fluxos antes de plugar gateway real.',
  },
  mercadopago: {
    code: 'mercadopago',
    display_name: 'Mercado Pago',
    description: 'PIX, Cartão de Crédito/Débito, Boleto.',
    features: {
      pix_in: true,
      pix_out: true,
      credit_card: true,
      boleto: true,
      subscriptions: true,
    },
    implementation_status: 'skeleton',
    notes: 'Implementação completa na Fase 2.',
  },
  asaas: {
    code: 'asaas',
    display_name: 'Asaas',
    description: 'PIX, Cartão, Boleto, transferências.',
    features: {
      pix_in: true,
      pix_out: true,
      credit_card: true,
      boleto: true,
      subscriptions: true,
    },
    implementation_status: 'planned',
  },
  pagarme: {
    code: 'pagarme',
    display_name: 'Pagar.me',
    description: 'PIX, Cartão, Boleto.',
    features: {
      pix_in: true,
      pix_out: true,
      credit_card: true,
      boleto: true,
      subscriptions: true,
    },
    implementation_status: 'planned',
  },
  iugu: {
    code: 'iugu',
    display_name: 'Iugu',
    description: 'Foco em assinaturas e cobranças recorrentes.',
    features: {
      pix_in: true,
      pix_out: false,
      credit_card: true,
      boleto: true,
      subscriptions: true,
    },
    implementation_status: 'planned',
  },
  stripe: {
    code: 'stripe',
    display_name: 'Stripe',
    description: 'Pagamentos internacionais (cartão).',
    features: {
      pix_in: false,
      pix_out: false,
      credit_card: true,
      boleto: false,
      subscriptions: true,
    },
    implementation_status: 'planned',
    notes: 'Para expansão internacional. PIX não suportado.',
  },
};
