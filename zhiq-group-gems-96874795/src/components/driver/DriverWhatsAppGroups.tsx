import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { MessageSquare, Info, Plus, Trash2, Loader2, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react';
import { brazilianStates } from '@/lib/brazilianStates';

interface WhatsAppGroup {
  id: string;
  link: string;
  cidade: string;
  estado: string;
  tipo: string;
  status: string;
  created_at: string;
}

const GROUP_TYPES = ['Mobilidade', 'Comunidade', 'Comércio', 'Serviços', 'Geral'];

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; description: string }> = {
  em_analise: { label: 'Em análise', variant: 'secondary', description: 'Aguardando validação de participação' },
  ativo: { label: 'Ativo', variant: 'default', description: 'Participação confirmada' },
  inativo: { label: 'Inativo', variant: 'outline', description: 'Grupo desativado' },
  rejeitado: { label: 'Rejeitado', variant: 'destructive', description: 'Participação não confirmada' },
};

// Commission rates based on active groups
const COMMISSION_TABLE = [
  { groups: '3+', rate: 6 },
  { groups: '2', rate: 11 },
  { groups: '1', rate: 18 },
  { groups: '0', rate: 25 },
];

const getCommissionRate = (activeGroups: number): number => {
  if (activeGroups >= 3) return 6;
  if (activeGroups === 2) return 11;
  if (activeGroups === 1) return 18;
  return 25;
};

export default function DriverWhatsAppGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  
  // Form state
  const [link, setLink] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [tipo, setTipo] = useState('Geral');
  const [confirmaParticipacao, setConfirmaParticipacao] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    if (user) {
      loadGroups();
    }
  }, [user]);

  const loadGroups = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('driver_whatsapp_groups')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGroups((data as WhatsAppGroup[]) || []);
    } catch (error) {
      console.error('Error loading groups:', error);
      toast.error('Erro ao carregar grupos');
    } finally {
      setIsLoading(false);
    }
  };

  const validateLink = (url: string): boolean => {
    // Accept various WhatsApp link formats
    const whatsappPatterns = [
      /^https?:\/\/(chat\.whatsapp\.com|wa\.me)/i,
      /^https?:\/\/api\.whatsapp\.com/i,
    ];
    return whatsappPatterns.some(pattern => pattern.test(url.trim()));
  };

  const handleAddGroup = async () => {
    if (!user) return;
    
    // Validation
    if (!link.trim()) {
      toast.error('Informe o link do grupo');
      return;
    }
    
    if (!validateLink(link)) {
      toast.error('Link inválido. Use um link válido do WhatsApp');
      return;
    }
    
    if (!cidade.trim()) {
      toast.error('Informe a cidade');
      return;
    }
    
    if (!estado) {
      toast.error('Selecione o estado');
      return;
    }

    if (!confirmaParticipacao) {
      toast.error('Você deve confirmar que é participante ativo do grupo');
      return;
    }

    setIsSaving(true);
    try {
      const { data, error } = await supabase.rpc('try_create_driver_whatsapp_group' as any, {
        p_link: link.trim(),
        p_cidade: cidade.trim(),
        p_estado: estado,
        p_tipo: tipo,
        p_user_id: user.id,
      });

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;
      if (result && result.created === false) {
        toast.warning('Este grupo já está cadastrado na plataforma.');
      } else {
        toast.success('Grupo adicionado! Aguarde a validação da sua participação.');
        setLink('');
        setCidade('');
        setEstado('');
        setTipo('Geral');
        setConfirmaParticipacao(false);
        setShowForm(false);
        loadGroups();
      }
    } catch (error) {
      console.error('Error adding group:', error);
      toast.error('Erro ao adicionar grupo');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveGroup = async (groupId: string) => {
    // Soft delete - change status to 'inativo' instead of deleting
    try {
      const { error } = await supabase
        .from('driver_whatsapp_groups')
        .update({ status: 'inativo' })
        .eq('id', groupId)
        .eq('user_id', user?.id);

      if (error) throw error;
      
      toast.success('Grupo removido');
      loadGroups();
    } catch (error) {
      console.error('Error removing group:', error);
      toast.error('Erro ao remover grupo');
    }
  };

  const activeGroupsCount = groups.filter(g => g.status === 'ativo').length;

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Grupos de WhatsApp da sua região</CardTitle>
            <Popover open={infoOpen} onOpenChange={setInfoOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Info className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="start" className="w-80 p-4 z-50">
                <div className="space-y-3">
                  <p className="font-semibold text-foreground">Meta de grupos, comissão e benefícios</p>
                  <p className="text-muted-foreground text-xs">
                    Cadastre grupos ativos da sua região. Quanto mais grupos válidos, menor sua comissão.
                    Grupos ativos também habilitam postagens automáticas informando motoristas disponíveis.
                  </p>
                  <div className="bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg p-3">
                    <p className="font-bold text-green-800 dark:text-green-300 text-xs mb-2">📊 Tabela de Comissão</p>
                    <div className="space-y-1">
                      {COMMISSION_TABLE.map((item) => (
                        <div key={item.groups} className="flex justify-between text-xs">
                          <span className="text-green-700 dark:text-green-400">{item.groups} grupo{item.groups !== '1' && item.groups !== '0' ? 's' : ''} ativo{item.groups !== '1' && item.groups !== '0' ? 's' : ''}</span>
                          <span className="font-bold text-green-800 dark:text-green-200">{item.rate}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg p-3 mt-2">
                    <p className="font-bold text-amber-800 dark:text-amber-300 text-xs mb-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Regra de Participação Obrigatória
                    </p>
                    <p className="text-amber-700 dark:text-amber-400 text-xs">
                      Apenas grupos onde você é participante ativo são válidos. Grupos enviados apenas por link, sem participação real, serão rejeitados.
                    </p>
                  </div>
                  <p className="text-muted-foreground text-xs mt-2">
                    Apenas grupos com status "Ativo" contam para benefícios. Grupos em análise, inativos ou rejeitados não entram no cálculo.
                  </p>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-2">
            {activeGroupsCount > 0 && (
              <Badge variant="default" className="text-xs">
                {activeGroupsCount} ativo{activeGroupsCount > 1 ? 's' : ''}
              </Badge>
            )}
            <Badge className="bg-green-600 hover:bg-green-600 text-white text-xs">
              {getCommissionRate(activeGroupsCount)}% comissão
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Groups List */}
            {groups.length > 0 && (
              <div className="space-y-3">
                {groups.map((group) => {
                  const statusInfo = STATUS_LABELS[group.status] || STATUS_LABELS.em_analise;
                  const canRemove = group.status !== 'inativo';
                  
                  return (
                    <div
                      key={group.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    >
                      <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={statusInfo.variant} className="text-xs flex items-center gap-1">
                            {group.status === 'ativo' && <CheckCircle2 className="h-3 w-3" />}
                            {group.status === 'rejeitado' && <AlertCircle className="h-3 w-3" />}
                            {statusInfo.label}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {group.tipo}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1" title={statusInfo.description}>
                          {statusInfo.description}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {group.cidade}, {group.estado}
                        </p>
                        <a
                          href={group.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Ver grupo
                        </a>
                      </div>
                      {canRemove && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveGroup(group.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Group Form */}
            {showForm ? (
              <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
                <div className="space-y-2">
                  <Label htmlFor="link">Link do grupo *</Label>
                  <Input
                    id="link"
                    placeholder="https://chat.whatsapp.com/..."
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="cidade">Cidade *</Label>
                    <Input
                      id="cidade"
                      placeholder="Ex: São Paulo"
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="estado">Estado *</Label>
                    <Select value={estado} onValueChange={setEstado}>
                      <SelectTrigger id="estado">
                        <SelectValue placeholder="UF" />
                      </SelectTrigger>
                      <SelectContent>
                        {brazilianStates.map((state) => (
                          <SelectItem key={state.value} value={state.value}>
                            {state.value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="tipo">Tipo do grupo</Label>
                  <Select value={tipo} onValueChange={setTipo}>
                    <SelectTrigger id="tipo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GROUP_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Confirmação de participação obrigatória */}
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="confirma-participacao"
                      checked={confirmaParticipacao}
                      onCheckedChange={(checked) => setConfirmaParticipacao(checked === true)}
                      className="mt-0.5"
                    />
                    <div className="space-y-1">
                      <Label 
                        htmlFor="confirma-participacao" 
                        className="text-sm font-medium cursor-pointer text-amber-800 dark:text-amber-200"
                      >
                        Confirmo que sou participante ativo deste grupo *
                      </Label>
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Declaro que participo ativamente deste grupo de WhatsApp. Grupos onde você não é membro não serão validados e não contarão para benefícios.
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    onClick={handleAddGroup}
                    disabled={isSaving}
                    className="flex-1"
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Adicionar grupo
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowForm(false)}
                    disabled={isSaving}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowForm(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar grupo de WhatsApp
              </Button>
            )}

            {groups.length === 0 && !showForm && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum grupo cadastrado. Adicione grupos da sua região para fortalecer a rede local.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
