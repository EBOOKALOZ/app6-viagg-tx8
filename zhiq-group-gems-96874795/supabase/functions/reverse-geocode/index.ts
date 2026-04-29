import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lat, lng } = await req.json();

    if (typeof lat !== "number" || typeof lng !== "number") {
      return new Response(
        JSON.stringify({ error: "lat e lng são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const MAPBOX_TOKEN = Deno.env.get("MAPBOX_ACCESS_TOKEN");

    if (!MAPBOX_TOKEN) {
      // Fallback: Nominatim
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { "User-Agent": "ViaggApp/1.0" } }
      );
      const data = await res.json();
      return new Response(
        JSON.stringify({ address: data.display_name || `${lat}, ${lng}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&language=pt&limit=1&types=address,poi`;

    const res = await fetch(url);
    const data = await res.json();

    let address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    if (data.features && data.features.length > 0) {
      address = data.features[0].place_name || address;
    }

    return new Response(
      JSON.stringify({ address }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[reverse-geocode] Erro:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno", message: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
