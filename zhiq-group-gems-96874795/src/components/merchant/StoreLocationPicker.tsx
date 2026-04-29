import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MapPin, Search, Clipboard, Loader2, CheckCircle, AlertCircle, Globe, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import { parseCoordinates, formatCoordinates } from '@/lib/coordinateParser';
import { supabase } from '@/integrations/supabase/client';
import { StoreLocationMap } from '@/components/StoreLocationMap';

export interface ValidAddressDetails {
  cep?: string;
  rua?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
}

interface StoreLocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  endereco_formatado: string | null;
  onLocationChange: (lat: number, lng: number, endereco: string, details?: ValidAddressDetails) => void;
}

/* ─── Premium Map CSS (injected once) ─── */
const PICKER_STYLE_ID = 'store-picker-premium-css';
if (!document.getElementById(PICKER_STYLE_ID)) {
  const style = document.createElement('style');
  style.id = PICKER_STYLE_ID;
  style.textContent = `
    @keyframes store-pulse-ring {
      0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.55; }
      100% { transform: translate(-50%,-50%) scale(2.6); opacity: 0; }
    }
    @keyframes store-marker-drop {
      0%   { transform: translateY(-40px) scale(0.8); opacity: 0; }
      60%  { transform: translateY(5px)   scale(1.05); opacity: 1; }
      80%  { transform: translateY(-3px)  scale(0.98); }
      100% { transform: translateY(0)     scale(1); }
    }
    @keyframes store-marker-float {
      0%, 100% { transform: translateY(0); }
      50%      { transform: translateY(-4px); }
    }
    .store-premium-marker {
      animation: store-marker-drop 0.55s cubic-bezier(.34,1.56,.64,1) forwards;
    }
    .store-premium-marker:hover .store-marker-body {
      transform: scale(1.1);
      box-shadow: 0 12px 40px rgba(15,118,110,0.55), 0 0 0 6px rgba(15,118,110,0.15);
    }
    .store-marker-body {
      transition: transform 0.25s cubic-bezier(.4,0,.2,1), box-shadow 0.25s ease;
    }
    .store-pulse-ring {
      position: absolute;
      top: 50%; left: 50%;
      width: 56px; height: 56px;
      border-radius: 50%;
      border: 2px solid rgba(15,118,110,0.45);
      animation: store-pulse-ring 2.5s cubic-bezier(0,0,.2,1) infinite;
      pointer-events: none;
    }
    .store-marker-float {
      animation: store-marker-float 3s ease-in-out infinite;
    }
    /* Picker map controls */
    .picker-map .mapboxgl-ctrl-group {
      border-radius: 14px !important;
      box-shadow: 0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06) !important;
      border: none !important;
      overflow: hidden;
      backdrop-filter: blur(12px);
      background: rgba(255,255,255,0.92) !important;
    }
    .picker-map .mapboxgl-ctrl-group button {
      width: 38px !important; height: 38px !important;
      border: none !important;
      transition: background 0.15s ease !important;
    }
    .picker-map .mapboxgl-ctrl-group button:hover {
      background: rgba(15,118,110,0.08) !important;
    }
    .picker-map .mapboxgl-ctrl-group button + button {
      border-top: 1px solid rgba(0,0,0,0.06) !important;
    }
    .picker-map .mapboxgl-ctrl-attrib {
      opacity: 0.35 !important; font-size: 9px !important;
    }
    .picker-map .mapboxgl-canvas { outline: none !important; }
  `;
  document.head.appendChild(style);
}

/* ─── Marker element unused function removed ─── */

export function StoreLocationPicker({
  latitude,
  longitude,
  endereco_formatado,
  onLocationChange,
}: StoreLocationPickerProps) {
  const [searchAddress, setSearchAddress] = useState('');
  const [coordsInput, setCoordsInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('map');
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const hasValidLocation = latitude !== null && longitude !== null;
  const isDragging = false;

  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (token) {
      setMapboxToken(token);
    } else {
      console.error('[StoreLocationPicker] Token Mapbox ausente no .env');
    }
    setTokenLoading(false);
  }, []);

  const extractAddressDetails = (feature: any): ValidAddressDetails => {
    const details: ValidAddressDetails = {};

    // O Mapbox retorna os componentes do local no sub-array 'context' ou no próprio id/text principal
    if (!feature) return details;

    // Rua base e Número Opcional do Feature Root
    if (feature.place_type?.includes('address') || feature.place_type?.includes('poi')) {
      details.rua = feature.text;
      if (feature.address) {
        details.numero = feature.address;
      }
    }

    if (feature.context) {
      feature.context.forEach((ctx: any) => {
        if (ctx.id.startsWith('postcode')) {
          details.cep = ctx.text;
        } else if (ctx.id.startsWith('neighborhood') || ctx.id.startsWith('locality')) {
          details.bairro = ctx.text;
        } else if (ctx.id.startsWith('place') || ctx.id.startsWith('city')) {
          details.cidade = ctx.text;
        } else if (ctx.id.startsWith('region') || ctx.id.startsWith('state')) {
          // Extraindo sigla se existir ou texto longo
          const shortCodeMatch = ctx.short_code?.match(/BR-([A-Z]{2})/);
          details.estado = shortCodeMatch ? shortCodeMatch[1] : ctx.text;
        }
      });
    }

    // Tratamento de fallback quando não tem rua explícita (ponto pode não cair exatamente do número da rua)
    // Às vezes o Mapbox manda a rua direto no text do context "place/address"
    if (!details.rua && feature.text && !feature.id.startsWith('postcode')) {
      // Assume text local como rua se não preencheu em outro lugar e não é CEP
      details.rua = feature.text;
    }

    return details;
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      const activeToken = mapboxToken || import.meta.env.VITE_MAPBOX_TOKEN;
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${activeToken}&language=pt`
      );
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const endereco = feature.place_name;

        // Extrai CEP, Bairro, Rua e aciona callback superior
        const details = extractAddressDetails(feature);

        onLocationChange(lat, lng, endereco, details);
        return endereco;
      }
    } catch (error) {
      console.warn('Erro ao buscar endereço:', error);
    }
    const fallbackAddress = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    onLocationChange(lat, lng, fallbackAddress);
    return fallbackAddress;
  };

  const centerMapOnLocation = (lat: number, lng: number, endereco?: string) => {
    // A logica do mapa se resolve dentro de StoreLocationMap
    // O StoreLocationPicker agora é apenas shell/gerenciador de estado
    onLocationChange(lat, lng, endereco || '');
  };

  // Buscar endereço por texto
  const handleSearchAddress = async () => {
    if (!searchAddress.trim()) { toast.error('Digite um endereço para buscar'); return; }
    setIsSearching(true);
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchAddress)}.json?access_token=${mapboxToken}&country=br&language=pt&limit=1`
      );
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        const display_name = data.features[0].place_name;
        setActiveTab('map');
        onLocationChange(lat, lng, display_name);
        requestAnimationFrame(() => {
          setTimeout(() => {
            centerMapOnLocation(lat, lng, display_name);
            toast.success('Endereço encontrado! Role para baixo para ver no mapa.');
          }, 350);
        });
      } else {
        toast.error('Endereço não encontrado. Tente ser mais específico.');
      }
    } catch (error) {
      console.error('Erro na busca:', error);
      toast.error('Erro ao buscar endereço');
    } finally {
      setIsSearching(false);
    }
  };

  // Colar coordenadas
  const handlePasteCoords = async () => {
    const input = coordsInput.trim();
    if (!input) { toast.error('Cole as coordenadas. Aceita: DMS, Decimal ou link do Google Maps'); return; }
    const result = parseCoordinates(input);
    if (!result.success || !result.coordinates) { toast.error(result.error || 'Formato de coordenadas não reconhecido'); return; }
    const { latitude: lat, longitude: lng } = result.coordinates;
    const wasDMS = /[°'"´`′″]/.test(input) || /[NSEWOnsewoo]\s*$/.test(input);
    if (wasDMS) toast.success(`DMS convertido para decimal: ${formatCoordinates(lat, lng)}`);
    setActiveTab('map');
    setCoordsInput('');
    const endereco = await reverseGeocode(lat, lng);
    requestAnimationFrame(() => {
      setTimeout(() => {
        centerMapOnLocation(lat, lng, endereco);
        toast.success('Localização definida! Arraste o marcador para ajustar.');
      }, 350);
    });
  };

  // Removida variável local de drag já que a responsabilidade foi transferida

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <MapPin className="h-5 w-5 text-primary" />
          </div>
          Localização da Loja
          {hasValidLocation && !isDragging && (
            <Badge variant="default" className="ml-auto gap-1">
              <CheckCircle className="h-3.5 w-3.5" />
              Localização confirmada
            </Badge>
          )}
          {isDragging && (
            <Badge variant="outline" className="ml-auto gap-1 animate-pulse">
              <Navigation className="h-3.5 w-3.5" />
              Atualizando localização…
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {!hasValidLocation && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm font-medium">Defina a localização da loja no mapa para continuar.</p>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 h-11 rounded-xl bg-muted/60">
            <TabsTrigger value="map" className="flex items-center gap-1.5 rounded-lg data-[state=active]:shadow-sm">
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">Mapa</span>
            </TabsTrigger>
            <TabsTrigger value="search" className="flex items-center gap-1.5 rounded-lg data-[state=active]:shadow-sm">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Buscar</span>
            </TabsTrigger>
            <TabsTrigger value="coords" className="flex items-center gap-1.5 rounded-lg data-[state=active]:shadow-sm">
              <Clipboard className="h-4 w-4" />
              <span className="hidden sm:inline">Colar</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="map" forceMount className={`mt-4 ${activeTab !== 'map' ? 'hidden' : ''}`}>
            <p className="text-sm text-muted-foreground mb-3">
              Clique no mapa ou arraste o marcador para definir a localização exata.
            </p>
            <StoreLocationMap
              initialLat={latitude || undefined}
              initialLng={longitude || undefined}
              addressLabel={endereco_formatado || "Carregando endereço do pino..."}
              onLocationSelect={async (lat, lng) => {
                // Ao clicar/arrastar pino (ação originada dentro do Mapbox child component),
                // o child envia as coordenadas cruas. Aqui nós resolvemos o endereço
                // estruturado e já passamos para o Form principal com extração de Bairro/Rua.
                await reverseGeocode(lat, lng);
              }}
              className="w-full h-[420px] shadow-inner"
            />
          </TabsContent>

          <TabsContent value="search" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Digite o endereço completo da sua loja para buscar automaticamente.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: Rua das Flores, 123, Centro, São Paulo"
                value={searchAddress}
                onChange={(e) => setSearchAddress(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchAddress()}
                className="h-11 rounded-xl"
              />
              <Button onClick={handleSearchAddress} disabled={isSearching} size="icon" className="h-11 w-11 rounded-xl shrink-0">
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="coords" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Cole coordenadas do <strong>Google Earth</strong>, <strong>WhatsApp</strong> ou <strong>Google Maps</strong>.
            </p>
            <div className="space-y-2">
              <Label htmlFor="coords-input">Coordenadas (DMS ou Decimal)</Label>
              <div className="flex gap-2">
                <Input
                  id="coords-input"
                  placeholder="26°54'25&quot;S 49°04'42&quot;W ou -26.906944, -49.078333"
                  value={coordsInput}
                  onChange={(e) => setCoordsInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePasteCoords()}
                  className="h-11 rounded-xl"
                />
                <Button onClick={handlePasteCoords} size="icon" className="h-11 w-11 rounded-xl shrink-0">
                  <MapPin className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                ✓ DMS: <code className="px-1 py-0.5 rounded bg-muted text-[11px]">26°54'25"S 49°04'42"W</code><br />
                ✓ Decimal: <code className="px-1 py-0.5 rounded bg-muted text-[11px]">-26.906944, -49.078333</code><br />
                ✓ Link do Google Maps
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Premium address card */}
        {hasValidLocation && endereco_formatado && (
          <div className="rounded-xl bg-muted/40 border border-border/60 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted shrink-0">
                <Globe className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5">Coordenadas</p>
                <p className="text-xs font-mono text-muted-foreground">
                  {latitude?.toFixed(6)}, {longitude?.toFixed(6)}
                </p>
              </div>
            </div>
            <div className="h-px bg-border/50" />
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10 shrink-0 mt-0.5">
                <MapPin className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Endereço</p>
                <p className="text-sm font-semibold text-foreground leading-snug">{endereco_formatado}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
