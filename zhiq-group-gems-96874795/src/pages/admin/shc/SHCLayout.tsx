import React, { Fragment } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { LayoutDashboard, ActivitySquare, AlertTriangle, History, ArrowLeft, Award, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

import { useSHCRealtime } from "../../../hooks/useSHCRealtime";

// Official list for title resolution
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

export function SHCLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { moduleId = "geral" } = useParams();
  const { modules } = useSHCRealtime();

  // Tenta achar no DB, se não, usa a lista oficial
  const dbModule = modules.find(m => m.slug === moduleId);
  const offModule = officialModules.find(m => m.slug === moduleId);
  const moduleName = dbModule ? dbModule.name : (offModule ? offModule.name : "Geral");
  const moduleIcon = offModule ? offModule.icon : "🛡";

  const tabs = [
    { 
      name: "Visão Geral", 
      path: `/admin/shc/${moduleId}`, 
      icon: LayoutDashboard,
      description: "Métricas e Status"
    },
    { 
      name: "Auditoria", 
      path: `/admin/shc/${moduleId}/auditoria`, 
      icon: ActivitySquare,
      description: "Testes Manuais e Auto"
    },
    { 
      name: "Correções", 
      path: `/admin/shc/${moduleId}/correcoes`, 
      icon: AlertTriangle,
      description: "Ações Pendentes"
    },
    { 
      name: "Histórico", 
      path: `/admin/shc/${moduleId}/historico`, 
      icon: History,
      description: "Log de Execuções"
    },
    { 
      name: "Certificação", 
      path: `/admin/shc/${moduleId}/certificacao`, 
      icon: Award,
      description: "Selo Oficial"
    },
    { 
      name: "Evolução", 
      path: `/admin/shc/${moduleId}/evolucao`, 
      icon: TrendingUp,
      description: "Gráficos e Tendências"
    }
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto font-inter">
      {/* Header Premium */}
      <div className="bg-gradient-to-r from-[#166534] to-[#16A34A] rounded-3xl p-8 shadow-xl">
        <div className="flex items-center gap-4">
          <Link to="/admin/shc" className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner text-2xl">
            {moduleIcon}
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">SHC — {moduleName}</h1>
            <p className="text-emerald-100 text-sm font-medium opacity-90">
              Sistema de Homologação Contínua
            </p>
          </div>
        </div>
      </div>

      {/* Navegação Superior */}
      <div className="w-full overflow-x-auto pb-2 -mb-2">
        <div className="inline-flex min-w-max items-center bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
          {tabs.map((tab, idx) => {
            const isActive = location.pathname === tab.path;
            return (
              <Fragment key={tab.path}>
                <Link
                  to={tab.path}
                  className={cn(
                    "flex items-center gap-2 px-5 py-2.5 rounded-xl text-[16px] font-semibold transition-all duration-200",
                    isActive 
                      ? "bg-[#16A34A] text-white shadow-md" 
                      : "bg-transparent text-[#111827] hover:bg-[#16A34A]/5 hover:text-[#166534]"
                  )}
                >
                  <tab.icon className={cn("w-5 h-5", isActive ? "text-white" : "text-[#16A34A]")} />
                  {tab.name}
                </Link>
                {/* Separator, except for last item */}
                {idx < tabs.length - 1 && (
                  <div className="w-[1px] h-6 bg-[#E5E7EB] mx-2" />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Conteúdo Principal */}
      <div className="pt-2">
        {children}
      </div>
    </div>
  );
}
