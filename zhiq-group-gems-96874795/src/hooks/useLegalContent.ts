import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LegalContent {
  id: string;
  content_type: string;
  title: string;
  content: string;
}

// Mapeia o tipo da URL (/legal/:type) para o content_type salvo no banco.
const CONTENT_TYPE_MAP: Record<string, string> = {
  'privacy': 'privacy',
  'privacidade': 'privacy',
  'terms': 'terms',
  'termos': 'terms',
  'about': 'about',
  'sobre': 'about',
  'lgpd': 'lgpd',
  'cancellation': 'cancellation',
  'cancelamento': 'cancellation',
  'cookies': 'cookies',
  'groups': 'groups',
  'grupos': 'groups',
  'complaints': 'complaints',
  'denuncia': 'complaints',
  'support': 'support',
  'suporte': 'support',
  'custom': 'custom',
};

export function useLegalContent(type: string | undefined) {
  const [content, setContent] = useState<LegalContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchContent() {
      if (!type) {
        setError('Tipo de conteúdo não especificado');
        setLoading(false);
        return;
      }

      const contentType = CONTENT_TYPE_MAP[type.toLowerCase()] ?? type.toLowerCase();

      setLoading(true);
      setError(null);

      try {
        // footer_contents é global (sem profile_type). Pega o conteúdo ativo
        // mais recente do tipo pedido.
        const { data, error: qErr } = await supabase
          .from('footer_contents')
          .select('id, content_type, title, content')
          .eq('content_type', contentType)
          .eq('is_active', true)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (qErr) throw qErr;
        setContent((data as LegalContent) || null);
      } catch (err: any) {
        console.error('Error fetching legal content:', err);
        setError(err.message || 'Erro ao carregar conteúdo');
      } finally {
        setLoading(false);
      }
    }

    fetchContent();
  }, [type]);

  return { content, loading, error };
}
