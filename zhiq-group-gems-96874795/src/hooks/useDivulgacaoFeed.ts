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

function mediaUrl(bucket: string, row: any): string | null {
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
        (supabase.from('advertiser_listings') as any)
          .select('id, title, category, price, city, cover_image_url, is_promoted, created_at')
          .eq('listing_status', 'active')
          .order('created_at', { ascending: false })
          .limit(60),
        (supabase.from('real_estate_listings') as any)
          .select('id, title, property_type, price_brl, city, neighborhood, agency_name, is_promoted, created_at, real_estate_media(public_masked_storage_path, original_storage_path)')
          .eq('visibility_status', 'published')
          .order('created_at', { ascending: false })
          .limit(30),
        (supabase.from('vehicle_listings') as any)
          .select('id, title, vehicle_type, brand, model, price_brl, city, neighborhood, view_count, is_promoted, created_at, vehicle_media(public_masked_storage_path, original_storage_path)')
          .eq('visibility_status', 'published')
          .order('created_at', { ascending: false })
          .limit(30),
        user?.id
          ? (supabase.from(activeProfile === 'driver' ? 'driver_profiles' : 'motoboy_profiles') as any)
              .select('cidade').eq('user_id', user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        user?.id
          ? (supabase.from('whatsapp_groups') as any)
              .select('city_name').eq('owner_user_id', user.id).eq('is_active', true)
          : Promise.resolve({ data: [] }),
      ]);

      const ads: FeedAd[] = [];

      for (const a of (advRes.data || [])) {
        ads.push({
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
        });
      }

      for (const r of (reRes.data || [])) {
        ads.push({
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
        });
      }

      for (const v of (veRes.data || [])) {
        ads.push({
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
        });
      }

      const ctx: FeedContext = {
        profileCity: (profRes as any)?.data?.cidade ?? null,
        groupCities: [...new Set(((groupsRes as any)?.data || [])
          .map((g: any) => normCity(g.city_name)).filter(Boolean))] as string[],
      };

      return { ads, ctx };
    },
  });
}
