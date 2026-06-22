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
import { toast } from 'sonner';
import {
  Car,
  ArrowLeft,
  CheckCircle2,
  Check,
  Camera,
  Coins,
  Phone,
  MessageCircle,
  Image as ImageIcon,
  Sparkles,
  Star,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { cn, parseBRLCurrency, toE164, formatBrazilianPhone } from '@/lib/utils';
import { VehicleImageUpload } from '@/components/advertiser/VehicleImageUpload';
import { VEHICLE_BRANDS, MOTO_BRANDS, BOAT_BRANDS } from '@/lib/vehicles/vehicleBrands';
import { generateListingDescription } from '@/lib/ai/generateDescription';

// Grupo de marcas por tipo (listas diferentes p/ moto, barco e demais).
const brandGroupOf = (type: string) => (type === 'moto' ? 'moto' : type === 'barco' ? 'barco' : 'veh');

const UF_LIST = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const VEHICLE_TYPES = [
  { value: 'carro', label: 'Carro' },
  { value: 'moto', label: 'Moto' },
  { value: 'barco', label: 'Barco' },
  { value: 'utilitario', label: 'Utilitário' },
];

const CONDITIONS = [
  { value: 'novo', label: 'Novo', desc: 'Zero km / sem uso', icon: Sparkles },
  { value: 'seminovo', label: 'Seminovo', desc: 'Pouco uso, ótimo estado', icon: Star },
  { value: 'usado', label: 'Usado', desc: 'Já utilizado', icon: RefreshCw },
];

const INPUT_CLS = "h-12 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-[#3483FA]/40";

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
          <Icon className="h-5 w-5 text-[#3483FA]" />
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

export const VehicleForm = () => {
  const { user } = useAuth();
  const { listingId: urlListingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [listingId, setListingId] = useState<string | null>(urlListingId || null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const [vehicleData, setVehicleData] = useState({
    title: '',
    description: '',
    vehicle_type: 'carro',
    condition: 'seminovo',
    brand: '',
    model: '',
    year: '',
    price_brl: '',
    kilometers: '',
    fuel_type: 'flex',
    transmission: 'manual',
    color: '',
  });

  const [generatingDesc, setGeneratingDesc] = useState(false);
  const handleGenerateDescription = async () => {
    if (!vehicleData.title.trim() || !vehicleData.brand || !vehicleData.model.trim()) {
      toast.error('Preencha título, montadora e modelo antes de gerar a descrição com IA.');
      return;
    }
    setGeneratingDesc(true);
    try {
      const desc = await generateListingDescription('veiculo', {
        'Título': vehicleData.title,
        'Tipo': VEHICLE_TYPES.find(t => t.value === vehicleData.vehicle_type)?.label || vehicleData.vehicle_type,
        'Condição': vehicleData.condition === 'novo' ? 'Novo' : vehicleData.condition === 'seminovo' ? 'Seminovo' : 'Usado',
        'Marca': vehicleData.brand,
        'Modelo': vehicleData.model,
        'Ano': vehicleData.year,
        'Cor': vehicleData.color,
        'Quilometragem': vehicleData.kilometers ? `${vehicleData.kilometers} km` : undefined,
        'Combustível': vehicleData.fuel_type,
        'Câmbio': vehicleData.transmission,
      });
      setVehicleData(prev => ({ ...prev, description: desc }));
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
  });

  const isMoto = vehicleData.vehicle_type === 'moto';
  const isBarco = vehicleData.vehicle_type === 'barco';
  const brandOptions = isMoto ? MOTO_BRANDS : isBarco ? BOAT_BRANDS : VEHICLE_BRANDS;

  useEffect(() => {
    if (user && !contactData.contact_name) {
      setContactData(prev => ({ ...prev, contact_name: user.email?.split('@')[0] || '' }));
    }
  }, [user]);

  // Pré-seleciona a categoria vinda do link (?tipo=carro/moto/barco/utilitario).
  useEffect(() => {
    const tipo = new URLSearchParams(location.search).get('tipo');
    if (tipo && ['carro', 'moto', 'barco', 'utilitario'].includes(tipo)) {
      setVehicleData(prev => ({ ...prev, vehicle_type: tipo }));
    }
  }, [location.search]);

  // Carrega dados existentes (modo edição).
  useEffect(() => {
    async function loadData() {
      if (!urlListingId || !user) return;
      try {
        setLoading(true);
        const { data: listing, error } = await supabase
          .from('vehicle_listings' as any)
          .select('*, contacts:vehicle_listing_contacts(*)')
          .eq('id', urlListingId)
          .single();
        if (error) throw error;
        const l = listing as any;
        if (l) {
          setVehicleData({
            title: l.title || '',
            description: l.description || '',
            vehicle_type: l.vehicle_type || 'carro',
            condition: l.condition || 'seminovo',
            brand: l.brand || '',
            model: l.model || '',
            year: l.year ? String(l.year) : '',
            price_brl: l.price_brl
              ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(l.price_brl)
              : '',
            kilometers: l.kilometers ? Number(l.kilometers).toLocaleString("pt-BR") : '',
            fuel_type: l.fuel_type || 'flex',
            transmission: l.transmission || 'manual',
            color: l.color || '',
          });
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
            });
          }
        }
      } catch (err: any) {
        console.error('[VehicleForm] erro ao carregar:', err);
        toast.error('Não foi possível carregar os dados do veículo.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [urlListingId, user]);

  // ── Checklist de progresso (estilo Mercado Livre) ──
  const completion = useMemo(() => ({
    dados: Boolean(vehicleData.title.trim() && vehicleData.brand && vehicleData.model.trim() && /^\d{4}$/.test(vehicleData.year)),
    fotos: pendingFiles.length > 0 || !!urlListingId,
    descricao: vehicleData.description.trim().length > 0,
    preco: !!vehicleData.price_brl,
    local: Boolean(locationData.city.trim() && locationData.state.trim()),
    contato: Boolean(contactData.contact_name.trim() && contactData.whatsapp_e164.trim()),
  }), [vehicleData, pendingFiles, urlListingId, locationData, contactData]);

  const checklist = [
    { key: 'dados', label: 'Dados do veículo', step: 1 },
    { key: 'fotos', label: 'Pelo menos 1 foto', step: 2 },
    { key: 'descricao', label: 'Descrição', step: 3 },
    { key: 'preco', label: 'Preço', step: 4 },
    { key: 'local', label: 'Localização', step: 5 },
    { key: 'contato', label: 'Nome e WhatsApp', step: 5 },
  ];
  const completedCount = Object.values(completion).filter(Boolean).length;
  const totalChecks = Object.keys(completion).length;
  const progressPct = Math.round((completedCount / totalChecks) * 100);

  const canSubmit = urlListingId
    ? completion.dados
    : completion.dados && completion.local && completion.contato;

  const handlePublish = async () => {
    if (!user) return;
    if (!vehicleData.title.trim()) { toast.error('Informe o título do anúncio.'); return; }
    if (!vehicleData.brand) { toast.error('Selecione a montadora.'); return; }
    if (!vehicleData.model.trim()) { toast.error('Informe o modelo.'); return; }
    const yearNum = parseInt(vehicleData.year, 10);
    if (!yearNum || yearNum < 1900) { toast.error('Informe um ano válido.'); return; }
    if (!locationData.city.trim() || !locationData.state.trim()) { toast.error('Informe cidade e estado.'); return; }

    try {
      setLoading(true);

      const payload = {
        owner_user_id: user.id,
        title: vehicleData.title.trim(),
        description: vehicleData.description || null,
        vehicle_type: vehicleData.vehicle_type,
        condition: vehicleData.condition,
        brand: vehicleData.brand,
        model: vehicleData.model.trim(),
        year: yearNum,
        color: vehicleData.color || null,
        price_brl: vehicleData.price_brl ? parseBRLCurrency(vehicleData.price_brl) : null,
        kilometers: vehicleData.kilometers ? parseInt(vehicleData.kilometers.replace(/\D/g, ""), 10) || 0 : 0,
        fuel_type: vehicleData.fuel_type,
        transmission: vehicleData.transmission,
        city: locationData.city.trim(),
        state: locationData.state.trim(),
        neighborhood: locationData.neighborhood || null,
        public_address_label: locationData.public_address_label
          || `${locationData.neighborhood ? locationData.neighborhood + ', ' : ''}${locationData.city}/${locationData.state}`,
        visibility_status: 'published',
        published_at: new Date().toISOString(),
      };

      let currentListingId = listingId;

      if (!currentListingId) {
        const { data, error } = await supabase
          .from('vehicle_listings' as any)
          .insert(payload as any)
          .select()
          .single();
        if (error) throw error;
        currentListingId = (data as any).id;
        setListingId(currentListingId);
      } else {
        const { error } = await supabase
          .from('vehicle_listings' as any)
          .update(payload as any)
          .eq('id', currentListingId);
        if (error) throw error;
      }

      // Contato protegido
      await supabase
        .from('vehicle_listing_contacts' as any)
        .upsert({
          listing_id: currentListingId,
          owner_user_id: user.id,
          contact_name: contactData.contact_name,
          whatsapp_e164: contactData.whatsapp_e164 ? toE164(contactData.whatsapp_e164) : '',
          phone_e164: contactData.phone_e164 ? toE164(contactData.phone_e164) : '',
        } as any, { onConflict: 'listing_id' });

      // Upload de fotos pendentes (modo novo)
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
            console.error('[VehicleForm] Falha ao comprimir imagem:', convErr);
            toast.error(`Não foi possível processar a foto "${file.name}".`);
            failures++;
            continue;
          }

          const { error: uploadError } = await supabase.storage
            .from('real-estate-original')
            .upload(filePath, uploadBlob, { contentType: 'image/jpeg' });

          if (uploadError) {
            console.error('[VehicleForm] Falha no upload da foto:', uploadError);
            toast.error(`Falha ao enviar a foto "${file.name}": ${uploadError.message}`);
            failures++;
            continue;
          }

          const { data: mediaData, error: dbErr } = await supabase.from('vehicle_media' as any).insert({
            listing_id: currentListingId,
            owner_user_id: user.id,
            original_storage_path: filePath,
          } as any).select().single();

          if (dbErr) {
            console.error('[VehicleForm] Falha ao registrar mídia:', dbErr);
            toast.error(`Falha ao registrar a foto "${file.name}".`);
            failures++;
            continue;
          }

          if (mediaData) {
            const { error: copyErr } = await supabase.storage.from('real-estate-public').upload(filePath, uploadBlob, { upsert: true, contentType: 'image/jpeg' });
            if (copyErr) console.warn('[VehicleForm] Falha ao copiar para public:', copyErr.message);
            await supabase.from('vehicle_media' as any).update({
              moderation_status: 'approved',
              public_masked_storage_path: filePath,
            } as any).eq('id', (mediaData as any).id);
          }
        }
        if (failures > 0) {
          toast.error(`${failures} foto(s) não foram enviadas. Tente adicioná-las novamente em "Editar anúncio".`);
        }
        setPendingFiles([]);
      }

      toast.success('Veículo publicado com sucesso! 🚗');
      queryClient.invalidateQueries({ queryKey: ['veiculos-meus-anuncios'] });
      queryClient.invalidateQueries({ queryKey: ['veiculos-painel-lista'] });
      navigate('/anunciante/veiculos/meus-anuncios');
    } catch (err: any) {
      console.error('[VehicleForm] erro ao publicar:', err);
      toast.error(`Erro ao publicar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#EBEBEB] pb-32">
      {/* Top bar — Mercado Livre style */}
      <div className="sticky top-0 z-30 bg-[#FFE600] border-b border-yellow-300 shadow-sm">
        <div className="container max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-zinc-900 font-bold hover:opacity-70 transition-opacity">
            <ArrowLeft className="h-5 w-5" />
            <span className="hidden sm:inline text-sm">Voltar</span>
          </button>
          <div className="flex items-center gap-2 text-zinc-900">
            <Car className="h-5 w-5" />
            <span className="font-black text-sm sm:text-base">{urlListingId ? 'Editar veículo' : 'Anunciar veículo'}</span>
          </div>
          <div className="text-xs font-bold text-zinc-700">{progressPct}% concluído</div>
        </div>
        <div className="h-1 bg-yellow-300">
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="container max-w-6xl mx-auto px-4 py-6 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main column */}
          <div className="lg:col-span-8 space-y-6">

            {/* 1 — Dados do veículo */}
            <Section step={1} title="Dados do veículo" description="Conte o que você está anunciando." icon={Car} done={completion.dados}>
              <div className="space-y-2">
                <InputLabel required>Título do anúncio</InputLabel>
                <Input
                  placeholder="Ex.: Honda Civic 2020, 40.000km, automático"
                  className={INPUT_CLS}
                  value={vehicleData.title}
                  onChange={(e) => setVehicleData(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>

              {/* Tipo */}
              <div className="space-y-2">
                <InputLabel required>Tipo</InputLabel>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {VEHICLE_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setVehicleData(prev => ({
                        ...prev,
                        vehicle_type: t.value,
                        // limpa a marca quando muda o grupo de marcas (moto/barco/veículos)
                        brand: brandGroupOf(t.value) !== brandGroupOf(prev.vehicle_type) ? '' : prev.brand,
                      }))}
                      className={cn(
                        "rounded-lg border-2 px-3 py-2.5 font-bold text-sm transition-all",
                        vehicleData.vehicle_type === t.value
                          ? "border-[#3483FA] bg-blue-50 text-zinc-900"
                          : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Condição */}
              <div className="space-y-2">
                <InputLabel required>Condição</InputLabel>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {CONDITIONS.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setVehicleData(prev => ({ ...prev, condition: opt.value }))}
                        className={cn(
                          "rounded-lg border-2 p-3 text-left transition-all",
                          vehicleData.condition === opt.value ? "border-[#3483FA] bg-blue-50 shadow-sm" : "border-zinc-200 bg-white hover:border-zinc-300"
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-[#3483FA]" />
                          <div className="font-bold text-sm text-zinc-900">{opt.label}</div>
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-0.5">{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Marca / Modelo / Ano */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <InputLabel required>Marca / Montadora</InputLabel>
                  <Select value={vehicleData.brand} onValueChange={(v) => setVehicleData(prev => ({ ...prev, brand: v }))}>
                    <SelectTrigger className={INPUT_CLS}><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent className="max-h-72 bg-white">
                      {brandOptions.map((b) => (
                        <SelectItem key={b} value={b} className="!text-zinc-900 font-medium">{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <InputLabel required>Modelo</InputLabel>
                  <Input placeholder="Ex.: Civic" className={INPUT_CLS} value={vehicleData.model} onChange={(e) => setVehicleData(prev => ({ ...prev, model: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <InputLabel required>Ano</InputLabel>
                  <Input placeholder="2020" inputMode="numeric" maxLength={4} className={INPUT_CLS} value={vehicleData.year} onChange={(e) => setVehicleData(prev => ({ ...prev, year: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
                </div>
              </div>

              {/* Cor / Quilometragem */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <InputLabel>Cor</InputLabel>
                  <Input placeholder="Ex.: Prata, Branco Perolado..." className={INPUT_CLS} value={vehicleData.color} onChange={(e) => setVehicleData(prev => ({ ...prev, color: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <InputLabel>Quilometragem (km)</InputLabel>
                  <Input placeholder="0" inputMode="numeric" className={INPUT_CLS} value={vehicleData.kilometers} onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    setVehicleData(prev => ({ ...prev, kilometers: digits ? Number(digits).toLocaleString("pt-BR") : "" }));
                  }} />
                </div>
              </div>

              {/* Combustível / Câmbio (Câmbio oculto p/ Moto) */}
              <div className={cn("grid grid-cols-1 gap-4", !isMoto && "sm:grid-cols-2")}>
                <div className="space-y-2">
                  <InputLabel>Combustível</InputLabel>
                  <Select value={vehicleData.fuel_type} onValueChange={(v) => setVehicleData(prev => ({ ...prev, fuel_type: v }))}>
                    <SelectTrigger className={INPUT_CLS}><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="flex">Flex</SelectItem>
                      <SelectItem value="gasolina">Gasolina</SelectItem>
                      <SelectItem value="diesel">Diesel</SelectItem>
                      <SelectItem value="eletrico">Elétrico</SelectItem>
                      <SelectItem value="hibrido">Híbrido</SelectItem>
                      <SelectItem value="gnv">GNV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {!isMoto && (
                  <div className="space-y-2">
                    <InputLabel>Câmbio</InputLabel>
                    <Select value={vehicleData.transmission} onValueChange={(v) => setVehicleData(prev => ({ ...prev, transmission: v }))}>
                      <SelectTrigger className={INPUT_CLS}><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-white">
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="automatico">Automático</SelectItem>
                        <SelectItem value="semi-automatico">Semi-Automático</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </Section>

            {/* 2 — Fotos */}
            <Section step={2} title="Adicione fotos" description="A primeira foto será a capa. Use imagens nítidas e reais." icon={Camera} done={completion.fotos}>
              <VehicleImageUpload
                listingId={urlListingId || undefined}
                onFilesSelected={(files) => setPendingFiles(files)}
              />
              <div className="flex items-start gap-2 text-xs text-zinc-500 bg-blue-50 border border-blue-100 rounded-lg p-3">
                <ImageIcon className="h-4 w-4 text-[#3483FA] shrink-0 mt-0.5" />
                <div><strong className="text-zinc-700">Dica:</strong> anúncios com mais fotos recebem mais contatos. Mínimo: 1 foto.</div>
              </div>
            </Section>

            {/* 3 — Descrição */}
            <Section step={3} title="Descrição" description="Detalhes como estado dos pneus, revisões, opcionais." icon={MessageCircle} done={completion.descricao}>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <InputLabel>Observações do vendedor</InputLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateDescription}
                    disabled={generatingDesc}
                    className="rounded-xl gap-1.5 text-xs h-8 shrink-0"
                  >
                    {generatingDesc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {generatingDesc ? 'Gerando...' : 'Gerar com IA'}
                  </Button>
                </div>
                <Textarea
                  placeholder="Descreva detalhes do veículo, histórico de revisões, opcionais exclusivos..."
                  className="min-h-[150px] resize-y bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-[#3483FA]/40 text-sm"
                  value={vehicleData.description}
                  onChange={(e) => setVehicleData(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </Section>

            {/* 4 — Preço */}
            <Section step={4} title="Preço" description="Quanto custa o seu veículo?" icon={Coins} done={completion.preco}>
              <div className="space-y-2 max-w-xs">
                <InputLabel>Preço (R$)</InputLabel>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-semibold pointer-events-none">R$</span>
                  <Input
                    placeholder="0,00"
                    inputMode="numeric"
                    className={cn(INPUT_CLS, "pl-12 text-lg font-bold")}
                    value={vehicleData.price_brl}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      const formatted = digits ? (Number(digits) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
                      setVehicleData(prev => ({ ...prev, price_brl: formatted }));
                    }}
                  />
                </div>
              </div>
            </Section>

            {/* 5 — Localização e Contato */}
            <Section step={5} title="Localização e contato" description="Onde está o veículo e como falar com você." icon={Phone} done={completion.local && completion.contato}>
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
              </div>
            </Section>

            {/* Submit */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
              <Button variant="outline" onClick={() => navigate(-1)} className="h-12 px-6 border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 order-2 sm:order-1">
                Cancelar
              </Button>
              <Button
                disabled={!canSubmit || loading}
                onClick={handlePublish}
                className={cn(
                  "h-12 px-8 font-bold text-base order-1 sm:order-2 shadow-md",
                  canSubmit ? "bg-[#3483FA] hover:bg-[#2968c8] text-white" : "bg-zinc-400 text-white cursor-not-allowed hover:bg-zinc-400 opacity-80"
                )}
              >
                {loading ? 'Publicando...' : (urlListingId ? 'Salvar alterações' : 'Publicar veículo')}
                {!loading && <CheckCircle2 className="h-5 w-5 ml-2" />}
              </Button>
            </div>
          </div>

          {/* Sidebar */}
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

export default VehicleForm;
