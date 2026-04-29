/**
 * Parser inteligente de coordenadas
 * Aceita diversos formatos comuns de WhatsApp, Google Earth, Google Maps
 * Inclui suporte a DMS (graus/minutos/segundos) e indicadores N/S/E/W
 */

export interface ParsedCoordinates {
  latitude: number;
  longitude: number;
  isValid: boolean;
  originalText: string;
}

export interface CoordinateParseResult {
  success: boolean;
  coordinates: ParsedCoordinates | null;
  error?: string;
}

/**
 * Converte DMS (graus, minutos, segundos) para graus decimais
 */
function dmsToDecimal(degrees: number, minutes: number, seconds: number, direction: string): number {
  let decimal = Math.abs(degrees) + (minutes / 60) + (seconds / 3600);
  
  // Sul (S) e Oeste (W) são negativos
  if (direction === 'S' || direction === 'W' || direction === 'O') {
    decimal = -decimal;
  }
  
  return decimal;
}

/**
 * Tenta extrair coordenadas no formato DMS
 * Ex: 10°10'31"S, 59°26'53"W ou 10 10 31 S 59 26 53 W
 */
function parseDMS(text: string): { lat: number; lng: number } | null {
  // Normalizar o texto: remover caracteres especiais mas manter números, espaços e letras de direção
  const normalized = text
    .toUpperCase()
    .replace(/[°º'"´`′″]/g, ' ')
    .replace(/[,;/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Pattern para DMS: número número número direção número número número direção
  // Ex: "10 10 31 S 59 26 53 W"
  const dmsPattern = /(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s*([NSEW]|[O])\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s*([NSEW]|[O])/i;
  const dmsMatch = normalized.match(dmsPattern);
  
  if (dmsMatch) {
    const lat = dmsToDecimal(
      parseFloat(dmsMatch[1]),
      parseFloat(dmsMatch[2]),
      parseFloat(dmsMatch[3]),
      dmsMatch[4].toUpperCase()
    );
    const lng = dmsToDecimal(
      parseFloat(dmsMatch[5]),
      parseFloat(dmsMatch[6]),
      parseFloat(dmsMatch[7]),
      dmsMatch[8].toUpperCase()
    );
    
    if (isValidLatitude(lat) && isValidLongitude(lng)) {
      return { lat, lng };
    }
  }
  
  // Pattern alternativo: apenas dois conjuntos de DMS sem direção explícita
  // Ex: "10 10 31 59 26 53" (assume S e W para Brasil)
  const dmsNoDir = /(\d+)\s+(\d+)\s+(\d+\.?\d*)\s+(\d+)\s+(\d+)\s+(\d+\.?\d*)/;
  const dmsNoDirMatch = normalized.match(dmsNoDir);
  
  if (dmsNoDirMatch) {
    // Verificar se há indicadores de direção no texto original
    const hasS = /[Ss]ul|[Ss]outh|[Ss]\b/.test(text);
    const hasN = /[Nn]orte|[Nn]orth|[Nn]\b/.test(text);
    const hasW = /[Ww]est|[Oo]este|[Ww]\b|[Oo]\b/.test(text);
    const hasE = /[Ee]ast|[Ll]este|[Ee]\b/.test(text);
    
    const lat = dmsToDecimal(
      parseFloat(dmsNoDirMatch[1]),
      parseFloat(dmsNoDirMatch[2]),
      parseFloat(dmsNoDirMatch[3]),
      hasS ? 'S' : (hasN ? 'N' : 'S') // Default S para Brasil
    );
    const lng = dmsToDecimal(
      parseFloat(dmsNoDirMatch[4]),
      parseFloat(dmsNoDirMatch[5]),
      parseFloat(dmsNoDirMatch[6]),
      hasW || !hasE ? 'W' : 'E' // Default W para Brasil
    );
    
    if (isValidLatitude(lat) && isValidLongitude(lng)) {
      return { lat, lng };
    }
  }
  
  return null;
}

/**
 * Extrai coordenadas de diversos formatos de texto
 * Formatos suportados:
 * - -10.1754470, -59.4480456
 * - Latitude -10.1754470 Longitude -59.4480456
 * - Lat: -10.1754470 / Lng: -59.4480456
 * - -10.1754470 -59.4480456
 * - 10°10'31"S, 59°26'53"W
 * - 10 10 31 S 59 26 53 W
 * - Links do Google Maps (com @lat,lng)
 * - Links do WhatsApp (com lat,lng em query params)
 */
export function parseCoordinates(text: string): CoordinateParseResult {
  if (!text || typeof text !== 'string') {
    return {
      success: false,
      coordinates: null,
      error: 'Texto vazio ou inválido',
    };
  }

  const trimmedText = text.trim();
  
  // Tentar diferentes padrões de extração
  let lat: number | null = null;
  let lng: number | null = null;

  // Pattern 1: Formato Google Maps URL com @lat,lng,zoom
  const googleMapsAtPattern = /@(-?\d+\.?\d*),(-?\d+\.?\d*)/;
  const googleMapsAtMatch = trimmedText.match(googleMapsAtPattern);
  if (googleMapsAtMatch) {
    lat = parseFloat(googleMapsAtMatch[1]);
    lng = parseFloat(googleMapsAtMatch[2]);
  }

  // Pattern 2: Formato Google Maps URL com q=lat,lng ou ll=lat,lng
  if (lat === null || lng === null) {
    const googleMapsQueryPattern = /[?&](?:q|ll|query)=(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/;
    const googleMapsQueryMatch = trimmedText.match(googleMapsQueryPattern);
    if (googleMapsQueryMatch) {
      lat = parseFloat(googleMapsQueryMatch[1]);
      lng = parseFloat(googleMapsQueryMatch[2]);
    }
  }

  // Pattern 3: WhatsApp location format
  if (lat === null || lng === null) {
    const whatsappPattern = /maps[?&].*?(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/;
    const whatsappMatch = trimmedText.match(whatsappPattern);
    if (whatsappMatch) {
      lat = parseFloat(whatsappMatch[1]);
      lng = parseFloat(whatsappMatch[2]);
    }
  }

  // Pattern 4: Formato DMS (graus/minutos/segundos)
  if (lat === null || lng === null) {
    const dmsResult = parseDMS(trimmedText);
    if (dmsResult) {
      lat = dmsResult.lat;
      lng = dmsResult.lng;
    }
  }

  // Pattern 5: "Latitude X Longitude Y" ou "Lat: X / Lng: Y" ou variações
  if (lat === null || lng === null) {
    const labeledPattern = /lat(?:itude)?[:\s]*(-?\d+[.,]?\d*)[,\s/]*(?:e\s*)?l(?:on)?g(?:itude)?[:\s]*(-?\d+[.,]?\d*)/i;
    const labeledMatch = trimmedText.match(labeledPattern);
    if (labeledMatch) {
      lat = parseFloat(labeledMatch[1].replace(',', '.'));
      lng = parseFloat(labeledMatch[2].replace(',', '.'));
    }
  }

  // Pattern 6: Dois números decimais separados (vírgula como separador decimal)
  // -10,1754470 / -59,4480456
  if (lat === null || lng === null) {
    // Primeiro, tentar encontrar dois números com vírgula como decimal
    const commaDecimalPattern = /(-?\d+,\d+)\s*[/\s;]+\s*(-?\d+,\d+)/;
    const commaMatch = trimmedText.match(commaDecimalPattern);
    if (commaMatch) {
      lat = parseFloat(commaMatch[1].replace(',', '.'));
      lng = parseFloat(commaMatch[2].replace(',', '.'));
    }
  }

  // Pattern 7: Dois números separados por vírgula, espaço ou /
  // -10.1754470, -59.4480456
  // IMPORTANTE: Para Brasil, latitude é menor em módulo (-3 a -33)
  // e longitude é maior em módulo (-35 a -74)
  if (lat === null || lng === null) {
    const simplePattern = /(-?\d+\.?\d*)[,\s/]+(-?\d+\.?\d*)/;
    const simpleMatch = trimmedText.match(simplePattern);
    if (simpleMatch) {
      const num1 = parseFloat(simpleMatch[1]);
      const num2 = parseFloat(simpleMatch[2]);
      
      // Heurística para Brasil: |latitude| < |longitude|
      // Latitude Brasil: -3 a -33 (abs menor)
      // Longitude Brasil: -35 a -74 (abs maior)
      if (isValidLatitude(num1) && isValidLongitude(num2)) {
        // Verificar se parece coordenadas do Brasil (ambas negativas)
        if (num1 < 0 && num2 < 0) {
          // Usar heurística: menor módulo = latitude
          if (Math.abs(num1) < Math.abs(num2)) {
            lat = num1;
            lng = num2;
          } else {
            lat = num2;
            lng = num1;
          }
        } else {
          lat = num1;
          lng = num2;
        }
      } else if (isValidLatitude(num2) && isValidLongitude(num1)) {
        lat = num2;
        lng = num1;
      }
    }
  }

  // Pattern 8: Extrair apenas números do texto (último recurso)
  if (lat === null || lng === null) {
    // Normalizar: trocar vírgula por ponto para decimais
    const normalizedText = trimmedText.replace(/(\d),(\d)/g, '$1.$2');
    
    // Encontrar todos os números decimais
    const allNumbers = normalizedText.match(/-?\d+\.\d+/g);
    if (allNumbers && allNumbers.length >= 2) {
      const num1 = parseFloat(allNumbers[0]);
      const num2 = parseFloat(allNumbers[1]);
      
      // Usar heurística para Brasil
      if (num1 < 0 && num2 < 0 && isValidLatitude(num1) && isValidLongitude(num2)) {
        if (Math.abs(num1) < Math.abs(num2)) {
          lat = num1;
          lng = num2;
        } else {
          lat = num2;
          lng = num1;
        }
      } else if (isValidLatitude(num1) && isValidLongitude(num2)) {
        lat = num1;
        lng = num2;
      } else if (isValidLatitude(num2) && isValidLongitude(num1)) {
        lat = num2;
        lng = num1;
      }
    }
  }

  // Pattern 9: Números inteiros ou com menos precisão
  if (lat === null || lng === null) {
    const normalizedText = trimmedText.replace(/(\d),(\d)/g, '$1.$2');
    const allNumbers = normalizedText.match(/-?\d+\.?\d*/g);
    
    if (allNumbers && allNumbers.length >= 2) {
      // Filtrar números que parecem coordenadas (não muito grandes)
      const validNumbers = allNumbers
        .map(n => parseFloat(n))
        .filter(n => !isNaN(n) && Math.abs(n) <= 180);
      
      if (validNumbers.length >= 2) {
        const num1 = validNumbers[0];
        const num2 = validNumbers[1];
        
        // Usar heurística para Brasil
        if (num1 < 0 && num2 < 0 && isValidLatitude(num1) && isValidLongitude(num2)) {
          if (Math.abs(num1) < Math.abs(num2)) {
            lat = num1;
            lng = num2;
          } else {
            lat = num2;
            lng = num1;
          }
        } else if (isValidLatitude(num1) && isValidLongitude(num2)) {
          lat = num1;
          lng = num2;
        } else if (isValidLatitude(num2) && isValidLongitude(num1)) {
          lat = num2;
          lng = num1;
        }
      }
    }
  }

  // Validar resultado final
  if (lat !== null && lng !== null && isValidLatitude(lat) && isValidLongitude(lng)) {
    return {
      success: true,
      coordinates: {
        latitude: lat,
        longitude: lng,
        isValid: true,
        originalText: trimmedText,
      },
    };
  }

  return {
    success: false,
    coordinates: null,
    error: 'Não foi possível identificar coordenadas válidas. Cole a localização do WhatsApp ou Google Earth.',
  };
}

/**
 * Valida se um número é uma latitude válida
 */
export function isValidLatitude(lat: number): boolean {
  return !isNaN(lat) && lat >= -90 && lat <= 90;
}

/**
 * Valida se um número é uma longitude válida
 */
export function isValidLongitude(lng: number): boolean {
  return !isNaN(lng) && lng >= -180 && lng <= 180;
}

/**
 * Formata coordenadas para exibição
 */
export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}
