import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface FooterContent {
  id: string;
  content_type: string;
  title: string;
  content: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  // Campos não existentes na tabela atual (mantidos opcionais p/ compatibilidade da UI).
  profile_type?: string;
  version?: number;
  created_by?: string | null;
}

export type ProfileType = 'passenger' | 'motoboy' | 'mototaxi' | 'driver' | 'freight' | 'merchant' | 'global';
export type ContentType = 'about' | 'privacy' | 'terms' | 'lgpd' | 'cancellation' | 'cookies' | 'complaints' | 'groups' | 'support' | 'custom';

export const PROFILE_TYPES: { value: ProfileType; label: string }[] = [
  { value: 'global', label: 'Global (Todos)' },
  { value: 'passenger', label: 'Passageiro' },
  { value: 'motoboy', label: 'Motoboy' },
  { value: 'mototaxi', label: 'Mototaxi' },
  { value: 'driver', label: 'Motorista' },
  { value: 'freight', label: 'Freteiro' },
  { value: 'merchant', label: 'Comerciante' },
];

export const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: 'about', label: 'Sobre Nós' },
  { value: 'privacy', label: 'Política de Privacidade' },
  { value: 'terms', label: 'Termos de Uso' },
  { value: 'lgpd', label: 'LGPD' },
  { value: 'cancellation', label: 'Cancelamento' },
  { value: 'cookies', label: 'Política de Cookies' },
  { value: 'groups', label: 'Grupos' },
  { value: 'complaints', label: 'Canal de Denúncia' },
  { value: 'support', label: 'Suporte' },
  { value: 'custom', label: 'Outro' },
];

export function useFooterContents() {
  const [contents, setContents] = useState<FooterContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchContents = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('footer_contents')
        .select('*')
        .order('content_type', { ascending: true })
        .order('display_order', { ascending: true });

      if (error) throw error;

      const fetchedContents = data || [];

      // Auto-seed LGPD if it's completely missing from DB (helps bypass CLI migration failures)
      const hasLgpd = fetchedContents.some(c => c.content_type === 'lgpd');
      if (!hasLgpd) {
        try {
          const { data: userData } = await supabase.auth.getUser();
          if (userData.user?.id) {
            console.log("Auto-seeding LGPD Content into database...");
            const lgpdText = `A Viagg-TX8 respeita a sua privacidade e está comprometida com a proteção dos dados pessoais de seus usuários, em conformidade com a Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018).\n\nNosso compromisso é tratar seus dados pessoais com segurança, transparência e apenas para as finalidades para as quais foram coletados.\n\n1. Coleta de Dados\nColetamos informações necessárias para a prestação de nossos serviços de intermediação de entregas.\n\n2. Uso dos Dados\nOs dados são utilizados exclusivamente para:\n- Viabilizar a coleta e entrega das mercadorias.\n- Comunicação de status.\n- Segurança e prevenção à fraude.\n\n3. Direitos do Titular\nVocê tem o direito de solicitar o acesso, correção, atualização ou exclusão dos seus dados a qualquer momento, acessando o menu de opções ou entrando em contato com nosso suporte.`;

            await supabase.from('footer_contents').insert({
              content_type: 'lgpd',
              title: 'Política LGPD',
              content: lgpdText,
              is_active: true,
              display_order: 5,
            });
            // Refetch after seeding
            const { data: newData } = await supabase
              .from('footer_contents')
              .select('*')
              .order('content_type', { ascending: true })
              .order('display_order', { ascending: true });
            if (newData) {
              setContents(newData);
            }
          } else {
            setContents(fetchedContents);
          }
        } catch (seedErr) {
          console.error("Failed to auto-seed LGPD", seedErr);
          setContents(fetchedContents);
        }
      } else {
        setContents(fetchedContents);
      }
    } catch (error: Error | unknown) {
      toast({
        title: 'Erro ao carregar conteúdos',
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchContents();
  }, [fetchContents]);

  const saveContent = async (content: Partial<FooterContent> & { id?: string }) => {
    setSaving(true);
    try {
      const now = new Date().toISOString();

      if (content.id) {
        // Update existing
        const { error } = await supabase
          .from('footer_contents')
          .update({
            content_type: content.content_type as ContentType,
            title: content.title,
            content: content.content,
            is_active: content.is_active,
            display_order: content.display_order ?? 99,
            updated_at: now,
          })
          .eq('id', content.id);

        if (error) throw error;

        toast({
          title: 'Conteúdo atualizado',
          description: 'As alterações foram salvas com sucesso.',
        });
      } else {
        // Insert new
        const { error } = await supabase
          .from('footer_contents')
          .insert({
            content_type: content.content_type as ContentType,
            title: content.title!,
            content: content.content!,
            is_active: content.is_active ?? true,
            display_order: content.display_order ?? 99,
          });

        if (error) throw error;

        toast({
          title: 'Conteúdo criado',
          description: 'O novo conteúdo foi salvo com sucesso.',
        });
      }

      // Se marcou como ativo, desativa os outros conteúdos do mesmo tipo
      // (mantém apenas um ativo por content_type).
      if (content.is_active && content.content_type) {
        await supabase
          .from('footer_contents')
          .update({ is_active: false, updated_at: now })
          .eq('content_type', content.content_type as ContentType)
          .neq('id', content.id || '');
      }

      await fetchContents();
    } catch (error: Error | unknown) {
      toast({
        title: 'Erro ao salvar',
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const createNewVersion = async (baseContent: FooterContent) => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { data: userData } = await supabase.auth.getUser();

      // Deactivate the current version
      await supabase
        .from('footer_contents')
        .update({ is_active: false, updated_at: now })
        .eq('id', baseContent.id);

      // Create new version
      const { data, error } = await supabase
        .from('footer_contents')
        .insert({
          profile_type: baseContent.profile_type,
          content_type: baseContent.content_type as ContentType,
          title: baseContent.title,
          content: baseContent.content,
          is_active: true,
          version: baseContent.version + 1,
          created_by: userData.user?.id || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Nova versão criada',
        description: `Versão ${baseContent.version + 1} criada e ativada.`,
      });

      await fetchContents();
      return data as FooterContent;
    } catch (error: Error | unknown) {
      toast({
        title: 'Erro ao criar nova versão',
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: 'destructive',
      });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const deleteContent = async (id: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('footer_contents')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Conteúdo excluído',
        description: 'O conteúdo foi removido permanentemente.',
      });

      await fetchContents();
    } catch (error: Error | unknown) {
      toast({
        title: 'Erro ao excluir',
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, isActive: boolean, profileType: string, contentType: string) => {
    setSaving(true);
    try {
      const now = new Date().toISOString();

      // If activating, first deactivate others of same profile+content type
      if (isActive) {
        await supabase
          .from('footer_contents')
          .update({ is_active: false, updated_at: now })
          .eq('profile_type', profileType)
          .eq('content_type', contentType as ContentType)
          .neq('id', id);
      }

      const { error } = await supabase
        .from('footer_contents')
        .update({ is_active: isActive, updated_at: now })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: isActive ? 'Conteúdo ativado' : 'Conteúdo desativado',
      });

      await fetchContents();
    } catch (error: Error | unknown) {
      toast({
        title: 'Erro ao alterar status',
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return {
    contents,
    loading,
    saving,
    fetchContents,
    saveContent,
    createNewVersion,
    deleteContent,
    toggleActive,
  };
}
