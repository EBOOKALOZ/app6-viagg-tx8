import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  CheckCircle2, 
  XCircle, 
  Eye, 
  Building2, 
  Clock, 
  MapPin, 
  User, 
  Loader2,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, formatCurrencyBRL } from '@/lib/utils';

export const AdminRealEstateModeration = () => {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchPendingListings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('real_estate_listings')
        .select('*')
        .eq('visibility_status', 'pending_review')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setListings(data || []);
    } catch (err: any) {
      toast.error(`Erro ao carregar anúncios: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingListings();
  }, []);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    try {
      setProcessingId(id);
      const newStatus = action === 'approve' ? 'published' : 'rejected';
      const payload: any = { 
        visibility_status: newStatus,
        updated_at: new Date().toISOString()
      };
      
      if (action === 'approve') {
        payload.published_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('real_estate_listings')
        .update(payload)
        .eq('id', id);

      if (error) throw error;

      toast.success(action === 'approve' ? 'Anúncio publicado com sucesso!' : 'Anúncio rejeitado.');
      setListings(prev => prev.filter(l => l.id !== id));
    } catch (err: any) {
      toast.error(`Erro na operação: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-50" />
        <p className="text-sm text-zinc-500 font-medium animate-pulse tracking-wide uppercase">Carregando Moderação...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl">
             <Building2 className="w-8 h-8 text-primary shadow-glow" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Moderação de Imóveis</h1>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
              Aprovação de novos anúncios pendentes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-zinc-900/40 p-2 rounded-2xl border border-zinc-800/60">
           <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-black h-8 px-4">
             {listings.length} PENDENTES
           </Badge>
        </div>
      </header>

      {listings.length === 0 ? (
        <Card className="bg-zinc-900/40 border-zinc-800/60 border-dashed py-20">
           <CardContent className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-full bg-zinc-950/50 border border-zinc-900 text-zinc-600">
                 <CheckCircle2 className="w-12 h-12 opacity-20" />
              </div>
              <p className="text-zinc-500 font-bold uppercase tracking-tighter text-sm">Nenhum anúncio pendente de revisão no momento.</p>
           </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {listings.map((item) => (
            <Card key={item.id} className="bg-zinc-900/80 border-zinc-800 overflow-hidden group hover:border-primary/30 transition-all duration-300">
              <div className="flex flex-col lg:flex-row">
                {/* Visual Section */}
                <div className="lg:w-1/4 bg-zinc-950 p-6 flex flex-col justify-center items-center gap-4 border-r border-zinc-800">
                   <div className="p-4 rounded-3xl bg-primary/5 border border-primary/10">
                      <Building2 className="w-16 h-16 text-zinc-700 group-hover:text-primary transition-colors" />
                   </div>
                   <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 font-black">
                     AGUARDANDO
                   </Badge>
                </div>

                {/* Info Section */}
                <div className="flex-1 p-8 space-y-6">
                   <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-black text-white tracking-tight leading-tight uppercase underline decoration-primary/30 underline-offset-8 decoration-4">
                          {item.title}
                        </h2>
                        <div className="flex items-center gap-2 mt-4 text-zinc-400 font-medium">
                           <MapPin className="w-4 h-4 text-primary" />
                           <span className="text-xs uppercase tracking-tight">{item.city}, {item.state} - {item.neighborhood}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-zinc-500 uppercase">Preço Pretendido</p>
                        <p className="text-3xl font-black text-emerald-400 tracking-tighter">
                          {formatCurrencyBRL(item.price_brl)}
                        </p>
                      </div>
                   </div>

                   <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-6 border-t border-zinc-800">
                      <div className="space-y-1">
                         <p className="flex items-center gap-2 text-[9px] font-black text-zinc-500 uppercase">
                           <User className="w-3 h-3" /> Anunciante
                         </p>
                         <p className="text-sm font-bold text-zinc-200">{item.agent_name || item.agency_name || 'N/A'}</p>
                      </div>
                      <div className="space-y-1">
                         <p className="flex items-center gap-2 text-[9px] font-black text-zinc-500 uppercase">
                           <Calendar className="w-3 h-3" /> Criado em
                         </p>
                         <p className="text-sm font-bold text-zinc-200">
                            {format(new Date(item.created_at), "dd 'de' MMMM", { locale: ptBR })}
                         </p>
                      </div>
                      <div className="space-y-1">
                         <p className="flex items-center gap-2 text-[9px] font-black text-zinc-500 uppercase">
                           <Eye className="w-3 h-3" /> Tipo
                         </p>
                         <p className="text-sm font-bold text-zinc-200 uppercase">{item.property_type}</p>
                      </div>
                      <div className="space-y-1">
                         <p className="flex items-center gap-2 text-[9px] font-black text-zinc-500 uppercase">
                            <AlertCircle className="w-3 h-3" /> Área Total
                          </p>
                          <p className="text-sm font-bold text-zinc-200">{item.total_area_m2 ? (item.total_area_m2 / 10000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '—'} ha</p>
                      </div>
                   </div>
                </div>

                {/* Actions */}
                <div className="bg-zinc-950 p-8 flex flex-row lg:flex-col justify-center gap-3 border-l border-zinc-800 min-w-[200px]">
                   <Button 
                     onClick={() => handleAction(item.id, 'approve')}
                     disabled={processingId === item.id}
                     className="flex-1 lg:w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm gap-2 shadow-lg shadow-emerald-500/10"
                   >
                     {processingId === item.id ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                       <>
                         <CheckCircle2 className="w-5 h-5" />
                         APROVAR
                       </>
                     )}
                   </Button>
                   <Button 
                     onClick={() => handleAction(item.id, 'reject')}
                     disabled={processingId === item.id}
                     variant="ghost"
                     className="flex-1 lg:w-full h-14 rounded-2xl border border-red-500/30 text-red-500 hover:bg-red-500/10 font-black text-sm gap-2 uppercase"
                   >
                     <XCircle className="w-5 h-5" />
                     REJEITAR
                   </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminRealEstateModeration;
