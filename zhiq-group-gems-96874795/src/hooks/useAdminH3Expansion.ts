import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type H3Status = 'downloads' | 'em_espera' | 'ativo';

export interface H3Cell {
    id: string;
    h3_index: string;
    city_name: string | null;
    downloads: number;
    waiting_users: number;
    motoboys_registered: number;
    merchants_registered: number;
    deliveries_completed: number;
    status: H3Status;
    activated_at: string | null;
}

export function useAdminH3Expansion() {
    const [cells, setCells] = useState<H3Cell[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadCells = async () => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('sc_h3_cells_control')
            .select('*');

        if (error) {
            console.error('Error fetching H3 cells:', error);
            setIsLoading(false);
            return;
        }

        // Se a tabela estiver vazia, geramos mock data para Florianópolis/Blumenau
        // Usando alguns IDs H3 reais (resolução 7 ~ 5km) para testes de mapa
        if (!data || data.length === 0) {
            toast.info("Tabela H3 vazia. Inserindo células Seeders (Mock)...");

            // Alguns H3 hexes na regiao de SC (Res 7)
            // Para não depender agressivamente da biblioteca h3-js no hook, mockamos algums indices
            const mockIndexes = [
                { hex: '87a8106a2ffffff', city: 'Blumenau' },
                { hex: '87a8106a3ffffff', city: 'Blumenau' },
                { hex: '87a8106a0ffffff', city: 'Blumenau' },
                { hex: '87a8106a1ffffff', city: 'Blumenau' },
                { hex: '87a8106a6ffffff', city: 'Blumenau' },
                { hex: '87a81075effffff', city: 'Florianópolis' },
                { hex: '87a81075cffffff', city: 'Florianópolis' },
                { hex: '87a81075dffffff', city: 'Florianópolis' },
            ];

            const insertPayload = mockIndexes.map(item => {
                const isAtivo = Math.random() > 0.7;
                return {
                    h3_index: item.hex,
                    city_name: item.city,
                    downloads: Math.floor(Math.random() * 200),
                    waiting_users: Math.floor(Math.random() * 50),
                    motoboys_registered: isAtivo ? Math.floor(Math.random() * 10) + 3 : Math.floor(Math.random() * 2), // Regra >= 3
                    merchants_registered: isAtivo ? Math.floor(Math.random() * 5) + 2 : Math.floor(Math.random() * 1), // Regra >= 2
                    deliveries_completed: isAtivo ? Math.floor(Math.random() * 500) : 0,
                    status: isAtivo ? ('ativo' as H3Status) : ('downloads' as H3Status),
                    activated_at: isAtivo ? new Date().toISOString() : null
                };
            });

            const { error: insertError } = await supabase.from('sc_h3_cells_control').insert(insertPayload);
            if (insertError) {
                console.error("Failed to insert mock data:", insertError);
            }

            // Refetch
            const { data: newData } = await supabase.from('sc_h3_cells_control').select('*');
            if (newData) {
                setCells(newData as H3Cell[]);
            }
        } else {
            setCells(data as H3Cell[]);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        loadCells();

        const channel = supabase.channel('sc_h3_cells_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sc_h3_cells_control' }, () => {
                loadCells();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const updateCellStatus = async (id: string, newStatus: H3Status) => {
        const payload: unknown = { status: newStatus };
        if (newStatus === 'ativo') payload.activated_at = new Date().toISOString();
        else payload.activated_at = null;

        const { error } = await supabase
            .from('sc_h3_cells_control')
            .update(payload)
            .eq('id', id);

        if (error) {
            toast.error("Erro ao atualizar status da célula H3: " + error.message);
            return false;
        }
        toast.success("Status atualizado com sucesso!");
        return true;
    };

    const stats = useMemo(() => {
        let ativas = 0;
        let emEspera = 0;
        let downloadsStatus = 0;
        let totalDownloads = 0;
        let totalEntregas = 0;

        cells.forEach(c => {
            if (c.status === 'ativo') ativas++;
            else if (c.status === 'em_espera') emEspera++;
            else downloadsStatus++;

            totalDownloads += (c.downloads || 0);
            totalEntregas += (c.deliveries_completed || 0);
        });

        return { ativas, emEspera, downloadsStatus, totalDownloads, totalEntregas };
    }, [cells]);

    return {
        cells,
        isLoading,
        stats,
        updateCellStatus,
        refetch: loadCells
    };
}
