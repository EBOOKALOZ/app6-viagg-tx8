/**
 * Merchant Profile Page — renderiza dentro do MerchantLayout
 * APENAS dados pessoais do lojista (pessoa, não negócio)
 */
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { User, Mail, Calendar, Building, CreditCard, MapPin, Loader2, Phone, Heart } from 'lucide-react';
import { AvatarUpload } from '@/components/profile/AvatarUpload';
import { brazilianStates } from '@/lib/brazilianStates';
import { MerchantRecentEvents } from '@/components/merchant/MerchantRecentEvents';

/* ─── helpers ─────────────────────────────────────────────────── */
const formatCPF = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
};

const formatWhatsApp = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
};

const estadoCivilOptions = [
  { value: 'solteiro', label: 'Solteiro(a)' },
  { value: 'casado', label: 'Casado(a)' },
  { value: 'uniao_estavel', label: 'União estável' },
  { value: 'divorciado', label: 'Divorciado(a)' },
  { value: 'viuvo', label: 'Viúvo(a)' },
  { value: 'nao_informar', label: 'Prefiro não informar' },
];

interface BaseData {
  name: string;
  email: string;
  data_nascimento: string;
  cidade: string;
  estado: string;
  avatar_url: string;
  cpf: string;
  telefone: string;
  estado_civil: string;
}

export default function MerchantProfileContent() {
  const { user } = useAuth();

  const [base, setBase] = useState<BaseData>({
    name: '', email: '', data_nascimento: '', cidade: '', estado: '', avatar_url: '', cpf: '', telefone: '', estado_civil: ''
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  /* fetch */
  useEffect(() => {
    if (!user) return;
    (async () => {
      setIsLoading(true);
      const { data: bp } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (bp) {
        const p = bp as Record<string, unknown>;
        setBase({
          name: (p.name as string) || '',
          email: (p.email as string) || user.email || '',
          data_nascimento: (p.data_nascimento as string) || '',
          cidade: (p.cidade as string) || '',
          estado: (p.estado as string) || '',
          avatar_url: (p.avatar_url as string) || '',
          cpf: (p.cpf as string) || '',
          telefone: (p.telefone as string) || '',
          estado_civil: (p.estado_civil as string) || '',
        });
      } else {
        setBase(prev => ({ ...prev, email: user.email || '' }));
      }
      setIsLoading(false);
    })();
  }, [user]);

  /* save */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const birth = base.data_nascimento ? new Date(base.data_nascimento) : null;
    if (birth && birth > new Date()) {
      toast.error('Data de nascimento não pode ser futura');
      return;
    }
    setIsSaving(true);
    try {
      const rpcPayload = {
        p_name: base.name || null,
        p_cpf: base.cpf.replace(/\D/g, '') || null,
        p_telefone: base.telefone.replace(/\D/g, '') || null,
        p_estado_civil: base.estado_civil || null,
        p_cidade: base.cidade || null,
        p_estado: base.estado || null,
        p_avatar_url: base.avatar_url || null,
        p_data_nascimento: base.data_nascimento || null,
      };

      console.log('[MerchantProfile] Chamando RPC update_user_profile:', rpcPayload);

      const { data, error } = await supabase.rpc('update_user_profile', rpcPayload as any);

      if (error) {
        console.error('[MerchantProfile] ERRO RPC:', error);
        toast.error(`Erro ao salvar: ${error.message}`);
        setIsSaving(false);
        return;
      }

      console.log('[MerchantProfile] Resposta RPC:', data);

      const result = data as any;
      if (result?.success) {
        console.log('[MerchantProfile] ✅ Perfil atualizado com sucesso');
        toast.success('Dados pessoais salvos!');
      } else {
        console.error('[MerchantProfile] RPC retornou falha:', result?.error);
        toast.error(result?.error || 'Erro ao salvar dados pessoais');
      }
    } catch (err) {
      console.error('[MerchantProfile] Unexpected error:', err);
      toast.error('Erro inesperado ao salvar dados pessoais');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-4 pb-28 lg:max-w-none mx-auto animate-fade-in lg:py-8 lg:px-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <User className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Perfil</h1>
          <p className="text-muted-foreground text-sm">Seus dados pessoais</p>
        </div>
      </div>

      <MerchantRecentEvents module="profile" />

      {/* Desktop 2-col layout */}
      <div className="space-y-6">

        {/* Avatar — foto principal única */}
        <Card>
          <CardContent className="pt-6">
            <AvatarUpload
              userId={user?.id || ''}
              currentAvatarUrl={base.avatar_url}
              userName={base.name}
              onUploadComplete={(url) => setBase(prev => ({ ...prev, avatar_url: url }))}
            />
          </CardContent>
        </Card>

        {/* Dados Pessoais */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-primary" />
              Informações Pessoais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">

              {/* E-mail full width */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mail className="h-4 w-4" /> E-mail
                </Label>
                <Input value={base.email} disabled className="bg-muted" />
              </div>

              {/* Desktop 2-col grid for form fields */}
              <div className="lg:grid lg:grid-cols-2 lg:gap-4 space-y-4 lg:space-y-0">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <User className="h-4 w-4" /> Nome Completo
                  </Label>
                  <Input
                    value={base.name}
                    onChange={e => setBase(p => ({ ...p, name: e.target.value }))}
                    placeholder="Seu nome completo"
                    maxLength={100}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" /> CPF
                  </Label>
                  <Input
                    value={formatCPF(base.cpf)}
                    onChange={e => setBase(p => ({ ...p, cpf: e.target.value.replace(/\D/g, '') }))}
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                </div>
              </div>

              <div className="lg:grid lg:grid-cols-2 lg:gap-4 space-y-4 lg:space-y-0">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Phone className="h-4 w-4" /> WhatsApp
                  </Label>
                  <Input
                    value={formatWhatsApp(base.telefone)}
                    onChange={e => setBase(p => ({ ...p, telefone: e.target.value.replace(/\D/g, '') }))}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Heart className="h-4 w-4" /> Estado Civil
                  </Label>
                  <Select
                    value={base.estado_civil}
                    onValueChange={v => setBase(p => ({ ...p, estado_civil: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {estadoCivilOptions.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="lg:grid lg:grid-cols-2 lg:gap-4 space-y-4 lg:space-y-0">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" /> Data de Nascimento
                  </Label>
                  <Input
                    type="date"
                    value={base.data_nascimento}
                    onChange={e => setBase(p => ({ ...p, data_nascimento: e.target.value }))}
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Building className="h-4 w-4" /> Cidade
                  </Label>
                  <Input
                    value={base.cidade}
                    onChange={e => setBase(p => ({ ...p, cidade: e.target.value }))}
                    placeholder="Sua cidade"
                    maxLength={100}
                  />
                </div>
              </div>

              <div className="lg:grid lg:grid-cols-2 lg:gap-4 space-y-4 lg:space-y-0">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" /> Estado
                  </Label>
                  <Select
                    value={base.estado}
                    onValueChange={v => setBase(p => ({ ...p, estado: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {brazilianStates.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="lg:flex lg:justify-end">
                <Button type="submit" className="w-full lg:w-auto lg:min-w-[220px]" disabled={isSaving}>
                  {isSaving
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
                    : 'Salvar Dados Pessoais'
                  }
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
