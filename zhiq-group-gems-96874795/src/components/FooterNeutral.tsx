import { Link } from 'react-router-dom';
import { Shield, Lock, Instagram, Facebook, Twitter, Mail, Phone, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface FooterNeutralProps {
  light?: boolean;
  compact?: boolean;
}

const APP_VERSION = '1.0.0';

export function FooterNeutral({ light = false, compact = false }: FooterNeutralProps) {
  const currentDate = format(new Date(), "yyyy", { locale: ptBR });

  return (
    <footer className={`mt-auto border-t border-white/10 bg-[#111827] relative z-10 w-full text-white ${compact ? 'pt-2.5 pb-2 px-3' : 'pt-0.5 pb-0.5 px-4'}`}>
      <div className={compact ? "max-w-3xl mx-auto" : "max-w-6xl mx-auto"}>
        {/* Main Footer Grid */}
        <div className={`grid ${compact ? 'grid-cols-2 md:grid-cols-4 gap-2 mb-2' : 'grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1 mb-1'}`}>

          {/* Column 1: Quick Links */}
          <div className="col-span-1">
            <h3 className={`text-white font-semibold flex items-center gap-1.5 ${compact ? 'text-[9px] mb-0.5' : 'mb-0.5 text-[9px]'}`}>
              <span className={`${compact ? 'w-0.5 h-2' : 'w-1 h-3'} bg-orange-500 rounded-full block`}></span>
              Plataforma
            </h3>
            <ul className={`text-white/50 ${compact ? 'space-y-0.5 text-[8px]' : 'space-y-0 text-[6px]'}`}>
              <li><Link to="/auth" className="hover:text-teal-400 transition-colors">Área do Lojista</Link></li>
              <li><Link to="/auth" className="hover:text-teal-400 transition-colors">Motoboy</Link></li>
              {/* {!compact && <li><span className="opacity-50 cursor-not-allowed">App Passageiro</span></li>} */}
              <li><Link to="/support" className="hover:text-teal-400 transition-colors">Ajuda</Link></li>
            </ul>
          </div>

          {/* Column 2: Legal & Terms */}
          <div className="col-span-1">
            <h3 className={`text-white font-semibold flex items-center gap-1.5 ${compact ? 'text-[9px] mb-0.5' : 'mb-0.5 text-[9px]'}`}>
              <span className={`${compact ? 'w-0.5 h-2' : 'w-1 h-3'} bg-teal-500 rounded-full block`}></span>
              Legal
            </h3>
            <ul className={`text-white/50 ${compact ? 'space-y-0.5 text-[8px]' : 'space-y-0 text-[6px]'}`}>
              <li><Link to="/legal/about" className="hover:text-teal-400 transition-colors">Sobre</Link></li>
              <li><Link to="/legal/terms" className="hover:text-teal-400 transition-colors">Termos</Link></li>
              <li><Link to="/legal/privacy" className="hover:text-teal-400 transition-colors">Privacidade</Link></li>
              <li><Link to="/legal/lgpd" className="hover:text-teal-400 transition-colors">LGPD</Link></li>
            </ul>
          </div>

          {/* Column 3: Brand & About */}
          <div className={`col-span-1 ${compact ? "space-y-0.5" : "space-y-0.5"}`}>
            <div className="flex items-center gap-1.5">
              <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className={`rounded-lg object-contain ${compact ? 'h-6 w-6' : 'h-8 w-8'}`} />
              {!compact && (
                <span className="text-[11px] font-bold bg-gradient-to-r from-teal-400 to-green-500 bg-clip-text text-transparent">
                  Viagg-TX8™
                </span>
              )}
            </div>
            {!compact && (
              <p className="text-white/50 text-[8px] leading-tight">
                Plataforma inteligente para a economia local.
              </p>
            )}
          </div>

          {/* Column 4: Contact & Support */}
          <div className={`col-span-1`}>
            <h3 className={`text-white font-semibold flex items-center gap-1.5 ${compact ? 'text-[9px] mb-0.5' : 'mb-0.5 text-[9px]'}`}>
              <span className={`${compact ? 'w-0.5 h-2' : 'w-1 h-3'} bg-green-500 rounded-full block`}></span>
              Contato
            </h3>
            <ul className={`text-white/50 ${compact ? 'space-y-0.5 text-[8px]' : 'space-y-0 text-[6px]'}`}>
              <li className="flex items-start gap-2">
                <Mail className={`mt-0.5 text-teal-400 ${compact ? 'w-3 h-3' : 'w-4 h-4'}`} />
                <span>suporte@viagg-tx8.com</span>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Bar: Security & Copyright */}
        <div className={`border-t border-white/10 flex flex-col items-center justify-center text-center ${compact ? 'pt-1.5 gap-1.5' : 'pt-0.5 gap-0.5'}`}>

          <div className={`flex items-center gap-2 text-white/40 uppercase tracking-wider font-semibold ${compact ? 'text-[9px]' : 'text-[7px]'}`}>
            {!light && (
              <>
                <span className="flex items-center gap-1">
                  <Lock className={`text-teal-500 ${compact ? 'h-3 w-3' : 'h-2 w-2'}`} />
                  Pagamento Seguro
                </span>
                <span className="flex items-center gap-1">
                  <Shield className={`text-teal-500 ${compact ? 'h-3 w-3' : 'h-2 w-2'}`} />
                  Dados Protegidos
                </span>
              </>
            )}
          </div>

          <div className="text-center md:text-right">
            <p className={`text-white/40 ${compact ? 'text-[10px]' : 'text-[8px]'}`}>
              &copy; {currentDate} Viagg-TX8™. Todos os direitos reservados.
            </p>
            {!compact && (
              <p className="text-[7px] text-white/20 tracking-wider uppercase">
                Versão: {APP_VERSION}
              </p>
            )}
          </div>

        </div>
      </div>
    </footer>
  );
}
