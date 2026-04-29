import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Car,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Fuel,
  Settings2,
  Gavel,
  Tag,
  Coins,
} from 'lucide-react';
import { cn, formatCurrencyBRL } from '@/lib/utils';
import { useRealEstatePackages, type RealEstatePackage } from '@/hooks/useRealEstatePackages';
import { VehicleAutoPackages, type VehiclePackage } from '@/components/advertiser/VehicleAutoPackages';
import { ModeSelector, AuctionFields, CreditInfoBanner, type ListingMode, type AuctionFormState, defaultAuctionForm } from '@/components/advertiser/ListingModeSelector';

export const VehicleForm = () => {
  const { user } = useAuth();
  const { listingId: urlListingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [listingId, setListingId] = useState<string | null>(urlListingId || null);

  // ── Modalidade de anúncio ──
  const [listingMode, setListingMode] = useState<ListingMode>('normal');
  const [auctionForm, setAuctionForm] = useState<AuctionFormState>(defaultAuctionForm);
  const [createdEndsAt, setCreatedEndsAt] = useState<string | null>(null);

  // ── Pacote selecionado ──
  const [selectedPackage, setSelectedPackage] = useState<VehiclePackage | null>(null);

  // ── Form States ──
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
    docs_ok: false,
    insured: false,
  });

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

  useEffect(() => {
    if (user && !contactData.contact_name) {
      setContactData(prev => ({ ...prev, contact_name: user.email?.split('@')[0] || '' }));
    }
  }, [user]);

  // ── Handler para seleção de pacote ──
  const handleSelectPackage = (pkg: VehiclePackage) => {
    setSelectedPackage(pkg);
    toast.success(`Pacote ${pkg.name} selecionado! Redirecionando para pagamento...`);
    navigate(`/anunciante/checkout?packageId=${pkg.id}&from=vehicle`);
  };

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
                <Car className="w-8 h-8 text-blue-500" />
                Anunciar Veículo
              </h1>
              <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Marketplace Automotivo Viagg-TX8</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3">
            {[
              { id: 1, name: 'Dados', icon: Car },
              { id: 2, name: 'Localização', icon: Tag },
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

            {/* STEP 1: ESPECIFICAÇÕES + MODALIDADE */}
            {step === 1 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <section className="space-y-8">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black text-sm">01</span>
                    <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Especificações do Veículo</h2>
                  </div>

                  <Card className="rounded-3xl border-zinc-100 bg-white shadow-sm">
                    <CardContent className="p-8 space-y-8">
                      {/* Título */}
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Título do Anúncio</label>
                        <Input
                          placeholder="Ex: Honda Civic 2020, 40.000km, automático"
                          className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 transition-all font-bold text-zinc-900"
                          value={vehicleData.title}
                          onChange={(e) => setVehicleData(prev => ({ ...prev, title: e.target.value }))}
                        />
                      </div>

                      {/* Tipo + Condição */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Tipo</label>
                          <Select value={vehicleData.vehicle_type} onValueChange={(v) => setVehicleData(prev => ({ ...prev, vehicle_type: v }))}>
                            <SelectTrigger className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="carro">Carro</SelectItem>
                              <SelectItem value="moto">Moto</SelectItem>
                              <SelectItem value="caminhao">Caminhão</SelectItem>
                              <SelectItem value="van">Van/Utilitário</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Condição</label>
                          <Select value={vehicleData.condition} onValueChange={(v) => setVehicleData(prev => ({ ...prev, condition: v }))}>
                            <SelectTrigger className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="novo">Novo</SelectItem>
                              <SelectItem value="seminovo">Seminovo</SelectItem>
                              <SelectItem value="usado">Usado</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Marca/Modelo/Ano */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Marca</label>
                          <Input placeholder="Ex: Honda" className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold" value={vehicleData.brand} onChange={(e) => setVehicleData(prev => ({ ...prev, brand: e.target.value }))} />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Modelo</label>
                          <Input placeholder="Ex: Civic" className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold" value={vehicleData.model} onChange={(e) => setVehicleData(prev => ({ ...prev, model: e.target.value }))} />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Ano</label>
                          <Input placeholder="2020" className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold" value={vehicleData.year} onChange={(e) => setVehicleData(prev => ({ ...prev, year: e.target.value }))} />
                        </div>
                      </div>

                      {/* Preço + KM */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Preço (R$)</label>
                          <Input placeholder="0,00" className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold" value={vehicleData.price_brl} onChange={(e) => setVehicleData(prev => ({ ...prev, price_brl: e.target.value }))} />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Quilometragem</label>
                          <Input placeholder="0" className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold" value={vehicleData.kilometers} onChange={(e) => setVehicleData(prev => ({ ...prev, kilometers: e.target.value }))} />
                        </div>
                      </div>

                      {/* Combustível + Câmbio */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Combustível</label>
                          <Select value={vehicleData.fuel_type} onValueChange={(v) => setVehicleData(prev => ({ ...prev, fuel_type: v }))}>
                            <SelectTrigger className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="flex">Flex</SelectItem>
                              <SelectItem value="gasolina">Gasolina</SelectItem>
                              <SelectItem value="etanol">Etanol</SelectItem>
                              <SelectItem value="diesel">Diesel</SelectItem>
                              <SelectItem value="eletrico">Elétrico</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Câmbio</label>
                          <Select value={vehicleData.transmission} onValueChange={(v) => setVehicleData(prev => ({ ...prev, transmission: v }))}>
                            <SelectTrigger className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="manual">Manual</SelectItem>
                              <SelectItem value="automatico">Automático</SelectItem>
                              <SelectItem value="semi-automatico">Semi-Automático</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Cor */}
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Cor</label>
                        <Input placeholder="Ex: Prata, Branco Perolado..." className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 transition-all font-bold text-zinc-900" value={vehicleData.color} onChange={(e) => setVehicleData(prev => ({ ...prev, color: e.target.value }))} />
                      </div>

                      {/* Documentação */}
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                          <ShieldCheck className="w-3 h-3" /> Situação do Veículo
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <button
                            type="button"
                            onClick={() => setVehicleData(prev => ({ ...prev, docs_ok: !prev.docs_ok }))}
                            className={cn(
                              'flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left',
                              vehicleData.docs_ok
                                ? 'border-emerald-500 bg-emerald-50'
                                : 'border-zinc-100 bg-zinc-50 hover:border-zinc-300'
                            )}
                          >
                            <div className={cn(
                              'w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all',
                              vehicleData.docs_ok ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-300 bg-white'
                            )}>
                              {vehicleData.docs_ok && <CheckCircle2 className="w-4 h-4 text-white" />}
                            </div>
                            <div>
                              <p className="text-xs font-black text-zinc-900 uppercase tracking-tight">Documentos em Dia</p>
                              <p className="text-[9px] text-zinc-400 font-medium">IPVA, licenciamento e multas quitados</p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setVehicleData(prev => ({ ...prev, insured: !prev.insured }))}
                            className={cn(
                              'flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left',
                              vehicleData.insured
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-zinc-100 bg-zinc-50 hover:border-zinc-300'
                            )}
                          >
                            <div className={cn(
                              'w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all',
                              vehicleData.insured ? 'bg-blue-500 border-blue-500' : 'border-zinc-300 bg-white'
                            )}>
                              {vehicleData.insured && <CheckCircle2 className="w-4 h-4 text-white" />}
                            </div>
                            <div>
                              <p className="text-xs font-black text-zinc-900 uppercase tracking-tight">Segurado</p>
                              <p className="text-[9px] text-zinc-400 font-medium">Veículo com seguro ativo</p>
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* Descrição */}
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Observações do Vendedor</label>
                        <Textarea
                          placeholder="Descreva detalhes como estado dos pneus, revisões, opcionais exclusivos..."
                          className="min-h-[150px] rounded-[30px] border-zinc-100 bg-zinc-50 font-medium p-6 border-2 focus:border-blue-500 transition-all text-zinc-900"
                          value={vehicleData.description}
                          onChange={(e) => setVehicleData(prev => ({ ...prev, description: e.target.value }))}
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

            {/* STEP 2: LOCALIZAÇÃO + CONTATO */}
            {step === 2 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <section className="space-y-8">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black text-sm">02</span>
                    <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Localização e Contato</h2>
                  </div>

                  <Card className="rounded-3xl border-zinc-100 bg-white shadow-sm">
                    <CardContent className="p-8 space-y-8">
                      {/* Localização */}
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Cidade</label>
                            <Input placeholder="Cidade" className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold" value={locationData.city} onChange={(e) => setLocationData(prev => ({ ...prev, city: e.target.value }))} />
                          </div>
                          <div className="space-y-3">
                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Estado</label>
                            <Input placeholder="UF" className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold" value={locationData.state} onChange={(e) => setLocationData(prev => ({ ...prev, state: e.target.value }))} />
                          </div>
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Bairro</label>
                          <Input placeholder="Bairro" className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold" value={locationData.neighborhood} onChange={(e) => setLocationData(prev => ({ ...prev, neighborhood: e.target.value }))} />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Endereço Completo (opcional)</label>
                          <Input placeholder="Rua, número, complemento..." className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold" value={locationData.public_address_label} onChange={(e) => setLocationData(prev => ({ ...prev, public_address_label: e.target.value }))} />
                        </div>
                      </div>

                      {/* Contato */}
                      <div className="space-y-6 pt-6 border-t border-zinc-100">
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Nome do Responsável</label>
                          <Input placeholder="Seu nome completo" className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold" value={contactData.contact_name} onChange={(e) => setContactData(prev => ({ ...prev, contact_name: e.target.value }))} />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">WhatsApp</label>
                          <Input placeholder="(47) 99999-9999" className="h-14 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold" value={contactData.whatsapp_e164} onChange={(e) => setContactData(prev => ({ ...prev, whatsapp_e164: e.target.value }))} />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Telefone (opcional)</label>
                          <Input placeholder="(47) 99999-9999" className="h-12 rounded-2xl border-zinc-100 bg-zinc-50 border-2 focus:border-blue-500 font-bold" value={contactData.phone_e164} onChange={(e) => setContactData(prev => ({ ...prev, phone_e164: e.target.value }))} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </section>

                <div className="flex justify-end">
                  <Button onClick={() => setStep(3)} className="h-16 px-12 rounded-[24px] bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs tracking-[0.2em] shadow-2xl shadow-blue-600/20 group gap-3">
                    Próximo Passo <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-all" />
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3: PACOTES */}
            {step === 3 && (
              <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <section className="space-y-8">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black text-sm">03</span>
                    <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Escolha seu Pacote</h2>
                  </div>

                  <Card className="rounded-3xl border-zinc-100 bg-white shadow-sm p-8">
                    <CreditInfoBanner />
                  </Card>

                  {/* Pacotes */}
                  <div className="mt-8">
                    <VehicleAutoPackages
                      onSelect={handleSelectPackage}
                      selectedId={selectedPackage?.id || null}
                    />
                  </div>
                </section>
              </div>
            )}

          </div>

          {/* Sidebar */}
          <div className="lg:col-span-4 space-y-8">
            <div className="sticky top-28 space-y-8">
              <Card className="bg-gradient-to-br from-emerald-700 to-emerald-900 border-none shadow-3xl rounded-[40px] text-white overflow-hidden p-10 space-y-6">
                <div className="p-1 border border-white/20 rounded-3xl w-fit bg-white/10">
                  <ShieldCheck className="w-8 h-8 text-white shadow-3xl shadow-white/30" />
                </div>
                <div className="space-y-3">
                  <h3 className="text-2xl font-black tracking-tighter leading-tight uppercase">Anúncio Gratuito</h3>
                  <p className="text-white/80 text-xs leading-relaxed font-bold tracking-wide">
                    Prezado anunciante, seus anúncios são veiculados gratuitamente, porém, o acesso de interesse em seu produto só será liberado perante uso de créditos disponível abaixo.
                  </p>
                </div>
                <div className="space-y-4 pt-6 border-t border-white/10 uppercase font-black text-[9px] tracking-widest text-white/70">
                  <div className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-white" /> Veiculação 100% Grátis</div>
                  <div className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-white" /> Créditos Liberam o Contato</div>
                  <div className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-white" /> O Anunciante Paga pelo Acesso</div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VehicleForm;
