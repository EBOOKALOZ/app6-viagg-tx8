import { Shield, Lock, CheckCircle } from 'lucide-react';

export function TrustSection() {
  const brands = [
    { src: '/payments/pix.svg', alt: 'PIX' },
    { src: '/payments/visa.svg', alt: 'Visa' },
    { src: '/payments/mastercard.svg', alt: 'Mastercard' },
    { src: '/payments/elo.svg', alt: 'Elo' },
  ];

  return (
    <section className="py-2 px-4" style={{ backgroundColor: '#0a2e22' }}>
      <div className="container max-w-3xl mx-auto space-y-2">
        <h2 className="text-center text-base font-bold text-white tracking-tight">
          Pagamentos seguros e protegidos
        </h2>

        {/* Payment logos */}
        <div className="flex items-center justify-center gap-5 flex-wrap">
          {brands.map((b) => (
            <div
              key={b.alt}
              className="flex items-center justify-center bg-white/10 rounded-lg px-3 py-1.5 h-8 backdrop-blur-sm border border-white/10"
            >
              <img
                src={b.src}
                alt={b.alt}
                className="h-4 w-auto object-contain"
                loading="lazy"
              />
            </div>
          ))}
        </div>

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-8 flex-wrap">
          <span className="flex items-center gap-2 text-white/70 text-sm">
            <Lock className="h-4 w-4 text-emerald-400" />
            Pagamento seguro
          </span>
          <span className="flex items-center gap-2 text-white/70 text-sm">
            <Shield className="h-4 w-4 text-emerald-400" />
            Dados protegidos
          </span>
          <span className="flex items-center gap-2 text-white/70 text-sm">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            Plataforma verificada
          </span>
        </div>
      </div>
    </section>
  );
}
