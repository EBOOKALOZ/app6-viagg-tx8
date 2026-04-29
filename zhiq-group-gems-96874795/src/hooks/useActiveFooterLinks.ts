import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface FooterLink {
  to: string;
  label: string;
  order: number;
}

/**
 * Mapa de content_type → rota/label.
 * Rotas são resolvidas dinamicamente com base no prefixo do perfil.
 */
const CONTENT_TYPE_CONFIG: Record<string, { baseRoute: string; label: string; defaultOrder: number }> = {
  about: { baseRoute: "/legal/about", label: "Sobre", defaultOrder: 1 },
  privacy: { baseRoute: "/legal/privacy", label: "Privacidade", defaultOrder: 3 },
  terms: { baseRoute: "/legal/terms", label: "Termos", defaultOrder: 4 },
  lgpd: { baseRoute: "/legal/lgpd", label: "LGPD", defaultOrder: 5 },
  cancellation: { baseRoute: "/legal/cancellation", label: "Cancelamento", defaultOrder: 6 },
  cookies: { baseRoute: "/legal/cookies", label: "Política de Cookies", defaultOrder: 7 },
  complaints: { baseRoute: "/legal/complaints", label: "Canal de Denúncia", defaultOrder: 8 },
  groups: { baseRoute: "/legal/groups", label: "Grupos", defaultOrder: 99 },
};

const STATIC_LINKS: FooterLink[] = [
  { to: "/support", label: "Suporte", order: 2 },
];

/**
 * Hook unificado para links do rodapé.
 * - Busca conteúdos ativos da tabela `footer_contents`
 * - Escuta mudanças em tempo real
 * - routePrefix opcional (ex: "/motoboy") para montar rotas contextuais
 * - profileFilter opcional para filtrar por perfil específico
 */
export function useActiveFooterLinks(options?: {
  routePrefix?: string;
  profileFilter?: string;
}) {
  const [links, setLinks] = useState<FooterLink[]>([]);
  const [loading, setLoading] = useState(true);
  const routePrefix = options?.routePrefix || "";
  const profileFilter = options?.profileFilter;

  const fetchLinks = useCallback(async () => {
    try {
      let query = supabase
        .from("footer_contents")
        .select("content_type, profile_type, display_order")
        .eq("is_active", true);

      if (profileFilter) {
        query = query.or(`profile_type.eq.global,profile_type.eq.${profileFilter}`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Prioridade: perfil específico > global
      const dbConfigMap = new Map<string, { profileType: string; displayOrder: number }>();

      data?.forEach((item) => {
        const config = CONTENT_TYPE_CONFIG[item.content_type];
        if (!config) return;

        const existing = dbConfigMap.get(item.content_type);
        if (!existing || (existing.profileType === "global" && item.profile_type !== "global")) {
          dbConfigMap.set(item.content_type, {
            profileType: item.profile_type,
            displayOrder: item.display_order ?? config.defaultOrder,
          });
        }
      });

      const finalLinks: FooterLink[] = [];

      // Combine DB configs and fallbacks defined in config
      Object.entries(CONTENT_TYPE_CONFIG).forEach(([type, config]) => {
        const dbItem = dbConfigMap.get(type);

        if (dbItem) {
          finalLinks.push({
            to: `${routePrefix}${config.baseRoute}`,
            label: config.label,
            order: dbItem.displayOrder,
          });
        } else {
          // If not in DB, we inject the most important ones as fallback
          // (LGPD, terms, privacy, etc) so it never completely disappears
          finalLinks.push({
            to: `${routePrefix}${config.baseRoute}`,
            label: config.label,
            order: config.defaultOrder,
          });
        }
      });

      const merged = [...finalLinks];
      STATIC_LINKS.forEach(staticLink => {
        if (!merged.find(m => m.to.includes(staticLink.to))) {
          merged.push(staticLink);
        }
      });

      setLinks(merged.sort((a, b) => a.order - b.order));
    } catch (error) {
      console.error("Error fetching footer links:", error);
      // Fallback mínimo
      setLinks(STATIC_LINKS);
    } finally {
      setLoading(false);
    }
  }, [routePrefix, profileFilter]);

  useEffect(() => {
    fetchLinks();

    const channel = supabase
      .channel("footer-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "footer_contents" }, () => {
        fetchLinks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLinks]);

  return { links, loading };
}
