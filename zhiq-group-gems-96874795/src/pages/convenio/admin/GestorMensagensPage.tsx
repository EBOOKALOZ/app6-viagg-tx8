/**
 * /convenio-admin/mensagens — Comando Convênio Fase 1.
 * CRUD real de mensagens internas (Gestor ↔ entidades credenciadas).
 */
import { useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { GestorQueryState } from "@/components/convenio/GestorQueryState";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useConvenioEntitiesForPicker } from "@/hooks/convenio/useConvenioEntities";
import { useConvenioMessages, useMarkConvenioMessageRead, useSendConvenioMessage } from "@/hooks/convenio/useConvenioMessages";

function SendMessageDialog() {
  const [open, setOpen] = useState(false);
  const [entityId, setEntityId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const entitiesQuery = useConvenioEntitiesForPicker();
  const sendMutation = useSendConvenioMessage();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMutation.mutate(
      { entity_id: entityId || null, subject: subject || null, body },
      {
        onSuccess: () => {
          setOpen(false);
          setEntityId("");
          setSubject("");
          setBody("");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl">
          <Send className="h-4 w-4" /> Nova Mensagem
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Mensagem</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="message-entity">Entidade destinatária</Label>
            <Select value={entityId} onValueChange={setEntityId}>
              <SelectTrigger id="message-entity">
                <SelectValue placeholder="Selecione uma entidade" />
              </SelectTrigger>
              <SelectContent>
                {(entitiesQuery.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="message-subject">Assunto</Label>
            <Input id="message-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="message-body">Mensagem</Label>
            <Textarea id="message-body" required value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={sendMutation.isPending || !body}>
              {sendMutation.isPending ? "Enviando..." : "Enviar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function GestorMensagensPage() {
  const messagesQuery = useConvenioMessages();
  const markReadMutation = useMarkConvenioMessageRead();

  return (
    <div>
      <GestorPageHeader
        icon={MessageSquare}
        title="Mensagens"
        subtitle="Comunicação com entidades credenciadas e parceiros"
        action={<SendMessageDialog />}
      />

      <GestorQueryState
        isLoading={messagesQuery.isLoading}
        isError={messagesQuery.isError}
        error={messagesQuery.error}
        onRetry={() => messagesQuery.refetch()}
        skeleton={
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        }
      >
      {(messagesQuery.data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
          <MessageSquare className="mx-auto mb-3 h-8 w-8 text-white/20" />
          <p className="text-sm text-white/40">Nenhuma mensagem ainda.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(messagesQuery.data ?? []).map((m) => (
            <button
              key={m.id}
              onClick={() => !m.is_read && markReadMutation.mutate(m.id)}
              className="flex w-full flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition-colors hover:bg-white/[0.06]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white">{m.subject || "(sem assunto)"}</span>
                {!m.is_read && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-400" />}
              </div>
              <p className="text-xs text-white/50">{m.entity_name ?? "Destinatário não identificado"}</p>
              <p className="text-sm text-white/70">{m.body}</p>
              <span className="text-[11px] text-white/30">{new Date(m.created_at).toLocaleString("pt-BR")}</span>
            </button>
          ))}
        </div>
      )}
      </GestorQueryState>
    </div>
  );
}
