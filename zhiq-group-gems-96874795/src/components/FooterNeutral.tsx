import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface FooterNeutralProps {
  light?: boolean;
  compact?: boolean;
  label?: string;
}

export function FooterNeutral({ light = false, compact = false, label = "🛒 Mercado Local" }: FooterNeutralProps) {
  return (
    <footer className="mt-auto border-t border-white/10 bg-[#68c7f2] relative z-10 w-full text-zinc-900 text-center py-1.5 text-xs font-medium space-y-0">
      <p className="flex items-center justify-center gap-1.5">
        <img src="/logo.png" alt="Viagg" className="h-8 w-auto object-contain rounded-lg shadow-sm mt-1" />
        Viagg-TX8™ · {label}
      </p>
      <p className="text-zinc-900/70 text-[10px]">© 2026 Desenvolvido por VIAGG-TX8</p>
    </footer>
  );
}

