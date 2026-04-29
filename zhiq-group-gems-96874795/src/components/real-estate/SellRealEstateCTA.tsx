import React from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Megaphone, Home, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface SellRealEstateCTAProps {
  variant?: 'banner' | 'simple';
  className?: string;
}

export const SellRealEstateCTA: React.FC<SellRealEstateCTAProps> = ({ 
  variant = 'banner',
  className = ''
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleCtaClick = async () => {
    // 1. Tracking
    try {
      await supabase.from('analytics_events' as any).insert({
        event_name: 'real_estate_sell_cta_clicked',
        user_id: user?.id || null,
        metadata: { variant, path: window.location.pathname }
      } as any);
    } catch (err) {
      console.warn('Tracking failed:', err);
    }

    // 2. Navigation logic
    if (user) {
      localStorage.setItem("viagg_auth_entry", "advertiser");
      navigate("/anunciante/painel");
    } else {
      navigate("/auth?entry=advertiser");
    }
  };

  if (variant === 'simple') {
    return (
      <Button 
        onClick={handleCtaClick}
        className={`bg-primary hover:bg-primary/90 text-white font-bold py-6 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all group gap-2 ${className}`}
      >
        <Megaphone className="w-5 h-5 group-hover:rotate-12 transition-transform" />
        QUERO VENDER
        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </Button>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-background to-primary/5 border border-primary/20 p-8 md:p-12 shadow-2xl ${className}`}>
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl" />

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex-1 space-y-4 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
            <Home className="w-3 h-3" />
            Oportunidade Premium
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Venda ou anuncie seu imóvel com <span className="text-primary italic">proteção de contato</span> e alcance local inteligente.
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl">
            Publique chácara, sítio, fazenda, lote ou terreno e receba interessados qualificados.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3">
          <Button 
            onClick={handleCtaClick}
            size="lg"
            className="h-16 px-10 text-xl font-black bg-primary hover:bg-primary/90 text-white rounded-2xl shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)] hover:scale-105 transition-all group gap-3"
          >
            <Megaphone className="w-6 h-6 group-hover:rotate-12 transition-transform" />
            QUERO VENDER
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Button>
          <span className="text-xs text-muted-foreground italic font-medium">
            Grátis para começar • Proteção Anti-SPAM
          </span>
        </div>
      </div>
    </div>
  );
};
