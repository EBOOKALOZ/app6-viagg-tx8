import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formata um valor numérico para o padrão de moeda brasileira (BRL).
 * Ex: 120000 -> R$ 120.000,00
 */
export function formatCurrencyBRL(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return 'R$ 0,00';
  const numericValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numericValue)) return 'R$ 0,00';
  
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
}

/**
 * Converte uma string formatada em BRL (ou apenas números) para um número real.
 * Lida com separadores de milhar e decimal brasileiros.
 */
export function parseBRLCurrency(value: string | number): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  
  const strValue = String(value);
  // Se contiver vírgula, assume que é o separador decimal brasileiro
  if (strValue.includes(',')) {
    // Remove tudo que não é dígito ou vírgula
    const clean = strValue.replace(/[^\d,]/g, '');
    const parts = clean.split(',');
    const intPart = parts[0] || '0';
    const decPart = parts[1] || '00';
    return parseFloat(`${intPart}.${decPart}`);
  }
  // Tratamento para valores que já vem com ponto decimal ou apanas inteiros
  const cleanNum = strValue.replace(/[^\d.]/g, '');
  return parseFloat(cleanNum) || 0;
}
export function formatBrazilianPhone(value: string): string {
  if (!value) return '';
  let clean = value.replace(/\D/g, '');
  if (clean.startsWith('55') && clean.length > 11) {
    clean = clean.slice(2);
  }
  clean = clean.slice(0, 11); // limita a 11 dígitos (DDD + 9 dígitos)
  if (clean.length === 0) return '';
  if (clean.length <= 2) return `(${clean}`;
  if (clean.length <= 6) return `(${clean.slice(0, 2)}) ${clean.slice(2)}`;
  if (clean.length <= 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7, 11)}`;
}

export function toE164(formatted: string): string {
  if (!formatted) return '';
  const clean = formatted.replace(/\D/g, '');
  if (clean.length === 10 || clean.length === 11) return `+55${clean}`;
  if (clean.startsWith('55') && clean.length > 11) return `+${clean}`;
  return formatted;
}
export function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD') // Decomposes accents (e.g., � -> A + ~)
    .replace(/[\u0300-\u036f]/g, '') // Removes the accent marks
    .replace(/[^a-zA-Z0-9.-]/g, '_') // Replaces non-alphanumeric (except dot and hyphen) with underscore
    .toLowerCase();
}
