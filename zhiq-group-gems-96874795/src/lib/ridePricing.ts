/**
 * Cálculo de preço de corrida baseado no tipo de veículo
 * 
 * Regras:
 * - Moto-Táxi: preço progressivo por faixa de km (até 150 km)
 * - Carro: preço linear (sem limite específico, usa limite global)
 */

import { ServiceType } from './serviceTypes';

// Limite global de distância para todas as corridas
export const GLOBAL_MAX_DISTANCE_KM = 150;

// Limite específico por tipo de veículo
export const VEHICLE_MAX_DISTANCE_KM = {
  mototaxi: 150,
  motorista: 150, // Carro usa limite global
} as const;

// ============================================================
// MOTO-TÁXI: PREÇO PROGRESSIVO
// ============================================================
// Base: R$ 6,00
// 0–20 km → R$ 2,20 / km
// 20–80 km → R$ 1,90 / km  
// 80–150 km → R$ 1,50 / km + R$ 25,00 fixo
// ============================================================

interface PriceTier {
  maxKm: number;
  pricePerKm: number;
  fixedBonus?: number;
}

export const MOTOTAXI_PRICING = {
  BASE_PRICE: 6.00,
  TIERS: [
    { maxKm: 20, pricePerKm: 2.20 },
    { maxKm: 80, pricePerKm: 1.90 },
    { maxKm: 150, pricePerKm: 1.50, fixedBonus: 25.00 },
  ] as PriceTier[],
  MAX_DISTANCE_KM: 150,
  label: 'Moto-Táxi',
} as const;

// ============================================================
// CARRO: PREÇO LINEAR COM ADICIONAL POR PASSAGEIRO
// ============================================================
// Base: R$ 8,00
// Por KM: R$ 3,00
// Adicional por passageiro extra: R$ 2,00 (a partir do 2º)
// Mínimo: R$ 12,00
// ============================================================
export const MOTORISTA_PRICING = {
  BASE_PRICE: 8.00,                    // R$ 8,00 base
  PRICE_PER_KM: 3.00,                  // R$ 3,00 por km
  ADDITIONAL_PER_PASSENGER: 2.00,      // R$ 2,00 por passageiro extra
  MIN_PRICE: 12.00,                    // Mínimo R$ 12,00
  MAX_PASSENGERS: 4,                   // Máximo de 4 passageiros
  MAX_DISTANCE_KM: null,               // Sem limite específico (usa limite global)
  label: 'Carro',
} as const;

// Mantido para compatibilidade com código existente
export const RIDE_PRICING = {
  mototaxi: {
    BASE_PRICE: MOTOTAXI_PRICING.BASE_PRICE,
    PRICE_PER_KM: 2.20, // Valor médio para exibição
    MIN_PRICE: 8.00,
    MAX_DISTANCE_KM: MOTOTAXI_PRICING.MAX_DISTANCE_KM,
    label: MOTOTAXI_PRICING.label,
  },
  motorista: MOTORISTA_PRICING,
} as const;

export interface PriceCalculation {
  price: number;
  isBlocked: boolean;
  blockReason: string | null;
  breakdown?: {
    basePrice: number;
    distancePrice: number;
    passengerExtra: number;
    passengerCount: number;
  };
}

/**
 * Calcula preço progressivo para Moto-Táxi
 */
function calculateMototaxiPrice(distanceKm: number): number {
  const { BASE_PRICE, TIERS } = MOTOTAXI_PRICING;
  
  let totalPrice = BASE_PRICE;
  let remainingKm = distanceKm;
  let prevMaxKm = 0;
  let fixedBonus = 0;
  
  for (const tier of TIERS) {
    if (remainingKm <= 0) break;
    
    const tierKm = Math.min(remainingKm, tier.maxKm - prevMaxKm);
    totalPrice += tierKm * tier.pricePerKm;
    remainingKm -= tierKm;
    prevMaxKm = tier.maxKm;
    
    // Verificar se precisa adicionar bônus fixo (80+ km)
    if (tier.fixedBonus && distanceKm >= 80) {
      fixedBonus = tier.fixedBonus;
    }
  }
  
  return totalPrice + fixedBonus;
}

/**
 * Calcula o preço da corrida baseado no tipo de veículo, distância e passageiros
 * @param distanceKm - Distância em km
 * @param serviceType - Tipo de serviço (mototaxi ou motorista)
 * @param passengerCount - Número de passageiros (1-4, usado apenas para Carro)
 */
export function calculateRidePrice(
  distanceKm: number,
  serviceType: ServiceType | null,
  passengerCount: number = 1
): PriceCalculation {
  // Se não há tipo selecionado, retorna zerado
  if (!serviceType || !['mototaxi', 'motorista'].includes(serviceType)) {
    return {
      price: 0,
      isBlocked: false,
      blockReason: null,
    };
  }

  // REGRA GLOBAL: Verificar limite máximo de 150km para todas as corridas
  if (distanceKm > GLOBAL_MAX_DISTANCE_KM) {
    return {
      price: 0,
      isBlocked: true,
      blockReason: `Para esta distância, recomendamos Carro ou Frete.`,
    };
  }

  // === MOTO-TÁXI: Preço progressivo ===
  if (serviceType === 'mototaxi') {
    // Verificar limite específico do Moto-Táxi (150 km)
    if (distanceKm > MOTOTAXI_PRICING.MAX_DISTANCE_KM) {
      return {
        price: 0,
        isBlocked: true,
        blockReason: `Para esta distância, recomendamos Carro ou Frete.`,
      };
    }
    
    const calculatedPrice = calculateMototaxiPrice(distanceKm);
    
    return {
      price: Math.round(calculatedPrice * 100) / 100,
      isBlocked: false,
      blockReason: null,
    };
  }

  // === CARRO: Preço linear + adicional por passageiro ===
  if (serviceType === 'motorista') {
    const { BASE_PRICE, PRICE_PER_KM, ADDITIONAL_PER_PASSENGER, MIN_PRICE, MAX_PASSENGERS } = MOTORISTA_PRICING;
    
    // Validar e limitar número de passageiros
    const validPassengerCount = Math.min(Math.max(1, passengerCount), MAX_PASSENGERS);
    
    // Calcular preço base: base + (distância * preço por km)
    const basePrice = BASE_PRICE;
    const distancePrice = distanceKm * PRICE_PER_KM;
    
    // Adicional por passageiro extra (a partir do 2º)
    const extraPassengers = Math.max(0, validPassengerCount - 1);
    const passengerExtra = extraPassengers * ADDITIONAL_PER_PASSENGER;
    
    // Preço calculado
    const calculatedPrice = basePrice + distancePrice + passengerExtra;
    
    // Garantir valor mínimo
    const finalPrice = Math.max(calculatedPrice, MIN_PRICE);

    return {
      price: Math.round(finalPrice * 100) / 100,
      isBlocked: false,
      blockReason: null,
      breakdown: {
        basePrice,
        distancePrice: Math.round(distancePrice * 100) / 100,
        passengerExtra,
        passengerCount: validPassengerCount,
      },
    };
  }

  return {
    price: 0,
    isBlocked: false,
    blockReason: null,
  };
}

/**
 * Formata preço para exibição
 */
export function formatRidePrice(price: number): string {
  if (price <= 0) return '---';
  return `R$ ${price.toFixed(2).replace('.', ',')}`;
}

/**
 * Retorna informações de preço para ambos os tipos (para comparação)
 */
export function getBothPrices(distanceKm: number): {
  mototaxi: PriceCalculation;
  motorista: PriceCalculation;
} {
  return {
    mototaxi: calculateRidePrice(distanceKm, 'mototaxi'),
    motorista: calculateRidePrice(distanceKm, 'motorista'),
  };
}
