import institutionalLogo from '@/assets/viagg-institutional-logo.png';

/**
 * Bloco institucional fixo exibido ao final de páginas legais.
 * Título + slogan sobre fundo com overlay. Sem logo.
 */
export function InstitutionalBlock() {
  return (
    <div className="text-center">
      <h2 className="text-lg md:text-xl font-semibold text-white mb-2">
        Viagg-TX8 – Plataforma de Mobilidade Inteligente
      </h2>
      <p className="text-white/80 text-lg">
        Tecnologia que fortalece economias locais.
      </p>
    </div>
  );
}
