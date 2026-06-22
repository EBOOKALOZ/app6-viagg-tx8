/**
 * HowCreditsWorkModal
 *
 * Modal explicativo para o lojista entender:
 *  - O que são créditos
 *  - Em que ações são consumidos
 *  - Quanto custa cada ação (CREDIT_COSTS — tabela central oficial)
 *  - O que ele recebe em troca (visualizações, leads, conversões)
 */

import { useEffect, useState } from 'react';
import {
  Coins,
  Store,
  Eye,
  ShoppingCart,
  PackageCheck,
  Percent,
  MessageCircle,
  Phone,
  TrendingUp,
  Info,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { CREDIT_COSTS, CREDIT_EVENT_LABELS, type CreditEvent } from '@/lib/credits/creditPricing';

type ActionRule = {
  code: string;
  label: string;
  description: string;
  cost: number; // créditos
  icon: React.ElementType;
  color: string;
};

/** Ícone, cor e descrição amigável por evento — texto do label vem de CREDIT_EVENT_LABELS. */
const EVENT_PRESENTATION: Record<CreditEvent, { description: string; icon: React.ElementType; color: string }> = {
  visitor_store_entry: {
    description: 'Cliente clicou num anúncio do marketplace e entrou na sua loja.',
    icon: Store,
    color: 'text-blue-600 bg-blue-100',
  },
  visitor_product_click: {
    description: 'Cliente clicou em um dos seus produtos.',
    icon: Eye,
    color: 'text-sky-600 bg-sky-100',
  },
  visitor_cart_add: {
    description: 'Cliente adicionou um produto seu à cesta.',
    icon: ShoppingCart,
    color: 'text-emerald-600 bg-emerald-100',
  },
  visitor_checkout: {
    description: 'Cliente finalizou um pedido na sua loja.',
    icon: PackageCheck,
    color: 'text-teal-600 bg-teal-100',
  },
  advertiser_accept_offer: {
    description: 'Você aceitou uma oferta recebida (Minha Oferta é...).',
    icon: Percent,
    color: 'text-indigo-600 bg-indigo-100',
  },
  advertiser_unlock_order_whatsapp: {
    description: 'Você desbloqueou o WhatsApp do cliente num pedido.',
    icon: Phone,
    color: 'text-green-600 bg-green-100',
  },
  advertiser_unlock_lead_whatsapp: {
    description: 'Você desbloqueou o contato direto de um interessado.',
    icon: MessageCircle,
    color: 'text-purple-600 bg-purple-100',
  },
};

/** Regras oficiais — derivadas da tabela central CREDIT_COSTS (nunca hardcodar valores aqui). */
const DEFAULT_RULES: ActionRule[] = (Object.keys(CREDIT_COSTS) as CreditEvent[]).map((code) => ({
  code,
  label: CREDIT_EVENT_LABELS[code],
  cost: CREDIT_COSTS[code],
  ...EVENT_PRESENTATION[code],
}));

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Regras vindas do banco. Se não passar, usa DEFAULT_RULES. */
  rules?: ActionRule[];
}

export function HowCreditsWorkModal({ open, onOpenChange, rules }: Props) {
  const [data, setData] = useState<ActionRule[]>(rules ?? DEFAULT_RULES);

  useEffect(() => {
    if (rules) setData(rules);
  }, [rules]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md">
              <Coins className="h-5 w-5 text-white" />
            </div>
            Como funcionam os créditos?
          </DialogTitle>
          <DialogDescription>
            Cada ação dos clientes consome créditos. Quanto mais visibilidade
            sua loja gera, mais valor você converte.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Conceito */}
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-4 flex items-start gap-3">
              <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">
                  Créditos = energia da sua loja
                </p>
                <p className="text-xs text-muted-foreground">
                  Você compra um pacote, e cada interação real de cliente consome
                  uma quantidade pré-definida. Sem créditos, sua loja para de
                  receber leads premium até a próxima recarga.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Tabela de custos */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Custo por ação
            </p>
            <div className="space-y-2">
              {data.map((rule) => {
                const Icon = rule.icon;
                return (
                  <div
                    key={rule.code}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${rule.color}`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-tight">
                          {rule.label}
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                          {rule.description}
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 flex-shrink-0 font-bold text-xs">
                      {rule.cost === 1 ? '1 crédito' : `${rule.cost} créditos`}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Conversão */}
          <Card className="border-emerald-200 bg-emerald-50/50">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-semibold">O que você ganha</p>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 ml-6 list-disc">
                <li>Exposição dos seus produtos no marketplace local</li>
                <li>Leads qualificados com intenção real de compra</li>
                <li>Contato direto via WhatsApp do cliente</li>
                <li>Boost de visibilidade em horários estratégicos</li>
                <li>Histórico completo: quanto cada produto rendeu</li>
              </ul>
            </CardContent>
          </Card>

          {/* Garantias */}
          <div className="text-[11px] text-muted-foreground space-y-1 px-1">
            <p>
              ✓ <strong>Anti-fraude:</strong> múltiplos cliques do mesmo
              visitante na mesma janela de tempo NÃO consomem créditos.
            </p>
            <p>
              ✓ <strong>Auditável:</strong> cada débito fica registrado com
              produto, data e origem do clique.
            </p>
            <p>
              ✓ <strong>Rollover:</strong> créditos não usados acompanham a
              renovação do pacote (mensal/semestral/anual).
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={() => onOpenChange(false)}>Entendi</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
