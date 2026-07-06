import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MotoboyPageTemplate } from '@/components/motoboy/MotoboyPageTemplate';
import { AvatarUpload } from '@/components/profile/AvatarUpload';
import {
  User as UserIcon, Check, Phone, Car, Bike, MapPin, Lock,
  Home, Mail, Users, ShieldCheck, Accessibility, Search, Clipboard
} from 'lucide-react';
import { brazilianStates } from '@/lib/brazilianStates';
import { isProfileRegistrationComplete } from '@/lib/profileValidation';
import { MathCaptchaDialog } from '@/components/ui/math-captcha-dialog';
import { StoreLocationMap } from '@/components/StoreLocationMap';
import { parseCoordinates } from '@/lib/coordinateParser';

// ─── Passageiros ────────────────────────────────────────────────────────────
const PASSENGER_OPTIONS = [
  { value: '1', label: '1 passageiro' },
  { value: '2', label: '2 passageiros' },
  { value: '3', label: '3 passageiros' },
  { value: '4', label: '4 passageiros' },
  { value: '5', label: '5 passageiros' },
  { value: '6', label: '6 passageiros' },
  { value: '7', label: '7 passageiros' },
];

// ─── Tipo de veículo ─────────────────────────────────────────────────────────
const VEHICLE_TYPE_DRIVER = [
  { value: 'hatchback',  label: 'Hatchback' },
  { value: 'sedan',      label: 'Sedã' },
  { value: 'suv',        label: 'SUV' },
  { value: 'minivan',    label: 'Minivan' },
  { value: 'pickup',     label: 'Pickup' },
  { value: 'outro',      label: 'Outro' },
];

const VEHICLE_TYPE_MOTOTAXI = [
  { value: 'moto_125cc',  label: 'Moto 125cc' },
  { value: 'moto_150cc',  label: 'Moto 150cc' },
  { value: 'moto_250cc',  label: 'Moto 250cc+' },
  { value: 'scooter',     label: 'Scooter' },
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
  { value: 'Preto',    label: 'Preto' },
  { value: 'Branco',   label: 'Branco' },
  { value: 'Prata',    label: 'Prata' },
  { value: 'Vermelho', label: 'Vermelho' },
  { value: 'Azul',     label: 'Azul' },
  { value: 'Verde',    label: 'Verde' },
  { value: 'Amarelo',  label: 'Amarelo' },
  { value: 'Outra',    label: 'Outra' },
];

const DOB_MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const DOB_CURRENT_YEAR = new Date().getFullYear();
const DOB_YEARS = Array.from({ length: 100 }, (_, i) => DOB_CURRENT_YEAR - i);

interface VehicleProfileData {
  whatsapp: string;
  cpf_cnpj: string;
  cidade: string;
  estado: string;
  bairro: string;
  veiculo_placa: string;
  veiculo_marca: string;
  veiculo_modelo: string;
  veiculo_ano: string;
  veiculo_cor: string;
  /** Passageiros — salvo em capacidade_bag */
  capacidade_passageiros: string;
  /** Tipo de veículo — salvo em capacidade_garupa */
  tipo_veiculo: string;
  // Dados pessoais
  name: string;
  email: string;
  cpf: string;
  data_nascimento: string;
  avatar_url: string;
  // Localização
  latitude_residencia: number | null;
  longitude_residencia: number | null;
  endereco_residencia: string;
}

export default function VehicleProfileContent() {
  const { user, activeProfile } = useAuth();
  const isMototaxi = activeProfile === 'mototaxi';
  const isDriver   = activeProfile === 'driver';
  const VehicleIcon = isMototaxi ? Bike : Car;
  const accentColor = 'text-blue-600';
  const vehicleTypeOptions = isMototaxi ? VEHICLE_TYPE_MOTOTAXI : VEHICLE_TYPE_DRIVER;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [captchaOpen, setCaptchaOpen] = useState(false);

  const [data, setData] = useState<VehicleProfileData>({
    whatsapp: '', cpf_cnpj: '', cidade: '', estado: '', bairro: '',
    veiculo_placa: '', veiculo_marca: '', veiculo_modelo: '', veiculo_ano: '',
    veiculo_cor: '', capacidade_passageiros: '', tipo_veiculo: '',
    name: '', email: '', cpf: '', data_nascimento: '', avatar_url: '',
    latitude_residencia: null, longitude_residencia: null, endereco_residencia: '',
  });

  // Data de nascimento
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

  // Localização
  const [confirmResidenceCaptchaOpen, setConfirmResidenceCaptchaOpen] = useState(false);
  const [pendingResidence, setPendingResidence] = useState<{ lat: number; lng: number; endereco?: string } | null>(null);
  const [draftMapCoords, setDraftMapCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [residenceLocked, setResidenceLocked] = useState(true);
  const [searchAddressInput, setSearchAddressInput] = useState('');
  const [coordsInput, setCoordsInput] = useState('');
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [cityCenter, setCityCenter] = useState<{ lat: number; lng: number } | null>(null);
  const cityGeocodedRef = useRef(false);

  // Aceites legais
  const [aceiteHabilitacao, setAceiteHabilitacao] = useState(false);
  const [aceitePrestador, setAceitePrestador] = useState(false);
  const [aceiteAcessibilidade, setAceiteAcessibilidade] = useState(false);

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
      } catch {}
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

  // Hydrate
  const hydrateData = (motoboy: any, profile?: any) => {
    if (!motoboy) return;
    setData({
      whatsapp: motoboy.whatsapp || '',
      cpf_cnpj: motoboy.cpf_cnpj || '',
      cidade: motoboy.cidade || '',
      estado: motoboy.estado || '',
      bairro: motoboy.bairro || '',
      veiculo_placa: motoboy.veiculo_placa || '',
      veiculo_marca: motoboy.veiculo_marca || '',
      veiculo_modelo: motoboy.veiculo_modelo || '',
      veiculo_ano: motoboy.veiculo_ano?.toString() || '',
      veiculo_cor: motoboy.veiculo_cor || '',
      capacidade_passageiros: motoboy.capacidade_bag || '',
      tipo_veiculo: motoboy.capacidade_garupa || '',
      name: profile?.name || '',
      email: profile?.email || '',
      cpf: profile?.cpf || '',
      data_nascimento: profile?.data_nascimento || '',
      avatar_url: profile?.avatar_url || '',
      latitude_residencia: motoboy.latitude_residencia ?? null,
      longitude_residencia: motoboy.longitude_residencia ?? null,
      endereco_residencia: motoboy.endereco_residencia || '',
    });
  };

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        if (isDriver) {
          const [{ data: driverProfile }, { data: profile }] = await Promise.all([
            supabase.from('driver_profiles').select('*').eq('user_id', user.id).maybeSingle(),
            supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          ]);
          if (!cancelled) hydrateData(driverProfile, profile);
        } else {
          const { data: motoboy } = await supabase.rpc('get_motoboy_operational_profile' as any);
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
          if (!cancelled) hydrateData(motoboy, profile);
        }
      } catch { if (!cancelled) toast.error('Erro ao carregar perfil'); }
      finally { if (!cancelled) setIsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user?.id, isDriver]);

  const handleSave = async () => {
    if (!user?.id) return;
    if (!aceiteHabilitacao || !aceitePrestador || !aceiteAcessibilidade) {
      toast.error('Você precisa marcar os três termos legais para salvar.');
      return;
    }
    setIsSaving(true);
    try {
      await supabase.rpc('update_user_profile', {
        p_name: data.name,
        p_cpf: data.cpf.replace(/\D/g, ''),
        p_data_nascimento: data.data_nascimento || null,
        p_avatar_url: data.avatar_url,
      });

      let savedOperational: any = null;

      if (isDriver) {
        const { data: upserted, error } = await supabase
          .from('driver_profiles')
          .upsert({
            user_id: user.id,
            whatsapp: data.whatsapp,
            cpf_cnpj: data.cpf_cnpj,
            cidade: data.cidade,
            estado: data.estado,
            veiculo_placa: data.veiculo_placa,
            veiculo_marca: data.veiculo_marca,
            veiculo_modelo: data.veiculo_modelo,
            veiculo_ano: data.veiculo_ano ? parseInt(data.veiculo_ano) : null,
            veiculo_cor: data.veiculo_cor || null,
          }, { onConflict: 'user_id' })
          .select()
          .maybeSingle();
        if (error) throw error;
        savedOperational = upserted;
      } else {
        const { data: savedMotoboy, error } = await supabase.rpc(
          'update_motoboy_operational_profile' as any,
          {
            p_fields: {
              whatsapp: data.whatsapp,
              cpf_cnpj: data.cpf_cnpj,
              cidade: data.cidade,
              estado: data.estado,
              bairro: data.bairro || null,
              veiculo_placa: data.veiculo_placa,
              veiculo_marca: data.veiculo_marca,
              veiculo_modelo: data.veiculo_modelo,
              veiculo_ano: data.veiculo_ano ? parseInt(data.veiculo_ano) : null,
              veiculo_cor: data.veiculo_cor || null,
              capacidade_bag: data.capacidade_passageiros || null,
              capacidade_garupa: data.tipo_veiculo || null,
              latitude_residencia: data.latitude_residencia,
              longitude_residencia: data.longitude_residencia,
              endereco_residencia: data.endereco_residencia || null,
            },
          }
        );
        if (error) throw error;
        savedOperational = savedMotoboy;
      }

      const { data: updatedProfile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      hydrateData(savedOperational, updatedProfile);
      toast.success('Perfil atualizado com sucesso!');

      const profileType = activeProfile || 'driver';
      const { complete } = await isProfileRegistrationComplete(user.id, profileType);
      if (complete) {
        await supabase.rpc('complete_profile_onboarding' as any, { p_profile_type: profileType });
        window.location.href = profileType === 'mototaxi' ? '/mototaxi' : '/driver';
      }
    } catch (error: any) {
      toast.error(`Erro ao salvar: ${error?.message || 'erro desconhecido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const allTermsAccepted = aceiteHabilitacao && aceitePrestador && aceiteAcessibilidade;

  return (
    <MotoboyPageTemplate title="Perfil Operacional" icon={VehicleIcon}>

      {/* ── Perfil Pessoal ── */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <UserIcon className={`h-4 w-4 ${accentColor}`} />
            Perfil Pessoal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center pb-2">
            <AvatarUpload
              userId={user.id}
              currentAvatarUrl={data.avatar_url}
              userName={data.name}
              onUploadComplete={(url) => setData(prev => ({ ...prev, avatar_url: url }))}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Nome Completo</Label>
              <Input value={data.name} onChange={(e) => setData(prev => ({ ...prev, name: e.target.value }))} placeholder="Seu nome" className="mt-1" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Mail className="h-3 w-3" /> E-mail
                <span className="ml-1 text-muted-foreground font-normal">(somente leitura)</span>
              </Label>
              <div className="relative mt-1">
                <Input value={data.email} readOnly className="pr-8 bg-muted text-muted-foreground cursor-default" />
                <Lock className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">CPF</Label>
            <Input
              value={data.cpf}
              onChange={(e) => {
                const c = e.target.value.replace(/\D/g, '').slice(0, 11);
                let f = c;
                if (c.length > 3) f = `${c.slice(0,3)}.${c.slice(3)}`;
                if (c.length > 6) f = `${c.slice(0,3)}.${c.slice(3,6)}.${c.slice(6)}`;
                if (c.length > 9) f = `${c.slice(0,3)}.${c.slice(3,6)}.${c.slice(6,9)}-${c.slice(9)}`;
                setData(prev => ({ ...prev, cpf: f }));
              }}
              placeholder="000.000.000-00"
              className="mt-1"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data de Nascimento</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <Select value={dobParts.day} onValueChange={(v) => handleDobChange('day', v)}>
                <SelectTrigger className="text-white"><SelectValue placeholder="Dia" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={dobParts.month} onValueChange={(v) => handleDobChange('month', v)}>
                <SelectTrigger className="text-white"><SelectValue placeholder="Mês" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {DOB_MONTHS.map((label, i) => (
                    <SelectItem key={label} value={String(i + 1).padStart(2, '0')}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={dobParts.year} onValueChange={(v) => handleDobChange('year', v)}>
                <SelectTrigger className="text-white"><SelectValue placeholder="Ano" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {DOB_YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Dados Operacionais ── */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className={`h-4 w-4 ${accentColor}`} />
            Dados Operacionais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">WhatsApp</Label>
            <Input
              value={data.whatsapp}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, '').slice(0, 11);
                let m = d;
                if (d.length > 2 && d.length <= 7) m = `(${d.slice(0,2)}) ${d.slice(2)}`;
                else if (d.length > 7) m = `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
                else if (d.length > 0) m = `(${d}`;
                setData(prev => ({ ...prev, whatsapp: m }));
              }}
              inputMode="numeric"
              maxLength={15}
              placeholder="(00) 00000-0000"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Estado de Atuação</Label>
              <Select value={data.estado} onValueChange={(v) => setData(prev => ({ ...prev, estado: v }))}>
                <SelectTrigger className="mt-1 bg-white border-zinc-200 !text-zinc-900 [&>span]:!text-zinc-900">
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent className="bg-white text-zinc-900 border-zinc-200">
                  {brazilianStates.map(s => <SelectItem key={s.value} value={s.value}>{s.value}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Cidade de Atuação</Label>
              <Input value={data.cidade} onChange={(e) => setData(prev => ({ ...prev, cidade: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Bairro de Atuação</Label>
            <Input value={data.bairro} onChange={(e) => setData(prev => ({ ...prev, bairro: e.target.value }))} placeholder="Ex: Centro, Jardim América..." className="mt-1" />
          </div>
        </CardContent>
      </Card>

      {/* ── Localização da Residência ── */}
      <Card className="bg-white border-l-4 border-l-green-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Home className="h-4 w-4 text-green-600" />
            Localização da Residência
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data.cidade || data.estado) && (
            <div className="flex items-center gap-3 bg-green-50 rounded-lg p-3 border border-green-100">
              <MapPin className="h-4 w-4 text-green-600 shrink-0" />
              <p className="text-sm font-bold text-foreground truncate">
                {data.endereco_residencia || [data.bairro, data.cidade, data.estado].filter(Boolean).join(' · ') || 'Defina no mapa'}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1.5"><Search className="h-3.5 w-3.5 text-green-600" /> Digite o endereço</Label>
            <div className="flex gap-2">
              <Input value={searchAddressInput} onChange={(e) => setSearchAddressInput(e.target.value)} placeholder="Rua, número, bairro, cidade" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchResidenceAddress(); } }} className="flex-1" />
              <Button type="button" onClick={handleSearchResidenceAddress} disabled={isSearchingAddress} className="bg-green-600 hover:bg-green-500 text-white shrink-0">
                {isSearchingAddress ? 'Buscando...' : 'Buscar'}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1.5"><Clipboard className="h-3.5 w-3.5 text-green-600" /> Ou cole coordenadas</Label>
            <div className="flex gap-2">
              <Input value={coordsInput} onChange={(e) => setCoordsInput(e.target.value)} placeholder="-23.5505, -46.6333" className="flex-1" />
              <Button type="button" onClick={handlePasteResidenceCoords} variant="outline" className="shrink-0 border-green-300 text-green-700 hover:bg-green-50">Aplicar</Button>
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
            operationRadiusKm={residenceLocked ? (isMototaxi ? 5 : 10) : undefined}
            onLocationSelect={(lat, lng) => setDraftMapCoords({ lat, lng })}
            className="w-full h-[300px] rounded-lg overflow-hidden"
          />
          {residenceLocked ? (
            <Button type="button" onClick={() => { setResidenceLocked(false); setDraftMapCoords(null); }} className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold">
              <MapPin className="h-4 w-4 mr-2" /> Editar localização
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button type="button" onClick={() => { setResidenceLocked(true); setDraftMapCoords(null); }} variant="outline" className="flex-1">Cancelar</Button>
              <Button type="button" onClick={() => { if (!draftMapCoords) { toast.info('Ajuste o mapa primeiro.'); return; } setPendingResidence(draftMapCoords); setConfirmResidenceCaptchaOpen(true); }} className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold">
                <Check className="h-4 w-4 mr-2" /> Confirmar localização
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <MathCaptchaDialog
        open={confirmResidenceCaptchaOpen}
        onOpenChange={setConfirmResidenceCaptchaOpen}
        onConfirmed={() => {
          if (pendingResidence) {
            setData(prev => ({ ...prev, latitude_residencia: pendingResidence.lat, longitude_residencia: pendingResidence.lng, endereco_residencia: pendingResidence.endereco || prev.endereco_residencia }));
            setPendingResidence(null); setDraftMapCoords(null); setSearchAddressInput(''); setResidenceLocked(true);
            toast.success('Residência confirmada. Clique em "Salvar" para gravar.', { duration: 7000 });
          }
        }}
        title="Confirmar residência"
        description="Resolva a soma para confirmar este local."
      />

      {/* ── Veículo ── */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <VehicleIcon className={`h-4 w-4 ${accentColor}`} />
            Veículo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Placa</Label>
              <Input value={data.veiculo_placa} onChange={(e) => setData(prev => ({ ...prev, veiculo_placa: e.target.value.toUpperCase() }))} className="mt-1 uppercase" placeholder="ABC1D23" />
            </div>
            <div>
              <Label className="text-xs">Ano</Label>
              <Input value={data.veiculo_ano} onChange={(e) => setData(prev => ({ ...prev, veiculo_ano: e.target.value }))} className="mt-1" placeholder="2020" inputMode="numeric" maxLength={4} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Marca</Label>
              <Select value={data.veiculo_marca} onValueChange={(v) => setData(prev => ({ ...prev, veiculo_marca: v }))}>
                <SelectTrigger className="mt-1 bg-white border-zinc-200 !text-zinc-900 [&>span]:!text-zinc-900">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="bg-white text-zinc-900 border-zinc-200">
                  {(isMototaxi ? MOTO_BRANDS : CAR_BRANDS).map(b => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Modelo</Label>
              <Input value={data.veiculo_modelo} onChange={(e) => setData(prev => ({ ...prev, veiculo_modelo: e.target.value }))} className="mt-1" placeholder="Corolla" />
            </div>
          </div>

          {/* Tipo de veículo */}
          <div>
            <Label className="text-xs">Tipo de Veículo</Label>
            <Select value={data.tipo_veiculo} onValueChange={(v) => setData(prev => ({ ...prev, tipo_veiculo: v }))}>
              <SelectTrigger className="mt-1 bg-white border-zinc-200 !text-zinc-900 [&>span]:!text-zinc-900">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent className="bg-white text-zinc-900 border-zinc-200">
                {vehicleTypeOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Cor */}
          <div>
            <Label className="text-xs">Cor do Veículo</Label>
            <Select value={data.veiculo_cor} onValueChange={(v) => setData(prev => ({ ...prev, veiculo_cor: v }))}>
              <SelectTrigger className="mt-1 bg-white border-zinc-200 !text-zinc-900 [&>span]:!text-zinc-900">
                <SelectValue placeholder="Selecione a cor" />
              </SelectTrigger>
              <SelectContent className="bg-white text-zinc-900 border-zinc-200">
                {COLOR_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Capacidade de passageiros — apenas para motorista (carro) */}
          {!isMototaxi && (
            <div>
              <Label className="text-xs flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-blue-500" />
                Capacidade de Passageiros
              </Label>
              <Select value={data.capacidade_passageiros} onValueChange={(v) => setData(prev => ({ ...prev, capacidade_passageiros: v }))}>
                <SelectTrigger className="mt-1 bg-white border-zinc-200 !text-zinc-900 [&>span]:!text-zinc-900">
                  <SelectValue placeholder="Quantos passageiros cabem?" />
                </SelectTrigger>
                <SelectContent className="bg-white text-zinc-900 border-zinc-200">
                  {PASSENGER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1 ml-0.5">
                Inclua todos os assentos disponíveis para passageiros, além do motorista.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Termos Legais ── */}
      <Card className="bg-white border-l-4 border-l-amber-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-amber-600" />
            Termos legais obrigatórios
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">

          {/* Termo 1 — Habilitação */}
          <label htmlFor="aceite-hab" className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${aceiteHabilitacao ? 'bg-emerald-50 border-emerald-400' : 'bg-white border-zinc-200 hover:border-zinc-300'}`}>
            <input id="aceite-hab" type="checkbox" checked={aceiteHabilitacao} onChange={(e) => setAceiteHabilitacao(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-emerald-600 cursor-pointer" />
            <div className="text-xs leading-relaxed text-zinc-800 space-y-1.5">
              <p>
                <strong>Declaro possuir CNH categoria {isMototaxi ? 'A' : 'B'} vigente</strong>, conforme exigência do art. 140 do Código de Trânsito Brasileiro (Lei nº 9.503/1997) e da Resolução CONTRAN nº 168/2004.
              </p>
              <p>
                Comprometo-me a {isMototaxi ? 'portar capacete certificado pelo INMETRO e demais EPIs obrigatórios para motociclistas, conforme art. 244 do CTB' : 'manter o veículo em perfeitas condições de segurança, com documentação regular (CRLV), seguro obrigatório (DPVAT) e inspeção veicular em dia, conforme arts. 230 e 231 do CTB'}.
              </p>
              <p>
                Estou ciente de que conduzo o veículo sob minha inteira responsabilidade civil e criminal perante terceiros.
              </p>
            </div>
          </label>

          {/* Termo 2 — Prestador Autônomo */}
          <label htmlFor="aceite-prestador" className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${aceitePrestador ? 'bg-emerald-50 border-emerald-400' : 'bg-white border-zinc-200 hover:border-zinc-300'}`}>
            <input id="aceite-prestador" type="checkbox" checked={aceitePrestador} onChange={(e) => setAceitePrestador(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-emerald-600 cursor-pointer" />
            <div className="text-xs leading-relaxed text-zinc-800 space-y-1.5">
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

          {/* Termo 3 — Acessibilidade e Deficientes */}
          <label htmlFor="aceite-acessibilidade" className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${aceiteAcessibilidade ? 'bg-blue-50 border-blue-400' : 'bg-white border-zinc-200 hover:border-zinc-300'}`}>
            <input id="aceite-acessibilidade" type="checkbox" checked={aceiteAcessibilidade} onChange={(e) => setAceiteAcessibilidade(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-blue-600 cursor-pointer" />
            <div className="text-xs leading-relaxed text-zinc-800 space-y-1.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Accessibility className="h-4 w-4 text-blue-600 shrink-0" />
                <strong className="text-blue-800">Compromisso com Acessibilidade e Inclusão</strong>
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

      {/* Botão salvar */}
      <Button
        onClick={() => {
          if (!allTermsAccepted) { toast.error('Marque os três termos legais antes de salvar.'); return; }
          setCaptchaOpen(true);
        }}
        disabled={isSaving || !allTermsAccepted}
        className="w-full bg-primary hover:bg-primary/90 text-white disabled:opacity-50"
      >
        <Check className="h-4 w-4 mr-2" />
        {isSaving ? 'Salvando...' : 'Salvar Perfil Operacional'}
      </Button>

      {!allTermsAccepted && (
        <p className="text-center text-xs text-amber-600 font-medium">
          ⚠️ Marque os três termos acima para liberar o salvamento.
        </p>
      )}

      <MathCaptchaDialog
        open={captchaOpen}
        onOpenChange={setCaptchaOpen}
        onConfirmed={handleSave}
        title="Confirme para salvar"
        description="Por segurança, resolva a soma abaixo antes de alterar seus dados."
      />

    </MotoboyPageTemplate>
  );
}
