/**
 * Pricing e tipos para o módulo de Fretes
 */

export interface FreteCategoria {
  id: string;
  nome: string;
  descricao: string | null;
  capacidade_kg: number;
  capacidade_m3: number | null;
  taxa_minima: number;
  valor_base_km: number;
}

export interface FreteTipoCarga {
  id: string;
  nome: string;
  peso_estimado_kg: number;
  volume_estimado_m3: number;
  categoria_sugerida: string; // ID da categoria sugerida
}

// Tipos de carga pré-definidos com sugestão de veículo
export const TIPOS_CARGA: FreteTipoCarga[] = [
  { 
    id: 'documentos', 
    nome: 'Documentos / Encomendas', 
    peso_estimado_kg: 10,
    volume_estimado_m3: 0.1,
    categoria_sugerida: 'utilitario'
  },
  { 
    id: 'eletronicos', 
    nome: 'Eletrônicos / Eletrodomésticos', 
    peso_estimado_kg: 50,
    volume_estimado_m3: 0.5,
    categoria_sugerida: 'utilitario'
  },
  { 
    id: 'moveis_pequenos', 
    nome: 'Móveis pequenos (mesa, cadeira)', 
    peso_estimado_kg: 100,
    volume_estimado_m3: 1.5,
    categoria_sugerida: 'utilitario'
  },
  { 
    id: 'mudanca_pequena', 
    nome: 'Mudança pequena (kitnet)', 
    peso_estimado_kg: 500,
    volume_estimado_m3: 5,
    categoria_sugerida: 'furgao'
  },
  { 
    id: 'mudanca_media', 
    nome: 'Mudança média (apartamento)', 
    peso_estimado_kg: 1500,
    volume_estimado_m3: 15,
    categoria_sugerida: 'caminhao_pequeno'
  },
  { 
    id: 'mudanca_grande', 
    nome: 'Mudança grande (casa)', 
    peso_estimado_kg: 3000,
    volume_estimado_m3: 30,
    categoria_sugerida: 'caminhao_grande'
  },
  { 
    id: 'materiais_construcao', 
    nome: 'Materiais de construção', 
    peso_estimado_kg: 2000,
    volume_estimado_m3: 10,
    categoria_sugerida: 'caminhao_pequeno'
  },
  { 
    id: 'outro', 
    nome: 'Outro (especificar)', 
    peso_estimado_kg: 100,
    volume_estimado_m3: 1,
    categoria_sugerida: 'utilitario'
  },
];

export type TipoCarroceria = 'indiferente' | 'bau';

export const TIPOS_CARROCERIA: { id: TipoCarroceria; label: string; descricao: string }[] = [
  { id: 'indiferente', label: 'Não importa', descricao: 'Aberto ou fechado' },
  { id: 'bau', label: 'Baú (fechado)', descricao: 'Proteção contra chuva' },
];

/**
 * Calcula o valor estimado do frete baseado na categoria e distância
 */
export function calcularValorFrete(
  categoria: FreteCategoria,
  distanciaKm: number,
  multiplicador: number = 1
): number {
  const valorBase = distanciaKm * categoria.valor_base_km;
  const valorFinal = Math.max(valorBase, categoria.taxa_minima);
  return Math.round(valorFinal * multiplicador * 100) / 100;
}

/**
 * Sugere a categoria de veículo baseada no tipo de carga
 */
export function sugerirCategoria(
  tipoCargaId: string,
  categorias: FreteCategoria[]
): FreteCategoria | null {
  const tipoCarga = TIPOS_CARGA.find(t => t.id === tipoCargaId);
  if (!tipoCarga) return null;
  
  // Mapear nome da sugestão para categoria real
  const mapeamento: Record<string, string> = {
    'utilitario': 'Utilitário',
    'furgao': 'Furgão',
    'caminhao_pequeno': 'Caminhão Pequeno',
    'caminhao_grande': 'Caminhão Grande',
  };
  
  const nomeSugerido = mapeamento[tipoCarga.categoria_sugerida];
  return categorias.find(c => c.nome === nomeSugerido) || categorias[0] || null;
}

/**
 * Formata valor em reais
 */
export function formatarValorFrete(valor: number): string {
  return `R$ ${valor.toFixed(2).replace('.', ',')}`;
}
