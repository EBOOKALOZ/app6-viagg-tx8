import { supabase } from "@/integrations/supabase/client";

export type SearchCategory = 'mercado' | 'imoveis' | 'veiculos' | 'servicos' | 'viagens' | 'fretes';

export interface GlobalSearchResult {
  id: string;
  title: string;
  description: string;
  price_brl?: number;
  price_label?: string;
  thumbnail_url?: string;
  category: SearchCategory;
  categoryLabel: string;
  routePath: string;
  location?: string;
}

/* Sanitiza o termo para o .or() do PostgREST: vírgulas/parênteses/aspas
   quebrariam a sintaxe or=(title.ilike.%x%,...) */
function ilikeOr(term: string): string {
  const t = term.trim().replace(/[,()"']/g, ' ').replace(/\s+/g, ' ');
  return `title.ilike.%${t}%,description.ilike.%${t}%`;
}

export class GlobalSearchService {
  /** Busca em toda a plataforma (todas as categorias em paralelo). */
  static async searchAll(query: string): Promise<GlobalSearchResult[]> {
    if (!query || query.trim().length < 2) return [];
    const q = query.trim();
    const results: GlobalSearchResult[] = [];

    const settled = await Promise.allSettled([
      this.searchMercado(q),
      this.searchImoveis(q),
      this.searchVeiculos(q),
      this.searchServicos(q),
      this.searchViagens(q),
      this.searchFretes(q),
    ]);
    settled.forEach(res => {
      if (res.status === 'fulfilled') results.push(...res.value);
      else console.error('Global search partial failure:', res.reason);
    });
    return results;
  }

  static async searchMercado(q: string): Promise<GlobalSearchResult[]> {
    const { data, error } = await (supabase.from('advertiser_listings') as any)
      .select('id, title, description, price, city, cover_image_url')
      .eq('listing_status', 'active')
      .or(ilikeOr(q))
      .limit(20);
    if (error) { console.warn('[busca:mercado]', error.message); return []; }
    return (data || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      description: item.description || '',
      price_brl: item.price != null ? Number(item.price) : undefined,
      thumbnail_url: item.cover_image_url || null,
      category: 'mercado' as const,
      categoryLabel: 'Mercado',
      location: item.city || '',
      routePath: `/produto/${item.id}`,
    }));
  }

  static async searchImoveis(q: string): Promise<GlobalSearchResult[]> {
    const { data, error } = await (supabase.from('real_estate_listings') as any)
      .select('*')
      .eq('visibility_status', 'published')
      .or(ilikeOr(q))
      .limit(20);
    if (error) { console.warn('[busca:imoveis]', error.message); return []; }
    return (data || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      description: item.description || '',
      price_brl: item.price_brl != null ? Number(item.price_brl) : undefined,
      thumbnail_url: item.thumbnail_url || null,
      category: 'imoveis' as const,
      categoryLabel: 'Imóveis',
      location: item.city ? `${item.city}${item.state ? '/' + item.state : ''}` : '',
      routePath: `/imoveis/${item.id}`,
    }));
  }

  static async searchVeiculos(q: string): Promise<GlobalSearchResult[]> {
    const { data, error } = await (supabase.from('vehicle_listings') as any)
      .select('*')
      .eq('visibility_status', 'published')
      .or(ilikeOr(q))
      .limit(20);
    if (error) { console.warn('[busca:veiculos]', error.message); return []; }
    return (data || []).map((item: any) => ({
      id: item.id,
      title: item.title || [item.brand, item.model].filter(Boolean).join(' '),
      description: item.description || '',
      price_brl: item.price_brl != null ? Number(item.price_brl) : undefined,
      thumbnail_url: item.thumbnail_url || null,
      category: 'veiculos' as const,
      categoryLabel: 'Veículos',
      location: item.city ? `${item.city}${item.state ? '/' + item.state : ''}` : '',
      routePath: `/veiculos/${item.id}`,
    }));
  }

  static async searchServicos(q: string): Promise<GlobalSearchResult[]> {
    const { data, error } = await (supabase.from('service_listings') as any)
      .select('*')
      .eq('visibility_status', 'published')
      .or(ilikeOr(q))
      .limit(20);
    if (error) { console.warn('[busca:servicos]', error.message); return []; }
    return (data || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      description: item.description || '',
      price_label: item.price_label || undefined,
      thumbnail_url: item.thumbnail_url || null,
      category: 'servicos' as const,
      categoryLabel: 'Serviços',
      location: item.city ? `${item.city}${item.state ? '/' + item.state : ''}` : '',
      routePath: `/servicos/${item.id}`,
    }));
  }

  static async searchViagens(q: string): Promise<GlobalSearchResult[]> {
    const { data, error } = await (supabase.from('travel_listings') as any)
      .select('id, title, description, destination, city, state, price_per_person, total_price, entry_price')
      .eq('visibility_status', 'published')
      .or(ilikeOr(q))
      .limit(20);
    if (error) { console.warn('[busca:viagens]', error.message); return []; }
    return (data || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      description: item.description || '',
      price_label: item.entry_price?.trim()
        || (item.price_per_person ? `R$ ${Number(item.price_per_person).toLocaleString('pt-BR')}/pessoa` : undefined)
        || (item.total_price ? `R$ ${Number(item.total_price).toLocaleString('pt-BR')}` : undefined),
      category: 'viagens' as const,
      categoryLabel: 'Viagens',
      location: item.destination || item.city || '',
      routePath: `/viagens/${item.id}`,
    }));
  }

  static async searchFretes(q: string): Promise<GlobalSearchResult[]> {
    const { data, error } = await (supabase.from('freight_listings') as any)
      .select('*')
      .eq('visibility_status', 'published')
      .or(ilikeOr(q))
      .limit(20);
    if (error) { console.warn('[busca:fretes]', error.message); return []; }
    return (data || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      description: item.description || '',
      price_label: item.price_label?.trim()
        || (item.price_per_km ? `R$ ${Number(item.price_per_km).toFixed(2)}/km` : undefined),
      thumbnail_url: item.thumbnail_url || null,
      category: 'fretes' as const,
      categoryLabel: 'Fretes',
      location: item.city ? `${item.city}${item.state ? '/' + item.state : ''}` : '',
      routePath: `/fretes/${item.id}`,
    }));
  }
}
