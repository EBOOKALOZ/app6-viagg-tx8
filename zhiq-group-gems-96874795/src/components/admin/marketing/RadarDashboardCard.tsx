import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Target, TrendingUp, BarChart3, Clock, Zap, Star, 
  ChevronRight, Layers, Calendar, Gauge
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardData {
  city_id: string;
  region_id: string;
  modo_operacional: string;
  status_estrategico: string;
  pronta_para_expansao: boolean;
  total_groups: number;
  meta_grupos_expansao: number;
  grupos_faltantes_dinamico: number;
  media_grupos_por_dia: number;
  dias_estimados_para_expansao: number;
  dias_cenario_conservador: number;
  dias_cenario_agressivo: number;
  dias_cenario_dominacao: number;
  score_medio: number;
  potencial_economico: string;
  indice_estrategico: number;
}

const modoConfig: Record<string, { label: string; className: string }> = {
  MODO_GUERRA: { label: "🔴 Modo Guerra", className: "bg-destructive text-destructive-foreground text-sm px-4 py-1.5" },
  MODO_CRESCIMENTO: { label: "🟡 Modo Crescimento", className: "bg-yellow-500/90 text-yellow-950 text-sm px-4 py-1.5" },
  MODO_DOMINACAO: { label: "🟢 Modo Dominação", className: "bg-green-600 text-white text-sm px-4 py-1.5" },
};

function SectionTitle({ icon: Icon, title }: { icon: typeof Target; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2 mt-4 first:mt-0">
      <Icon className="h-4 w-4 text-primary" />
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number | boolean }) {
  const display = typeof value === "boolean" ? (value ? "✅ Sim" : "❌ Não") : String(value);
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{display}</span>
    </div>
  );
}

export function RadarDashboardCard({ data, isLoading }: { data?: DashboardData; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Nenhum dado disponível
        </CardContent>
      </Card>
    );
  }

  const modo = modoConfig[data.modo_operacional] ?? { label: data.modo_operacional, className: "bg-muted text-muted-foreground text-sm px-4 py-1.5" };

  const isGuerra = data.modo_operacional === "MODO_GUERRA";

  return (
    <Card className={`overflow-hidden ${isGuerra ? "border-destructive/60 shadow-destructive/10 shadow-md" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <CardTitle className="text-lg">
            {data.city_id} — {data.region_id}
          </CardTitle>
          <Badge className={modo.className}>{modo.label}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-1 divide-y divide-border">
        {/* Estratégia */}
        <div className="pb-3">
          <SectionTitle icon={Target} title="Estratégia" />
          <InfoRow label="Status Estratégico" value={data.status_estrategico} />
          <InfoRow label="Pronta para Expansão" value={data.pronta_para_expansao} />
        </div>

        {/* Meta */}
        <div className="pb-3">
          <SectionTitle icon={Layers} title="Meta" />
          <InfoRow label="Grupos Atuais" value={data.total_groups} />
          <InfoRow label="Meta Dinâmica" value={data.meta_grupos_expansao} />
          <InfoRow label="Faltam" value={`${data.grupos_faltantes_dinamico} grupos`} />
        </div>

        {/* Ritmo */}
        <div className="pb-3">
          <SectionTitle icon={Gauge} title="Ritmo" />
          <InfoRow label="Ritmo Atual" value={`${Number(data.media_grupos_por_dia).toFixed(2)} grupos/dia`} />
          <InfoRow label="Projeção Real" value={`${data.dias_estimados_para_expansao} dias`} />
        </div>

        {/* Simulação */}
        <div className="pb-3">
          <SectionTitle icon={BarChart3} title="Simulação" />
          <InfoRow label="Conservador (0.2/dia)" value={`${data.dias_cenario_conservador} dias`} />
          <InfoRow label="Agressivo (0.5/dia)" value={`${data.dias_cenario_agressivo} dias`} />
          <InfoRow label="Dominação (1/dia)" value={`${data.dias_cenario_dominacao} dias`} />
        </div>

        {/* Qualidade */}
        <div className="pt-1">
          <SectionTitle icon={Star} title="Qualidade" />
          <InfoRow label="Score Médio" value={Number(data.score_medio).toFixed(1)} />
          <InfoRow label="Potencial Econômico" value={data.potencial_economico} />
          <InfoRow label="Índice Estratégico" value={Number(data.indice_estrategico).toFixed(2)} />
        </div>
      </CardContent>
    </Card>
  );
}
