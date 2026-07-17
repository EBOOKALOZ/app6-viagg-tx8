import React, { useState, useEffect, useMemo } from 'react';
import { PropertyImageUpload } from '@/components/real-estate/PropertyImageUpload';
import { ContactProtectionNotice } from '@/components/real-estate/ContactProtectionNotice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AdvertiserPanelLayout } from '@/components/advertiser/AdvertiserPanelLayout';
import { moderatedUpload } from '@/lib/moderation/moderatedUpload';
import { moderatedText } from '@/lib/moderation/moderatedText';
import {
  Home,
  ArrowLeft,
  CheckCircle2,
  Check,
  Tag,
  Building2,
  Ruler,
  MessageCircle,
  MapPin,
  Phone,
  Camera,
  Image as ImageIcon,
  Info,
  Zap,
  Sparkles,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { cn, parseBRLCurrency, formatBrazilianPhone, toE164 } from '@/lib/utils';
import { generateListingDescription } from '@/lib/ai/generateDescription';

const UF_LIST = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const TYPE_LABEL: Record<string, string> = { terreno: "Terreno", lote: "Lote Urbano", chacara: "Chácara", sitio: "Sítio", fazenda: "Fazenda" };

interface SectionProps {
  step: number;
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  done?: boolean;
  children: React.ReactNode;
}

const Section = ({ step, title, description, icon: Icon, done, children }: SectionProps) => (
  <section id={`re-section-${step}`} className="scroll-mt-24">
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

const InputLabel = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="text-sm font-semibold text-zinc-700 flex items-center gap-1">
    {children}
    {required && <span className="text-red-500">*</span>}
  </label>
);

export const PropertyForm = () => {
  const { user } = useAuth();
  const { listingId: urlListingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isAdvertiserContext = location.pathname.startsWith('/anunciante');
  const isImoveisForm = location.pathname.includes('/imoveis');
  const [loading, setLoading] = useState(false);
  const [listingId, setListingId] = useState<string | null>(urlListingId || null);
  const [hasExistingMedia, setHasExistingMedia] = useState(false);

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

  const [generatingDesc, setGeneratingDesc] = useState(false);
  const handleGenerateDescription = async () => {
    if (!propertyData.title.trim()) {
      toast.error('Preencha o título antes de gerar a descrição com o Viagg-TX8™.');
      return;
    }
    setGeneratingDesc(true);
    try {
      const desc = await generateListingDescription('imovel', {
        'Título': propertyData.title,
        'Tipo de imóvel': TYPE_LABEL[propertyData.property_type] || propertyData.property_type,
        'Área': propertyData.total_area_m2 ? `${propertyData.total_area_m2} ${propertyData.property_type === 'lote' ? 'm²' : 'hectares'}` : undefined,
        'Quartos': propertyData.bedrooms !== '0' ? propertyData.bedrooms : undefined,
        'Banheiros': propertyData.bathrooms !== '0' ? propertyData.bathrooms : undefined,
        'Cidade': locationData.city,
        'Estado': locationData.state,
        'Bairro': locationData.neighborhood,
      });
      setPropertyData(prev => ({ ...prev, description: desc }));
      toast.success('Descrição gerada com o Viagg-TX8™!');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao gerar descrição com o Viagg-TX8™.');
    } finally {
      setGeneratingDesc(false);
    }
  };

  // Pré-seleciona a categoria vinda do link de cadastro (?tipo=sitio/chacara/lote/fazenda).
  useEffect(() => {
    const tipo = new URLSearchParams(location.search).get("tipo");
    if (tipo && ["terreno", "lote", "chacara", "sitio", "fazenda"].includes(tipo)) {
      setPropertyData(prev => ({ ...prev, property_type: tipo }));
    }
  }, [location.search]);

  // Custo de desbloqueio do contato POR CATEGORIA (admin → Cobranças).
  const [unlockCosts, setUnlockCosts] = useState<Record<string, number>>({ sitio: 80, chacara: 80, lote: 50, fazenda: 150, terreno: 50 });
  const [unlockActive, setUnlockActive] = useState(true);
  useEffect(() => {
    (async () => {
      const codes = ["sitio", "chacara", "lote", "fazenda"].map((k) => `real_estate_unlock_${k}`);
      const { data } = await (supabase.from("merchant_credit_usage_rules") as any)
        .select("feature_code, credits_cost, is_active")
        .in("feature_code", codes);
      if (data && data.length) {
        const next: Record<string, number> = {};
        let anyActive = false;
        for (const r of data) {
          next[String(r.feature_code).replace("real_estate_unlock_", "")] = Number(r.credits_cost) || 0;
          if (r.is_active) anyActive = true;
        }
        setUnlockCosts((prev) => ({ ...prev, ...next }));
        setUnlockActive(anyActive);
      }
    })();
  }, []);

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
        const { data: listing, error } = await supabase
          .from('real_estate_listings' as any)
          .select('*, contacts:real_estate_listing_contacts(*), media:real_estate_media(id)')
          .eq('id', listingId)
          .single();

        if (error) throw error;
        if (listing) {
          setPropertyData({
            title: listing.title || '',
            description: listing.description || '',
            property_type: listing.property_type || 'terreno',
            price_brl: listing.price_brl ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(listing.price_brl) : '',
            total_area_m2: listing.total_area_m2
              ? (listing.property_type === 'lote' ? listing.total_area_m2.toString() : (listing.total_area_m2 / 10000).toString())
              : '',
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

          setHasExistingMedia((listing.media?.length ?? 0) > 0);
        }
      } catch (err: any) {
        console.error("[PropertyForm] Erro ao carregar dados:", err);
        toast.error("Não foi possível carregar os dados do anúncio.");
      } finally {
        setLoading(false);
      }
    }

    if (urlListingId) loadData();
  }, [urlListingId, user]);

  const showElectronicsFields = false; // placeholder removido — sem campos eletrônicos em imóveis
  const isLote = propertyData.property_type === 'lote';

  const completion = useMemo(() => ({
    title: propertyData.title.trim().length >= 5,
    price: !!propertyData.price_brl,
    area: !!propertyData.total_area_m2,
    description: propertyData.description.trim().length >= 20,
    location: !!locationData.city && !!locationData.state && !!locationData.neighborhood,
    contact: !!contactData.contact_name && !!contactData.whatsapp_e164,
    photos: pendingFiles.length > 0 || hasExistingMedia,
  }), [propertyData, locationData, contactData, pendingFiles, hasExistingMedia]);

  const completedCount = Object.values(completion).filter(Boolean).length;
  const totalChecks = Object.keys(completion).length;
  const progressPct = Math.round((completedCount / totalChecks) * 100);

  const canSubmit = listingId
    ? completion.title
    : completion.title && completion.price && completion.area && completion.location && completion.contact && completion.photos;

  const handleSave = async () => {
    if (!user) return;
    if (!canSubmit) {
      toast.error('Complete os campos obrigatórios antes de publicar.');
      return;
    }

    try {
      setLoading(true);

      // 0. Moderação de Texto (RIDV V2.0)
      const fullDesc = isLote
        ? [
            propertyData.description,
            propertyData.total_area_m2 ? `Dimensões: ${propertyData.total_area_m2}` : '',
            propertyData.lot_quantity && propertyData.lot_quantity !== '1' ? `Quantidade de lotes: ${propertyData.lot_quantity}` : '',
          ].filter(Boolean).join('\n')
        : propertyData.description;

      const textMod = await moderatedText({
        title: propertyData.title,
        description: fullDesc,
        category: 'real_estate',
        price: propertyData.price_brl ? parseBRLCurrency(propertyData.price_brl) : 0,
        listingId: listingId ?? undefined,
      });

      if (textMod.status === 'blocked') {
        toast.error(`Texto do anúncio bloqueado pela RIDV: ${textMod.reason}`);
        setLoading(false);
        return;
      }

      const isTextApproved = textMod.status === 'approved';

      // 1. Create/Update Listing
      const listingPayload = {
        owner_user_id: user.id,
        title: propertyData.title,
        description: fullDesc,
        property_type: propertyData.property_type,
        price_brl: propertyData.price_brl ? parseBRLCurrency(propertyData.price_brl) : 0,
        total_area_m2: propertyData.total_area_m2
          ? (isLote
              ? parseFloat(propertyData.total_area_m2) || null  // Lote: valor já está em m²
              : parseFloat(propertyData.total_area_m2) * 10000 || null)  // Demais: hectares → m²
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
        visibility_status: 'published',
        published_at: new Date().toISOString(),
        moderation_status: isTextApproved ? 'approved' : 'pending_ai_analysis',
        ai_status: isTextApproved ? 'approved' : 'queued',
        moderation_reason: textMod.reason,
      };

      let currentListingId = listingId;

      if (!currentListingId) {
        const { data, error } = await supabase
          .from('real_estate_listings' as any)
          .insert(listingPayload as any)
          .select()
          .single();
        if (error) throw error;
        currentListingId = (data as any).id;
        setListingId(currentListingId);
      } else {
        const { error } = await supabase
          .from('real_estate_listings' as any)
          .update(listingPayload as any)
          .eq('id', currentListingId);
        if (error) throw error;
      }

      if (!currentListingId) throw new Error("Erro de integridade: Listing ID não gerado.");

      // 2. Create/Update Contact (Protected)
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
      if (pendingFiles.length > 0) {
        toast.info(`Processando ${pendingFiles.length} fotos... Aguarde análise de segurança.`);
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
            console.error('[PropertyForm] Falha ao comprimir imagem:', convErr);
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
              category: 'real_estate',
              targetBucket: 'real-estate-public',
            });
          } catch (modErr: any) {
            console.error('[PropertyForm] Falha na moderação RIDV da foto:', modErr);
            toast.error(`Falha na análise da foto "${file.name}": ${modErr.message}`);
            failures++;
            continue;
          }

          if (modRes.status === 'blocked') {
            toast.error(`Foto "${file.name}" bloqueada pelo Viagg-TX8™: ${modRes.reason}`);
            failures++;
            continue;
          }

          const finalPath = modRes.storagePath || filePath;
          const finalStatus = modRes.status === 'approved' ? 'approved' : 'pending_ai_analysis';

          const { error: dbErr } = await supabase.from('real_estate_media' as any).insert({
            listing_id: currentListingId,
            owner_user_id: user.id,
            original_storage_path: finalPath,
            public_masked_storage_path: modRes.status === 'approved' ? finalPath : null,
            moderation_status: finalStatus,
          } as any);

          if (dbErr) {
            console.error('[PropertyForm] Falha ao registrar mídia:', dbErr);
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

      toast.success('Anúncio publicado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ["advertiser-unified-listings"] });
      navigate(isImoveisForm ? '/anunciante/imoveis/meus-anuncios' : (isAdvertiserContext ? '/anunciante/anuncios' : '/mercado'));
    } catch (err: any) {
      console.error("[PropertyForm] Erro ao salvar:", err);
      toast.error(`Erro ao salvar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const FormContent = (
    <div className="min-h-screen bg-[#EBEBEB] pb-32">
      {/* Top bar — Mercado Livre style (mesmo padrão do formulário de Produtos) */}
      <div className="sticky top-0 z-30 bg-[#FFE600] border-b border-yellow-300 shadow-sm">
        <div className="container max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-zinc-900 font-bold hover:opacity-70 transition-opacity">
            <ArrowLeft className="h-5 w-5" />
            <span className="hidden sm:inline text-sm">Voltar</span>
          </button>
          <div className="flex items-center gap-2 text-zinc-900">
            <Home className="h-5 w-5" />
            <span className="font-black text-sm sm:text-base">{listingId ? 'Editar anúncio' : 'Anunciar imóvel'}</span>
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

            {/* Aviso de responsabilidade do anunciante */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
              <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <strong>Responsabilidade do anunciante:</strong> todas as informações, fotos e dados
                inseridos neste anúncio são de inteira responsabilidade do anunciante. A Viagg-TX8
                apenas hospeda o conteúdo e não se responsabiliza pela veracidade das informações publicadas.
              </p>
            </div>

            {/* 1 — Título */}
            <Section step={1} title="Conte sobre o seu imóvel" description="Comece pelo título. Seja claro e direto." icon={Tag} done={completion.title}>
              <div className="space-y-2">
                <InputLabel required>Título do anúncio</InputLabel>
                <Input
                  placeholder="Ex.: Lindo Sítio com Açude e Pomar em Gaspar"
                  className="h-12 text-base bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-[#3483FA]/40"
                  value={propertyData.title}
                  onChange={e => setPropertyData(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>
            </Section>

            {/* 2 — Tipo & Preço */}
            <Section step={2} title="Tipo e preço" description="Categoria já definida no cadastro e valor pretendido." icon={Building2} done={completion.price}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <InputLabel>Tipo de imóvel</InputLabel>
                  <div className="h-12 flex items-center border border-zinc-200 rounded-lg font-bold px-4 bg-zinc-100 text-zinc-900">
                    {TYPE_LABEL[propertyData.property_type] || "Imóvel"}
                  </div>
                </div>
                <div className="space-y-2">
                  <InputLabel required>Preço Pretendido</InputLabel>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-semibold pointer-events-none">R$</span>
                    <Input
                      type="text"
                      placeholder="0,00"
                      className="h-12 pl-12 text-lg font-bold bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
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
              </div>
              {(() => {
                if (!unlockActive) return null;
                const cost = unlockCosts[propertyData.property_type] ?? 0;
                if (!cost) return null;
                return (
                  <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5">
                    <Zap className="w-4 h-4 text-[#3483FA] shrink-0" />
                    <p className="text-xs text-zinc-600 leading-tight">
                      Desbloquear o WhatsApp do interessado custa <strong className="text-zinc-900">{cost} créditos</strong> (custo fixo desta categoria).
                    </p>
                  </div>
                );
              })()}
            </Section>

            {/* 3 — Área e Lotes */}
            <Section step={3} title={isLote ? 'Tamanho e quantidade de lotes' : 'Área do imóvel'} description="Informe a área para filtrar curiosos." icon={Ruler} done={completion.area}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <InputLabel required>{isLote ? 'Tamanho do Lote (m²)' : 'Área Total (Hectares)'}</InputLabel>
                  <Input
                    type={isLote ? 'text' : 'number'}
                    step="0.01"
                    placeholder={isLote ? 'Ex.: 12 x 30' : 'Ex.: 2,5 hectares'}
                    className="h-12 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
                    value={propertyData.total_area_m2}
                    onChange={e => setPropertyData(prev => ({ ...prev, total_area_m2: e.target.value }))}
                  />
                </div>
                {isLote && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-left-2">
                    <InputLabel>Quantidade de Lotes</InputLabel>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Ex.: 5"
                      className="h-12 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
                      value={propertyData.lot_quantity}
                      onChange={e => setPropertyData(prev => ({ ...prev, lot_quantity: e.target.value }))}
                    />
                  </div>
                )}
              </div>
            </Section>

            {/* 4 — Descrição */}
            <Section step={4} title="Descrição" description="Explique tudo sobre o imóvel, sem repetir o título." icon={MessageCircle} done={completion.description}>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <InputLabel>Descrição completa</InputLabel>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleGenerateDescription}
                    disabled={generatingDesc}
                    className="rounded-xl gap-1.5 text-xs h-8 shrink-0 bg-orange-500 hover:bg-orange-600 text-white border-0"
                  >
                    {generatingDesc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {generatingDesc ? 'Gerando...' : 'Gerar com Viagg-TX8™'}
                  </Button>
                </div>
                <Textarea
                  placeholder="Descreva detalhes do solo, água, árvores frutíferas, benfeitorias..."
                  className="min-h-[150px] resize-y bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-[#3483FA]/40 text-sm"
                  value={propertyData.description}
                  onChange={e => setPropertyData(prev => ({ ...prev, description: e.target.value }))}
                />
                <p className="text-xs text-zinc-500">Mínimo: 20 caracteres. Não inclua telefone ou e-mail aqui.</p>
              </div>
            </Section>

            {/* 5 — Localização */}
            <Section step={5} title="Onde fica o imóvel?" description="Defina a localização que aparecerá no Mercado." icon={MapPin} done={completion.location}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <InputLabel required>Estado</InputLabel>
                  <Select value={locationData.state} onValueChange={val => setLocationData(prev => ({ ...prev, state: val }))}>
                    <SelectTrigger className="h-12 bg-white border-zinc-300 text-zinc-900 font-bold">
                      <SelectValue placeholder="UF" />
                    </SelectTrigger>
                    <SelectContent className="bg-white max-h-[300px]">
                      {UF_LIST.map(uf => <SelectItem key={uf} value={uf} className="!text-zinc-900 font-medium">{uf}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <InputLabel required>Cidade</InputLabel>
                  <Input
                    value={locationData.city}
                    onChange={e => setLocationData(prev => ({ ...prev, city: e.target.value }))}
                    className="h-12 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
                  />
                </div>
                <div className="space-y-2 col-span-2 md:col-span-1">
                  <InputLabel required>Bairro/Região</InputLabel>
                  <Input
                    placeholder="Ex: Zona Norte"
                    value={locationData.neighborhood}
                    onChange={e => setLocationData(prev => ({ ...prev, neighborhood: e.target.value }))}
                    className="h-12 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <InputLabel>Como aparecerá no Mercado (Rótulo)</InputLabel>
                  <Info className="w-4 h-4 text-zinc-300" />
                </div>
                <Input
                  placeholder="Ex: Próximo à Ponte de Ferro, Blumenau/SC"
                  value={locationData.public_address_label}
                  onChange={e => setLocationData(prev => ({ ...prev, public_address_label: e.target.value }))}
                  className="h-12 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 italic"
                />
                <p className="text-[11px] text-zinc-400">Este é o único dado de endereço que o público verá antes da liberação.</p>
              </div>
            </Section>

            {/* 6 — Contato Protegido */}
            <Section step={6} title="Como o interessado entra em contato?" description="Esses dados aparecem para o comprador depois da liberação." icon={Phone} done={completion.contact}>
              <div className="space-y-2">
                <InputLabel required>Nome do Anunciante</InputLabel>
                <Input
                  placeholder="Seu nome ou Imobiliária"
                  value={contactData.contact_name}
                  onChange={e => setContactData(prev => ({ ...prev, contact_name: e.target.value }))}
                  className="h-11 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <InputLabel required>WhatsApp</InputLabel>
                  <Input
                    placeholder="(XX) XXXXX-XXXX"
                    value={contactData.whatsapp_e164}
                    onChange={e => setContactData(prev => ({ ...prev, whatsapp_e164: formatBrazilianPhone(e.target.value) }))}
                    className="h-11 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
                  />
                </div>
                <div className="space-y-2">
                  <InputLabel>Telefone Alternativo</InputLabel>
                  <Input
                    placeholder="(XX) XXXXX-XXXX"
                    value={contactData.phone_e164}
                    onChange={e => setContactData(prev => ({ ...prev, phone_e164: formatBrazilianPhone(e.target.value) }))}
                    className="h-11 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
                  />
                </div>
              </div>
            </Section>

            {/* 7 — Fotos */}
            <Section step={7} title="Adicione fotos" description="A primeira foto será a capa do anúncio. Use imagens nítidas." icon={Camera} done={completion.photos}>
              <PropertyImageUpload
                listingId={listingId || undefined}
                onFilesSelected={setPendingFiles}
                propertyType={propertyData.property_type}
              />
              <div className="flex items-start gap-2 text-xs text-zinc-500 bg-blue-50 border border-blue-100 rounded-lg p-3">
                <ImageIcon className="h-4 w-4 text-[#3483FA] shrink-0 mt-0.5" />
                <div>
                  <strong className="text-zinc-700">Dica:</strong> anúncios com mais fotos vendem mais rápido. Mínimo: 1 foto.
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
                onClick={handleSave}
                className={cn(
                  "h-12 px-8 font-bold text-base order-1 sm:order-2 shadow-md",
                  canSubmit
                    ? "bg-[#3483FA] hover:bg-[#2968c8] text-white"
                    : "bg-zinc-400 text-white cursor-not-allowed hover:bg-zinc-400 opacity-80"
                )}
              >
                {loading ? 'Publicando...' : (listingId ? 'Salvar Alterações' : 'Publicar Anúncio')}
                {!loading && <CheckCircle2 className="h-5 w-5 ml-2" />}
              </Button>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="lg:col-span-4">
            <div className="lg:sticky lg:top-24 space-y-4">
              {/* Progress checklist */}
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
                    {[
                      { key: 'title', label: 'Título', step: 1 },
                      { key: 'price', label: 'Preço', step: 2 },
                      { key: 'area', label: 'Área', step: 3 },
                      { key: 'description', label: 'Descrição (20+ caracteres)', step: 4 },
                      { key: 'location', label: 'Localização', step: 5 },
                      { key: 'contact', label: 'Nome e WhatsApp', step: 6 },
                      { key: 'photos', label: 'Pelo menos 1 foto', step: 7 },
                    ].map(item => (
                      <li key={item.key}>
                        <button
                          type="button"
                          onClick={() => document.getElementById(`re-section-${item.step}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                          className="w-full flex items-center gap-2 text-xs text-left hover:text-zinc-900 transition-colors"
                        >
                          <div className={cn(
                            "h-4 w-4 shrink-0 rounded-full flex items-center justify-center",
                            (completion as any)[item.key] ? "bg-emerald-500 text-white" : "bg-zinc-200"
                          )}>
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

              {/* Tip card */}
              <Card className="border border-emerald-100 bg-emerald-50 shadow-sm rounded-xl">
                <CardContent className="p-5 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <Sparkles className="h-4 w-4" />
                    <h3 className="font-bold text-sm">Anúncio Grátis</h3>
                  </div>
                  <p className="text-xs text-emerald-700/80">
                    Você publica sem custo. Os créditos só são contabilizados quando alguém clicar ou se interessar — e descontados do seu saldo ao desbloquear o contato.
                  </p>
                </CardContent>
              </Card>

              {/* Proteção de contato */}
              <Card className="border border-zinc-200 bg-white shadow-sm rounded-xl">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-zinc-900 mb-3">
                    <ShieldCheck className="h-4 w-4 text-[#3483FA]" />
                    <h3 className="font-bold text-sm">Proteção de Contato</h3>
                  </div>
                  <ContactProtectionNotice />
                </CardContent>
              </Card>
            </div>
          </aside>

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
