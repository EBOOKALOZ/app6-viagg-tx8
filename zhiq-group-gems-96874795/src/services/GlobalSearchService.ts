import { supabase } from "@/integrations/supabase/client";

export type SearchCategory = 'mercado' | 'imoveis' | 'veiculos' | 'servicos' | 'viagens' | 'fretes';

export interface GlobalSearchResult {
  id: string;
  title: string;
  description: string;
  price_brl?: number;
  thumbnail_url?: string;
  category: SearchCategory;
  categoryLabel: string;
  routePath: string;
  location?: string;
}

export class GlobalSearchService {
  /**
   * Search across all platforms with a specific query string.
   */
  static async searchAll(query: string): Promise<GlobalSearchResult[]> {
    if (!query || query.trim().length < 2) return [];
    
    const term = `%${query.trim()}%`;
    const results: GlobalSearchResult[] = [];

    // Parallel fetching for performance
    const promises = [
      this.searchMercado(term),
      this.searchImoveis(term),
      this.searchVeiculos(term),
      this.searchServicos(term),
      this.searchViagens(term),
    ];

    try {
      const settled = await Promise.allSettled(promises);
      settled.forEach(res => {
        if (res.status === 'fulfilled') {
          results.push(...res.value);
        } else {
          console.error("Global search partial failure:", res.reason);
        }
      });
    } catch (err) {
      console.error("Error executing global search", err);
    }

    return results;
  }

  static async searchMercado(term: string): Promise<GlobalSearchResult[]> {
    try {
      const { data, error } = await (supabase.from('advertiser_listings') as any)
        .select('id, title, description, price_brl, state, city')
        .in('listing_status', ['active', 'published'])
        .or(`title.ilike.${term},description.ilike.${term}`)
        .limit(20);

      if (error || !data) return [];

      return data.map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description || '',
        price_brl: item.price_brl,
        category: 'mercado',
        categoryLabel: 'Mercado',
        location: item.city && item.state ? `${item.city}/${item.state}` : '',
        routePath: `/produto/${item.id}`,
      }));
    } catch (e) {
      return [];
    }
  }

  static async searchImoveis(term: string): Promise<GlobalSearchResult[]> {
    try {
      const { data, error } = await (supabase.from('real_estate_listings') as any)
        .select('id, title, description, price_brl, state, city')
        .in('visibility_status', ['published', 'approved'])
        .or(`title.ilike.${term},description.ilike.${term}`)
        .limit(20);

      if (error || !data) return [];

      return data.map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description || '',
        price_brl: item.price_brl,
        category: 'imoveis',
        categoryLabel: 'Imóveis',
        location: item.city && item.state ? `${item.city}/${item.state}` : '',
        routePath: `/imoveis/${item.id}`,
      }));
    } catch(e) {
      return [];
    }
  }

  static async searchVeiculos(term: string): Promise<GlobalSearchResult[]> {
    try {
      const { data, error } = await (supabase.from('vehicle_listings') as any)
        .select('id, title, description, price_brl, state, city')
        .in('visibility_status', ['published', 'approved'])
        .or(`title.ilike.${term},description.ilike.${term}`)
        .limit(20);

      if (error || !data) return [];

      return data.map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description || '',
        price_brl: item.price_brl,
        category: 'veiculos',
        categoryLabel: 'Veículos',
        location: item.city && item.state ? `${item.city}/${item.state}` : '',
        routePath: `/veiculos/${item.id}`,
      }));
    } catch(e) {
      return [];
    }
  }

  static async searchServicos(term: string): Promise<GlobalSearchResult[]> {
    try {
      const { data, error } = await (supabase.from('service_listings') as any)
        .select('id, title, description, price_brl, state, city')
        .in('visibility_status', ['published', 'approved'])
        .or(`title.ilike.${term},description.ilike.${term}`)
        .limit(20);

      if (error || !data) return [];

      return data.map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description || '',
        price_brl: item.price_brl,
        category: 'servicos',
        categoryLabel: 'Serviços',
        location: item.city && item.state ? `${item.city}/${item.state}` : '',
        routePath: `/servicos/${item.id}`,
      }));
    } catch(e) {
      return [];
    }
  }

  static async searchViagens(term: string): Promise<GlobalSearchResult[]> {
    try {
      const { data, error } = await (supabase.from('travel_packages') as any)
        .select('id, title, description, price_brl, state, city')
        .in('visibility_status', ['published', 'approved'])
        .or(`title.ilike.${term},description.ilike.${term}`)
        .limit(20);

      if (error || !data) return [];

      return data.map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description || '',
        price_brl: item.price_brl,
        category: 'viagens',
        categoryLabel: 'Viagens',
        location: item.city && item.state ? `${item.city}/${item.state}` : '',
        routePath: `/viagens/${item.id}`,
      }));
    } catch(e) {
      return [];
    }
  }
}
