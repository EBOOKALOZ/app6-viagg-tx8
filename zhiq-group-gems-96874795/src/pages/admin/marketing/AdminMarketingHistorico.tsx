import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { History } from "lucide-react";

export default function AdminMarketingHistorico() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Histórico</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Histórico de Marketing
          </CardTitle>
          <CardDescription>
            Registro completo de todas as ações de marketing realizadas, com métricas de alcance, engajamento e resultados por campanha.
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
