import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Palette, Save } from "lucide-react";

export default function AdminDashboard() {
  console.log('AdminDashboard rendering!');
  const handleSave = () => {
    console.log("Theme save clicked (disabled)");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "hsl(var(--admin-card-foreground, var(--foreground)))" }}>
          Dashboard
        </h1>
        <p style={{ color: "hsl(var(--admin-muted-foreground, var(--muted-foreground)))" }}>
          Bem-vindo ao SuperPainel Administrativo
        </p>
      </div>

      {/* Simple test card */}
      <Card style={{
        backgroundColor: "hsl(var(--admin-card, var(--card)))",
        borderColor: "hsl(var(--admin-border, var(--border)))",
        color: "hsl(var(--admin-card-foreground, var(--card-foreground)))",
      }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-5 w-5" style={{ color: "hsl(var(--admin-primary, var(--primary)))" }} />
            Teste de Renderização
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>Se você está vendo esta mensagem, o dashboard está funcionando.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            style={{
              borderColor: "hsl(var(--admin-primary, var(--primary)))",
              color: "hsl(var(--admin-primary, var(--primary)))",
            }}
            className="mt-4"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Salvar cor (desativado)
          </Button>
        </CardContent>
      </Card>

      {/* Debug info */}
      <div style={{ padding: '10px', background: '#f0f0f0', borderRadius: '4px' }}>
        <small>AdminDashboard rendered at: {new Date().toLocaleTimeString()}</small>
      </div>
    </div>
  );
}
