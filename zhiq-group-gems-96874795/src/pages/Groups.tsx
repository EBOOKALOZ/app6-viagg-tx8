import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getProfileGroups, addProfileGroup } from '@/lib/api';

import { toast } from 'sonner';
import { Plus, MessageSquare, Link as LinkIcon, ExternalLink, CheckCircle, Clock, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ProfileGroup {
  id: string;
  user_id: string;
  link: string;
  cidade: string;
  estado: string;
  tipo: string;
  status: string;
  created_at: string;
  updated_at: string;
}

const statusConfig: Record<string, { label: string; icon: React.ReactNode; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ativo: { label: 'Ativo', icon: <CheckCircle className="h-3 w-3" />, variant: 'default' },
  aprovado: { label: 'Ativo', icon: <CheckCircle className="h-3 w-3" />, variant: 'default' },
  em_analise: { label: 'Em Análise', icon: <Clock className="h-3 w-3" />, variant: 'secondary' },
  pending_review: { label: 'Em Análise', icon: <Clock className="h-3 w-3" />, variant: 'secondary' },
  rejeitado: { label: 'Rejeitado', icon: <XCircle className="h-3 w-3" />, variant: 'destructive' },
  inativo: { label: 'Inativo', icon: <XCircle className="h-3 w-3" />, variant: 'outline' },
};

const profileLabels: Record<string, string> = {
  driver: 'Motorista',
  motoboy: 'Motoboy',
  merchant: 'Lojista',
  passenger: 'Passageiro',
};

export default function Groups() {
  const { user, activeProfile } = useAuth();
  const [groups, setGroups] = useState<ProfileGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newGroupLink, setNewGroupLink] = useState('');
  const [newGroupCidade, setNewGroupCidade] = useState('');
  const [newGroupTipo, setNewGroupTipo] = useState('Geral');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkDuplicateError, setLinkDuplicateError] = useState<string | null>(null);

  const activeGroupCount = groups.filter(g => ['ativo', 'aprovado'].includes(g.status)).length;
  const pendingGroupCount = groups.filter(g => ['em_analise', 'pending_review'].includes(g.status)).length;

  const fetchGroups = async () => {
    if (!user || !activeProfile) return;
    
    // Only fetch for driver, motoboy, merchant profiles
    if (!['driver', 'motoboy', 'merchant'].includes(activeProfile)) {
      setGroups([]);
      setIsLoading(false);
      return;
    }

    const { data, error } = await getProfileGroups(user.id, activeProfile);
    if (error) {
      console.error('Error fetching groups:', error);
      toast.error('Erro ao carregar grupos');
    }
    setGroups((data as ProfileGroup[]) || []);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchGroups();
  }, [user, activeProfile]);

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeProfile || !newGroupLink.trim() || !newGroupCidade) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (!['driver', 'motoboy', 'merchant'].includes(activeProfile)) {
      toast.error('Perfil não suporta grupos');
      return;
    }

    setIsSubmitting(true);
    const { error } = await addProfileGroup(user.id, activeProfile, {
      link: newGroupLink.trim(),
      cidade: newGroupCidade,
      tipo: newGroupTipo,
    });

    if (error) {
      const pgCode = (error as any)?.code;
      if (pgCode === '23505') {
        setLinkDuplicateError('Link já utilizado. Cada grupo do WhatsApp pode ser cadastrado apenas uma vez na plataforma.');
      } else {
        toast.error('Erro ao adicionar grupo');
      }
    } else {
      toast.success('Grupo enviado para análise!');
      setNewGroupLink('');
      setNewGroupCidade('');
      setNewGroupTipo('Geral');
      setIsAddDialogOpen(false);
      fetchGroups();
    }
    setIsSubmitting(false);
  };

  // Check if profile supports groups
  const supportsGroups = activeProfile && ['driver', 'motoboy', 'merchant'].includes(activeProfile);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  if (!supportsGroups) {
    return (
      <Layout>
        <div className="space-y-6 animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Grupos WhatsApp</h1>
            <p className="text-muted-foreground">
              Perfil {profileLabels[activeProfile || ''] || activeProfile} não suporta grupos
            </p>
          </div>
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Funcionalidade não disponível</h3>
              <p className="text-muted-foreground text-center">
                Grupos WhatsApp estão disponíveis para perfis de Motorista, Motoboy e Lojista.
              </p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Grupos WhatsApp</h1>
            <p className="text-muted-foreground">
              Perfil: {profileLabels[activeProfile] || activeProfile} — Gerencie seus grupos para reduzir sua taxa
            </p>
          </div>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Grupo WhatsApp</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddGroup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="groupLink">Link do Grupo *</Label>
                  <Input
                    id="groupLink"
                    placeholder="https://chat.whatsapp.com/..."
                    value={newGroupLink}
                    onChange={(e) => {
                      setNewGroupLink(e.target.value);
                      if (linkDuplicateError) setLinkDuplicateError(null);
                    }}
                    required
                    className={linkDuplicateError ? 'border-yellow-500' : ''}
                  />
                  {linkDuplicateError && (
                    <p className="text-sm text-yellow-800 bg-yellow-100 border border-yellow-300 rounded-md px-3 py-2 mt-1">
                      ⚠️ {linkDuplicateError}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cidade">Cidade *</Label>
                  <Input
                    id="cidade"
                    placeholder="Digite o nome da cidade"
                    value={newGroupCidade}
                    onChange={(e) => setNewGroupCidade(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tipo">Tipo do Grupo</Label>
                  <Select value={newGroupTipo} onValueChange={setNewGroupTipo}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Geral">Geral</SelectItem>
                      <SelectItem value="Entregas">Entregas</SelectItem>
                      <SelectItem value="Corridas">Corridas</SelectItem>
                      <SelectItem value="Promoções">Promoções</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Enviando...' : 'Enviar para Análise'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/20 p-3">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total de Grupos</p>
                  <p className="text-2xl font-bold">{groups.length}</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{activeGroupCount}</p>
                  <p className="text-xs text-muted-foreground">Ativos</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-600">{pendingGroupCount}</p>
                  <p className="text-xs text-muted-foreground">Em Análise</p>
                </div>
              </div>
              {activeGroupCount < 3 && (
                <p className="text-sm text-muted-foreground">
                  Adicione mais {3 - activeGroupCount} ativos para taxa mínima
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Groups List */}
        {groups.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum grupo cadastrado</h3>
              <p className="text-muted-foreground text-center mb-4">
                Adicione grupos WhatsApp para reduzir sua taxa de serviço
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Primeiro Grupo
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {groups.map((group) => {
              const status = statusConfig[group.status] || statusConfig.em_analise;
              return (
                <Card key={group.id} className="group hover:border-primary/50 transition-colors">
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-4">
                      <div className="rounded-full bg-primary/20 p-2">
                        <MessageSquare className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{group.cidade}</h3>
                          <Badge variant={status.variant} className="flex items-center gap-1">
                            {status.icon}
                            {status.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">Tipo: {group.tipo}</p>
                        {group.link && (
                          <a
                            href={group.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                          >
                            <LinkIcon className="h-3 w-3" />
                            Abrir link
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Adicionado em {new Date(group.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
