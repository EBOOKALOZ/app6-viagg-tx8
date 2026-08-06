/**
 * ORION-QA Fase 1 — detalhe do problema (/admin/qa/:id).
 * Dados gerais + gestão de ciclo de vida + comentários + timeline (histórico
 * automático) + anexos (bucket privado) + logs de auditoria.
 */
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bug,
  Download,
  FileText,
  History,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  addQaComment, deleteQaAttachment, getQaAttachmentUrl, getQaIssue, listQaAdmins,
  listQaAttachments, listQaAuditLogs, listQaComments, listQaHistory, updateQaIssue,
} from "@/services/qa/qaIssues";
import {
  QA_HISTORY_EVENT_LABELS, QA_PRIORITIES, QA_PRIORITY_LABELS, QA_SEVERITIES,
  QA_SEVERITY_COLORS, QA_SEVERITY_LABELS, QA_STATUSES, QA_STATUS_COLORS, QA_STATUS_LABELS,
  qaLabel, type QaStatus,
} from "@/services/qa/types";

const UNASSIGNED = "__none__";

function profileName(p: { name: string | null; email: string | null } | null): string {
  return p?.name || p?.email || "—";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function InfoField({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
      <p className={`text-sm mt-0.5 whitespace-pre-wrap break-words ${mono ? "font-mono text-xs" : ""} ${value ? "" : "text-muted-foreground italic"}`}>
        {value || "—"}
      </p>
    </div>
  );
}

export default function AdminQAIssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newComment, setNewComment] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");

  const issueId = id ?? "";

  const { data: issue, isLoading, error } = useQuery({
    queryKey: ["qa-issue", issueId],
    queryFn: () => getQaIssue(issueId),
    enabled: !!issueId,
  });

  const { data: comments, isLoading: commentsLoading } = useQuery({
    queryKey: ["qa-issue-comments", issueId],
    queryFn: () => listQaComments(issueId),
    enabled: !!issueId,
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["qa-issue-history", issueId],
    queryFn: () => listQaHistory(issueId),
    enabled: !!issueId,
  });

  const { data: attachments, isLoading: attachmentsLoading } = useQuery({
    queryKey: ["qa-issue-attachments", issueId],
    queryFn: () => listQaAttachments(issueId),
    enabled: !!issueId,
  });

  const { data: auditLogs, isLoading: auditLoading } = useQuery({
    queryKey: ["qa-issue-audit", issueId],
    queryFn: () => listQaAuditLogs(issueId),
    enabled: !!issueId,
  });

  const { data: admins } = useQuery({ queryKey: ["qa-admins"], queryFn: listQaAdmins });

  const invalidateIssue = () => {
    queryClient.invalidateQueries({ queryKey: ["qa-issue", issueId] });
    queryClient.invalidateQueries({ queryKey: ["qa-issue-history", issueId] });
    queryClient.invalidateQueries({ queryKey: ["qa-issue-audit", issueId] });
    queryClient.invalidateQueries({ queryKey: ["qa-issues"] });
    queryClient.invalidateQueries({ queryKey: ["qa-issues-all"] });
  };

  const updateMutation = useMutation({
    mutationFn: (patch: Parameters<typeof updateQaIssue>[1]) => updateQaIssue(issueId, patch),
    onSuccess: () => {
      toast.success("Problema atualizado.");
      invalidateIssue();
    },
    onError: (err: Error) => toast.error(`Erro ao atualizar: ${err.message}`),
  });

  const commentMutation = useMutation({
    mutationFn: () => addQaComment(issueId, newComment.trim()),
    onSuccess: () => {
      setNewComment("");
      queryClient.invalidateQueries({ queryKey: ["qa-issue-comments", issueId] });
      queryClient.invalidateQueries({ queryKey: ["qa-issue-audit", issueId] });
    },
    onError: (err: Error) => toast.error(`Erro ao comentar: ${err.message}`),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const { uploadQaAttachment } = await import("@/services/qa/qaIssues");
      return uploadQaAttachment(issueId, file);
    },
    onSuccess: () => {
      toast.success("Anexo enviado.");
      queryClient.invalidateQueries({ queryKey: ["qa-issue-attachments", issueId] });
      queryClient.invalidateQueries({ queryKey: ["qa-issue-audit", issueId] });
    },
    onError: (err: Error) => toast.error(`Erro no upload: ${err.message}`),
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: deleteQaAttachment,
    onSuccess: () => {
      toast.success("Anexo removido.");
      queryClient.invalidateQueries({ queryKey: ["qa-issue-attachments", issueId] });
      queryClient.invalidateQueries({ queryKey: ["qa-issue-audit", issueId] });
    },
    onError: (err: Error) => toast.error(`Erro ao remover anexo: ${err.message}`),
  });

  const handleStatusChange = (status: string) => {
    const patch: Parameters<typeof updateQaIssue>[1] = { status };
    const notes = resolutionNotes.trim();
    if (notes) patch.resolution_notes = notes;
    updateMutation.mutate(patch);
  };

  const handleDownload = async (path: string, name: string) => {
    try {
      const url = await getQaAttachmentUrl(path);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.target = "_blank";
      anchor.rel = "noopener";
      anchor.click();
    } catch (err) {
      toast.error(`Erro ao gerar link do anexo: ${(err as Error).message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-[1200px] mx-auto">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error || !issue) {
    return (
      <div className="p-6 max-w-[1200px] mx-auto">
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <Bug className="h-10 w-10 mx-auto text-red-500" />
            <p className="text-red-500 font-medium">
              {error ? `Erro ao carregar o problema: ${(error as Error).message}` : "Problema não encontrado."}
            </p>
            <Button variant="outline" onClick={() => navigate("/admin/qa")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para a Central de Problemas
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const adminName = (userId: string | null) => {
    if (!userId) return "Sistema";
    const admin = (admins ?? []).find((a) => a.id === userId);
    return admin ? profileName(admin) : `${userId.slice(0, 8)}…`;
  };

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link to="/admin/qa" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            Central de Problemas
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="font-mono text-primary">#{issue.issue_number}</span>
            <span className="break-words">{issue.title}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`${QA_STATUS_COLORS[issue.status as QaStatus] ?? "bg-gray-500"} text-white border-0`}>
              {qaLabel.status(issue.status)}
            </Badge>
            <Badge variant="outline" className={QA_SEVERITY_COLORS[issue.severity as keyof typeof QA_SEVERITY_COLORS] ?? ""}>
              {qaLabel.severity(issue.severity)}
            </Badge>
            <Badge variant="outline">{qaLabel.priority(issue.priority)}</Badge>
            <Badge variant="outline">{qaLabel.origin(issue.origin)}</Badge>
            <Badge variant="outline">{qaLabel.environment(issue.environment)}</Badge>
            <span className="text-xs text-muted-foreground">
              módulo <strong>{issue.module}</strong> · criado em {format(new Date(issue.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} por {profileName(issue.createdByProfile)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dados gerais */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Dados Gerais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InfoField label="Descrição" value={issue.description} />
              <Separator />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <InfoField label="Versão atual" value={issue.current_version} />
                <InfoField label="Versão corrigida" value={issue.fixed_version} />
                <InfoField label="Build" value={issue.build_number} />
                <InfoField label="Commit" value={issue.commit_hash} mono />
                <InfoField label="Navegador" value={issue.browser} />
                <InfoField label="Dispositivo" value={issue.device} />
                <InfoField label="Sistema operacional" value={issue.operating_system} />
                <InfoField label="Resolvido em" value={issue.resolved_at ? format(new Date(issue.resolved_at), "dd/MM/yyyy HH:mm") : null} />
                <InfoField label="Fechado em" value={issue.closed_at ? format(new Date(issue.closed_at), "dd/MM/yyyy HH:mm") : null} />
              </div>
              <Separator />
              <InfoField label="Mensagem de erro" value={issue.error_message} mono />
              <InfoField label="Stack trace" value={issue.stack_trace} mono />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoField label="Comportamento esperado" value={issue.expected_behavior} />
                <InfoField label="Comportamento atual" value={issue.actual_behavior} />
              </div>
              <InfoField label="Passos para reproduzir" value={issue.steps_to_reproduce} />
              {issue.resolution_notes ? (
                <>
                  <Separator />
                  <InfoField label="Notas de resolução" value={issue.resolution_notes} />
                </>
              ) : null}
            </CardContent>
          </Card>

          {/* Abas: timeline / comentários / anexos / logs */}
          <Tabs defaultValue="timeline" className="w-full">
            <TabsList>
              <TabsTrigger value="timeline">
                <History className="h-4 w-4 mr-1.5" />
                Timeline ({history?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="comments">
                <MessageSquare className="h-4 w-4 mr-1.5" />
                Comentários ({comments?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="attachments">
                <Paperclip className="h-4 w-4 mr-1.5" />
                Anexos ({attachments?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="audit">
                <ShieldCheck className="h-4 w-4 mr-1.5" />
                Logs ({auditLogs?.length ?? 0})
              </TabsTrigger>
            </TabsList>

            {/* Timeline / histórico automático */}
            <TabsContent value="timeline">
              <Card>
                <CardContent className="p-4">
                  {historyLoading ? (
                    <Skeleton className="h-24" />
                  ) : (history?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Sem eventos registrados.</p>
                  ) : (
                    <ol className="relative border-l border-border ml-3 space-y-4">
                      {(history ?? []).map((event) => (
                        <li key={event.id} className="ml-4">
                          <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-[10px] uppercase">
                              {QA_HISTORY_EVENT_LABELS[event.event_type] ?? event.event_type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(event.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })} · {adminName(event.actor_id)}
                            </span>
                          </div>
                          {(event.old_value || event.new_value) && (
                            <p className="text-sm mt-1">
                              {event.event_type === "atribuicao" ? (
                                <>
                                  {adminName(event.old_value)} → <strong>{adminName(event.new_value)}</strong>
                                </>
                              ) : (
                                <>
                                  {event.old_value ? `${qaLabel.status(event.old_value)} → ` : ""}
                                  <strong>{event.new_value ? qaLabel.status(event.new_value) : ""}</strong>
                                </>
                              )}
                            </p>
                          )}
                          {(event.ip || event.user_agent) && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 truncate" title={`${event.ip ?? ""} ${event.user_agent ?? ""}`}>
                              {event.ip ?? ""} {event.user_agent ? `· ${event.user_agent}` : ""}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Comentários internos */}
            <TabsContent value="comments">
              <Card>
                <CardContent className="p-4 space-y-4">
                  {commentsLoading ? (
                    <Skeleton className="h-24" />
                  ) : (comments?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Nenhum comentário interno ainda.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {(comments ?? []).map((c) => (
                        <div key={c.id} className="rounded-lg border bg-muted/30 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold">{profileName(c.createdByProfile)}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {format(new Date(c.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                          <p className="text-sm mt-1 whitespace-pre-wrap break-words">{c.comment}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <Separator />
                  <div className="space-y-2">
                    <Label htmlFor="qa-new-comment">Novo comentário interno</Label>
                    <Textarea
                      id="qa-new-comment"
                      value={newComment}
                      rows={3}
                      maxLength={5000}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Visível apenas para administradores; registrado em auditoria."
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => commentMutation.mutate()}
                        disabled={commentMutation.isPending || newComment.trim().length === 0}
                      >
                        {commentMutation.isPending
                          ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          : <Send className="h-4 w-4 mr-2" />}
                        Comentar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Anexos */}
            <TabsContent value="attachments">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      png, jpg, pdf, txt, json e zip — máx. 25 MB por arquivo.
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".png,.jpg,.jpeg,.pdf,.txt,.json,.zip"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadMutation.mutate(file);
                        e.target.value = "";
                      }}
                    />
                    <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                      {uploadMutation.isPending
                        ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        : <Upload className="h-4 w-4 mr-2" />}
                      Enviar anexo
                    </Button>
                  </div>
                  {attachmentsLoading ? (
                    <Skeleton className="h-20" />
                  ) : (attachments?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Nenhum anexo enviado.</p>
                  ) : (
                    <div className="space-y-2">
                      {(attachments ?? []).map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                          <div className="min-w-0 flex items-center gap-2">
                            <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate" title={a.file_name}>{a.file_name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {a.mime_type} · {formatBytes(a.size_bytes)} · {format(new Date(a.created_at), "dd/MM/yyyy HH:mm")}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                              onClick={() => handleDownload(a.file_path, a.file_name)} title="Baixar">
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                              onClick={() => deleteAttachmentMutation.mutate(a)}
                              disabled={deleteAttachmentMutation.isPending} title="Remover">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Logs de auditoria */}
            <TabsContent value="audit">
              <Card>
                <CardContent className="p-4">
                  {auditLoading ? (
                    <Skeleton className="h-24" />
                  ) : (auditLogs?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Sem registros de auditoria.</p>
                  ) : (
                    <div className="space-y-2">
                      {(auditLogs ?? []).map((log) => (
                        <div key={log.id} className="rounded-lg border p-3 text-xs space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-[10px] font-mono">{log.action}</Badge>
                            <span className="text-muted-foreground">
                              {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })} · {adminName(log.actor_id)}
                              {log.ip ? ` · ${log.ip}` : ""}
                            </span>
                          </div>
                          {log.user_agent ? (
                            <p className="text-muted-foreground truncate" title={log.user_agent}>{log.user_agent}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Coluna lateral — gestão */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-primary" />
                Gestão
              </CardTitle>
              <CardDescription>Status, atribuição e classificação.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={issue.status} onValueChange={handleStatusChange} disabled={updateMutation.isPending}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {QA_STATUSES.map((s) => <SelectItem key={s} value={s}>{QA_STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <Select
                  value={issue.assigned_to ?? UNASSIGNED}
                  onValueChange={(v) => updateMutation.mutate({ assigned_to: v === UNASSIGNED ? null : v })}
                  disabled={updateMutation.isPending}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Sem responsável</SelectItem>
                    {(admins ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name || a.email || a.id.slice(0, 8)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Severidade</Label>
                  <Select value={issue.severity} onValueChange={(v) => updateMutation.mutate({ severity: v })} disabled={updateMutation.isPending}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {QA_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{QA_SEVERITY_LABELS[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Prioridade</Label>
                  <Select value={issue.priority} onValueChange={(v) => updateMutation.mutate({ priority: v })} disabled={updateMutation.isPending}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {QA_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{QA_PRIORITY_LABELS[p]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qa-resolution">Notas de resolução</Label>
                <Textarea
                  id="qa-resolution"
                  rows={3}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Preencha antes de mudar o status para registrar junto (ex.: correção aplicada, commit, evidência)."
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={updateMutation.isPending || resolutionNotes.trim().length === 0}
                  onClick={() => {
                    updateMutation.mutate({ resolution_notes: resolutionNotes.trim() });
                    setResolutionNotes("");
                  }}
                >
                  Salvar notas de resolução
                </Button>
              </div>
              {updateMutation.isPending && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Identificação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoField label="ID interno" value={issue.id} mono />
              <InfoField label="Criado por" value={profileName(issue.createdByProfile)} />
              <InfoField label="Criado em" value={format(new Date(issue.created_at), "dd/MM/yyyy HH:mm:ss")} />
              <InfoField label="Atualizado em" value={format(new Date(issue.updated_at), "dd/MM/yyyy HH:mm:ss")} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
