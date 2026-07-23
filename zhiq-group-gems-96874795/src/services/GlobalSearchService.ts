import { supabase } from "@/integrations/supabase/client";
import { getListingImageUrl } from "@/lib/real-estate/mediaUtils";
import { publicAdvertiserPath } from "@/lib/business-modules";

export type SearchCategory = 'mercado' | 'imoveis' | 'veiculos' | 'servicos' | 'viagens' | 'fretes' | 'leiloes';

/* Remove acentos + minúsculas, para casar "leilão"/"leilao"/"LEILÕES" etc. */
function normalizeTerm(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/* Intenção de "ver leilões": ao digitar leilão/leilões/arremate/lance,
   mostramos TODOS os leilões ao vivo (ordenados por proximidade da finalização),
   não uma busca por título. */
export function isAuctionIntent(query: string): boolean {
  const n = normalizeTerm(query);
  if (n.length < 4) return false;
  return n.startsWith('leil')       // leil, leilao, leiloes, leilão, leilões, leiloar
      || n.startsWith('arremat')    // arremate, arremates
      || n === 'lance' || n === 'lances';
}

export interface GlobalSearchResult {
  id: string;
  title: string;
  description: string;
  price_brl?: number;
  price_label?: string;
  thumbnail_url?: string | null;
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

function resolveItemImage(
  item: any,
  mediaPropName: string,
  defaultBucket = 'real-estate-original'
): string | null {
  if (item.thumbnail_url && typeof item.thumbnail_url === 'string' && item.thumbnail_url.startsWith('http')) {
    return item.thumbnail_url;
  }
  if (item.cover_image_url && typeof item.cover_image_url === 'string' && item.cover_image_url.startsWith('http')) {
    return item.cover_image_url;
  }

  const mediaList = item[mediaPropName];
  const mediaObj = Array.isArray(mediaList) ? mediaList[0] : mediaList;
  
  const path = item.thumbnail_url || item.cover_image_url || mediaObj?.thumb_masked_storage_path || mediaObj?.public_masked_storage_path || mediaObj?.original_storage_path || mediaObj?.media_url || null;
  
  if (!path || typeof path !== 'string') return null;
  if (path.startsWith('http')) return path;

  if (defaultBucket === 'marketing-materials') {
    const { data } = supabase.storage.from('marketing-materials').getPublicUrl(path);
    return data?.publicUrl || null;
  }

  const hasPublic = !!(mediaObj?.thumb_masked_storage_path || mediaObj?.public_masked_storage_path);
  return getListingImageUrl(path, hasPublic ? 'public' : 'original') || null;
}

function getRelevanceScore(item: GlobalSearchResult, qLower: string): number {
  const title = (item.title || '').toLowerCase();
  const desc = (item.description || '').toLowerCase();
  const loc = (item.location || '').toLowerCase();
  const cat = (item.categoryLabel || '').toLowerCase();

  let score = 0;

  // 1. Título começa exatamente com as letras digitadas
  if (title.startsWith(qLower)) {
    score += 1000;
  }
  // 2. Alguma palavra do título começa com as letras digitadas
  else {
    const words = title.split(/[\s,.-]+/);
    if (words.some(w => w.startsWith(qLower))) {
      score += 800;
    }
    // 3. Título contém a palavra em qualquer lugar
    else if (title.includes(qLower)) {
      score += 500;
    }
  }

  // 4. Localização ou Categoria começam ou contêm
  if (loc.startsWith(qLower) || cat.startsWith(qLower)) {
    score += 300;
  } else if (loc.includes(qLower) || cat.includes(qLower)) {
    score += 150;
  }

  // 5. Match exclusivamente em descrição
  if (score === 0 && desc.includes(qLower)) {
    score = 10;
  }

  return score;
}

export class GlobalSearchService {
  /** Busca em toda a plataforma (todas as categorias em paralelo). */
  static async searchAll(query: string): Promise<GlobalSearchResult[]> {
    if (!query || query.trim().length < 1) return [];
    const q = query.trim();

    // Intenção "leilão": mostrar TODOS os leilões ao vivo, sempre na ordem de
    // proximidade da finalização (não é busca por título nem re-ordena por relevância).
    if (isAuctionIntent(q)) {
      return this.searchLeiloes(q, true);
    }

    const results: GlobalSearchResult[] = [];

    const settled = await Promise.allSettled([
      this.searchMercado(q),
      this.searchImoveis(q),
      this.searchVeiculos(q),
      this.searchServicos(q),
      this.searchViagens(q),
      this.searchFretes(q),
      this.searchLeiloes(q), // leilões que casam por título/descrição também aparecem
    ]);
    settled.forEach(res => {
      if (res.status === 'fulfilled') results.push(...res.value);
      else console.error('Global search partial failure:', res.reason);
    });

    const qLower = q.toLowerCase();
    results.sort((a, b) => {
      const scoreA = getRelevanceScore(a, qLower);
      const scoreB = getRelevanceScore(b, qLower);
      return scoreB - scoreA;
    });

    // Se a busca for curta (até 3 letras, ex: "l", "lo", "lot"),
    // priorizar estritamente os resultados que têm match em título, categoria ou local (score >= 150).
    // Evita que anúncios sem congruência no título apareçam no topo por ter a sílaba na descrição.
    if (qLower.length <= 3) {
      const highRelevance = results.filter(r => getRelevanceScore(r, qLower) >= 150);
      if (highRelevance.length > 0) {
        return highRelevance;
      }
    }

    return results;
  }

  static async searchMercado(q: string): Promise<GlobalSearchResult[]> {
    const { data, error } = await (supabase.from('advertiser_listings') as any)
      .select('id, title, description, price, city, cover_image_url, advertiser_listing_media(media_url)')
      .eq('listing_status', 'active')
      .or(ilikeOr(q))
      .limit(20);
    if (error) { console.warn('[busca:mercado]', error.message); return []; }
    
    const items = data || [];
    const missingIds = items.filter((it: any) => !resolveItemImage(it, 'advertiser_listing_media', 'marketing-materials')).map((it: any) => it.id);
    const fallbackMap = new Map<string, any>();
    if (missingIds.length > 0) {
      const { data: mediaData } = await (supabase.from('advertiser_listing_media') as any)
        .select('listing_id, media_url')
        .in('listing_id', missingIds);
      (mediaData || []).forEach((m: any) => {
        if (!fallbackMap.has(m.listing_id)) fallbackMap.set(m.listing_id, m);
      });
    }

    return items.map((item: any) => {
      if (fallbackMap.has(item.id)) item.advertiser_listing_media = [fallbackMap.get(item.id)];
      return {
        id: item.id,
        title: item.title,
        description: item.description || '',
        price_brl: item.price != null ? Number(item.price) : undefined,
        thumbnail_url: resolveItemImage(item, 'advertiser_listing_media', 'marketing-materials'),
        category: 'mercado' as const,
        categoryLabel: 'Mercado',
        location: item.city || '',
        routePath: `/produto/${item.id}`,
      };
    });
  }

  static async searchImoveis(q: string): Promise<GlobalSearchResult[]> {
    const { data, error } = await (supabase.from('real_estate_listings') as any)
      .select('*, real_estate_media(original_storage_path, public_masked_storage_path, thumb_masked_storage_path)')
      .eq('visibility_status', 'published')
      .or(ilikeOr(q))
      .limit(20);
    if (error) { console.warn('[busca:imoveis]', error.message); return []; }
    
    const items = data || [];
    const missingIds = items.filter((it: any) => !resolveItemImage(it, 'real_estate_media')).map((it: any) => it.id);
    const fallbackMap = new Map<string, any>();
    if (missingIds.length > 0) {
      const { data: mediaData } = await (supabase.from('real_estate_media') as any)
        .select('listing_id, original_storage_path, public_masked_storage_path, thumb_masked_storage_path, sort_order')
        .in('listing_id', missingIds)
        .order('sort_order', { ascending: true });
      (mediaData || []).forEach((m: any) => {
        if (!fallbackMap.has(m.listing_id)) fallbackMap.set(m.listing_id, m);
      });
    }

    return items.map((item: any) => {
      if (fallbackMap.has(item.id)) item.real_estate_media = [fallbackMap.get(item.id)];
      return {
        id: item.id,
        title: item.title,
        description: item.description || '',
        price_brl: item.price_brl != null ? Number(item.price_brl) : undefined,
        thumbnail_url: resolveItemImage(item, 'real_estate_media'),
        category: 'imoveis' as const,
        categoryLabel: 'Imóveis',
        location: item.city ? `${item.city}${item.state ? '/' + item.state : ''}` : '',
        routePath: item.owner_user_id
          ? publicAdvertiserPath('imoveis', item.owner_user_id, item.id)
          : `/imoveis/${item.id}`,
      };
    });
  }

  static async searchVeiculos(q: string): Promise<GlobalSearchResult[]> {
    const { data, error } = await (supabase.from('vehicle_listings') as any)
      .select('*, vehicle_media(original_storage_path, public_masked_storage_path)')
      .eq('visibility_status', 'published')
      .or(ilikeOr(q))
      .limit(20);
    if (error) { console.warn('[busca:veiculos]', error.message); return []; }
    
    const items = data || [];
    const missingIds = items.filter((it: any) => !resolveItemImage(it, 'vehicle_media')).map((it: any) => it.id);
    const fallbackMap = new Map<string, any>();
    if (missingIds.length > 0) {
      const { data: mediaData } = await (supabase.from('vehicle_media') as any)
        .select('listing_id, original_storage_path, public_masked_storage_path, sort_order')
        .in('listing_id', missingIds)
        .order('sort_order', { ascending: true });
      (mediaData || []).forEach((m: any) => {
        if (!fallbackMap.has(m.listing_id)) fallbackMap.set(m.listing_id, m);
      });
    }

    return items.map((item: any) => {
      if (fallbackMap.has(item.id)) item.vehicle_media = [fallbackMap.get(item.id)];
      return {
        id: item.id,
        title: item.title || [item.brand, item.model].filter(Boolean).join(' '),
        description: item.description || '',
        price_brl: item.price_brl != null ? Number(item.price_brl) : undefined,
        thumbnail_url: resolveItemImage(item, 'vehicle_media'),
        category: 'veiculos' as const,
        categoryLabel: 'Veículos',
        location: item.city ? `${item.city}${item.state ? '/' + item.state : ''}` : '',
        routePath: item.owner_user_id
          ? publicAdvertiserPath('veiculos', item.owner_user_id, item.id)
          : `/veiculos/${item.id}`,
      };
    });
  }

  static async searchServicos(q: string): Promise<GlobalSearchResult[]> {
    const { data, error } = await (supabase.from('service_listings') as any)
      .select('*, service_media(original_storage_path, public_masked_storage_path)')
      .eq('visibility_status', 'published')
      .or(ilikeOr(q))
      .limit(20);
    if (error) { console.warn('[busca:servicos]', error.message); return []; }
    
    const items = data || [];
    const missingIds = items.filter((it: any) => !resolveItemImage(it, 'service_media')).map((it: any) => it.id);
    const fallbackMap = new Map<string, any>();
    if (missingIds.length > 0) {
      const { data: mediaData } = await (supabase.from('service_media') as any)
        .select('listing_id, original_storage_path, public_masked_storage_path, sort_order')
        .in('listing_id', missingIds)
        .order('sort_order', { ascending: true });
      (mediaData || []).forEach((m: any) => {
        if (!fallbackMap.has(m.listing_id)) fallbackMap.set(m.listing_id, m);
      });
    }

    return items.map((item: any) => {
      if (fallbackMap.has(item.id)) item.service_media = [fallbackMap.get(item.id)];
      return {
        id: item.id,
        title: item.title,
        description: item.description || '',
        price_label: item.price_label || undefined,
        thumbnail_url: resolveItemImage(item, 'service_media'),
        category: 'servicos' as const,
        categoryLabel: 'Serviços',
        location: item.city ? `${item.city}${item.state ? '/' + item.state : ''}` : '',
        routePath: item.owner_user_id
          ? publicAdvertiserPath('servicos', item.owner_user_id, item.id)
          : `/servicos/${item.id}`,
      };
    });
  }

  static async searchViagens(q: string): Promise<GlobalSearchResult[]> {
    const { data, error } = await (supabase.from('travel_listings') as any)
      .select('id, title, description, destination, city, state, price_per_person, total_price, entry_price, cover_image_url, thumbnail_url, owner_user_id, travel_media(original_storage_path, public_masked_storage_path)')
      .eq('visibility_status', 'published')
      .or(ilikeOr(q))
      .limit(20);
    if (error) { console.warn('[busca:viagens]', error.message); return []; }
    
    const items = data || [];
    const missingIds = items.filter((it: any) => !resolveItemImage(it, 'travel_media')).map((it: any) => it.id);
    const fallbackMap = new Map<string, any>();
    if (missingIds.length > 0) {
      const { data: mediaData } = await (supabase.from('travel_media') as any)
        .select('listing_id, original_storage_path, public_masked_storage_path, sort_order')
        .in('listing_id', missingIds)
        .order('sort_order', { ascending: true });
      (mediaData || []).forEach((m: any) => {
        if (!fallbackMap.has(m.listing_id)) fallbackMap.set(m.listing_id, m);
      });
    }

    return items.map((item: any) => {
      if (fallbackMap.has(item.id)) item.travel_media = [fallbackMap.get(item.id)];
      return {
        id: item.id,
        title: item.title,
        description: item.description || '',
        price_label: item.entry_price?.trim()
          || (item.price_per_person ? `R$ ${Number(item.price_per_person).toLocaleString('pt-BR')}/pessoa` : undefined)
          || (item.total_price ? `R$ ${Number(item.total_price).toLocaleString('pt-BR')}` : undefined),
        thumbnail_url: resolveItemImage(item, 'travel_media'),
        category: 'viagens' as const,
        categoryLabel: 'Viagens',
        location: item.destination || item.city || '',
        routePath: item.owner_user_id
          ? publicAdvertiserPath('viagem', item.owner_user_id, item.id)
          : `/viagens/${item.id}`,
      };
    });
  }

  static async searchFretes(q: string): Promise<GlobalSearchResult[]> {
    const { data, error } = await (supabase.from('freight_listings') as any)
      .select('*, freight_media(original_storage_path, public_masked_storage_path)')
      .eq('visibility_status', 'published')
      .or(ilikeOr(q))
      .limit(20);
    if (error) { console.warn('[busca:fretes]', error.message); return []; }
    
    const items = data || [];
    const missingIds = items.filter((it: any) => !resolveItemImage(it, 'freight_media')).map((it: any) => it.id);
    const fallbackMap = new Map<string, any>();
    if (missingIds.length > 0) {
      const { data: mediaData } = await (supabase.from('freight_media') as any)
        .select('listing_id, original_storage_path, public_masked_storage_path, sort_order')
        .in('listing_id', missingIds)
        .order('sort_order', { ascending: true });
      (mediaData || []).forEach((m: any) => {
        if (!fallbackMap.has(m.listing_id)) fallbackMap.set(m.listing_id, m);
      });
    }

    return items.map((item: any) => {
      if (fallbackMap.has(item.id)) item.freight_media = [fallbackMap.get(item.id)];
      return {
        id: item.id,
        title: item.title,
        description: item.description || '',
        price_label: item.price_label?.trim()
          || (item.price_per_km ? `R$ ${Number(item.price_per_km).toFixed(2)}/km` : undefined),
        thumbnail_url: resolveItemImage(item, 'freight_media'),
        category: 'fretes' as const,
        categoryLabel: 'Fretes',
        location: item.city ? `${item.city}${item.state ? '/' + item.state : ''}` : '',
        routePath: item.owner_user_id
          ? publicAdvertiserPath('freteiro', item.owner_user_id, item.id)
          : `/fretes/${item.id}`,
      };
    });
  }

  /**
   * Leilões (auction_listings). Sempre ordenados por proximidade da finalização
   * (ends_at ASC, mais perto de encerrar primeiro). Só leilões AO VIVO
   * (status active e ainda não encerrados).
   * @param showAll quando true (intenção "leilão"), ignora o filtro por título e
   *        traz todos os leilões ao vivo; quando false, casa por título/descrição.
   */
  static async searchLeiloes(q: string, showAll = false): Promise<GlobalSearchResult[]> {
    let query = (supabase.from('auction_listings') as any)
      .select('id, title, description, city, state, current_bid, starting_bid, product_image_url, status, ends_at, listing_type, store_id')
      .order('ends_at', { ascending: true, nullsFirst: false })
      .limit(showAll ? 60 : 20);
    if (!showAll) query = query.or(ilikeOr(q));

    const { data, error } = await query;
    if (error) { console.warn('[busca:leiloes]', error.message); return []; }

    const now = Date.now();
    const items = (data || []).filter((it: any) => {
      const notEnded = it.ends_at ? new Date(it.ends_at).getTime() > now : true;
      const active = it.status ? it.status === 'active' : true;
      return active && notEnded;
    });

    return items.map((item: any) => {
      const bid = item.current_bid ?? item.starting_bid;
      const img = typeof item.product_image_url === 'string' && item.product_image_url.startsWith('http')
        ? item.product_image_url : null;
      return {
        id: item.id,
        title: item.title,
        description: item.description || '',
        price_brl: bid != null ? Number(bid) : undefined,
        thumbnail_url: img,
        category: 'leiloes' as const,
        categoryLabel: item.listing_type === 'arremate' ? 'Arremate' : 'Leilão',
        location: item.city ? `${item.city}${item.state ? '/' + item.state : ''}` : '',
        routePath: item.store_id
          ? publicAdvertiserPath(item.listing_type === 'arremate' ? 'arremates' : 'leiloes', item.store_id, item.id)
          : `/mercado/leiloes/${item.id}`,
      };
    });
  }
}

