import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

export default function AdminMarketingImpacto() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Impacto Econômico</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Análise de Impacto Econômico
          </CardTitle>
          <CardDescription>
            Dashboards de impacto econômico das ações de marketing, correlacionando investimento em postagens com aumento de receita por região.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48 rounded-lg border-2 border-dashed border-muted-foreground/25">
            <p className="text-muted-foreground text-sm">Módulo em construção</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
