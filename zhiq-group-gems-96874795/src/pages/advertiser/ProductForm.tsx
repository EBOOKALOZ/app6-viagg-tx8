import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
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
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Check,
  ChevronsUpDown,
  Link,
  Info,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProductImageUpload } from '@/components/advertiser/ProductImageUpload';

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

export const ProductForm = () => {
  const { user } = useAuth();
  const { productId, listingId } = useParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(listingId || productId || null);

  const [openCategory, setOpenCategory] = useState(false);
  const [productImages, setProductImages] = useState<File[]>([]);

  // ── Form States ──
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

  const handleSave = async () => {
    setLoading(true);
    try {
      if (!formData.title || !formData.category || !formData.price_brl) {
        toast.error("Preencha pelo menos o Título, Categoria e Preço.");
        setLoading(false);
        return;
      }

      if (!user) {
        toast.error("Usuário não autenticado.");
        return;
      }

      // 1. Obter ou criar advertiser_account
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

      // Construir descrição: digitais recebem link, físicos recebem marca/modelo/memória
      let description = formData.description;
      if (formData.condition === 'digital') {
        if (formData.digital_product_link) {
          description += `\n\nLink de download: ${formData.digital_product_link}`;
        }
      } else {
        description += `\n\nMarca: ${formData.brand}\nModelo: ${formData.model}\nMemória: ${formData.memory}`;
      }

      let listingIdResult = currentId;

      if (currentId) {
        // Atualizar anúncio existente
        const { error: updateError } = await supabase
          .from('advertiser_listings' as any)
          .update({
            title: formData.title,
            category: formData.category,
            description: description,
            price: priceNumeric || 0,
            condition: formData.condition,
            listing_status: 'active'
          })
          .eq('id', currentId);

        if (updateError) throw updateError;
      } else {
        // Inserir novo anúncio
        const { data: listingData, error: insertError } = await supabase
          .from('advertiser_listings' as any)
          .insert({
            advertiser_account_id: accountId,
            title: formData.title,
            category: formData.category,
            description: description,
            price: priceNumeric || 0,
            condition: formData.condition,
            listing_status: 'active'
          })
          .select('id')
          .single();

        if (insertError) throw insertError;
        listingIdResult = listingData.id;
      }

      // 3. Upload de imagens
      if (productImages.length > 0 && listingIdResult) {
        toast.success("Anúncio criado, enviando imagens...");
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
              storage_path: uploadData.path
            });

            if (index === 0) {
              const { data: { publicUrl } } = supabase.storage
                .from('marketing-materials')
                .getPublicUrl(uploadData.path);

              await supabase.from('advertiser_listings' as any).update({
                cover_image_url: publicUrl
              }).eq('id', listingIdResult);
            }
          }
        }
        }

        toast.success("Anúncio publicado com sucesso!");
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

   // Buscar dados para edição
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
              condition: data.condition || 'novo'
            }));
          }
       };
       fetchListing();
     }
   }, [listingId]);

  return (
    <div className="min-h-screen pb-20 animate-in fade-in duration-700">
      <div className="container max-w-5xl mx-auto px-4 py-8 space-y-10">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-2xl hover:bg-blue-50 hover:text-blue-600 transition-all">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="space-y-1">
              <h1 className="text-3xl font-black text-zinc-900 tracking-tighter uppercase flex items-center gap-3">
                <PackageIcon className="w-8 h-8 text-blue-500" />
                Anunciar Produto
              </h1>
              <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Marketplace Viagg-TX8</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3">
            {[
              { id: 1, name: 'Dados', icon: PackageIcon },
              { id: 2, name: 'Contato', icon: CheckCircle2 },
              { id: 3, name: 'Pacote', icon: CreditCard },
            ].map((s, idx) => (
              <React.Fragment key={idx}>
                <div className={cn(
                  'flex items-center gap-2 px-6 py-3 rounded-2xl transition-all font-black text-[10px] uppercase tracking-widest border-2',
                  step === s.id ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-600/20' : 'bg-white border-zinc-100 text-zinc-400'
                )}>
                  <s.icon className="w-4 h-4" /> {s.name}
                </div>
                {idx < 2 && <div className="w-4 h-0.5 bg-zinc-100 rounded-full" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-8 space-y-10">

            {/* STEP 1: DADOS DO PRODUTO */}
            {step === 1 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <section className="space-y-8">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black text-sm">01</span>
                    <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Dados do Produto</h2>
                  </div>

                  <Card className="rounded-3xl border-zinc-100 bg-white shadow-sm">
                    <CardContent className="p-8 space-y-8">
                      {/* Título */}
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Título do Anúncio</label>
                        <Input
                          placeholder="Ex: iPhone 13 Pro 256GB, lacrado, caixa completa"
                          className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 transition-all font-bold !text-black"
                          style={{ color: '#000000' }}
                          value={formData.title}
                          onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                        />
                      </div>

                      {/* Categoria + Condição */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-3 flex flex-col">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Categoria</label>
                          <Popover open={openCategory} onOpenChange={setOpenCategory}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openCategory}
                                className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold justify-between text-zinc-900 w-full hover:bg-zinc-50 hover:text-zinc-900"
                              >
                                {formData.category ? formData.category : "Selecione uma categoria..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-2xl shadow-xl border-zinc-100" align="start">
                              <Command>
                                <CommandInput placeholder="Pesquisar categoria..." className="h-11" />
                                <CommandList className="max-h-[300px]">
                                  <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
                                  <CommandGroup>
                                    {PRODUCT_CATEGORIES.map((cat) => (
                                      <CommandItem
                                        key={cat}
                                        value={cat}
                                        onSelect={() => {
                                          setFormData(prev => ({ ...prev, category: cat }));
                                          setOpenCategory(false);
                                        }}
                                        className="font-bold text-sm rounded-xl cursor-pointer !text-black aria-selected:bg-blue-50 aria-selected:text-blue-600"
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            formData.category === cat ? "opacity-100 text-blue-600" : "opacity-0"
                                          )}
                                        />
                                        {cat}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Condição</label>
                          <Select value={formData.condition} onValueChange={(v) => setFormData(prev => ({ ...prev, condition: v }))}>
                            <SelectTrigger className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold !text-black">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="novo">Novo</SelectItem>
                              <SelectItem value="seminovo">Seminovo</SelectItem>
                              <SelectItem value="usado">Usado</SelectItem>
                              <SelectItem value="digital">
                                <span className="flex items-center gap-2"><Download className="w-3.5 h-3.5 text-blue-500" /> Digital (Download)</span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Marca/Modelo/Memória — only for physical products */}
                      {formData.condition !== 'digital' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Marca</label>
                          <Select value={formData.brand} onValueChange={(v) => setFormData(prev => ({ ...prev, brand: v }))}>
                            <SelectTrigger className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold !text-black" style={{ color: '#000000' }}>
                              <SelectValue placeholder="Selecione a marca" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                              {[
                                "Apple", "ASUS", "HONOR", "Huawei", "Infinix", "JOVI", "Motorola", "Multi", "Nothing", "OPPO", "Philco", "POCO", "realme", "Redmi", "Samsung", "TCL", "TECNO", "Xiaomi", "ZTE", "Outra"
                              ].map((brand) => (
                                <SelectItem key={brand} value={brand} className="font-bold !text-black">
                                  {brand}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Modelo</label>
                          <Input placeholder="Ex: iPhone 13 Pro" className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold !text-black" style={{ color: '#000000' }} value={formData.model} onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))} />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Memória</label>
                          <Input placeholder="Ex: 256GB" className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold !text-black" style={{ color: '#000000' }} value={formData.memory} onChange={(e) => setFormData(prev => ({ ...prev, memory: e.target.value }))} />
                        </div>
                      </div>
                      )}

                      {/* Preço + Quantidade */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Preço (R$)</label>
                          <Input placeholder="0,00" className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold !text-black" style={{ color: '#000000' }} value={formData.price_brl} onChange={(e) => setFormData(prev => ({ ...prev, price_brl: formatCurrency(e.target.value) }))} />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Quantidade</label>
                          <Input type="number" placeholder="1" className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold !text-black" style={{ color: '#000000' }} value={formData.quantity} onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))} />
                        </div>
                      </div>

                       {/* Frete — only for physical products */}
                       {formData.condition !== 'digital' && (
                       <div className="space-y-3">
                         <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Frete (R$, opcional)</label>
                         <Input placeholder="0,00" className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold !text-black" style={{ color: '#000000' }} value={formData.shipping_fee} onChange={(e) => setFormData(prev => ({ ...prev, shipping_fee: formatCurrency(e.target.value) }))} />
                       </div>
                       )}

                       {/* ══════ SEÇÃO: PRODUTO DIGITAL (LINK ÚNICO) ══════ */}
                       {formData.condition === 'digital' && (
                         <div className="space-y-6 pt-8 border-t-2 border-dashed border-blue-200">
                           <div className="flex items-center justify-between">
                             <div className="flex items-center gap-3">
                               <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                                 <Link className="w-5 h-5 text-white" />
                               </div>
                               <div>
                                 <h3 className="text-sm font-black text-zinc-800 uppercase tracking-wide">
                                   Link de Download / Acesso
                                 </h3>
                                 <p className="text-[10px] text-zinc-400 font-bold">Cole o link do seu produto digital (Google Drive, Dropbox, etc.)</p>
                               </div>
                             </div>
                           </div>

                           <div className="space-y-3">
                             <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">URL do Produto</label>
                             <Input
                               placeholder="https://exemplo.com/arquivo.pdf"
                               className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold !text-black"
                               style={{ color: '#000000' }}
                               value={formData.digital_product_link || ''}
                               onChange={(e) => setFormData(prev => ({ ...prev, digital_product_link: e.target.value, has_digital_files: true }))}
                             />
                           </div>

                           <div className="p-4 bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 rounded-2xl border border-blue-200/60">
                             <div className="flex items-start gap-3">
                               <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                                 <Info className="w-4 h-4 text-blue-600" />
                               </div>
                               <div className="text-[11px] text-blue-800 font-bold space-y-1.5">
                                 <p className="font-black text-xs text-blue-900">Como funciona?</p>
                                 <p>• Cole o link do seu arquivo (Google Drive, Dropbox, Mega, etc.)</p>
                                 <p>• O comprador receberá o link automaticamente após o pagamento</p>
                                 <p>• Certifique-se de que o link está público e acessível</p>
                               </div>
                             </div>
                           </div>
                         </div>
                       )}

                      {/* Descrição */}
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Descrição do Produto</label>
                        <Textarea
                          placeholder="Descreva as características, estado, acessórios inclusos..."
                          className="min-h-[150px] rounded-[30px] border-zinc-100 bg-zinc-50 font-medium p-6 border-2 focus:border-blue-500 transition-all !text-black"
                          style={{ color: '#000000' }}
                          value={formData.description}
                          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        />
                      </div>

                      {/* Fotos do Produto */}
                      <div className="space-y-4 pt-6 border-t border-zinc-100">
                        <div className="flex flex-col">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Fotos do Produto (Até 6 imagens)</label>
                          <p className="text-xs text-zinc-500 font-bold mb-4 ml-1">Adicione fotos reais do aparelho para atrair mais compradores.</p>
                        </div>
                        <ProductImageUpload 
                          maxImages={6} 
                          onFilesSelected={(files) => setProductImages(files)} 
                        />
                      </div>
                    </CardContent>
                  </Card>
                </section>

                <div className="flex justify-end">
                  <Button onClick={() => setStep(2)} className="h-16 px-12 rounded-[24px] bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs tracking-[0.2em] shadow-2xl shadow-blue-600/20 group gap-3">
                    Próximo Passo <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-all" />
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 2: CONTATO */}
            {step === 2 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <section className="space-y-8">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black text-sm">02</span>
                    <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Dados de Contato</h2>
                  </div>

                  <Card className="rounded-3xl border-zinc-100 bg-white shadow-sm">
                    <CardContent className="p-8 space-y-8">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Nome do Vendedor</label>
                        <Input placeholder="Seu nome completo" className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold !text-black" style={{ color: '#000000' }} value={contactData.contact_name} onChange={(e) => setContactData(prev => ({ ...prev, contact_name: e.target.value }))} />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">WhatsApp</label>
                        <Input placeholder="(47) 99999-9999" className="h-14 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold !text-black" style={{ color: '#000000' }} value={contactData.whatsapp_e164} onChange={(e) => setContactData(prev => ({ ...prev, whatsapp_e164: formatPhone(e.target.value) }))} />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Telefone (opcional)</label>
                        <Input placeholder="(47) 99999-9999" className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold !text-black" style={{ color: '#000000' }} value={contactData.phone_e164} onChange={(e) => setContactData(prev => ({ ...prev, phone_e164: formatPhone(e.target.value) }))} />
                      </div>
                    </CardContent>
                  </Card>
                </section>

                <div className="flex justify-end gap-4">
                  <Button variant="outline" onClick={() => setStep(1)} className="h-16 px-8 rounded-[24px] font-black uppercase text-xs tracking-[0.2em] border-2 border-zinc-100 text-zinc-500 hover:bg-zinc-50">
                    Voltar
                  </Button>
                  <Button disabled={loading} onClick={handleSave} className="h-16 px-12 rounded-[24px] bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-xs tracking-[0.2em] shadow-2xl shadow-emerald-600/20 group gap-3">
                    {loading ? "Salvando..." : "Salvar Anúncio"} <CheckCircle2 className="w-5 h-5 transition-transform group-hover:scale-110" />
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3: PACOTES (comentado para debug) */}
            {false && step === 3 && (
              <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <section className="space-y-8">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black text-sm">03</span>
                    <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Escolha seu Pacote</h2>
                  </div>

                   <Card className="rounded-3xl border-zinc-100 bg-white shadow-sm p-8">
                     <div className="space-y-4 mb-8">
                       <div className="p-4 bg-gradient-to-r from-emerald-50 to-blue-50 rounded-2xl border border-emerald-100">
                         <div className="flex items-center gap-3">
                           <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                           <div>
                             <p className="text-sm font-bold !text-black">Anúncio 100% Grátis</p>
                             <p className="text-xs text-zinc-600">Você só paga pelos créditos quando alguém entrar em contato com você.</p>
                           </div>
                         </div>
                       </div>
                     </div>

                     {/* Pacotes */}
                     <div className="mt-8">
                       <VehicleAutoPackages
                         onSelect={handleSelectPackage}
                         selectedId={selectedPackage?.id || null}
                       />
                     </div>
                   </Card>
                 </section>
               </div>
              )}

            </div>
            {/* Sidebar */}
          <div className="lg:col-span-4 space-y-8">
            <div className="sticky top-28 space-y-8">
              <Card className="bg-gradient-to-br from-emerald-700 to-emerald-900 border-none shadow-3xl rounded-[40px] text-white overflow-hidden p-10 space-y-6">
                <div className="p-1 border border-white/20 rounded-3xl w-fit bg-white/10">
                  <CheckCircle2 className="w-8 h-8 text-white shadow-3xl shadow-white/30" />
                </div>
                <div className="space-y-3">
                  <h3 className="text-2xl font-black tracking-tighter leading-tight uppercase">Venda sem Taxas</h3>
                  <p className="text-white/80 text-xs leading-relaxed font-bold tracking-wide">
                    Publique seu produto gratuitamente. Pague apenas pelos contatos qualificados que receber.
                  </p>
                </div>
                <div className="space-y-4 pt-6 border-t border-white/10 uppercase font-black text-[9px] tracking-widest text-white/70">
                  <div className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-white" /> Zero taxas de anúncio</div>
                  <div className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-white" /> Pague só pelos contatos</div>
                  <div className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-white" /> Acesso direto ao comprador</div>
                </div>
              </Card>
              </div>
              </div>

           </div>
      </div>
    </div>
  );
};

export default ProductForm;
