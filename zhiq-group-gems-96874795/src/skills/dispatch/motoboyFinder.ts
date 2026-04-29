import { supabase } from "@/integrations/supabase/client";

export interface MotoboyLocation {
    id: string;
    motoboy_id: string;
    lat: number;
    lng: number;
    status: string;
    updated_at: string;
}

/**
 * Busca a lista de motoboys que estão com o status "online".
 */
export async function findAvailableMotoboys(): Promise<MotoboyLocation[]> {
    const { data, error } = await supabase
        .from("motoboy_locations")
        .select("*")
        .eq("status", "online");

    if (error) {
        console.error("Erro ao buscar motoboys disponíveis:", error);
        return [];
    }

    return data as MotoboyLocation[];
}
