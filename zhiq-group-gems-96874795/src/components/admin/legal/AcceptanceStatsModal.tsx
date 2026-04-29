import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, Loader2, Users, TrendingUp } from "lucide-react";

interface AcceptanceStats {
  total: number;
  byProfile: Record<string, number>;
}

interface AcceptanceStatsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  stats: AcceptanceStats | null;
}

const getProfileLabel = (profile: string) => {
  const labels: Record<string, string> = {
    passenger: "Passageiro",
    driver: "Motorista",
    motoboy: "Motoboy",
    mototaxi: "Mototáxi",
    merchant: "Comerciante",
    freteiro: "Freteiro",
    unknown: "Desconhecido",
  };
  return labels[profile] || profile;
};

const getProfileColor = (profile: string) => {
  const colors: Record<string, string> = {
    passenger: "bg-blue-500",
    driver: "bg-emerald-500",
    motoboy: "bg-orange-500",
    mototaxi: "bg-yellow-500",
    merchant: "bg-violet-500",
    freteiro: "bg-rose-500",
    unknown: "bg-gray-500",
  };
  return colors[profile] || "bg-gray-500";
};

export function AcceptanceStatsModal({
  open,
  onOpenChange,
  loading,
  stats,
}: AcceptanceStatsModalProps) {
  const maxValue = stats 
    ? Math.max(...Object.values(stats.byProfile), 1) 
    : 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {/* Header institucional */}
        <div className="bg-gradient-to-r from-[#0F3D2E] to-[#1a5a42] -m-6 mb-0 px-6 py-5 rounded-t-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <DialogTitle className="text-white text-lg font-semibold">
                Estatísticas de Aceites
              </DialogTitle>
            </div>
          </DialogHeader>
        </div>

        <div className="pt-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Carregando estatísticas...</p>
            </div>
          ) : stats ? (
            <div className="space-y-6">
              {/* Card principal */}
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                        <Users className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total de Aceites</p>
                        <p className="text-3xl font-bold text-foreground">{stats.total}</p>
                      </div>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
                      <TrendingUp className="h-5 w-5 text-emerald-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Distribuição por perfil */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Distribuição por Perfil
                </h4>
                
                {Object.keys(stats.byProfile).length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(stats.byProfile)
                      .sort((a, b) => b[1] - a[1])
                      .map(([profile, count]) => (
                        <div key={profile} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-foreground">
                              {getProfileLabel(profile)}
                            </span>
                            <Badge variant="secondary" className="font-mono">
                              {count}
                            </Badge>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${getProfileColor(profile)}`}
                              style={{ width: `${(count / maxValue) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhum aceite registrado</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Não foi possível carregar as estatísticas</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
