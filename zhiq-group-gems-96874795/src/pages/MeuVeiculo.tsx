import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MotoboyPageTemplate } from '@/components/motoboy/MotoboyPageTemplate';
import { compressImage } from '@/lib/imageCompressor';
import { moderatedUpload } from '@/lib/moderation/moderatedUpload';
import { moderatedText } from '@/lib/moderation/moderatedText';
import {
  Car, Bike, Plus, Trash2, Pencil, Check, Camera,
  Accessibility, Star, Loader2, X,
} from 'lucide-react';

// ─── Constantes ───────────────────────────────────────────────────────────────
const CAR_BRANDS = [
  'Chevrolet', 'Volkswagen', 'Fiat', 'Toyota', 'Honda', 'Hyundai',
  'Renault', 'Nissan', 'Jeep', 'BYD', 'Outra',
];

const MOTO_BRANDS = [
  'Honda', 'Yamaha', 'Suzuki', 'Kawasaki', 'Haojue', 'Dafra',
  'Shineray', 'Traxx', 'BMW', 'Ducati', 'Royal Enfield', 'KTM', 'Outra',
];

const COLOR_OPTIONS = [
  'Branco', 'Preto', 'Prata', 'Cinza', 'Vermelho',
  'Azul', 'Verde', 'Amarelo', 'Outra',
];

const ACCESSIBILITY_FEATURES = [
  'Espaço para cadeira de rodas',
  'Plataforma elevatória',
  'Rampa de acesso',
  'Porta ampla',
  'Cinto especial',
  'Porta-malas adaptado',
  'Outro',
];

/** Placa BR — antigo ABC1234 e Mercosul ABC1D23 */
const PLATE_REGEX = /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/;

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1950;
const MAX_YEAR = CURRENT_YEAR + 1;

const PHOTO_SLOTS: { slot: PhotoSlot; label: string }[] = [
  { slot: 'front_photo', label: 'Foto frontal' },
  { slot: 'rear_photo', label: 'Foto traseira' },
  { slot: 'side_photo', label: 'Foto lateral' },
  { slot: 'interior_photo', label: 'Foto interna' },
];

// ─── Tipos ─────────────────────────────────────────────────────────────────────
type VehicleType = 'carro' | 'moto';
type PhotoSlot = 'front_photo' | 'rear_photo' | 'side_photo' | 'interior_photo';

interface DriverVehicle {
  id: string;
  driver_id: string;
  vehicle_type: VehicleType;
  brand: string;
  model: string;
  manufacture_year: number;
  plate: string;
  color: string;
  air_conditioning: boolean;
  passenger_capacity: number;
  accessible: boolean;
  accessibility_features: string[] | null;
  observations: string | null;
  front_photo: string | null;
  rear_photo: string | null;
  side_photo: string | null;
  interior_photo: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface VehicleForm {
  vehicle_type: VehicleType;
  brandSelect: string;
  brandCustom: string;
  model: string;
  manufacture_year: string;
  colorSelect: string;
  colorCustom: string;
  plate: string;
  air_conditioning: boolean | null;
  passenger_capacity: string;
  accessible: boolean | null;
  accessibility_features: string[];
  observations: string;
  front_photo: string;
  rear_photo: string;
  side_photo: string;
  interior_photo: string;
}

const EMPTY_FORM: VehicleForm = {
  vehicle_type: 'carro',
  brandSelect: '',
  brandCustom: '',
  model: '',
  manufacture_year: '',
  colorSelect: '',
  colorCustom: '',
  plate: '',
  air_conditioning: null,
  passenger_capacity: '',
  accessible: null,
  accessibility_features: [],
  observations: '',
  front_photo: '',
  rear_photo: '',
  side_photo: '',
  interior_photo: '',
};

export default function MeuVeiculo() {
  const { user } = useAuth();

  const [vehicles, setVehicles] = useState<DriverVehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleForm>(EMPTY_FORM);
  const [uploadingSlot, setUploadingSlot] = useState<PhotoSlot | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [photosVehicle, setPhotosVehicle] = useState<DriverVehicle | null>(null);

  const brandOptions = form.vehicle_type === 'moto' ? MOTO_BRANDS : CAR_BRANDS;

  // ─── Carregar lista ───────────────────────────────────────────────────────
  const loadVehicles = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('driver_vehicles')
        .select('*')
        .eq('driver_id', user.id)
        .order('active', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setVehicles((data as DriverVehicle[]) || []);
    } catch (err: any) {
      toast.error(`Erro ao carregar veículos: ${err?.message || 'falha desconhecida'}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    loadVehicles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ─── Formulário ───────────────────────────────────────────────────────────
  const openNewForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  };

  const startEdit = (v: DriverVehicle) => {
    const brandList = v.vehicle_type === 'moto' ? MOTO_BRANDS : CAR_BRANDS;
    const brandInList = brandList.includes(v.brand);
    const colorInList = COLOR_OPTIONS.includes(v.color);
    setForm({
      vehicle_type: v.vehicle_type,
      brandSelect: brandInList ? v.brand : 'Outra',
      brandCustom: brandInList ? '' : v.brand,
      model: v.model || '',
      manufacture_year: v.manufacture_year ? String(v.manufacture_year) : '',
      colorSelect: colorInList ? v.color : 'Outra',
      colorCustom: colorInList ? '' : v.color,
      plate: v.plate || '',
      air_conditioning: v.air_conditioning ?? null,
      passenger_capacity: v.passenger_capacity ? String(v.passenger_capacity) : '',
      accessible: v.accessible ?? null,
      accessibility_features: v.accessibility_features || [],
      observations: v.observations || '',
      front_photo: v.front_photo || '',
      rear_photo: v.rear_photo || '',
      side_photo: v.side_photo || '',
      interior_photo: v.interior_photo || '',
    });
    setEditingId(v.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const changeVehicleType = (type: VehicleType) => {
    setForm(prev => ({
      ...prev,
      vehicle_type: type,
      // marcas diferem entre carro/moto — reseta seleção
      brandSelect: '',
      brandCustom: '',
      // moto: sempre 1 passageiro
      passenger_capacity: type === 'moto' ? '1' : prev.passenger_capacity,
    }));
  };

  const toggleAccessibilityFeature = (feature: string) => {
    setForm(prev => ({
      ...prev,
      accessibility_features: prev.accessibility_features.includes(feature)
        ? prev.accessibility_features.filter(f => f !== feature)
        : [...prev.accessibility_features, feature],
    }));
  };

  // ─── Upload de foto ───────────────────────────────────────────────────────
  const uploadPhoto = async (file: File, slot: PhotoSlot) => {
    if (!user?.id) return;
    setUploadingSlot(slot);
    try {
      const compressed = await compressImage(file, { outputFormat: 'image/jpeg' });
      const modRes = await moderatedUpload(compressed.blob, {
        fileName: file.name,
        mime: 'image/jpeg',
        category: 'vehicles',
        targetBucket: 'driver-vehicles',
      });

      if (modRes.status === 'blocked') {
        toast.error(`Foto recusada pelo Viagg-TX8™: ${modRes.reason}`);
        return;
      }

      const finalUrl = modRes.publicUrl || supabase.storage.from('driver-vehicles').getPublicUrl(modRes.storagePath || `${user.id}/${crypto.randomUUID()}.jpg`).data.publicUrl;
      setForm(prev => ({ ...prev, [slot]: finalUrl }));
      if (modRes.status === 'approved') {
        toast.success('Foto aprovada e enviada!');
      } else {
        toast.info('Foto enviada e em análise de segurança.');
      }
    } catch (err: any) {
      toast.error(`Erro ao enviar foto: ${err?.message || 'falha no upload'}`);
    } finally {
      setUploadingSlot(null);
    }
  };

  // ─── Salvar ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user?.id) return;

    const finalBrand = form.brandSelect === 'Outra' ? form.brandCustom.trim() : form.brandSelect;
    const finalColor = form.colorSelect === 'Outra' ? form.colorCustom.trim() : form.colorSelect;
    const yearNum = parseInt(form.manufacture_year, 10);

    // ── Validação ──
    if (!form.brandSelect) return toast.error('Selecione a marca do veículo.');
    if (form.brandSelect === 'Outra' && !finalBrand) return toast.error('Digite a marca do veículo.');
    if (!form.model.trim()) return toast.error('Informe o modelo do veículo.');
    if (!form.manufacture_year.trim()) return toast.error('Informe o ano de fabricação.');
    if (Number.isNaN(yearNum) || yearNum < MIN_YEAR || yearNum > MAX_YEAR) {
      return toast.error(`Ano de fabricação inválido. Use um valor entre ${MIN_YEAR} e ${MAX_YEAR}.`);
    }
    if (!form.colorSelect) return toast.error('Selecione a cor do veículo.');
    if (form.colorSelect === 'Outra' && !finalColor) return toast.error('Digite a cor do veículo.');
    const plate = form.plate.trim().toUpperCase();
    if (!plate) return toast.error('Informe a placa do veículo.');
    if (!PLATE_REGEX.test(plate)) {
      return toast.error('Placa inválida. Use o formato ABC1234 (antigo) ou ABC1D23 (Mercosul).');
    }
    if (form.air_conditioning === null) return toast.error('Informe se o veículo tem ar-condicionado.');
    if (form.vehicle_type === 'carro' && !form.passenger_capacity) {
      return toast.error('Selecione o número de passageiros.');
    }
    if (form.accessible === null) return toast.error('Informe se o veículo é acessível.');
    if (form.accessible && form.accessibility_features.length === 0) {
      return toast.error('Selecione ao menos um recurso de acessibilidade.');
    }

    const passengerCapacity = form.vehicle_type === 'moto' ? 1 : parseInt(form.passenger_capacity, 10);

    setIsSaving(true);
    const textMod = await moderatedText({
      title: `${finalBrand} ${form.model.trim()}`,
      description: form.observations.trim() || '',
      category: 'vehicles',
    });

    if (textMod.status === 'blocked') {
      toast.error(`Texto bloqueado pela RIDV: ${textMod.reason}`);
      setIsSaving(false);
      return;
    }

    const isTextApproved = textMod.status === 'approved';

    const payload: any = {
      driver_id: user.id,
      vehicle_type: form.vehicle_type,
      brand: finalBrand,
      model: form.model.trim(),
      manufacture_year: yearNum,
      plate,
      color: finalColor,
      air_conditioning: form.air_conditioning,
      passenger_capacity: passengerCapacity,
      accessible: form.accessible,
      accessibility_features: form.accessible ? form.accessibility_features : [],
      observations: form.observations.trim() || null,
      front_photo: form.front_photo || null,
      rear_photo: form.rear_photo || null,
      side_photo: form.side_photo || null,
      interior_photo: form.interior_photo || null,
      moderation_status: isTextApproved ? 'approved' : 'pending_ai_analysis',
      ai_status: isTextApproved ? 'approved' : 'queued',
      moderation_reason: textMod.reason,
    };

    try {
      if (editingId) {
        const { error } = await (supabase as any)
          .from('driver_vehicles')
          .update(payload)
          .eq('id', editingId)
          .eq('driver_id', user.id);
        if (error) throw error;
        toast.success('Veículo atualizado com sucesso!');
      } else {
        // Primeiro veículo do usuário → já entra como ativo
        if (vehicles.length === 0) payload.active = true;
        const { error } = await (supabase as any)
          .from('driver_vehicles')
          .insert(payload);
        if (error) throw error;
        toast.success('Veículo cadastrado com sucesso!');
      }
      cancelForm();
      await loadVehicles();
    } catch (err: any) {
      toast.error(`Erro ao salvar: ${err?.message || 'falha desconhecida'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Tornar ativo ─────────────────────────────────────────────────────────
  const handleSetActive = async (id: string) => {
    setActivatingId(id);
    try {
      const { error } = await supabase.rpc('set_active_vehicle' as any, { p_vehicle_id: id });
      if (error) throw error;
      toast.success('Veículo definido como ativo!');
      await loadVehicles();
    } catch (err: any) {
      toast.error(`Erro ao ativar veículo: ${err?.message || 'falha desconhecida'}`);
    } finally {
      setActivatingId(null);
    }
  };

  // ─── Excluir ──────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    try {
      const { error } = await (supabase as any)
        .from('driver_vehicles')
        .delete()
        .eq('id', id)
        .eq('driver_id', user?.id);
      if (error) throw error;
      toast.success('Veículo excluído.');
      setConfirmDeleteId(null);
      await loadVehicles();
    } catch (err: any) {
      toast.error(`Erro ao excluir: ${err?.message || 'falha desconhecida'}`);
    }
  };

  // ─── Render helpers ───────────────────────────────────────────────────────
  const renderYesNo = (value: boolean | null, onChange: (v: boolean) => void) => (
    <div className="flex gap-2 mt-1">
      <Button
        type="button"
        variant={value === true ? 'default' : 'outline'}
        onClick={() => onChange(true)}
        className={value === true ? 'flex-1 bg-blue-600 hover:bg-blue-500 text-white' : 'flex-1'}
      >
        Sim
      </Button>
      <Button
        type="button"
        variant={value === false ? 'default' : 'outline'}
        onClick={() => onChange(false)}
        className={value === false ? 'flex-1 bg-blue-600 hover:bg-blue-500 text-white' : 'flex-1'}
      >
        Não
      </Button>
    </div>
  );

  const renderPhotoInput = (slot: PhotoSlot, label: string) => {
    const url = form[slot];
    const isUploading = uploadingSlot === slot;
    return (
      <div key={slot} className="space-y-1">
        <Label className="text-xs">{label}</Label>
        <label className="mt-1 flex flex-col items-center justify-center gap-1 h-32 rounded-lg border-2 border-dashed border-zinc-200 bg-zinc-50 cursor-pointer hover:border-blue-300 transition-colors overflow-hidden">
          {isUploading ? (
            <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
          ) : url ? (
            <img src={url} alt={label} className="h-full w-full object-cover" />
          ) : (
            <>
              <Camera className="h-6 w-6 text-zinc-400" />
              <span className="text-[10px] text-muted-foreground">Enviar foto</span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={isUploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadPhoto(file, slot);
              e.target.value = '';
            }}
          />
        </label>
        {url && !isUploading && (
          <button
            type="button"
            onClick={() => setForm(prev => ({ ...prev, [slot]: '' }))}
            className="text-[10px] text-red-500 hover:underline"
          >
            Remover foto
          </button>
        )}
      </div>
    );
  };

  const vehicleThumbs = (v: DriverVehicle) =>
    [v.front_photo, v.rear_photo, v.side_photo, v.interior_photo].filter(Boolean) as string[];

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <MotoboyPageTemplate title="Meu Veículo" icon={Car}>

      {/* ── Botão cadastrar ── */}
      {!showForm && (
        <Button
          onClick={openNewForm}
          className="w-full bg-primary hover:bg-primary/90 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Cadastrar veículo
        </Button>
      )}

      {/* ── Formulário ── */}
      {showForm && (
        <Card className="bg-white border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {form.vehicle_type === 'moto'
                ? <Bike className="h-4 w-4 text-blue-600" />
                : <Car className="h-4 w-4 text-blue-600" />}
              {editingId ? 'Editar veículo' : 'Cadastrar veículo'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Categoria */}
            <div>
              <Label className="text-xs">Categoria</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  type="button"
                  variant={form.vehicle_type === 'carro' ? 'default' : 'outline'}
                  onClick={() => changeVehicleType('carro')}
                  className={form.vehicle_type === 'carro' ? 'flex-1 bg-blue-600 hover:bg-blue-500 text-white' : 'flex-1'}
                >
                  <Car className="h-4 w-4 mr-2" /> Carro
                </Button>
                <Button
                  type="button"
                  variant={form.vehicle_type === 'moto' ? 'default' : 'outline'}
                  onClick={() => changeVehicleType('moto')}
                  className={form.vehicle_type === 'moto' ? 'flex-1 bg-blue-600 hover:bg-blue-500 text-white' : 'flex-1'}
                >
                  <Bike className="h-4 w-4 mr-2" /> Moto
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Marca */}
              <div className="space-y-1">
                <Label className="text-xs">Marca</Label>
                <Select value={form.brandSelect} onValueChange={(v) => setForm(prev => ({ ...prev, brandSelect: v }))}>
                  <SelectTrigger className="mt-1 bg-white border-zinc-200 !text-zinc-900 [&>span]:!text-zinc-900">
                    <SelectValue placeholder="Selecione a marca" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-zinc-900 border-zinc-200">
                    {brandOptions.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.brandSelect === 'Outra' && (
                  <Input
                    value={form.brandCustom}
                    onChange={(e) => setForm(prev => ({ ...prev, brandCustom: e.target.value }))}
                    placeholder="Digite a marca"
                    className="mt-1"
                  />
                )}
              </div>

              {/* Modelo */}
              <div className="space-y-1">
                <Label className="text-xs">Modelo</Label>
                <Input
                  value={form.model}
                  onChange={(e) => setForm(prev => ({ ...prev, model: e.target.value }))}
                  placeholder="Ex: Corolla, CG 160..."
                  className="mt-1"
                />
              </div>

              {/* Ano */}
              <div className="space-y-1">
                <Label className="text-xs">Ano de fabricação</Label>
                <Input
                  value={form.manufacture_year}
                  onChange={(e) => setForm(prev => ({ ...prev, manufacture_year: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  placeholder={String(CURRENT_YEAR)}
                  inputMode="numeric"
                  maxLength={4}
                  className="mt-1"
                />
              </div>

              {/* Cor */}
              <div className="space-y-1">
                <Label className="text-xs">Cor</Label>
                <Select value={form.colorSelect} onValueChange={(v) => setForm(prev => ({ ...prev, colorSelect: v }))}>
                  <SelectTrigger className="mt-1 bg-white border-zinc-200 !text-zinc-900 [&>span]:!text-zinc-900">
                    <SelectValue placeholder="Selecione a cor" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-zinc-900 border-zinc-200">
                    {COLOR_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.colorSelect === 'Outra' && (
                  <Input
                    value={form.colorCustom}
                    onChange={(e) => setForm(prev => ({ ...prev, colorCustom: e.target.value }))}
                    placeholder="Digite a cor"
                    className="mt-1"
                  />
                )}
              </div>

              {/* Placa */}
              <div className="space-y-1">
                <Label className="text-xs">Placa</Label>
                <Input
                  value={form.plate}
                  onChange={(e) => setForm(prev => ({ ...prev, plate: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7) }))}
                  placeholder="ABC1D23"
                  maxLength={7}
                  className="mt-1 uppercase"
                />
              </div>

              {/* Passageiros — só carro */}
              {form.vehicle_type === 'carro' && (
                <div className="space-y-1">
                  <Label className="text-xs">Número de passageiros</Label>
                  <Select value={form.passenger_capacity} onValueChange={(v) => setForm(prev => ({ ...prev, passenger_capacity: v }))}>
                    <SelectTrigger className="mt-1 bg-white border-zinc-200 !text-zinc-900 [&>span]:!text-zinc-900">
                      <SelectValue placeholder="Quantos passageiros?" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-zinc-900 border-zinc-200">
                      {Array.from({ length: 8 }, (_, i) => String(i + 1)).map(n => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Ar-condicionado */}
            <div>
              <Label className="text-xs">Ar-condicionado</Label>
              {renderYesNo(form.air_conditioning, (v) => setForm(prev => ({ ...prev, air_conditioning: v })))}
            </div>

            {/* Acessibilidade */}
            <div>
              <Label className="text-xs flex items-center gap-1.5">
                <Accessibility className="h-3.5 w-3.5 text-blue-500" /> Veículo acessível
              </Label>
              {renderYesNo(form.accessible, (v) => setForm(prev => ({ ...prev, accessible: v })))}
              {form.accessible && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ACCESSIBILITY_FEATURES.map(feature => {
                    const checked = form.accessibility_features.includes(feature);
                    return (
                      <label
                        key={feature}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border-2 cursor-pointer transition-all text-xs ${checked ? 'bg-blue-50 border-blue-400' : 'bg-white border-zinc-200 hover:border-zinc-300'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAccessibilityFeature(feature)}
                          className="h-4 w-4 shrink-0 accent-blue-600 cursor-pointer"
                        />
                        <span className="text-zinc-800">{feature}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Observações */}
            <div>
              <Label className="text-xs">Observações <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <textarea
                value={form.observations}
                onChange={(e) => setForm(prev => ({ ...prev, observations: e.target.value }))}
                placeholder="Detalhes adicionais sobre o veículo..."
                rows={3}
                className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>

            {/* Fotos */}
            <div>
              <Label className="text-xs flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5 text-blue-500" /> Fotos do veículo <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                {PHOTO_SLOTS.map(({ slot, label }) => renderPhotoInput(slot, label))}
              </div>
            </div>

            {/* Ações do formulário */}
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={cancelForm} className="flex-1" disabled={isSaving}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 bg-primary hover:bg-primary/90 text-white disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                {isSaving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Cadastrar veículo'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Lista de veículos ── */}
      {vehicles.length === 0 && !showForm ? (
        <Card className="bg-white">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <Car className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
            Você ainda não cadastrou nenhum veículo.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vehicles.map(v => {
            const thumbs = vehicleThumbs(v);
            return (
              <Card key={v.id} className={`bg-white ${v.active ? 'border-l-4 border-l-emerald-500' : ''}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {v.vehicle_type === 'moto'
                      ? <Bike className="h-4 w-4 text-blue-600" />
                      : <Car className="h-4 w-4 text-blue-600" />}
                    <span className="truncate">{v.brand} {v.model}</span>
                    {v.active && (
                      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5">
                        <Star className="h-3 w-3" /> ATIVO
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-1 text-xs text-zinc-700">
                    <p><span className="text-muted-foreground">Ano:</span> {v.manufacture_year}</p>
                    <p><span className="text-muted-foreground">Placa:</span> {v.plate}</p>
                    <p><span className="text-muted-foreground">Cor:</span> {v.color}</p>
                    <p><span className="text-muted-foreground">Ar-cond.:</span> {v.air_conditioning ? 'Sim' : 'Não'}</p>
                    {v.vehicle_type === 'carro' && (
                      <p><span className="text-muted-foreground">Passageiros:</span> {v.passenger_capacity}</p>
                    )}
                    <p><span className="text-muted-foreground">Acessível:</span> {v.accessible ? 'Sim' : 'Não'}</p>
                  </div>

                  {/* Miniaturas */}
                  {thumbs.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {thumbs.map((src, i) => (
                        <img key={i} src={src} alt={`Foto ${i + 1}`} className="h-14 w-14 object-cover rounded-md border border-zinc-200" />
                      ))}
                    </div>
                  )}

                  {/* Botões */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {!v.active && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleSetActive(v.id)}
                        disabled={activatingId === v.id}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white"
                      >
                        {activatingId === v.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                        Tornar ativo
                      </Button>
                    )}
                    {thumbs.length > 0 && (
                      <Button type="button" size="sm" variant="outline" onClick={() => setPhotosVehicle(v)}>
                        <Camera className="h-3.5 w-3.5 mr-1" /> Ver fotos
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" onClick={() => startEdit(v)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    {confirmDeleteId === v.id ? (
                      <>
                        <Button type="button" size="sm" onClick={() => handleDelete(v.id)} className="bg-red-600 hover:bg-red-500 text-white">
                          Confirmar
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)}>
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDeleteId(v.id)} className="text-red-600 border-red-200 hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Lightbox de fotos ── */}
      {photosVehicle && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPhotosVehicle(null)}
        >
          <div
            className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-zinc-900">
                {photosVehicle.brand} {photosVehicle.model} — {photosVehicle.plate}
              </h3>
              <button type="button" onClick={() => setPhotosVehicle(null)} className="p-1 rounded-full hover:bg-zinc-100">
                <X className="h-4 w-4 text-zinc-600" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PHOTO_SLOTS.map(({ slot, label }) => {
                const src = photosVehicle[slot];
                if (!src) return null;
                return (
                  <div key={slot} className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                    <a href={src} target="_blank" rel="noopener noreferrer">
                      <img src={src} alt={label} className="w-full rounded-lg border border-zinc-200" />
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </MotoboyPageTemplate>
  );
}
