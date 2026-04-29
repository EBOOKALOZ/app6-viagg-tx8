import { MarketLayout } from "@/components/layout/MarketLayout";
import { RealEstateUserPanel } from "@/components/real-estate/RealEstateUserPanel";
import { useRealEstateUserStats } from "@/hooks/useRealEstateUserStats";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { 
  Building2, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  MoreVertical,
  Edit,
  ExternalLink,
  Eye,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export default function RealEstateDashboard() {
  const [search, setSearch] = useState("");
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: listings, isLoading: listingsLoading } = useQuery({
    queryKey: ["my-real-estate-listings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("real_estate_listings")
        .select(`
          *,
          real_estate_media (
            public_masked_storage_path,
            original_storage_path
          )
        `)
        .eq("owner_user_id", user?.id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase rounded-full border border-emerald-100"><CheckCircle2 className="w-3 h-3" /> Publicado</span>;
      case 'pending_review':
        return <span className="flex items-center gap-1.5 px-3 py-1 bg-orange-50 text-orange-600 text-[10px] font-black uppercase rounded-full border border-orange-100"><Clock className="w-3 h-3" /> Em Análise</span>;
      case 'draft':
        return <span className="flex items-center gap-1.5 px-3 py-1 bg-zinc-50 text-zinc-500 text-[10px] font-black uppercase rounded-full border border-zinc-200"><Edit className="w-3 h-3" /> Rascunho</span>;
      default:
        return <span className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-600 text-[10px] font-black uppercase rounded-full border border-red-100"><AlertCircle className="w-3 h-3" /> {status}</span>;
    }
  };

  return (
    <MarketLayout search={search} setSearch={setSearch} hideHeaderAuth={true}>
      <div className="min-h-[80vh] bg-zinc-50/50 py-12 px-4">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Main User Panel Header */}
          <RealEstateUserPanel />

          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <h2 className="text-2xl font-black text-zinc-900 tracking-tight uppercase">Meus Cadastros</h2>
            <Button 
               onClick={() => navigate('/mercado/quero-vender')}
               className="h-12 bg-zinc-900 hover:bg-black text-white px-6 rounded-2xl font-black text-xs uppercase tracking-widest gap-2"
            >
              <Plus className="w-4 h-4" /> Novo Anúncio
            </Button>
          </div>

          {/* Listings Table/List */}
          <div className="bg-white rounded-[32px] border border-zinc-100 shadow-xl shadow-zinc-200/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50 border-bottom border-zinc-100">
                    <th className="p-6 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Imóvel</th>
                    <th className="p-6 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Tipo</th>
                    <th className="p-6 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-center">Status</th>
                    <th className="p-6 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Preço</th>
                    <th className="p-6 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {listingsLoading ? (
                    <tr>
                      <td colSpan={5} className="p-20 text-center">
                        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
                      </td>
                    </tr>
                  ) : listings?.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-20 text-center space-y-4">
                        <div className="w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center mx-auto text-zinc-300">
                          <Building2 className="w-8 h-8" />
                        </div>
                        <p className="font-bold text-zinc-400 uppercase text-xs tracking-widest">Nenhum imóvel cadastrado ainda.</p>
                      </td>
                    </tr>
                  ) : (
                    listings?.map((listing) => (
                      <tr key={listing.id} className="hover:bg-zinc-50/50 transition-colors group">
                        <td className="p-6">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-zinc-100 overflow-hidden shrink-0 border border-zinc-200 flex items-center justify-center">
                               {listing.real_estate_media?.[0] ? (
                                 <img 
                                   src={`${supabase.storage.from('real-estate-public').getPublicUrl(listing.real_estate_media[0].public_masked_storage_path || listing.real_estate_media[0].original_storage_path).data.publicUrl}`} 
                                   alt={listing.title}
                                   className="w-full h-full object-cover"
                                 />
                               ) : (
                                 <Building2 className="w-full h-full p-3 text-zinc-400" />
                               )}
                            </div>
                            <div>
                              <h3 className="font-black text-zinc-900 text-sm line-clamp-1 group-hover:text-[#FF6A00] transition-colors">{listing.title}</h3>
                              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{listing.city}, {listing.state}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-6">
                           <span className="text-xs font-black text-zinc-600 uppercase tracking-tight">{listing.property_type}</span>
                        </td>
                        <td className="p-6">
                          <div className="flex justify-center">
                            {getStatusBadge(listing.visibility_status)}
                          </div>
                        </td>
                        <td className="p-6 text-right font-black text-zinc-900">
                          {formatCurrencyBRL(listing.price_brl)}
                        </td>
                        <td className="p-6">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-orange-50 hover:text-[#FF6A00] transition-all">
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-orange-50 hover:text-[#FF6A00] transition-all">
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-zinc-100 transition-all">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="bg-orange-50 border border-orange-100 rounded-[32px] p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1">
              <h4 className="text-orange-900 font-black text-lg uppercase tracking-tight">Precisa de mais visibilidade?</h4>
              <p className="text-orange-700 text-sm font-medium">Contrate pacotes de créditos extras para destacar seus imóveis e receber mais leads.</p>
            </div>
            <Button 
                onClick={() => navigate('/mercado/quero-vender')}
                className="h-14 px-10 bg-white hover:bg-orange-100 text-[#FF6A00] border-2 border-[#FF6A00] rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-orange-500/10 transition-all"
            >
              Ver Planos de Crédito
            </Button>
          </div>
        </div>
      </div>
    </MarketLayout>
  );
}
