import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { 
  Send, Clock, CheckCircle2, XCircle, Image, MessageSquare, 
  Loader2, Car, Bike, ExternalLink, Lock, Calendar, Timer,
  Users, Database
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  getGroupsWithPostingInfo, 
  getActiveMedia, 
  getActiveMessages, 
  recordPosting,
  GroupWithPostingInfo,
} from "@/lib/postingApi";

export function PostingControl() {
  const queryClient = useQueryClient();
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [profileFilter, setProfileFilter] = useState<'all' | 'driver' | 'motoboy'>('all');

  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ["groups-posting-info"],
    queryFn: getGroupsWithPostingInfo,
  });

  const { data: mediaItems, isLoading: mediaLoading } = useQuery({
    queryKey: ["active-media"],
    queryFn: getActiveMedia,
  });

  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ["active-messages"],
    queryFn: getActiveMessages,
  });

  // Filter groups by profile type
  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (profileFilter === 'all') return groups;
    return groups.filter(g => g.group_type === profileFilter);
  }, [groups, profileFilter]);

  const availableGroups = filteredGroups.filter((g) => g.can_post);
  const blockedGroups = filteredGroups.filter((g) => !g.can_post);

  // Stats
  const driverGroups = groups?.filter(g => g.group_type === 'driver') || [];
  const motoboyGroups = groups?.filter(g => g.group_type === 'motoboy') || [];
  const totalAvailable = groups?.filter(g => g.can_post).length || 0;
  const totalBlocked = groups?.filter(g => !g.can_post).length || 0;

  const handleGroupToggle = (groupId: string) => {
    setSelectedGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleSelectAllAvailable = () => {
    if (selectedGroups.length === availableGroups.length) {
      setSelectedGroups([]);
    } else {
      setSelectedGroups(availableGroups.map((g) => g.id));
    }
  };

  const handlePost = async () => {
    if (selectedGroups.length === 0) {
      toast.error("Selecione pelo menos um grupo");
      return;
    }

    if (!selectedMedia && !selectedMessage) {
      toast.error("Selecione uma mídia ou mensagem");
      return;
    }

    setIsPosting(true);
    
    try {
      const message = selectedMessage
        ? messages?.find((m) => m.id === selectedMessage)?.content
        : null;

      for (const groupId of selectedGroups) {
        const group = groups?.find((g) => g.id === groupId);
        if (!group) continue;

        // Check if same media was used last time
        if (selectedMedia && group.posting_settings?.last_media_id === selectedMedia) {
          await recordPosting(
            groupId,
            group.group_type,
            selectedMedia,
            message,
            'bloqueado',
            'Mídia já foi usada neste grupo anteriormente'
          );
          continue;
        }

        // Record successful posting
        await recordPosting(
          groupId,
          group.group_type,
          selectedMedia,
          message,
          'postado'
        );
      }

      toast.success(`Postagem registrada em ${selectedGroups.length} grupo(s)!`);
      
      // Reset form
      setSelectedGroups([]);
      setSelectedMedia(null);
      setSelectedMessage(null);
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["groups-posting-info"] });
      queryClient.invalidateQueries({ queryKey: ["posting-history"] });
    } catch (error) {
      toast.error("Erro ao registrar postagem");
    } finally {
      setIsPosting(false);
    }
  };

  const isLoading = groupsLoading || mediaLoading || messagesLoading;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/20 border-green-200 dark:border-green-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">{totalAvailable}</p>
                  <p className="text-xs text-green-600 dark:text-green-400">Disponíveis</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/30 dark:to-orange-900/20 border-orange-200 dark:border-orange-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/20 rounded-lg">
                  <Lock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{totalBlocked}</p>
                  <p className="text-xs text-orange-600 dark:text-orange-400">Bloqueados</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Car className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{driverGroups.length}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Motorista</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/30 dark:to-emerald-900/20 border-emerald-200 dark:border-emerald-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <Bike className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{motoboyGroups.length}</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Motoboy</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Group Selection */}
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Selecionar Grupos
                </CardTitle>
                {availableGroups.length > 0 && (
                  <Button variant="outline" size="sm" onClick={handleSelectAllAvailable}>
                    {selectedGroups.length === availableGroups.length
                      ? "Desmarcar"
                      : `Selecionar Todos (${availableGroups.length})`}
                  </Button>
                )}
              </div>
              
              {/* Profile Filter Tabs */}
              <Tabs value={profileFilter} onValueChange={(v) => setProfileFilter(v as typeof profileFilter)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="all" className="text-xs">
                    Todos ({groups?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="driver" className="text-xs flex items-center gap-1">
                    <Car className="h-3 w-3" />
                    Motorista ({driverGroups.length})
                  </TabsTrigger>
                  <TabsTrigger value="motoboy" className="text-xs flex items-center gap-1">
                    <Bike className="h-3 w-3" />
                    Motoboy ({motoboyGroups.length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <CardDescription className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Origem: Buscador de Grupos
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[450px]">
                <div className="p-4 space-y-4">
                  {/* Available Groups */}
                  {availableGroups.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-green-600 dark:text-green-400 flex items-center gap-2 px-1">
                        <CheckCircle2 className="h-4 w-4" />
                        Disponíveis para Postagem ({availableGroups.length})
                      </h4>
                      {availableGroups.map((group) => (
                        <GroupCard
                          key={group.id}
                          group={group}
                          isSelected={selectedGroups.includes(group.id)}
                          onToggle={() => handleGroupToggle(group.id)}
                        />
                      ))}
                    </div>
                  )}

                  {availableGroups.length > 0 && blockedGroups.length > 0 && (
                    <Separator className="my-4" />
                  )}

                  {/* Blocked Groups */}
                  {blockedGroups.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-2 px-1">
                        <Lock className="h-4 w-4" />
                        Bloqueados por Data ({blockedGroups.length})
                      </h4>
                      {blockedGroups.map((group) => (
                        <GroupCard
                          key={group.id}
                          group={group}
                          isSelected={false}
                          onToggle={() => {}}
                          disabled
                        />
                      ))}
                    </div>
                  )}

                  {!filteredGroups.length && (
                    <div className="text-center py-8 text-muted-foreground">
                      <XCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Nenhum grupo encontrado</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Right Column - Content Selection */}
          <div className="space-y-6">
            {/* Media Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Image className="h-5 w-5" />
                  Selecionar Mídia
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[150px]">
                  <div className="grid grid-cols-2 gap-2">
                    {mediaItems?.map((media) => (
                      <div
                        key={media.id}
                        className={`relative aspect-video rounded-lg overflow-hidden cursor-pointer border-2 transition-colors ${
                          selectedMedia === media.id
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-transparent hover:border-muted-foreground/50"
                        }`}
                        onClick={() => setSelectedMedia(selectedMedia === media.id ? null : media.id)}
                      >
                        {media.media_type === "video" ? (
                          <video src={media.media_url} className="w-full h-full object-cover" />
                        ) : (
                          <img src={media.media_url} alt={media.title} className="w-full h-full object-cover" />
                        )}
                        <div className="absolute inset-0 bg-black/40 flex items-end p-2">
                          <span className="text-white text-xs truncate">{media.title}</span>
                        </div>
                        {selectedMedia === media.id && (
                          <div className="absolute top-2 right-2">
                            <CheckCircle2 className="h-5 w-5 text-primary" />
                          </div>
                        )}
                      </div>
                    ))}
                    {!mediaItems?.length && (
                      <p className="col-span-2 text-center text-sm text-muted-foreground py-4">
                        Nenhuma mídia disponível
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Message Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Selecionar Mensagem
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[150px]">
                  <div className="space-y-2">
                    {messages?.map((msg) => (
                      <div
                        key={msg.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedMessage === msg.id
                            ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                            : "border-border hover:border-muted-foreground/50"
                        }`}
                        onClick={() => setSelectedMessage(selectedMessage === msg.id ? null : msg.id)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{msg.title}</span>
                          {selectedMessage === msg.id && (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {msg.content}
                        </p>
                      </div>
                    ))}
                    {!messages?.length && (
                      <p className="text-center text-sm text-muted-foreground py-4">
                        Nenhuma mensagem disponível
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Post Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={handlePost}
              disabled={isPosting || selectedGroups.length === 0 || (!selectedMedia && !selectedMessage)}
            >
              {isPosting ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Postando...
                </>
              ) : (
                <>
                  <Send className="h-5 w-5 mr-2" />
                  Postar em {selectedGroups.length} grupo(s)
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function GroupCard({
  group,
  isSelected,
  onToggle,
  disabled = false,
}: {
  group: GroupWithPostingInfo;
  isSelected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const formatDate = (date: Date | null) => {
    if (!date) return "Nunca";
    return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const tooltipContent = disabled && group.next_allowed_at
    ? `Disponível em ${formatDate(group.next_allowed_at)}`
    : group.can_post
    ? "Disponível para postagem"
    : "Aguardando intervalo";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`relative rounded-xl border-2 transition-all duration-200 ${
            disabled 
              ? "opacity-60 bg-muted/30 border-muted cursor-not-allowed" 
              : isSelected
              ? "border-primary bg-primary/5 shadow-md"
              : "border-border hover:border-primary/50 hover:shadow-sm cursor-pointer"
          }`}
          onClick={!disabled ? onToggle : undefined}
        >
          {/* Header */}
          <div className="flex items-start gap-3 p-4">
            <Checkbox 
              checked={isSelected} 
              disabled={disabled} 
              className="mt-0.5"
            />
            
            <div className="flex-1 min-w-0 space-y-2">
              {/* Group Name and Type */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">
                  {group.cidade}, {group.estado}
                </span>
                <Badge variant="outline" className="text-xs">
                  {group.tipo}
                </Badge>
              </div>
              
              {/* Profile Badge */}
              <div className="flex items-center gap-2">
                {group.group_type === "driver" ? (
                  <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 hover:bg-blue-500/25">
                    <Car className="h-3 w-3 mr-1" />
                    Motorista
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-500/25">
                    <Bike className="h-3 w-3 mr-1" />
                    Motoboy
                  </Badge>
                )}
                
                {/* Status Badge */}
                {group.can_post ? (
                  <Badge className="bg-green-500/15 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Disponível
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700">
                    <Lock className="h-3 w-3 mr-1" />
                    Bloqueado
                  </Badge>
                )}
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-muted-foreground pt-1">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  <span>Última: {formatDate(group.last_posted_at)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  <span>
                    Próxima: {group.next_allowed_at ? formatDate(group.next_allowed_at) : "Agora"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Timer className="h-3 w-3" />
                  <span>Intervalo: {group.interval_days} dias</span>
                </div>
                {group.days_until_allowed !== null && !group.can_post && (
                  <div className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400 font-medium">
                    <Lock className="h-3 w-3" />
                    <span>Libera em {group.days_until_allowed} dia(s)</span>
                  </div>
                )}
              </div>
            </div>

            {/* External Link */}
            <a
              href={group.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p>{tooltipContent}</p>
      </TooltipContent>
    </Tooltip>
  );
}