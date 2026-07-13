import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useActiveFooterLinks } from '@/hooks/useActiveFooterLinks';

const APP_VERSION = '1.0.0';

/**
 * @deprecated Use FooterNeutral instead. This is a compatibility wrapper.
 */
export function Footer() {
  const { links, loading } = useActiveFooterLinks();
  const currentDate = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <footer className="mt-auto border-t border-white/10 py-5 px-4 bg-[#68c7f2] relative z-10">
      <div className="container max-w-5xl mx-auto space-y-3">
        <nav className="flex flex-wrap justify-center gap-x-3 gap-y-2 text-[13px] font-medium">
          {!loading && links.map((link, index) => (
            <span key={`${link.to}-${link.label}`} className="flex items-center gap-3">
              <Link to={link.to} className="text-white hover:text-white/80 hover:underline transition-colors">
                {link.label}
              </Link>
              {index < links.length - 1 && <span className="text-white/40">•</span>}
            </span>
          ))}
        </nav>

        <p className="text-center text-xs tracking-wide text-white/70">
          © {new Date().getFullYear()} Viagg-TX8™ • Plataforma de Mobilidade
        </p>

        <p className="text-center text-[10px] tracking-wider text-white/50">
          Versão {APP_VERSION} • Última atualização: {currentDate}
        </p>
      </div>
    </footer>
  );
}
