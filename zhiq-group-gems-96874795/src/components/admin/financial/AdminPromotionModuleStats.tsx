/**
 * AdminPromotionModuleStats
 * Cards de aquisição de pacotes de promoção por módulo (viagens, imóveis, etc.).
 * Busca diretamente em promotion_purchases agrupado por listing_module.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Megaphone, TrendingUp, Clock, CheckCircle2, Hourglass } from "lucide-react";

/* ── Metadados dos módulos ───────────────────────────────────── */
const MODULE_META: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  viagens:  { label: "Viagens & Turismo",    emoji: "✈️",  color: "#0ea5e9", bg: "bg-sky-50 border-sky-200"       },
  imoveis:  { label: "Imóveis",              emoji: "🏠",  color: "#10b981", bg: "bg-emerald-50 border-emerald-200" },
  veiculos: { label: "Veículos",             emoji: "🚗",  color: "#f59e0b", bg: "bg-amber-50 border-amber-200"   },
  servicos: { label: "Serviços",             emoji: "🛠️",  color: "#8b5cf6", bg: "bg-violet-50 border-violet-200" },
  fretes:   { label: "Fretes & Transportes", emoji: "🚛",  color: "#f97316", bg: "bg-orange-50 border-orange-200" },
  produtos: { label: "Produtos",             emoji: "🛍️",  color: "#ec4899", bg: "bg-pink-50 border-pink-200"    },
};

const MODULE_ORDER = ["viagens", "imoveis", "veiculos", "servicos", "fretes", "produtos"];

/* ── Tipos ───────────────────────────────────────────────────── */
interface Purchase {
  id: string;
  listing_module: string;
  package_name: string;
  period_days: number;
  amount_brl: number;
  status: string;
  created_at: string;
  starts_at: string | null;
  expires_at: string | null;
}

interface ModuleStat {
  module: string;
  total: number;
  paid: number;
  pending: number;
  cancelled: number;
  revenue: number;
  avgPeriod: number;
  lastDate: string | null;
  packages: Record<string, { qty: number; revenue: number }>;
  activeNow: number;
}

/* ── Hook ────────────────────────────────────────────────────── */
function usePromotionModuleStats() {
  return useQuery<ModuleStat[]>({
    queryKey: ["admin", "promotion-module-stats"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("promotion_purchases") as unknown as {
        select: (q: string) => {
          order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown[]; error: Error | null }>
        }
      })
        .select("id, listing_module, package_name, period_days, amount_brl, status, created_at, starts_at, expires_at")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("[promotion-module-stats]", error.message);
        // Tabela ainda não existe — devolve os 6 módulos vazios para renderizar os cards
        return MODULE_ORDER.map((mod) => ({
          module: mod, total: 0, paid: 0, pending: 0, cancelled: 0,
          revenue: 0, avgPeriod: 0, lastDate: null, packages: {}, activeNow: 0,
        }));
      }

      const purchases = (data || []) as Purchase[];
      const now = new Date();

      const map: Record<string, ModuleStat> = {};

      for (const p of purchases) {
        const mod = p.listing_module || "outros";
        if (!map[mod]) {
          map[mod] = {
            module: mod,
            total: 0, paid: 0, pending: 0, cancelled: 0,
            revenue: 0, avgPeriod: 0, lastDate: null,
            packages: {}, activeNow: 0,
          };
        }
        const s = map[mod];
        s.total++;
        if (p.status === "paid")      { s.paid++;      s.revenue += Number(p.amount_brl); }
        if (p.status === "pending")   s.pending++;
        if (p.status === "cancelled") s.cancelled++;

        // Ativo agora = paid + expires_at no futuro
        if (
          p.status === "paid" &&
          p.expires_at &&
          new Date(p.expires_at) > now
        ) s.activeNow++;

        // Período médio
        s.avgPeriod = (s.avgPeriod * (s.total - 1) + Number(p.period_days)) / s.total;

        // Data mais recente
        if (!s.lastDate || p.created_at > s.lastDate) s.lastDate = p.created_at;

        // Agrupamento por package_name
        const pkgKey = p.package_name || "Outro";
        if (!s.packages[pkgKey]) s.packages[pkgKey] = { qty: 0, revenue: 0 };
        s.packages[pkgKey].qty++;
        if (p.status === "paid") s.packages[pkgKey].revenue += Number(p.amount_brl);
      }

      // Garante que todos os módulos aparecem, mesmo sem dados
      for (const mod of MODULE_ORDER) {
        if (!map[mod]) {
          map[mod] = {
            module: mod,
            total: 0, paid: 0, pending: 0, cancelled: 0,
            revenue: 0, avgPeriod: 0, lastDate: null,
            packages: {}, activeNow: 0,
          };
        }
      }

      const result: ModuleStat[] = [];
      for (const mod of MODULE_ORDER) result.push(map[mod]);
      for (const mod of Object.keys(map)) {
        if (!MODULE_ORDER.includes(mod)) result.push(map[mod]);
      }

      return result;
    },
    staleTime: 30_000,
  });
}

/* ── Formatador ──────────────────────────────────────────────── */
const fmtBRL = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ── Componente ──────────────────────────────────────────────── */
export function AdminPromotionModuleStats() {
  const { data: stats = [], isLoading } = usePromotionModuleStats();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {MODULE_ORDER.map((m) => (
          <Card key={m} className="animate-pulse h-52" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-violet-500" />
        <h3 className="text-base font-bold text-foreground">Pacotes de Promoção por Módulo</h3>
        <Badge variant="outline" className="text-[10px] text-violet-600 border-violet-300">
          {stats.reduce((s, m) => s + m.total, 0)} compras
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => {
          const meta = MODULE_META[s.module] ?? { label: s.module, emoji: "📦", color: "#6b7280", bg: "bg-zinc-50 border-zinc-200" };
          const topPkgs = Object.entries(s.packages)
            .sort((a, b) => b[1].qty - a[1].qty)
            .slice(0, 3);

          return (
            <Card
              key={s.module}
              className={`border transition-all hover:shadow-md hover:-translate-y-0.5 ${meta.bg}`}
            >
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-bold" style={{ color: meta.color }}>
                    <span className="text-lg leading-none">{meta.emoji}</span>
                    {meta.label}
                  </span>
                  <span className="text-xl font-black text-foreground">
                    {fmtBRL(s.revenue)}
                  </span>
                </CardTitle>
              </CardHeader>

              <CardContent className="px-4 pb-4 space-y-3">
                {/* Contadores de status */}
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="rounded-lg bg-white/80 border border-emerald-200 px-2 py-1.5 text-center">
                    <p className="text-[9px] font-black text-emerald-700 uppercase tracking-wider flex items-center justify-center gap-0.5">
                      <CheckCircle2 className="h-2.5 w-2.5" /> Pagos
                    </p>
                    <p className="text-lg font-black text-emerald-700">{s.paid}</p>
                  </div>
                  <div className="rounded-lg bg-white/80 border border-amber-200 px-2 py-1.5 text-center">
                    <p className="text-[9px] font-black text-amber-700 uppercase tracking-wider flex items-center justify-center gap-0.5">
                      <Hourglass className="h-2.5 w-2.5" /> Pendentes
                    </p>
                    <p className="text-lg font-black text-amber-700">{s.pending}</p>
                  </div>
                  <div className="rounded-lg bg-white/80 border border-violet-200 px-2 py-1.5 text-center">
                    <p className="text-[9px] font-black text-violet-700 uppercase tracking-wider flex items-center justify-center gap-0.5">
                      <TrendingUp className="h-2.5 w-2.5" /> Ativos
                    </p>
                    <p className="text-lg font-black text-violet-700">{s.activeNow}</p>
                  </div>
                </div>

                {s.total === 0 ? (
                  <div className="flex items-center justify-center py-2 rounded-lg bg-white/50 border border-dashed border-muted-foreground/20">
                    <p className="text-[10px] text-muted-foreground font-medium">Aguardando primeiras compras</p>
                  </div>
                ) : (
                  <>
                    {/* Período médio + última compra */}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Período médio: <strong className="text-foreground ml-0.5">{Math.round(s.avgPeriod)} dias</strong>
                      </span>
                      {s.lastDate && (
                        <span>
                          Última: <strong className="text-foreground">{new Date(s.lastDate).toLocaleDateString("pt-BR")}</strong>
                        </span>
                      )}
                    </div>

                    {/* Top pacotes */}
                    {topPkgs.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[9px] uppercase tracking-wider font-black text-muted-foreground">Top pacotes</p>
                        {topPkgs.map(([name, info]) => (
                          <div key={name} className="flex items-center justify-between bg-white/70 rounded-md px-2 py-1">
                            <span className="text-[11px] font-semibold text-foreground truncate max-w-[60%]">{name}</span>
                            <div className="flex items-center gap-2">
                              <Badge
                                className="text-[9px] px-1.5 py-0 h-4 font-bold"
                                style={{ background: meta.color + "20", color: meta.color, border: `1px solid ${meta.color}40` }}
                              >
                                {info.qty}×
                              </Badge>
                              <span className="text-[10px] font-black text-foreground">{fmtBRL(info.revenue)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
