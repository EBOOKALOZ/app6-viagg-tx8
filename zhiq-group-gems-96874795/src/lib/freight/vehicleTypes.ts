import { CarFront, Caravan, Bus, Truck, ContainerIcon, type LucideIcon } from "lucide-react";

export interface FreightVehicleType {
  value: string;
  label: string;
  icon: LucideIcon;
}

/** Lista fechada de tipos de veículo de frete — texto livre no banco (sem enum). */
export const FREIGHT_VEHICLE_TYPES: FreightVehicleType[] = [
  { value: "Utilitário", label: "Utilitário", icon: CarFront },
  { value: "Fiorino", label: "Fiorino", icon: Caravan },
  { value: "Van", label: "Van", icon: Bus },
  { value: "Caminhão Pequeno", label: "Caminhão Pequeno", icon: Truck },
  { value: "Caminhão Médio", label: "Caminhão Médio", icon: ContainerIcon },
];

export function resolveFreightVehicleIcon(value: string | null | undefined): LucideIcon {
  return FREIGHT_VEHICLE_TYPES.find((v) => v.value === value)?.icon || Truck;
}

/** Tipos de carga usados pelo widget de triagem (Motoboy x Fretes). */
export const FREIGHT_CARGO_TYPES = [
  "Documentos / Caixa Pequena",
  "Móveis",
  "Eletrodomésticos",
  "Equipamentos",
  "Materiais de Construção",
  "Mudança Residencial",
  "Mercadoria em Geral",
  "Outro Volume Grande",
] as const;

export type FreightCargoType = (typeof FREIGHT_CARGO_TYPES)[number];

const BULKY_CARGO_TYPES: ReadonlyArray<string> = [
  "Móveis",
  "Eletrodomésticos",
  "Equipamentos",
  "Materiais de Construção",
  "Mudança Residencial",
];

/** Decide se uma solicitação deve ir pra Fretes (true) ou Motoboy (false). */
export function shouldRouteToFreight(weightKg: number, cargoType: string): boolean {
  if (weightKg > 20) return true;
  return BULKY_CARGO_TYPES.includes(cargoType);
}
