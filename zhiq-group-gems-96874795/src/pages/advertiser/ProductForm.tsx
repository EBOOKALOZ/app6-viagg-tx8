import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { PRODUCT_CATEGORIES } from '@/lib/productCategories';
import {
  Package as PackageIcon,
  ArrowLeft,
  CheckCircle2,
  Check,
  ChevronsUpDown,
  Link as LinkIcon,
  Info,
  Download,
  Camera,
  Tag,
  Layers,
  Truck,
  Phone,
  MessageCircle,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProductImageUpload } from '@/components/advertiser/ProductImageUpload';

const TITLE_MAX = 60;
const DESC_MAX = 1000;

const ELECTRONICS_KEYWORDS = ['celular', 'smartphone', 'eletr', 'inform', 'notebook', 'tablet', 'tv', 'console', 'video', 'fone', 'audio'];
const isElectronicsCategory = (cat: string) =>
  !!cat && ELECTRONICS_KEYWORDS.some(k => cat.toLowerCase().includes(k));

const formatCurrency = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10) / 100;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatPhone = (value: string) => {
  const v = value.replace(/\D/g, '');
  if (v.length === 0) return '';
  if (v.length <= 2) return `(${v}`;
  if (v.length <= 6) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
  if (v.length <= 10) return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
  return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7, 11)}`;
};

interface SectionProps {
  step: number;
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  done?: boolean;
  children: React.ReactNode;
}

const Section = ({ step, title, description, icon: Icon, done, children }: SectionProps) => (
  <section id={`section-${step}`} className="scroll-mt-24">
    <div className="mb-4 flex items-start gap-3">
      <div className={cn(
        "h-10 w-10 shrink-0 rounded-full flex items-center justify-center font-black text-sm border-2 transition-all",
        done
          ? "bg-emerald-500 border-emerald-500 text-white"
          : "bg-white border-zinc-200 text-zinc-600"
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

export const ProductForm = () => {
  const { user } = useAuth();
  const { productId, listingId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(listingId || productId || null);
  const [openCategory, setOpenCategory] = useState(false);
  const [productImages, setProductImages] = useState<File[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    condition: 'novo',
    brand: '',
    model: '',
    memory: '',
    price_brl: '',
    quantity: 1,
    shipping_fee: '',
    pickup_address: '',
    digital_product_link: '',
    has_digital_files: false,
  });

  const [contactData, setContactData] = useState({
    contact_name: '',
    whatsapp_e164: '',
    phone_e164: '',
  });

  const showElectronicsFields = formData.condition !== 'digital' && isElectronicsCategory(formData.category);
  const isDigital = formData.condition === 'digital';

  const completion = useMemo(() => ({
    title: formData.title.trim().length >= 5,
    category: !!formData.category,
    condition: !!formData.condition,
    photos: isDigital || productImages.length > 0,
    description: formData.description.trim().length >= 20,
    price: !!formData.price_brl,
    contact: !!contactData.contact_name && !!contactData.whatsapp_e164,
    digital: !isDigital || !!formData.digital_product_link.trim(),
  }), [formData, productImages, contactData, isDigital]);

  const completedCount = Object.values(completion).filter(Boolean).length;
  const totalChecks = Object.keys(completion).length;
  const progressPct = Math.round((completedCount / totalChecks) * 100);

  const canSubmit = completion.title && completion.category && completion.price && completion.contact && completion.photos && completion.digital;

  const handleSave = async () => {
    if (!canSubmit) {
      toast.error('Complete os campos obrigatórios antes de publicar.');
      return;
    }
    setLoading(true);
    try {
      if (!user) {
        toast.error('Usuário não autenticado.');
        setLoading(false);
        return;
      }

      const { data: advertiserData } = await supabase
        .from('advertiser_accounts' as any)
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      let accountId = advertiserData?.id;
      if (!accountId) {
        const { data: newAccount, error: createError } = await supabase
          .from('advertiser_accounts' as any)
          .insert({ user_id: user.id, email: user.email })
          .select('id')
          .single();
        if (createError) throw createError;
        accountId = newAccount.id;
      }

      const priceNumeric = parseFloat(formData.price_brl.replace(/\./g, '').replace(',', '.'));

      let description = formData.description;
      if (isDigital) {
        if (formData.digital_product_link) {
          description += `\n\nLink de download: ${formData.digital_product_link}`;
        }
      } else if (showElectronicsFields) {
        const extras: string[] = [];
        if (formData.brand) extras.push(`Marca: ${formData.brand}`);
        if (formData.model) extras.push(`Modelo: ${formData.model}`);
        if (formData.memory) extras.push(`Memória: ${formData.memory}`);
        if (extras.length) description += `\n\n${extras.join('\n')}`;
      }

      let listingIdResult = currentId;

      if (currentId) {
        const { error: updateError } = await supabase
          .from('advertiser_listings' as any)
          .update({
            title: formData.title,
            category: formData.category,
            description,
            price: priceNumeric || 0,
            condition: formData.condition,
            listing_status: 'active',
          })
          .eq('id', currentId);
        if (updateError) throw updateError;
      } else {
        const { data: listingData, error: insertError } = await supabase
          .from('advertiser_listings' as any)
          .insert({
            advertiser_account_id: accountId,
            title: formData.title,
            category: formData.category,
            description,
            price: priceNumeric || 0,
            condition: formData.condition,
            listing_status: 'active',
          })
          .select('id')
          .single();
        if (insertError) throw insertError;
        listingIdResult = listingData.id;
        setCurrentId(listingIdResult);
      }

      if (productImages.length > 0 && listingIdResult) {
        toast.success('Anúncio salvo. Enviando imagens...');
        for (const [index, file] of productImages.entries()) {
          let fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
          if (fileExt === 'heic' || fileExt === 'heif') fileExt = 'jpg';
          const fileName = `${listingIdResult}/${crypto.randomUUID()}.${fileExt}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('marketing-materials')
            .upload(fileName, file);
          if (!uploadError && uploadData) {
            await supabase.from('advertiser_listing_media' as any).insert({
              listing_id: listingIdResult,
              media_url: uploadData.path,
              storage_path: uploadData.path,
            });
            if (index === 0) {
              const { data: { publicUrl } } = supabase.storage
                .from('marketing-materials')
                .getPublicUrl(uploadData.path);
              await supabase.from('advertiser_listings' as any).update({
                cover_image_url: publicUrl,
              }).eq('id', listingIdResult);
            }
          }
        }
      }

      toast.success('Anúncio publicado com sucesso!');
      navigate('/anunciante');
    } catch (error: any) {
      console.error(error);
      toast.error(`Erro ao salvar: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !contactData.contact_name) {
      setContactData(prev => ({ ...prev, contact_name: user.email?.split('@')[0] || '' }));
    }
  }, [user]);

  useEffect(() => {
    if (listingId) {
      const fetchListing = async () => {
        const { data, error } = await supabase
          .from('advertiser_listings' as any)
          .select('*')
          .eq('id', listingId)
          .single();
        if (data && !error) {
          let cleanDesc = data.description || '';
          let exBrand = '';
          let exModel = '';
          let exMem = '';
          let digitalLink = '';
          if (data.condition === 'digital') {
            const linkPrefix = 'Link de download:';
            const linkIndex = cleanDesc.indexOf(linkPrefix);
            if (linkIndex !== -1) {
              digitalLink = cleanDesc.substring(linkIndex + linkPrefix.length).trim();
              cleanDesc = cleanDesc.substring(0, linkIndex).trim();
            }
          } else if (cleanDesc.includes('Marca:')) {
            const parts = cleanDesc.split('Marca:');
            cleanDesc = parts[0].trim();
            const rest = parts[1];
            const lines = rest.split('\n');
            exBrand = lines[0].trim();
            const modelLine = lines.find((l: string) => l.includes('Modelo:'));
            if (modelLine) exModel = modelLine.replace('Modelo:', '').trim();
            const memLine = lines.find((l: string) => l.includes('Memória:'));
            if (memLine) exMem = memLine.replace('Memória:', '').trim();
          }
          setFormData(prev => ({
            ...prev,
            title: data.title || '',
            category: data.category || '',
            description: cleanDesc,
            brand: exBrand || prev.brand,
            model: exModel || prev.model,
            memory: exMem || prev.memory,
            digital_product_link: digitalLink,
            price_brl: data.price ? data.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
            condition: data.condition || 'novo',
          }));
        }
      };
      fetchListing();
    }
  }, [listingId]);

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
            <PackageIcon className="h-5 w-5" />
            <span className="font-black text-sm sm:text-base">{currentId ? 'Editar anúncio' : 'Vender'}</span>
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

            {/* 1 — Título */}
            <Section step={1} title="Conte o que você está vendendo" description="Comece pelo título. Seja claro e direto." icon={Tag} done={completion.title}>
              <div className="space-y-2">
                <InputLabel required>Título do anúncio</InputLabel>
                <Input
                  placeholder="Ex.: iPhone 13 Pro 256GB Azul - Lacrado"
                  className="h-12 text-base bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-[#3483FA]/40"
                  maxLength={TITLE_MAX}
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                />
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>Inclua marca, modelo, capacidade e cor para aparecer em mais buscas.</span>
                  <span className={cn("font-mono", formData.title.length > TITLE_MAX - 10 && "text-orange-500", formData.title.length === TITLE_MAX && "text-red-500 font-bold")}>
                    {formData.title.length}/{TITLE_MAX}
                  </span>
                </div>
              </div>
            </Section>

            {/* 2 — Categoria */}
            <Section step={2} title="Categoria" description="Escolha onde seu anúncio será exibido." icon={Layers} done={completion.category}>
              <div className="space-y-2">
                <InputLabel required>Categoria do produto</InputLabel>
                <Popover open={openCategory} onOpenChange={setOpenCategory}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openCategory}
                      className="h-12 w-full justify-between bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 hover:bg-zinc-50 text-base font-normal"
                    >
                      <span className={formData.category ? 'text-zinc-900 font-medium' : 'text-zinc-400'}>
                        {formData.category || 'Selecione uma categoria'}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-lg shadow-xl bg-white" align="start">
                    <Command className="bg-white">
                      <CommandInput placeholder="Pesquisar categoria..." className="h-11 text-zinc-900 placeholder:text-zinc-400" />
                      <CommandList className="max-h-[300px] bg-white">
                        <CommandEmpty className="text-zinc-500">Nenhuma categoria encontrada.</CommandEmpty>
                        <CommandGroup>
                          {PRODUCT_CATEGORIES.map((cat) => (
                            <CommandItem
                              key={cat}
                              value={cat}
                              onSelect={() => {
                                setFormData(prev => ({ ...prev, category: cat }));
                                setOpenCategory(false);
                              }}
                              className="cursor-pointer !text-zinc-900 font-medium aria-selected:bg-blue-50 aria-selected:!text-zinc-900"
                            >
                              <Check className={cn("mr-2 h-4 w-4", formData.category === cat ? 'opacity-100 text-[#3483FA]' : 'opacity-0')} />
                              {cat}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </Section>

            {/* 3 — Condição */}
            <Section step={3} title="Condição do produto" description="Como o produto será entregue ao comprador?" icon={Sparkles} done={completion.condition}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { value: 'novo', label: 'Novo', desc: 'Lacrado, sem uso' },
                  { value: 'seminovo', label: 'Seminovo', desc: 'Pouco uso, ótimo estado' },
                  { value: 'usado', label: 'Usado', desc: 'Já utilizado' },
                  { value: 'digital', label: 'Digital', desc: 'Download / link' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, condition: opt.value }))}
                    className={cn(
                      "rounded-lg border-2 p-3 text-left transition-all",
                      formData.condition === opt.value
                        ? "border-[#3483FA] bg-blue-50 shadow-sm"
                        : "border-zinc-200 bg-white hover:border-zinc-300"
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {opt.value === 'digital' && <Download className="h-3.5 w-3.5 text-[#3483FA]" />}
                      <div className="font-bold text-sm text-zinc-900">{opt.label}</div>
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>

              {showElectronicsFields && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-zinc-100">
                  <div className="space-y-2">
                    <InputLabel>Marca</InputLabel>
                    <Select value={formData.brand} onValueChange={(v) => setFormData(prev => ({ ...prev, brand: v }))}>
                      <SelectTrigger className="h-11 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"><SelectValue placeholder="Marca" /></SelectTrigger>
                      <SelectContent className="max-h-[300px] bg-white">
                        {['Apple','ASUS','HONOR','Huawei','Infinix','JOVI','Motorola','Multi','Nothing','OPPO','Philco','POCO','realme','Redmi','Samsung','TCL','TECNO','Xiaomi','ZTE','Outra'].map(b => (
                          <SelectItem key={b} value={b} className="!text-zinc-900 font-medium">{b}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <InputLabel>Modelo</InputLabel>
                    <Input placeholder="Ex.: iPhone 13 Pro" className="h-11 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400" value={formData.model} onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <InputLabel>Memória / Capacidade</InputLabel>
                    <Input placeholder="Ex.: 256GB" className="h-11 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400" value={formData.memory} onChange={(e) => setFormData(prev => ({ ...prev, memory: e.target.value }))} />
                  </div>
                </div>
              )}
            </Section>

            {/* 4 — Fotos */}
            {!isDigital && (
              <Section step={4} title="Adicione fotos" description="A primeira foto será a capa do anúncio. Use imagens nítidas, em fundo claro." icon={Camera} done={completion.photos}>
                <ProductImageUpload maxImages={6} onFilesSelected={(files) => setProductImages(files)} />
                <div className="flex items-start gap-2 text-xs text-zinc-500 bg-blue-50 border border-blue-100 rounded-lg p-3">
                  <ImageIcon className="h-4 w-4 text-[#3483FA] shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-zinc-700">Dica:</strong> anúncios com 4 ou mais fotos vendem até 3× mais. Mínimo: 1 foto.
                  </div>
                </div>
              </Section>
            )}

            {/* 4 (digital) — Link de download */}
            {isDigital && (
              <Section step={4} title="Link do produto digital" description="O comprador receberá esse link após o pagamento." icon={LinkIcon} done={completion.digital}>
                <div className="space-y-2">
                  <InputLabel required>URL do arquivo</InputLabel>
                  <Input
                    placeholder="https://drive.google.com/..."
                    className="h-12 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
                    value={formData.digital_product_link}
                    onChange={(e) => setFormData(prev => ({ ...prev, digital_product_link: e.target.value, has_digital_files: true }))}
                  />
                </div>
                <div className="flex items-start gap-2 text-xs text-zinc-600 bg-blue-50 border border-blue-100 rounded-lg p-3">
                  <Info className="h-4 w-4 text-[#3483FA] shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p>• Aceitos: Google Drive, Dropbox, Mega, OneDrive ou seu próprio servidor.</p>
                    <p>• Garanta que o link esteja acessível publicamente ou com permissão.</p>
                    <p>• O comprador receberá o link automaticamente após o pagamento.</p>
                  </div>
                </div>
              </Section>
            )}

            {/* 5 — Descrição */}
            <Section step={5} title="Descrição" description="Explique tudo sobre o produto, sem repetir o título." icon={MessageCircle} done={completion.description}>
              <div className="space-y-2">
                <InputLabel>Detalhes do produto</InputLabel>
                <Textarea
                  placeholder="Características, estado de conservação, acessórios inclusos, motivo da venda, garantia, etc."
                  className="min-h-[160px] resize-y bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-[#3483FA]/40 text-sm"
                  maxLength={DESC_MAX}
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                />
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>Mínimo: 20 caracteres. Não inclua telefone ou e-mail aqui.</span>
                  <span className={cn("font-mono", formData.description.length > DESC_MAX - 50 && "text-orange-500")}>
                    {formData.description.length}/{DESC_MAX}
                  </span>
                </div>
              </div>
            </Section>

            {/* 6 — Preço e estoque */}
            <Section step={6} title="Preço e estoque" description="Quanto custa e quantos você tem disponíveis?" icon={Truck} done={completion.price}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <InputLabel required>Preço</InputLabel>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-semibold pointer-events-none">R$</span>
                    <Input
                      placeholder="0,00"
                      className="h-12 pl-12 text-lg font-bold bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
                      value={formData.price_brl}
                      onChange={(e) => setFormData(prev => ({ ...prev, price_brl: formatCurrency(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <InputLabel>Quantidade</InputLabel>
                  <Input
                    type="number"
                    min={1}
                    placeholder="1"
                    className="h-12 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
                    value={formData.quantity}
                    onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                  />
                </div>
              </div>

              {!isDigital && (
                <div className="space-y-2">
                  <InputLabel>Frete (opcional)</InputLabel>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-semibold pointer-events-none">R$</span>
                    <Input
                      placeholder="0,00"
                      className="h-12 pl-12 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
                      value={formData.shipping_fee}
                      onChange={(e) => setFormData(prev => ({ ...prev, shipping_fee: formatCurrency(e.target.value) }))}
                    />
                  </div>
                  <p className="text-xs text-zinc-500">Deixe vazio se for retirada presencial ou combinar com o comprador.</p>
                </div>
              )}
            </Section>

            {/* 7 — Contato */}
            <Section step={7} title="Como o comprador entra em contato?" description="Esses dados aparecem para o comprador depois da liberação." icon={Phone} done={completion.contact}>
              <div className="space-y-2">
                <InputLabel required>Nome</InputLabel>
                <Input
                  placeholder="Como você quer ser chamado"
                  className="h-11 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
                  value={contactData.contact_name}
                  onChange={(e) => setContactData(prev => ({ ...prev, contact_name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <InputLabel required>WhatsApp</InputLabel>
                  <Input
                    placeholder="(47) 99999-9999"
                    className="h-11 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
                    value={contactData.whatsapp_e164}
                    onChange={(e) => setContactData(prev => ({ ...prev, whatsapp_e164: formatPhone(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <InputLabel>Telefone (opcional)</InputLabel>
                  <Input
                    placeholder="(47) 99999-9999"
                    className="h-11 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
                    value={contactData.phone_e164}
                    onChange={(e) => setContactData(prev => ({ ...prev, phone_e164: formatPhone(e.target.value) }))}
                  />
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
                    : "bg-zinc-200 text-zinc-400 cursor-not-allowed hover:bg-zinc-200"
                )}
              >
                {loading ? 'Publicando...' : (currentId ? 'Salvar Alterações' : 'Publicar Anúncio')}
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
                      { key: 'category', label: 'Categoria', step: 2 },
                      { key: 'condition', label: 'Condição', step: 3 },
                      { key: isDigital ? 'digital' : 'photos', label: isDigital ? 'Link digital' : 'Pelo menos 1 foto', step: 4 },
                      { key: 'description', label: 'Descrição (20+ caracteres)', step: 5 },
                      { key: 'price', label: 'Preço', step: 6 },
                      { key: 'contact', label: 'Nome e WhatsApp', step: 7 },
                    ].map(item => (
                      <li key={item.key}>
                        <button
                          type="button"
                          onClick={() => document.getElementById(`section-${item.step}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
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
                    Você publica sem custo. Só paga pelos créditos quando alguém entrar em contato com você.
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

export default ProductForm;
