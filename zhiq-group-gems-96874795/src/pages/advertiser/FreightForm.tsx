import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { moderatedUpload } from '@/lib/moderation/moderatedUpload';
import { moderatedText } from '@/lib/moderation/moderatedText';
import { toast } from 'sonner';
import {
  Truck,
  ArrowLeft,
  CheckCircle2,
  Check,
  Camera,
  Coins,
  Phone,
  MessageCircle,
  Image as ImageIcon,
  Sparkles,
  Loader2,
  Star,
} from 'lucide-react';
import { cn, toE164, formatBrazilianPhone } from '@/lib/utils';
import { FreightImageUpload } from '@/components/freight/FreightImageUpload';
import { generateListingDescription } from '@/lib/ai/generateDescription';
import { FREIGHT_VEHICLE_TYPES } from '@/lib/freight/vehicleTypes';

const UF_LIST = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const INPUT_CLS = "h-12 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-blue-500/40";

const InputLabel = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="text-sm font-semibold text-zinc-700 flex items-center gap-1">
    {children}
    {required && <span className="text-red-500">*</span>}
  </label>
);

const Section = ({ step, title, description, icon: Icon, done, children }: {
  step: number; title: string; description?: string; icon: React.ComponentType<{ className?: string }>; done?: boolean; children: React.ReactNode;
}) => (
  <section id={`section-${step}`} className="scroll-mt-24">
    <div className="mb-4 flex items-start gap-3">
      <div className={cn(
        "h-10 w-10 shrink-0 rounded-full flex items-center justify-center font-black text-sm border-2 transition-all",
        done ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-zinc-200 text-zinc-600"
      )}>
        {done ? <Check className="h-4 w-4" /> : String(step).padStart(2, '0')}
      </div>
      <div className="flex-1 pt-1">
        <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
          <Icon className="h-5 w-5 text-blue-600" />
          {title}
        </h2>
        {description && <p className="text-sm text-zinc-500 mt-0.5">{description}</p>}
      </div>
    </div>
    <Card className="border border-zinc-200 bg-white shadow-sm rounded-xl overflow-hidden">
      <CardContent className="p-5 sm:p-7 space-y-5">{children}</CardContent>
    </Card>
  </section>
);

export const FreightForm = () => {
  const { user } = useAuth();
  const { listingId: urlListingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [listingId, setListingId] = useState<string | null>(urlListingId || null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isFeatured, setIsFeatured] = useState(false);
  const [featuring, setFeaturing] = useState(false);

  const [freightData, setFreightData] = useState({
    title: '',
    description: '',
    vehicle_type: '',
    price_label: '',
    price_per_km: '',
    coverage_routes: '',
  });

  // Rotas atendidas = até 3 cidades de destino, exibidas como campos separados
  // mas guardadas como texto único (coverage_routes) separado por vírgula.
  const [routeCities, setRouteCities] = useState<string[]>(['', '', '']);
  const setRouteCity = (idx: number, value: string) => {
    setRouteCities(prev => prev.map((c, i) => (i === idx ? value : c)));
  };

  const [generatingDesc, setGeneratingDesc] = useState(false);
  const handleGenerateDescription = async () => {
    if (!freightData.title.trim()) {
      toast.error('Preencha o título antes de gerar a descrição com IA.');
      return;
    }
    setGeneratingDesc(true);
    try {
      const desc = await generateListingDescription('servico', {
        'Título': freightData.title,
        'Tipo de Veículo': freightData.vehicle_type,
        'Valor': freightData.price_label,
      });
      setFreightData(prev => ({ ...prev, description: desc }));
      toast.success('Descrição gerada com IA!');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao gerar descrição com IA.');
    } finally {
      setGeneratingDesc(false);
    }
  };

  const [locationData, setLocationData] = useState({
    city: 'Blumenau',
    state: 'SC',
    neighborhood: '',
    public_address_label: '',
  });

  const [contactData, setContactData] = useState({
    contact_name: '',
    whatsapp_e164: '',
    phone_e164: '',
    email: '',
  });

  useEffect(() => {
    if (user && !contactData.contact_name) {
      setContactData(prev => ({ ...prev, contact_name: user.email?.split('@')[0] || '' }));
    }
  }, [user]);

  // Pré-seleciona o tipo de veículo vindo do link (?tipo=Van, etc.).
  useEffect(() => {
    const tipo = new URLSearchParams(location.search).get('tipo');
    if (tipo && FREIGHT_VEHICLE_TYPES.some(v => v.value === tipo)) {
      setFreightData(prev => ({ ...prev, vehicle_type: tipo }));
    }
  }, [location.search]);

  // Carrega dados existentes (modo edição).
  useEffect(() => {
    async function loadData() {
      if (!urlListingId || !user) return;
      try {
        setLoading(true);
        const { data: listing, error } = await supabase
          .from('freight_listings' as any)
          .select('*, contacts:freight_listing_contacts(*)')
          .eq('id', urlListingId)
          .single();
        if (error) throw error;
        const l = listing as any;
        if (l) {
          setFreightData({
            title: l.title || '',
            description: l.description || '',
            vehicle_type: l.vehicle_type || '',
            price_label: l.price_label || '',
            price_per_km: l.price_per_km != null ? String(l.price_per_km) : '',
            coverage_routes: l.coverage_routes || '',
          });
          const loadedCities = String(l.coverage_routes || '').split(',').map((c: string) => c.trim()).filter(Boolean);
          setRouteCities([loadedCities[0] || '', loadedCities[1] || '', loadedCities[2] || '']);
          setIsFeatured(!!l.is_featured);
          setLocationData({
            city: l.city || 'Blumenau',
            state: l.state || 'SC',
            neighborhood: l.neighborhood || '',
            public_address_label: l.public_address_label || '',
          });
          if (l.contacts && l.contacts.length > 0) {
            const c = l.contacts[0];
            setContactData({
              contact_name: c.contact_name || '',
              whatsapp_e164: c.whatsapp_e164 || '',
              phone_e164: c.phone_e164 || '',
              email: c.email || '',
            });
          }
        }
      } catch (err: any) {
        console.error('[FreightForm] erro ao carregar:', err);
        toast.error('Não foi possível carregar os dados do frete.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [urlListingId, user]);

  const completion = useMemo(() => ({
    dados: Boolean(freightData.title.trim() && freightData.vehicle_type),
    fotos: pendingFiles.length > 0 || !!urlListingId,
    descricao: freightData.description.trim().length > 0,
    local: Boolean(locationData.city.trim() && locationData.state.trim()),
    contato: Boolean(contactData.contact_name.trim() && contactData.whatsapp_e164.trim() && contactData.email.trim()),
  }), [freightData, pendingFiles, urlListingId, locationData, contactData]);

  const checklist = [
    { key: 'dados', label: 'Dados do frete', step: 1 },
    { key: 'fotos', label: 'Pelo menos 1 foto', step: 2 },
    { key: 'descricao', label: 'Descrição', step: 3 },
    { key: 'local', label: 'Localização', step: 4 },
    { key: 'contato', label: 'Contatos', step: 4 },
  ];
  const completedCount = Object.values(completion).filter(Boolean).length;
  const totalChecks = Object.keys(completion).length;
  const progressPct = Math.round((completedCount / totalChecks) * 100);

  const canSubmit = urlListingId
    ? completion.dados
    : completion.dados && completion.local && completion.contato;

  const handleFeature = async () => {
    if (!listingId) return;
    setFeaturing(true);
    try {
      const { data, error } = await supabase.rpc('feature_freight_listing' as any, { p_listing_id: listingId });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) {
        if (result?.buy_credits_cta) {
          toast.error(`Créditos insuficientes (precisa de ${result.required}, tem ${result.available}).`);
          navigate('/anunciante/fretes/creditos');
          return;
        }
        throw new Error(result?.error || 'Falha ao destacar anúncio.');
      }
      setIsFeatured(true);
      toast.success(`Anúncio destacado por 7 dias! (-${result.credits_charged} créditos)`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao destacar anúncio.');
    } finally {
      setFeaturing(false);
    }
  };

  const handlePublish = async () => {
    if (!user) return;
    if (!freightData.title.trim()) { toast.error('Informe o título do anúncio.'); return; }
    if (!locationData.city.trim() || !locationData.state.trim()) { toast.error('Informe cidade e estado.'); return; }
    if (!contactData.email.trim()) { toast.error('Informe um e-mail de contato.'); return; }

    try {
      setLoading(true);

      const textMod = await moderatedText({
        title: freightData.title.trim(),
        description: freightData.description || '',
        category: 'freight',
        price: freightData.price_per_km ? Number(freightData.price_per_km) : 0,
        listingId: listingId ?? undefined,
      });

      if (textMod.status === 'blocked') {
        toast.error(`Texto bloqueado pela RIDV: ${textMod.reason}`);
        setLoading(false);
        return;
      }

      const isTextApproved = textMod.status === 'approved';

      const payload = {
        owner_user_id: user.id,
        title: freightData.title.trim(),
        description: freightData.description || null,
        vehicle_type: freightData.vehicle_type,
        price_label: freightData.price_label || null,
        price_per_km: freightData.price_per_km ? Number(freightData.price_per_km) : null,
        coverage_routes: routeCities.map(c => c.trim()).filter(Boolean).join(', ') || null,
        city: locationData.city.trim(),
        state: locationData.state.trim(),
        neighborhood: locationData.neighborhood || null,
        public_address_label: locationData.public_address_label
          || `${locationData.neighborhood ? locationData.neighborhood + ', ' : ''}${locationData.city}/${locationData.state}`,
        visibility_status: 'published',
        published_at: new Date().toISOString(),
        moderation_status: isTextApproved ? 'approved' : 'pending_ai_analysis',
        ai_status: isTextApproved ? 'approved' : 'queued',
        moderation_reason: textMod.reason,
      };

      let currentListingId = listingId;

      if (!currentListingId) {
        const { data, error } = await supabase
          .from('freight_listings' as any)
          .insert(payload as any)
          .select()
          .single();
        if (error) throw error;
        currentListingId = (data as any).id;
        setListingId(currentListingId);
      } else {
        const { error } = await supabase
          .from('freight_listings' as any)
          .update(payload as any)
          .eq('id', currentListingId);
        if (error) throw error;
      }

      await supabase
        .from('freight_listing_contacts' as any)
        .upsert({
          listing_id: currentListingId,
          owner_user_id: user.id,
          contact_name: contactData.contact_name,
          email: contactData.email || null,
          whatsapp_e164: contactData.whatsapp_e164 ? toE164(contactData.whatsapp_e164) : '',
          phone_e164: contactData.phone_e164 ? toE164(contactData.phone_e164) : '',
        } as any, { onConflict: 'listing_id' });

      if (pendingFiles.length > 0 && currentListingId) {
        toast.info(`Enviando ${pendingFiles.length} foto(s)...`);
        const { processForUpload } = await import('@/lib/imageCompressor');
        let failures = 0;
        for (const file of pendingFiles) {
          const timestamp = new Date().getTime();
          const sanitizedName = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.]/g, '_');
          const fileName = `${timestamp}-${sanitizedName.replace(/\.[^/.]+$/, '')}.jpg`;
          const filePath = `${user.id}/${currentListingId}/${fileName}`;

          let uploadBlob: Blob;
          try {
            const processed = await processForUpload(file, { maxDimension: 1600, targetSizeBytes: 200 * 1024 });
            uploadBlob = processed.blob;
          } catch (convErr: any) {
            console.error('[FreightForm] Falha ao comprimir imagem:', convErr);
            toast.error(`Não foi possível processar a foto "${file.name}".`);
            failures++;
            continue;
          }

          let modRes;
          try {
            modRes = await moderatedUpload(uploadBlob, {
              fileName: file.name,
              mime: 'image/jpeg',
              listingId: currentListingId,
              category: 'freight',
              targetBucket: 'freight-public',
            });
          } catch (modErr: any) {
            console.error('[FreightForm] Falha na moderação RIDV da foto:', modErr);
            toast.error(`Falha na análise da foto "${file.name}": ${modErr.message}`);
            failures++;
            continue;
          }

          if (modRes.status === 'blocked') {
            toast.error(`Foto "${file.name}" bloqueada pela IA RIDV: ${modRes.reason}`);
            failures++;
            continue;
          }

          const finalPath = modRes.storagePath || filePath;
          const finalStatus = modRes.status === 'approved' ? 'approved' : 'pending_ai_analysis';

          const { error: dbErr } = await supabase.from('freight_media' as any).insert({
            listing_id: currentListingId,
            owner_user_id: user.id,
            original_storage_path: finalPath,
            public_masked_storage_path: modRes.status === 'approved' ? finalPath : null,
            moderation_status: finalStatus,
          } as any);

          if (dbErr) {
            console.error('[FreightForm] Falha ao registrar mídia:', dbErr);
            toast.error(`Falha ao registrar a foto "${file.name}".`);
            failures++;
            continue;
          }
        }
        if (failures > 0) {
          toast.error(`${failures} foto(s) não foram enviadas. Tente adicioná-las novamente em "Editar anúncio".`);
        }
        setPendingFiles([]);
      }

      toast.success('Frete publicado com sucesso! 🚚');
      queryClient.invalidateQueries({ queryKey: ['fretes-meus-anuncios'] });
      queryClient.invalidateQueries({ queryKey: ['fretes-painel-lista'] });
      navigate('/anunciante/fretes/meus-anuncios');
    } catch (err: any) {
      console.error('[FreightForm] erro ao publicar:', err);
      toast.error(`Erro ao publicar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#EBEBEB] pb-32">
      <div className="sticky top-0 z-30 bg-[#FFE600] border-b border-yellow-300 shadow-sm">
        <div className="container max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-zinc-900 font-bold hover:opacity-70 transition-opacity">
            <ArrowLeft className="h-5 w-5" />
            <span className="hidden sm:inline text-sm">Voltar</span>
          </button>
          <div className="flex items-center gap-2 text-zinc-900">
            <Truck className="h-5 w-5" />
            <span className="font-black text-sm sm:text-base">{urlListingId ? 'Editar frete' : 'Anunciar frete'}</span>
          </div>
          <div className="text-xs font-bold text-zinc-700">{progressPct}% concluído</div>
        </div>
        <div className="h-1 bg-yellow-300">
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="container max-w-6xl mx-auto px-4 py-6 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">

            <Section step={1} title="Dados do frete" description="Conte o que você está anunciando." icon={Truck} done={completion.dados}>
              <div className="space-y-2">
                <InputLabel required>Título do anúncio</InputLabel>
                <Input
                  placeholder="Ex.: Frete e Mudança - Van Própria"
                  className={INPUT_CLS}
                  value={freightData.title}
                  onChange={(e) => setFreightData(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <InputLabel required>Tipo de veículo</InputLabel>
                <Select value={freightData.vehicle_type} onValueChange={(v) => setFreightData(prev => ({ ...prev, vehicle_type: v }))}>
                  <SelectTrigger className={INPUT_CLS}><SelectValue placeholder="Selecionar tipo de veículo..." /></SelectTrigger>
                  <SelectContent className="bg-white">
                    {FREIGHT_VEHICLE_TYPES.map((v) => (
                      <SelectItem key={v.value} value={v.value} className="!text-zinc-900 font-medium">{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <InputLabel>Rotas atendidas (opcional)</InputLabel>
                <p className="text-xs text-zinc-500">Informe até 3 cidades de destino que você atende.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {routeCities.map((city, idx) => (
                    <Input
                      key={idx}
                      placeholder={`Cidade ${idx + 1}`}
                      className={INPUT_CLS}
                      value={city}
                      onChange={(e) => setRouteCity(idx, e.target.value)}
                    />
                  ))}
                </div>
              </div>
            </Section>

            <Section step={2} title="Adicione fotos de seu veículo" description="A primeira foto será a capa. Use imagens nítidas e reais." icon={Camera} done={completion.fotos}>
              <FreightImageUpload
                listingId={urlListingId || undefined}
                onFilesSelected={(files) => setPendingFiles(files)}
              />
              <div className="flex items-start gap-2 text-xs text-zinc-500 bg-blue-50 border border-blue-100 rounded-lg p-3">
                <ImageIcon className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div><strong className="text-zinc-700">Dica:</strong> anúncios com mais fotos recebem mais contatos. Mínimo: 1 foto.</div>
              </div>
            </Section>

            <Section step={3} title="Descrição e valor" description="Detalhe o que você oferece e o valor (opcional)." icon={MessageCircle} done={completion.descricao}>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <InputLabel>Sobre o frete</InputLabel>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleGenerateDescription}
                    disabled={generatingDesc}
                    className="rounded-xl gap-1.5 text-xs h-8 shrink-0 bg-orange-500 hover:bg-orange-600 text-white border-0"
                  >
                    {generatingDesc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {generatingDesc ? 'Gerando...' : 'Gerar com IA'}
                  </Button>
                </div>
                <Textarea
                  placeholder="Descreva sua área de atuação, capacidade de carga, diferenciais..."
                  className="min-h-[150px] resize-y bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-blue-500/40 text-sm"
                  value={freightData.description}
                  onChange={(e) => setFreightData(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                <div className="space-y-2">
                  <InputLabel>
                    <Coins className="h-3.5 w-3.5 inline mr-1" /> Valor (opcional)
                  </InputLabel>
                  <Input
                    placeholder="Ex.: A partir de R$ 150 ou Consulte"
                    className={INPUT_CLS}
                    value={freightData.price_label}
                    onChange={(e) => setFreightData(prev => ({ ...prev, price_label: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <InputLabel>Preço por km (opcional)</InputLabel>
                  <Input
                    placeholder="Ex.: 3.50"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    className={INPUT_CLS}
                    value={freightData.price_per_km}
                    onChange={(e) => setFreightData(prev => ({ ...prev, price_per_km: e.target.value }))}
                  />
                </div>
              </div>
            </Section>

            <Section step={4} title="Localização e contato" description="De onde você atende e como falar com você." icon={Phone} done={completion.local && completion.contato}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <InputLabel required>Cidade</InputLabel>
                  <Input placeholder="Cidade" className={INPUT_CLS} value={locationData.city} onChange={(e) => setLocationData(prev => ({ ...prev, city: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <InputLabel required>Estado (UF)</InputLabel>
                  <Select value={locationData.state} onValueChange={(v) => setLocationData(prev => ({ ...prev, state: v }))}>
                    <SelectTrigger className={INPUT_CLS}><SelectValue placeholder="UF" /></SelectTrigger>
                    <SelectContent className="max-h-72 bg-white">
                      {UF_LIST.map((uf) => (
                        <SelectItem key={uf} value={uf} className="!text-zinc-900 font-medium">{uf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <InputLabel>Bairro</InputLabel>
                <Input placeholder="Ex.: Centro" className={INPUT_CLS} value={locationData.neighborhood} onChange={(e) => setLocationData(prev => ({ ...prev, neighborhood: e.target.value }))} />
              </div>

              <div className="pt-4 border-t border-zinc-100 space-y-4">
                <div className="space-y-2">
                  <InputLabel required>Nome do responsável</InputLabel>
                  <Input placeholder="Seu nome" className={INPUT_CLS} value={contactData.contact_name} onChange={(e) => setContactData(prev => ({ ...prev, contact_name: e.target.value }))} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <InputLabel required>WhatsApp</InputLabel>
                    <Input placeholder="(47) 99999-9999" inputMode="tel" className={INPUT_CLS} value={contactData.whatsapp_e164} onChange={(e) => setContactData(prev => ({ ...prev, whatsapp_e164: formatBrazilianPhone(e.target.value) }))} />
                  </div>
                  <div className="space-y-2">
                    <InputLabel>Telefone (opcional)</InputLabel>
                    <Input placeholder="(47) 99999-9999" inputMode="tel" className={INPUT_CLS} value={contactData.phone_e164} onChange={(e) => setContactData(prev => ({ ...prev, phone_e164: formatBrazilianPhone(e.target.value) }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <InputLabel required>E-mail</InputLabel>
                  <Input placeholder="seu@email.com" type="email" className={INPUT_CLS} value={contactData.email} onChange={(e) => setContactData(prev => ({ ...prev, email: e.target.value }))} />
                </div>
              </div>
            </Section>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
              <Button variant="outline" onClick={() => navigate(-1)} className="h-12 px-6 border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 order-2 sm:order-1">
                Cancelar
              </Button>
              <Button
                disabled={!canSubmit || loading}
                onClick={handlePublish}
                className={cn(
                  "h-12 px-8 font-bold text-base order-1 sm:order-2 shadow-md",
                  canSubmit ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-zinc-400 text-white cursor-not-allowed hover:bg-zinc-400 opacity-80"
                )}
              >
                {loading ? 'Publicando...' : (urlListingId ? 'Salvar alterações' : 'Publicar frete')}
                {!loading && <CheckCircle2 className="h-5 w-5 ml-2" />}
              </Button>
            </div>
          </div>

          <aside className="lg:col-span-4">
            <div className="lg:sticky lg:top-24 space-y-4">
              <Card className="border border-zinc-200 bg-white shadow-sm rounded-xl">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-zinc-900 text-sm">Progresso do anúncio</h3>
                    <span className="text-xs font-bold text-emerald-600">{completedCount}/{totalChecks}</span>
                  </div>
                  <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
                  </div>
                  <ul className="space-y-1.5 pt-2">
                    {checklist.map(item => (
                      <li key={item.key}>
                        <button
                          type="button"
                          onClick={() => document.getElementById(`section-${item.step}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                          className="w-full flex items-center gap-2 text-xs text-left hover:text-zinc-900 transition-colors"
                        >
                          <div className={cn("h-4 w-4 shrink-0 rounded-full flex items-center justify-center", (completion as any)[item.key] ? "bg-emerald-500 text-white" : "bg-zinc-200")}>
                            {(completion as any)[item.key] && <Check className="h-2.5 w-2.5" />}
                          </div>
                          <span className={(completion as any)[item.key] ? 'text-zinc-500 line-through' : 'text-zinc-700 font-medium'}>
                            {item.label}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {urlListingId && (
                <Card className={cn("border shadow-sm rounded-xl", isFeatured ? "border-amber-200 bg-amber-50" : "border-zinc-200 bg-white")}>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-2 text-amber-600">
                      <Star className={cn("h-4 w-4", isFeatured && "fill-current")} />
                      <h3 className="font-bold text-sm text-zinc-900">Destacar anúncio</h3>
                    </div>
                    {isFeatured ? (
                      <p className="text-xs text-amber-700">
                        ⭐ Este anúncio está em destaque na vitrine por 7 dias.
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-zinc-500">
                          Apareça primeiro na vitrine de Fretes por 7 dias (consome créditos).
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleFeature}
                          disabled={featuring}
                          className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold gap-1.5"
                        >
                          {featuring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5" />}
                          Destacar este anúncio
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card className="border border-emerald-100 bg-emerald-50 shadow-sm rounded-xl">
                <CardContent className="p-5 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <Sparkles className="h-4 w-4" />
                    <h3 className="font-bold text-sm">Anúncio Grátis</h3>
                  </div>
                  <p className="text-xs text-emerald-700/80">
                    Você publica sem custo. Só usa créditos quando alguém clica/desbloqueia o seu contato.
                  </p>
                </CardContent>
              </Card>
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
};

export default FreightForm;
