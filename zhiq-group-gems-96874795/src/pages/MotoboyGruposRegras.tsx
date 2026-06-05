import { BookOpen, CheckCircle, AlertTriangle, DollarSign, Send, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MotoboyPageTemplate } from '@/components/motoboy/MotoboyPageTemplate';

const sections = [
  {
    icon: BookOpen,
    title: 'Normas dos Grupos',
    items: [
      'Cada motoboy pode vincular até 5 grupos ativos (Tier VIP).',
      'Grupos devem ser de WhatsApp e pertencer à região de atuação.',
      'Grupos inativos ou sem postagens válidas serão desvinculados automaticamente.',
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Regulamentos',
    items: [
      'É proibido enviar spam, conteúdo ofensivo ou fora do contexto da plataforma.',
      'A administração pode revogar o vínculo a qualquer momento por descumprimento.',
      'Grupos duplicados ou fraudulentos resultam em suspensão imediata.',
    ],
  },
  {
    icon: DollarSign,
    title: 'Tabela de Comissão',
    items: [
      '0 grupos → 25% — Grupo Inicial.',
      '1 grupo → 20% — Grupo Bronze.',
      '2 grupos → 16% — Grupo Prata.',
      '3 grupos → 12% — Grupo Ouro.',
      '4 grupos → 9% — Grupo Elite.',
      '5+ grupos → 6% — Grupo VIP (menor taxa da plataforma).',
      'Quanto mais grupos ativos, menor a taxa cobrada pela plataforma.',
    ],
  },
  {
    icon: Send,
    title: 'Forma Correta de Postagem',
    items: [
      'Utilize apenas os materiais oficiais fornecidos pela plataforma.',
      'Postagens devem ser feitas nos horários recomendados (manhã e tarde).',
      'Não altere imagens, textos ou links dos materiais oficiais.',
    ],
  },
  {
    icon: CheckCircle,
    title: 'Regras de Validação',
    items: [
      'Postagens são verificadas automaticamente pelo sistema.',
      'Um grupo é considerado ativo quando possui ao menos 1 postagem válida nos últimos 7 dias.',
      'Grupos sem atividade por 14 dias são marcados como expirados.',
    ],
  },
  {
    icon: AlertTriangle,
    title: 'Penalidades',
    items: [
      'Fraude comprovada: suspensão do benefício de redução de comissão.',
      'Reincidência: bloqueio permanente do sistema de grupos.',
      'Casos graves são encaminhados para análise administrativa.',
    ],
  },
];

export default function MotoboyGruposRegras() {
  return (
    <MotoboyPageTemplate
      title="Regras e Regulamentos dos Grupos"
      subtitle="Conheça as normas, tabela de comissão e boas práticas para manter seus grupos ativos e reduzir suas taxas."
      icon={BookOpen}
    >
      {sections.map((s) => (
        <Card key={s.title} className="border-motoboy/20 bg-card">
          <CardHeader className="pb-2 flex flex-row items-center gap-3">
            <s.icon className="h-5 w-5 text-motoboy shrink-0" />
            <CardTitle className="text-base">{s.title}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1.5">
              {s.items.map((item, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-motoboy mt-1">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </MotoboyPageTemplate>
  );
}
