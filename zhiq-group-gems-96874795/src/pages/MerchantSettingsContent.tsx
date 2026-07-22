import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const BR_STATES = [
  { uf: 'AC', nome: 'Acre' }, { uf: 'AL', nome: 'Alagoas' }, { uf: 'AP', nome: 'Amapá' },
  { uf: 'AM', nome: 'Amazonas' }, { uf: 'BA', nome: 'Bahia' }, { uf: 'CE', nome: 'Ceará' },
  { uf: 'DF', nome: 'Distrito Federal' }, { uf: 'ES', nome: 'Espírito Santo' }, { uf: 'GO', nome: 'Goiás' },
  { uf: 'MA', nome: 'Maranhão' }, { uf: 'MT', nome: 'Mato Grosso' }, { uf: 'MS', nome: 'Mato Grosso do Sul' },
  { uf: 'MG', nome: 'Minas Gerais' }, { uf: 'PA', nome: 'Pará' }, { uf: 'PB', nome: 'Paraíba' },
  { uf: 'PR', nome: 'Paraná' }, { uf: 'PE', nome: 'Pernambuco' }, { uf: 'PI', nome: 'Piauí' },
  { uf: 'RJ', nome: 'Rio de Janeiro' }, { uf: 'RN', nome: 'Rio Grande do Norte' }, { uf: 'RS', nome: 'Rio Grande do Sul' },
  { uf: 'RO', nome: 'Rondônia' }, { uf: 'RR', nome: 'Roraima' }, { uf: 'SC', nome: 'Santa Catarina' },
  { uf: 'SP', nome: 'São Paulo' }, { uf: 'SE', nome: 'Sergipe' }, { uf: 'TO', nome: 'Tocantins' },
];
import { Store, Loader2, Upload, Save, Camera, MapPin, Palette, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { StoreLocationPicker } from '@/components/merchant/StoreLocationPicker';
import { CategoriaAutocomplete } from '@/components/merchant/CategoriaAutocomplete';
import { saveMerchantStore, loadMerchantStore } from '@/lib/merchantStoreSave';
import { MerchantRecentEvents } from '@/components/merchant/MerchantRecentEvents';
import { useQueryClient } from '@tanstack/react-query';

/* ─── Form type (superset: inclui campos visuais não-persistidos) ─── */
interface StoreForm {
  /* Persistidos via RPC blindada */
  nome_loja: string;
  cnpj: string;
  descricao: string;
  categoria_id: string;
  categoria_nome: string;   // somente display
  telefone: string;
  email: string;
  street: string;
  number: string;
  neighborhood: string;
  cidade: string;
  estado: string;
  /* Visuais — não persistidos no banco */
  logo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  endereco_formatado: string | null;
}

const EMPTY_FORM: StoreForm = {
  nome_loja: '', cnpj: '', descricao: '', categoria_id: '', categoria_nome: '',
  telefone: '', email: '', street: '', number: '', neighborhood: '',
  cidade: '', estado: '',
  logo_url: null, latitude: null, longitude: null, endereco_formatado: null,
};

export default function MerchantSettingsContent() {
  const { availableProfiles, enableProfile, refreshProfiles, user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [form, setForm] = useState<StoreForm>({ ...EMPTY_FORM });
  const queryClient = useQueryClient();

  /* ═══════════════════════════════════════════
     LOAD — via camada centralizada (Nível 2)
  ═══════════════════════════════════════════ */
  useEffect(() => {
    if (user?.id) handleLoad();
  }, [user?.id]);

  const handleLoad = async () => {
    setIsLoading(true);
    try {
      const result = await loadMerchantStore();
      if (result.error) toast.error(`Erro ao carregar: ${result.error}`);
      if (result.data) {
        setForm(prev => ({
          ...prev,
          nome_loja: result.data!.nome_loja || '',
          cnpj: result.data!.cnpj || '',
          descricao: result.data!.descricao || '',
          categoria_id: result.data!.categoria_id || '',
          categoria_nome: result.data!.categoria_nome || '',
          telefone: result.data!.telefone || '',
          email: result.data!.email || '',
          street: result.data!.street || '',
          number: result.data!.number || '',
          neighborhood: result.data!.neighborhood || '',
          cidade: result.data!.cidade || '',
          estado: result.data!.estado || '',
          logo_url: result.data!.logo_url || null,
          latitude: result.data!.latitude != null ? Number(result.data!.latitude) : null,
          longitude: result.data!.longitude != null ? Number(result.data!.longitude) : null,
        }));
      }
    } finally {
      setIsLoading(false);
    }
  };

  /* ═══════════════════════════════════════════
     LOGO UPLOAD (somente visual, storage)
  ═══════════════════════════════════════════ */
  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem válida'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Máximo 2MB'); return; }
    setIsUploading(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) throw new Error('Sessão expirada.');
      const ext = file.name.split('.').pop() || 'png';
      const fileName = `logos/${authData.user.id}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('logos_lojas').upload(fileName, file, { upsert: true });
      if (error) throw new Error(error.message);
      const { data: { publicUrl } } = supabase.storage.from('logos_lojas').getPublicUrl(fileName);
      setForm(prev => ({ ...prev, logo_url: publicUrl }));
      toast.success('Logo enviada!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar logo');
    } finally {
      setIsUploading(false);
    }
  };

  /* ═══════════════════════════════════════════
     FORMAT HELPERS
  ═══════════════════════════════════════════ */
  const fmtDoc = (v: string) => {
    const n = v.replace(/\D/g, '');
    if (n.length <= 11) return n.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    return n.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  };

  const fmtPhone = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  };

  /* ═══════════════════════════════════════════
     LOCATION PICKER (preenche street/number/neighborhood)
  ═══════════════════════════════════════════ */
  const handleLocationChange = (
    lat: number, lng: number, endereco: string,
    details?: { cep?: string; rua?: string; numero?: string; bairro?: string; cidade?: string; estado?: string }
  ) => {
    setForm(prev => ({
      ...prev,
      latitude: lat,
      longitude: lng,
      endereco_formatado: endereco,
      street: details?.rua || prev.street,
      number: details?.numero || prev.number,
      neighborhood: details?.bairro || prev.neighborhood,
      cidade: details?.cidade || prev.cidade,
      estado: details?.estado || prev.estado,
    }));
  };

  /* ═══════════════════════════════════════════
     SAVE — via camada centralizada (Nível 2 → RPC Nível 3)
  ═══════════════════════════════════════════ */
  const handleSave = async () => {
    if (!form.nome_loja.trim()) { toast.error('Nome da loja é obrigatório'); return; }
    setIsSaving(true);
    try {
      const result = await saveMerchantStore(form);

      if (result.success) {
        toast.success('Dados da loja salvos com sucesso!');
        if (!availableProfiles.includes('merchant')) {
          try { await enableProfile('merchant'); await refreshProfiles(); } catch {}
        }
        await handleLoad();
        queryClient.invalidateQueries({ queryKey: ["merchant-store-data"] });
        queryClient.invalidateQueries({ queryKey: ["merchant-store"] });
        window.dispatchEvent(new Event('merchantProfileUpdated'));
      } else {
        toast.error(`Falha ao salvar: ${result.error}`);
      }
    } catch (err: any) {
      console.error('[Loja] Exception inesperada:', err);
      toast.error(`Erro inesperado: ${err?.message || 'Tente novamente'}`);
    } finally {
      setIsSaving(false);
    }
  };

  /* ═══════════════════════════════════════════ */

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-merchant" /></div>;
  }

  return (
    <div className="p-4 space-y-6 lg:max-w-none mx-auto w-full lg:py-8 lg:px-4 xl:px-6">

      <MerchantRecentEvents module="store" />

      {/* Aparência da Loja — personalização visual do perfil público */}
      <a
        href="/anunciante/aparencia"
        className="flex items-center justify-between gap-3 p-4 rounded-2xl border border-[#FF6A00]/30 bg-gradient-to-r from-[#FF6A00]/10 to-transparent hover:from-[#FF6A00]/20 transition-all group"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-[#FF6A00]/15 flex items-center justify-center shrink-0">
            <Palette className="h-5 w-5 text-[#FF6A00]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-foreground">Aparência da Loja</p>
            <p className="text-xs text-muted-foreground truncate">
              Cores, fundo, banner, cards e temas prontos da sua vitrine pública
            </p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-[#FF6A00] shrink-0 group-hover:translate-x-1 transition-transform" />
      </a>

      {/* Logo + Dados */}
      <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-8 space-y-6 lg:space-y-0">
        {/* Logo */}
        <Card className="lg:self-start">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Camera className="h-5 w-5 text-merchant" />Logo da Loja</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="h-24 w-24 lg:h-32 lg:w-32 rounded-xl border-2 border-dashed border-border bg-muted flex items-center justify-center overflow-hidden">
                {form.logo_url ? <img src={form.logo_url} alt="Logo" className="h-full w-full object-cover" /> : <Store className="h-10 w-10 text-muted-foreground" />}
              </div>
              {isUploading && <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-xl"><Loader2 className="h-6 w-6 animate-spin text-merchant" /></div>}
            </div>
            <Label htmlFor="logo-upload" className="cursor-pointer">
              <div className="flex items-center gap-2 text-sm text-merchant hover:underline"><Upload className="h-4 w-4" />{form.logo_url ? 'Alterar logo' : 'Enviar logo'}</div>
              <input id="logo-upload" type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={isUploading} />
            </Label>
            <p className="text-xs text-muted-foreground">PNG, JPG ou WEBP. Máximo 2MB.</p>
          </CardContent>
        </Card>

        {/* Dados */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Store className="h-5 w-5 text-merchant" />Dados da Loja</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-4 lg:space-y-0">
              <div className="space-y-2">
                <Label htmlFor="nome_loja">Nome da Loja *</Label>
                <Input id="nome_loja" placeholder="Ex: Pizzaria do João" value={form.nome_loja} onChange={(e) => setForm(p => ({ ...p, nome_loja: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cnpj">CPF ou CNPJ</Label>
                <Input id="cnpj" placeholder="000.000.000-00" value={form.cnpj} onChange={(e) => setForm(p => ({ ...p, cnpj: fmtDoc(e.target.value) }))} maxLength={18} />
              </div>
            </div>
            <div className="space-y-2 relative z-[60]">
              <Label>Categoria da Loja</Label>
              <CategoriaAutocomplete valueId={form.categoria_id} valueName={form.categoria_nome} onChange={(id, nome) => setForm(p => ({ ...p, categoria_id: id, categoria_nome: nome }))} theme="light" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Input id="descricao" placeholder="Breve descrição da sua loja" value={form.descricao} onChange={(e) => setForm(p => ({ ...p, descricao: e.target.value }))} />
            </div>
            <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-4 lg:space-y-0">
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone / WhatsApp</Label>
                <Input id="telefone" placeholder="(00) 00000-0000" value={fmtPhone(form.telefone)} onChange={(e) => setForm(p => ({ ...p, telefone: e.target.value.replace(/\D/g, '') }))} maxLength={15} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail da Loja</Label>
                <Input id="email" type="email" placeholder="contato@minhaloja.com" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Endereço + Mapa */}
      <div className="lg:grid lg:grid-cols-[1fr_1fr] lg:gap-8 space-y-6 lg:space-y-0">
        <Card>
          <CardHeader><CardTitle className="text-lg">Endereço</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="lg:grid lg:grid-cols-[2fr_1fr] lg:gap-4 space-y-4 lg:space-y-0">
              <div className="space-y-2">
                <Label htmlFor="street">Rua</Label>
                <Input id="street" placeholder="Nome da rua" value={form.street} onChange={(e) => setForm(p => ({ ...p, street: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="number">Número</Label>
                <Input id="number" placeholder="123" value={form.number} onChange={(e) => setForm(p => ({ ...p, number: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="neighborhood">Bairro</Label>
              <Input id="neighborhood" placeholder="Nome do bairro" value={form.neighborhood} onChange={(e) => setForm(p => ({ ...p, neighborhood: e.target.value }))} />
            </div>
            <div className="lg:grid lg:grid-cols-[2fr_1fr] lg:gap-4 space-y-4 lg:space-y-0">
              <div className="space-y-2">
                <Label htmlFor="cidade">Cidade</Label>
                <Input id="cidade" placeholder="Ex: São Paulo" value={form.cidade} onChange={(e) => setForm(p => ({ ...p, cidade: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estado">Estado (UF)</Label>
                <Select value={form.estado || undefined} onValueChange={(v) => setForm(p => ({ ...p, estado: v }))}>
                  <SelectTrigger id="estado" className="text-white [&>span]:text-white">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {BR_STATES.map(s => (
                      <SelectItem key={s.uf} value={s.uf} className="text-black focus:text-black">{s.uf} — {s.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Coordenadas */}
            {form.latitude != null && form.longitude != null && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/60">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <MapPin className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Coordenadas</p>
                  <p className="text-sm font-mono text-foreground">{form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <StoreLocationPicker latitude={form.latitude} longitude={form.longitude} endereco_formatado={form.endereco_formatado} onLocationChange={handleLocationChange} />
      </div>

      {/* Save */}
      <div className="pt-4 pb-6 lg:flex lg:justify-end">
        <Button onClick={handleSave} className="w-full lg:w-auto lg:min-w-[280px] bg-merchant hover:bg-merchant-hover" size="lg" disabled={isSaving}>
          {isSaving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
