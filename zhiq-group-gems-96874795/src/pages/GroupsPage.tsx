import { useNavigate } from 'react-router-dom';
import { Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLegalContent } from '@/hooks/useLegalContent';
import { InstitutionalBlock } from '@/components/legal/InstitutionalBlock';

export default function GroupsPage() {
  const navigate = useNavigate();
  const { content, loading, error } = useLegalContent('groups');

  return (
    <div className="container max-w-3xl mx-auto py-8 px-4">
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="p-4 rounded-full bg-muted">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">Grupos da Plataforma</h2>
          <p className="text-muted-foreground max-w-md">
            Informações sobre grupos serão disponibilizadas em breve. 
            Entre em contato com o suporte para mais detalhes.
          </p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Voltar
          </Button>
        </div>
      )}

      {content && !loading && (
        <article className="prose prose-slate max-w-none dark:prose-invert">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold m-0">{content.title}</h1>
          </div>
          <div className="whitespace-pre-wrap text-foreground leading-relaxed">
            {content.content}
          </div>

          {/* Bloco Institucional */}
          <InstitutionalBlock />
        </article>
      )}
    </div>
  );
}
