import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, AlertTriangle, Info } from "lucide-react";
import type { AuditIssue } from "@/hooks/useAdminCredits";

interface Props { data: any; }

const SEVERITY_CONFIG = {
  critical: { icon: ShieldAlert, color: "bg-red-100 text-red-700 border-red-300", label: "Crítico", iconColor: "text-red-500" },
  warning: { icon: AlertTriangle, color: "bg-amber-100 text-amber-700 border-amber-300", label: "Alerta", iconColor: "text-amber-500" },
  info: { icon: Info, color: "bg-blue-100 text-blue-700 border-blue-300", label: "Info", iconColor: "text-blue-500" },
};

export function AdminCreditsAudit({ data }: Props) {
  const { audit } = data;

  const criticalCount = audit.filter((i: AuditIssue) => i.severity === "critical").length;
  const warningCount = audit.filter((i: AuditIssue) => i.severity === "warning").length;
  const infoCount = audit.filter((i: AuditIssue) => i.severity === "info").length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
              <ShieldAlert className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
              <p className="text-xs text-muted-foreground">Críticos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{warningCount}</p>
              <p className="text-xs text-muted-foreground">Alertas</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Info className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{infoCount}</p>
              <p className="text-xs text-muted-foreground">Informativos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* No issues? */}
      {audit.length === 0 && (
        <Card className="border-0 shadow-md">
          <CardContent className="p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <ShieldAlert className="h-8 w-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-emerald-700">Tudo OK!</h3>
            <p className="text-sm text-muted-foreground mt-1">Nenhuma inconsistência detectada no módulo de créditos.</p>
          </CardContent>
        </Card>
      )}

      {/* Issues Table */}
      {audit.length > 0 && (
        <Card className="shadow-md border-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-500" />
              Inconsistências Detectadas ({audit.length})
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  {["Severidade", "Tipo", "Loja", "Descrição", "Sugestão", "Referência"].map(h => (
                    <th key={h} className="text-left p-3 font-semibold text-xs text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.map((issue: AuditIssue, i: number) => {
                  const config = SEVERITY_CONFIG[issue.severity];
                  return (
                    <tr key={i} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="p-3">
                        <Badge className={`text-[10px] ${config.color}`}>
                          {config.label}
                        </Badge>
                      </td>
                      <td className="p-3 font-medium text-xs">{issue.type}</td>
                      <td className="p-3 text-xs">{issue.store_name}</td>
                      <td className="p-3 text-xs text-muted-foreground max-w-[200px]">{issue.description}</td>
                      <td className="p-3 text-xs text-blue-600 max-w-[180px]">{issue.suggestion}</td>
                      <td className="p-3 text-[10px] font-mono text-muted-foreground">{issue.reference}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
