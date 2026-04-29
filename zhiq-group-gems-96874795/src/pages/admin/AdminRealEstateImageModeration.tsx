import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { 
  CheckCircle2, 
  XCircle, 
  Eye, 
  Building2, 
  Clock, 
  User, 
  Loader2,
  Calendar,
  AlertCircle,
  Image as ImageIcon,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Maximize2,
  Phone,
  MessageSquare,
  Globe,
  Camera,
  Search,
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, formatCurrencyBRL } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ModerationMedia {
  id: string;
  listing_id: string;
  owner_user_id: string;
  media_type: string;
  sort_order: number;
  original_storage_path: string;
  public_masked_storage_path: string | null;
  thumb_masked_storage_path: string | null;
  moderation_status: 'pending_ai_analysis' | 'ai_processing' | 'approved_clean' | 'approved_masked' | 'rejected_contact_risk' | 'rejected_low_quality' | 'rejected_invalid_content' | 'ai_error' | 'approved' | 'rejected';
  ai_status: string;
  ai_confidence: number;
  ai_detected_entities: any[];
  decision_reason: string | null;
  ai_agent_name: string;
  reviewed_at: string | null;
  review_source: string;
  created_at: string;
  listing: {
    title: string;
    city: string;
    state: string;
    price_brl: number;
    agent_name: string | null;
    agency_name: string | null;
  };
}

export const AdminRealEstateImageModeration = () => {
  const [items, setItems] = useState<ModerationMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ModerationMedia | null>(null);
  const [currentUrls, setCurrentUrls] = useState<{ original: string | null; masked: string | null }>({ original: null, masked: null });
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    pending: 0,
    approvedToday: 0,
    rejectedToday: 0
  });

  // Rejection reasons & flags
  const [rejectionReason, setRejectionReason] = useState("");
  const [flags, setFlags] = useState({
    has_phone: false,
    has_whatsapp: false,
    has_external_link: false,
    has_watermark: false,
    low_quality: false,
    sensitive_content: false
  });

  const fetchQueue = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('real_estate_media' as any)
        .select(`
          *,
          listing:real_estate_listings (
            title, city, state, price_brl, agent_name, agency_name
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setItems(data as any[] || []);
      
      if (data && data.length > 0 && !selectedItem) {
        setSelectedItem(data[0] as any);
      }

      setStats({
        pending: data?.length || 0,
        approvedToday: 0,
        rejectedToday: 0
      });

    } catch (err: any) {
      toast.error(`Erro ao carregar fila: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  useEffect(() => {
    const resolveUrls = async () => {
      if (!selectedItem) {
        setCurrentUrls({ original: null, masked: null });
        return;
      }
      
      try {
        setIsLoadingUrl(true);
        console.log(`[ADMIN IMAGE AUDIT] Resolvendo URLs para mídia: ${selectedItem.id}`);
        
        const { data: origData, error: origErr } = await supabase.storage
          .from('real-estate-original')
          .createSignedUrl(selectedItem.original_storage_path, 3600);
        
        if (origErr) throw origErr;

        let maskedUrl = null;
        if (selectedItem.public_masked_storage_path) {
          const { data: pubData } = supabase.storage
            .from('real-estate-public')
            .getPublicUrl(selectedItem.public_masked_storage_path);
          maskedUrl = pubData.publicUrl;
        }

        setCurrentUrls({
          original: origData.signedUrl,
          masked: maskedUrl
        });
      } catch (err) {
        console.error("[ADMIN IMAGE AUDIT] Erro ao resolver URLs:", err);
      } finally {
        setIsLoadingUrl(false);
      }
    };
    resolveUrls();
  }, [selectedItem]);

  const handleTriggerAI = async (mediaId: string) => {
    try {
      setProcessingId(mediaId);
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/viagg-tx8-sentinela-visual`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ mediaId }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Falha ao processar com IA');
      }

      toast.success('Análise concluída com sucesso!');
      fetchQueue();
    } catch (err: any) {
      console.error("[AUDIT] Erro ao disparar IA:", err);
      toast.error(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleAction = async (action: 'approve' | 'reject') => {
    if (!selectedItem) return;

    try {
      setProcessingId(selectedItem.id);
      
      const updateData = {
        moderation_status: action === 'approve' ? 'approved' : 'rejected',
        reviewed_at: new Date().toISOString(),
        review_source: 'human_audit',
        decision_reason: action === 'reject' ? 'Rejeitado por auditoria manual.' : 'Aprovado por auditoria manual.'
      };

      const { error } = await supabase
        .from('real_estate_media' as any)
        .update(updateData as any)
        .eq('id', selectedItem.id);

      if (error) throw error;

      toast.success(action === 'approve' ? 'Veredito IA validado!' : 'Veredito IA corrigido (Reprovado).');
      fetchQueue();

    } catch (err: any) {
      toast.error(`Erro na operação: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const getActiveImageUrl = () => {
    if (showOriginal || !currentUrls.masked) {
      return currentUrls.original || "";
    }
    return currentUrls.masked;
  };

  if (loading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-50" />
        <p className="text-sm text-zinc-500 font-medium animate-pulse tracking-wide uppercase">Carregando Fila de Auditoria IA...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] gap-6 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl">
             <ShieldCheck className="w-8 h-8 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight leading-none">Sentinela Visual <span className="text-primary">Strito</span></h1>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1 italic">
              Moderação 100% Automática & Bloqueio Instantâneo de Contatos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
           <div className="bg-zinc-900/40 p-1 px-4 rounded-xl border border-zinc-800/60 flex items-center gap-4 h-12">
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-black text-zinc-500 uppercase leading-none">Processadas IA</span>
                <span className="text-lg font-black text-primary leading-none">{items.length}</span>
              </div>
           </div>
           <Button variant="outline" onClick={fetchQueue} className="bg-zinc-900 border-zinc-800 text-zinc-400 h-10 w-10 p-0 rounded-xl hover:text-white">
              <Clock className="w-4 h-4" />
           </Button>
        </div>
      </header>

      {items.length === 0 ? (
        <Card className="flex-1 bg-zinc-900/40 border-zinc-800/60 border-dashed flex flex-col items-center justify-center gap-6">
           <div className="p-8 rounded-full bg-zinc-950/50 border border-zinc-900 text-zinc-600">
              <ImageIcon className="w-20 h-20 opacity-10" />
           </div>
           <div className="text-center space-y-2">
             <p className="text-zinc-500 font-black uppercase tracking-tighter text-xl">Nenhuma imagem para auditoria</p>
             <p className="text-zinc-600 text-sm font-medium">A IA Sentinela está gerenciando o fluxo perfeitamente.</p>
           </div>
        </Card>
      ) : (
        <div className="flex-1 flex gap-6 overflow-hidden">
          {/* Left Column: List/Queue */}
          <div className="w-80 flex flex-col gap-4">
             <ScrollArea className="flex-1 border border-zinc-800 rounded-2xl bg-zinc-900/40 shadow-inner">
                <div className="p-3 space-y-2">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setSelectedItem(item);
                        setShowOriginal(false);
                      }}
                      className={cn(
                        "w-full text-left p-3 rounded-xl transition-all duration-300 border flex gap-3 group",
                        selectedItem?.id === item.id 
                          ? "bg-primary/10 border-primary/30 shadow-lg shadow-primary/5" 
                          : "bg-zinc-950/40 border-transparent hover:border-zinc-800 hover:bg-zinc-900/60"
                      )}
                    >
                      <div className="w-16 h-16 rounded-lg bg-zinc-900 flex-shrink-0 overflow-hidden border border-zinc-800 ring-1 ring-white/5 relative">
                        <img 
                          src={selectedItem?.id === item.id ? (currentUrls.original || "") : ""} 
                          className="w-full h-full object-cover" 
                          onError={(e) => (e.currentTarget.src = "https://placehold.co/100x100/18181b/52525b?text=...")}
                        />
                        {item.moderation_status?.includes('masked') && (
                          <div className="absolute bottom-1 right-1">
                             <ShieldCheck className="w-3 h-3 text-emerald-500" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 overflow-hidden space-y-1.5 flex flex-col justify-center">
                        <p className={cn(
                          "text-[13px] font-black truncate uppercase tracking-tight",
                          selectedItem?.id === item.id ? "text-primary" : "text-zinc-200"
                        )}>
                          {item.listing?.title || 'Anúncio sem título'}
                        </p>
                         <div className="flex items-center gap-2">
                           <Badge variant="outline" className={cn(
                             "text-[9px] font-black px-1.5 py-0 h-4 border-none uppercase",
                             item.moderation_status?.startsWith('approved') ? "bg-emerald-500/10 text-emerald-400" :
                             item.moderation_status?.startsWith('rejected') ? "bg-red-500/10 text-red-400" :
                             item.moderation_status === 'pending_ai_analysis' ? "bg-blue-500/10 text-blue-400 animate-pulse" :
                             "bg-zinc-800 text-zinc-500"
                           )}>
                             {item.moderation_status?.replace(/_/g, ' ') || 'sem status'}
                           </Badge>
                           <span className="text-[10px] font-bold text-zinc-600 uppercase">
                             {item.ai_confidence ? `${Math.round(item.ai_confidence * 100)}% Match` : 'PENDENTE'}
                           </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
             </ScrollArea>
          </div>

          {/* Center Column: Preview */}
          <div className="flex-1 flex flex-col gap-6">
             <Card className="flex-1 bg-zinc-950 border-zinc-800 rounded-3xl overflow-hidden relative shadow-2xl flex flex-col">
                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-black/80 backdrop-blur-xl p-1.5 rounded-full border border-white/10 shadow-2xl">
                   <Button 
                     size="sm" 
                     variant={!showOriginal ? "default" : "ghost"}
                     onClick={() => setShowOriginal(false)}
                     className={cn("h-10 rounded-full px-6 text-xs font-black uppercase transition-all", !showOriginal && "bg-emerald-600 shadow-xl shadow-emerald-600/20")}
                   >
                     <ShieldCheck className="w-4 h-4 mr-2" />
                     Processada
                   </Button>
                   <Button 
                     size="sm" 
                     variant={showOriginal ? "default" : "ghost"}
                     onClick={() => setShowOriginal(true)}
                     className={cn("h-10 rounded-full px-6 text-xs font-black uppercase transition-all", showOriginal && "bg-red-600 shadow-xl shadow-red-600/20")}
                   >
                     <ImageIcon className="w-4 h-4 mr-2" />
                     Original
                   </Button>
                </div>

                <div className="flex-1 relative flex items-center justify-center p-12 overflow-hidden">
                   {selectedItem && (
                     <div className="relative group w-full h-full flex items-center justify-center">
                       <img 
                         src={getActiveImageUrl()}
                         className="max-w-full max-h-full object-contain rounded-xl shadow-2xl transition-all duration-700 animate-in zoom-in-95"
                         alt="Moderation Preview"
                       />
                     </div>
                   )}
                </div>

                {/* Status Bar & AI Insights */}
                <div className="h-24 bg-black/40 border-t border-white/5 flex items-center justify-between px-8">
                   <div className="flex items-center gap-6">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className={cn("w-4 h-4", selectedItem?.moderation_status?.startsWith('approved') ? "text-emerald-500" : "text-red-500")} />
                          <span className="text-xs font-black text-white uppercase tracking-tight">Veredito IA: {selectedItem?.moderation_status?.replace('_', ' ') || '—'}</span>
                        </div>
                        <p className="text-[10px] text-zinc-500 font-medium max-w-sm italic">"{selectedItem?.decision_reason || 'Pendente de análise profunda pela rede neural.'}"</p>
                      </div>
                   </div>
                   <div className="flex items-center gap-8">
                      <div className="flex flex-col items-end">
                         <span className="text-[9px] font-black text-zinc-600 uppercase">Confiança</span>
                         <span className={cn(
                           "text-xl font-black tabular-nums",
                           (selectedItem?.ai_confidence || 0) > 0.9 ? "text-emerald-500" : "text-orange-500"
                         )}>
                           {Math.round((selectedItem?.ai_confidence || 0) * 100)}%
                         </span>
                      </div>
                      <div className="flex flex-col items-end">
                         <span className="text-[9px] font-black text-zinc-600 uppercase">Entidades</span>
                         <div className="flex gap-1 mt-1">
                            {selectedItem?.ai_detected_entities?.length === 0 ? (
                              <Badge className="bg-zinc-800 text-zinc-500 text-[8px] font-black">CLEAN</Badge>
                            ) : (
                              selectedItem?.ai_detected_entities?.map((e: any, idx: number) => (
                                <Badge key={idx} className="bg-red-500 text-white text-[8px] font-black">{e.type}</Badge>
                              ))
                            )}
                         </div>
                      </div>
                   </div>
                </div>
             </Card>

              <div className="h-24 bg-zinc-900/80 border border-zinc-800 rounded-3xl flex items-center justify-between px-8 shadow-xl">
                <div className="flex items-center gap-3">
                   <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                      <AlertCircle className="w-5 h-5 text-zinc-600" />
                   </div>
                   <div>
                      <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Auditoria Sentinela</p>
                      <p className="text-xs font-bold text-zinc-200">Revisão manual disponível apenas para contestação técnica.</p>
                   </div>
                </div>

                <div className="flex items-center gap-4">
                   {selectedItem?.moderation_status === 'pending_ai_analysis' && (
                     <Button 
                       onClick={() => handleTriggerAI(selectedItem.id)}
                       disabled={!!processingId}
                       className="h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase px-10 shadow-xl"
                     >
                       {processingId === selectedItem.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Analisar com IA Agora"}
                     </Button>
                   )}
                   <Button 
                      variant="outline"
                      className="h-12 border-zinc-800 text-zinc-400 hover:text-white rounded-xl font-bold text-xs uppercase px-6"
                      onClick={() => handleAction('reject')}
                      disabled={!!processingId}
                   >
                      Forçar Rejeição
                   </Button>
                   <Button 
                      className="h-12 bg-white text-black hover:bg-zinc-200 rounded-xl font-black text-xs uppercase px-10 shadow-xl"
                      onClick={() => handleAction('approve')}
                      disabled={!!processingId}
                   >
                      Validar Decisão IA
                   </Button>
                </div>
              </div>
          </div>

          {/* Right Column: Listing Context */}
          <div className="w-72 flex flex-col gap-6">
             <Card className="bg-zinc-900/60 border-zinc-800 rounded-3xl p-6 space-y-6">
                <div className="space-y-2">
                   <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Vínculo do Anúncio</p>
                   <h3 className="text-xl font-black text-white leading-tight underline decoration-primary/40 underline-offset-4 tracking-tighter decoration-4">
                     {selectedItem?.listing?.title || '—'}
                   </h3>
                </div>

                <div className="space-y-4">
                   <div className="flex justify-between items-end border-b border-zinc-800 pb-4">
                      <div>
                        <p className="text-[9px] font-black text-zinc-600 uppercase leading-none">Preço</p>
                        <p className="text-xl font-black text-white tracking-tighter">
                          {formatCurrencyBRL(selectedItem?.listing?.price_brl ?? 0)}
                        </p>
                      </div>
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] font-black uppercase">IMOVEL</Badge>
                   </div>

                   <div className="space-y-4 pt-2">
                      <div className="flex items-start gap-4">
                         <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center flex-shrink-0">
                            <User className="w-4 h-4 text-zinc-500" />
                         </div>
                         <div className="flex-1 overflow-hidden">
                            <p className="text-[9px] font-black text-zinc-600 uppercase leading-none mb-1">Anunciante</p>
                            <p className="text-[13px] font-bold text-zinc-300 truncate">{selectedItem?.listing?.agent_name || selectedItem?.listing?.agency_name || 'N/A'}</p>
                         </div>
                      </div>

                      <div className="flex items-start gap-4">
                         <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center flex-shrink-0">
                            <Building2 className="w-4 h-4 text-zinc-500" />
                         </div>
                         <div className="flex-1 overflow-hidden">
                            <p className="text-[9px] font-black text-zinc-600 uppercase leading-none mb-1">Localização</p>
                            <p className="text-[13px] font-bold text-zinc-300 truncate">{selectedItem?.listing?.city || '—'}, {selectedItem?.listing?.state || '—'}</p>
                         </div>
                      </div>

                      <div className="flex items-start gap-4">
                         <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center flex-shrink-0">
                            <Calendar className="w-4 h-4 text-zinc-500" />
                         </div>
                         <div className="flex-1 overflow-hidden">
                            <p className="text-[9px] font-black text-zinc-600 uppercase leading-none mb-1">Criado em</p>
                            <p className="text-[13px] font-bold text-zinc-300">
                               {selectedItem?.created_at ? format(new Date(selectedItem.created_at), "dd 'de' MMM, yyyy", { locale: ptBR }) : '—'}
                            </p>
                         </div>
                      </div>
                   </div>
                </div>

                <Separator className="bg-zinc-800" />

                <Button variant="ghost" className="w-full h-12 rounded-xl border border-zinc-800 bg-zinc-950/40 text-zinc-500 hover:text-white font-bold text-xs uppercase tracking-widest gap-2">
                   Ver Anúncio Completo
                   <ArrowRight className="w-3 h-3" />
                </Button>
             </Card>

             <Card className="flex-1 bg-gradient-to-br from-red-500/10 to-transparent border-zinc-800 rounded-3xl p-6 flex flex-col gap-4">
                <div className="p-3 bg-zinc-900 w-fit rounded-2xl border border-white/5">
                   <ShieldAlert className="w-6 h-6 text-red-500" />
                </div>
                <div className="space-y-1">
                   <h4 className="text-sm font-black text-white uppercase tracking-tight">Política Estrita Viagg-TX8</h4>
                   <p className="text-[10px] text-zinc-500 font-medium leading-relaxed uppercase italic">
                     Falar com Fulano, Telefone, Email ou QR Code Correspondem ao Bloqueio Instantâneo pela IA.
                   </p>
                </div>
                
                <ul className="space-y-3 pt-4 border-t border-white/5">
                   {[
                     "PROIBIDO: 'Falar com...', 'Tratar com...'",
                     "PROIBIDO: Números de Celular e WhatsApp",
                     "PROIBIDO: Links externos e E-mails",
                     "APROVADO: Apenas imagens limpas e lisas"
                   ].map(rule => (
                     <li key={rule} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span className="text-[10px] font-bold text-zinc-400 uppercase">{rule}</span>
                     </li>
                   ))}
                </ul>
             </Card>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminRealEstateImageModeration;
