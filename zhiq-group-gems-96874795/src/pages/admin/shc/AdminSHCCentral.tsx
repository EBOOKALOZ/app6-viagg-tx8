import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import { ShieldCheck, ShieldAlert, ChevronRight, Loader2, Calendar, Award, AlertTriangle } from "lucide-react";
import { useSHCRealtime } from "../../../hooks/useSHCRealtime";
import { format } from "date-fns";
import { SHCPermanentAlert } from "@/components/admin/shc/SHCPermanentAlert";
import type { SHCModule, SHCRun, SHCStatus } from "../../../types/shc";

const officialModules = [
  { name: "Leilões", slug: "leiloes", icon: "🏛" },
  { name: "Marketplace", slug: "marketplace", icon: "🛒" },
  { name: "Veículos", slug: "veiculos", icon: "🚗" },
  { name: "Imóveis", slug: "imoveis", icon: "🏠" },
  { name: "Fretes", slug: "fretes", icon: "🚚" },
  { name: "Viagens e Turismo", slug: "viagens", icon: "✈️" },
  { name: "Serviços", slug: "servicos", icon: "🧰" },
  { name: "Divulgação", slug: "divulgacao", icon: "📢" },
  { name: "Financeiro", slug: "financeiro", icon: "💳" },
  { name: "Usuários", slug: "usuarios", icon: "👤" },
  { name: "Lojas", slug: "lojas", icon: "🏪" },
  { name: "IA", slug: "ia", icon: "🤖" },
  { name: "Sistema", slug: "sistema", icon: "⚙️" },
];

/**
 * Estados REAIS de shc_modules.status (enum shc_status) agrupados
 * para exibição no painel:
 *  - active / passed        → Certificado (verde)
 *  - active_corrected       → Aprovado com Ressalvas (amarelo)
 *  - failed / error         → Reprovado (vermelho)
 *  - running                → Em Execução (azul)
 *  - pending/inactive/null  → Não Auditado (cinza)
 */
type StatusGroup = 'certified' | 'warned' | 'failed' | 'running' | 'not_audited';

function groupStatus(status: SHCStatus | null): StatusGroup {
  if (status === 'active' || status === 'passed') return 'certified';
  if (status === 'active_corrected') return 'warned';
  if (status === 'failed' || status === 'error') return 'failed';
  if (status === 'running') return 'running';
  return 'not_audited';
}

const statusConfig: Record<StatusGroup, { label: string; dot: string; badge: string }> = {
  certified: { label: "Certificado", dot: "🟢", badge: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  warned: { label: "Aprovado com Ressalvas", dot: "🟡", badge: "border-amber-200 bg-amber-50 text-amber-700" },
  failed: { label: "Reprovado", dot: "🔴", badge: "border-red-200 bg-red-50 text-red-700" },
  running: { label: "Em Execução", dot: "🔵", badge: "border-blue-200 bg-blue-50 text-blue-700" },
  not_audited: { label: "Não Auditado", dot: "⚪", badge: "border-slate-200 bg-slate-50 text-slate-500" },
};

interface ModuleCardData {
  name: string;
  slug: string;
  icon: string;
  dbModule: SHCModule | null;
  group: StatusGroup;
  score: number | null;
  latestRun: SHCRun | null;
  isCertified: boolean;
}

export default function AdminSHCCentral() {
  const { modules, runs, certificates, isLoading, error } = useSHCRealtime();

  React.useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      console.error("===== SHC GLOBAL BROWSER ERROR =====");
      console.error("Mensagem:", event.message);
      console.error("Arquivo:", event.filename);
      console.error("Linha:", event.lineno, "Coluna:", event.colno);
      console.error("Stack:", event.error?.stack);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("===== SHC UNHANDLED PROMISE REJECTION =====");
      console.error("Razão:", event.reason);
      console.error("Stack:", event.reason?.stack);
    };

    window.addEventListener("error", handleGlobalError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleGlobalError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="w-8 h-8 animate-spin text-[#16A34A]" />
      </div>
    );
  }

  const getScoreColor = (score: number | null) => {
    if (score === null) return "#94A3B8";
    if (score >= 90) return "#22C55E";
    if (score >= 70) return "#F59E0B";
    return "#EF4444";
  };

  const buildCardData = (name: string, slug: string, icon: string): ModuleCardData => {
    // Match por SLUG exato do banco (nunca por name.includes)
    const dbModule = modules.find(m => m.slug === slug) ?? null;
    const moduleRuns = dbModule ? runs.filter(r => r.module_id === dbModule.id) : [];
    const latestRun = moduleRuns
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
    const isCertified = dbModule ? certificates.some(c => c.module_id === dbModule.id) : false;

    return {
      name: dbModule?.name ?? name,
      slug,
      icon,
      dbModule,
      group: groupStatus(dbModule?.status ?? null),
      score: dbModule?.quality_score ?? null,
      latestRun,
      isCertified,
    };
  };

  // Módulos do banco fora da lista oficial (match por slug exato)
  const dbOnlyModules = modules.filter(m => !officialModules.some(off => off.slug === m.slug));

  const allModules: ModuleCardData[] = [
    ...officialModules.map(off => buildCardData(off.name, off.slug, off.icon)),
    ...dbOnlyModules.map(m => buildCardData(m.name, m.slug, "📦")),
  ];

  const countBy = (group: StatusGroup) => allModules.filter(m => m.group === group).length;

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 md:p-10 font-inter">
      <div className="max-w-7xl mx-auto">

        {/* Header Central */}
        <div className="mb-12">
          <div className="flex items-center gap-5 mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-[#166534] to-[#22C55E] rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight">Central SHC</h1>
              <p className="text-slate-500 text-lg mt-0.5">Centro Oficial de Certificação — Viagg-TX8</p>
            </div>
          </div>
          <p className="text-slate-400 max-w-3xl">
            Cada módulo da plataforma possui auditoria, homologação e certificação independentes.
            Selecione um módulo para acessar seu ambiente isolado de qualidade.
          </p>
        </div>

        {/* Erro de carregamento */}
        {error && (
          <div className="mb-8 flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Falha ao carregar dados do SHC</p>
              <p className="text-sm">{error.message}</p>
            </div>
          </div>
        )}

        {/* Resumo Global — contagem pelos estados REAIS de shc_modules.status */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Módulos</div>
            <div className="text-3xl font-black text-slate-900">{allModules.length}</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Certificados</div>
            <div className="text-3xl font-black text-emerald-600">{countBy('certified')}</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Com Ressalvas</div>
            <div className="text-3xl font-black text-amber-600">{countBy('warned')}</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Reprovados</div>
            <div className="text-3xl font-black text-red-600">{countBy('failed')}</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Não Auditados</div>
            <div className="text-3xl font-black text-slate-400">{countBy('not_audited')}</div>
          </div>
        </div>

        {/* Grid de Módulos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allModules.map((mod) => {
            const cfg = statusConfig[mod.group];

            return (
              <Card
                key={mod.slug}
                className="bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-lg hover:border-[#16A34A]/30 transition-all duration-300 group overflow-hidden"
              >
                <CardContent className="p-0">
                  <div className="h-1.5 w-full bg-slate-100">
                    <div
                      className="h-full rounded-r-full transition-all duration-700"
                      style={{ width: `${mod.score ?? 0}%`, backgroundColor: getScoreColor(mod.score) }}
                    />
                  </div>

                  <div className="p-6">
                    <div className="flex items-start justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div className="text-3xl">{mod.icon}</div>
                        <div>
                          <h3 className="text-lg font-black text-slate-900 uppercase tracking-wide">{mod.name}</h3>
                          <Badge variant="outline" className={`text-xs mt-1 ${cfg.badge}`}>
                            {cfg.dot} {cfg.label}
                          </Badge>
                        </div>
                      </div>
                      {mod.isCertified && (
                        <Award className="w-5 h-5 text-emerald-500 opacity-60" />
                      )}
                    </div>

                    {/* Score real (shc_modules.quality_score) */}
                    <div className="mb-5">
                      <div className="flex items-end justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-500">Score</span>
                        <span className="text-2xl font-black" style={{ color: getScoreColor(mod.score) }}>
                          {mod.score !== null ? `${mod.score}%` : '—'}
                        </span>
                      </div>
                      <Progress value={mod.score ?? 0} className="h-2 bg-slate-100" />
                    </div>

                    {/* Detalhes da última execução real */}
                    <div className="grid grid-cols-2 gap-3 mb-2">
                      <div className="bg-slate-50 rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-xs font-medium text-slate-400">Última Execução</span>
                        </div>
                        <span className="text-sm font-bold text-slate-700">
                          {mod.latestRun ? format(new Date(mod.latestRun.created_at), "dd/MM/yyyy") : "Nunca"}
                        </span>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-xs font-medium text-slate-400">Falhas / Avisos</span>
                        </div>
                        <span className="text-sm font-bold text-slate-700">
                          {mod.latestRun ? `${mod.latestRun.critical ?? 0}C / ${mod.latestRun.warnings ?? 0}W` : "—"}
                        </span>
                      </div>
                    </div>

                    {/* Razão da decisão (shc_runs.decision_reason) */}
                    {mod.latestRun?.decision_reason && (
                      <div className="mb-4 text-xs text-slate-500 bg-slate-100 p-2 rounded truncate" title={mod.latestRun.decision_reason}>
                        {mod.latestRun.decision_reason}
                      </div>
                    )}

                    {/* Enter Button — rota por SLUG */}
                    <Link to={`/admin/shc/${mod.slug}`}>
                      <Button
                        variant="outline"
                        className="w-full justify-between rounded-xl border-slate-200 text-[#111827] font-bold hover:bg-[#16A34A] hover:text-white hover:border-[#16A34A] transition-all group/btn"
                      >
                        Entrar
                        <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

      </div>
      <SHCPermanentAlert />
    </div>
  );
}
