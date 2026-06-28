import { Brain, TrendingUp, Zap, BarChart3, MessageSquare, Settings, Lock } from "lucide-react";

const MODULES = [
  {
    icon: Brain,
    color: "from-violet-500 to-purple-600",
    label: "IA GLM",
    description: "Inteligência artificial para gerenciamento de engajamentos e postagens automáticas.",
    status: "em breve",
  },
  {
    icon: TrendingUp,
    color: "from-emerald-500 to-green-600",
    label: "Comissões",
    description: "Acompanhe suas comissões geradas, histórico de pagamentos e evolução de ganhos.",
    status: "em breve",
  },
  {
    icon: MessageSquare,
    color: "from-blue-500 to-sky-600",
    label: "Postador Automático",
    description: "Distribua conteúdo automaticamente nos grupos do WhatsApp com IA.",
    status: "em breve",
  },
  {
    icon: BarChart3,
    color: "from-orange-500 to-amber-600",
    label: "Métricas & Relatórios",
    description: "Visualize métricas de desempenho, campanhas ativas e indicadores de performance.",
    status: "em breve",
  },
  {
    icon: Zap,
    color: "from-yellow-500 to-orange-500",
    label: "Campanhas",
    description: "Monitore e gerencie campanhas de distribuição de conteúdo em tempo real.",
    status: "em breve",
  },
  {
    icon: Settings,
    color: "from-zinc-500 to-slate-600",
    label: "Configurações GLM",
    description: "Administre o funcionamento da IA GLM, automações e integrações do sistema.",
    status: "em breve",
  },
];

export default function DriverComissao() {
  return (
    <div className="p-4 pb-24 space-y-6">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-800 p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-black text-base">Central de Comissão</p>
            <p className="text-white/60 text-xs">Módulo IA GLM · Viagg-TX8™</p>
          </div>
        </div>
        <p className="text-white/80 text-sm leading-relaxed">
          Hub central de gerenciamento da <strong className="text-white">IA GLM</strong> — inteligência operacional para postagens automáticas, distribuição de conteúdo e monitoramento de engajamentos em grupos do WhatsApp.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-lg border border-white/20">
          <Lock className="w-3 h-3 text-yellow-300" />
          <span className="text-yellow-300 text-[11px] font-bold uppercase tracking-wide">Integração em desenvolvimento</span>
        </div>
      </div>

      {/* Grid de módulos */}
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Módulos disponíveis</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <div
                key={mod.label}
                className="relative bg-card border border-border rounded-2xl p-4 space-y-2 opacity-80 select-none"
              >
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${mod.color} flex items-center justify-center shadow-md`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <p className="font-black text-sm text-foreground">{mod.label}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{mod.description}</p>
                <span className="inline-block text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                  {mod.status}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Roadmap */}
      <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Próximas integrações</p>
        {[
          { step: "1", label: "Conexão com IA GLM", detail: "API de engajamento inteligente" },
          { step: "2", label: "Postador WhatsApp", detail: "Distribuição automática em grupos" },
          { step: "3", label: "Dashboard de comissões", detail: "Relatórios e histórico de ganhos" },
          { step: "4", label: "Monitoramento em tempo real", detail: "Eventos, métricas e alertas" },
        ].map((item) => (
          <div key={item.step} className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">
              {item.step}
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
