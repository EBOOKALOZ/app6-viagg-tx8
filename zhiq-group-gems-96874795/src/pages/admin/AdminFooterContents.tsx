import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  Plus,
  Save,
  Trash2,
  Copy,
  Loader2,
  CheckCircle,
  XCircle,
  Link2,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useFooterContents,
  FooterContent,
  PROFILE_TYPES,
  CONTENT_TYPES,
  ProfileType,
  ContentType,
} from '@/hooks/useFooterContents';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Route map for preview
const CONTENT_ROUTE_MAP: Record<string, string> = {
  about: '/legal/about',
  privacy: '/legal/privacy',
  terms: '/legal/terms',
  lgpd: '/legal/lgpd',
  cancellation: '/legal/cancellation',
  cookies: '/legal/cookies',
  complaints: '/legal/complaints',
};

const STATIC_SUPPORT_LINK = { label: 'Suporte', to: '/support', order: 2 };

export default function AdminFooterContents() {
  const { contents, loading, saving, saveContent, createNewVersion, deleteContent, fetchContents } = useFooterContents();
  const { toast } = useToast();
  const [savingOrder, setSavingOrder] = useState(false);
  const [previewContent, setPreviewContent] = useState<FooterContent | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Filter states
  const [filterProfile, setFilterProfile] = useState<string>('all');
  const [filterContentType, setFilterContentType] = useState<string>('all');

  // Editor states
  const [selectedContent, setSelectedContent] = useState<FooterContent | null>(null);
  const [isNewContent, setIsNewContent] = useState(false);

  // Form states
  const [formProfileType, setFormProfileType] = useState<ProfileType>('global');
  const [formContentType, setFormContentType] = useState<ContentType>('about');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formDisplayOrder, setFormDisplayOrder] = useState(99);

  // Filtered contents
  const filteredContents = useMemo(() => {
    return contents.filter(c => {
      if (filterProfile !== 'all' && c.profile_type !== filterProfile) return false;
      if (filterContentType !== 'all' && c.content_type !== filterContentType) return false;
      return true;
    });
  }, [contents, filterProfile, filterContentType]);

  // Active global links for footer preview + management
  const activeGlobalLinks = useMemo(() => {
    const seen = new Map<string, FooterContent>();
    contents.forEach(c => {
      if (!c.is_active) return;
      if (!CONTENT_ROUTE_MAP[c.content_type]) return;
      if (!seen.has(c.content_type) || (seen.get(c.content_type)!.profile_type === 'global' && c.profile_type !== 'global')) {
        seen.set(c.content_type, c);
      }
    });
    return Array.from(seen.values()).sort((a, b) => (a.display_order ?? 99) - (b.display_order ?? 99));
  }, [contents]);

  // Active motoboy links: motoboy-specific overrides global
  const activeMotoboyLinks = useMemo(() => {
    const seen = new Map<string, FooterContent>();
    contents.forEach(c => {
      if (!c.is_active) return;
      if (!CONTENT_ROUTE_MAP[c.content_type]) return;
      if (c.profile_type !== 'motoboy' && c.profile_type !== 'global') return;
      const existing = seen.get(c.content_type);
      if (!existing || (existing.profile_type === 'global' && c.profile_type === 'motoboy')) {
        seen.set(c.content_type, c);
      }
    });
    return Array.from(seen.values()).sort((a, b) => (a.display_order ?? 99) - (b.display_order ?? 99));
  }, [contents]);

  // All unique content_types that have at least one entry
  const allLinkRows = useMemo(() => {
    // Deduplicate by content_type, pick active/highest priority
    const map = new Map<string, FooterContent>();
    contents.forEach(c => {
      if (!CONTENT_ROUTE_MAP[c.content_type]) return;
      const existing = map.get(c.content_type);
      if (!existing) { map.set(c.content_type, c); return; }
      // Prefer active over inactive
      if (!existing.is_active && c.is_active) { map.set(c.content_type, c); return; }
      // Prefer global
      if (existing.profile_type !== 'global' && c.profile_type === 'global') { map.set(c.content_type, c); }
    });
    return Array.from(map.values()).sort((a, b) => (a.display_order ?? 99) - (b.display_order ?? 99));
  }, [contents]);

  const resetForm = () => {
    setSelectedContent(null);
    setIsNewContent(false);
    setFormProfileType('global');
    setFormContentType('about');
    setFormTitle('');
    setFormContent('');
    setFormIsActive(true);
    setFormDisplayOrder(99);
  };

  const handleNewContent = () => {
    resetForm();
    setIsNewContent(true);
  };

  const handleSelectContent = (content: FooterContent) => {
    setSelectedContent(content);
    setIsNewContent(false);
    setFormProfileType(content.profile_type as ProfileType);
    setFormContentType(content.content_type as ContentType);
    setFormTitle(content.title);
    setFormContent(content.content);
    setFormIsActive(content.is_active);
    setFormDisplayOrder(content.display_order ?? 99);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    await saveContent({
      id: isNewContent ? undefined : selectedContent?.id,
      profile_type: formProfileType,
      content_type: formContentType,
      title: formTitle,
      content: formContent,
      is_active: formIsActive,
      display_order: formDisplayOrder,
    });
    if (isNewContent) resetForm();
  };

  const handleNewVersion = async () => {
    if (!selectedContent) return;
    const newVersion = await createNewVersion({ ...selectedContent, title: formTitle, content: formContent });
    if (newVersion) handleSelectContent(newVersion);
  };

  const handleDelete = async () => {
    if (!selectedContent) return;
    await deleteContent(selectedContent.id);
    resetForm();
  };

  // Toggle active status for a row in the links manager
  const handleToggleActive = async (item: FooterContent) => {
    setSavingOrder(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('footer_contents')
        .update({ is_active: !item.is_active, updated_at: now })
        .eq('id', item.id);
      if (error) throw error;
      toast({ title: item.is_active ? 'Link desativado' : 'Link ativado' });
      await fetchContents();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSavingOrder(false);
    }
  };

  // Move order up/down
  const handleMoveOrder = async (item: FooterContent, direction: 'up' | 'down') => {
    const currentOrder = item.display_order ?? 99;
    const newOrder = direction === 'up' ? currentOrder - 1 : currentOrder + 1;
    setSavingOrder(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('footer_contents')
        .update({ display_order: newOrder, updated_at: now })
        .eq('id', item.id);
      if (error) throw error;
      await fetchContents();
    } catch (e: any) {
      toast({ title: 'Erro ao reordenar', description: e.message, variant: 'destructive' });
    } finally {
      setSavingOrder(false);
    }
  };

  const getProfileLabel = (value: string) => PROFILE_TYPES.find(p => p.value === value)?.label || value;
  const getContentTypeLabel = (value: string) => CONTENT_TYPES.find(c => c.value === value)?.label || value;

  // Open preview modal for a content_type
  const handlePreviewLink = (contentType: string, profileScope: 'global' | 'motoboy' = 'global') => {
    // Find the best matching content
    const match = contents.find(c => 
      c.content_type === contentType && 
      c.is_active && 
      (c.profile_type === profileScope || c.profile_type === 'global')
    ) || contents.find(c => c.content_type === contentType && c.is_active);
    
    if (match) {
      setPreviewContent(match);
      setPreviewOpen(true);
    } else {
      toast({ title: 'Sem conteúdo', description: `Nenhum conteúdo ativo encontrado para "${getContentTypeLabel(contentType)}"` });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileText className="h-6 w-6" />
          Rodapé Institucional
        </h1>
        <p className="text-muted-foreground">
          Gerencie os links e textos institucionais exibidos no rodapé público
        </p>
      </div>

      <Tabs defaultValue="links">
        <TabsList className="mb-4">
          <TabsTrigger value="links" className="flex items-center gap-1.5">
            <Link2 className="h-4 w-4" />
            Gestão de Links
          </TabsTrigger>
          <TabsTrigger value="contents" className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            Conteúdos
          </TabsTrigger>
        </TabsList>

        {/* ======================== TAB: LINKS MANAGER ======================== */}
        <TabsContent value="links" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Link list with controls */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Links Ativos no Rodapé
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : allLinkRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhum link configurado</p>
                ) : (
                  <div className="space-y-2">
                    {allLinkRows.map((item, idx) => (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          item.is_active ? 'border-border bg-card' : 'border-dashed border-muted-foreground/30 bg-muted/20 opacity-60'
                        }`}
                      >
                        {/* Order badge */}
                        <span className="w-6 h-6 flex items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground shrink-0">
                          {item.display_order ?? 99}
                        </span>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{getContentTypeLabel(item.content_type)}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {CONTENT_ROUTE_MAP[item.content_type]} • {getProfileLabel(item.profile_type)}
                          </p>
                        </div>

                        {/* Status icon */}
                        {item.is_active ? (
                          <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}

                        {/* Controls */}
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={savingOrder || idx === 0}
                            onClick={() => handleMoveOrder(item, 'up')}
                            title="Mover para cima"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={savingOrder || idx === allLinkRows.length - 1}
                            onClick={() => handleMoveOrder(item, 'down')}
                            title="Mover para baixo"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={savingOrder}
                            onClick={() => handleToggleActive(item)}
                            title={item.is_active ? 'Desativar link' : 'Ativar link'}
                          >
                            {item.is_active ? (
                              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <Eye className="h-3.5 w-3.5 text-primary" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Right: Footer previews */}
            <div className="space-y-6">
              {/* Institutional footer preview */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Rodapé Institucional (Público)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-black rounded-lg p-5 space-y-3">
                    <nav className="flex flex-wrap justify-center gap-x-3 gap-y-2 text-[13px] font-medium">
                      {[
                        ...activeGlobalLinks.filter(l => (l.display_order ?? 99) < 2),
                        null,
                        ...activeGlobalLinks.filter(l => (l.display_order ?? 99) >= 2),
                      ].map((item, idx) => {
                        if (item === null) {
                          return (
                            <span key="support" className="flex items-center gap-3">
                              <span className="text-white hover:text-white/80 transition-colors">Suporte</span>
                              <span className="text-white/40">•</span>
                            </span>
                          );
                        }
                        return (
                          <span key={item.id} className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handlePreviewLink(item.content_type, 'global'); }}
                              className="text-white hover:text-white/80 hover:underline transition-colors cursor-pointer"
                            >
                              {getContentTypeLabel(item.content_type)}
                            </button>
                            {idx < activeGlobalLinks.length && (
                              <span className="text-white/40">•</span>
                            )}
                          </span>
                        );
                      })}
                    </nav>
                    <div className="flex flex-col items-center gap-0">
                      <p className="text-center text-xs tracking-wide text-white/70">
                        © 2026 Viagg-TX8 • Plataforma de Mobilidade
                      </p>
                      <p className="text-[11px] text-white/50">Ativar CNPJ</p>
                    </div>
                    <p className="text-center text-[10px] tracking-wider text-white/50">
                      Versão 1.0.0 • Última atualização: hoje
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-3 text-center">
                    * Prévia aproximada. Suporte é um link estático fixo na posição 2.
                  </p>
                </CardContent>
              </Card>

              {/* Motoboy footer preview */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    Rodapé Motoboy
                    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30 text-[10px]">Laranja</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-orange-500 rounded-lg p-5 space-y-3">
                    <nav className="flex flex-wrap justify-center gap-x-3 gap-y-2 text-[13px] font-medium">
                      {[
                        ...activeMotoboyLinks.filter(l => (l.display_order ?? 99) < 2),
                        null,
                        ...activeMotoboyLinks.filter(l => (l.display_order ?? 99) >= 2),
                      ].map((item, idx) => {
                        if (item === null) {
                          return (
                            <span key="support-motoboy" className="flex items-center gap-3">
                              <span className="text-white hover:text-white/80 transition-colors">Suporte</span>
                              <span className="text-white/40">•</span>
                            </span>
                          );
                        }
                        return (
                          <span key={`mb-${item.id}`} className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handlePreviewLink(item.content_type, 'motoboy'); }}
                              className="text-white hover:text-white/80 hover:underline transition-colors cursor-pointer"
                            >
                              {getContentTypeLabel(item.content_type)}
                            </button>
                            {idx < activeMotoboyLinks.length && (
                              <span className="text-white/40">•</span>
                            )}
                          </span>
                        );
                      })}
                      {/* Static "Grupos" link */}
                      <span className="flex items-center gap-3">
                        <span className="text-white/40">•</span>
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handlePreviewLink('groups', 'motoboy'); }}
                          className="text-white hover:text-white/80 hover:underline transition-colors cursor-pointer"
                        >
                          Grupos
                        </button>
                      </span>
                    </nav>
                    <div className="flex flex-col items-center gap-0">
                      <p className="text-center text-xs tracking-wide text-white/70">
                        © 2026 Viagg-TX8 • Plataforma de Mobilidade
                      </p>
                      <p className="text-[11px] text-white/50">Ativar CNPJ</p>
                    </div>
                    <p className="text-center text-[10px] tracking-wider text-white/50">
                      Versão 1.0.0 • Última atualização: hoje
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-3 text-center">
                    * Prévia do rodapé Motoboy. Inclui links globais + motoboy + "Grupos" (fixo).
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ======================== TAB: CONTENT EDITOR ======================== */}
        <TabsContent value="contents">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column - List */}
            <div className="lg:col-span-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Filtros</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Perfil</Label>
                    <Select value={filterProfile} onValueChange={setFilterProfile}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos os perfis" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os perfis</SelectItem>
                        {PROFILE_TYPES.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tipo de Conteúdo</Label>
                    <Select value={filterContentType} onValueChange={setFilterContentType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos os tipos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os tipos</SelectItem>
                        {CONTENT_TYPES.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleNewContent} className="w-full" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Novo Conteúdo
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    Conteúdos ({filteredContents.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredContents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      Nenhum conteúdo encontrado
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-1 p-2">
                        {filteredContents.map((content) => {
                          const isDeletable = !!content.created_by;
                          return (
                            <div
                              key={content.id}
                              className={`flex items-center gap-1 p-3 rounded-lg border transition-colors ${
                                selectedContent?.id === content.id
                                  ? 'border-primary bg-primary/5'
                                  : 'border-transparent hover:bg-muted/50'
                              }`}
                            >
                              <button
                                onClick={() => handleSelectContent(content)}
                                className="flex-1 text-left min-w-0"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate">{content.title}</p>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                        {getProfileLabel(content.profile_type)}
                                      </Badge>
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                        {getContentTypeLabel(content.content_type)}
                                      </Badge>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-1">
                                    {content.is_active ? (
                                      <CheckCircle className="h-4 w-4 text-primary" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    <span className="text-[10px] text-muted-foreground">v{content.version}</span>
                                  </div>
                                </div>
                              </button>
                              {isDeletable && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                                      onClick={(e) => e.stopPropagation()}
                                      title="Excluir conteúdo"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Excluir "{content.title}"?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Esta ação não pode ser desfeita. O conteúdo será removido permanentemente.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={async () => {
                                        await deleteContent(content.id);
                                        if (selectedContent?.id === content.id) resetForm();
                                      }}>
                                        Excluir
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Editor */}
            <div className="lg:col-span-8">
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    {isNewContent ? 'Novo Conteúdo' : selectedContent ? `Editando: ${selectedContent.title}` : 'Editor'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!isNewContent && !selectedContent ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium text-foreground mb-2">Nenhum conteúdo selecionado</h3>
                      <p className="text-sm text-muted-foreground mb-4">Selecione um conteúdo da lista ou crie um novo</p>
                      <Button onClick={handleNewContent} size="sm">
                        <Plus className="h-4 w-4 mr-1" />
                        Novo Conteúdo
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>Perfil</Label>
                          <Select value={formProfileType} onValueChange={(v) => setFormProfileType(v as ProfileType)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PROFILE_TYPES.map(p => (
                                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Tipo de Conteúdo</Label>
                          <Select value={formContentType} onValueChange={(v) => setFormContentType(v as ContentType)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CONTENT_TYPES.map(c => (
                                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label>Título</Label>
                        <Input
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          placeholder="Ex: Termos de Uso do Aplicativo"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>Conteúdo</Label>
                        <Textarea
                          value={formContent}
                          onChange={(e) => setFormContent(e.target.value)}
                          placeholder="Digite o conteúdo aqui..."
                          className="min-h-[250px] resize-y"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2 py-2">
                          <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
                          <Label className="cursor-pointer">
                            {formIsActive ? (
                              <span className="text-primary font-medium">Ativo</span>
                            ) : (
                              <span className="text-muted-foreground">Inativo</span>
                            )}
                          </Label>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Ordem no Rodapé</Label>
                          <Input
                            type="number"
                            min={1}
                            max={99}
                            value={formDisplayOrder}
                            onChange={(e) => setFormDisplayOrder(Number(e.target.value))}
                            className="w-full"
                          />
                        </div>
                      </div>

                      {selectedContent && !isNewContent && (
                        <p className="text-xs text-muted-foreground">
                          Versão {selectedContent.version} • Atualizado em{' '}
                          {new Date(selectedContent.updated_at || selectedContent.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      )}

                      <Separator />

                      <div className="flex flex-wrap gap-2">
                        <Button onClick={handleSave} disabled={saving || !formTitle.trim() || !formContent.trim()}>
                          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                          Salvar
                        </Button>

                        {selectedContent && !isNewContent && (
                          <>
                            <Button variant="secondary" onClick={handleNewVersion} disabled={saving}>
                              <Copy className="h-4 w-4 mr-1" />
                              Nova Versão
                            </Button>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={saving}>
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Excluir
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir conteúdo?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta ação não pode ser desfeita. O conteúdo será removido permanentemente.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}

                        {(isNewContent || selectedContent) && (
                          <Button variant="ghost" onClick={resetForm}>Cancelar</Button>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Preview — {previewContent?.title || ''}
            </DialogTitle>
          </DialogHeader>
          {previewContent && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Badge variant="secondary">{getProfileLabel(previewContent.profile_type)}</Badge>
                <Badge variant="outline">{getContentTypeLabel(previewContent.content_type)}</Badge>
                <Badge variant="outline" className="text-[10px]">v{previewContent.version}</Badge>
              </div>
              <Separator />
              <div className="whitespace-pre-wrap leading-relaxed text-sm text-foreground min-h-[200px] p-4 rounded-lg bg-muted/50 border">
                {previewContent.content}
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                * Esta é uma prévia do conteúdo. No app, o layout pode variar conforme o perfil.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
