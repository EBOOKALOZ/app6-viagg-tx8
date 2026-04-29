import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type SC_City_Status = 'downloads' | 'em_espera' | 'ativo';

export interface SCNeighborhood {
    id: string;
    city_id: string;
    neighborhood_name: string;
    downloads: number;
    waiting_users: number;
    motoboys_registered: number;
    merchants_registered: number;
    neighborhood_status: SC_City_Status;
    activated_at: string | null;
}

export interface SCCity {
    id: string;
    city_name: string;
    downloads: number;
    waiting_users: number;
    motoboys_registered: number;
    merchants_registered: number;
    city_status: SC_City_Status;
    activated_at: string | null;
    neighborhoods?: SCNeighborhood[];
    active_neighborhoods_count?: number;
}

const SCCITIES = [
    "Abdon Batista", "Abelardo Luz", "Agrolândia", "Agronômica", "Água Doce", "Águas de Chapecó", "Águas Frias", "Águas Mornas",
    "Alfredo Wagner", "Alto Bela Vista", "Anchieta", "Angelina", "Anita Garibaldi", "Anitápolis", "Antônio Carlos", "Apiúna",
    "Arabutã", "Araquari", "Araranguá", "Armazém", "Arroio Trinta", "Arvoredo", "Ascurra", "Atalanta", "Aurora",
    "Balneário Arroio do Silva", "Balneário Camboriú", "Balneário Barra do Sul", "Balneário Gaivota", "Balneário Piçarras", "Balneário Rincão",
    "Bandeirante", "Barra Bonita", "Barra Velha", "Bela Vista do Toldo", "Belmonte", "Benedito Novo", "Biguaçu", "Blumenau",
    "Bocaina do Sul", "Bombinhas", "Bom Jardim da Serra", "Bom Jesus", "Bom Jesus do Oeste", "Bom Retiro", "Botuverá", "Braço do Norte",
    "Braço do Trombudo", "Brunópolis", "Brusque", "Caçador", "Caibi", "Calmon", "Camboriú", "Campo Alegre",
    "Campo Belo do Sul", "Campo Erê", "Campos Novos", "Canelinha", "Canoinhas", "Capão Alto", "Capinzal", "Capivari de Baixo",
    "Catanduvas", "Caxambu do Sul", "Celso Ramos", "Cerro Negro", "Chapadão do Lageado", "Chapecó", "Cocal do Sul", "Concórdia",
    "Cordilheira Alta", "Coronel Freitas", "Coronel Martins", "Corupá", "Correia Pinto", "Criciúma", "Cunha Porã", "Cunhataí",
    "Curitibanos", "Descanso", "Dionísio Cerqueira", "Dona Emma", "Doutor Pedrinho", "Entre Rios", "Ermo", "Erval Velho",
    "Faxinal dos Guedes", "Flor do Sertão", "Florianópolis", "Formosa do Sul", "Forquilhinha", "Fraiburgo", "Frei Rogério", "Garuva",
    "Gaspar", "Governador Celso Ramos", "Grão Pará", "Gravatal", "Guabiruba", "Guaraciaba", "Guaramirim", "Guarujá do Sul", "Guatambu",
    "Herval d'Oeste", "Ibiam", "Ibicaré", "Ibirama", "Içara", "Ilhota", "Imaruí", "Imbituba", "Imbuia", "Indaial", "Iomerê", "Ipira",
    "Iporã do Oeste", "Ipuaçu", "Ipumirim", "Iraceminha", "Irani", "Irati", "Irineópolis", "Itá", "Itaiópolis", "Itajaí", "Itapema", "Itapiranga",
    "Itapoá", "Ituporanga", "Jaborá", "Jacinto Machado", "Jaguaruna", "Jaraguá do Sul", "Jardinópolis", "Joaçaba", "Joinville", "José Boiteux",
    "Jupiá", "Lacerdópolis", "Lages", "Laguna", "Lajeado Grande", "Laurentino", "Lauro Muller", "Lebon Régis", "Leoberto Leal", "Lindóia do Sul",
    "Lontras", "Luiz Alves", "Luzerna", "Macieira", "Mafra", "Major Gercino", "Major Vieira", "Maracajá", "Maravilha", "Marema",
    "Massaranduba", "Matos Costa", "Meleiro", "Mirim Doce", "Modelo", "Mondaí", "Monte Carlo", "Monte Castelo", "Morro da Fumaça",
    "Morro Grande", "Navegantes", "Nova Erechim", "Nova Itaberaba", "Nova Trento", "Nova Veneza", "Novo Horizonte", "Orleans", "Otacílio Costa",
    "Ouro", "Ouro Verde", "Paial", "Painel", "Palhoça", "Palma Sola", "Palmeira", "Papanduva", "Paraíso", "Passo de Torres", "Passos Maia",
    "Paulo Lopes", "Pedras Grandes", "Penha", "Peritiba", "Pescaria Brava", "Petrolândia", "Piçarras", "Pinhalzinho", "Pinheiro Preto",
    "Piratuba", "Planalto Alegre", "Pomerode", "Ponte Alta", "Ponte Alta do Norte", "Ponte Serrada", "Porto Belo", "Porto União", "Pouso Redondo",
    "Praia Grande", "Presidente Castello Branco", "Presidente Getúlio", "Presidente Nereu", "Princesa", "Quilombo", "Rancho Queimado", "Rio das Antas",
    "Rio do Campo", "Rio do Oeste", "Rio dos Cedros", "Rio do Sul", "Rio Fortuna", "Rio Negrinho", "Rio Rufino", "Riqueza", "Rodeio", "Romelândia",
    "Salete", "Saltinho", "Salto Veloso", "Sangão", "Santa Cecília", "Santa Helena", "Santa Rosa de Lima", "Santa Rosa do Sul", "Santa Terezinha",
    "Santa Terezinha do Progresso", "Santiago do Sul", "Santo Amaro da Imperatriz", "São Bento do Sul", "São Bernardino", "São Carlos",
    "São Cristóvão do Sul", "São Domingos", "São Francisco do Sul", "São João Batista", "São João do Itaperiú", "São João do Oeste",
    "São João do Sul", "São Joaquim", "São José", "São José do Cedro", "São José do Cerrito", "São Lourenço do Oeste", "São Ludgero", "São Martinho",
    "São Miguel da Boa Vista", "São Miguel do Oeste", "São Pedro de Alcântara", "Saudades", "Schroeder", "Seara", "Serra Alta", "Siderópolis",
    "Sombrio", "Sul Brasil", "Taió", "Tangará", "Tigrinhos", "Tijucas", "Timbé do Sul", "Timbó", "Timbó Grande", "Três Barras",
    "Treviso", "Treze de Maio", "Treze Tílias", "Trombudo Central", "Tubarão", "Tunápolis", "Turvo", "União do Oeste", "Urubici", "Urupema",
    "Urussanga", "Vargeão", "Vargem", "Vargem Bonita", "Vidal Ramos", "Videira", "Vitor Meireles", "Witmarsum", "Xanxerê", "Xavantina", "Xaxim", "Zortéa"
];

export function useAdminTerritorialExpansion() {
    const [cities, setCities] = useState<SCCity[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadCities = async () => {
        setIsLoading(true);
        // We use inner join or subquery to get neighborhoods. Since we need all cities even without neighborhoods, we do a left join.
        const { data, error } = await supabase
            .from('sc_cities_control')
            .select(`
                *,
                sc_neighborhoods_control(*)
            `)
            .order('city_name', { ascending: true });

        if (error) {
            console.error('Error fetching SC cities with neighborhoods:', error);
            setIsLoading(false);
            return;
        }

        let citiesData = data as any[];

        // Se estiver vazio, insere as 295 cidades
        if (!data || data.length === 0) {
            toast.info("Populando Banco com as 295 cidades de SC...");
            const insertPayload = SCCITIES.map(c => ({
                city_name: c,
                downloads: Math.floor(Math.random() * 50), // Mock seed para ficar visual
                waiting_users: Math.floor(Math.random() * 10),
                motoboys_registered: Math.floor(Math.random() * 5),
                merchants_registered: Math.floor(Math.random() * 2),
                city_status: 'downloads' as SC_City_Status
            }));

            // Supabase restringe commits mt grandes de insert as vezes. Vamos mandar aos montes.
            let i = 0;
            const batchSize = 50;
            while (i < insertPayload.length) {
                await supabase.from('sc_cities_control').insert(insertPayload.slice(i, i + batchSize));
                i += batchSize;
            }

            // Depois de inserir as cidades, damos um SELECT novamente para pegar os IDs gerados
            const { data: insertedCities } = await supabase.from('sc_cities_control').select('id, city_name').order('city_name');
            citiesData = insertedCities || [];

            // Vamos inserir bairros mockados na cidade de Blumenau, Joinville e Florianópolis
            if (insertedCities) {
                const targetCities = insertedCities.filter(c => ['Blumenau', 'Florianópolis', 'Joinville'].includes(c.city_name));
                for (const tc of targetCities) {
                    const mockBairros = ['Centro', 'Itoupava Seca', 'Garcia', 'Velha', 'Água Verde'].map(nb => ({
                        city_id: tc.id,
                        neighborhood_name: tc.city_name === 'Blumenau' ? nb : `Bairro ${nb} de ${tc.city_name}`,
                        downloads: Math.floor(Math.random() * 60),
                        waiting_users: Math.floor(Math.random() * 20),
                        motoboys_registered: Math.floor(Math.random() * 10),
                        merchants_registered: Math.floor(Math.random() * 5),
                        neighborhood_status: 'em_espera' as SC_City_Status
                    }));
                    await supabase.from('sc_neighborhoods_control').insert(mockBairros);
                }
            }

            // Refetch all to get the nested data properly
            const { data: newData } = await supabase
                .from('sc_cities_control')
                .select(`
                    *,
                    sc_neighborhoods_control(*)
                `)
                .order('city_name', { ascending: true });
            if (newData) {
                citiesData = newData as any[];
            }
        }

        // Processing active_neighborhoods_count
        const processedCities = (citiesData || []).map(c => {
            const nbs: SCNeighborhood[] = c.sc_neighborhoods_control || [];
            const activeNbCount = nbs.filter(nb => nb.neighborhood_status === 'ativo').length;

            // Auto Update City Status based on Neighborhoods? 
            // The instructions say "When ANY neighborhood in a city activates, the city's status automatically becomes 'ativo'."
            // Lets calculate it dynamically here for frontend safety if the DB trigger hasn't run.
            let computedStatus = c.city_status;
            if (activeNbCount > 0) computedStatus = 'ativo';

            return {
                ...c,
                city_status: computedStatus,
                neighborhoods: nbs,
                active_neighborhoods_count: activeNbCount
            };
        });

        setCities(processedCities as SCCity[]);
        setIsLoading(false);
    };

    useEffect(() => {
        loadCities();

        // Subscribing to manual updates anywhere
        const channel = supabase.channel('sc_cities_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sc_cities_control' }, () => {
                loadCities();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sc_neighborhoods_control' }, () => {
                loadCities();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const updateCityStatus = async (id: string, newStatus: SC_City_Status) => {
        const payload: any = { city_status: newStatus };
        if (newStatus === 'ativo') payload.activated_at = new Date().toISOString();
        else payload.activated_at = null; // reseta a data se reverter status

        const { error } = await supabase
            .from('sc_cities_control')
            .update(payload)
            .eq('id', id);

        if (error) {
            toast.error("Erro ao atualizar status da cidade: " + error.message);
            return false;
        }
        toast.success("Status atualizado com sucesso!");
        // O realtime ja vai disparar o refetch
        return true;
    };

    const stats = useMemo(() => {
        let ativas = 0;
        let emEspera = 0;
        let downloadsStatus = 0;
        let totalDownloads = 0;

        cities.forEach(c => {
            if (c.city_status === 'ativo') ativas++;
            else if (c.city_status === 'em_espera') emEspera++;
            else downloadsStatus++;

            totalDownloads += (c.downloads || 0);
        });

        return { ativas, emEspera, downloadsStatus, totalDownloads };
    }, [cities]);

    return {
        cities,
        isLoading,
        stats,
        updateCityStatus,
        refetch: loadCities
    };
}
