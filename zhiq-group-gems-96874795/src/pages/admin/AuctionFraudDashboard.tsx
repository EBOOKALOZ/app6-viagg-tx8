import { AdminLayout } from "@/components/admin/AdminLayout";
import { Shield, AlertTriangle, UserX, Activity } from "lucide-react";
import { FraudAlertsList } from "@/components/admin/auction/FraudAlertsList";

export default function AuctionFraudDashboard() {
  return (
    <AdminLayout>
      <div className="space-y-8 animate-fade-in pb-12">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <Shield className="w-8 h-8 text-[#FF7A00]" />
              Painel de Segurança IA
            </h1>
            <p className="text-[#8E98A3] mt-2 max-w-2xl">
              Monitoramento antifraude em tempo real do módulo de Leilões. 
              Avalie ocorrências suspeitas detectadas pelo motor inteligente.
            </p>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#1A1F24] p-6 rounded-2xl border border-[#323A45]">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 rounded-xl bg-red-500/10">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <span className="text-xs font-black text-red-500 bg-red-500/10 px-2 py-1 rounded-full">+12%</span>
            </div>
            <h3 className="text-[#8E98A3] text-sm font-bold uppercase tracking-wider mb-1">Alertas Críticos</h3>
            <p className="text-3xl font-black text-white">24</p>
          </div>

          <div className="bg-[#1A1F24] p-6 rounded-2xl border border-[#323A45]">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 rounded-xl bg-orange-500/10">
                <UserX className="w-6 h-6 text-orange-500" />
              </div>
            </div>
            <h3 className="text-[#8E98A3] text-sm font-bold uppercase tracking-wider mb-1">Usuários Suspeitos</h3>
            <p className="text-3xl font-black text-white">8</p>
          </div>

          <div className="bg-[#1A1F24] p-6 rounded-2xl border border-[#323A45]">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 rounded-xl bg-[#00C58E]/10">
                <Shield className="w-6 h-6 text-[#00C58E]" />
              </div>
            </div>
            <h3 className="text-[#8E98A3] text-sm font-bold uppercase tracking-wider mb-1">Leilões Protegidos</h3>
            <p className="text-3xl font-black text-white">1,492</p>
          </div>

          <div className="bg-[#1A1F24] p-6 rounded-2xl border border-[#323A45]">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 rounded-xl bg-[#B8C2CC]/10">
                <Activity className="w-6 h-6 text-[#B8C2CC]" />
              </div>
            </div>
            <h3 className="text-[#8E98A3] text-sm font-bold uppercase tracking-wider mb-1">Lances Analisados</h3>
            <p className="text-3xl font-black text-white">45.2K</p>
          </div>
        </div>

        {/* Content */}
        <div className="bg-[#1A1F24] rounded-2xl border border-[#323A45] p-6">
          <div className="mb-6">
            <h2 className="text-xl font-black text-white">Ocorrências Detectadas</h2>
            <p className="text-sm text-[#8E98A3]">Lista de alertas levantados pela inteligência artificial para auditoria humana.</p>
          </div>
          
          <FraudAlertsList />
        </div>
      </div>
    </AdminLayout>
  );
}
