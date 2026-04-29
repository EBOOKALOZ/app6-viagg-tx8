import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function AdminMarketingFilaGrupos() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Fila de Grupos</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Gestão de Fila de Grupos
          </CardTitle>
          <CardDescription>
            Gerenciamento da fila de grupos de WhatsApp aguardando ações de marketing, priorizados por potencial de conversão.
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
