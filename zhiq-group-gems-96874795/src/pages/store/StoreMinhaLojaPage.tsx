import { useOutletContext, Link } from "react-router-dom";
import { MyStoreData } from "@/hooks/useMyStore";
import { Store, TrendingUp, Package, Wallet, Plus, Megaphone, Settings, Star, ChevronRight, MapPin, CheckCircle2, Clock, Eye, Edit, Trash2, Phone, Mail, ArrowLeft, Search, ShoppingBag, Share2 } from "lucide-react";
import ProductShowcase from "@/components/merchant/ProductShowcase";
import { StoreHeader } from "@/components/public/store/StoreHeader";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function StoreMinhaLojaPage() {
  const { store } = useOutletContext<{ store: MyStoreData }>();
  const { user } = useAuth();

  // Conta apenas produtos da vitrine da loja (merchant_marketing_products)
  const { data: productsCount = 0 } = useQuery({
    queryKey: ["my-store-products-count", user?.id, store?.id],
    enabled: !!user?.id,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!store?.id) return 0;
      const { count } = await (supabase.from("merchant_marketing_products" as any)
        .select("id", { count: "exact", head: true })
        .eq("merchant_store_id", store.id)) as any;
      return count ?? 0;
    },
  });

  // Helper to build full address safely
  const addressParts = [];
  const rua = store.rua || (store as any).street;
  const numero = store.numero || (store as any).number;
  if (rua) addressParts.push(`${rua}${numero ? `, ${numero}` : ''}`);
  
  const bairro = store.bairro || (store as any).neighborhood;
  if (bairro) addressParts.push(bairro);
  
  const cidade = store.cidade || (store as any).city;
  const estado = store.estado || (store as any).state;
  if (cidade) addressParts.push(estado ? `${cidade} - ${estado}` : cidade);

  const fullAddress = addressParts.join(' • ');

  return (
    <div className="p-4 md:p-8 animate-fade-in pb-24 bg-[#F5E62B] min-h-screen">
      
      {/* Mocking the MarketLayout for a realistic preview */}
      <div className="rounded-[40px] overflow-hidden border border-zinc-200 shadow-2xl mb-8 bg-zinc-50/50">
        {/* Mock Orange Market Top Bar */}
        <div className="bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] px-4 md:px-6 h-[72px] flex items-center justify-between text-white shadow-md relative z-20">
            <Link to="/mercado" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                 <ArrowLeft className="w-5 h-5" /> <span className="font-bold text-sm hidden md:inline">Mercado</span>
            </Link>
            <div className="flex-1 max-w-2xl mx-4 relative hidden lg:block opacity-70 pointer-events-none">
                <Input placeholder="Buscar em Mercado Local..." className="h-[52px] rounded-l-lg rounded-r-none border-0 bg-white text-gray-700 placeholder:text-gray-400 text-[15px] font-medium focus-visible:ring-0" />
                <button className="absolute right-0 top-0 bottom-0 px-5 bg-[#e65c00] rounded-r-lg flex items-center justify-center translate-x-full">
                    <Search className="h-6 w-6 text-white" />
                </button>
            </div>
            <div className="flex items-center gap-4">
                <button
                    type="button"
                    onClick={() => {
                        const url = `${window.location.origin}/loja/${store?.id || ""}`;
                        if (navigator.share) {
                            navigator.share({ title: store?.nome_loja || "Minha Loja", url }).catch(() => {});
                        } else {
                            navigator.clipboard?.writeText(url);
                            toast.success("Link da loja copiado!");
                        }
                    }}
                    className="hover:opacity-80 transition-opacity"
                    title="Compartilhar loja"
                >
                    <Share2 className="w-5 h-5" />
                </button>
            </div>
        </div>

        {/* The actual Public Store Header as preview */}
        <div className="pointer-events-none">
            <StoreHeader 
                store={{
                    store_name: store.nome_loja || "Sua Loja",
                    city: cidade,
                    region: estado,
                    logo_url: store.logo_url,
                    banner_url: (store as any).banner_url || null,
                    description: store.descricao || "Descrição da loja..."
                }}
                stats={{ average: "5.0", count: 12 }}
                productsCount={productsCount}
                whatsappNumber={store.telefone}
                onShare={() => {}}
                logoUrl={store.logo_url}
                bannerUrl={(store as any).banner_url || null}
            />
        </div>
        
        {/* Indicator that this is a Preview Mode */}
        <div className="bg-blue-50 border-t border-blue-100 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-600 text-xs font-bold uppercase tracking-widest">
                <Eye className="w-4 h-4" /> Pré-visualização do Perfil Público
            </div>
            <Link 
              to="/anunciante/conta" 
              className="flex items-center justify-center h-[42px] px-[21px] rounded-lg bg-blue-600 text-white font-bold text-[15px] hover:bg-blue-700 transition-colors"
            >
              <Settings className="w-[18px] h-[18px] mr-2" /> Editar Perfil
            </Link>
        </div>
      </div>



      {/* Seção de Vitrine de Produtos */}
      <div className="mt-12 bg-white rounded-3xl p-6 md:p-8 shadow-xl border border-zinc-200">
        <ProductShowcase storeId={store?.id || null} />
      </div>
    </div>
  );
}
