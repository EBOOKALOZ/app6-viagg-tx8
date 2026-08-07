import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

export function LgpdContent() {
    const { data: dbLgpdContent, isLoading } = useQuery({
        queryKey: ['legal-document-lgpd'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('footer_contents')
                .select('content, title')
                .eq('content_type', 'lgpd')
                .eq('is_active', true)
                .order('version', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                console.error("Erro ao buscar LGPD do banco:", error);
                return null;
            }
            return data;
        }
    });

    if (isLoading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (dbLgpdContent && dbLgpdContent.content) {
        return (
            <div className="space-y-6 text-foreground/90">
                <Card className="border-border bg-card">
                    <CardContent className="pt-6">
                        <div
                            className="prose prose-sm max-w-none dark:prose-invert"
                            dangerouslySetInnerHTML={{
                                __html: sanitizeHtml(dbLgpdContent.content),
                            }}
                        />
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6 text-foreground/90">
            <Card className="border-border bg-card">
                <CardContent className="pt-6">
                    <h2 className="text-xl font-bold mb-4">Lei Geral de Proteção de Dados (LGPD)</h2>
                    <div className="space-y-4 text-sm leading-relaxed">
                        <p>
                            A Viagg-TX8 respeita a sua privacidade e está comprometida com a proteção dos dados pessoais de seus usuários, em conformidade com a Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018).
                        </p>
                        <p>
                            Nosso compromisso é tratar seus dados pessoais com segurança, transparência e apenas para as finalidades para as quais foram coletados.
                        </p>

                        <h3 className="text-lg font-semibold mt-6 mb-2">1. Coleta de Dados</h3>
                        <p>
                            Coletamos informações necessárias para a prestação de nossos serviços de intermediação de entregas.
                        </p>

                        <h3 className="text-lg font-semibold mt-6 mb-2">2. Uso dos Dados</h3>
                        <p>Os dados são utilizados exclusivamente para:</p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>Viabilizar a coleta e entrega das mercadorias.</li>
                            <li>Comunicação de status.</li>
                            <li>Segurança e prevenção à fraude.</li>
                        </ul>

                        <h3 className="text-lg font-semibold mt-6 mb-2">3. Direitos do Titular</h3>
                        <p>
                            Você tem o direito de solicitar o acesso, correção, atualização ou exclusão dos seus dados a qualquer momento, acessando o menu de opções ou entrando em contato com nosso suporte.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-border bg-card">
                <CardContent className="pt-5 pb-5">
                    <p className="text-xs text-muted-foreground text-center">
                        Este é um documento padrão de fallback. O conteúdo oficial pode ser editado pelo painel de Administrador em "Documentos Legais".
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
