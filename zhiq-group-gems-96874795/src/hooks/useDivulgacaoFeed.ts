import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * useDivulgacaoFeed — feed unificado de oportunidades de divulgação.
 * Fontes REAIS (somente leitura):
 *  • advertiser_listings (produtos do Mercado Local, status active)
 *  • real_estate_listings (imóveis published) + real_estate_media
 *  • vehicle_listings (veículos published) + vehicle_media
 * Campanhas (lotes do Postador) entram via prop no componente — já carregadas
 * pelo motor existente; aqui NADA é escrito no banco.
 */

export type FeedKind = 'divulgacao' | 'imovel' | 'veiculo';

export interface FeedAd {
  id: string;
  kind: FeedKind;
  title: string;
  storeName: string | null;
  price: number | null;
  city: string | null;
  neighborhood: string | null;
  category: string;
  image: string | null;
  createdAt: string;
  views: number | null;
  isPromoted: boolean;
  /** caminho público do anúncio dentro do app (para o link de divulgação) */
  path: string;
  /** distância aproximada (km) até a base do profissional, quando calculável */
  distanceKm: number | null;
}

/** Raio máximo de divulgação a partir de onde a loja/anúncio foi cadastrado. */
export const DIVULGACAO_RAIO_KM = 100;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Geocodifica cidade→coords via Mapbox com cache em localStorage (1 chamada por cidade). */
async function geocodeCityCached(city: string): Promise<{ lat: number; lng: number } | null> {
  const key = normCity(city);
  if (!key) return null;
  try {
    const cache = JSON.parse(localStorage.getItem('geoCityCache') || '{}');
    if (cache[key]) return cache[key] === 'x' ? null : cache[key];
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
    if (!token) return null;
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(`${city} Brasil`)}.json?types=place&country=BR&limit=1&language=pt&access_token=${token}`
    );
    if (!res.ok) return null;
    const center = (await res.json())?.features?.[0]?.center;
    const val = center ? { lng: center[0], lat: center[1] } : null;
    cache[key] = val ?? 'x';
    localStorage.setItem('geoCityCache', JSON.stringify(cache));
    return val;
  } catch { return null; }
}

export interface FeedContext {
  profileCity: string | null;
  groupCities: string[]; // cidades (normalizadas) dos grupos válidos do profissional
}

export const normCity = (s?: string | null) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

/** Motor de recomendação (determinístico e explicável). */
export function scoreAd(ad: FeedAd, ctx: FeedContext): number {
  let score = 0;
  const cidade = normCity(ad.city);
  if (cidade && cidade === normCity(ctx.profileCity)) score += 40;           // localização do profissional
  if (cidade && ctx.groupCities.includes(cidade)) score += 20;               // cobertura dos grupos
  if (ad.isPromoted) score += 15;                                            // patrocinado
  const ageH = (Date.now() - new Date(ad.createdAt).getTime()) / 3_600_000;
  if (ageH < 48) score += 10; else if (ageH < 168) score += 5;               // recência
  score += Math.min(10, (ad.views ?? 0) / 5);                                // popularidade
  const foodish = /restaurante|pizza|lanche|sushi|churrasc|acai|burg|comida|mercado|padaria/i
    .test(`${ad.category} ${ad.title}`);
  const h = new Date().getHours();
  if (foodish && ((h >= 10 && h <= 13) || (h >= 17 && h <= 21))) score += 8; // horário ideal
  return Math.round(score);
}

function mediaUrl(bucket: string, row: Record<string, unknown> | null | undefined): string | null {
  const path = row?.public_masked_storage_path || row?.original_storage_path;
  if (!path) return null;
  if (String(path).startsWith('http')) return String(path);
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export function useDivulgacaoFeed() {
  const { user, activeProfile } = useAuth();

  return useQuery({
    queryKey: ['divulgacao-feed', user?.id, activeProfile],
    staleTime: 60_000,
    queryFn: async (): Promise<{ ads: FeedAd[]; ctx: FeedContext }> => {
      const [advRes, reRes, veRes, profRes, groupsRes] = await Promise.all([
        // @ts-expect-error - ignore
        supabase.from('advertiser_listings')
          .select('id, title, category, price, city, cover_image_url, is_promoted, created_at')
          .eq('listing_status', 'active')
          .order('created_at', { ascending: false })
          .limit(60),
        // @ts-expect-error - ignore
        supabase.from('real_estate_listings')
          .select('id, title, property_type, price_brl, city, neighborhood, agency_name, is_promoted, created_at, lat, lng, real_estate_media(public_masked_storage_path, original_storage_path)')
          .eq('visibility_status', 'published')
          .order('created_at', { ascending: false })
          .limit(30),
        // @ts-expect-error - ignore
        supabase.from('vehicle_listings')
          .select('id, title, vehicle_type, brand, model, price_brl, city, neighborhood, view_count, is_promoted, created_at, vehicle_media(public_masked_storage_path, original_storage_path)')
          .eq('visibility_status', 'published')
          .order('created_at', { ascending: false })
          .limit(30),
        user?.id
          ? // @ts-expect-error - ignore
            supabase.from(activeProfile === 'driver' ? 'driver_profiles' : 'motoboy_profiles')
              .select(activeProfile === 'driver'
                ? 'cidade'
                : 'cidade, latitude_residencia, longitude_residencia, current_lat, current_lng')
              .eq('user_id', user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        user?.id
          ? // @ts-expect-error - ignore
            supabase.from('whatsapp_groups')
              .select('city_name, latitude, longitude').eq('owner_user_id', user.id).eq('is_active', true)
          : Promise.resolve({ data: [] }),
      ]);

      const raw: { ad: FeedAd; coords: { lat: number; lng: number } | null }[] = [];

      for (const a of (advRes.data || [])) {
        raw.push({
          coords: null, // só cidade — geocodificada abaixo
          ad: {
            id: a.id, kind: 'divulgacao',
            title: a.title || 'Anúncio',
            storeName: null,
            price: a.price != null ? Number(a.price) : null,
            city: a.city, neighborhood: null,
            category: a.category || 'Produto',
            image: a.cover_image_url || null,
            createdAt: a.created_at,
            views: null,
            isPromoted: Boolean(a.is_promoted),
            path: `/produto/${a.id}`,
            distanceKm: null,
          },
        });
      }

      for (const r of (reRes.data || [])) {
        raw.push({
          coords: r.lat != null && r.lng != null ? { lat: Number(r.lat), lng: Number(r.lng) } : null,
          ad: {
            id: r.id, kind: 'imovel',
            title: r.title || 'Imóvel',
            storeName: r.agency_name || null,
            price: r.price_brl != null ? Number(r.price_brl) : null,
            city: r.city, neighborhood: r.neighborhood,
            category: `Imóveis · ${String(r.property_type || '').replace(/_/g, ' ') || 'geral'}`,
            image: mediaUrl('real-estate-public', r.real_estate_media?.[0]),
            createdAt: r.created_at,
            views: null,
            isPromoted: Boolean(r.is_promoted),
            path: `/imoveis/${r.id}`,
            distanceKm: null,
          },
        });
      }

      for (const v of (veRes.data || [])) {
        raw.push({
          coords: null,
          ad: {
            id: v.id, kind: 'veiculo',
            title: v.title || [v.brand, v.model].filter(Boolean).join(' ') || 'Veículo',
            storeName: null,
            price: v.price_brl != null ? Number(v.price_brl) : null,
            city: v.city, neighborhood: v.neighborhood,
            category: `Veículos · ${String(v.vehicle_type || '').replace(/_/g, ' ') || 'geral'}`,
            image: mediaUrl('real-estate-original', v.vehicle_media?.[0]),
            createdAt: v.created_at,
            views: v.view_count ?? null,
            isPromoted: Boolean(v.is_promoted),
            path: `/veiculos/${v.id}`,
            distanceKm: null,
          },
        });
      }

      const profObj = profRes as Record<string, unknown> | null;
      const prof = (profObj?.data as Record<string, unknown>) ?? null;
      
      const groupsObj = groupsRes as Record<string, unknown> | null;
      const groupRows = (groupsObj?.data as Record<string, unknown>[]) || [];

      const ctx: FeedContext = {
        profileCity: (prof?.cidade as string) ?? null,
        groupCities: [...new Set(groupRows
          .map((g) => normCity(g.city_name as string)).filter(Boolean))] as string[],
      };

      /* ── REGRA DOS 100 KM ────────────────────────────────────────
         A divulgação só ocorre num raio de DIVULGACAO_RAIO_KM a partir
         de onde a loja cadastrou o anúncio. Base do profissional =
         residência do perfil + coordenadas dos grupos vinculados.
         Sem como calcular (anúncio sem cidade/coords, ou profissional
         sem base) → mantém (segmentação geral), nunca inventa bloqueio. */
      const basePoints: { lat: number; lng: number }[] = [];
      if (prof?.latitude_residencia != null && prof?.longitude_residencia != null) {
        basePoints.push({ lat: Number(prof.latitude_residencia), lng: Number(prof.longitude_residencia) });
      } else if (prof?.current_lat != null && prof?.current_lng != null) {
        basePoints.push({ lat: Number(prof.current_lat), lng: Number(prof.current_lng) });
      }
      for (const g of groupRows) {
        if (g.latitude != null && g.longitude != null) {
          basePoints.push({ lat: Number(g.latitude), lng: Number(g.longitude) });
        }
      }
      if (!basePoints.length && prof?.cidade) {
        const c = await geocodeCityCached(prof.cidade);
        if (c) basePoints.push(c);
      }

      const ads: FeedAd[] = [];
      for (const item of raw) {
        let coords = item.coords;
        if (!coords && item.ad.city) coords = await geocodeCityCached(item.ad.city);
        if (coords && basePoints.length) {
          const dist = Math.min(...basePoints.map(b => haversineKm(b, coords!)));
          item.ad.distanceKm = Math.round(dist);
          if (dist > DIVULGACAO_RAIO_KM) continue; // fora do raio contratado — não exibe
        }
        ads.push(item.ad);
      }

      return { ads, ctx };
    },
  });
}
