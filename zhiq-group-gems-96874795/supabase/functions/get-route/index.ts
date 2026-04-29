import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RouteRequest {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  waypoints?: Array<{ lat: number; lng: number }>;
  snapRadius?: number; // Raio em metros para snap à via mais próxima (default: 500m)
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MAPBOX_TOKEN = Deno.env.get("MAPBOX_ACCESS_TOKEN");
    
    if (!MAPBOX_TOKEN) {
      console.error("[get-route] MAPBOX_ACCESS_TOKEN não configurado");
      return new Response(
        JSON.stringify({ error: "Mapbox token não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { origin, destination, waypoints, snapRadius = 500 }: RouteRequest = await req.json();
    
    // LOG CRÍTICO: Mostrar coordenadas recebidas do frontend
    console.log("[get-route] 📥 COORDENADAS RECEBIDAS:", {
      origem: origin,
      destino: destination,
      waypoints: waypoints || 'nenhum',
      snapRadius: snapRadius + 'm'
    });
    
    if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) {
      console.error("[get-route] ❌ Coordenadas inválidas:", { origin, destination });
      return new Response(
        JSON.stringify({ error: "Coordenadas inválidas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Garantir que são números válidos
    const originLat = Number(origin.lat);
    const originLng = Number(origin.lng);
    const destLat = Number(destination.lat);
    const destLng = Number(destination.lng);

    // Construir coordenadas para a API
    // Formato: lng,lat;lng,lat;...
    let coordinates = `${originLng},${originLat}`;
    
    // Construir string de radiuses (um valor por ponto)
    // Isso permite que a Mapbox "snape" cada ponto para a via mais próxima dentro do raio
    let radiuses = `${snapRadius}`;
    
    if (waypoints && waypoints.length > 0) {
      waypoints.forEach(wp => {
        coordinates += `;${Number(wp.lng)},${Number(wp.lat)}`;
        radiuses += `;${snapRadius}`;
      });
    }
    
    coordinates += `;${destLng},${destLat}`;
    radiuses += `;${snapRadius}`;

    // LOG CRÍTICO: Mostrar string final enviada ao Mapbox
    console.log("[get-route] 🗺️ STRING MAPBOX:", coordinates);
    console.log("[get-route] 📍 SNAP RADIUSES:", radiuses);

    // Chamar Mapbox Directions API com radiuses para snap automático
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&overview=full&radiuses=${radiuses}&access_token=${MAPBOX_TOKEN}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok || !data.routes || data.routes.length === 0) {
      console.error("[get-route] Erro Mapbox:", data);
      return new Response(
        JSON.stringify({ error: "Não foi possível calcular a rota", details: data }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const route = data.routes[0];
    
    // Mapbox retorna distância em METROS
    const distanceMeters = route.distance;
    const distanceKm = distanceMeters / 1000;
    
    console.log("[get-route] ✅ Rota calculada:", {
      distanceMeters,
      distanceKm: Math.round(distanceKm * 10) / 10,
      durationSeconds: route.duration,
      durationMinutes: Math.ceil(route.duration / 60),
    });
    
    // Retornar apenas os dados necessários para visualização
    // IMPORTANTE: distance está em METROS (o frontend converte para km)
    return new Response(
      JSON.stringify({
        geometry: route.geometry, // GeoJSON LineString
        distance: route.distance, // metros
        duration: route.duration, // segundos
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[get-route] Erro:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno", message: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
