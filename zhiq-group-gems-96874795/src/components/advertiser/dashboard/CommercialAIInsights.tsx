import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, AlertCircle, ArrowUpRight, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function CommercialAIInsights() {
  const insights = [
    {
      id: 1,
      type: "alert",
      title: "Baixa Conversão em Imóveis",
      description: "Seus anúncios de imóveis tiveram 230 visualizações mas nenhum contato. A IA recomenda melhorar as fotos de capa.",
      icon: <AlertCircle className="w-5 h-5 text-red-500" />,
    },
    {
      id: 2,
      type: "opportunity",
      title: "Alta Demanda por Veículos",
      description: "A procura por 'SUVs' aumentou 40% na sua região. Você tem 3 SUVs em estoque. Patrocinar esses anúncios agora pode gerar vendas rápidas.",
      icon: <TrendingUp className="w-5 h-5 text-emerald-500" />,
    },
    {
      id: 3,
      type: "insight",
      title: "Preço de Leilão Otimizado",
      description: "O lote 'Lote 45 - Caminhonete' está com o valor inicial 15% acima do mercado. Reduzir para R$ 45.000,00 aumentará a probabilidade de venda em 80%.",
      icon: <Sparkles className="w-5 h-5 text-indigo-500" />,
    }
  ];

  return (
    <Card className="border-indigo-500/20 shadow-lg shadow-indigo-500/5 bg-gradient-to-br from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-background">
      <CardHeader className="pb-3 border-b border-border/50">
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-500" />
          Recomendações da IA (Orion)
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 grid gap-4">
        {insights.map((item) => (
          <div key={item.id} className="flex gap-4 p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors">
            <div className="mt-0.5">{item.icon}</div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{item.title}</span>
                {item.type === 'alert' && <Badge variant="destructive" className="text-[10px] h-4 px-1.5">Atenção</Badge>}
                {item.type === 'opportunity' && <Badge className="bg-emerald-500 hover:bg-emerald-600 text-[10px] h-4 px-1.5">Oportunidade</Badge>}
              </div>
              <p className="text-sm text-muted-foreground leading-snug">
                {item.description}
              </p>
            </div>
            <div className="ml-auto flex items-center">
              <button className="text-muted-foreground hover:text-primary transition-colors p-2">
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
