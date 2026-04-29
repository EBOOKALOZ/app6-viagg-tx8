import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info, TrendingDown, Check } from 'lucide-react';

export default function Rates() {
  const rates = [
    { groups: '0 grupos', rate: 25, description: 'Taxa inicial sem grupos cadastrados' },
    { groups: '1 grupo', rate: 18, description: 'Primeira redução ao cadastrar um grupo' },
    { groups: '2 grupos', rate: 11, description: 'Continue adicionando para reduzir mais' },
    { groups: '3 grupos', rate: 6, description: 'Taxa mínima alcançada!', highlight: true },
  ];

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in max-w-2xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Faixas de Taxa</h1>
          <p className="text-muted-foreground">
            Entenda como funciona o sistema de taxas de serviço
          </p>
        </div>

        {/* Explanation Card */}
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Info className="h-5 w-5 text-primary" />
              Como Funciona
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Sua taxa de serviço é calculada automaticamente com base na quantidade de
              grupos WhatsApp que você tem cadastrados em sua conta.
            </p>
            <p>
              Quanto mais grupos você registrar, menor será sua taxa de serviço.
              Ao atingir 3 grupos válidos, você alcança a taxa mínima de <span className="text-primary font-semibold">6%</span>.
            </p>
          </CardContent>
        </Card>

        {/* Rates Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingDown className="h-5 w-5 text-primary" />
              Tabela de Taxas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {rates.map((item, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-4 rounded-lg transition-colors ${item.highlight
                      ? 'bg-primary/10 border border-primary/30'
                      : 'bg-secondary/50'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    {item.highlight && (
                      <div className="rounded-full bg-primary p-1">
                        <Check className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                    <div>
                      <p className="font-semibold">{item.groups}</p>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  <div className={`text-2xl font-bold ${item.highlight ? 'gradient-zhiq-text' : ''}`}>
                    {item.rate}%
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tips */}
        <Card className="bg-secondary/50">
          <CardHeader>
            <CardTitle className="text-lg">Dicas</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                Cadastre seus grupos para economizar nas taxas de serviço
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                A taxa é recalculada automaticamente quando você adiciona ou remove grupos
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                Grupos inativos também contam para o cálculo da taxa
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
