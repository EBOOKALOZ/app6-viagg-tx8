const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

/**
 * Converts a text address into geographic coordinates using Mapbox Geocoding API
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    if (!address.trim()) return null;

    try {
        const query = encodeURIComponent(address);
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&limit=1`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("Geocoding fetch failed");

        const data = await res.json();

        if (data.features && data.features.length > 0) {
            return {
                lng: data.features[0].center[0],
                lat: data.features[0].center[1]
            };
        }
        return null;
    } catch (err) {
        console.error("Erro no geocoding do endereço:", err);
        return null;
    }
}

/**
 * Reverse geocodes coordinates to find specific details like neighborhood (bairro), city, and state
 */
export async function reverseGeocodeDetails(lat: number, lng: number): Promise<{ bairro: string; cidade: string; estado: string } | null> {
    try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&language=pt&types=neighborhood,locality,place,region`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("Reverse geocoding fetch failed");

        const data = await res.json();
        if (!data.features || data.features.length === 0) return null;

        let bairro = "";
        let cidade = "";
        let estado = "";

        data.features.forEach((feature: any) => {
            if (feature.id.startsWith("neighborhood") || feature.id.startsWith("locality")) {
                if (!bairro) bairro = feature.text;
            }
            if (feature.id.startsWith("place")) {
                if (!cidade) cidade = feature.text;
            }
            if (feature.id.startsWith("region")) {
                if (!estado) estado = feature.context?.[0]?.short_code?.replace('BR-', '') || feature.text;
            }
        });

        // Fallback for some Brazilian regions where neighborhood might be missed
        if (!bairro && data.features.length > 0) {
            bairro = data.features[0].text;
        }

        return {
            bairro: bairro || "Bairro desconhecido",
            cidade: cidade || "Cidade desconhecida",
            estado: estado || "UF"
        };
    } catch (err) {
        console.error("Erro no reverse geocoding detalhado:", err);
        return null;
    }
}
