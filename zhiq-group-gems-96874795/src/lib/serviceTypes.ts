// Service type definitions for the app
export type ServiceType = 'motorista' | 'motoboy' | 'mototaxi';

export interface ServiceTypeOption {
  value: ServiceType;
  label: string;
  icon: string;
  description: string;
}

// Todas as opções de serviço (para uso geral)
export const SERVICE_TYPE_OPTIONS: ServiceTypeOption[] = [
  {
    value: 'motorista',
    label: 'Motorista',
    icon: '🚗',
    description: 'Carro com ar-condicionado',
  },
  {
    value: 'motoboy',
    label: 'Motoboy',
    icon: '🛵',
    description: 'Entrega rápida de moto',
  },
  {
    value: 'mototaxi',
    label: 'Moto-táxi',
    icon: '🏍️',
    description: 'Corrida de passageiro',
  },
];

// Opções para CORRIDA (Passageiro) - Moto-Táxi e Carro
export const RIDE_SERVICE_OPTIONS: ServiceTypeOption[] = [
  {
    value: 'mototaxi',
    label: 'Moto-Táxi',
    icon: '🏍️',
    description: 'Corrida rápida de moto',
  },
  {
    value: 'motorista',
    label: 'Carro',
    icon: '🚗',
    description: 'Corrida de carro',
  },
];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  motorista: 'motorista',
  motoboy: 'motoboy',
  mototaxi: 'moto-táxi',
};

// Get display text for waiting status (differentiated by service)
export function getWaitingText(serviceType: ServiceType): string {
  if (serviceType === 'motorista') {
    return 'Buscando motorista...';
  }
  return `Aguardando ${SERVICE_TYPE_LABELS[serviceType]}...`;
}

// Get the subtitle for waiting status
export function getWaitingSubtitle(serviceType: ServiceType): string {
  if (serviceType === 'motorista') {
    return 'Sua solicitação foi enviada. Aguarde um motorista aceitar.';
  }
  return `Sua solicitação foi enviada. Aguarde um ${SERVICE_TYPE_LABELS[serviceType]} aceitar.`;
}
