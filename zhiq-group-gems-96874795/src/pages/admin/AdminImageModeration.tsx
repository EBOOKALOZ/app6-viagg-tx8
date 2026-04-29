import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  CheckCircle2, XCircle, Search, Filter, Image as ImageIcon, 
  Loader2, Maximize2, AlertCircle, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ModerationImage {
  id: string;
  listing_id: string;
  media_url: string;
  moderation_status: 'pending_review' | 'approved' | 'rejected';
  moderation_reason: string | null;
  created_at: string;
  listing: {
    title: string;
    description: string;
    advertiser_account_id: string;
    advertiser_accounts: {
      user_id: string;
      profiles: {
        name: string;
      };
    };
  };
}

const AdminImageModeration = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_review' | 'approved' | 'rejected'>('pending_review');
  const [selectedImage, setSelectedImage] = useState<ModerationImage | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // ── Fetch Images ──
  const { data: images = [], isLoading } = useQuery({
    queryKey: ['admin-image-moderation', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('advertiser_listing_media')
        .select(`
          id, listing_id, media_url, moderation_status, moderation_reason, created_at,
          listing:advertiser_listings (
            title, description, advertiser_account_id,
            advertiser_accounts (
              user_id,
              profiles:user_id ( name )
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('moderation_status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as any) as ModerationImage[];
    }
  });

  // ── Filtragem Local ──
  const filteredImages = useMemo(() => {
    if (!searchTerm) return images;
    const lower = searchTerm.toLowerCase();
    return images.filter(img => 
      img.listing?.title?.toLowerCase().includes(lower) ||
      img.id.toLowerCase().includes(lower) ||
      img.listing?.advertiser_accounts?.profiles?.name?.toLowerCase().includes(lower)
    );
  }, [images, searchTerm]);

  // ── Métricas ──
  const metrics = useMemo(() => {
    return {
      pending: images.filter(i => i.moderation_status === 'pending_review').length,
      approvedToday: images.filter(i => i.moderation_status === 'approved' && new Date(i.created_at).toDateString() === new Date().toDateString()).length,
      rejectedToday: images.filter(i => i.moderation_status === 'rejected' && new Date(i.created_at).toDateString() === new Date().toDateString()).length,
      total: images.length
    };
  }, [images]);

  // ── Mutação de Status ──
  const moderateMutation = useMutation({
    mutationFn: async ({ id, status, reason }: { id: string, status: 'approved' | 'rejected', reason?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('advertiser_listing_media')
        .update({
          moderation_status: status,
          moderation_reason: reason || null,
          moderated_by: user?.id,
          moderated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success(variables.status === 'approved' ? 'Imagem Aprovada!' : 'Imagem Reprovada!');
      queryClient.invalidateQueries({ queryKey: ['admin-image-moderation'] });
      if (selectedImage?.id === variables.id) setSelectedImage(null);
      setRejectionReason('');
    },
    onError: (err: any) => {
      toast.error('Erro ao moderar: ' + err.message);
    }
  });

  const handleApprove = (id: string) => {
    moderateMutation.mutate({ id, status: 'approved' });
  };

  const handleReject = (id: string) => {
    if (!rejectionReason.trim()) {
      toast.error('Informe o motivo da reprovação.');
      return;
    }
    moderateMutation.mutate({ id, status: 'rejected', reason: rejectionReason });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-zinc-900 tracking-tight flex items-center gap-3">
            <ImageIcon className="w-8 h-8 text-emerald-500" />
            Aprovação de Imagens
          </h1>
          <p className="text-zinc-500 font-medium">Controle de qualidade das mídias enviadas pelos anunciantes.</p>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6 border-none shadow-xl shadow-zinc-200/40 rounded-3xl bg-amber-50">
          <div className="flex flex-col gap-2">
            <Clock className="w-8 h-8 text-amber-500" />
            <h3 className="text-3xl font-black text-amber-700">{metrics.pending}</h3>
            <p className="text-[10px] font-bold text-amber-600/80 uppercase tracking-widest">Pendentes de Revisão</p>
          </div>
        </Card>
        <Card className="p-6 border-none shadow-xl shadow-zinc-200/40 rounded-3xl bg-emerald-50">
          <div className="flex flex-col gap-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            <h3 className="text-3xl font-black text-emerald-700">{metrics.approvedToday}</h3>
            <p className="text-[10px] font-bold text-emerald-600/80 uppercase tracking-widest">Aprovadas Hoje</p>
          </div>
        </Card>
        <Card className="p-6 border-none shadow-xl shadow-zinc-200/40 rounded-3xl bg-red-50">
          <div className="flex flex-col gap-2">
            <XCircle className="w-8 h-8 text-red-500" />
            <h3 className="text-3xl font-black text-red-700">{metrics.rejectedToday}</h3>
            <p className="text-[10px] font-bold text-red-600/80 uppercase tracking-widest">Reprovadas Hoje</p>
          </div>
        </Card>
        <Card className="p-6 border-none shadow-xl shadow-zinc-200/40 rounded-3xl bg-blue-50">
          <div className="flex flex-col gap-2">
            <ImageIcon className="w-8 h-8 text-blue-500" />
            <h3 className="text-3xl font-black text-blue-700">{metrics.total}</h3>
            <p className="text-[10px] font-bold text-blue-600/80 uppercase tracking-widest">Total Analisadas</p>
          </div>
        </Card>
      </div>

      {/* Controles de Filtro e Busca */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-full border border-zinc-100 shadow-lg shadow-zinc-200/30">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input 
            className="pl-12 h-12 rounded-full border-zinc-100 bg-zinc-50"
            placeholder="Buscar por produto ou usuário..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-zinc-400 ml-2" />
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-[180px] h-12 rounded-full border-zinc-100 bg-zinc-50">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="pending_review">Pendentes</SelectItem>
              <SelectItem value="approved">Aprovadas</SelectItem>
              <SelectItem value="rejected">Reprovadas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grid Principal */}
      <div className="relative min-h-[400px]">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-zinc-400" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900">Tudo limpo!</h3>
            <p className="text-zinc-500">Nenhuma imagem encontrada com os filtros atuais.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredImages.map(img => (
              <Card 
                key={img.id} 
                className="overflow-hidden border-none shadow-xl shadow-zinc-200/40 rounded-3xl group relative bg-white cursor-pointer hover:ring-2 hover:ring-emerald-500 transition-all"
                onClick={() => setSelectedImage(img)}
              >
                <div className="aspect-[4/3] bg-zinc-100 relative">
                  <img src={img.media_url} alt="Prod" className="absolute inset-0 w-full h-full object-cover" />
                  
                  {/* Badge Status */}
                  <div className="absolute top-3 right-3">
                    {img.moderation_status === 'pending_review' && <Badge className="bg-amber-500 hover:bg-amber-600 text-white shadow-lg border-none">Analisar</Badge>}
                    {img.moderation_status === 'approved' && <Badge className="bg-emerald-500 text-white shadow-lg border-none">Aprovada</Badge>}
                    {img.moderation_status === 'rejected' && <Badge className="bg-red-500 text-white shadow-lg border-none">Reprovada</Badge>}
                  </div>

                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                    <Maximize2 className="w-8 h-8 text-white drop-shadow-lg" />
                  </div>
                </div>
                <div className="p-4 space-y-1 bg-white">
                  <h4 className="font-bold text-zinc-900 text-sm line-clamp-1">{img.listing?.title || 'Produto sem título'}</h4>
                  <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest line-clamp-1">
                    {img.listing?.advertiser_accounts?.profiles?.name || 'Vendedor Anonimo'}
                  </p>
                  <p className="text-[10px] text-zinc-400 font-bold">
                    {formatDistanceToNow(new Date(img.created_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal/Overlay de Avaliação Detalhada */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-[40px] max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row shadow-2xl">
            
            {/* Foto Ampliada */}
            <div className="md:w-1/2 bg-zinc-950 relative flex items-center justify-center min-h-[300px]">
              <img src={selectedImage.media_url} alt="Large Prod" className="max-w-full max-h-[90vh] object-contain p-4" />
            </div>
            
            {/* Infos e Ações */}
            <div className="md:w-1/2 p-8 overflow-y-auto flex flex-col h-full bg-zinc-50/50">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-black text-zinc-900 tracking-tight">{selectedImage.listing?.title}</h2>
                  <p className="text-xs text-zinc-500 font-bold tracking-widest uppercase mt-1">
                    Enviado por {selectedImage.listing?.advertiser_accounts?.profiles?.name || 'Vendedor Anonimo'}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setSelectedImage(null); setRejectionReason(''); }} className="rounded-full bg-zinc-100 hover:bg-zinc-200">
                  <XCircle className="w-5 h-5 text-zinc-500" />
                </Button>
              </div>

              <div className="space-y-6 flex-1">
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Descrição do Produto</h4>
                  <p className="text-sm text-zinc-700 bg-white p-4 rounded-2xl border border-zinc-100 leading-relaxed shadow-sm block break-words">
                    {selectedImage.listing?.description || 'Nenhuma descrição fornecida.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Diretrizes de Qualidade</h4>
                  <ul className="text-xs text-zinc-600 bg-amber-50/50 p-4 rounded-2xl border border-amber-100 space-y-2">
                    <li className="flex items-center gap-2"><AlertCircle className="w-3 h-3 text-amber-500" /> Sem propagandas externas</li>
                    <li className="flex items-center gap-2"><AlertCircle className="w-3 h-3 text-amber-500" /> Sem números de WhatsApp ou contatos</li>
                    <li className="flex items-center gap-2"><AlertCircle className="w-3 h-3 text-amber-500" /> Boa resolução visual</li>
                    <li className="flex items-center gap-2"><AlertCircle className="w-3 h-3 text-amber-500" /> Produto claramente visível</li>
                  </ul>
                </div>

                {selectedImage.moderation_status === 'rejected' && selectedImage.moderation_reason && (
                  <div className="p-4 bg-red-50 text-red-800 rounded-2xl border border-red-100 text-sm">
                    <strong>Motivo da recusa anterior:</strong> {selectedImage.moderation_reason}
                  </div>
                )}
              </div>

              {/* Botões de Ação */}
              <div className="mt-8 space-y-4 pt-6 border-t border-zinc-200">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Para Reprovar (Informe o motivo)</label>
                  <Input 
                    placeholder="Ex: Imagem com número de telefone na tela..."
                    value={rejectionReason}
                    onChange={e => setRejectionReason(e.target.value)}
                    className="h-12 rounded-[20px] bg-white border-zinc-200 focus:border-red-400 focus:ring-red-400"
                  />
                </div>
                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    disabled={moderateMutation.isPending}
                    className="flex-1 h-14 rounded-[20px] border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold"
                    onClick={() => handleReject(selectedImage.id)}
                  >
                    Reprovar (Viola Política)
                  </Button>
                  <Button 
                    disabled={moderateMutation.isPending}
                    className="flex-1 h-14 rounded-[20px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    onClick={() => handleApprove(selectedImage.id)}
                  >
                    <CheckCircle2 className="w-5 h-5 mr-2" /> Aprovar Imagem
                  </Button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminImageModeration;
