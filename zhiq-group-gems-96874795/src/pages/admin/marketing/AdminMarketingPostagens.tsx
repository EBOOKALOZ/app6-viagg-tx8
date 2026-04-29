import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Send } from "lucide-react";

export default function AdminMarketingPostagens() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Postagens</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Central de Postagens
          </CardTitle>
          <CardDescription>
            Criação, agendamento e disparo de postagens para grupos de WhatsApp com controle de frequência e segmentação regional.
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
