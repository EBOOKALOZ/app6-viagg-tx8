import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, FileText, Users, TrendingUp } from "lucide-react";

interface LegalDocumentsMetricsProps {
  totalActive: number;
  totalDocs: number;
  totalProfiles: number;
  totalRecords: number;
}

export function LegalDocumentsMetrics({
  totalActive,
  totalDocs,
  totalProfiles,
  totalRecords,
}: LegalDocumentsMetricsProps) {
  const metrics = [
    {
      icon: CheckCircle,
      label: "Versões Ativas",
      value: totalActive,
      color: "text-emerald-600",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/20",
    },
    {
      icon: FileText,
      label: "Tipos de Documento",
      value: totalDocs,
      color: "text-blue-600",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
    },
    {
      icon: Users,
      label: "Perfis Cobertos",
      value: totalProfiles,
      color: "text-violet-600",
      bgColor: "bg-violet-500/10",
      borderColor: "border-violet-500/20",
    },
    {
      icon: TrendingUp,
      label: "Total de Registros",
      value: totalRecords,
      color: "text-amber-600",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <Card 
          key={metric.label} 
          className={`border ${metric.borderColor} ${metric.bgColor} transition-all hover:shadow-md`}
        >
          <CardContent className="p-4 md:p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs md:text-sm font-medium text-muted-foreground">
                  {metric.label}
                </p>
                <p className={`text-2xl md:text-3xl font-bold ${metric.color}`}>
                  {metric.value}
                </p>
              </div>
              <div className={`p-2 rounded-lg ${metric.bgColor}`}>
                <metric.icon className={`h-5 w-5 ${metric.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
