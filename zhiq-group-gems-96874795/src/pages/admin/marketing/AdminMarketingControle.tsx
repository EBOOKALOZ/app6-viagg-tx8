import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings } from "lucide-react";

export default function AdminMarketingControle() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Controle Econômico</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Controle Econômico de Marketing
          </CardTitle>
          <CardDescription>
            Gestão de orçamentos, limites de gastos e alocação de recursos para campanhas de marketing por região e período.
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
