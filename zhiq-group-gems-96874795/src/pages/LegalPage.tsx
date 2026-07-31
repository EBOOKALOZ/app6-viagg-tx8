import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { FileText, AlertCircle, Loader2, Shield, ScrollText, BookOpen, Cookie, XCircle, Info, Headphones } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLegalContent } from '@/hooks/useLegalContent';
import { PrivacyContent } from '@/components/terms/PrivacyContent';
import { TermsContent } from '@/components/terms/TermsContent';
import { LgpdContent } from '@/components/terms/LgpdContent';
import { InstitutionalBlock } from '@/components/legal/InstitutionalBlock';
import { SoftwareRegisteredSection } from '@/components/legal/SoftwareRegisteredSection';
import { MotoboyPageTemplate } from '@/components/motoboy/MotoboyPageTemplate';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Fallback content components for when database content is not available
const FALLBACK_CONTENT: Record<string, React.ComponentType | null> = {
  privacy: PrivacyContent,
  privacidade: PrivacyContent,
  terms: TermsContent,
  termos: TermsContent,
  lgpd: LgpdContent,
};

const LEGAL_ICONS: Record<string, typeof FileText> = {
  about: Info,
  privacy: Shield,
  terms: ScrollText,
  lgpd: Shield,
  cancellation: XCircle,
  cookies: Cookie,
  groups: BookOpen,
  support: Headphones,
};

const LEGAL_SUBTITLES: Record<string, string> = {
  about: 'Conheça a plataforma e sua missão.',
  privacy: 'Saiba como protegemos seus dados pessoais.',
  terms: 'Condições gerais de uso da plataforma.',
  lgpd: 'Informações sobre a Lei Geral de Proteção de Dados.',
  cancellation: 'Regras e procedimentos de cancelamento.',
  cookies: 'Como utilizamos cookies na plataforma.',
  groups: 'Regras, regulamentos e tabela de comissão dos grupos.',
  complaints: 'Canal de denúncia da plataforma.',
  support: 'Entre em contato com nossa equipe.',
};

function MotoboyLegalContent({ content }: { content: { title: string; content: string } }) {
  // Split content into paragraphs/sections for card display
  const sections = content.content.split(/\n{2,}/).filter(Boolean);

  return (
    <div className="space-y-4">
      {sections.map((section, i) => (
        <Card key={i} className="border-motoboy/20 bg-card">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {section.trim()}
            </p>
          </CardContent>
        </Card>
      ))}

      <Card className="border-motoboy/20 bg-card">
        <CardContent className="pt-5">
          <p className="text-xs text-muted-foreground text-center">
            Se tiver dúvidas sobre este conteúdo, entre em contato com nosso suporte.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LegalPage() {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { content, loading, error } = useLegalContent(type);

  const isMotoboy = location.pathname.startsWith('/motoboy/');
  const Icon = type ? LEGAL_ICONS[type.toLowerCase()] || FileText : FileText;
  const subtitle = type ? LEGAL_SUBTITLES[type.toLowerCase()] : undefined;

  // Check if we have a fallback component for this content type
  const FallbackComponent = type ? FALLBACK_CONTENT[type.toLowerCase()] : null;
  const hasFallback = !!FallbackComponent;

  if (isMotoboy) {
    return (
      <MotoboyPageTemplate
        title={loading ? 'Carregando...' : content?.title || 'Conteúdo Legal'}
        subtitle={subtitle}
        icon={Icon}
      >
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-motoboy" />
          </div>
        )}

        {error && !content && !loading && !hasFallback && (
          <Card className="border-motoboy/20 bg-card">
            <CardContent className="pt-5 text-center space-y-3">
              <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
              <p className="text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={() => navigate(-1)}>Voltar</Button>
            </CardContent>
          </Card>
        )}

        {(!content || error) && !loading && hasFallback && FallbackComponent && (
          <FallbackComponent />
        )}

        {content && !loading && (
          <MotoboyLegalContent content={content} />
        )}
      </MotoboyPageTemplate>
    );
  }

  return (
    <div className="container max-w-3xl mx-auto py-8 px-4">
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando conteúdo...</p>
        </div>
      )}

      {error && !content && !loading && !hasFallback && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="p-4 rounded-full bg-destructive/10">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold">Conteúdo não disponível</h2>
          <p className="text-muted-foreground max-w-md">{error}</p>
          <Button variant="outline" onClick={() => navigate(-1)}>Voltar</Button>
        </div>
      )}

      {(!content || error) && !loading && hasFallback && FallbackComponent && (
        <FallbackComponent />
      )}

      {content && !loading && (
        <>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-white/10">
              <FileText className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">{content.title}</h1>
          </div>

          <div className="whitespace-pre-wrap leading-relaxed text-white/90" style={{ minHeight: '300px' }}>
            {content.content}
          </div>

          <div className="mt-8 pt-8 border-t border-white/10 text-center text-sm text-white/60">
            <p>Se tiver dúvidas sobre este conteúdo, entre em contato com nosso suporte.</p>
          </div>

          {type?.toLowerCase() === 'about' && <SoftwareRegisteredSection />}

          <InstitutionalBlock />
        </>
      )}
    </div>
  );
}
