import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { CreditCard, Calendar, User as UserIcon, Check, Phone, Bike, MapPin, Lock, Home } from 'lucide-react';
import { brazilianStates } from '@/lib/brazilianStates';
import { isProfileRegistrationComplete } from '@/lib/profileValidation';
import { MathCaptchaDialog } from '@/components/ui/math-captcha-dialog';
import { StoreLocationMap } from '@/components/StoreLocationMap';
import { parseCoordinates } from '@/lib/coordinateParser';
import { Search, Clipboard } from 'lucide-react';

const CAPACITY_OPTIONS = [
  { value: 'pequeno', label: 'Pequena (até 35L)' },
  { value: 'medio', label: 'Média (35-55L)' },
  { value: 'grande', label: 'Grande (55-80L)' },
  { value: 'extra_grande', label: 'Extra Grande (80L+)' },
] as const;

type CanonicalCapacity = typeof CAPACITY_OPTIONS[number]['value'] | '';

function normalizeCapacity(raw: string | null | undefined): CanonicalCapacity {
  if (!raw) return '';
  const lower = raw.toLowerCase().trim();
  if (CAPACITY_OPTIONS.some(o => o.value === lower)) return lower as CanonicalCapacity;
  if (lower.includes('extra') || lower.includes('80')) return 'extra_grande';
  if (lower.includes('grande') || lower.includes('55')) return 'grande';
  if (lower.includes('méd') || lower.includes('med') || lower.includes('35-55') || lower.includes('media')) return 'medio';
  if (lower.includes('peq') || lower.includes('35l')) return 'pequeno';
  return '';
}

const COLOR_OPTIONS = [
  { value: 'Preto', label: 'Preto' },
  { value: 'Branco', label: 'Branco' },
  { value: 'Prata', label: 'Prata' },
  { value: 'Vermelho', label: 'Vermelho' },
  { value: 'Azul', label: 'Azul' },
  { value: 'Verde', label: 'Verde' },
  { value: 'Amarelo', label: 'Amarelo' },
  { value: 'Outra', label: 'Outra' },
] as const;

interface MotoboyProfileData {
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
  capacidade_bag: CanonicalCapacity;
  capacidade_garupa: CanonicalCapacity;
  // Dados Pessoais (de profiles)
  name: string;
  cpf: string;
  data_nascimento: string;
  avatar_url: string;
  // Residência / Localização de Atuação
  latitude_residencia: number | null;
  longitude_residencia: number | null;
  endereco_residencia: string;
}

/**
 * Motoboy Profile Content — apenas dados operacionais e veículo.
 * Dados pessoais (nome, e-mail, avatar, CPF) ficam no Perfil Base (/profile).
 */
export default function MotoboyProfileContent() {
  const { user, activeProfile } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [captchaOpen, setCaptchaOpen] = useState(false);

  const [motoboyData, setMotoboyData] = useState<MotoboyProfileData>({
    whatsapp: '',
    cpf_cnpj: '',
    cidade: '',
    estado: '',
    bairro: '',
    veiculo_placa: '',
    veiculo_marca: '',
    veiculo_modelo: '',
    veiculo_ano: '',
    veiculo_cor: '',
    capacidade_bag: '',
    capacidade_garupa: '',
    name: '',
    cpf: '',
    data_nascimento: '',
    avatar_url: '',
    latitude_residencia: null,
    longitude_residencia: null,
    endereco_residencia: '',
  });

  const [confirmResidenceCaptchaOpen, setConfirmResidenceCaptchaOpen] = useState(false);
  const [pendingResidence, setPendingResidence] = useState<{ lat: number; lng: number; endereco?: string } | null>(null);
  /** Coordenadas atuais do mapa enquanto o motoboy arrasta. Só vira pendingResidence quando ele clicar em "Confirmar". */
  const [draftMapCoords, setDraftMapCoords] = useState<{ lat: number; lng: number } | null>(null);
  /** Pino travado (true = readOnly + balão "Minha Localização"; false = editável com botão Confirmar) */
  const [residenceLocked, setResidenceLocked] = useState(true);
  /** Aceites legais obrigatórios para salvar */
  const [aceiteCnhEpi, setAceiteCnhEpi] = useState(false);
  const [aceitePrestadorServicos, setAceitePrestadorServicos] = useState(false);
  const [searchAddressInput, setSearchAddressInput] = useState('');
  const [coordsInput, setCoordsInput] = useState('');
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);

  const handleSearchResidenceAddress = async () => {
    if (!searchAddressInput.trim()) {
      toast.error('Digite um endereço para buscar');
      return;
    }
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
    if (!token) {
      toast.error('Mapbox não configurado.');
      return;
    }
    setIsSearchingAddress(true);
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchAddressInput)}.json?access_token=${token}&country=br&language=pt&limit=1`
      );
      const data = await res.json();
      if (data.features?.[0]?.center) {
        const [lng, lat] = data.features[0].center;
        const endereco = data.features[0].place_name;
        setPendingResidence({ lat, lng, endereco });
        setConfirmResidenceCaptchaOpen(true);
      } else {
        toast.error('Endereço não encontrado. Tente ser mais específico.');
      }
    } catch (err) {
      console.error('Erro na busca de endereço:', err);
      toast.error('Erro ao buscar endereço');
    } finally {
      setIsSearchingAddress(false);
    }
  };

  const handlePasteResidenceCoords = () => {
    if (!coordsInput.trim()) {
      toast.error('Cole coordenadas do WhatsApp / Google Maps');
      return;
    }
    const result = parseCoordinates(coordsInput.trim());
    if (!result.success || !result.coordinates) {
      toast.error(result.error || 'Formato de coordenadas não reconhecido');
      return;
    }
    const { latitude: lat, longitude: lng } = result.coordinates;
    setPendingResidence({ lat, lng });
    setCoordsInput('');
    setConfirmResidenceCaptchaOpen(true);
  };
  const cityGeocodedRef = useRef(false);
  /** Centro da cidade do motoboy — usado APENAS para abrir o mapa numa posição plausível
   *  quando a residência ainda não foi confirmada. NÃO entra em state.latitude_residencia
   *  (senão o usuário acha que salvou e o banco fica com NULL). */
  const [cityCenter, setCityCenter] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (cityGeocodedRef.current) return;
    if (!motoboyData.cidade || !motoboyData.estado) return;
    // Se já temos coords salvas reais, nem precisamos do centro da cidade.
    if (motoboyData.latitude_residencia && motoboyData.longitude_residencia) return;
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
    if (!token) return;
    cityGeocodedRef.current = true;
    (async () => {
      try {
        const query = `${motoboyData.cidade}, ${motoboyData.estado}, Brasil`;
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&country=br&language=pt&limit=1`
        );
        const data = await res.json();
        if (data.features?.[0]?.center) {
          const [lng, lat] = data.features[0].center;
          setCityCenter({ lat, lng });
        }
      } catch (err) {
        console.warn('[Motoboy] Geocode da cidade falhou:', err);
      }
    })();
  }, [motoboyData.cidade, motoboyData.estado, motoboyData.latitude_residencia, motoboyData.longitude_residencia]);

  const hydrateMotoboyData = (motoboy: any, profile?: any) => {
    if (!motoboy) return;
    setMotoboyData({
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
      capacidade_bag: normalizeCapacity(motoboy.capacidade_bag),
      capacidade_garupa: normalizeCapacity(motoboy.capacidade_garupa),
      // Perfil (se disponível)
      name: profile?.name || '',
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

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const { data: motoboy } = await supabase
          .from('motoboy_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (cancelled) return;
        hydrateMotoboyData(motoboy, profile);
      } catch (error) {
        console.error('Error fetching profile:', error);
        if (!cancelled) toast.error('Erro ao carregar perfil');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleSave = async () => {
    if (!user?.id) return;
    if (!aceiteCnhEpi || !aceitePrestadorServicos) {
      toast.error('Você precisa marcar os dois termos legais para salvar.');
      return;
    }

    setIsSaving(true);
    try {
      const motoboyFields: any = {
        whatsapp: motoboyData.whatsapp,
        cpf_cnpj: motoboyData.cpf_cnpj,
        cidade: motoboyData.cidade,
        estado: motoboyData.estado,
        bairro: motoboyData.bairro || null,
        veiculo_placa: motoboyData.veiculo_placa,
        veiculo_marca: motoboyData.veiculo_marca,
        veiculo_modelo: motoboyData.veiculo_modelo,
        veiculo_ano: motoboyData.veiculo_ano ? parseInt(motoboyData.veiculo_ano) : null,
        veiculo_cor: motoboyData.veiculo_cor || null,
        capacidade_bag: normalizeCapacity(motoboyData.capacidade_bag) || null,
        capacidade_garupa: normalizeCapacity(motoboyData.capacidade_garupa) || null,
        latitude_residencia: motoboyData.latitude_residencia,
        longitude_residencia: motoboyData.longitude_residencia,
        endereco_residencia: motoboyData.endereco_residencia || null,
      };

      // 1. Atualizar Perfil Pessoal via RPC (para evitar RLS issues) ou direto
      const { error: profileError } = await supabase.rpc('update_user_profile', {
        p_name: motoboyData.name,
        p_cpf: motoboyData.cpf.replace(/\D/g, ''),
        p_data_nascimento: motoboyData.data_nascimento || null,
        p_avatar_url: motoboyData.avatar_url,
      });

      if (profileError) throw profileError;

      // 2. Atualizar Perfil Operacional
      const { data: existingRow } = await supabase
        .from('motoboy_profiles')
        .select('id, region_id')
        .eq('user_id', user.id)
        .maybeSingle();

      // Tenta salvar com os novos campos; se a migration ainda não foi aplicada, retenta sem eles.
      const tryPersist = async (fields: any) => {
        if (existingRow) {
          return await supabase
            .from('motoboy_profiles')
            .update(fields)
            .eq('user_id', user.id)
            .select('*')
            .maybeSingle();
        }
        const regionId = 'fe784974-f428-45a0-8d67-c09bdb33c5ca';
        return await supabase
          .from('motoboy_profiles')
          .insert({ ...fields, user_id: user.id, region_id: regionId })
          .select('*')
          .maybeSingle();
      };

      let { data: savedMotoboy, error } = await tryPersist(motoboyFields);
      if (error && /column|schema cache|endereco_residencia|latitude_residencia|longitude_residencia/i.test(error.message || '')) {
        console.error('[Motoboy] Save bateu em erro de coluna. Detalhes COMPLETOS:', JSON.stringify(error, null, 2));
        toast.error(
          `Localização NÃO salvou. Erro: ${error.message || 'desconhecido'} | code=${(error as any).code || 'n/a'}`,
          { duration: 20000 }
        );
        const { latitude_residencia: _a, longitude_residencia: _b, endereco_residencia: _c, ...legacyFields } = motoboyFields;
        const retry = await tryPersist(legacyFields);
        savedMotoboy = retry.data;
        error = retry.error;
      }
      if (error) throw error;

      const { data: updatedProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      hydrateMotoboyData(savedMotoboy, updatedProfile);
      toast.success('Perfil operacional e pessoal atualizados!');

      // Após salvar, marcar onboarding como concluído se completo
      const profileType = activeProfile || 'motoboy';
      const { complete } = await isProfileRegistrationComplete(user.id, profileType);
      if (complete) {
        await supabase.rpc('complete_profile_onboarding' as any, {
          p_profile_type: profileType,
        });

        const basePath = profileType === 'mototaxi' ? '/mototaxi' : '/motoboy';
        navigate(basePath, { replace: true });
        return;
      }
    } catch (error: any) {
      console.error('Error saving profile:', error);
      toast.error(`Erro ao salvar: ${error?.message || 'erro desconhecido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-motoboy border-t-transparent" />
      </div>
    );
  }

  return (
    <MotoboyPageTemplate title="Perfil Operacional" icon={Bike}>

      {/* Perfil Pessoal */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-motoboy" />
            Perfil Pessoal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center pb-2">
            <AvatarUpload
              userId={user.id}
              currentAvatarUrl={motoboyData.avatar_url}
              userName={motoboyData.name}
              onUploadComplete={(url) => setMotoboyData({ ...motoboyData, avatar_url: url })}
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Nome Completo</Label>
              <Input
                value={motoboyData.name}
                onChange={(e) => setMotoboyData({ ...motoboyData, name: e.target.value })}
                placeholder="Seu nome"
                className="mt-1"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CPF</Label>
              <Input
                value={motoboyData.cpf}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/\D/g, '').slice(0, 11);
                  let formatted = cleaned;
                  if (cleaned.length > 3) formatted = `${cleaned.slice(0, 3)}.${cleaned.slice(3)}`;
                  if (cleaned.length > 6) formatted = `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6)}`;
                  if (cleaned.length > 9) formatted = `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9)}`;
                  setMotoboyData({ ...motoboyData, cpf: formatted });
                }}
                placeholder="000.000.000-00"
                className="mt-1"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Data de Nascimento</Label>
            <Input
              type="date"
              value={motoboyData.data_nascimento}
              onChange={(e) => setMotoboyData({ ...motoboyData, data_nascimento: e.target.value })}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Dados Operacionais */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-4 w-4 text-motoboy" />
            Dados Operacionais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">WhatsApp</Label>
            <Input
              value={motoboyData.whatsapp}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, '').slice(0, 11);
                let masked = d;
                if (d.length > 2 && d.length <= 7) masked = `(${d.slice(0,2)}) ${d.slice(2)}`;
                else if (d.length > 7) masked = `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
                else if (d.length > 0) masked = `(${d}`;
                setMotoboyData({ ...motoboyData, whatsapp: masked });
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
              <Select
                value={motoboyData.estado}
                onValueChange={(v) => setMotoboyData({ ...motoboyData, estado: v })}
              >
                <SelectTrigger className="mt-1 text-foreground bg-background border-border">
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent className="bg-background text-foreground border-border">
                  {brazilianStates.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="text-foreground">{s.value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Cidade de Atuação</Label>
              <Input
                value={motoboyData.cidade}
                onChange={(e) => setMotoboyData({ ...motoboyData, cidade: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Bairro de Atuação</Label>
            <Input
              value={motoboyData.bairro}
              onChange={(e) => setMotoboyData({ ...motoboyData, bairro: e.target.value })}
              placeholder="Ex: Centro, Jardim América..."
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Localização da Residência (mapa) */}
      <Card className="bg-white border-l-4 border-l-green-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Home className="h-4 w-4 text-green-600" />
            Localização da Residência
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(motoboyData.cidade || motoboyData.estado || motoboyData.bairro) && (
            <div className="flex items-center gap-3 bg-green-50 rounded-lg p-3 border border-green-100">
              <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <MapPin className="h-4 w-4 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wider">Endereço atual</p>
                <p className="text-sm font-bold text-foreground truncate">
                  {motoboyData.endereco_residencia
                    || [motoboyData.bairro, motoboyData.cidade, motoboyData.estado].filter(Boolean).join(' · ')
                    || 'Defina sua localização no mapa abaixo'}
                </p>
              </div>
            </div>
          )}

          {/* Digite endereço */}
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5 text-green-600" />
              Digite o endereço da sua residência
            </Label>
            <div className="flex gap-2">
              <Input
                value={searchAddressInput}
                onChange={(e) => setSearchAddressInput(e.target.value)}
                placeholder="Rua, número, bairro, cidade"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchResidenceAddress(); } }}
                className="flex-1"
              />
              <Button
                type="button"
                onClick={handleSearchResidenceAddress}
                disabled={isSearchingAddress}
                className="bg-green-600 hover:bg-green-500 text-white shrink-0"
              >
                {isSearchingAddress ? 'Buscando...' : 'Buscar'}
              </Button>
            </div>
          </div>

          {/* Cole coordenadas WhatsApp */}
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1.5">
              <Clipboard className="h-3.5 w-3.5 text-green-600" />
              Ou cole as coordenadas do WhatsApp / Google Maps
            </Label>
            <div className="flex gap-2">
              <Input
                value={coordsInput}
                onChange={(e) => setCoordsInput(e.target.value)}
                placeholder="-23.5505, -46.6333  ou  link do Google Maps"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handlePasteResidenceCoords(); } }}
                className="flex-1"
              />
              <Button
                type="button"
                onClick={handlePasteResidenceCoords}
                variant="outline"
                className="shrink-0 border-green-300 text-green-700 hover:bg-green-50"
              >
                Aplicar
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground ml-1">
              Aceita DMS, decimal, ou link compartilhado direto do WhatsApp.
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200"></div></div>
            <div className="relative flex justify-center"><span className="bg-white px-3 text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Ou no mapa</span></div>
          </div>

          <p className="text-xs text-muted-foreground">
            {residenceLocked
              ? '🔒 Pino travado. Clique em "Editar localização" para mudar.'
              : '📍 Arraste o mapa para posicionar o pino. Quando estiver certo, clique em "Confirmar esta localização".'}
          </p>

          <StoreLocationMap
            key={residenceLocked ? 'res-locked' : 'res-edit'}
            initialLat={motoboyData.latitude_residencia ?? cityCenter?.lat ?? undefined}
            initialLng={motoboyData.longitude_residencia ?? cityCenter?.lng ?? undefined}
            hasConfirmedLocation={motoboyData.latitude_residencia != null && motoboyData.longitude_residencia != null}
            addressLabel={motoboyData.endereco_residencia || '📍 Minha Localização'}
            markerLabel="📍 Minha Localização"
            readOnly={residenceLocked}
            onLocationSelect={(lat, lng) => {
              // Apenas guarda a posição enquanto arrasta. Captcha SÓ abre no botão "Confirmar".
              setDraftMapCoords({ lat, lng });
            }}
            className="w-full h-[320px] rounded-lg overflow-hidden"
          />

          {residenceLocked ? (
            <Button
              type="button"
              onClick={() => { setResidenceLocked(false); setDraftMapCoords(null); }}
              className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold"
            >
              <MapPin className="h-4 w-4 mr-2" />
              Editar localização
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => { setResidenceLocked(true); setDraftMapCoords(null); }}
                variant="outline"
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!draftMapCoords) {
                    toast.info('Mexa o mapa para ajustar a posição do pino antes de confirmar.');
                    return;
                  }
                  setPendingResidence(draftMapCoords);
                  setConfirmResidenceCaptchaOpen(true);
                }}
                className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold"
              >
                <Check className="h-4 w-4 mr-2" />
                Confirmar esta localização
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Captcha — confirma que tem certeza da residência selecionada */}
      <MathCaptchaDialog
        open={confirmResidenceCaptchaOpen}
        onOpenChange={setConfirmResidenceCaptchaOpen}
        onConfirmed={() => {
          if (pendingResidence) {
            setMotoboyData(prev => ({
              ...prev,
              latitude_residencia: pendingResidence.lat,
              longitude_residencia: pendingResidence.lng,
              endereco_residencia: pendingResidence.endereco || prev.endereco_residencia,
            }));
            setPendingResidence(null);
            setDraftMapCoords(null);
            setSearchAddressInput('');
            setResidenceLocked(true);
            toast.success('Residência confirmada. ⚠️ Agora clique em "Salvar Perfil Operacional" no fim da página para gravar!', { duration: 8000 });
          }
        }}
        title="Tem certeza da sua residência?"
        description="Resolva a soma para confirmar este local como sua residência."
      />

      {/* Vehicle Info */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bike className="h-4 w-4 text-motoboy" />
            Veículo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Placa</Label>
              <Input
                value={motoboyData.veiculo_placa}
                onChange={(e) => setMotoboyData({ ...motoboyData, veiculo_placa: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Ano</Label>
              <Input
                value={motoboyData.veiculo_ano}
                onChange={(e) => setMotoboyData({ ...motoboyData, veiculo_ano: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Marca</Label>
              <Input
                value={motoboyData.veiculo_marca}
                onChange={(e) => setMotoboyData({ ...motoboyData, veiculo_marca: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Modelo</Label>
              <Input
                value={motoboyData.veiculo_modelo}
                onChange={(e) => setMotoboyData({ ...motoboyData, veiculo_modelo: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Cor da Moto *</Label>
            <Select 
              value={motoboyData.veiculo_cor} 
              onValueChange={(v) => setMotoboyData({ ...motoboyData, veiculo_cor: v })}
            >
              <SelectTrigger className="mt-1 text-foreground bg-background border-border">
                <SelectValue placeholder="Selecione a cor" />
              </SelectTrigger>
              <SelectContent className="bg-background text-foreground border-border">
                {COLOR_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-foreground">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Capacidade da Bag</Label>
              <Select 
                value={motoboyData.capacidade_bag} 
                onValueChange={(v) => setMotoboyData({ ...motoboyData, capacidade_bag: v as CanonicalCapacity })}
              >
                <SelectTrigger className="mt-1 text-foreground bg-background border-border">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="bg-background text-foreground border-border">
                  {CAPACITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-foreground">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Capacidade da Garupa</Label>
              <Select 
                value={motoboyData.capacidade_garupa} 
                onValueChange={(v) => setMotoboyData({ ...motoboyData, capacidade_garupa: v as CanonicalCapacity })}
              >
                <SelectTrigger className="mt-1 text-foreground bg-background border-border">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="bg-background text-foreground border-border">
                  {CAPACITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-foreground">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Aceites Legais Obrigatórios */}
      <Card className="bg-white border-l-4 border-l-amber-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Check className="h-4 w-4 text-amber-600" />
            Termos legais obrigatórios
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Aceite 1 — CNH + EPI */}
          <label
            htmlFor="aceite-cnh-epi"
            className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
              aceiteCnhEpi
                ? 'bg-emerald-50 border-emerald-400'
                : 'bg-white border-zinc-200 hover:border-zinc-300'
            }`}
          >
            <input
              id="aceite-cnh-epi"
              type="checkbox"
              checked={aceiteCnhEpi}
              onChange={(e) => setAceiteCnhEpi(e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 accent-emerald-600 cursor-pointer"
            />
            <div className="text-xs leading-relaxed text-zinc-800 space-y-1.5">
              <p>
                <strong>Declaro possuir CNH categoria A vigente</strong>, conforme exigência do art. 140 do Código de Trânsito Brasileiro (Lei nº 9.503/1997) e da Resolução CONTRAN nº 168/2004.
              </p>
              <p>
                Comprometo-me a portar e utilizar os Equipamentos de Proteção Individual (EPI) obrigatórios para motociclistas — incluindo capacete certificado pelo INMETRO, viseira ou óculos de proteção, calça e jaqueta apropriadas — conforme NR-6 do Ministério do Trabalho e art. 244 do CTB.
              </p>
              <p>
                Estou ciente de que conduzir veículo sem CNH, sem habilitação compatível ou sem EPI configura infração gravíssima (art. 162 e 244 do CTB) e me responsabilizo civil e criminalmente por descumprir tais exigências durante as entregas pela plataforma.
              </p>
            </div>
          </label>

          {/* Aceite 2 — Prestador de Serviços Autônomo */}
          <label
            htmlFor="aceite-prestador"
            className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
              aceitePrestadorServicos
                ? 'bg-emerald-50 border-emerald-400'
                : 'bg-white border-zinc-200 hover:border-zinc-300'
            }`}
          >
            <input
              id="aceite-prestador"
              type="checkbox"
              checked={aceitePrestadorServicos}
              onChange={(e) => setAceitePrestadorServicos(e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 accent-emerald-600 cursor-pointer"
            />
            <div className="text-xs leading-relaxed text-zinc-800 space-y-1.5">
              <p>
                <strong>Declaro atuar como prestador de serviços autônomo</strong>, nos termos do art. 442-B da Consolidação das Leis do Trabalho (incluído pela Lei nº 13.467/2017 — Reforma Trabalhista), sem qualquer vínculo empregatício, subordinação, exclusividade ou pessoalidade com a plataforma Viagg-TX8.
              </p>
              <p>
                Reconheço minha responsabilidade pelo recolhimento de contribuições previdenciárias (INSS como contribuinte individual / MEI), tributos municipais (ISS) e demais obrigações fiscais aplicáveis à minha atividade, conforme Lei Complementar nº 123/2006 e Lei nº 8.212/1991.
              </p>
              <p>
                Assumo integralmente os riscos e responsabilidades inerentes ao exercício da atividade de entrega — incluindo danos a terceiros, perda ou avaria de mercadorias por culpa exclusiva, e qualquer obrigação trabalhista, previdenciária ou tributária que decorra da minha atuação como autônomo.
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button
        onClick={() => {
          if (!aceiteCnhEpi || !aceitePrestadorServicos) {
            toast.error('Marque os dois aceites legais antes de salvar.');
            return;
          }
          setCaptchaOpen(true);
        }}
        disabled={isSaving || !aceiteCnhEpi || !aceitePrestadorServicos}
        className="w-full bg-motoboy hover:bg-motoboy-hover text-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Check className="h-4 w-4 mr-2" />
        {isSaving ? 'Salvando...' : 'Salvar Perfil Operacional'}
      </Button>
      {(!aceiteCnhEpi || !aceitePrestadorServicos) && (
        <p className="text-center text-xs text-amber-600 font-medium">
          ⚠️ Marque os dois termos acima para liberar o salvamento.
        </p>
      )}

      <MathCaptchaDialog
        open={captchaOpen}
        onOpenChange={setCaptchaOpen}
        onConfirmed={handleSave}
        title="Confirme para salvar seu perfil"
        description="Por segurança, resolva a soma abaixo antes de alterar seus dados pessoais."
      />
    </MotoboyPageTemplate>
  );
}
