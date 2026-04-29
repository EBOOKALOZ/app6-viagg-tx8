import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

interface FooterLink {
  to: string;
  label: string;
  order: number;
}

const CONTENT_TYPE_CONFIG: Record<string, { route: string; label: string; defaultOrder: number }> = {
  terms: { route: "/motoboy/legal/terms", label: "Termos", defaultOrder: 4 },
  lgpd: { route: "/motoboy/lgpd", label: "LGPD", defaultOrder: 5 },
  cancellation: { route: "/motoboy/legal/cancellation", label: "Cancelamento", defaultOrder: 6 },
  cookies: { route: "/motoboy/legal/cookies", label: "Política de Cookies", defaultOrder: 7 },
  complaints: { route: "/motoboy/legal/complaints", label: "Canal de Denúncia", defaultOrder: 8 },
  support: { route: "/support", label: "Suporte", defaultOrder: 2 },
  groups: { route: "/motoboy/legal/groups", label: "Grupos", defaultOrder: 99 },
};

const STATIC_LINKS: FooterLink[] = [];

const FALLBACK_LINKS: FooterLink[] = [
  { to: "/support", label: "Suporte", order: 2 },
  { to: "/motoboy/lgpd", label: "LGPD", order: 5 },
  { to: "/motoboy/legal/cancellation", label: "Cancelamento", order: 6 },
  { to: "/motoboy/legal/cookies", label: "Política de Cookies", order: 7 },
  { to: "/motoboy/legal/groups", label: "Grupos", order: 99 },
];

const CNPJ_CONFIGURED: string | null = null;
const APP_VERSION = "1.0.0";

export function MotoboyFooter() {
  const [links, setLinks] = useState<FooterLink[]>(FALLBACK_LINKS);
  const [showCnpjModal, setShowCnpjModal] = useState(false);
  const currentDate = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  useEffect(() => {
    const fetchLinks = async () => {
      try {
        const { data, error } = await supabase
          .from("footer_contents")
          .select("content_type, profile_type, display_order, is_active")
          .or("profile_type.eq.global,profile_type.eq.motoboy");

        if (error) throw error;

        // Build a map of what's in the DB
        const dbConfigMap = new Map<string, { isActive: boolean; order: number; profileType: string }>();

        data?.forEach((item) => {
          if (!CONTENT_TYPE_CONFIG[item.content_type]) return;
          const existing = dbConfigMap.get(item.content_type);

          if (!existing || (existing.profileType === "global" && item.profile_type === "motoboy")) {
            dbConfigMap.set(item.content_type, {
              isActive: item.is_active,
              order: item.display_order ?? CONTENT_TYPE_CONFIG[item.content_type].defaultOrder,
              profileType: item.profile_type
            });
          }
        });

        const finalLinks: FooterLink[] = [];

        // Combine DB configs and FALLBACK defaults
        Object.entries(CONTENT_TYPE_CONFIG).forEach(([type, config]) => {
          const dbItem = dbConfigMap.get(type);

          if (dbItem) {
            if (dbItem.isActive) {
              finalLinks.push({ to: config.route, label: config.label, order: dbItem.order });
            }
          } else {
            // Check if it's in fallbacks
            const isFallback = FALLBACK_LINKS.find(fl => fl.to === config.route);
            if (isFallback) {
              finalLinks.push({ to: config.route, label: config.label, order: config.defaultOrder });
            }
          }
        });

        const merged = [...finalLinks];
        STATIC_LINKS.forEach(staticLink => {
          if (!merged.find(m => m.to === staticLink.to)) {
            merged.push(staticLink);
          }
        });

        setLinks(merged.sort((a, b) => a.order - b.order));
      } catch (err) {
        setLinks([...FALLBACK_LINKS].sort((a, b) => a.order - b.order));
      }
    };

    fetchLinks();

    const channel = supabase
      .channel("motoboy-footer-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "footer_contents" }, () => {
        fetchLinks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <>
      {/* Clone exato do PublicFooter — apenas bg-black → bg-motoboy */}
      <footer className="mt-auto border-t border-white/10 py-5 px-4 bg-motoboy relative z-10">
        <div className="container max-w-5xl mx-auto space-y-3">
          <nav className="flex flex-wrap justify-center gap-x-3 gap-y-2 text-[13px] font-medium">
            {links.map((link, index) => (
              <span key={`${link.to}-${link.label}`} className="flex items-center gap-3">
                <Link
                  to={link.to}
                  className="text-white hover:text-white/80 hover:underline transition-colors"
                >
                  {link.label}
                </Link>
                {index < links.length - 1 && (
                  <span className="text-white/40">•</span>
                )}
              </span>
            ))}
          </nav>

          <div className="flex flex-col items-center gap-0">
            <p className="text-center text-xs tracking-wide text-white/70">
              © 2026 Viagg-TX8 • Plataforma de Mobilidade
            </p>
            {CNPJ_CONFIGURED ? (
              <p className="text-center text-[11px] text-white/50">
                CNPJ: {CNPJ_CONFIGURED}
              </p>
            ) : (
              <button
                onClick={() => setShowCnpjModal(true)}
                className="text-[11px] text-white/50 hover:text-white hover:underline transition-colors cursor-pointer"
              >
                Ativar CNPJ
              </button>
            )}
          </div>

          <p className="text-center text-[10px] tracking-wider text-white/50">
            Versão {APP_VERSION} • Última atualização: {currentDate}
          </p>
        </div>
      </footer>

      <Dialog open={showCnpjModal} onOpenChange={setShowCnpjModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configuração de CNPJ</DialogTitle>
            <DialogDescription className="pt-2">
              Configure o CNPJ no painel administrativo quando disponível.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
