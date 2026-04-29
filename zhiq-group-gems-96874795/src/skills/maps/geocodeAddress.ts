const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

/**
 * Converts a text address into geographic coordinates using Mapbox Geocoding API
 */
export async function geocodeAddress(address: string): Promise<[number, number] | null> {
    if (!address.trim()) return null;

    try {
        const query = encodeURIComponent(address);
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&limit=1`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("Geocoding fetch failed");

        const data = await res.json();

        if (data.features && data.features.length > 0) {
            return data.features[0].center; // Returns [longitude, latitude]
        }
        return null;
    } catch (err) {
        console.error("Erro no geocoding do endereço:", err);
        return null;
    }
}
