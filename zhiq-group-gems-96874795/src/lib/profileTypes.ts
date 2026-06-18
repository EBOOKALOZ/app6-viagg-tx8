import { Car, Bike, Store, Truck, Zap, Building2, CarFront } from 'lucide-react';
import { LucideIcon } from 'lucide-react';

export interface ProfileTypeConfig {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  route: string;
  requiresVehicle: boolean;
}

export const PROFILE_TYPES: Record<string, ProfileTypeConfig> = {
  passenger: {
    id: 'passenger',
    label: 'Passageiro',
    description: 'Solicite corridas',
    icon: Car,
    route: '/passenger',
    requiresVehicle: false,
  },
  driver: {
    id: 'driver',
    label: 'Motorista',
    description: 'Aceite corridas de carro',
    icon: Truck,
    route: '/driver',
    requiresVehicle: true,
  },
  motoboy: {
    id: 'motoboy',
    label: 'Motoboy',
    description: 'Entregas rápidas de moto',
    icon: Bike,
    route: '/motoboy',
    requiresVehicle: true,
  },
  mototaxi: {
    id: 'mototaxi',
    label: 'Moto-Táxi',
    description: 'Corridas de moto',
    icon: Zap,
    route: '/mototaxi',
    requiresVehicle: true,
  },
  merchant: {
    id: 'merchant',
    label: 'Lojista',
    description: 'Gerencie sua loja, solicite motoboys e acompanhe seus pedidos',
    icon: Store,
    route: '/merchant',
    requiresVehicle: false,
  },
  imoveis: {
    id: 'imoveis',
    label: 'Imóveis',
    description: 'Anuncie imóveis e fale com os interessados',
    icon: Building2,
    route: '/anunciante/imoveis',
    requiresVehicle: false,
  },
  veiculos: {
    id: 'veiculos',
    label: 'Veículos',
    description: 'Anuncie veículos e fale direto com os interessados',
    icon: CarFront,
    route: '/anunciante/veiculos',
    requiresVehicle: false,
  },
  freteiro: {
    id: 'freteiro',
    label: 'Fretes',
    description: 'Cargas leves, mudanças e caminhões',
    icon: Truck,
    route: '/freteiro',
    requiresVehicle: true,
  },
} as const;

export type ProfileType = keyof typeof PROFILE_TYPES;

export function getProfileRoute(profileType: string): string {
  return PROFILE_TYPES[profileType]?.route || '/';
}

export function getProfileConfig(profileType: string): ProfileTypeConfig | undefined {
  return PROFILE_TYPES[profileType];
}
