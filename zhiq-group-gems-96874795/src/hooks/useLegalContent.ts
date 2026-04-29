import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface LegalContent {
  id: string;
  profile_type: string;
  content_type: string;
  title: string;
  content: string;
  version: number;
}

// Map URL types to database content_type values (ENUM: about, privacy, terms, lgpd, cancellation, cookies, groups, complaints, custom)
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

// Map profile types to database values
const PROFILE_TYPE_MAP: Record<string, string> = {
  'passenger': 'passenger',
  'motoboy': 'motoboy',
  'mototaxi': 'mototaxi',
  'driver': 'driver',
  'freteiro': 'freight',
  'freight': 'freight',
  'merchant': 'merchant',
  'comerciante': 'merchant',
};

export function useLegalContent(type: string | undefined) {
  const [content, setContent] = useState<LegalContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { activeProfile } = useAuth();

  useEffect(() => {
    async function fetchContent() {
      if (!type) {
        setError('Tipo de conteúdo não especificado');
        setLoading(false);
        return;
      }

      const contentType = CONTENT_TYPE_MAP[type.toLowerCase()];
      if (!contentType) {
        setError('Tipo de conteúdo inválido');
        setLoading(false);
        return;
      }

      const profileType = activeProfile ? PROFILE_TYPE_MAP[activeProfile] || activeProfile : null;

      setLoading(true);
      setError(null);

      try {
        // First, try to fetch profile-specific content
        if (profileType) {
          const { data: profileContent, error: profileError } = await supabase
            .from('footer_contents')
            .select('id, profile_type, content_type, title, content, version')
            .eq('profile_type', profileType)
            .eq('content_type', contentType as 'about' | 'privacy' | 'terms' | 'lgpd' | 'cancellation' | 'cookies' | 'groups' | 'complaints' | 'support' | 'custom')
            .eq('is_active', true)
            .order('version', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (profileError) throw profileError;

          if (profileContent) {
            setContent(profileContent);
            setLoading(false);
            return;
          }
        }

        // Fallback to global content
        const { data: globalContent, error: globalError } = await supabase
          .from('footer_contents')
          .select('id, profile_type, content_type, title, content, version')
          .eq('profile_type', 'global')
          .eq('content_type', contentType as 'about' | 'privacy' | 'terms' | 'lgpd' | 'cancellation' | 'cookies' | 'groups' | 'complaints' | 'support' | 'custom')
          .eq('is_active', true)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (globalError) throw globalError;

        if (globalContent) {
          setContent(globalContent);
        } else {
          // Instead of an error, just leave content empty so LegalPage can render a fallback if it exists
          setContent(null);
        }
      } catch (err: any) {
        console.error('Error fetching legal content:', err);
        setError(err.message || 'Erro ao carregar conteúdo');
      } finally {
        setLoading(false);
      }
    }

    fetchContent();
  }, [type, activeProfile]);

  return { content, loading, error };
}
