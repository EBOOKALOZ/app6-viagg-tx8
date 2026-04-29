import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GeocodeRequest {
  address: string;
}

interface GeocodeResult {
  lat: number;
  lng: number;
  display_name: string;
  type?: string; // 'exact' | 'city' | 'locality'
  is_approximate?: boolean;
}

/**
 * Detecta se o texto parece ser apenas uma cidade/localidade (sem rua/número)
 */
function isCityOnlySearch(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  
  // Palavras que indicam endereço específico
  const streetIndicators = [
    'rua', 'r.', 'av', 'av.', 'avenida', 'travessa', 'trav.', 
    'alameda', 'al.', 'praça', 'pç.', 'largo', 'rodovia', 'rod.', 
    'br-', 'mt-', 'go-', 'sp-', 'estrada', 'estr.', 'quadra', 'qd.',
    'lote', 'lt.', 'setor', 'conjunto', 'conj.', 'bloco', 'bl.'
  ];
  
  // Se contém indicador de rua, é endereço
  for (const indicator of streetIndicators) {
    if (normalized.includes(indicator)) return false;
  }
  
  // Contém número seguido de vírgula ou espaço? (ex: "123," ou "123 ")
  // Isso indica número de casa/lote
  if (/\d+[\s,]/.test(normalized)) return false;
  
  // CEP (formato brasileiro: 5 dígitos + hífen + 3 dígitos ou 8 dígitos)
  if (/\d{5}-?\d{3}/.test(normalized)) return false;
  
  // Palavras comuns em nomes de cidade/estado que devem ser ignoradas na contagem
  const locationWords = [
    'brasil', 'br', 'mato', 'grosso', 'minas', 'gerais', 'são', 'paulo',
    'rio', 'janeiro', 'grande', 'sul', 'norte', 'goiás', 'bahia',
    'paraná', 'santa', 'catarina', 'pernambuco', 'ceará', 'amazonas',
    'pará', 'maranhão', 'piauí', 'tocantins', 'rondônia', 'acre',
    'amapá', 'roraima', 'sergipe', 'alagoas', 'paraíba', 'espírito',
    'distrito', 'federal', 'do', 'da', 'de', 'dos', 'das', '-'
  ];
  
  // Remove palavras de localização para contar palavras significativas
  const words = normalized
    .split(/[\s,\-]+/)
    .filter(w => w.length > 1 && !locationWords.includes(w));
  
  // Se restam poucas palavras significativas, é busca por cidade
  // Ex: "Aripuanã, Mato Grosso, Brasil" -> só "aripuanã" resta
  if (words.length <= 2) return true;
  
  // Padrão típico de cidade: "Nome, Estado" ou "Nome - UF"
  const cityStatePattern = /^[\w\sáéíóúâêîôûãõç]+[,\-]\s*([\w\sáéíóúâêîôûãõç]+|[A-Z]{2})(\s*,\s*brasil)?$/i;
  if (cityStatePattern.test(normalized)) return true;
  
  return false;
}

/**
 * Geocode usando Mapbox API (mais confiável que Nominatim para edge functions)
 */
async function geocodeWithMapbox(
  address: string, 
  types?: string
): Promise<GeocodeResult | null> {
  const MAPBOX_TOKEN = Deno.env.get("MAPBOX_ACCESS_TOKEN");
  
  if (!MAPBOX_TOKEN) {
    console.warn("[geocode-address] MAPBOX_ACCESS_TOKEN não configurado");
    return null;
  }

  const searchQuery = address.includes("Brasil") ? address : `${address}, Brasil`;
  
  let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${MAPBOX_TOKEN}&country=br&limit=1&language=pt`;
  
  // Adicionar filtro de tipos se especificado
  if (types) {
    url += `&types=${types}`;
  }

  console.log("[geocode-address] 🔍 Mapbox request:", { query: searchQuery, types });

  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      console.error("[geocode-address] Mapbox error:", response.status);
      return null;
    }

    const data = await response.json();

    if (!data.features || data.features.length === 0) {
      console.log("[geocode-address] Mapbox: nenhum resultado");
      return null;
    }

    const feature = data.features[0];
    const [lng, lat] = feature.center;

    return {
      lat,
      lng,
      display_name: feature.place_name,
      type: feature.place_type?.[0] || 'unknown',
      is_approximate: ['place', 'locality', 'region'].includes(feature.place_type?.[0]),
    };
  } catch (error) {
    console.error("[geocode-address] Mapbox fetch error:", error);
    return null;
  }
}

/**
 * Fallback para Nominatim (OpenStreetMap)
 */
async function geocodeWithNominatim(address: string): Promise<GeocodeResult | null> {
  const searchAddress = address.includes("Brasil") ? address : `${address}, Brasil`;

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}&limit=1&countrycodes=br`,
      {
        headers: {
          "User-Agent": "ViaggApp/1.0 (moto-taxi-service)",
        },
      }
    );

    if (!response.ok) {
      console.error("[geocode-address] Nominatim error:", response.status);
      return null;
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      return null;
    }

    const placeType = data[0].type || data[0].class || 'unknown';
    const isApproximate = ['city', 'town', 'village', 'hamlet', 'municipality', 'administrative'].includes(placeType);

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      display_name: data[0].display_name,
      type: placeType,
      is_approximate: isApproximate,
    };
  } catch (error) {
    console.error("[geocode-address] Nominatim fetch error:", error);
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { address }: GeocodeRequest = await req.json();

    if (!address?.trim()) {
      return new Response(
        JSON.stringify({ error: "Endereço não fornecido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanAddress = address.trim();
    console.log("[geocode-address] 📍 Geocodificando:", cleanAddress);

    const isCitySearch = isCityOnlySearch(cleanAddress);
    console.log("[geocode-address] Tipo de busca:", isCitySearch ? "cidade/localidade" : "endereço completo");

    let result: GeocodeResult | null = null;

    // ESTRATÉGIA 1: Mapbox (preferencial)
    if (isCitySearch) {
      // Buscar como cidade primeiro
      result = await geocodeWithMapbox(cleanAddress, "place,locality,region");
    } else {
      // Buscar como endereço
      result = await geocodeWithMapbox(cleanAddress, "address,poi");
    }

    // ESTRATÉGIA 2: Mapbox sem filtro de tipo (fallback)
    if (!result) {
      console.log("[geocode-address] 🔄 Fallback 1: Mapbox sem filtro");
      result = await geocodeWithMapbox(cleanAddress);
    }

    // ESTRATÉGIA 3: Mapbox buscando apenas cidade (se endereço falhou)
    if (!result && !isCitySearch) {
      console.log("[geocode-address] 🔄 Fallback 2: Mapbox como cidade");
      result = await geocodeWithMapbox(cleanAddress, "place,locality,region");
    }

    // ESTRATÉGIA 4: Nominatim como último recurso
    if (!result) {
      console.log("[geocode-address] 🔄 Fallback 3: Nominatim");
      result = await geocodeWithNominatim(cleanAddress);
    }

    // Nenhuma estratégia funcionou
    if (!result) {
      console.log("[geocode-address] ❌ Todas as tentativas falharam para:", cleanAddress);
      return new Response(
        JSON.stringify({ 
          error: "Endereço não encontrado", 
          found: false,
          message: "Tente ser mais específico ou ajuste diretamente no mapa"
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[geocode-address] ✅ Resultado:", {
      lat: result.lat,
      lng: result.lng,
      type: result.type,
      is_approximate: result.is_approximate,
    });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[geocode-address] Erro:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno", message: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
