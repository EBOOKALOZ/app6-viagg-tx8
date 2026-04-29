import React, { useState, useEffect } from 'react';
import { PropertyImageUpload } from '@/components/real-estate/PropertyImageUpload';
import { ContactProtectionNotice } from '@/components/real-estate/ContactProtectionNotice';
import { CreditPackageSelector } from '@/components/real-estate/CreditPackageSelector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AdvertiserPanelLayout } from '@/components/advertiser/AdvertiserPanelLayout';
import { 
  Home, 
  Save, 
  ArrowLeft, 
  ArrowRight, 
  Loader2, 
  Building2, 
  MapPin, 
  Camera, 
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Info,
  Zap
} from 'lucide-react';
import { cn, formatCurrencyBRL, parseBRLCurrency, formatBrazilianPhone, toE164 } from '@/lib/utils';

export const PropertyForm = () => {
  const { user } = useAuth();
  const { listingId: urlListingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isAdvertiserContext = location.pathname.startsWith('/anunciante');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [isStepReady, setIsStepReady] = useState(false);
  const [listingId, setListingId] = useState<string | null>(urlListingId || null);
  const [selectedPackage, setSelectedPackage] = useState<any>(null);

  // ── Upload Imagens Deferred ──
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  useEffect(() => {
    if (location.state?.initialFiles && pendingFiles.length === 0) {
      setPendingFiles(location.state.initialFiles);
    }
  }, [location.state]);

  // Form States
  const [propertyData, setPropertyData] = useState({
    title: '',
    description: '',
    property_type: 'terreno',
    price_brl: '',
    total_area_m2: '',
    built_area_m2: '',
    bedrooms: '0',
    bathrooms: '0',
    lot_quantity: '1',
  });

  const [locationData, setLocationData] = useState({
    city: 'Blumenau',
    state: 'SC',
    neighborhood: '',
    address_line: '',
    address_number: '',
    public_address_label: '',
  });

  const [contactData, setContactData] = useState({
    contact_name: '',
    whatsapp_e164: '',
    phone_e164: '',
  });

  // Load user data for initial contact name
  useEffect(() => {
    if (user && !contactData.contact_name) {
       setContactData(prev => ({ ...prev, contact_name: user.email?.split('@')[0] || '' }));
    }
  }, [user]);

  // Load existing data if editing
  useEffect(() => {
    async function loadData() {
      if (!listingId || !user) return;
      
      try {
        setLoading(true);
        console.log("[AUDIT] Iniciando carregamento de dados do anúncio:", listingId);
        // Load listing
        const { data: listing, error } = await supabase
          .from('real_estate_listings' as any)
          .select('*, contacts:real_estate_listing_contacts(*)')
          .eq('id', listingId)
          .single();
        
        if (error) throw error;
        if (listing) {
          setPropertyData({
            title: listing.title || '',
            description: listing.description || '',
            property_type: listing.property_type || 'terreno',
            price_brl: listing.price_brl ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(listing.price_brl) : '',
            total_area_m2: listing.total_area_m2 ? (listing.total_area_m2 / 10000).toString() : '',
            built_area_m2: listing.built_area_m2?.toString() || '',
            bedrooms: listing.bedrooms?.toString() || '0',
            bathrooms: listing.bathrooms?.toString() || '0',
            lot_quantity: listing.lot_quantity?.toString() || '',
          });
          
          setLocationData({
            city: listing.city || 'Blumenau',
            state: listing.state || 'SC',
            neighborhood: listing.neighborhood || '',
            address_line: listing.address_line || '',
            address_number: listing.address_number || '',
            public_address_label: listing.public_address_label || '',
          });

          if (listing.contacts && listing.contacts.length > 0) {
            const c = listing.contacts[0];
            setContactData({
              contact_name: c.contact_name || '',
              whatsapp_e164: c.whatsapp_e164 || '',
              phone_e164: c.phone_e164 || '',
            });
          }
        }
      } catch (err: any) {
        console.error("[AUDIT] Erro ao carregar dados:", err);
        toast.error("Não foi possível carregar os dados do anúncio.");
      } finally {
        setLoading(false);
      }
    }
    
    // Only load if it's an explicit edit (listingId exists but was not just created)
    if (urlListingId) {
      console.log("[AUDIT] ETAPA DE FOTOS: PropertyForm montado para EDIT: ", urlListingId);
      loadData().then(() => {
        setIsStepReady(true);
        console.log("[AUDIT] ETAPA DE FOTOS: Pronto para interação.");
      });
    } else {
      console.log("[AUDIT] PropertyForm montado para NOVO ANÚNCIO");
      setIsStepReady(true);
    }
  }, [urlListingId, user]);

  const handleCreateListing = async (shouldMoveStep = true) => {
    if (!user) return;
    try {
      setIsAutosaving(true);
      console.log("[AUDIT] Autosave manual disparado. Gravando dados...");
      
      // 1. Create/Update Listing
      const listingPayload = {
        owner_user_id: user.id,
        title: propertyData.title,
        description: propertyData.property_type === 'lote' 
          ? [
              propertyData.description,
              propertyData.total_area_m2 ? `Dimensões: ${propertyData.total_area_m2}` : '',
              propertyData.lot_quantity && propertyData.lot_quantity !== '1' ? `Quantidade de lotes: ${propertyData.lot_quantity}` : '',
            ].filter(Boolean).join('\n')
          : propertyData.description,
        property_type: propertyData.property_type,
        price_brl: propertyData.price_brl ? parseBRLCurrency(propertyData.price_brl) : 0,
        total_area_m2: propertyData.total_area_m2 
          ? (propertyData.property_type === 'lote' 
              ? null  // Lote usa lot_dimensions (texto)
              : parseFloat(propertyData.total_area_m2) * 10000 || null)
          : null,
        built_area_m2: propertyData.built_area_m2 ? parseFloat(propertyData.built_area_m2) * 10000 : null,
        bedrooms: parseInt(propertyData.bedrooms),
        bathrooms: parseInt(propertyData.bathrooms),
        city: locationData.city,
        state: locationData.state,
        neighborhood: locationData.neighborhood,
        address_line: locationData.address_line,
        address_number: locationData.address_number,
        public_address_label: locationData.public_address_label || `${locationData.neighborhood}, ${locationData.city}/${locationData.state}`,
        visibility_status: 'draft'
      };

      let currentListingId = listingId;

      if (!currentListingId) {
        console.log("[AUDIT] Criando NOVO anúncio...");
        const { data, error } = await supabase
          .from('real_estate_listings' as any)
          .insert(listingPayload as any)
          .select()
          .single();
        if (error) {
          console.error("[AUDIT] Falha ao inserir anúncio:", error);
          throw error;
        }
        currentListingId = (data as any).id;
        console.log("[AUDIT] Novo anúncio criado com ID:", currentListingId);
        setListingId(currentListingId);
      } else {
        console.log("[AUDIT] Atualizando anúncio existente:", currentListingId);
        const { error } = await supabase
          .from('real_estate_listings' as any)
          .update(listingPayload as any)
          .eq('id', currentListingId);
        if (error) {
          console.error("[AUDIT] Falha ao atualizar anúncio:", error);
          throw error;
        }
      }

      // 2. Create/Update Contact (Protected)
      if (currentListingId) {
        console.log("[AUDIT] Sincronizando dados de contato para:", currentListingId);
       // Update/Upsert Contact
      await supabase
        .from('real_estate_listing_contacts' as any)
        .upsert({
          listing_id: currentListingId,
          owner_user_id: user.id,
          contact_name: contactData.contact_name,
          whatsapp_e164: toE164(contactData.whatsapp_e164),
          phone_e164: contactData.phone_e164 ? toE164(contactData.phone_e164) : '',
        } as any);

      // ── Upload de fotos pendentes ──
      if (pendingFiles.length > 0 && currentListingId) {
        toast.info(`Processando ${pendingFiles.length} fotos... Aguarde análise de segurança.`);
        for (const file of pendingFiles) {
          const timestamp = new Date().getTime();
          const fileName = `${timestamp}-${file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9.-]/g, '_')}`;
          const filePath = `${user.id}/${currentListingId}/${fileName}`;

          // Upload para ORIGINAL
          const { error: uploadError } = await supabase.storage
            .from('real-estate-original')
            .upload(filePath, file);

          if (!uploadError) {
             // Criar registro no banco
             const { data: mediaData } = await supabase.from('real_estate_media' as any).insert({
               listing_id: currentListingId,
               owner_user_id: user.id,
               original_storage_path: filePath,
             } as any).select().single();

             if (mediaData) {
                // ── MODERAÇÃO TEMPORARIAMENTE DESATIVADA PARA TESTES ──
                // await supabase.functions.invoke('viagg-tx8-sentinela-visual', {
                //   body: { media_id: (mediaData as any).id }
                // });

                // Auto-approve: copia para public e marca como aprovado
                await supabase.storage.from('real-estate-public').upload(filePath, file, { upsert: true });
                await supabase.from('real_estate_media' as any).update({
                  moderation_status: 'approved',
                  public_masked_storage_path: filePath
                } as any).eq('id', (mediaData as any).id);
              }
          }
        }
        setPendingFiles([]);
      }

      toast.success('Anúncio salvo com sucesso!');
      } else {
        throw new Error("Erro de integridade: Listing ID não gerado.");
      }

      // Log claro para auditoria
      console.log("[AUDIT] Autosave concluído para Listing ID:", currentListingId);
      
      // PERSISTÊNCIA: Atualiza a URL para incluir o ID, evitando perda no F5
      if (!listingId && currentListingId) {
        navigate(`/anunciante/anuncios/editar/imovel/${currentListingId}`, { replace: true });
      }
      
      if (shouldMoveStep) {
        setStep(3); // Move to Images & Credits
      }
    } catch (err: any) {
      console.error("[AUDIT] Erro no Autosave:", err);
      toast.error(`Erro ao salvar: ${err.message}`);
    } finally {
      setIsAutosaving(false);
    }
  };

  const handlePublish = async () => {
    if (!listingId) {
      toast.error('Ocorreu um erro: o anúncio não foi localizado.');
      return;
    }

    if (!selectedPackage) {
      toast.info('Seu anúncio será publicado em modo gratuito. Ative um plano depois para ver os leads.');
    }

    try {
      setLoading(true);
      // In a real flow, this would trigger payment. 
      // For now, we simulate success and mark as published/pending review.
      const { error } = await supabase
        .from('real_estate_listings' as any)
        .update({ visibility_status: 'pending_review' } as any)
        .eq('id', listingId);

      if (error) throw error;

      toast.success('Anúncio enviado para moderação com sucesso!');
      // Invalida a listagem do anunciante para que ela recarregue automaticamente
      queryClient.invalidateQueries({ queryKey: ["advertiser-unified-listings"] });
      navigate(isAdvertiserContext ? '/anunciante/anuncios' : '/mercado');
    } catch (err: any) {
      toast.error(`Erro ao publicar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { id: 1, name: 'Informações', icon: Building2 },
    { id: 2, name: 'Localização', icon: MapPin },
    { id: 3, name: 'Fotos & Créditos', icon: CreditCard },
  ];

  const FormContent = (
    <div className={cn("min-h-screen pb-20", !isAdvertiserContext && "bg-zinc-50/50")}>
      {/* ═══ HEADER PREMIUM ═══ */}
      {!isAdvertiserContext && (
        <div className="bg-white border-b border-zinc-200 sticky top-0 z-30 shadow-sm">
          <div className="container max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="flex flex-col">
                <h1 className="text-xl font-black text-zinc-900 tracking-tight leading-none">Anunciar Imóvel</h1>
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Marketplace Viagg-TX8</span>
              </div>
            </div>

            {/* Progress Steps (Desktop) */}
            <div className="hidden md:flex items-center gap-2">
              {steps.map((s, idx) => (
                <React.Fragment key={s.id}>
                  <div 
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-full transition-all",
                      step === s.id ? "bg-primary text-white shadow-lg shadow-primary/20 scale-105" : "text-zinc-400 bg-zinc-100"
                    )}
                  >
                    <s.icon className="w-4 h-4" />
                    <span className="text-xs font-black uppercase tracking-tight">{s.name}</span>
                  </div>
                  {idx < steps.length - 1 && <div className="w-4 h-px bg-zinc-200" />}
                </React.Fragment>
              ))}
            </div>

            <div className="flex items-center gap-2">
               <ShieldCheck className="w-5 h-5 text-green-500" />
               <span className="text-[10px] font-black text-zinc-400 uppercase hidden sm:block">Proteção Ativa</span>
            </div>
          </div>
        </div>
      )}

      <div className="container max-w-5xl mx-auto px-4 py-10 space-y-10">
        
        {/* Step Indicators (Mobile) */}
        <div className="md:hidden flex justify-between p-2 bg-white rounded-2xl shadow-sm border border-zinc-100 mb-6">
           {steps.map(s => (
             <div key={s.id} className={cn(
               "flex flex-col items-center gap-1 flex-1 transition-all",
               step === s.id ? "text-primary scale-110" : "text-zinc-300"
             )}>
                <s.icon className="w-5 h-5" />
                <span className="text-[8px] font-black uppercase">{s.name}</span>
             </div>
           ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* ═══ MAIN FORM AREA ═══ */}
          <div className="lg:col-span-8 space-y-10">
            
            {/* ── STEP 1: Basic Info ── */}
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <section className="space-y-2">
                   <h2 className="text-3xl font-black text-zinc-900 tracking-tighter">O QUE VOCÊ ESTÁ <span className="text-primary">VENDENDO</span>?</h2>
                   <p className="text-zinc-500 font-medium">Preencha os dados principais do seu anúncio para começar.</p>
                </section>

                <Card className="border-none shadow-2xl rounded-3xl overflow-hidden ring-1 ring-zinc-200">
                  <CardHeader className="bg-zinc-50 border-b border-zinc-100 pb-6">
                     <CardTitle className="text-lg font-black tracking-tight">Informações do Imóvel</CardTitle>
                  </CardHeader>
                  <CardContent className="p-8 space-y-6">
                     <div className="space-y-4">
                        <label className="text-xs font-black text-zinc-400 uppercase tracking-widest">Título do Anúncio</label>
                        <Input 
                          placeholder="Ex: Lindo Sítio com Açude e Pomar em Gaspar" 
                          className="h-14 text-lg border-zinc-200 focus:ring-primary rounded-2xl font-bold text-white bg-[#14171B]"
                          value={propertyData.title}
                          onChange={e => setPropertyData(prev => ({ ...prev, title: e.target.value }))}
                        />
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                           <label className="text-xs font-black text-zinc-400 uppercase tracking-widest">Tipo de Imóvel</label>
                           <Select 
                              value={propertyData.property_type}
                              onValueChange={val => setPropertyData(prev => ({ ...prev, property_type: val }))}
                           >
                              <SelectTrigger className="h-14 border-zinc-200 rounded-2xl font-bold text-white bg-[#14171B]">
                                 <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                 <SelectItem value="terreno" className="font-bold">Terreno</SelectItem>
                                 <SelectItem value="lote" className="font-bold">Lote Urbano</SelectItem>
                                 <SelectItem value="chacara" className="font-bold">Chácara</SelectItem>
                                 <SelectItem value="sitio" className="font-bold">Sítio</SelectItem>
                                 <SelectItem value="fazenda" className="font-bold">Fazenda</SelectItem>
                              </SelectContent>
                           </Select>
                        </div>
                        <div className="space-y-4">
                           <label className="text-xs font-black text-zinc-400 uppercase tracking-widest">Preço Pretendido (R$)</label>
                            <Input 
                              type="text" 
                              placeholder="0,00"
                              className="h-14 border-zinc-200 rounded-2xl font-bold text-lg text-white bg-[#14171B]"
                              value={propertyData.price_brl}
                              onChange={e => {
                                const cleanValue = e.target.value.replace(/\D/g, '');
                                if (cleanValue === '') {
                                  setPropertyData(prev => ({ ...prev, price_brl: '' }));
                                  return;
                                }
                                const numeric = parseInt(cleanValue, 10) / 100;
                                const formatted = new Intl.NumberFormat('pt-BR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                }).format(numeric);
                                setPropertyData(prev => ({ ...prev, price_brl: formatted }));
                              }}
                           />
                        </div>
                     </div>

                     <div className="space-y-4">
                        <label className="text-xs font-black text-zinc-400 uppercase tracking-widest">Descrição Completa</label>
                        <Textarea 
                          placeholder="Descreva detalhes do solo, água, árvores frutíferas, benfeitorias..." 
                          className="min-h-[150px] border-zinc-200 rounded-2xl font-bold text-white bg-[#14171B]"
                          value={propertyData.description}
                          onChange={e => setPropertyData(prev => ({ ...prev, description: e.target.value }))}
                        />
                     </div>

                     <div className="pt-4 border-t border-zinc-100">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div className="space-y-4">
                              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                                {propertyData.property_type === 'lote' ? 'Tamanho do Lote (m²)' : 'Área Total (Hectares)'}
                              </label>
                              <Input 
                                 type={propertyData.property_type === 'lote' ? 'text' : 'number'}
                                 step="0.01"
                                 placeholder={propertyData.property_type === 'lote' ? 'Ex.: 12 x 30' : 'Ex.: 2,5 hectares'}
                                 className="border-zinc-200 rounded-xl font-bold text-white bg-[#14171B]"
                                 value={propertyData.total_area_m2}
                                 onChange={e => setPropertyData(prev => ({ ...prev, total_area_m2: e.target.value }))}
                              />
                           </div>
                           {propertyData.property_type === 'lote' && (
                              <div className="space-y-4 animate-in fade-in slide-in-from-left-2">
                                 <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Quantidade de Lotes</label>
                                 <Input 
                                    type="number" 
                                    min="1"
                                    placeholder="Ex.: 5"
                                    className="border-zinc-200 rounded-xl font-bold text-white bg-[#14171B]"
                                    value={propertyData.lot_quantity}
                                    onChange={e => setPropertyData(prev => ({ ...prev, lot_quantity: e.target.value }))}
                                 />
                              </div>
                           )}
                        </div>
                     </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end pt-6">
                   <Button 
                    onClick={() => setStep(2)}
                    className="h-14 px-10 rounded-2xl font-black text-lg shadow-xl shadow-primary/20 group gap-2"
                   >
                     PRÓXIMO PASSO
                     <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                   </Button>
                </div>
              </div>
            )}

            {/* ── STEP 2: Location & Contact ── */}
            {step === 2 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <section className="space-y-2">
                   <h2 className="text-3xl font-black text-zinc-900 tracking-tighter">ONDE FICA O <span className="text-primary">IMÓVEL</span>?</h2>
                   <p className="text-zinc-500 font-medium">Defina a localização e seus dados de contato protegidos.</p>
                </section>

                <div className="grid grid-cols-1 gap-8">
                   <Card className="border-none shadow-2xl rounded-3xl overflow-hidden ring-1 ring-zinc-200">
                      <CardHeader className="bg-zinc-50 border-b border-zinc-100 pb-6">
                        <CardTitle className="text-lg font-black tracking-tight flex items-center gap-2">
                           <MapPin className="w-5 h-5 text-primary" />
                           Endereço e Localização
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-8 space-y-6">
                         <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                            <div className="space-y-4">
                               <label className="text-xs font-black text-zinc-400 uppercase tracking-widest">Estado</label>
                               <Input value={locationData.state} readOnly className="h-14 border-zinc-200 rounded-2xl font-bold text-white bg-[#14171B]" />
                            </div>
                            <div className="space-y-4">
                               <label className="text-xs font-black text-zinc-400 uppercase tracking-widest">Cidade</label>
                               <Input 
                                 value={locationData.city} 
                                 onChange={e => setLocationData(prev => ({ ...prev, city: e.target.value }))}
                                 className="h-14 border-zinc-200 rounded-2xl font-bold text-white bg-[#14171B]" 
                               />
                            </div>
                            <div className="space-y-4 col-span-2 md:col-span-1 text-xs">
                               <label className="text-xs font-black text-zinc-400 uppercase tracking-widest">Bairro/Região</label>
                               <Input 
                                 placeholder="Ex: Zona Norte"
                                 value={locationData.neighborhood}
                                 onChange={e => setLocationData(prev => ({ ...prev, neighborhood: e.target.value }))}
                                 className="h-14 border-zinc-200 rounded-2xl font-bold text-white bg-[#14171B]" 
                               />
                            </div>
                         </div>

                         <div className="space-y-4">
                            <div className="flex items-center justify-between">
                               <label className="text-xs font-black text-zinc-400 uppercase tracking-widest">Como aparecerá no Mercado (Rótulo)</label>
                               <Info className="w-4 h-4 text-zinc-300" />
                            </div>
                            <Input 
                              placeholder="Ex: Próximo à Ponte de Ferro, Blumenau/SC"
                              value={locationData.public_address_label}
                              onChange={e => setLocationData(prev => ({ ...prev, public_address_label: e.target.value }))}
                              className="h-14 border-zinc-200 rounded-2xl font-bold italic text-white bg-[#14171B]" 
                            />
                            <p className="text-[10px] text-zinc-400 font-bold uppercase">Este é o único dado de endereço que o público verá antes da liberação.</p>
                         </div>
                      </CardContent>
                   </Card>

                   <Card className="border-none shadow-2xl rounded-3xl overflow-hidden ring-1 ring-zinc-200">
                      <CardHeader className="bg-zinc-50 border-b border-zinc-100 pb-6">
                        <CardTitle className="text-lg font-black tracking-tight flex items-center gap-2">
                           <ShieldCheck className="w-5 h-5 text-green-600" />
                           Contato Protegido
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-8 space-y-6">
                         <div className="space-y-4">
                            <label className="text-xs font-black text-zinc-400 uppercase tracking-widest">Nome do Anunciante</label>
                            <Input 
                              placeholder="Seu nome ou Imobiliária"
                              value={contactData.contact_name}
                              onChange={e => setContactData(prev => ({ ...prev, contact_name: e.target.value }))}
                              className="h-14 border-zinc-200 rounded-2xl font-bold text-white bg-[#14171B]" 
                            />
                         </div>

                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                               <label className="text-xs font-black text-zinc-400 uppercase tracking-widest">WhatsApp (E164)</label>
                               <Input 
                                 placeholder="(XX) XXXXX-XXXX"
                                 value={contactData.whatsapp_e164}
                                 onChange={e => setContactData(prev => ({ ...prev, whatsapp_e164: formatBrazilianPhone(e.target.value) }))}
                                 className="h-14 border-zinc-200 rounded-2xl font-bold text-white bg-[#14171B]" 
                               />
                            </div>
                            <div className="space-y-4">
                               <label className="text-xs font-black text-zinc-400 uppercase tracking-widest">Telefone Alternativo</label>
                               <Input 
                                 placeholder="(XX) XXXXX-XXXX"
                                 value={contactData.phone_e164}
                                 onChange={e => setContactData(prev => ({ ...prev, phone_e164: formatBrazilianPhone(e.target.value) }))}
                                 className="h-14 border-zinc-200 rounded-2xl font-bold text-white bg-[#14171B]"
                               />
                            </div>
                         </div>
                      </CardContent>
                   </Card>
                </div>

                <div className="flex justify-between pt-6">
                   <Button variant="ghost" className="font-bold h-14" onClick={() => setStep(1)}>
                      VOLTAR
                   </Button>
                   <Button 
                    onClick={() => handleCreateListing()}
                    disabled={isAutosaving}
                    className="h-14 px-10 rounded-2xl font-black text-lg shadow-xl shadow-primary/20 group gap-2"
                   >
                     {isAutosaving ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                       <>
                         SALVAR E CONTINUAR
                         <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                       </>
                     )}
                   </Button>
                </div>
              </div>
            )}

            {/* ── STEP 3: Images & Credits ── */}
            {step === 3 && (
              <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <section className="space-y-2">
                   <h2 className="text-3xl font-black text-zinc-900 tracking-tighter">FOTOS E <span className="text-primary">ATIVAÇÃO</span></h2>
                   <p className="text-zinc-500 font-medium">Suba suas fotos e finalize seu anúncio.</p>
                </section>

                <div className="space-y-8">
                  {(listingId || pendingFiles.length >= 0) && (
                    <Card className="border-none shadow-2xl rounded-[40px] overflow-hidden bg-white ring-1 ring-zinc-100">
                      <PropertyImageUpload
                        listingId={listingId || undefined}
                        onFilesSelected={setPendingFiles}
                        propertyType={propertyData.property_type}
                      />
                    </Card>
                  )}
                </div>

                <div className="flex flex-col items-end gap-6 pt-6">
                   <div className="max-w-md text-right">
                      <p className="text-xs font-bold text-zinc-500 leading-relaxed uppercase tracking-tight">
                        Seu anúncio será divulgado, mas qualquer contato ou informações de interessados você não terá acesso, pois necessita de um plano de ativação.
                      </p>
                   </div>
                   
                   <div className="flex items-center justify-between w-full">
                      <Button variant="ghost" className="font-bold h-14 px-8 rounded-2xl" onClick={() => setStep(2)}>
                         VOLTAR
                      </Button>
                      <Button 
                       onClick={handlePublish}
                       disabled={loading}
                       className="h-14 px-12 rounded-2xl font-black text-xl shadow-xl shadow-primary/20 group gap-3 bg-zinc-900 hover:bg-black text-white transition-all active:scale-95"
                      >
                        {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                          <>
                            CONCLUIR E PUBLICAR
                            <CheckCircle2 className="w-6 h-6 text-green-400" />
                          </>
                        )}
                      </Button>
                   </div>
                </div>
              </div>
            )}
            
          </div>

          {/* ═══ SIDEBAR: PROTECTION & TIPS ═══ */}
          <div className="lg:col-span-4 space-y-8">
            <div className="sticky top-28 space-y-8">
              <Card className="bg-gradient-to-br from-zinc-900 to-zinc-800 border-none shadow-2xl rounded-3xl text-white overflow-hidden p-8 space-y-6">
                <div className="p-1 border border-primary/30 rounded-full w-fit bg-primary/10">
                   <ShieldCheck className="w-8 h-8 text-primary shadow-xl shadow-primary/50" />
                </div>
                <div className="space-y-4">
                  <h3 className="text-2xl font-black tracking-tighter leading-tight">TECNOLOGIA DE PROTEÇÃO VIAGG IA</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed font-medium">
                    Nossa plataforma utiliza Inteligência Artificial para proteger sua privacidade e monetização em tempo real.
                  </p>
                </div>
                <div className="space-y-4 pt-4 border-t border-white/5">
                   <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                      <p className="text-xs text-zinc-300 font-bold uppercase">MASCARAMENTO DE CONTATOS EM FOTOS</p>
                   </div>
                   <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                      <p className="text-xs text-zinc-300 font-bold uppercase">OCULTAÇÃO DE TELEFONE PÚBLICO</p>
                   </div>
                   <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                      <p className="text-xs text-zinc-300 font-bold uppercase">LIBERAÇÃO CONTROLADA POR CRÉDITOS</p>
                   </div>
                </div>
              </Card>

              <ContactProtectionNotice />

              <div className="p-6 bg-white rounded-3xl border border-zinc-100 shadow-xl space-y-4">
                 <div className="flex items-center gap-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                       <Zap className="w-4 h-4 text-primary fill-primary" />
                    </div>
                    <span className="text-xs font-black text-zinc-900 uppercase">Dicas de Sucesso</span>
                 </div>
                 <ul className="space-y-3">
                    <li className="text-[11px] text-zinc-600 font-medium flex gap-2">
                       <span className="text-primary font-black">•</span>
                       Use títulos descritivos e claros.
                    </li>
                    <li className="text-[11px] text-zinc-600 font-medium flex gap-2">
                       <span className="text-primary font-black">•</span>
                       Informe a área em hectares para filtrar curiosos.
                    </li>
                    <li className="text-[11px] text-zinc-600 font-medium flex gap-2">
                       <span className="text-primary font-black">•</span>
                       Fotos de boa qualidade agilizam a venda.
                    </li>
                 </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );


  // Quando acessado via rota /anunciante/..., o layout já é fornecido pelo router.
  // Só envolve com AdvertiserPanelLayout quando acessado fora do contexto anunciante
  // (ex: /merchant/imoveis/novo).
  if (!isAdvertiserContext) {
    return <AdvertiserPanelLayout>{FormContent}</AdvertiserPanelLayout>;
  }

  return FormContent;
};

export default PropertyForm;
