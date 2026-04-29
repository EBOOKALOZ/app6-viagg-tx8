import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Image, Video, FileText, Plus, Eye, Pencil, Archive, Loader2 } from "lucide-react";
import { CreateMediaModal } from "@/components/admin/marketing/CreateMediaModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMarketingRole } from "@/hooks/useMarketingRole";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MediaDashboardItem {
  id: string;
  title: string;
  media_type: string;
  region_id: string;
  is_active: boolean;
  template_text: string | null;
  created_at: string;
  total_postagens: number;
  ultima_postagem: string | null;
  score_recencia: number;
  ranking_regional: number;
  media_url?: string | null;
  description?: string | null;
  campaign_type?: string | null;
}

function getPerformanceBadge(ranking: number) {
  if (ranking === 1) return { label: "🔥 quente", variant: "destructive" as const };
  if (ranking <= 3) return { label: "🚀 alta", variant: "default" as const };
  if (ranking <= 5) return { label: "📈 média", variant: "secondary" as const };
  return { label: "📦 normal", variant: "outline" as const };
}

function getMediaIcon(type: string) {
  if (type === "video") return Video;
  if (type === "text") return FileText;
  return Image;
}

export default function AdminMarketingBiblioteca() {
  const { isAdmin } = useAuth();
  const { marketingRole } = useMarketingRole();
  const queryClient = useQueryClient();

  // Realtime refresh
  useEffect(() => {
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ["media-ranking-regional"] });
      queryClient.invalidateQueries({ queryKey: ["media-library-urls"] });
    };
    window.addEventListener("operator-live-update", refresh);
    return () => window.removeEventListener("operator-live-update", refresh);
  }, [queryClient]);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterRegion, setFilterRegion] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Fetch from media_ranking_regional
  const { data: rankingData, isLoading: loadingRanking } = useQuery({
    queryKey: ["media-ranking-regional"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_ranking_regional" as any)
        .select("*")
        .order("ranking_regional", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Fetch media_library for URLs
  const { data: mediaLibData } = useQuery({
    queryKey: ["media-library-urls"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_library")
        .select("id, media_url, description, campaign_type");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Merge data client-side
  const items: MediaDashboardItem[] = useMemo(() => {
    if (!rankingData) return [];
    const urlMap = new Map<string, any>();
    mediaLibData?.forEach((m: any) => urlMap.set(m.id, m));
    return rankingData.map((r: any) => {
      const lib = urlMap.get(r.id);
      return {
        ...r,
        media_url: lib?.media_url ?? null,
        description: lib?.description ?? null,
        campaign_type: lib?.campaign_type ?? null,
      };
    });
  }, [rankingData, mediaLibData]);

  // Extract unique regions
  const regions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => { if (i.region_id) set.add(i.region_id); });
    return Array.from(set).sort();
  }, [items]);

  // Filter
  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (search && !item.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterType !== "all" && item.media_type !== filterType) return false;
      if (filterRegion !== "all" && item.region_id !== filterRegion) return false;
      if (filterStatus === "ativa" && !item.is_active) return false;
      if (filterStatus === "inativa" && item.is_active) return false;
      return true;
    });
  }, [items, search, filterType, filterRegion, filterStatus]);

  const isLoading = loadingRanking;

  return (
    <div className="space-y-6 p-4 sm:p-0">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Biblioteca de Mídias de Marketing</h1>
        {isAdmin && (
          <Button className="w-full sm:w-auto bg-primary hover:bg-primary/90" onClick={() => setCreateModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Mídia
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Input
              placeholder="Buscar por título..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="image">Imagem</SelectItem>
                <SelectItem value="video">Vídeo</SelectItem>
                <SelectItem value="text">Texto</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterRegion} onValueChange={setFilterRegion}>
              <SelectTrigger><SelectValue placeholder="Região" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Regiões</SelectItem>
                {regions.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ativa">Ativa</SelectItem>
                <SelectItem value="inativa">Inativa</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-sm text-muted-foreground flex items-center">
              {filtered.length} mídia(s) encontrada(s)
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Image className="h-16 w-16 mx-auto mb-4 text-muted-foreground/40" />
            <h3 className="text-lg font-semibold">Nenhuma mídia cadastrada ainda.</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Comece adicionando sua primeira mídia de marketing.
            </p>
            {isAdmin && (
              <Button className="mt-4 bg-primary hover:bg-primary/90" onClick={() => setCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar primeira mídia
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const perf = getPerformanceBadge(item.ranking_regional);
            const MediaIcon = getMediaIcon(item.media_type);
            return (
              <Card key={item.id} className={`overflow-hidden transition-opacity ${!item.is_active ? "opacity-50" : ""}`}>
                {/* Thumbnail */}
                <div className="aspect-video relative bg-muted">
                  {item.media_url && item.media_type === "video" ? (
                    <video src={item.media_url} className="w-full h-full object-cover" />
                  ) : item.media_url && item.media_type === "image" ? (
                    <img src={item.media_url} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <MediaIcon className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                  )}
                  {/* Performance badge */}
                  <div className="absolute top-2 right-2">
                    <Badge variant={perf.variant} className="text-xs font-bold shadow-md">
                      {perf.label}
                    </Badge>
                  </div>
                  {/* Type icon */}
                  <div className="absolute top-2 left-2">
                    <MediaIcon className="h-5 w-5 text-white drop-shadow-md" />
                  </div>
                </div>

                {/* Content */}
                <CardContent className="p-4 space-y-2">
                  <h3 className="font-semibold truncate">{item.title}</h3>
                  
                  <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs capitalize">{item.media_type}</Badge>
                    <Badge variant="outline" className="text-xs">{item.region_id || "—"}</Badge>
                    {item.campaign_type && (
                      <Badge variant="outline" className="text-xs">{item.campaign_type}</Badge>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>Total de Postagens: <span className="font-medium text-foreground">{item.total_postagens ?? 0}</span></p>
                    <p>Última Postagem: <span className="font-medium text-foreground">
                      {item.ultima_postagem
                        ? format(new Date(item.ultima_postagem), "dd/MM/yyyy HH:mm", { locale: ptBR })
                        : "—"}
                    </span></p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" title="Visualizar">
                      <Eye className="h-4 w-4" />
                    </Button>
                    {isAdmin && (
                      <>
                        <Button variant="outline" size="sm" title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" title="Arquivar">
                          <Archive className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateMediaModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        regions={regions}
      />
    </div>
  );
}
