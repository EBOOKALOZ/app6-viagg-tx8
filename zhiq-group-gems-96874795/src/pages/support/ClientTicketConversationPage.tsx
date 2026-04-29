import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import MotoboyBottomNav from '@/components/motoboy/MotoboyBottomNav';
import { Separator } from '@/components/ui/separator';

import {
    Loader2, ArrowLeft, Send, Paperclip,
    Headphones, Ticket, XCircle
} from 'lucide-react';
import { STATUS_COLORS, STATUS_LABELS } from './ClientSupportTicketsPage';

type TicketMessage = {
    id: string;
    ticket_id: string;
    autor: string;
    conteudo: string;
    attachment_url?: string;
    is_ai?: boolean;
    created_at: string;
};

export default function ClientTicketConversationPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user, activeProfile } = useAuth();
    const isMotoboy = activeProfile === 'motoboy' || activeProfile === 'mototaxi';
    const queryClient = useQueryClient();
    const scrollRef = useRef<HTMLDivElement>(null);

    const [newMessage, setNewMessage] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 1. Fetch Ticket Data (Make sure it belongs to this user)
    const { data: ticket, isLoading: ticketLoading, isError } = useQuery({
        queryKey: ['client-ticket', id, user?.id],
        queryFn: async () => {
            if (!id || !user?.id) throw new Error("Missing ID");
            const { data, error } = await supabase
                .from('support_tickets')
                .select(`*`)
                .eq('id', id)
                .eq('user_id', user.id) // Security enforcement
                .single();

            if (error) throw error;
            return data;
        },
        enabled: !!id && !!user?.id,
        retry: false
    });

    // 2. Fetch Messages
    const { data: messages, isLoading: messagesLoading } = useQuery({
        queryKey: ['client-ticket-messages', id],
        queryFn: async () => {
            if (!id) return [];
            const { data, error } = await supabase
                .from('ticket_messages')
                .select('*')
                .eq('ticket_id', id)
                .order('created_at', { ascending: true });

            if (error) throw error;
            return data as TicketMessage[];
        },
        enabled: !!id
    });

    // Auto-scroll to bottom of chat
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Realtime Subscription
    useEffect(() => {
        if (!id) return;

        const channel = supabase
            .channel(`client-ticket-${id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${id}` },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['client-ticket-messages', id] });
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${id}` },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['client-ticket', id] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [id, queryClient]);

    // Mutations
    const sendMessageMutation = useMutation({
        mutationFn: async (content: string) => {
            if (!id) throw new Error("No ticket ID");

            const { error: msgError } = await supabase
                .from('ticket_messages')
                .insert({
                    ticket_id: id,
                    conteudo: content,
                    autor: user?.id || 'cliente',
                });
            if (msgError) throw msgError;

            const { error: ticketError } = await supabase
                .from('support_tickets')
                .update({
                    status: 'respondido_cliente',
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);
            if (ticketError) throw ticketError;
        },
        onSuccess: () => {
            setNewMessage('');
            queryClient.invalidateQueries({ queryKey: ['client-ticket-messages', id] });
            queryClient.invalidateQueries({ queryKey: ['client-ticket', id] });

            // Invoke AI Edge Function after client replies
            supabase.functions.invoke('support-ai', {
                body: { ticket_id: id }
            }).catch(error => {
                console.error('Erro ao chamar a IA:', error);
            });
        },
        onError: (e: any) => {
            toast.error("Erro ao enviar mensagem: " + e.message);
        }
    });

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !id || !user) return;

        const validTypes = ['image/jpeg', 'image/png', 'application/pdf', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            toast.error("Apenas imagens e PDF são permitidos.");
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            toast.error("Arquivo muito grande. Limite é de 10MB.");
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        setIsUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
            const filePath = `${user.id}/${id}/chat_${Date.now()}_${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('support-files')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('support-files').getPublicUrl(filePath);

            // Salvar metadados do anexo
            await supabase.from('ticket_anexos').insert({
                ticket_id: id,
                file_path: filePath,
                file_name: file.name,
                file_type: file.type,
            });

            // Enviar mensagem avisando o anexo e colocando o link clicavel
            sendMessageMutation.mutate(`📎 Anexo enviado: ${file.name}\n${data.publicUrl}`);

        } catch (error: any) {
            toast.error("Erro ao enviar o anexo: " + error.message);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Client Mutation for Status
    const updateStatusMutation = useMutation({
        mutationFn: async ({ status }: { status: string }) => {
            if (!id) return;
            const { error } = await supabase
                .from('support_tickets')
                .update({ status })
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['client-ticket', id] });
            toast.success('Status do ticket atualizado com sucesso!');
        },
        onError: () => {
            toast.error('Erro ao atualizar status');
        }
    });

    if (ticketLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (isError || !ticket) {
        return (
            <div className="flex flex-col h-screen items-center justify-center gap-4 bg-background">
                <XCircle className="h-16 w-16 text-destructive" />
                <h2 className="text-xl font-bold">Ticket não encontrado</h2>
                <p className="text-muted-foreground">Este ticket não existe ou não pertence a você.</p>
                <Button onClick={() => navigate(isMotoboy ? '/motoboy/support' : '/suporte')}>Voltar para Meus Chamados</Button>
            </div>
        );
    }

    const isClosed = ticket.status === 'resolvido' || ticket.status === 'fechado';

    return (
        <div className="flex flex-col h-screen bg-muted/20">
            {/* Mobile Header (Fixed) */}
            <div className="fixed top-0 left-0 right-0 h-16 bg-[#FF6A00] text-white border-b-0 z-50 flex items-center px-4 gap-3 shadow-sm">
                <Button variant="outline" size="sm" onClick={() => navigate(isMotoboy ? '/motoboy/support' : '/suporte')} className="gap-2 shrink-0 bg-transparent text-white border-white/20 hover:bg-white/10 hover:text-white">
                    <ArrowLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Voltar</span>
                </Button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h1 className="font-bold text-[15px] truncate">Ticket #{ticket.ticket_number}</h1>
                        <Badge className={`${STATUS_COLORS[ticket.status || 'aberto'] || 'bg-gray-500'} text-white border border-white/30 text-[9px] px-1.5 py-0`}>
                            {STATUS_LABELS[ticket.status || 'aberto'] || (ticket.status || 'aberto').replace('_', ' ').toUpperCase()}
                        </Badge>
                    </div>
                    <p className="text-xs text-white/80 truncate">{ticket.assunto}</p>
                </div>
            </div>

            {/* Main Chat Area */}
            <div className={`flex-1 overflow-y-auto pt-20 px-4 space-y-4 ${isMotoboy ? 'pb-36' : 'pb-28'}`} ref={scrollRef}>
                <div className="flex justify-center mb-6">
                    <div className="bg-muted px-4 py-1.5 rounded-full text-xs font-semibold text-muted-foreground flex items-center gap-2">
                        <Ticket className="h-3.5 w-3.5" />
                        Chamado aberto em {ticket.created_at ? format(new Date(ticket.created_at), "dd/MM/yyyy") : ''}
                    </div>
                </div>

                {ticket.ai_status === 'escalated' && !isClosed && (
                    <div className="bg-yellow-100 text-yellow-800 text-xs px-4 py-2 rounded-md mb-4 text-center border border-yellow-200 shadow-sm animate-in fade-in">
                        Este atendimento foi encaminhado para nossa equipe humana de especialistas.
                    </div>
                )}

                {messagesLoading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    messages?.map((msg, idx) => {
                        const isClient = msg.autor === user?.id || msg.autor === 'cliente';
                        const showAvatar = idx === 0 || messages[idx - 1].autor !== msg.autor;

                        return (
                            <div key={msg.id} className={`flex flex-col ${isClient ? 'items-end' : 'items-start'} w-full animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                                <div className={`flex gap-2 max-w-[85%] ${isClient ? 'flex-row-reverse' : 'flex-row'}`}>

                                    {/* Expert/AI Avatar */}
                                    {!isClient && (
                                        <div className="shrink-0 pt-0.5 mt-auto mb-2">
                                            {showAvatar ? (
                                                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-white shadow-sm ${msg.is_ai ? 'bg-purple-600' : 'bg-[#FF6A00]'}`}>
                                                    {msg.is_ai ? <span className="text-[10px] font-bold">IA</span> : <Headphones className="h-3.5 w-3.5" />}
                                                </div>
                                            ) : <div className="h-7 w-7" />}
                                        </div>
                                    )}

                                    <div className="flex flex-col gap-1 min-w-0">
                                        <div
                                            className={`p-3 text-[14px] whitespace-pre-wrap break-words border relative shadow-sm ${isClient
                                                ? 'bg-muted border-border text-foreground rounded-2xl rounded-tr-md'
                                                : msg.is_ai
                                                    ? 'bg-purple-50 border-purple-100 text-purple-900 rounded-2xl rounded-tl-md'
                                                    : 'bg-[#FF6A00]/10 border-[#FF6A00]/20 text-foreground rounded-2xl rounded-tl-md'
                                                }`}
                                        >
                                            {msg.attachment_url && (
                                                <img
                                                    src={msg.attachment_url}
                                                    alt="Anexo Automático"
                                                    style={{
                                                        maxWidth: "260px",
                                                        borderRadius: "10px",
                                                        marginTop: "8px",
                                                        marginBottom: "8px",
                                                        cursor: "pointer",
                                                        objectFit: "cover"
                                                    }}
                                                    onClick={() => window.open(msg.attachment_url, '_blank')}
                                                />
                                            )}
                                            {(msg.conteudo || '').split('\n').map((line, i) => {
                                                const isImageUrl = line.match(/^https?:\/\/.+/) && line.match(/\.(jpeg|jpg|png|webp|gif)(\?.*)?$/i);
                                                return (
                                                    <div key={i}>
                                                        {isImageUrl ? (
                                                            <img
                                                                src={line}
                                                                alt="Anexo Enviado"
                                                                style={{
                                                                    maxWidth: "260px",
                                                                    borderRadius: "10px",
                                                                    marginTop: "8px",
                                                                    marginBottom: "8px",
                                                                    cursor: "pointer",
                                                                    objectFit: "cover"
                                                                }}
                                                                onClick={() => window.open(line, '_blank')}
                                                            />
                                                        ) : line.match(/^https?:\/\/.+/) ? (
                                                            <a href={line} target="_blank" rel="noopener noreferrer" className="text-[#FF6A00] font-semibold hover:underline break-all">
                                                                {line}
                                                            </a>
                                                        ) : line}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <span className={`text-[10px] text-muted-foreground/70 ${isClient ? 'text-right' : 'text-left'}`}>
                                            {msg.created_at ? format(new Date(msg.created_at), "HH:mm") : ''}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}

                {isClosed && (
                    <div className="my-6">
                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                            <Separator className="flex-1" />
                            <span className="text-xs font-medium uppercase tracking-widest px-2">Suporte Encerrado</span>
                            <Separator className="flex-1" />
                        </div>
                        <p className="text-center text-xs text-muted-foreground mt-2 px-6">
                            Este chamado foi finalizado pela nossa equipe. Caso precise de mais ajuda, por favor abra um novo chamado.
                        </p>
                    </div>
                )}
            </div>

            {/* Client Status Control Card */}
            {ticket && !isClosed && (
                <div className={`fixed left-0 right-0 bg-muted/30 border-t px-4 py-3 z-[30] transition-all shadow-sm flex flex-col items-center
                    ${isMotoboy ? 'bottom-[164px]' : 'bottom-[72px]'}`}>
                    <p className="text-xs text-muted-foreground font-medium mb-2 text-center">
                        Como está o andamento do seu problema?
                    </p>
                    <div className="flex gap-2 justify-center w-full max-w-sm">
                        <Button
                            variant={ticket.status === 'em_analise' ? "default" : "outline"}
                            size="sm"
                            className={`flex-1 text-xs h-8 ${ticket.status === 'em_analise' ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : ''}`}
                            onClick={() => updateStatusMutation.mutate({ status: 'em_analise' })}
                            disabled={updateStatusMutation.isPending}
                        >
                            Em Análise
                        </Button>
                        <Button
                            variant={ticket.status === 'resolvido' ? "default" : "outline"}
                            size="sm"
                            className={`flex-1 text-xs h-8 ${ticket.status === 'resolvido' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
                            onClick={() => updateStatusMutation.mutate({ status: 'resolvido' })}
                            disabled={updateStatusMutation.isPending}
                        >
                            Resolvido
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className={`flex-1 text-xs h-8 hover:bg-zinc-900 hover:text-white`}
                            onClick={() => updateStatusMutation.mutate({ status: 'fechado' })}
                            disabled={updateStatusMutation.isPending}
                        >
                            Finalizar
                        </Button>
                    </div>
                </div>
            )}

            {/* Reply Area Bottom (Fixed) */}
            <div className={`fixed left-0 right-0 bg-card border-t px-4 sm:px-6 py-3 sm:py-4 z-[40] transition-all shadow-[0_-4px_10px_rgba(0,0,0,0.05)] ${isMotoboy ? 'bottom-[92px] pb-[22px]' : 'bottom-0'}`}>
                {isClosed ? (
                    <Button className="w-full h-12" variant="outline" onClick={() => navigate(isMotoboy ? '/motoboy/support/novo' : '/suporte/novo')}>
                        <Ticket className="h-4 w-4 mr-2" /> Abrir Novo Ticket
                    </Button>
                ) : (
                    <div className="relative flex items-center justify-center gap-2 max-w-2xl mx-auto w-full">
                        <input
                            type="file"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                        />
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-12 w-12 rounded-full shrink-0 border-muted-foreground/20 text-muted-foreground hover:bg-muted"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading || sendMessageMutation.isPending}
                        >
                            {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
                        </Button>

                        <Textarea
                            placeholder="Digite sua mensagem..."
                            className="min-h-[48px] max-h-[120px] rounded-3xl resize-none py-3 px-4 bg-muted/50 border-transparent focus-visible:ring-primary/50 text-base"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (newMessage.trim()) sendMessageMutation.mutate(newMessage.trim());
                                }
                            }}
                        />

                        <Button
                            size="icon"
                            className="h-12 w-12 rounded-full shrink-0 transition-transform active:scale-95 shadow-md bg-[#FF6A00] hover:bg-[#E65C00] text-white"
                            disabled={!newMessage.trim() || sendMessageMutation.isPending}
                            onClick={() => sendMessageMutation.mutate(newMessage.trim())}
                        >
                            {sendMessageMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 ml-0.5" />}
                        </Button>
                        <div className="h-6" /> {/* Scroll margin */}
                    </div>
                )}
            </div>

            {isMotoboy && (
                <MotoboyBottomNav />
            )}
        </div>
    );
}
