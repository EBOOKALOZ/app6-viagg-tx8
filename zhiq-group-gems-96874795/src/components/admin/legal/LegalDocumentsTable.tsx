import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Eye,
  CheckCircle,
  Archive,
  Users,
  Copy,
  FileText,
  Loader2,
  Hash,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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

interface LegalDocumentsTableProps {
  documents: LegalDocument[];
  loading: boolean;
  onView: (doc: LegalDocument) => void;
  onActivate: (doc: LegalDocument) => void;
  onArchive: (doc: LegalDocument) => void;
  onViewAcceptances: (doc: LegalDocument) => void;
  onDuplicate: (doc: LegalDocument) => void;
}

const getProfileBadgeStyles = (profile: string | null) => {
  const styles: Record<string, string> = {
    passenger: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    driver: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    motoboy: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
    mototaxi: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
    merchant: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
    freteiro: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
    all: "bg-muted text-muted-foreground border-border",
  };
  return styles[profile || "all"] || styles.all;
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

export function LegalDocumentsTable({
  documents,
  loading,
  onView,
  onActivate,
  onArchive,
  onViewAcceptances,
  onDuplicate,
}: LegalDocumentsTableProps) {
  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Carregando documentos...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 shadow-sm overflow-hidden">
      <CardHeader className="bg-muted/30 border-b border-border/50 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background border border-border/50">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-base">Registro de Documentos</CardTitle>
            <p className="text-xs text-muted-foreground">
              {documents.length} registro{documents.length !== 1 ? "s" : ""} encontrado{documents.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableHead className="font-semibold text-xs uppercase tracking-wider">Código</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider">Título</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider">Escopo</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-center">Versão</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-center">Status</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider">Vigência</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider">Hash</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">Nenhum documento encontrado</p>
                        <p className="text-sm text-muted-foreground">
                          Ajuste os filtros ou crie uma nova versão
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                documents.map((doc, index) => (
                  <TableRow 
                    key={doc.id} 
                    className={`group transition-colors ${index % 2 === 0 ? "bg-background" : "bg-muted/10"}`}
                  >
                    <TableCell>
                      <code className="px-2 py-1 rounded bg-muted text-xs font-mono font-medium">
                        {doc.code}
                      </code>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <span className="truncate block font-medium text-foreground" title={doc.title}>
                        {doc.title}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={`text-xs font-medium ${getProfileBadgeStyles(doc.profile_scope)}`}
                      >
                        {getProfileLabel(doc.profile_scope)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="font-mono text-xs px-2.5">
                        v{doc.version}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {doc.is_active ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-medium">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="font-medium text-muted-foreground">
                          <Archive className="h-3 w-3 mr-1" />
                          Arquivado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        {doc.effective_at
                          ? format(new Date(doc.effective_at), "dd/MM/yyyy", { locale: ptBR })
                          : "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                        <code className="text-xs text-muted-foreground font-mono">
                          {doc.content_sha256?.substring(0, 8) || "—"}
                        </code>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => onView(doc)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Visualizar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {!doc.is_active && (
                            <DropdownMenuItem onClick={() => onActivate(doc)}>
                              <CheckCircle className="h-4 w-4 mr-2 text-emerald-600" />
                              Ativar versão
                            </DropdownMenuItem>
                          )}
                          {doc.is_active && (
                            <DropdownMenuItem onClick={() => onArchive(doc)}>
                              <Archive className="h-4 w-4 mr-2 text-amber-600" />
                              Arquivar versão
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => onViewAcceptances(doc)}>
                            <Users className="h-4 w-4 mr-2" />
                            Ver Aceites
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onDuplicate(doc)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicar como nova
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
