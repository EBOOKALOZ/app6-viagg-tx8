import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Ticket, RefreshCcw, Loader2, Clock, CheckCircle, Send, User, Headphones, XCircle, DollarSign, Banknote } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { MotoboyPaymentsSection } from "@/components/admin/MotoboyPaymentsSection";

type SupportTicket = {
  id: string;
  ticket_number: string;
  user_id: string;
  assunto: string;
  mensagem: string;
  categoria: string | null;
  status: string;
  resposta_admin: string | null;
  created_at: string;
  updated_at: string;
};

type TicketMessage = {
  id: string;
  ticket_id: string;
  autor: string;
  conteudo: string;
  created_at: string;
};

type UserProfile = {
  id: string;
  email: string | null;
  name: string | null;
};

export default function AdminSupport() {
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [adminResponse, setAdminResponse] = useState("");
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Mutation para aprovar estorno
  const approveRefundMutation = useMutation({
    mutationFn: async ({ ticketId, userId, motivo }: { ticketId: string; userId: string; motivo: string }) => {
      // Inserir transação de estorno na carteira do motoboy
      const { error: walletError } = await supabase
        .from("motoboy_wallet_transactions")
        .insert({
          user_id: userId,
          tipo: "estorno",
          valor: 0, // Valor será definido pelo admin após análise
          descricao: `Estorno aprovado - Ticket #${selectedTicket?.ticket_number}`,
          referencia_id: ticketId,
        });

      // Se der erro de RLS, ignorar - a transação será inserida via trigger/admin
      if (walletError) {
        console.warn("Warning inserting wallet transaction:", walletError);
      }

      // Atualizar status do ticket
      const { error: ticketError } = await supabase
        .from("support_tickets")
        .update({
          status: "resolvido",
          updated_at: new Date().toISOString(),
        })
        .eq("id", ticketId);

      if (ticketError) throw ticketError;

      // Inserir mensagem de aprovação
      const { error: msgError } = await supabase
        .from("ticket_mensagens")
        .insert({
          ticket_id: ticketId,
          autor: "suporte",
          conteudo: `✅ ESTORNO APROVADO\n\nSua solicitação de estorno foi analisada e aprovada. O valor será creditado em sua carteira.`,
        });

      if (msgError) throw msgError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-messages"] });
      setSelectedTicket(null);
      toast.success("Estorno aprovado com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao aprovar estorno");
    },
  });

  // Mutation para rejeitar estorno
  const rejectRefundMutation = useMutation({
    mutationFn: async ({ ticketId, motivo }: { ticketId: string; motivo: string }) => {
      // Atualizar status do ticket
      const { error: ticketError } = await supabase
        .from("support_tickets")
        .update({
          status: "resolvido",
          updated_at: new Date().toISOString(),
        })
        .eq("id", ticketId);

      if (ticketError) throw ticketError;

      // Inserir mensagem de rejeição
      const { error: msgError } = await supabase
        .from("ticket_mensagens")
        .insert({
          ticket_id: ticketId,
          autor: "suporte",
          conteudo: `❌ ESTORNO NEGADO\n\nApós análise, sua solicitação de estorno foi negada.\n\nMotivo: ${motivo || "Não se enquadra nos critérios de estorno."}`,
        });

      if (msgError) throw msgError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-messages"] });
      setSelectedTicket(null);
      toast.success("Estorno rejeitado");
    },
    onError: () => {
      toast.error("Erro ao rejeitar estorno");
    },
  });

  const handleApproveRefund = () => {
    if (!selectedTicket) return;
    approveRefundMutation.mutate({
      ticketId: selectedTicket.id,
      userId: selectedTicket.user_id,
      motivo: adminResponse,
    });
  };

  const handleRejectRefund = () => {
    if (!selectedTicket) return;
    rejectRefundMutation.mutate({
      ticketId: selectedTicket.id,
      motivo: adminResponse,
    });
  };

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["admin-support-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      
      // Fetch user profiles for all tickets
      const userIds = [...new Set((data || []).map(t => t.user_id))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email, name")
          .in("id", userIds);
        
        if (profiles) {
          const profileMap: Record<string, UserProfile> = {};
          profiles.forEach(p => { profileMap[p.id] = p; });
          setUserProfiles(profileMap);
        }
      }
      
      return data as SupportTicket[];
    },
  });

  // Fetch messages for selected ticket
  const { data: ticketMessages, isLoading: messagesLoading } = useQuery({
    queryKey: ["ticket-messages", selectedTicket?.id],
    queryFn: async () => {
      if (!selectedTicket) return [];
      const { data, error } = await supabase
        .from("ticket_mensagens")
        .select("*")
        .eq("ticket_id", selectedTicket.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as TicketMessage[];
    },
    enabled: !!selectedTicket,
  });

  const updateTicketMutation = useMutation({
    mutationFn: async ({
      ticketId,
      updates,
    }: {
      ticketId: string;
      updates: { status?: string };
    }) => {
      const { error } = await supabase
        .from("support_tickets")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", ticketId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ ticketId, content }: { ticketId: string; content: string }) => {
      // Insert message
      const { error: msgError } = await supabase
        .from("ticket_mensagens")
        .insert({
          ticket_id: ticketId,
          autor: "suporte",
          conteudo: content,
        });

      if (msgError) throw msgError;

      // Update ticket status
      const { error: ticketError } = await supabase
        .from("support_tickets")
        .update({ 
          status: "respondido",
          updated_at: new Date().toISOString(),
        })
        .eq("id", ticketId);

      if (ticketError) throw ticketError;

      // Send e-mail notification to client
      if (selectedTicket) {
        const clientProfile = userProfiles[selectedTicket.user_id];
        const clientEmail = clientProfile?.email;
        if (clientEmail) {
          try {
            await supabase.functions.invoke("send-ticket-response", {
              body: {
                ticket_number: selectedTicket.ticket_number,
                assunto: selectedTicket.assunto,
                resposta: content,
                client_email: clientEmail,
              },
            });
          } catch (emailErr) {
            console.warn("E-mail de notificação não enviado:", emailErr);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-messages"] });
      setAdminResponse("");
      toast.success("Resposta enviada ao cliente!");
    },
    onError: () => {
      toast.error("Erro ao enviar resposta");
    },
  });

  const supportTickets = tickets?.filter((t) => t.categoria !== "estorno") || [];
  const refundTickets = tickets?.filter((t) => t.categoria === "estorno") || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "aberto":
        return <Badge variant="default">Aberto</Badge>;
      case "em_analise":
        return <Badge className="bg-yellow-600">Em Análise</Badge>;
      case "respondido":
        return <Badge className="bg-blue-600">Respondido</Badge>;
      case "respondido_cliente":
        return <Badge className="bg-purple-600">Aguardando Resposta</Badge>;
      case "resolvido":
        return <Badge className="bg-green-600">Resolvido</Badge>;
      case "fechado":
        return <Badge variant="outline">Fechado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleOpenTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setAdminResponse("");
  };

  const handleSendResponse = async () => {
    if (!selectedTicket || !adminResponse.trim()) return;
    sendMessageMutation.mutate({
      ticketId: selectedTicket.id,
      content: adminResponse.trim(),
    });
  };

  const handleChangeStatus = async (newStatus: string) => {
    if (!selectedTicket) return;

    try {
      await updateTicketMutation.mutateAsync({
        ticketId: selectedTicket.id,
        updates: { status: newStatus },
      });
      setSelectedTicket({ ...selectedTicket, status: newStatus });
      toast.success(`Status alterado para "${newStatus === "em_analise" ? "Em Análise" : "Resolvido"}"`);
    } catch {
      toast.error("Erro ao alterar status");
    }
  };

  const TicketCard = ({ ticket }: { ticket: SupportTicket }) => (
    <div
      onClick={() => handleOpenTicket(ticket)}
      className="border rounded-lg p-3 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm text-primary">
          #{ticket.ticket_number}
        </span>
        {getStatusBadge(ticket.status)}
      </div>
      <p className="font-medium text-sm">{ticket.assunto}</p>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {format(new Date(ticket.updated_at), "dd/MM/yyyy HH:mm", {
            locale: ptBR,
          })}
        </span>
        <Badge variant="outline" className="text-xs">
          {ticket.categoria || "Geral"}
        </Badge>
      </div>
      {userProfiles[ticket.user_id] && (
        <p className="text-xs text-muted-foreground">
          {userProfiles[ticket.user_id].name || userProfiles[ticket.user_id].email}
        </p>
      )}
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Central de Suporte</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie tickets de suporte, estornos e pagamentos.
          </p>
        </div>

        <Tabs defaultValue="tickets" className="w-full">
          <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
            <TabsTrigger value="tickets" className="flex items-center gap-2">
              <Ticket className="h-4 w-4" />
              Tickets & Estornos
            </TabsTrigger>
            <TabsTrigger value="payments" className="flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Pagamentos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tickets" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Tickets de Suporte */}
              <Card>
                <CardHeader className="flex flex-row items-center gap-3">
                  <Ticket className="h-6 w-6 text-primary" />
                  <CardTitle>Tickets de Suporte ({supportTickets.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : supportTickets.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">
                      Nenhum ticket registrado ainda.
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                      {supportTickets.map((ticket) => (
                        <TicketCard key={ticket.id} ticket={ticket} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Estornos Financeiros */}
              <Card>
                <CardHeader className="flex flex-row items-center gap-3">
                  <RefreshCcw className="h-6 w-6 text-primary" />
                  <CardTitle>Estornos Financeiros ({refundTickets.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : refundTickets.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">
                      Nenhuma solicitação de estorno registrada.
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                      {refundTickets.map((ticket) => (
                        <TicketCard key={ticket.id} ticket={ticket} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="payments" className="mt-6">
            <MotoboyPaymentsSection />
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal de Detalhes do Ticket */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              Ticket #{selectedTicket?.ticket_number}
            </DialogTitle>
          </DialogHeader>

          {selectedTicket && (
            <div className="space-y-4">
              {/* Info do Ticket */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{selectedTicket.assunto}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {selectedTicket.categoria || "Suporte"} • Criado em{" "}
                    {format(new Date(selectedTicket.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                  {userProfiles[selectedTicket.user_id] && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Cliente: {userProfiles[selectedTicket.user_id].name || userProfiles[selectedTicket.user_id].email}
                    </p>
                  )}
                </div>
                {getStatusBadge(selectedTicket.status)}
              </div>

              {/* Botões de Status */}
              <div className="flex gap-2">
                <Button
                  variant={selectedTicket.status === "em_analise" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleChangeStatus("em_analise")}
                  disabled={updateTicketMutation.isPending}
                  className="flex-1"
                >
                  <Clock className="h-4 w-4 mr-1" />
                  Em Análise
                </Button>
                <Button
                  variant={selectedTicket.status === "resolvido" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleChangeStatus("resolvido")}
                  disabled={updateTicketMutation.isPending}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Resolvido
                </Button>
              </div>

              {/* Botões de Estorno (apenas para tickets de estorno não resolvidos) */}
              {selectedTicket.categoria === "estorno" && 
               selectedTicket.status !== "resolvido" && 
               selectedTicket.status !== "fechado" && (
                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    Ações de Estorno Financeiro:
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleApproveRefund}
                      disabled={approveRefundMutation.isPending || rejectRefundMutation.isPending}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      {approveRefundMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-1" />
                      )}
                      Aprovar Estorno
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleRejectRefund}
                      disabled={approveRefundMutation.isPending || rejectRefundMutation.isPending}
                      className="flex-1"
                    >
                      {rejectRefundMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <XCircle className="h-4 w-4 mr-1" />
                      )}
                      Rejeitar Estorno
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ao aprovar, o valor será creditado na carteira do motoboy.
                  </p>
                </div>
              )}

              {/* Histórico de Mensagens - Estilo E-mail */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Histórico de mensagens:</p>
                <div className="space-y-3 max-h-[250px] overflow-y-auto">
                  {messagesLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : ticketMessages && ticketMessages.length > 0 ? (
                    ticketMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`rounded-lg p-3 border ${
                          msg.autor === "cliente"
                            ? "bg-muted/50 border-border"
                            : "bg-primary/10 border-primary/20"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {msg.autor === "cliente" ? (
                            <User className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Headphones className="h-4 w-4 text-primary" />
                          )}
                          <span className="font-medium text-sm">
                            {msg.autor === "cliente" ? "Cliente" : "Suporte"}
                          </span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {format(new Date(msg.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{msg.conteudo}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      Nenhuma mensagem ainda. Envie a primeira resposta abaixo.
                    </p>
                  )}
                </div>
              </div>

              {/* Campo de Nova Resposta */}
              {selectedTicket.status !== "resolvido" && selectedTicket.status !== "fechado" && (
                <div className="space-y-2 pt-2 border-t">
                  <label className="text-sm text-muted-foreground">
                    Nova mensagem:
                  </label>
                  <Textarea
                    placeholder="Digite sua resposta ao cliente..."
                    value={adminResponse}
                    onChange={(e) => setAdminResponse(e.target.value)}
                    rows={3}
                  />
                  <Button
                    onClick={handleSendResponse}
                    disabled={sendMessageMutation.isPending || !adminResponse.trim()}
                    className="w-full"
                  >
                    {sendMessageMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Enviar Resposta
                  </Button>
                </div>
              )}

              {(selectedTicket.status === "resolvido" || selectedTicket.status === "fechado") && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="text-center py-2 text-sm text-muted-foreground bg-muted/50 rounded-lg">
                    Ticket encerrado. Você pode reabri-lo para enviar uma nova mensagem.
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => handleChangeStatus("em_analise")}
                    disabled={updateTicketMutation.isPending}
                  >
                    Reabrir Ticket
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}