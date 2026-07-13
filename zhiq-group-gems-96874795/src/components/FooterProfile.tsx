import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useActiveFooterLinks } from '@/hooks/useActiveFooterLinks';

interface FooterProfileProps {
  profile: 'motoboy' | 'merchant' | string;
}

const PROFILE_THEMES: Record<string, { bg: string; border: string; routePrefix: string; dbProfile: string }> = {
  motoboy:   { bg: 'bg-motoboy',   border: 'border-white/10', routePrefix: '/motoboy', dbProfile: 'motoboy' },
  merchant:  { bg: 'bg-[#68c7f2]', border: 'border-white/10', routePrefix: '',         dbProfile: 'comerciante' },
};

const DEFAULT_THEME = { bg: 'bg-[#68c7f2]', border: 'border-white/10', routePrefix: '', dbProfile: '' };

const APP_VERSION = '1.0.0';

/**
 * Rodapé operacional unificado para todos os perfis logados.
 * 100% dinâmico — consome footer_contents do Admin com realtime.
 */
export function FooterProfile({ profile }: FooterProfileProps) {
  const theme = PROFILE_THEMES[profile] || DEFAULT_THEME;
  const { links, loading } = useActiveFooterLinks({
    routePrefix: theme.routePrefix,
    profileFilter: theme.dbProfile || undefined,
  });

  const currentDate = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  if (loading) return null;

  return (
    <footer className={`mt-auto border-t ${theme.border} ${theme.bg} py-5 px-4 relative z-10`}>
      <div className="container max-w-5xl mx-auto space-y-3">
        {links.length > 0 && (
          <nav className="flex flex-wrap justify-center gap-x-3 gap-y-2 text-[13px] font-medium">
            {links.map((link, i) => (
              <span key={link.to} className="flex items-center gap-3">
                <Link
                  to={link.to}
                  className="text-white hover:text-white/80 hover:underline transition-colors"
                >
                  {link.label}
                </Link>
                {i < links.length - 1 && <span className="text-white/40">•</span>}
              </span>
            ))}
          </nav>
        )}

        <p className="text-center text-xs tracking-wide text-white/70">
          © {new Date().getFullYear()} Viagg-TX8 • Plataforma de Mobilidade
        </p>

        <p className="text-center text-[10px] tracking-wider text-white/50">
          Versão {APP_VERSION} • Última atualização: {currentDate}
        </p>
      </div>
    </footer>
  );
}
