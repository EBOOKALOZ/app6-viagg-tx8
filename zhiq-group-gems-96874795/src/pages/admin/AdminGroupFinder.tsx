import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GroupColorPicker, isDarkColor } from "@/components/admin/GroupColorPicker";
import { useAdminPanelColors } from "@/contexts/AdminPanelColorsContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  Users,
  ExternalLink,
  Calendar,
  Filter,
  RefreshCw,
  CheckCircle2,
  Clock,
  Ban,
  Bike,
  Palette
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { deriveVisualStatus, visualStatusToDbFields, type VisualGroupStatus } from "@/lib/groupStatusUtils";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Types - unified whatsapp_groups
interface GroupData {
  id: string;
  owner_user_id: string;
  user_name: string | null;
  user_email: string | null;
  group_link: string;
  group_name: string;
  city_name: string;
  neighborhood: string;
  /** Derived visual status from validation_status + is_active */
  status: VisualGroupStatus;
  created_at: string;
  // Real DB fields kept for reference
  validation_status: string;
  is_active: boolean;
  is_valid: boolean;
  valid_for_commission: boolean;
  members_count: number;
}

const STATUS_CONFIG: Record<VisualGroupStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
  em_analise: { label: "Em Análise", variant: "secondary", icon: Clock },
  ativo: { label: "Ativo", variant: "default", icon: CheckCircle2 },
  bloqueado: { label: "Rejeitado", variant: "destructive", icon: Ban },
  inativo: { label: "Inativo", variant: "outline", icon: Ban },
  expirado: { label: "Expirado", variant: "outline", icon: Ban },
};

export default function AdminGroupFinder() {
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Sorting
  const [sortBy, setSortBy] = useState<"created_at" | "status">("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Status change dialog
  const [selectedGroup, setSelectedGroup] = useState<GroupData | null>(null);
  const [newStatus, setNewStatus] = useState<VisualGroupStatus>("em_analise");

  const [isUpdating, setIsUpdating] = useState(false);

  // Color customization (global context)
  const { cardColor, canvasColor, setCardColor: handleCardColor, setCanvasColor: handleCanvasColor } = useAdminPanelColors();
  const darkCard = isDarkColor(cardColor);
  const darkCanvas = isDarkColor(canvasColor);
  const cardTextColor = darkCard ? "#fff" : undefined;
  const canvasTextColor = darkCanvas ? "#fff" : undefined;

  // Fetch all groups from whatsapp_groups
  const fetchGroups = async () => {
    setIsLoading(true);
    try {
      // Debug: log session
      const sessionResult = await supabase.auth.getSession();
      console.log('[AdminGroupFinder] session:', sessionResult.data.session?.user?.id ?? 'NO SESSION');

      const { data: rawGroups, error } = await (supabase
        .from('whatsapp_groups') as any)
        .select('id, owner_user_id, group_link, group_name, city_name, neighborhood, members_count, validation_status, is_active, is_valid, valid_for_commission, created_at')
        .order('created_at', { ascending: false });

      console.log('[AdminGroupFinder] query result:', { count: rawGroups?.length, error, first: rawGroups?.[0] });

      if (error) throw error;

      // Get all unique user IDs (from created_by or user_id)
      const allUserIds = (rawGroups || [])
        .map((g: any) => g.owner_user_id)
        .filter((id: string, index: number, self: string[]) => id && self.indexOf(id) === index);

      // Fetch user profiles
      const profileMap = new Map<string, { name: string | null; email: string | null }>();
      if (allUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', allUserIds);
        profiles?.forEach((p) => profileMap.set(p.id, p));
      }

      // Format groups
      const formattedGroups: GroupData[] = (rawGroups || []).map((g: any) => {
        const ownerId = g.owner_user_id;
        const profile = profileMap.get(ownerId);
        return {
          id: g.id,
          owner_user_id: g.owner_user_id,
          user_name: profile?.name || null,
          user_email: profile?.email || null,
          group_link: g.group_link || '',
          group_name: g.group_name || '',
          city_name: g.city_name || '',
          neighborhood: g.neighborhood || '',
          status: deriveVisualStatus(g),
          created_at: g.created_at,
          validation_status: g.validation_status || 'pending',
          is_active: g.is_active ?? false,
          is_valid: g.is_valid ?? false,
          valid_for_commission: g.valid_for_commission ?? false,
          members_count: g.members_count || 0,
        };
      });

      setGroups(formattedGroups);
    } catch (error: any) {
      console.error('Error fetching groups:', error);
      toast.error(`Erro ao carregar grupos: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  // Realtime: auto-refresh on whatsapp_groups changes
  useEffect(() => {
    const channel = supabase
      .channel('admin-groups-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_groups' },
        (payload) => {
          console.log('[AdminGroupFinder] Realtime update:', payload);
          fetchGroups();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filter and sort groups

  // Filter and sort groups
  const filteredGroups = useMemo(() => {
    let result = [...groups];

    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(g =>
        g.user_name?.toLowerCase().includes(searchLower) ||
        g.user_email?.toLowerCase().includes(searchLower) ||
        g.group_link.toLowerCase().includes(searchLower) ||
        g.city_name.toLowerCase().includes(searchLower)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter(g => g.status === statusFilter);
    }
    result.sort((a, b) => {
      if (sortBy === "created_at") {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
      } else {
        const statusOrder: Record<string, number> = { em_analise: 0, ativo: 1, bloqueado: 2, reprovado: 3 };
        const orderA = statusOrder[a.status] ?? 3;
        const orderB = statusOrder[b.status] ?? 3;
        return sortOrder === "asc" ? orderA - orderB : orderB - orderA;
      }
    });

    return result;
  }, [groups, search, statusFilter, sortBy, sortOrder]);

  // Stats
  const stats = useMemo(() => {
    const total = groups.length;
    const motoboys = groups.length; // All from whatsapp_groups = motoboys
    const ativos = groups.filter(g => g.status === 'ativo').length;
    const emAnalise = groups.filter(g => g.status === 'em_analise').length;
    const bloqueados = groups.filter(g => g.status === 'bloqueado').length;
    const inativos = groups.filter(g => g.status === 'inativo' || g.status === 'expirado').length;

    return { total, motoboys, ativos, emAnalise, bloqueados, inativos };
  }, [groups]);

  // Handle status change - update whatsapp_groups directly
  const handleStatusChange = async () => {
    if (!selectedGroup) return;

    setIsUpdating(true);
    try {
      const dbFields = visualStatusToDbFields(newStatus);
      console.log("STATUS change:", { visual: newStatus, dbFields, groupId: selectedGroup.id });

      // 1. Update ALL real DB columns (including is_valid and valid_for_commission)
      const updatePayload: any = {
        validation_status: dbFields.validation_status,
        is_active: dbFields.is_active,
        is_valid: dbFields.is_valid,
        valid_for_commission: dbFields.valid_for_commission,
      };
      // When approving, set last_posted_at so the group counts immediately
      if (newStatus === 'ativo') {
        updatePayload.last_posted_at = new Date().toISOString();
      }

      const { error } = await (supabase
        .from('whatsapp_groups') as any)
        .update(updatePayload)
        .eq('id', selectedGroup.id);

      if (error) throw error;

      // 2. Recalculate is_valid and valid_for_commission via RPC
      try {
        await supabase.rpc('refresh_whatsapp_group_validity' as any, {
          p_group_id: selectedGroup.id,
        });
      } catch (rpcErr) {
        console.warn('RPC refresh_whatsapp_group_validity failed (may not exist yet):', rpcErr);
      }

      toast.success('Status atualizado com sucesso');
      setSelectedGroup(null);
      fetchGroups();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error(`Erro ao atualizar status: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
  };

  const hasActiveFilters = search || statusFilter !== "all";

  return (
    <div className="min-h-screen -m-6 -mt-6 p-6" style={{ backgroundColor: canvasColor, color: canvasTextColor, marginLeft: '-1.5rem', marginRight: '-1.5rem', marginBottom: '-1.5rem', paddingBottom: '2rem', width: 'calc(100% + 3rem)' }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: canvasTextColor }}>Buscador de Grupos</h1>
        <p style={{ color: canvasTextColor ? 'rgba(255,255,255,0.7)' : undefined }} className={canvasTextColor ? '' : 'text-muted-foreground'}>Grupos de WhatsApp — fonte única: whatsapp_groups</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5 mb-6">
        <Card className="border border-[#E6E8EB] shadow-[0_2px_8px_rgba(0,0,0,0.04)]" style={{ backgroundColor: cardColor, color: cardTextColor }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" style={{ opacity: 0.6 }} />
              <span className="text-sm" style={{ opacity: 0.7 }}>Total</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border border-[#E6E8EB] shadow-[0_2px_8px_rgba(0,0,0,0.04)]" style={{ backgroundColor: cardColor, color: cardTextColor }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Bike className="h-4 w-4" style={{ opacity: 0.6 }} />
              <span className="text-sm" style={{ opacity: 0.7 }}>Motoboys</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.motoboys}</p>
          </CardContent>
        </Card>
        <Card className="border border-[#E6E8EB] shadow-[0_2px_8px_rgba(0,0,0,0.04)]" style={{ backgroundColor: cardColor, color: cardTextColor }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" style={{ opacity: 0.6 }} />
              <span className="text-sm" style={{ opacity: 0.7 }}>Em Análise</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.emAnalise}</p>
          </CardContent>
        </Card>
        <Card className="border border-[#E6E8EB] shadow-[0_2px_8px_rgba(0,0,0,0.04)]" style={{ backgroundColor: cardColor, color: cardTextColor }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" style={{ opacity: 0.6 }} />
              <span className="text-sm" style={{ opacity: 0.7 }}>Ativos</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.ativos}</p>
          </CardContent>
        </Card>
        <Card className="border border-[#E6E8EB] shadow-[0_2px_8px_rgba(0,0,0,0.04)]" style={{ backgroundColor: cardColor, color: cardTextColor }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Ban className="h-4 w-4" style={{ opacity: 0.6 }} />
              <span className="text-sm" style={{ opacity: 0.7 }}>Bloqueados</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.bloqueados}</p>
          </CardContent>
        </Card>
      </div>

      {/* Color Picker */}
      <Card className="mb-6 border border-[#E6E8EB] shadow-[0_2px_8px_rgba(0,0,0,0.04)]" style={{ backgroundColor: cardColor, color: cardTextColor }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Cores do Painel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-8">
            <GroupColorPicker label="Cor do Fundo" value={canvasColor} onChange={handleCanvasColor} variant="canvas" />
            <GroupColorPicker label="Cor dos Cards" value={cardColor} onChange={handleCardColor} variant="card" />
          </div>
          <p className="text-xs mt-3" style={{ opacity: 0.6 }}>As cores são aplicadas globalmente em todas as páginas do Admin.</p>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="mb-6 border border-[#E6E8EB] shadow-[0_2px_8px_rgba(0,0,0,0.04)]" style={{ backgroundColor: cardColor, color: cardTextColor }}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filtros
            </CardTitle>
            <div className="flex gap-2">
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={fetchGroups} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Search */}
            <div className="lg:col-span-2">
              <Label htmlFor="search" className="sr-only">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Buscar por usuário ou link..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <Label htmlFor="status-filter" className="sr-only">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="em_analise">Em Análise</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="bloqueado">Rejeitado</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="expirado">Expirado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sorting */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t">
            <span className="text-sm text-muted-foreground">Ordenar por:</span>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">Data de cadastro</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as typeof sortOrder)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Mais recente</SelectItem>
                <SelectItem value="asc">Mais antigo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Groups Table */}
      <Card className="border border-[#E6E8EB] shadow-[0_2px_8px_rgba(0,0,0,0.04)]" style={{ backgroundColor: cardColor, color: cardTextColor }}>
        <CardHeader>
          <CardTitle className="text-base">
            Grupos Encontrados ({filteredGroups.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum grupo encontrado</p>
              {hasActiveFilters && (
                <Button variant="link" onClick={clearFilters} className="mt-2">
                  Limpar filtros
                </Button>
              )}
            </div>
          ) : (
            <div className="max-h-[420px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Criado por</TableHead>
                    <TableHead>Link</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.map((group) => {
                    const statusConfig = STATUS_CONFIG[group.status] || STATUS_CONFIG.em_analise;
                    const StatusIcon = statusConfig.icon;

                    return (
                      <TableRow key={group.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{group.user_name || 'Sem nome'}</p>
                            <p className="text-xs text-muted-foreground">{group.user_email || 'Sem email'}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={group.group_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-primary hover:underline max-w-[200px] truncate"
                              >
                                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{group.group_link}</span>
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{group.group_link}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{group.city_name || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{group.neighborhood || 'Geral'}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">
                              {format(new Date(group.created_at), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusConfig.variant}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedGroup(group);
                              setNewStatus(group.status);
                            }}
                          >
                            Alterar Status
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Change Dialog */}
      <Dialog open={!!selectedGroup} onOpenChange={(open) => !open && setSelectedGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Status do Grupo</DialogTitle>
            <DialogDescription>
              Altere o status do grupo adicionado por{" "}
              <strong>{selectedGroup?.user_name || 'Usuário'}</strong>
            </DialogDescription>
          </DialogHeader>

          {selectedGroup && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-2">
                <span className="text-sm text-muted-foreground">
                  {selectedGroup.city_name}
                </span>
                <a
                  href={selectedGroup.group_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline text-sm"
                >
                  <ExternalLink className="h-3 w-3" />
                  Abrir grupo
                </a>
              </div>

              <div className="space-y-2">
                <Label>Novo Status</Label>
                <Select value={newStatus} onValueChange={(v) => setNewStatus(v as VisualGroupStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="em_analise">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Em Análise
                      </div>
                    </SelectItem>
                    <SelectItem value="ativo">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Ativo
                      </div>
                    </SelectItem>
                    <SelectItem value="bloqueado">
                      <div className="flex items-center gap-2">
                        <Ban className="h-4 w-4" />
                        Rejeitado
                      </div>
                    </SelectItem>
                    <SelectItem value="inativo">
                      <div className="flex items-center gap-2">
                        <Ban className="h-4 w-4" />
                        Inativo
                      </div>
                    </SelectItem>
                    <SelectItem value="expirado">
                      <div className="flex items-center gap-2">
                        <Ban className="h-4 w-4" />
                        Expirado
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedGroup(null)}>
              Cancelar
            </Button>
            <Button onClick={handleStatusChange} disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
