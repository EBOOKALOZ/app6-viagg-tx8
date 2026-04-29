import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

import {
    Loader2, ArrowLeft, Send, Paperclip, User, Headphones,
    Clock, CheckCircle, Ticket, Calendar, Phone, Mail, XCircle,
    Wand2, Check, Copy, RefreshCw, AlertTriangle
} from 'lucide-react';
import { STATUS_COLORS } from './AdminSupportTicketsPage';

type TicketMessage = {
    id: string;
    ticket_id: string;
    autor: string;
    conteudo: string;
    attachment_url?: string;
    is_ai?: boolean;
    created_at: string;
};

type AiSuggestion = {
    reply: string;
    confidence: number;
    category: string;
    profile: string;
    priority?: string;
};

export default function AdminTicketDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const scrollRef = useRef<HTMLDivElement>(null);

    const [newMessage, setNewMessage] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [aiSuggestion, setAiSuggestion] = useState<{
        reply: string;
        confidence: number;
        category: string;
        profile: string;
        priority?: string;
    } | null>(null);

    // 1. Fetch Ticket Data
    const { data: ticket, isLoading: ticketLoading } = useQuery({
        queryKey: ['admin-ticket', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('support_tickets')
                .select(`*`)
                .eq('id', id)
                .single();
            if (error) throw error;

            // Fetch User separately
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', data.user_id)
                .single();

            // Fetch Motoboy Profile
            const { data: motoboyProfile } = await supabase
                .from('motoboy_profiles')
                .select('*')
                .eq('user_id', data.user_id)
                .maybeSingle();

            let finalUser = profile || {};

            if (motoboyProfile) {
                finalUser = {
                    ...finalUser,
                    id: motoboyProfile.user_id,
                    user_type: 'motoboy',
                    phone: motoboyProfile.whatsapp || finalUser.phone
                }
            }

            return { ...data, user: finalUser };
        },
        enabled: !!id
    });

    // 2. Fetch Messages
    const { data: messages, isLoading: messagesLoading } = useQuery({
        queryKey: ['admin-ticket-messages', id],
        queryFn: async () => {
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

        console.log("Subscribing to realtime messages for ticket:", id);
        const channel = supabase
            .channel(`admin-ticket-${id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${id}` },
                (payload) => {
                    console.log("New message via Realtime!", payload);
                    queryClient.invalidateQueries({ queryKey: ['admin-ticket-messages', id] });
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${id}` },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['admin-ticket', id] });
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
                    autor: 'admin',
                });
            if (msgError) throw msgError;

            const { error: ticketError } = await supabase
                .from('support_tickets')
                .update({
                    status: 'respondido',
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);
            if (ticketError) throw ticketError;
        },
        onSuccess: () => {
            setNewMessage('');
            queryClient.invalidateQueries({ queryKey: ['admin-ticket-messages', id] });
            queryClient.invalidateQueries({ queryKey: ['admin-ticket', id] });
            toast.success("Mensagem enviada!");
        },
        onError: (e: any) => {
            toast.error("Erro ao enviar resposta: " + e.message);
        }
    });

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !id || !ticket?.user_id) return;

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
            const filePath = `${ticket.user_id}/${id}/chat_${Date.now()}_${fileName}`;

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

            sendMessageMutation.mutate(`📎 Anexo recebido da equipe: ${file.name}\n${data.publicUrl}`);

        } catch (error: any) {
            toast.error("Erro ao enviar o anexo: " + error.message);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const updateStatusMutation = useMutation({
        mutationFn: async (status: string) => {
            if (!id) return;
            const { error } = await supabase
                .from('support_tickets')
                .update({ status, updated_at: new Date().toISOString() })
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: (_, status) => {
            queryClient.invalidateQueries({ queryKey: ['admin-ticket', id] });
            toast.success(`Status alterado para ${status}`);
        }
    });

    const generateAiSuggestionMutation = useMutation({
        mutationFn: async () => {
            if (!ticket) return null;
            const { data, error } = await supabase.functions.invoke('support-ai', {
                body: { ticket_id: ticket.id, action: 'suggest' }
            });
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            if (data?.reply) {
                setAiSuggestion({
                    reply: data.reply,
                    confidence: data.confidence || 0.85,
                    category: data.category || 'Geral',
                    profile: data.profile_type || ticket?.user?.profile_type || 'Usuário',
                    priority: data.priority || 'Normal'
                });

                // User requirement: auto-fill the admin response input
                setNewMessage(data.reply);

                toast.success('Sugestão de resposta gerada pela IA');
            } else {
                toast.error('A IA não retornou resposta');
            }
        },
        onError: (error: any) => {
            console.error('Erro conexão IA:', error);
            toast.error(`Erro ao conectar com a IA: ${error.message || 'Desconhecido'}`);
        }
    });

    const handleCopyAiSuggestion = () => {
        if (aiSuggestion) {
            navigator.clipboard.writeText(aiSuggestion.reply);
            toast.success('Resposta copiada para a área de transferência!');
        }
    };

    const handleUseAiSuggestion = () => {
        if (aiSuggestion) {
            setNewMessage(aiSuggestion.reply);
            toast.success('Resposta inserida no campo de texto.');
        }
    };

    if (ticketLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!ticket) {
        return (
            <div className="flex flex-col h-full items-center justify-center gap-4">
                <XCircle className="h-12 w-12 text-destructive" />
                <h2 className="text-xl font-bold">Ticket não encontrado</h2>
                <Button onClick={() => navigate('/admin/support/tickets')}>Voltar para Lista</Button>
            </div>
        );
    }

    const isClosed = ticket.status === 'resolvido' || ticket.status === 'fechado';

    return (
        <div className="h-[calc(100vh-8rem)] max-h-screen flex flex-col pt-2 animate-fade-in">
            <div className="mb-4 flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={() => navigate('/admin/support')}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-3">
                        Ticket #{ticket.ticket_number}
                        <Badge className={`${STATUS_COLORS[ticket.status] || 'bg-gray-500'} text-white border-0`}>
                            {ticket.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                    </h1>
                    <p className="text-muted-foreground text-sm truncate max-w-lg">{ticket.assunto}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 flex-1 min-h-0">

                {/* Left/Center Panel: Chat Interface (Spans 2 cols if open, 3 if closed) */}
                <div className={`flex flex-col h-full bg-card border rounded-lg overflow-hidden shadow-sm ${!isClosed ? 'md:col-span-2' : 'md:col-span-3'}`}>
                    {/* Chat Headers */}
                    <div className="bg-muted/30 border-b p-4 flex items-center justify-between">
                        <h2 className="font-semibold flex items-center gap-2">
                            <Headphones className="h-5 w-5 text-primary" />
                            Conversa do Ticket
                        </h2>
                    </div>

                    {ticket.ai_status === 'escalated' && !isClosed && (
                        <div className="bg-yellow-100 text-yellow-800 text-xs px-4 py-2 m-4 rounded-md text-center border border-yellow-200 shadow-sm animate-in fade-in">
                            Atenção Equipe: Este atendimento foi encaminhado automaticamente pela IA para análise humana.
                        </div>
                    )}

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                        {messagesLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : messages?.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                                <p>Nenhuma mensagem trocada ainda.</p>
                            </div>
                        ) : (
                            messages?.map((msg, idx) => {
                                const isAdmin = msg.autor !== ticket?.user_id && msg.autor !== 'cliente';
                                const showAvatar = idx === 0 || messages[idx - 1].autor !== msg.autor;

                                return (
                                    <div key={msg.id} className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'} max-w-full`}>
                                        <div className={`flex gap-3 max-w-[85%] ${isAdmin ? 'flex-row-reverse' : 'flex-row'}`}>

                                            {/* Avatar */}
                                            <div className="shrink-0 pt-1">
                                                {showAvatar ? (
                                                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${isAdmin ? msg.is_ai ? 'bg-purple-600 text-white' : 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                                        {isAdmin ? msg.is_ai ? <span className="text-[10px] font-bold">IA</span> : <Headphones className="h-4 w-4" /> : <User className="h-4 w-4" />}
                                                    </div>
                                                ) : <div className="h-8 w-8" />}
                                            </div>

                                            {/* Bubble */}
                                            <div className="flex flex-col gap-1 min-w-0">
                                                {showAvatar && (
                                                    <span className={`text-[11px] font-semibold text-muted-foreground ${isAdmin ? 'text-right hidden' : 'text-left'}`}>
                                                        {isAdmin ? msg.is_ai ? 'Assistente IA' : 'Equipe Viagg-TX8' : ticket.user?.name || 'Cliente'}
                                                    </span>
                                                )}
                                                <div
                                                    className={`p-3 rounded-2xl text-sm whitespace-pre-wrap break-words ${isAdmin
                                                        ? msg.is_ai
                                                            ? 'bg-purple-50 text-purple-900 border border-purple-100 rounded-tr-sm'
                                                            : 'bg-primary text-primary-foreground rounded-tr-sm'
                                                        : 'bg-muted border border-border/50 rounded-tl-sm'
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
                                                                    <a href={line} target="_blank" rel="noopener noreferrer" className="font-semibold underline break-all">
                                                                        {line}
                                                                    </a>
                                                                ) : line}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <span className={`text-[10px] text-muted-foreground ${isAdmin ? 'text-right' : 'text-left'}`}>
                                                    {format(new Date(msg.created_at), "HH:mm")}
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
                                    <span className="text-xs font-medium uppercase tracking-widest px-2">Ticket Encerrado</span>
                                    <Separator className="flex-1" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Reply Area Bottom */}
                    <div className="bg-muted/10 border-t p-4">
                        {isClosed ? (
                            <div className="text-center p-3 text-sm text-muted-foreground">
                                Este ticket foi encerrado. Para continuar o atendimento, reabra o ticket no painel ao lado.
                            </div>
                        ) : (
                            <div className="relative mt-2">
                                {aiSuggestion && newMessage === aiSuggestion.reply && newMessage.trim() !== '' && (
                                    <div className="absolute -top-3 left-4 bg-purple-100 text-purple-800 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full flex items-center gap-1 z-10 border border-purple-200 shadow-sm animate-in fade-in slide-in-from-bottom-1">
                                        <Wand2 className="h-3 w-3" /> Sugestão da IA
                                    </div>
                                )}
                                <Textarea
                                    placeholder="Escreva sua resposta para o cliente..."
                                    className="min-h-[100px] resize-none pr-12 pb-12 bg-background border-muted"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            if (newMessage.trim()) sendMessageMutation.mutate(newMessage.trim());
                                        }
                                    }}
                                />

                                <div className="absolute bottom-3 left-3 flex items-center gap-2">
                                    <input
                                        type="file"
                                        className="hidden"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        accept="image/jpeg,image/png,image/webp,application/pdf"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploading || sendMessageMutation.isPending}
                                    >
                                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                                    </Button>
                                    <span className="text-[10px] text-muted-foreground hidden sm:inline">Enviar imagem/PDF PDF</span>
                                </div>

                                <div className="absolute bottom-3 right-3">
                                    <Button
                                        size="sm"
                                        className="gap-2"
                                        disabled={!newMessage.trim() || sendMessageMutation.isPending}
                                        onClick={() => sendMessageMutation.mutate(newMessage.trim())}
                                    >
                                        {sendMessageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        Enviar
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* AI Assistant Right Panel (1 col) - Only shows if not closed */}
                {!isClosed && (
                    <div className="md:col-span-1 flex flex-col h-full gap-4">
                        <div className="bg-card border rounded-lg shadow-sm flex flex-col h-[calc(100vh-140px)] overflow-hidden sticky top-4">
                            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 border-b flex items-center gap-2 text-white shrink-0">
                                <Wand2 className="h-5 w-5" />
                                <h2 className="font-semibold text-sm">Assistente IA</h2>
                            </div>

                            <div className="p-4 flex flex-col h-full overflow-y-auto bg-muted/10">
                                {!aiSuggestion ? (
                                    <div className="flex flex-col h-full items-center justify-center text-center space-y-4">
                                        <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center">
                                            <Wand2 className="h-6 w-6 text-purple-600" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-foreground text-sm">Sugestão de Resposta</p>
                                            <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                                                Use a IA para ler o contexto e redigir uma resposta profissional ao cliente.
                                            </p>
                                        </div>
                                        <Button
                                            onClick={() => generateAiSuggestionMutation.mutate()}
                                            disabled={generateAiSuggestionMutation.isPending}
                                            className="bg-purple-600 hover:bg-purple-700 text-white gap-2 w-full mt-2 text-sm h-9"
                                        >
                                            {generateAiSuggestionMutation.isPending ? (
                                                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando...</>
                                            ) : (
                                                <><Wand2 className="h-3.5 w-3.5" /> Gerar Resposta</>
                                            )}
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col h-full space-y-4 animate-in fade-in zoom-in-95 duration-200">
                                        {/* Status row */}
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div className="bg-background border rounded-md p-2 flex flex-col gap-1">
                                                <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Categoria</span>
                                                <span className="font-medium capitalize truncate flex items-center gap-1" title={aiSuggestion.category}>
                                                    {aiSuggestion.category}
                                                </span>
                                            </div>
                                            <div className="bg-background border rounded-md p-2 flex flex-col gap-1">
                                                <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Prioridade</span>
                                                <span className={`font-medium flex items-center gap-1 text-sm ${aiSuggestion.priority?.toLowerCase() === 'alta' ? 'text-red-500' : aiSuggestion.priority?.toLowerCase() === 'média' ? 'text-yellow-500' : 'text-blue-500'}`}>
                                                    <AlertTriangle className="h-3 w-3" /> {aiSuggestion.priority || 'Normal'}
                                                </span>
                                            </div>
                                            <div className="bg-background border rounded-md p-2 flex flex-col gap-1">
                                                <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Confiança</span>
                                                <span className="font-medium text-green-600 flex items-center gap-1 text-sm">
                                                    <Check className="h-3 w-3" /> {(aiSuggestion.confidence * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                        </div>

                                        {/* Reply Box */}
                                        <div className="flex-1 bg-purple-50 border border-purple-100 rounded-lg p-3 text-sm text-purple-900 shadow-inner overflow-y-auto break-words whitespace-pre-wrap">
                                            {aiSuggestion.reply}
                                        </div>

                                        {/* Actions */}
                                        <div className="grid grid-cols-2 gap-2 mt-auto pt-2 shrink-0">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleCopyAiSuggestion}
                                                className="w-full gap-1 border-purple-200 text-purple-700 hover:bg-purple-100"
                                            >
                                                <Copy className="h-3.5 w-3.5" /> Copiar
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => generateAiSuggestionMutation.mutate()}
                                                disabled={generateAiSuggestionMutation.isPending}
                                                className="w-full gap-1 border-purple-200 text-purple-700 hover:bg-purple-100"
                                            >
                                                <RefreshCw className={`h-3.5 w-3.5 ${generateAiSuggestionMutation.isPending ? 'animate-spin' : ''}`} /> Refazer
                                            </Button>
                                            <Button
                                                onClick={handleUseAiSuggestion}
                                                className="col-span-2 w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                                            >
                                                <Check className="h-4 w-4" /> Usar esta resposta
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Right Panel: Admin Info & Actions */}
                <div className="flex flex-col gap-4">
                    <Card className="shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm">Detalhes do Solicitante</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                    {(ticket.user?.name || "C")[0].toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-semibold text-sm">{ticket.user?.name || "Cliente sem Nome"}</p>
                                    <p className="text-xs text-muted-foreground capitalize">
                                        {ticket.user?.user_type === 'merchant' ? 'Lojista' :
                                            ticket.user?.user_type === 'motoboy' ? 'Motoboy' :
                                                ticket.user?.user_type === 'passenger' ? 'Passageiro' :
                                                    ticket.user?.user_type === 'admin' ? 'Administrador' :
                                                        ticket.user?.user_type || 'Cliente'}
                                    </p>
                                </div>
                            </div>

                            <Separator />

                            <div className="space-y-3 text-sm">
                                <div className="flex items-center gap-3 text-muted-foreground">
                                    <Mail className="h-4 w-4" />
                                    <span className="truncate">{ticket.user?.email || "Sem e-mail"}</span>
                                </div>
                                <div className="flex items-center gap-3 text-muted-foreground">
                                    <Phone className="h-4 w-4" />
                                    <span>{ticket.user?.phone || "Sem telefone"}</span>
                                </div>
                                <div className="flex items-center gap-3 text-muted-foreground">
                                    <Calendar className="h-4 w-4" />
                                    <span>Membro desde {ticket.user?.created_at ? format(new Date(ticket.user.created_at), "MMM/yyyy", { locale: ptBR }) : "Desconhecido"}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm">Ações do Ticket</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="flex justify-between items-center text-sm mb-4">
                                <span className="text-muted-foreground">Abertura:</span>
                                <span className="font-medium">{format(new Date(ticket.created_at), "dd/MM/yyyy")}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm mb-4">
                                <span className="text-muted-foreground">Categoria:</span>
                                <Badge variant="secondary" className="capitalize">{ticket.categoria || 'Geral'}</Badge>
                            </div>

                            <Separator className="my-4" />

                            {!isClosed ? (
                                <>
                                    <Button
                                        variant="default"
                                        className="w-full justify-start gap-2 bg-green-600 hover:bg-green-700"
                                        onClick={() => updateStatusMutation.mutate('resolvido')}
                                        disabled={updateStatusMutation.isPending}
                                    >
                                        <CheckCircle className="h-4 w-4" />
                                        Marcar como Resolvido
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="w-full justify-start gap-2"
                                        onClick={() => updateStatusMutation.mutate('em_analise')}
                                        disabled={updateStatusMutation.isPending || ticket.status === 'em_analise'}
                                    >
                                        <Clock className="h-4 w-4" />
                                        Em Atendimento
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => updateStatusMutation.mutate('fechado')}
                                        disabled={updateStatusMutation.isPending}
                                    >
                                        <XCircle className="h-4 w-4" />
                                        Encerrar Sem Sucesso
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    variant="outline"
                                    className="w-full justify-start gap-2 border-primary text-primary hover:bg-primary/10"
                                    onClick={() => updateStatusMutation.mutate('aberto')}
                                    disabled={updateStatusMutation.isPending}
                                >
                                    <Ticket className="h-4 w-4" />
                                    Reabrir Ticket
                                </Button>
                            )}

                        </CardContent>
                    </Card>
                </div>

            </div>
        </div>
    );
}
