import MerchantConversionsSection from "@/components/merchant/MerchantConversionsSection";
import { TrendingUp, RefreshCw } from "lucide-react";
import { useState } from "react";

export default function MerchantConversions() {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    // Trigged by component internal refetch if needed, 
    // but here we just simulate for UI consistency
    setTimeout(() => setRefreshing(false), 1000);
  };

  return (
    <div className="px-4 pt-4 pb-28 lg:px-10 xl:px-16 max-w-5xl w-full mx-auto space-y-6">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between bg-[#1B1F24] border border-[#2A3038] p-6 rounded-3xl shadow-2xl shadow-black/40">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6A00] to-[#FF8C33] flex items-center justify-center shadow-lg shadow-[#FF6A00]/20">
            <TrendingUp className="h-8 w-8 text-white stroke-[2.5px]" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-[#F5F7FA] tracking-tight uppercase">Conversões</h1>
            <p className="text-[11px] font-bold text-[#A7B0BE] uppercase tracking-[0.2em] mt-1 opacity-70">
              Fechamentos • Performance • Histórico de Vendas
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="w-12 h-12 rounded-2xl border border-[#2A3038] bg-[#14171B] flex items-center justify-center hover:border-[#FF6A01]/40 hover:bg-[#1B1F24] transition-all disabled:opacity-50 group"
        >
          <RefreshCw className={`h-5 w-5 text-[#A7B0BE] group-hover:text-[#FF6A00] ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="bg-[#1B1F24] border border-[#2A3038] rounded-3xl overflow-hidden shadow-2xl shadow-black/20">
        <MerchantConversionsSection />
      </div>
    </div>
  );
}
