import { Fragment, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AvatarUpload } from '@/components/profile/AvatarUpload';
import { StoreLocationMap } from '@/components/StoreLocationMap';
import { MathCaptchaDialog } from '@/components/ui/math-captcha-dialog';
import { brazilianStates } from '@/lib/brazilianStates';
import { isProfileRegistrationComplete } from '@/lib/profileValidation';
import { parseCoordinates } from '@/lib/coordinateParser';
import { compressImage } from '@/lib/imageCompressor';
import { cn } from '@/lib/utils';
import {
  User as UserIcon, Check, ChevronsUpDown, Phone, Car, Bike, MapPin, Lock, Home, Mail, Users,
  ShieldCheck, Accessibility, Camera, Loader2, X, ChevronLeft, ChevronRight,
  Sparkles, CheckCircle2, UploadCloud, ClipboardCheck, AlertCircle, Info, CreditCard, CalendarDays,
} from 'lucide-react';

/* ════════════════════════════════════════════════════════════════════════
   ProfessionalWizard — cadastro premium multi-etapas (Motoboy / Moto-Táxi /
   Motorista de Carro).

   REGRA DE OURO: esta tela é SÓ camada de UI/UX. Todas as chamadas de
   carregamento e salvamento abaixo são copiadas 1:1 de:
     - src/pages/VehicleProfileContent.tsx  (perfil pessoal + operacional)
     - src/pages/MeuVeiculo.tsx             (driver_vehicles + fotos)
   Nenhuma regra de negócio, RPC, tabela ou policy foi alterada.
════════════════════════════════════════════════════════════════════════ */

// ─── Opções compartilhadas (copiadas verbatim de VehicleProfileContent.tsx) ─
const PASSENGER_OPTIONS = [
  { value: '1', label: '1 passageiro' },
  { value: '2', label: '2 passageiros' },
  { value: '3', label: '3 passageiros' },
  { value: '4', label: '4 passageiros' },
  { value: '5', label: '5 passageiros' },
  { value: '6', label: '6 passageiros' },
  { value: '7', label: '7 passageiros' },
];

const VEHICLE_TYPE_DRIVER = [
  { value: 'hatchback', label: 'Hatchback' },
  { value: 'sedan', label: 'Sedã' },
  { value: 'suv', label: 'SUV' },
  { value: 'minivan', label: 'Minivan' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'outro', label: 'Outro' },
];

const VEHICLE_TYPE_MOTOTAXI = [
  { value: 'moto_125cc', label: 'Moto 125cc' },
  { value: 'moto_150cc', label: 'Moto 150cc' },
  { value: 'moto_250cc', label: 'Moto 250cc+' },
  { value: 'scooter', label: 'Scooter' },
];

const MOTO_BRANDS = [
  'Honda', 'Yamaha', 'Suzuki', 'Kawasaki', 'Haojue',
  'Dafra', 'Shineray', 'Traxx', 'BMW', 'Ducati',
  'Royal Enfield', 'KTM', 'Outra',
];

const CAR_BRANDS = [
  'Fiat', 'Chevrolet', 'Volkswagen', 'Ford', 'Toyota',
  'Honda', 'Hyundai', 'Renault', 'Jeep', 'Nissan',
  'Citroën', 'Peugeot', 'Outra',
];

const COLOR_OPTIONS = [
  { value: 'Preto', label: 'Preto' },
  { value: 'Branco', label: 'Branco' },
  { value: 'Prata', label: 'Prata' },
  { value: 'Vermelho', label: 'Vermelho' },
  { value: 'Azul', label: 'Azul' },
  { value: 'Verde', label: 'Verde' },
  { value: 'Amarelo', label: 'Amarelo' },
  { value: 'Outra', label: 'Outra' },
];

// ─── Constantes copiadas verbatim de MeuVeiculo.tsx ─────────────────────────
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

const DOB_MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const DOB_YEARS = Array.from({ length: 100 }, (_, i) => CURRENT_YEAR - i);

type PhotoSlot = 'front_photo' | 'rear_photo' | 'side_photo' | 'interior_photo';

const PHOTO_SLOTS: { slot: PhotoSlot; label: string; hint: string }[] = [
  { slot: 'front_photo', label: 'Foto frontal', hint: 'Vista de frente, placa visível' },
  { slot: 'rear_photo', label: 'Foto traseira', hint: 'Vista de trás, placa visível' },
  { slot: 'side_photo', label: 'Foto lateral', hint: 'Perfil lateral completo' },
  { slot: 'interior_photo', label: 'Foto interna', hint: 'Bancos e painel' },
];

const TOTAL_STEPS = 6;

// ─── Estilos reutilizáveis (claro + escuro) ─────────────────────────────────
const cardClass = 'rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg shadow-zinc-200/40 dark:shadow-black/30';
const selectTriggerClass = 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 [&>span]:text-zinc-900 dark:[&>span]:text-zinc-100';
const selectContentClass = 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700';
const errorInputClass = 'border-red-500 focus-visible:ring-red-500 dark:border-red-500';

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface WizardData {
  // Etapa 1 — pessoal
  name: string;
  email: string;
  cpf: string;
  data_nascimento: string;
  avatar_url: string;
  // Etapa 2 — endereço / operacional
  whatsapp: string;
  /** repassado sem input próprio — igual VehicleProfileContent (round-trip silencioso) */
  cpf_cnpj: string;
  cep: string;
  logradouro: string;
  cidade: string;
  estado: string;
  bairro: string;
  latitude_residencia: number | null;
  longitude_residencia: number | null;
  endereco_residencia: string;
  // Etapa 3 — veículo (compartilhado entre operacional e driver_vehicles)
  veiculo_placa: string;
  veiculo_modelo: string;
  veiculo_ano: string;
  brandSelect: string;
  brandCustom: string;
  colorSelect: string;
  colorCustom: string;
  /** tipo_veiculo → salvo como capacidade_garupa no RPC operacional */
  tipo_veiculo: string;
  /** capacidade de bagageiro/entrega (só motoboy) → salvo como capacidade_bag no RPC operacional */
  capacidade_bag_motoboy: string;
  /** capacidade de passageiros do driver_vehicles (só carro) */
  passenger_capacity: string;
  air_conditioning: boolean | null;
  accessible: boolean | null;
  accessibility_features: string[];
  observations: string;
  // Etapa 4 — fotos (driver_vehicles)
  front_photo: string;
  rear_photo: string;
  side_photo: string;
  interior_photo: string;
}

function emptyWizardData(): WizardData {
  return {
    name: '', email: '', cpf: '', data_nascimento: '', avatar_url: '',
    whatsapp: '', cpf_cnpj: '', cep: '', logradouro: '', cidade: '', estado: '', bairro: '',
    latitude_residencia: null, longitude_residencia: null, endereco_residencia: '',
    veiculo_placa: '', veiculo_modelo: '', veiculo_ano: '',
    brandSelect: '', brandCustom: '', colorSelect: '', colorCustom: '',
    tipo_veiculo: '', capacidade_bag_motoboy: '', passenger_capacity: '',
    air_conditioning: null, accessible: null, accessibility_features: [], observations: '',
    front_photo: '', rear_photo: '', side_photo: '', interior_photo: '',
  };
}

function splitBrandValue(value: string, list: string[]): { select: string; custom: string } {
  if (!value) return { select: '', custom: '' };
  return list.includes(value) ? { select: value, custom: '' } : { select: 'Outra', custom: value };
}

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

// ─── Componentes auxiliares ──────────────────────────────────────────────────
function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-500">
      <AlertCircle className="h-3 w-3 shrink-0" /> {msg}
    </p>
  );
}

function ReviewRow({ label, value, span2 }: { label: string; value: string; span2?: boolean }) {
  return (
    <div className={span2 ? 'col-span-2' : undefined}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{value || '—'}</p>
    </div>
  );
}

/** Select com busca (marca / cor), usando os primitivos shadcn já presentes no projeto. */
function SearchableSelect({
  options, value, onChange, placeholder, searchPlaceholder = 'Buscar...', hasError,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = query ? options.filter(o => o.toLowerCase().includes(query.toLowerCase())) : options;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between font-normal bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800',
            !value && 'text-muted-foreground font-normal',
            hasError && errorInputClass,
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
            <CommandGroup>
              {filtered.map(opt => (
                <CommandItem key={opt} value={opt} onSelect={() => { onChange(opt); setOpen(false); setQuery(''); }} className="cursor-pointer text-zinc-900 dark:text-zinc-100 aria-selected:text-zinc-900 dark:aria-selected:text-zinc-100">
                  <Check className={cn('mr-2 h-4 w-4', value === opt ? 'opacity-100' : 'opacity-0')} />
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function ProfessionalWizard() {
  const { user, activeProfile } = useAuth();

  const profileType = activeProfile || 'driver';
  const isDriver = profileType === 'driver';
  const isMotoProfile = profileType === 'mototaxi' || profileType === 'motoboy';
  const VehicleIcon = isMotoProfile ? Bike : Car;
  const brandList = isMotoProfile ? MOTO_BRANDS : CAR_BRANDS;
  const colorValues = COLOR_OPTIONS.map(c => c.value);
  const vehicleTypeOptions = isMotoProfile ? VEHICLE_TYPE_MOTOTAXI : VEHICLE_TYPE_DRIVER;
  const draftKey = user?.id ? `viagg_wizard_${profileType}_${user.id}` : 'viagg_wizard_anon';

  // ── Estado geral do wizard ──
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [serverLoaded, setServerLoaded] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draftRestored, setDraftRestored] = useState(false);
  const draftCheckedRef = useRef(false);

  const clearError = (key: string) => setErrors(prev => {
    if (!prev[key]) return prev;
    const next = { ...prev };
    delete next[key];
    return next;
  });

  const onEnterAdvance = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      goNext();
    }
  };

  const [data, setData] = useState<WizardData>(emptyWizardData());

  // ── driver_vehicles: registro existente (para saber update vs insert) ──
  const [existingVehicleId, setExistingVehicleId] = useState<string | null>(null);
  const [hasAnyVehicle, setHasAnyVehicle] = useState(false);

  // ── Data de nascimento (dia/mês/ano) ──
  const [dobParts, setDobParts] = useState({ day: '', month: '', year: '' });
  useEffect(() => {
    if (data.data_nascimento) {
      const [year, month, day] = data.data_nascimento.split('-');
      setDobParts({ day, month, year });
    }
  }, [data.data_nascimento]);
  const handleDobChange = (part: 'day' | 'month' | 'year', value: string) => {
    const next = { ...dobParts, [part]: value };
    setDobParts(next);
    if (next.day && next.month && next.year) {
      setData(prev => ({ ...prev, data_nascimento: `${next.year}-${next.month}-${next.day}` }));
    }
  };

  // ── CEP (ViaCEP) ──
  const [cepLoading, setCepLoading] = useState(false);
  const handleCepChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    const masked = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    setData(prev => ({ ...prev, cep: masked }));
    if (digits.length === 8) fetchCep(digits);
  };
  const fetchCep = async (digits: string) => {
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const json = await res.json();
      if (json?.erro) {
        toast.error('CEP não encontrado. Preencha o endereço manualmente.');
        return;
      }
      setData(prev => ({
        ...prev,
        cidade: json.localidade || prev.cidade,
        estado: json.uf || prev.estado,
        bairro: json.bairro || prev.bairro,
        logradouro: json.logradouro || prev.logradouro,
      }));
      clearError('cidade'); clearError('estado');
      toast.success('Endereço preenchido automaticamente!');
    } catch {
      toast.error('Erro ao consultar o CEP. Verifique sua conexão.');
    } finally {
      setCepLoading(false);
    }
  };

  // ── Localização da residência (copiado de VehicleProfileContent.tsx) ──
  const [confirmResidenceCaptchaOpen, setConfirmResidenceCaptchaOpen] = useState(false);
  const [pendingResidence, setPendingResidence] = useState<{ lat: number; lng: number; endereco?: string } | null>(null);
  const [draftMapCoords, setDraftMapCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [residenceLocked, setResidenceLocked] = useState(true);
  const [searchAddressInput, setSearchAddressInput] = useState('');
  const [coordsInput, setCoordsInput] = useState('');
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [cityCenter, setCityCenter] = useState<{ lat: number; lng: number } | null>(null);
  const cityGeocodedRef = useRef(false);

  useEffect(() => {
    if (cityGeocodedRef.current) return;
    if (!data.cidade || !data.estado) return;
    if (data.latitude_residencia && data.longitude_residencia) return;
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
    if (!token) return;
    cityGeocodedRef.current = true;
    (async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(`${data.cidade}, ${data.estado}, Brasil`)}.json?access_token=${token}&country=br&language=pt&limit=1`
        );
        const json = await res.json();
        if (json.features?.[0]?.center) {
          const [lng, lat] = json.features[0].center;
          setCityCenter({ lat, lng });
        }
      } catch { /* falha silenciosa — mapa cai no centro padrão do Brasil */ }
    })();
  }, [data.cidade, data.estado, data.latitude_residencia, data.longitude_residencia]);

  const handleSearchResidenceAddress = async () => {
    if (!searchAddressInput.trim()) { toast.error('Digite um endereço'); return; }
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
    if (!token) { toast.error('Mapbox não configurado.'); return; }
    setIsSearchingAddress(true);
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchAddressInput)}.json?access_token=${token}&country=br&language=pt&limit=1`
      );
      const json = await res.json();
      if (json.features?.[0]?.center) {
        const [lng, lat] = json.features[0].center;
        setPendingResidence({ lat, lng, endereco: json.features[0].place_name });
        setConfirmResidenceCaptchaOpen(true);
      } else {
        toast.error('Endereço não encontrado.');
      }
    } catch { toast.error('Erro ao buscar endereço'); }
    finally { setIsSearchingAddress(false); }
  };

  const handlePasteResidenceCoords = () => {
    if (!coordsInput.trim()) { toast.error('Cole coordenadas'); return; }
    const result = parseCoordinates(coordsInput.trim());
    if (!result.success || !result.coordinates) { toast.error(result.error || 'Formato não reconhecido'); return; }
    setPendingResidence({ lat: result.coordinates.latitude, lng: result.coordinates.longitude });
    setCoordsInput('');
    setConfirmResidenceCaptchaOpen(true);
  };

  // ── Fotos do veículo (upload copiado de MeuVeiculo.tsx) ──
  const [uploadingSlot, setUploadingSlot] = useState<PhotoSlot | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Partial<Record<PhotoSlot, number>>>({});
  const [dragOverSlot, setDragOverSlot] = useState<PhotoSlot | null>(null);

  const handlePhotoFile = async (file: File, slot: PhotoSlot) => {
    if (!user?.id) return;
    if (!file.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem válido.'); return; }
    setUploadingSlot(slot);
    setUploadProgress(prev => ({ ...prev, [slot]: 8 }));
    const progressTimer = setInterval(() => {
      setUploadProgress(prev => {
        const cur = prev[slot] ?? 8;
        if (cur >= 90) return prev;
        return { ...prev, [slot]: cur + 6 + Math.random() * 10 };
      });
    }, 220);
    try {
      const compressed = await compressImage(file, { outputFormat: 'image/jpeg' });
      const path = `${user.id}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('driver-vehicles')
        .upload(path, compressed.blob, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('driver-vehicles').getPublicUrl(path);
      setData(prev => ({ ...prev, [slot]: pub.publicUrl }));
      setUploadProgress(prev => ({ ...prev, [slot]: 100 }));
      toast.success('Foto enviada!');
    } catch (err: any) {
      toast.error(`Erro ao enviar foto: ${err?.message || 'falha no upload'}`);
      setUploadProgress(prev => ({ ...prev, [slot]: 0 }));
    } finally {
      clearInterval(progressTimer);
      setTimeout(() => setUploadingSlot(null), 350);
    }
  };

  // ── Aceites legais ──
  const [aceiteHabilitacao, setAceiteHabilitacao] = useState(false);
  const [aceitePrestador, setAceitePrestador] = useState(false);
  const [aceiteAcessibilidade, setAceiteAcessibilidade] = useState(false);

  // ── Carregamento inicial (VehicleProfileContent + MeuVeiculo, combinados) ──
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        let operational: any = null;
        let profile: any = null;

        if (isDriver) {
          const [{ data: driverProfile }, { data: prof }] = await Promise.all([
            supabase.from('driver_profiles').select('*').eq('user_id', user.id).maybeSingle(),
            supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          ]);
          operational = driverProfile;
          profile = prof;
        } else {
          const [{ data: motoboy }, { data: prof }] = await Promise.all([
            supabase.rpc('get_motoboy_operational_profile' as any),
            supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          ]);
          operational = motoboy;
          profile = prof;
        }

        const { data: vehiclesRaw } = await (supabase as any)
          .from('driver_vehicles')
          .select('*')
          .eq('driver_id', user.id)
          .order('active', { ascending: false })
          .order('created_at', { ascending: false });

        if (cancelled) return;

        const vehicleList: any[] = vehiclesRaw || [];
        const primaryVehicle = vehicleList[0] || null;
        setExistingVehicleId(primaryVehicle?.id || null);
        setHasAnyVehicle(vehicleList.length > 0);

        const baseBrand = primaryVehicle?.brand || operational?.veiculo_marca || '';
        const baseColor = primaryVehicle?.color || operational?.veiculo_cor || '';
        const brandSplit = splitBrandValue(baseBrand, brandList);
        const colorSplit = splitBrandValue(baseColor, colorValues);

        setData(prev => ({
          ...prev,
          name: profile?.name || '',
          email: profile?.email || user.email || '',
          cpf: profile?.cpf || '',
          data_nascimento: profile?.data_nascimento || '',
          avatar_url: profile?.avatar_url || '',
          whatsapp: operational?.whatsapp || '',
          cpf_cnpj: operational?.cpf_cnpj || '',
          cidade: operational?.cidade || '',
          estado: operational?.estado || '',
          bairro: operational?.bairro || '',
          latitude_residencia: operational?.latitude_residencia ?? null,
          longitude_residencia: operational?.longitude_residencia ?? null,
          endereco_residencia: operational?.endereco_residencia || '',
          veiculo_placa: primaryVehicle?.plate || operational?.veiculo_placa || '',
          veiculo_modelo: primaryVehicle?.model || operational?.veiculo_modelo || '',
          veiculo_ano: primaryVehicle?.manufacture_year != null
            ? String(primaryVehicle.manufacture_year)
            : (operational?.veiculo_ano != null ? String(operational.veiculo_ano) : ''),
          brandSelect: brandSplit.select,
          brandCustom: brandSplit.custom,
          colorSelect: colorSplit.select,
          colorCustom: colorSplit.custom,
          tipo_veiculo: operational?.capacidade_garupa || '',
          capacidade_bag_motoboy: operational?.capacidade_bag || '',
          passenger_capacity: primaryVehicle?.passenger_capacity ? String(primaryVehicle.passenger_capacity) : '',
          air_conditioning: primaryVehicle ? !!primaryVehicle.air_conditioning : null,
          accessible: primaryVehicle ? !!primaryVehicle.accessible : null,
          accessibility_features: primaryVehicle?.accessibility_features || [],
          observations: primaryVehicle?.observations || '',
          front_photo: primaryVehicle?.front_photo || '',
          rear_photo: primaryVehicle?.rear_photo || '',
          side_photo: primaryVehicle?.side_photo || '',
          interior_photo: primaryVehicle?.interior_photo || '',
        }));

        setServerLoaded(true);
      } catch {
        if (!cancelled) toast.error('Erro ao carregar seus dados. Tente recarregar a página.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isDriver]);

  // ── Rascunho local: restaura depois de carregar do servidor ──
  useEffect(() => {
    if (!serverLoaded || !user?.id || draftCheckedRef.current) return;
    draftCheckedRef.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft?.data) setData(prev => ({ ...prev, ...draft.data }));
      if (draft?.terms) {
        setAceiteHabilitacao(!!draft.terms.aceiteHabilitacao);
        setAceitePrestador(!!draft.terms.aceitePrestador);
        setAceiteAcessibilidade(!!draft.terms.aceiteAcessibilidade);
      }
      if (typeof draft?.step === 'number' && draft.step >= 1 && draft.step <= TOTAL_STEPS) {
        setStep(draft.step);
      }
      setDraftRestored(true);
    } catch { /* rascunho corrompido — ignora silenciosamente */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverLoaded, user?.id]);

  // ── Rascunho local: salva a cada alteração ──
  useEffect(() => {
    if (!serverLoaded || !user?.id || isSaving || finalized) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        data, step,
        terms: { aceiteHabilitacao, aceitePrestador, aceiteAcessibilidade },
        savedAt: Date.now(),
      }));
    } catch { /* storage indisponível/cheio — ignora */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, step, aceiteHabilitacao, aceitePrestador, aceiteAcessibilidade, serverLoaded, user?.id, isSaving, finalized]);

  // ── Validação por etapa (camada de UX — não altera regras de negócio) ──
  const validateStep1 = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!data.name.trim()) e.name = 'Informe seu nome completo.';
    if (data.cpf.replace(/\D/g, '').length !== 11) e.cpf = 'CPF deve conter 11 dígitos.';
    if (!dobParts.day || !dobParts.month || !dobParts.year) e.data_nascimento = 'Selecione a data de nascimento completa.';
    return e;
  };

  const validateStep2 = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (data.whatsapp.replace(/\D/g, '').length < 10) e.whatsapp = 'Informe um WhatsApp válido com DDD.';
    if (!data.estado) e.estado = 'Selecione o estado.';
    if (!data.cidade.trim()) e.cidade = 'Informe a cidade.';
    return e;
  };

  const validateStep3 = (): Record<string, string> => {
    const e: Record<string, string> = {};
    const plate = data.veiculo_placa.trim().toUpperCase();
    if (!plate) e.veiculo_placa = 'Informe a placa do veículo.';
    else if (!PLATE_REGEX.test(plate)) e.veiculo_placa = 'Placa inválida. Use ABC1234 ou ABC1D23.';

    const finalBrand = data.brandSelect === 'Outra' ? data.brandCustom.trim() : data.brandSelect;
    if (!data.brandSelect) e.brand = 'Selecione a marca.';
    else if (data.brandSelect === 'Outra' && !finalBrand) e.brand = 'Digite a marca do veículo.';

    if (!data.veiculo_modelo.trim()) e.veiculo_modelo = 'Informe o modelo.';

    const yearNum = parseInt(data.veiculo_ano, 10);
    if (!data.veiculo_ano.trim() || Number.isNaN(yearNum) || yearNum < MIN_YEAR || yearNum > MAX_YEAR) {
      e.veiculo_ano = `Ano inválido. Use entre ${MIN_YEAR} e ${MAX_YEAR}.`;
    }

    const finalColor = data.colorSelect === 'Outra' ? data.colorCustom.trim() : data.colorSelect;
    if (!data.colorSelect) e.color = 'Selecione a cor.';
    else if (data.colorSelect === 'Outra' && !finalColor) e.color = 'Digite a cor do veículo.';

    if (!data.tipo_veiculo) e.tipo_veiculo = 'Selecione o tipo de veículo.';

    if (isDriver) {
      if (!data.passenger_capacity) e.passenger_capacity = 'Selecione a capacidade de passageiros.';
      if (data.air_conditioning === null) e.air_conditioning = 'Informe se o veículo tem ar-condicionado.';
    }
    if (profileType === 'motoboy' && !data.capacidade_bag_motoboy) {
      e.capacidade_bag_motoboy = 'Informe a capacidade de bagageiro/entrega.';
    }
    if (data.accessible === null) e.accessible = 'Informe se o veículo é acessível.';
    if (data.accessible && data.accessibility_features.length === 0) {
      e.accessibility_features = 'Selecione ao menos um recurso de acessibilidade.';
    }
    return e;
  };

  const validateStep5 = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!aceiteHabilitacao) e.aceiteHabilitacao = 'Obrigatório aceitar este termo.';
    if (!aceitePrestador) e.aceitePrestador = 'Obrigatório aceitar este termo.';
    if (!aceiteAcessibilidade) e.aceiteAcessibilidade = 'Obrigatório aceitar este termo.';
    return e;
  };

  const goNext = () => {
    let stepErrors: Record<string, string> = {};
    if (step === 1) stepErrors = validateStep1();
    else if (step === 2) stepErrors = validateStep2();
    else if (step === 3) stepErrors = validateStep3();
    else if (step === 5) stepErrors = validateStep5();

    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      toast.error('Verifique os campos destacados antes de continuar.');
      return;
    }
    setErrors({});
    setStep(s => Math.min(s + 1, TOTAL_STEPS));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    setErrors({});
    setStep(s => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Salvamento final: mesma sequência de VehicleProfileContent.handleSave
  //    + upsert de driver_vehicles (MeuVeiculo.handleSave) ──
  const handleFinalize = async () => {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      const finalBrand = data.brandSelect === 'Outra' ? data.brandCustom.trim() : data.brandSelect;
      const finalColor = data.colorSelect === 'Outra' ? data.colorCustom.trim() : data.colorSelect;
      const vehicleType: 'carro' | 'moto' = isDriver ? 'carro' : 'moto';

      // 1) Perfil pessoal
      await supabase.rpc('update_user_profile', {
        p_name: data.name,
        p_cpf: data.cpf.replace(/\D/g, ''),
        p_data_nascimento: data.data_nascimento || null,
        p_avatar_url: data.avatar_url,
      });

      // 2) Perfil operacional
      if (isDriver) {
        const { error } = await supabase
          .from('driver_profiles')
          .upsert({
            user_id: user.id,
            whatsapp: data.whatsapp,
            cpf_cnpj: data.cpf_cnpj,
            cidade: data.cidade,
            estado: data.estado,
            veiculo_placa: data.veiculo_placa,
            veiculo_marca: finalBrand,
            veiculo_modelo: data.veiculo_modelo,
            veiculo_ano: data.veiculo_ano ? parseInt(data.veiculo_ano) : null,
            veiculo_cor: finalColor || null,
          }, { onConflict: 'user_id' });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('update_motoboy_operational_profile' as any, {
          p_fields: {
            whatsapp: data.whatsapp,
            cpf_cnpj: data.cpf_cnpj,
            cidade: data.cidade,
            estado: data.estado,
            bairro: data.bairro || null,
            veiculo_placa: data.veiculo_placa,
            veiculo_marca: finalBrand,
            veiculo_modelo: data.veiculo_modelo,
            veiculo_ano: data.veiculo_ano ? parseInt(data.veiculo_ano) : null,
            veiculo_cor: finalColor || null,
            capacidade_bag: data.capacidade_bag_motoboy || null,
            capacidade_garupa: data.tipo_veiculo || null,
            latitude_residencia: data.latitude_residencia,
            longitude_residencia: data.longitude_residencia,
            endereco_residencia: data.endereco_residencia || null,
          },
        });
        if (error) throw error;
      }

      // 3) driver_vehicles (fotos + acessibilidade + ar-condicionado)
      const vehiclePayload: any = {
        driver_id: user.id,
        vehicle_type: vehicleType,
        brand: finalBrand,
        model: data.veiculo_modelo.trim(),
        manufacture_year: parseInt(data.veiculo_ano, 10),
        plate: data.veiculo_placa.trim().toUpperCase(),
        color: finalColor,
        air_conditioning: vehicleType === 'carro' ? !!data.air_conditioning : false,
        passenger_capacity: vehicleType === 'moto' ? 1 : (data.passenger_capacity ? parseInt(data.passenger_capacity, 10) : 1),
        accessible: !!data.accessible,
        accessibility_features: data.accessible ? data.accessibility_features : [],
        observations: data.observations.trim() || null,
        front_photo: data.front_photo || null,
        rear_photo: data.rear_photo || null,
        side_photo: data.side_photo || null,
        interior_photo: data.interior_photo || null,
      };

      if (existingVehicleId) {
        const { error } = await (supabase as any)
          .from('driver_vehicles')
          .update(vehiclePayload)
          .eq('id', existingVehicleId)
          .eq('driver_id', user.id);
        if (error) throw error;
      } else {
        if (!hasAnyVehicle) vehiclePayload.active = true;
        const { error } = await (supabase as any).from('driver_vehicles').insert(vehiclePayload);
        if (error) throw error;
      }

      // 4) Onboarding completo?
      const { complete } = await isProfileRegistrationComplete(user.id, profileType);
      if (complete) {
        await supabase.rpc('complete_profile_onboarding' as any, { p_profile_type: profileType });
      }

      try { localStorage.removeItem(draftKey); } catch { /* ignora */ }

      setFinalized(true);
      toast.success('Cadastro concluído com sucesso!');

      setTimeout(() => {
        window.location.href = profileType === 'mototaxi' ? '/mototaxi' : profileType === 'motoboy' ? '/motoboy' : '/driver';
      }, 1600);
    } catch (error: any) {
      toast.error(`Erro ao salvar: ${error?.message || 'erro desconhecido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Guards de renderização (após todos os hooks, igual ao padrão do projeto) ──
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (finalized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 p-6">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', duration: 0.6 }}
          className="flex flex-col items-center gap-4 text-center"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 shadow-xl shadow-emerald-500/30">
            <CheckCircle2 className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-50">Cadastro concluído!</h2>
          <p className="max-w-xs text-sm text-muted-foreground">
            Seus dados foram salvos com sucesso. Redirecionando para o seu painel...
          </p>
          <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
        </motion.div>
      </div>
    );
  }

  const stepsForUi = [
    { id: 1, label: 'Pessoal', icon: UserIcon },
    { id: 2, label: 'Endereço', icon: Home },
    { id: 3, label: 'Veículo', icon: VehicleIcon },
    { id: 4, label: 'Fotos', icon: Camera },
    { id: 5, label: 'Termos', icon: ShieldCheck },
    { id: 6, label: 'Revisão', icon: ClipboardCheck },
  ];

  // ── Etapa 1 — Dados pessoais ──
  const renderStep1 = () => (
    <Card className={cardClass}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950/60">
            <UserIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </span>
          Dados pessoais
        </CardTitle>
        <p className="pl-11 -mt-1 text-xs text-muted-foreground">Como você quer ser identificado na plataforma.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex justify-center pb-1">
          <AvatarUpload
            userId={user!.id}
            currentAvatarUrl={data.avatar_url}
            userName={data.name}
            onUploadComplete={(url) => setData(prev => ({ ...prev, avatar_url: url }))}
          />
        </div>

        <div>
          <Label htmlFor="wiz-name">Nome completo</Label>
          <Input
            id="wiz-name"
            value={data.name}
            onChange={(e) => { setData(prev => ({ ...prev, name: e.target.value })); clearError('name'); }}
            onKeyDown={onEnterAdvance}
            placeholder="Seu nome completo"
            className={cn('mt-1', errors.name && errorInputClass)}
          />
          <FieldError msg={errors.name} />
        </div>

        <div>
          <Label className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" /> E-mail
            <span className="ml-1 font-normal text-muted-foreground">(somente leitura)</span>
          </Label>
          <div className="relative mt-1">
            <Input value={data.email} readOnly className="cursor-default bg-muted pr-9 text-muted-foreground" />
            <Lock className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        <div>
          <Label htmlFor="wiz-cpf" className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> CPF</Label>
          <Input
            id="wiz-cpf"
            value={data.cpf}
            onChange={(e) => {
              const c = e.target.value.replace(/\D/g, '').slice(0, 11);
              let f = c;
              if (c.length > 3) f = `${c.slice(0, 3)}.${c.slice(3)}`;
              if (c.length > 6) f = `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6)}`;
              if (c.length > 9) f = `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
              setData(prev => ({ ...prev, cpf: f }));
              clearError('cpf');
            }}
            onKeyDown={onEnterAdvance}
            placeholder="000.000.000-00"
            inputMode="numeric"
            className={cn('mt-1', errors.cpf && errorInputClass)}
          />
          <FieldError msg={errors.cpf} />
          <p className="mt-1 text-[11px] text-muted-foreground">Usado apenas para verificação de identidade — nunca é exibido publicamente.</p>
        </div>

        <div>
          <Label className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Data de nascimento</Label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <Select value={dobParts.day} onValueChange={(v) => { handleDobChange('day', v); clearError('data_nascimento'); }}>
              <SelectTrigger className={cn(selectTriggerClass, errors.data_nascimento && errorInputClass)}><SelectValue placeholder="Dia" /></SelectTrigger>
              <SelectContent className={cn(selectContentClass, 'max-h-64')}>
                {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={dobParts.month} onValueChange={(v) => { handleDobChange('month', v); clearError('data_nascimento'); }}>
              <SelectTrigger className={cn(selectTriggerClass, errors.data_nascimento && errorInputClass)}><SelectValue placeholder="Mês" /></SelectTrigger>
              <SelectContent className={cn(selectContentClass, 'max-h-64')}>
                {DOB_MONTHS.map((label, i) => <SelectItem key={label} value={String(i + 1).padStart(2, '0')}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={dobParts.year} onValueChange={(v) => { handleDobChange('year', v); clearError('data_nascimento'); }}>
              <SelectTrigger className={cn(selectTriggerClass, errors.data_nascimento && errorInputClass)}><SelectValue placeholder="Ano" /></SelectTrigger>
              <SelectContent className={cn(selectContentClass, 'max-h-64')}>
                {DOB_YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <FieldError msg={errors.data_nascimento} />
        </div>
      </CardContent>
    </Card>
  );

  // ── Etapa 2 — Endereço ──
  const renderStep2 = () => (
    <div className="space-y-5">
      <Card className={cardClass}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/60">
              <Home className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </span>
            Endereço e contato
          </CardTitle>
          <p className="pl-11 -mt-1 text-xs text-muted-foreground">Onde e como falamos com você.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="wiz-cep">CEP</Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                id="wiz-cep"
                value={data.cep}
                onChange={(e) => handleCepChange(e.target.value)}
                onKeyDown={onEnterAdvance}
                placeholder="00000-000"
                inputMode="numeric"
                maxLength={9}
                className="flex-1"
              />
              {cepLoading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Digite o CEP e preenchemos cidade, estado e bairro automaticamente.</p>
          </div>

          <div>
            <Label htmlFor="wiz-whatsapp" className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> WhatsApp</Label>
            <Input
              id="wiz-whatsapp"
              value={data.whatsapp}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, '').slice(0, 11);
                let m = d;
                if (d.length > 2 && d.length <= 7) m = `(${d.slice(0, 2)}) ${d.slice(2)}`;
                else if (d.length > 7) m = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
                else if (d.length > 0) m = `(${d}`;
                setData(prev => ({ ...prev, whatsapp: m }));
                clearError('whatsapp');
              }}
              onKeyDown={onEnterAdvance}
              inputMode="numeric"
              maxLength={15}
              placeholder="(00) 00000-0000"
              className={cn('mt-1', errors.whatsapp && errorInputClass)}
            />
            <FieldError msg={errors.whatsapp} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Estado</Label>
              <Select value={data.estado} onValueChange={(v) => { setData(prev => ({ ...prev, estado: v })); clearError('estado'); }}>
                <SelectTrigger className={cn(selectTriggerClass, 'mt-1', errors.estado && errorInputClass)}>
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent className={cn(selectContentClass, 'max-h-64')}>
                  {brazilianStates.map(s => <SelectItem key={s.value} value={s.value}>{s.value} — {s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldError msg={errors.estado} />
            </div>
            <div>
              <Label htmlFor="wiz-cidade">Cidade</Label>
              <Input
                id="wiz-cidade"
                value={data.cidade}
                onChange={(e) => { setData(prev => ({ ...prev, cidade: e.target.value })); clearError('cidade'); }}
                onKeyDown={onEnterAdvance}
                className={cn('mt-1', errors.cidade && errorInputClass)}
              />
              <FieldError msg={errors.cidade} />
            </div>
          </div>

          <div>
            <Label htmlFor="wiz-bairro">Bairro</Label>
            <Input
              id="wiz-bairro"
              value={data.bairro}
              onChange={(e) => setData(prev => ({ ...prev, bairro: e.target.value }))}
              onKeyDown={onEnterAdvance}
              placeholder="Ex: Centro, Jardim América..."
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      <Card className={cn(cardClass, 'border-l-4 border-l-emerald-500')}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPin className="h-4 w-4 text-emerald-600" />
            Localização da residência
          </CardTitle>
          <p className="-mt-1 text-xs text-muted-foreground">Opcional — ajuda a plataforma a te localizar melhor.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data.cidade || data.estado) && (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-100 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-3">
              <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
              <p className="truncate text-sm font-bold text-foreground">
                {data.endereco_residencia || [data.bairro, data.cidade, data.estado].filter(Boolean).join(' · ') || 'Defina no mapa'}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs"><MapPin className="h-3.5 w-3.5 text-emerald-600" /> Digite o endereço</Label>
            <div className="flex gap-2">
              <Input
                value={searchAddressInput}
                onChange={(e) => setSearchAddressInput(e.target.value)}
                placeholder="Rua, número, bairro, cidade"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchResidenceAddress(); } }}
                className="flex-1"
              />
              <Button type="button" onClick={handleSearchResidenceAddress} disabled={isSearchingAddress} className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-500">
                {isSearchingAddress ? 'Buscando...' : 'Buscar'}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Ou cole coordenadas (WhatsApp / Google Maps)</Label>
            <div className="flex gap-2">
              <Input value={coordsInput} onChange={(e) => setCoordsInput(e.target.value)} placeholder="-23.5505, -46.6333" className="flex-1" />
              <Button type="button" onClick={handlePasteResidenceCoords} variant="outline" className="shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800">
                Aplicar
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {residenceLocked ? '🔒 Pino travado. Clique em "Editar localização" para mudar.' : '📍 Arraste o mapa para posicionar o pino e clique em "Confirmar".'}
          </p>
          <StoreLocationMap
            key={residenceLocked ? 'locked' : 'edit'}
            initialLat={data.latitude_residencia ?? cityCenter?.lat ?? undefined}
            initialLng={data.longitude_residencia ?? cityCenter?.lng ?? undefined}
            hasConfirmedLocation={data.latitude_residencia != null}
            addressLabel={data.endereco_residencia || '📍 Minha Localização'}
            markerLabel="📍 Minha Localização"
            readOnly={residenceLocked}
            operationRadiusKm={residenceLocked ? (isMotoProfile ? 5 : 10) : undefined}
            onLocationSelect={(lat, lng) => setDraftMapCoords({ lat, lng })}
            className="h-[280px] w-full overflow-hidden rounded-lg"
          />
          {residenceLocked ? (
            <Button type="button" onClick={() => { setResidenceLocked(false); setDraftMapCoords(null); }} className="w-full bg-yellow-400 font-bold text-black hover:bg-yellow-300">
              <MapPin className="mr-2 h-4 w-4" /> Editar localização
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button type="button" onClick={() => { setResidenceLocked(true); setDraftMapCoords(null); }} variant="outline" className="flex-1">Cancelar</Button>
              <Button
                type="button"
                onClick={() => {
                  if (!draftMapCoords) { toast.info('Ajuste o mapa primeiro.'); return; }
                  setPendingResidence(draftMapCoords);
                  setConfirmResidenceCaptchaOpen(true);
                }}
                className="flex-1 bg-emerald-600 font-bold text-white hover:bg-emerald-500"
              >
                <Check className="mr-2 h-4 w-4" /> Confirmar localização
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ── Etapa 3 — Veículo ──
  const renderStep3 = () => (
    <Card className={cardClass}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', isDriver ? 'bg-blue-100 dark:bg-blue-950/60' : 'bg-orange-100 dark:bg-orange-950/60')}>
            <VehicleIcon className={cn('h-4 w-4', isDriver ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400')} />
          </span>
          Seu veículo
        </CardTitle>
        <p className="pl-11 -mt-1 text-xs text-muted-foreground">
          Categoria: <strong className="text-foreground">{isDriver ? 'Carro' : 'Moto'}</strong> — definida pelo seu perfil.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Placa</Label>
            <Input
              value={data.veiculo_placa}
              onChange={(e) => { setData(prev => ({ ...prev, veiculo_placa: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7) })); clearError('veiculo_placa'); }}
              onKeyDown={onEnterAdvance}
              placeholder="ABC1D23"
              maxLength={7}
              className={cn('mt-1 uppercase', errors.veiculo_placa && errorInputClass)}
            />
            <FieldError msg={errors.veiculo_placa} />
          </div>
          <div>
            <Label>Ano de fabricação</Label>
            <Input
              value={data.veiculo_ano}
              onChange={(e) => { setData(prev => ({ ...prev, veiculo_ano: e.target.value.replace(/\D/g, '').slice(0, 4) })); clearError('veiculo_ano'); }}
              onKeyDown={onEnterAdvance}
              placeholder={String(CURRENT_YEAR)}
              inputMode="numeric"
              maxLength={4}
              className={cn('mt-1', errors.veiculo_ano && errorInputClass)}
            />
            <FieldError msg={errors.veiculo_ano} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Marca</Label>
            <div className="mt-1">
              <SearchableSelect
                options={brandList}
                value={data.brandSelect}
                onChange={(v) => { setData(prev => ({ ...prev, brandSelect: v, brandCustom: v === 'Outra' ? prev.brandCustom : '' })); clearError('brand'); }}
                placeholder="Selecione a marca"
                searchPlaceholder="Buscar marca..."
                hasError={!!errors.brand}
              />
            </div>
            {data.brandSelect === 'Outra' && (
              <Input
                value={data.brandCustom}
                onChange={(e) => { setData(prev => ({ ...prev, brandCustom: e.target.value })); clearError('brand'); }}
                onKeyDown={onEnterAdvance}
                placeholder="Digite a marca"
                className="mt-2"
              />
            )}
            <FieldError msg={errors.brand} />
          </div>
          <div>
            <Label>Modelo</Label>
            <Input
              value={data.veiculo_modelo}
              onChange={(e) => { setData(prev => ({ ...prev, veiculo_modelo: e.target.value })); clearError('veiculo_modelo'); }}
              onKeyDown={onEnterAdvance}
              placeholder="Ex: Corolla, CG 160..."
              className={cn('mt-1', errors.veiculo_modelo && errorInputClass)}
            />
            <FieldError msg={errors.veiculo_modelo} />
          </div>
        </div>

        <div>
          <Label>Cor</Label>
          <div className="mt-1">
            <SearchableSelect
              options={colorValues}
              value={data.colorSelect}
              onChange={(v) => { setData(prev => ({ ...prev, colorSelect: v, colorCustom: v === 'Outra' ? prev.colorCustom : '' })); clearError('color'); }}
              placeholder="Selecione a cor"
              searchPlaceholder="Buscar cor..."
              hasError={!!errors.color}
            />
          </div>
          {data.colorSelect === 'Outra' && (
            <Input
              value={data.colorCustom}
              onChange={(e) => { setData(prev => ({ ...prev, colorCustom: e.target.value })); clearError('color'); }}
              onKeyDown={onEnterAdvance}
              placeholder="Digite a cor"
              className="mt-2"
            />
          )}
          <FieldError msg={errors.color} />
        </div>

        <div>
          <Label>Tipo de veículo</Label>
          <Select value={data.tipo_veiculo} onValueChange={(v) => { setData(prev => ({ ...prev, tipo_veiculo: v })); clearError('tipo_veiculo'); }}>
            <SelectTrigger className={cn(selectTriggerClass, 'mt-1', errors.tipo_veiculo && errorInputClass)}>
              <SelectValue placeholder="Selecione o tipo" />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
              {vehicleTypeOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <FieldError msg={errors.tipo_veiculo} />
        </div>

        {isDriver && (
          <div>
            <Label className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-blue-500" /> Capacidade de passageiros</Label>
            <Select value={data.passenger_capacity} onValueChange={(v) => { setData(prev => ({ ...prev, passenger_capacity: v })); clearError('passenger_capacity'); }}>
              <SelectTrigger className={cn(selectTriggerClass, 'mt-1', errors.passenger_capacity && errorInputClass)}>
                <SelectValue placeholder="Quantos passageiros cabem?" />
              </SelectTrigger>
              <SelectContent className={selectContentClass}>
                {PASSENGER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldError msg={errors.passenger_capacity} />
            <p className="mt-1 text-[11px] text-muted-foreground">Inclua todos os assentos, além do motorista.</p>
          </div>
        )}

        {profileType === 'motoboy' && (
          <div>
            <Label className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-orange-500" /> Capacidade de bagageiro/entrega</Label>
            <Select value={data.capacidade_bag_motoboy} onValueChange={(v) => { setData(prev => ({ ...prev, capacidade_bag_motoboy: v })); clearError('capacidade_bag_motoboy'); }}>
              <SelectTrigger className={cn(selectTriggerClass, 'mt-1', errors.capacidade_bag_motoboy && errorInputClass)}>
                <SelectValue placeholder="Selecione a capacidade" />
              </SelectTrigger>
              <SelectContent className={selectContentClass}>
                {PASSENGER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldError msg={errors.capacidade_bag_motoboy} />
            <p className="mt-1 text-[11px] text-muted-foreground">Quantos volumes/entregas seu bagageiro comporta.</p>
          </div>
        )}

        {isDriver && (
          <div>
            <Label>Ar-condicionado</Label>
            <div className="mt-1 flex gap-2">
              <Button
                type="button"
                variant={data.air_conditioning === true ? 'default' : 'outline'}
                onClick={() => { setData(prev => ({ ...prev, air_conditioning: true })); clearError('air_conditioning'); }}
                className={cn('flex-1', data.air_conditioning === true && 'bg-blue-600 text-white hover:bg-blue-500')}
              >
                Sim
              </Button>
              <Button
                type="button"
                variant={data.air_conditioning === false ? 'default' : 'outline'}
                onClick={() => { setData(prev => ({ ...prev, air_conditioning: false })); clearError('air_conditioning'); }}
                className={cn('flex-1', data.air_conditioning === false && 'bg-blue-600 text-white hover:bg-blue-500')}
              >
                Não
              </Button>
            </div>
            <FieldError msg={errors.air_conditioning} />
          </div>
        )}

        <div>
          <Label className="flex items-center gap-1.5"><Accessibility className="h-3.5 w-3.5 text-blue-500" /> Veículo acessível</Label>
          <div className="mt-1 flex gap-2">
            <Button
              type="button"
              variant={data.accessible === true ? 'default' : 'outline'}
              onClick={() => { setData(prev => ({ ...prev, accessible: true })); clearError('accessible'); }}
              className={cn('flex-1', data.accessible === true && 'bg-blue-600 text-white hover:bg-blue-500')}
            >
              Sim
            </Button>
            <Button
              type="button"
              variant={data.accessible === false ? 'default' : 'outline'}
              onClick={() => { setData(prev => ({ ...prev, accessible: false, accessibility_features: [] })); clearError('accessible'); }}
              className={cn('flex-1', data.accessible === false && 'bg-blue-600 text-white hover:bg-blue-500')}
            >
              Não
            </Button>
          </div>
          <FieldError msg={errors.accessible} />
          {data.accessible && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ACCESSIBILITY_FEATURES.map(feature => {
                const checked = data.accessibility_features.includes(feature);
                return (
                  <label
                    key={feature}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-lg border-2 p-2.5 text-xs transition-all',
                      checked ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/40' : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-zinc-300',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setData(prev => ({
                          ...prev,
                          accessibility_features: checked
                            ? prev.accessibility_features.filter(f => f !== feature)
                            : [...prev.accessibility_features, feature],
                        }));
                        clearError('accessibility_features');
                      }}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-blue-600"
                    />
                    <span className="text-zinc-800 dark:text-zinc-200">{feature}</span>
                  </label>
                );
              })}
            </div>
          )}
          <FieldError msg={errors.accessibility_features} />
        </div>

        <div>
          <Label>Observações <span className="font-normal text-muted-foreground">(opcional)</span></Label>
          <Textarea
            value={data.observations}
            onChange={(e) => setData(prev => ({ ...prev, observations: e.target.value }))}
            placeholder="Detalhes adicionais sobre o veículo..."
            rows={3}
            className="mt-1"
          />
        </div>
      </CardContent>
    </Card>
  );

  // ── Etapa 4 — Fotos ──
  const renderStep4 = () => (
    <Card className={cardClass}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-950/60">
            <Camera className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </span>
          Fotos do veículo
        </CardTitle>
        <p className="pl-11 -mt-1 text-xs text-muted-foreground">Opcional, mas aumenta a confiança dos clientes.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PHOTO_SLOTS.map(({ slot, label, hint }) => {
            const url = data[slot];
            const isUploading = uploadingSlot === slot;
            const progress = uploadProgress[slot] || 0;
            const isDragOver = dragOverSlot === slot;
            return (
              <div key={slot} className="space-y-1.5">
                <Label className="text-sm">{label}</Label>
                <label
                  onDragOver={(e) => { e.preventDefault(); setDragOverSlot(slot); }}
                  onDragLeave={() => setDragOverSlot(prev => (prev === slot ? null : prev))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverSlot(null);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handlePhotoFile(file, slot);
                  }}
                  className={cn(
                    'relative flex h-40 cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border-2 border-dashed transition-colors',
                    isDragOver
                      ? 'border-purple-400 bg-purple-50 dark:bg-purple-950/30'
                      : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 hover:border-purple-300',
                  )}
                >
                  {isUploading ? (
                    <div className="flex w-full flex-col items-center gap-2 px-6">
                      <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                        <div className="h-full bg-purple-500 transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
                      </div>
                    </div>
                  ) : url ? (
                    <>
                      <img src={url} alt={label} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setData(prev => ({ ...prev, [slot]: '' })); }}
                        className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="h-7 w-7 text-zinc-400" />
                      <span className="text-[11px] font-medium text-zinc-500">Clique ou arraste a foto</span>
                      <span className="text-[10px] text-muted-foreground">{hint}</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoFile(file, slot);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );

  // ── Etapa 5 — Termos legais (texto copiado verbatim de VehicleProfileContent.tsx) ──
  const renderStep5 = () => (
    <Card className={cn(cardClass, 'border-l-4 border-l-amber-500')}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-4 w-4 text-amber-600" />
          Termos legais obrigatórios
        </CardTitle>
        <p className="-mt-1 text-xs text-muted-foreground">Você precisa aceitar os três termos para continuar.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <label
          htmlFor="wiz-aceite-hab"
          className={cn(
            'flex items-start gap-3 rounded-lg border-2 p-4 cursor-pointer transition-all',
            aceiteHabilitacao ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-zinc-300',
            errors.aceiteHabilitacao && !aceiteHabilitacao && errorInputClass,
          )}
        >
          <input
            id="wiz-aceite-hab"
            type="checkbox"
            checked={aceiteHabilitacao}
            onChange={(e) => { setAceiteHabilitacao(e.target.checked); clearError('aceiteHabilitacao'); }}
            className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-emerald-600"
          />
          <div className="space-y-1.5 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
            <p>
              <strong>Declaro possuir CNH categoria {isMotoProfile ? 'A' : 'B'} vigente</strong>, conforme exigência do art. 140 do Código de Trânsito Brasileiro (Lei nº 9.503/1997) e da Resolução CONTRAN nº 168/2004.
            </p>
            <p>
              Comprometo-me a {isMotoProfile
                ? 'portar capacete certificado pelo INMETRO e demais EPIs obrigatórios para motociclistas, conforme art. 244 do CTB'
                : 'manter o veículo em perfeitas condições de segurança, com documentação regular (CRLV), seguro obrigatório (DPVAT) e inspeção veicular em dia, conforme arts. 230 e 231 do CTB'}.
            </p>
            <p>Estou ciente de que conduzo o veículo sob minha inteira responsabilidade civil e criminal perante terceiros.</p>
          </div>
        </label>

        <label
          htmlFor="wiz-aceite-prestador"
          className={cn(
            'flex items-start gap-3 rounded-lg border-2 p-4 cursor-pointer transition-all',
            aceitePrestador ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-zinc-300',
            errors.aceitePrestador && !aceitePrestador && errorInputClass,
          )}
        >
          <input
            id="wiz-aceite-prestador"
            type="checkbox"
            checked={aceitePrestador}
            onChange={(e) => { setAceitePrestador(e.target.checked); clearError('aceitePrestador'); }}
            className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-emerald-600"
          />
          <div className="space-y-1.5 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
            <p>
              <strong>Declaro atuar como prestador de serviços autônomo</strong>, nos termos do art. 442-B da CLT (Lei nº 13.467/2017), sem vínculo empregatício, subordinação, exclusividade ou pessoalidade com a plataforma Viagg-TX8.
            </p>
            <p>
              Reconheço minha responsabilidade pelo recolhimento de INSS (contribuinte individual / MEI), ISS e demais obrigações fiscais, conforme Lei Complementar nº 123/2006 e Lei nº 8.212/1991.
            </p>
            <p>
              Assumo integralmente os riscos e responsabilidades inerentes à atividade de transporte, incluindo danos a terceiros e quaisquer obrigações tributárias decorrentes da minha atuação.
            </p>
          </div>
        </label>

        <label
          htmlFor="wiz-aceite-acessibilidade"
          className={cn(
            'flex items-start gap-3 rounded-lg border-2 p-4 cursor-pointer transition-all',
            aceiteAcessibilidade ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30' : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-zinc-300',
            errors.aceiteAcessibilidade && !aceiteAcessibilidade && errorInputClass,
          )}
        >
          <input
            id="wiz-aceite-acessibilidade"
            type="checkbox"
            checked={aceiteAcessibilidade}
            onChange={(e) => { setAceiteAcessibilidade(e.target.checked); clearError('aceiteAcessibilidade'); }}
            className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-blue-600"
          />
          <div className="space-y-1.5 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
            <div className="mb-1 flex items-center gap-1.5">
              <Accessibility className="h-4 w-4 shrink-0 text-blue-600" />
              <strong className="text-blue-800 dark:text-blue-300">Compromisso com Acessibilidade e Inclusão</strong>
            </div>
            <p>
              <strong>Estou ciente e de acordo</strong> que a plataforma Viagg-TX8 pode solicitar o transporte de <strong>pessoas com deficiência física, motora, visual, auditiva ou intelectual</strong>, bem como seus <strong>auxiliares</strong> (acompanhantes, cuidadores ou responsáveis legais) e seus <strong>equipamentos de auxílio</strong> — incluindo cadeiras de rodas, andadores, bengalas, muletas, dispositivos de comunicação aumentativa e outros.
            </p>
            <p>
              Declaro que prestarei este serviço com <strong>respeito, dignidade e prontidão</strong>, garantindo embarque e desembarque seguros, acondicionamento adequado dos equipamentos e tratamento acolhedor e sem discriminação a todos os usuários, conforme previsto na <strong>Lei nº 13.146/2015 — Lei Brasileira de Inclusão da Pessoa com Deficiência (Estatuto da Pessoa com Deficiência)</strong> e no art. 5º da Constituição Federal.
            </p>
            <p>
              Estou ciente de que a recusa injustificada de transporte a pessoas com deficiência ou seus acompanhantes constitui prática discriminatória, sujeita às sanções previstas na Lei nº 9.029/1995 e na Lei nº 13.146/2015.
            </p>
          </div>
        </label>
      </CardContent>
    </Card>
  );

  // ── Etapa 6 — Revisão final ──
  const renderStep6 = () => {
    const finalBrand = data.brandSelect === 'Outra' ? data.brandCustom : data.brandSelect;
    const finalColor = data.colorSelect === 'Outra' ? data.colorCustom : data.colorSelect;
    const photos = PHOTO_SLOTS.map(p => data[p.slot]).filter(Boolean);

    return (
      <div className="space-y-4">
        <Card className={cardClass}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><UserIcon className="h-4 w-4 text-blue-600" /> Dados pessoais</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-y-3 text-sm">
            <ReviewRow label="Nome" value={data.name} span2 />
            <ReviewRow label="CPF" value={data.cpf} />
            <ReviewRow label="Nascimento" value={data.data_nascimento ? formatDateBr(data.data_nascimento) : ''} />
            <ReviewRow label="E-mail" value={data.email} span2 />
          </CardContent>
        </Card>

        <Card className={cardClass}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Home className="h-4 w-4 text-emerald-600" /> Endereço</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-y-3 text-sm">
            <ReviewRow label="WhatsApp" value={data.whatsapp} />
            <ReviewRow label="Estado" value={data.estado} />
            <ReviewRow label="Cidade" value={data.cidade} />
            <ReviewRow label="Bairro" value={data.bairro} />
            <ReviewRow
              label="Residência"
              value={data.endereco_residencia || (data.latitude_residencia ? 'Definida no mapa' : 'Não definida')}
              span2
            />
          </CardContent>
        </Card>

        <Card className={cardClass}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><VehicleIcon className="h-4 w-4 text-blue-600" /> Veículo</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-y-3 text-sm">
            <ReviewRow label="Placa" value={data.veiculo_placa} />
            <ReviewRow label="Ano" value={data.veiculo_ano} />
            <ReviewRow label="Marca" value={finalBrand} />
            <ReviewRow label="Modelo" value={data.veiculo_modelo} />
            <ReviewRow label="Cor" value={finalColor} />
            <ReviewRow label="Tipo" value={vehicleTypeOptions.find(o => o.value === data.tipo_veiculo)?.label || ''} />
            {isDriver && <ReviewRow label="Passageiros" value={data.passenger_capacity} />}
            {profileType === 'motoboy' && <ReviewRow label="Bagageiro" value={data.capacidade_bag_motoboy} />}
            {isDriver && <ReviewRow label="Ar-condicionado" value={data.air_conditioning ? 'Sim' : 'Não'} />}
            <ReviewRow label="Acessível" value={data.accessible ? 'Sim' : 'Não'} />
          </CardContent>
        </Card>

        {photos.length > 0 && (
          <Card className={cardClass}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><Camera className="h-4 w-4 text-purple-600" /> Fotos ({photos.length})</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {photos.map((src, i) => (
                <img key={i} src={src} alt={`Foto ${i + 1}`} className="h-16 w-16 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700" />
              ))}
            </CardContent>
          </Card>
        )}

        <Card className={cn(cardClass, 'border-l-4 border-l-emerald-500')}>
          <CardContent className="flex items-center gap-2 py-4 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Os três termos legais foram aceitos.
          </CardContent>
        </Card>
      </div>
    );
  };

  // ── Render principal ──
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-zinc-50 to-zinc-100 px-3 py-6 dark:from-zinc-950 dark:to-zinc-900 sm:px-4 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        {/* Cabeçalho */}
        <div className="mb-6 text-center">
          <div className={cn('mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg', isDriver ? 'bg-blue-600' : 'bg-orange-500')}>
            <VehicleIcon className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            Complete seu cadastro
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isDriver ? 'Motorista de Carro' : profileType === 'motoboy' ? 'Motoboy — Entregas' : 'Moto-Táxi'} · leva menos de 5 minutos
          </p>
        </div>

        {draftRestored && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
          >
            <span className="flex items-center gap-2"><Info className="h-4 w-4 shrink-0" /> Rascunho restaurado — continue de onde parou.</span>
            <button type="button" onClick={() => setDraftRestored(false)} className="shrink-0 rounded-full p-1 hover:bg-amber-100 dark:hover:bg-amber-900/50">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}

        {/* Indicador de progresso */}
        <div className="mb-6">
          <div className="flex items-center">
            {stepsForUi.map((s, idx) => {
              const StepIcon = s.icon;
              const isDone = step > s.id;
              const isCurrent = step === s.id;
              return (
                <Fragment key={s.id}>
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-full border-2 font-bold transition-all sm:h-11 sm:w-11',
                        isDone && 'border-emerald-500 bg-emerald-500 text-white',
                        isCurrent && 'scale-110 border-primary bg-primary text-white shadow-lg shadow-primary/30',
                        !isDone && !isCurrent && 'border-zinc-200 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800',
                      )}
                    >
                      {isDone ? <Check className="h-4 w-4 sm:h-5 sm:w-5" /> : <StepIcon className="h-4 w-4 sm:h-5 sm:w-5" />}
                    </div>
                    <span className={cn('hidden max-w-[64px] text-center text-[10px] font-semibold leading-tight sm:block', isCurrent ? 'text-primary' : 'text-muted-foreground')}>
                      {s.label}
                    </span>
                  </div>
                  {idx < stepsForUi.length - 1 && (
                    <div className={cn('mx-1 h-0.5 flex-1 rounded-full transition-colors', step > s.id ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700')} />
                  )}
                </Fragment>
              );
            })}
          </div>
          <p className="mt-2 text-center text-xs font-semibold text-primary sm:hidden">
            Etapa {step} de {TOTAL_STEPS} — {stepsForUi[step - 1].label}
          </p>
          <Progress value={(step / TOTAL_STEPS) * 100} className="mt-2 h-1.5" />
        </div>

        {/* Conteúdo da etapa */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
            {step === 5 && renderStep5()}
            {step === 6 && renderStep6()}
          </motion.div>
        </AnimatePresence>

        {/* Navegação */}
        <div className="mt-6 flex gap-3">
          {step > 1 && (
            <Button type="button" variant="outline" onClick={goBack} disabled={isSaving} className="h-12 flex-1 rounded-xl text-base font-semibold">
              <ChevronLeft className="mr-1 h-5 w-5" /> Voltar
            </Button>
          )}
          {step < TOTAL_STEPS && (
            <Button type="button" onClick={goNext} className="h-12 flex-[2] rounded-xl bg-primary text-base font-semibold hover:bg-primary/90">
              Próximo <ChevronRight className="ml-1 h-5 w-5" />
            </Button>
          )}
          {step === TOTAL_STEPS && (
            <Button
              type="button"
              onClick={() => {
                const termErrors = validateStep5();
                if (Object.keys(termErrors).length > 0) {
                  setStep(5);
                  setErrors(termErrors);
                  toast.error('Volte e aceite os três termos legais.');
                  return;
                }
                setCaptchaOpen(true);
              }}
              disabled={isSaving}
              className="h-12 flex-[2] rounded-xl bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Sparkles className="mr-2 h-5 w-5" />}
              {isSaving ? 'Enviando...' : 'Concluir cadastro'}
            </Button>
          )}
        </div>
      </div>

      <MathCaptchaDialog
        open={captchaOpen}
        onOpenChange={setCaptchaOpen}
        onConfirmed={handleFinalize}
        title="Confirme para concluir"
        description="Por segurança, resolva a soma abaixo antes de enviar seu cadastro."
      />

      <MathCaptchaDialog
        open={confirmResidenceCaptchaOpen}
        onOpenChange={setConfirmResidenceCaptchaOpen}
        onConfirmed={() => {
          if (pendingResidence) {
            setData(prev => ({
              ...prev,
              latitude_residencia: pendingResidence.lat,
              longitude_residencia: pendingResidence.lng,
              endereco_residencia: pendingResidence.endereco || prev.endereco_residencia,
            }));
            setPendingResidence(null);
            setDraftMapCoords(null);
            setSearchAddressInput('');
            setResidenceLocked(true);
            toast.success('Residência confirmada!');
          }
        }}
        title="Confirmar residência"
        description="Resolva a soma para confirmar este local."
      />
    </div>
  );
}
