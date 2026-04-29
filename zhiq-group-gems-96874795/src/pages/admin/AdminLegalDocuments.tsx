import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { 
  Copy, 
  CheckCircle, 
  FileText, 
  Hash,
  Calendar,
  Globe,
  Scale,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import {
  LegalDocumentsHeader,
  LegalDocumentsMetrics,
  LegalDocumentsFilters,
  LegalDocumentsTable,
  NewVersionModal,
  AcceptanceStatsModal,
} from "@/components/admin/legal";

interface LegalDocument {
  id: string;
  code: string;
  title: string;
  content: string;
  version: number;
  profile_scope: string | null;
  is_active: boolean | null;
  effective_at: string | null;
  retired_at: string | null;
  language: string | null;
  jurisdiction: string | null;
  content_sha256: string | null;
  created_at: string | null;
  created_by: string | null;
}

interface AcceptanceStats {
  total: number;
  byProfile: Record<string, number>;
}

const getProfileBadgeColor = (profile: string | null) => {
  const colors: Record<string, string> = {
    passenger: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    driver: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    motoboy: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
    mototaxi: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
    merchant: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
    freteiro: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
    all: "bg-muted text-muted-foreground border-border",
  };
  return colors[profile || "all"] || colors.all;
};

const getProfileLabel = (profile: string | null) => {
  const labels: Record<string, string> = {
    passenger: "Passageiro",
    driver: "Motorista",
    motoboy: "Motoboy",
    mototaxi: "Mototáxi",
    merchant: "Comerciante",
    freteiro: "Freteiro",
    all: "Todos",
  };
  return labels[profile || "all"] || profile || "Todos";
};

export default function AdminLegalDocuments() {
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ 
    totalActive: 0, 
    totalDocs: 0, 
    totalProfiles: 0,
    totalRecords: 0,
  });

  // Filters
  const [filterProfile, setFilterProfile] = useState<string>("all");
  const [filterCode, setFilterCode] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterLanguage, setFilterLanguage] = useState("");
  const [filterJurisdiction, setFilterJurisdiction] = useState("");

  // Drawer
  const [selectedDoc, setSelectedDoc] = useState<LegalDocument | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Modal Nova Versão
  const [newVersionModalOpen, setNewVersionModalOpen] = useState(false);
  const [newVersionStep, setNewVersionStep] = useState(1);
  const [newVersionData, setNewVersionData] = useState({
    code: "",
    profile_scope: "",
    title: "",
    language: "pt-BR",
    jurisdiction: "BR",
    effective_at: "",
    content: "",
  });
  const [confirmImmutability, setConfirmImmutability] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Modal Aceites
  const [acceptanceModalOpen, setAcceptanceModalOpen] = useState(false);
  const [acceptanceStats, setAcceptanceStats] = useState<AcceptanceStats | null>(null);
  const [loadingAcceptances, setLoadingAcceptances] = useState(false);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("legal_documents")
        .select("*")
        .order("code", { ascending: true })
        .order("version", { ascending: false });

      if (filterProfile !== "all") {
        query = query.eq("profile_scope", filterProfile);
      }
      if (filterCode) {
        query = query.ilike("code", `%${filterCode}%`);
      }
      if (filterStatus === "active") {
        query = query.eq("is_active", true);
      } else if (filterStatus === "archived") {
        query = query.eq("is_active", false);
      }
      if (filterLanguage) {
        query = query.ilike("language", `%${filterLanguage}%`);
      }
      if (filterJurisdiction) {
        query = query.ilike("jurisdiction", `%${filterJurisdiction}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      setDocuments(data || []);

      // Calculate stats
      const activeCount = (data || []).filter((d) => d.is_active).length;
      const uniqueCodes = new Set((data || []).map((d) => d.code)).size;
      const uniqueProfiles = new Set((data || []).map((d) => d.profile_scope).filter(Boolean)).size;

      setStats({
        totalActive: activeCount,
        totalDocs: uniqueCodes,
        totalProfiles: uniqueProfiles,
        totalRecords: data?.length || 0,
      });
    } catch (error) {
      console.error("Erro ao carregar documentos:", error);
      toast.error("Erro ao carregar documentos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleFilter = () => {
    fetchDocuments();
  };

  const handleClearFilters = () => {
    setFilterProfile("all");
    setFilterCode("");
    setFilterStatus("all");
    setFilterLanguage("");
    setFilterJurisdiction("");
    fetchDocuments();
  };

  const handleActivateVersion = async (doc: LegalDocument) => {
    try {
      // Desativar versões anteriores do mesmo código e perfil
      await supabase
        .from("legal_documents")
        .update({ is_active: false, retired_at: new Date().toISOString() })
        .eq("code", doc.code)
        .eq("profile_scope", doc.profile_scope);

      // Ativar a versão selecionada
      const { error } = await supabase
        .from("legal_documents")
        .update({ is_active: true, retired_at: null })
        .eq("id", doc.id);

      if (error) throw error;

      toast.success(`Versão ${doc.version} ativada com sucesso`);
      fetchDocuments();
    } catch (error) {
      console.error("Erro ao ativar versão:", error);
      toast.error("Erro ao ativar versão");
    }
  };

  const handleArchiveVersion = async (doc: LegalDocument) => {
    try {
      const { error } = await supabase
        .from("legal_documents")
        .update({ is_active: false, retired_at: new Date().toISOString() })
        .eq("id", doc.id);

      if (error) throw error;

      toast.success("Versão arquivada com sucesso");
      fetchDocuments();
    } catch (error) {
      console.error("Erro ao arquivar versão:", error);
      toast.error("Erro ao arquivar versão");
    }
  };

  const handleDuplicateAsNewVersion = (doc: LegalDocument) => {
    setNewVersionData({
      code: doc.code,
      profile_scope: doc.profile_scope || "",
      title: doc.title,
      language: doc.language || "pt-BR",
      jurisdiction: doc.jurisdiction || "BR",
      effective_at: "",
      content: doc.content,
    });
    setNewVersionStep(1);
    setConfirmImmutability(false);
    setNewVersionModalOpen(true);
    setDrawerOpen(false);
  };

  const handleViewAcceptances = async (doc?: LegalDocument) => {
    setLoadingAcceptances(true);
    setAcceptanceModalOpen(true);

    try {
      let query = supabase.from("legal_acceptances").select("*");

      if (doc) {
        query = query.eq("version_accepted", doc.version);
      }

      const { data, error } = await query;

      if (error) throw error;

      const byProfile: Record<string, number> = {};
      (data || []).forEach((acceptance) => {
        const profile = acceptance.profile_type || "unknown";
        byProfile[profile] = (byProfile[profile] || 0) + 1;
      });

      setAcceptanceStats({
        total: data?.length || 0,
        byProfile,
      });
    } catch (error) {
      console.error("Erro ao carregar aceites:", error);
      toast.error("Erro ao carregar estatísticas de aceites");
    } finally {
      setLoadingAcceptances(false);
    }
  };

  const handlePublishNewVersion = async () => {
    if (!confirmImmutability) {
      toast.error("Confirme que entende a imutabilidade do documento");
      return;
    }

    if (!newVersionData.code || !newVersionData.title || !newVersionData.content) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setPublishing(true);

    try {
      // Buscar a maior versão existente para o código + perfil
      const { data: existingVersions } = await supabase
        .from("legal_documents")
        .select("version")
        .eq("code", newVersionData.code)
        .eq("profile_scope", newVersionData.profile_scope || null)
        .order("version", { ascending: false })
        .limit(1);

      const nextVersion = existingVersions && existingVersions.length > 0 
        ? existingVersions[0].version + 1 
        : 1;

      // Gerar hash do conteúdo
      const encoder = new TextEncoder();
      const data = encoder.encode(newVersionData.content);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const contentHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      // Inserir nova versão
      const { error } = await supabase.from("legal_documents").insert({
        code: newVersionData.code,
        title: newVersionData.title,
        content: newVersionData.content,
        version: nextVersion,
        profile_scope: newVersionData.profile_scope || null,
        language: newVersionData.language,
        jurisdiction: newVersionData.jurisdiction,
        effective_at: newVersionData.effective_at || null,
        is_active: false,
        content_sha256: contentHash,
      });

      if (error) throw error;

      toast.success(`Versão ${nextVersion} publicada com sucesso`);
      setNewVersionModalOpen(false);
      setNewVersionData({
        code: "",
        profile_scope: "",
        title: "",
        language: "pt-BR",
        jurisdiction: "BR",
        effective_at: "",
        content: "",
      });
      setConfirmImmutability(false);
      fetchDocuments();
    } catch (error) {
      console.error("Erro ao publicar versão:", error);
      toast.error("Erro ao publicar nova versão");
    } finally {
      setPublishing(false);
    }
  };

  const openNewVersionModal = () => {
    setNewVersionData({
      code: "",
      profile_scope: "",
      title: "",
      language: "pt-BR",
      jurisdiction: "BR",
      effective_at: "",
      content: "",
    });
    setNewVersionStep(1);
    setConfirmImmutability(false);
    setNewVersionModalOpen(true);
  };

  return (
    <div className="space-y-6">
        {/* Header institucional */}
        <LegalDocumentsHeader
          onViewAcceptances={() => handleViewAcceptances()}
          onNewVersion={openNewVersionModal}
        />

        {/* Métricas */}
        <LegalDocumentsMetrics
          totalActive={stats.totalActive}
          totalDocs={stats.totalDocs}
          totalProfiles={stats.totalProfiles}
          totalRecords={stats.totalRecords}
        />

        {/* Filtros */}
        <LegalDocumentsFilters
          filterProfile={filterProfile}
          setFilterProfile={setFilterProfile}
          filterCode={filterCode}
          setFilterCode={setFilterCode}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          filterLanguage={filterLanguage}
          setFilterLanguage={setFilterLanguage}
          filterJurisdiction={filterJurisdiction}
          setFilterJurisdiction={setFilterJurisdiction}
          onFilter={handleFilter}
          onClear={handleClearFilters}
        />

        {/* Tabela */}
        <LegalDocumentsTable
          documents={documents}
          loading={loading}
          onView={(doc) => {
            setSelectedDoc(doc);
            setDrawerOpen(true);
          }}
          onActivate={handleActivateVersion}
          onArchive={handleArchiveVersion}
          onViewAcceptances={handleViewAcceptances}
          onDuplicate={handleDuplicateAsNewVersion}
        />

        {/* Drawer de Visualização */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
            <SheetHeader className="border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Scale className="h-5 w-5 text-primary" />
                </div>
                <SheetTitle>Visualizar Documento</SheetTitle>
              </div>
            </SheetHeader>

            {selectedDoc && (
              <div className="mt-6 space-y-6">
                {/* Informações principais */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Código</Label>
                    <code className="block px-2 py-1 rounded bg-muted text-sm font-mono">
                      {selectedDoc.code}
                    </code>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Versão</Label>
                    <Badge variant="secondary" className="font-mono">
                      v{selectedDoc.version}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Perfil</Label>
                    <Badge variant="outline" className={getProfileBadgeColor(selectedDoc.profile_scope)}>
                      {getProfileLabel(selectedDoc.profile_scope)}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    {selectedDoc.is_active ? (
                      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Arquivado</Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Vigência
                    </Label>
                    <p className="text-sm">
                      {selectedDoc.effective_at
                        ? format(new Date(selectedDoc.effective_at), "dd/MM/yyyy", { locale: ptBR })
                        : "Não definida"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Globe className="h-3 w-3" /> Idioma
                    </Label>
                    <p className="text-sm">{selectedDoc.language || "pt-BR"}</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Título
                  </Label>
                  <p className="font-medium text-foreground">{selectedDoc.title}</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Hash className="h-3 w-3" /> Hash SHA-256
                  </Label>
                  <code className="block text-xs break-all p-2 rounded bg-muted font-mono">
                    {selectedDoc.content_sha256 || "—"}
                  </code>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Conteúdo</Label>
                  <div className="p-4 border rounded-lg bg-muted/20 max-h-[350px] overflow-y-auto">
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: selectedDoc.content }}
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => handleDuplicateAsNewVersion(selectedDoc)}
                    className="gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Duplicar como nova
                  </Button>
                  {!selectedDoc.is_active && (
                    <Button
                      onClick={() => {
                        handleActivateVersion(selectedDoc);
                        setDrawerOpen(false);
                      }}
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Ativar versão
                    </Button>
                  )}
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Modal Nova Versão */}
        <NewVersionModal
          open={newVersionModalOpen}
          onOpenChange={setNewVersionModalOpen}
          step={newVersionStep}
          setStep={setNewVersionStep}
          data={newVersionData}
          setData={setNewVersionData}
          confirmImmutability={confirmImmutability}
          setConfirmImmutability={setConfirmImmutability}
          publishing={publishing}
          onPublish={handlePublishNewVersion}
        />

        {/* Modal Aceites */}
        <AcceptanceStatsModal
          open={acceptanceModalOpen}
          onOpenChange={setAcceptanceModalOpen}
          loading={loadingAcceptances}
          stats={acceptanceStats}
        />
      </div>
  );
}
