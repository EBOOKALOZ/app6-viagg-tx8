import { useOutletContext, useNavigate } from "react-router-dom";
import { MyStoreData } from "@/hooks/useMyStore";
import { PackageSearch, Bike, ArrowLeft } from "lucide-react";
// Importar componentes de chamadas de motoboy será feito no decorrer da task
import { MerchantDispatchPanel } from "@/components/merchant/MerchantDispatchPanel";

export default function StoreOrdersPage() {
  const { store } = useOutletContext<{ store: MyStoreData }>();
  const navigate = useNavigate();

  return (
    <div className="p-4 md:p-8 animate-fade-in space-y-6 mt-4">
      <header className="mb-6 border-b border-[#2A3038] pb-4">
        {/* Botão voltar */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-[#A7B0BE] hover:text-[#FF6A00] text-xs font-black uppercase tracking-widest mb-4 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Voltar ao Menu
        </button>

        <h1 className="text-2xl font-bold flex items-center gap-2 text-[#F5F7FA]">
          <PackageSearch className="text-[#FF6A00]" />
          Pedidos e Entregas
        </h1>
        <p className="text-[#A7B0BE] mt-2 text-sm">Gerencie suas vendas locais e solicite motoboys para entrega imediata.</p>
      </header>

      
      {/* Container de Chamada Rápida do Motoboy no Topo */}
      <div className="bg-[#111111] border border-yellow-500/20 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        
        <div className="flex items-center gap-3 mb-6 relative z-10">
          <div className="p-2 bg-yellow-500/10 rounded-lg">
            <Bike className="w-5 h-5 text-yellow-500" />
          </div>
          <h2 className="text-xl font-medium text-white">Despacho Logístico (Express)</h2>
        </div>
        
        <div className="relative z-10">
           {/* Reutilizando ou adaptando o MerchantDispatchPanel para acionar a corrida na loja */}
           <MerchantDispatchPanel 
             merchantId={store?.id || ''}
             storeProfile={{
               nome: store?.nome_loja || '',
               bairro: store?.bairro || '',
               cidade: store?.cidade || '',
               estado: store?.estado || '',
               latitude: null,
               longitude: null,
               region_id: null,
               city_id: null
             }}
           />
        </div>
      </div>

    </div>
  );
}
