import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, HelpCircle, Send, Loader2, CheckCircle, Ticket, User, Headphones, UploadCloud, X, FileIcon, ImageIcon } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { getProfileRoute, PROFILE_TYPES } from '@/lib/profileTypes';
import { supabase } from '@/integrations/supabase/client';
import { MotoboyPanelHeader } from '@/components/motoboy/MotoboyPanelHeader';
import { OperationalWeatherCard } from '@/components/motoboy/OperationalWeatherCard';
import MotoboyBottomNav from '@/components/motoboy/MotoboyBottomNav';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLegalContent } from '@/hooks/useLegalContent';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type TicketFormData = {
  assunto: string;
  mensagem: string;
  categoria: string;
  conta: string;
};

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

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

export default function Support() {
  const navigate = useNavigate();
  const { activeProfile, availableProfiles, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Se a pessoa veio de um painel de anunciante (imóveis/veículos/serviços),
  // mostra o visual do Motoboy mesmo que ela TAMBÉM tenha esse perfil ativo —
  // o contexto de onde ela clicou em "Suporte" deve prevalecer.
  const panelContextForChrome = sessionStorage.getItem('viagg_panel_context');
  const cameFromAdvertiserPanel = ['imoveis', 'veiculos', 'servicos'].includes(panelContextForChrome || '');
  const isMotoboy = activeProfile === 'motoboy' && !cameFromAdvertiserPanel;

  const [formData, setFormData] = useState<TicketFormData>({
    assunto: '',
    mensagem: '',
    categoria: 'geral',
    conta: 'geral',
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Contexto do painel de anunciante (veículos/imóveis/lojista) — gravado pelo
  // AdvertiserPanelLayout. Anunciante não é um "profile" tradicional (não entra
  // em availableProfiles), então sem isso a conta dele nunca aparecia aqui.
  const panelContext = sessionStorage.getItem('viagg_panel_context');
  const advertiserContaOption =
    panelContext === 'veiculos' ? { value: 'anunciante_veiculos', label: 'Vendedor de Veículos' }
    : panelContext === 'imoveis' ? { value: 'anunciante_imoveis', label: 'Anunciante de Imóveis' }
    : panelContext === 'servicos' ? { value: 'anunciante_servicos', label: 'Anunciante de Serviços' }
    : panelContext && !PROFILE_TYPES[panelContext] ? { value: 'anunciante', label: 'Lojista / Anunciante' }
    : null;

  // Opções de "conta relacionada" = perfis que o usuário tem cadastrados.
  const contaOptions = useMemo(() => {
    const fromProfiles = (availableProfiles || [])
      .filter((p) => PROFILE_TYPES[p])
      .map((p) => ({ value: p, label: PROFILE_TYPES[p].label }));
    const combined = advertiserContaOption ? [advertiserContaOption, ...fromProfiles] : fromProfiles;
    return combined.length > 0
      ? [...combined, { value: 'outro', label: 'Outra conta' }]
      : [{ value: 'geral', label: 'Geral' }];
  }, [availableProfiles, advertiserContaOption]);

  // Pré-seleciona o perfil que o usuário está usando (ou o painel de anunciante).
  useEffect(() => {
    if (advertiserContaOption) {
      setFormData((prev) => ({ ...prev, conta: advertiserContaOption.value }));
    } else if (activeProfile && PROFILE_TYPES[activeProfile]) {
      setFormData((prev) => ({ ...prev, conta: activeProfile }));
    }
  }, [activeProfile, advertiserContaOption]);
  const [ticketSuccess, setTicketSuccess] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [clientResponse, setClientResponse] = useState('');

  const { content: supportContent } = useLegalContent('support');

  // Fetch user's tickets
  const { data: myTickets, isLoading: ticketsLoading } = useQuery({
    queryKey: ['my-support-tickets', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as SupportTicket[];
    },
    enabled: !!user,
  });

  // Fetch messages for selected ticket
  const { data: ticketMessages, isLoading: messagesLoading } = useQuery({
    queryKey: ['ticket-messages', selectedTicket?.id],
    queryFn: async () => {
      if (!selectedTicket) return [];
      const { data, error } = await supabase
        .from('ticket_mensagens')
        .select('*')
        .eq('ticket_id', selectedTicket.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as TicketMessage[];
    },
    enabled: !!selectedTicket,
  });

  // Fetch profile data for the header
  const { data: profileData } = useQuery({
    queryKey: ['support-header-profile', user?.id, activeProfile],
    queryFn: async () => {
      if (!user || !activeProfile) return null;
      let city = 'Cidade';
      let state = 'UF';
      let name = 'Usuário';
      let avatar = undefined;

      const { data: userProfile } = await supabase
        .from('profiles')
        .select('name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      if (userProfile) {
        name = userProfile.name || name;
        avatar = userProfile.avatar_url;
      }

      if (activeProfile === 'motoboy' || activeProfile === 'mototaxi') {
        const { data: mProfile } = await supabase
          .from('motoboy_profiles')
          .select('cidade, estado')
          .eq('user_id', user.id)
          .maybeSingle();
        if (mProfile) {
          city = mProfile.cidade || city;
          state = mProfile.estado || state;
        }
      }

      return { city, state, name, avatar };
    },
    enabled: !!user && !!activeProfile,
  });

  // Mutation for client response
  const sendResponseMutation = useMutation({
    mutationFn: async ({ ticketId, content }: { ticketId: string; content: string }) => {
      // Insert message
      const { error: msgError } = await supabase
        .from('ticket_mensagens')
        .insert({
          ticket_id: ticketId,
          autor: 'cliente',
          conteudo: content,
        });

      if (msgError) throw msgError;

      // Update ticket status
      const { error: ticketError } = await supabase
        .from('support_tickets')
        .update({
          status: 'respondido_cliente',
          updated_at: new Date().toISOString(),
        })
        .eq('id', ticketId);

      if (ticketError) throw ticketError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-support-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['ticket-messages'] });
      toast({ title: 'Resposta enviada com sucesso!' });
      setClientResponse('');
    },
    onError: () => {
      toast({ title: 'Erro ao enviar resposta', variant: 'destructive' });
    },
  });

  const handleBack = () => {
    // Se o usuário veio do painel de Imóveis (detectado por rota, não por perfil),
    // volta para o painel de Imóveis — mesmo que ele também tenha conta lojista.
    const panelContext = sessionStorage.getItem('viagg_panel_context');
    // Usa navegação "dura" (recarrega a página) ao voltar pro painel de
    // anunciante: a troca de /suporte/novo (AppLayout) pra /anunciante/* fica
    // travada numa transição pendente do React Router (v7_startTransition) —
    // a URL muda mas a tela não, só um reload completo renderiza a página nova.
    if (panelContext === 'imoveis') {
      window.location.href = '/anunciante/imoveis';
      return;
    }
    if (panelContext === 'veiculos') {
      window.location.href = '/anunciante/veiculos';
      return;
    }
    if (panelContext === 'servicos') {
      window.location.href = '/anunciante/servicos';
      return;
    }
    if (activeProfile) {
      const route = getProfileRoute(activeProfile);
      navigate(route);
    } else {
      navigate('/');
    }
  };

  const handleInputChange = (field: keyof TicketFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const validateFiles = (files: File[]) => {
    const validTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    const validFiles: File[] = [];

    files.forEach(file => {
      if (!validTypes.includes(file.type)) {
        toast({ title: 'Formato inválido', description: `${file.name} não é PNG, JPG ou PDF.`, variant: 'destructive' });
        return;
      }
      if (file.size > maxSize) {
        toast({ title: 'Arquivo muito grande', description: `${file.name} ultrapassa 10MB.`, variant: 'destructive' });
        return;
      }
      validFiles.push(file);
    });

    return validFiles;
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      const validFiles = validateFiles(newFiles);
      if (selectedFiles.length + validFiles.length > 5) {
        toast({ title: 'Limite de arquivos', description: 'Você pode enviar no máximo 5 arquivos.', variant: 'destructive' });
        setSelectedFiles(prev => [...prev, ...validFiles].slice(0, 5));
      } else {
        setSelectedFiles(prev => [...prev, ...validFiles]);
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      const validFiles = validateFiles(newFiles);
      if (selectedFiles.length + validFiles.length > 5) {
        toast({ title: 'Limite de arquivos', description: 'Você pode enviar no máximo 5 arquivos.', variant: 'destructive' });
        setSelectedFiles(prev => [...prev, ...validFiles].slice(0, 5));
      } else {
        setSelectedFiles(prev => [...prev, ...validFiles]);
      }
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitClick = async () => {
    if (!formData.assunto.trim() || !formData.mensagem.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha o assunto e a mensagem.",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Erro",
        description: "Você precisa estar logado para enviar um ticket.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const newTicketNumber = `VTX8-${new Date().getFullYear()}-${Math.floor(Math.random() * 100000).toString().padStart(6, '0')}`;

      // Inclui a conta/perfil escolhido no corpo da mensagem (a tabela não tem
      // coluna específica), para o admin ver a qual conta o chamado se refere.
      const contaLabel = contaOptions.find((o) => o.value === formData.conta)?.label;
      const mensagemFinal =
        contaLabel && formData.conta !== 'geral'
          ? `Conta relacionada: ${contaLabel}\n\n${formData.mensagem.trim()}`
          : formData.mensagem.trim();

      // 1. Create ticket (passing user_id explicitly since default trigger might be absent)
      const { data: ticketData, error: ticketError } = await supabase
        .from('support_tickets')
        .insert({
          ticket_number: newTicketNumber,
          user_id: user.id,
          assunto: formData.assunto.trim(),
          mensagem: mensagemFinal,
          categoria: formData.categoria,
        })
        .select()
        .single();

      if (ticketError) throw ticketError;

      // 2. Insert first message (Supabase handles ticket_id foreign keys by default)
      const { error: msgError } = await supabase
        .from('ticket_messages')
        .insert({
          ticket_id: ticketData.id,
          conteudo: mensagemFinal,
          autor: 'cliente'
        });

      if (msgError) throw msgError;

      // 3. Upload files if any
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Math.random()}.${fileExt}`;
          const filePath = `${user.id}/${ticketData.id}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('support-files')
            .upload(filePath, file);

          if (uploadError) {
            console.error('Upload error:', uploadError);
            continue;
          }

          await supabase.from('ticket_anexos').insert({
            ticket_id: ticketData.id,
            file_path: filePath,
            file_name: file.name,
            file_type: file.type,
          });
        }
      }

      // 4. Invoke AI Response Generation
      // We do this asynchronously so it doesn't block the UI
      supabase.functions.invoke('support-ai', {
        body: { ticket_id: ticketData.id }
      }).catch(aiError => {
        console.error('Failed to trigger AI response:', aiError);
        toast({
          title: "Aviso",
          description: "O atendente virtual pode demorar um pouco para responder.",
        });
      });

      setTicketSuccess(ticketData.ticket_number);
      setFormData({
        assunto: '',
        mensagem: '',
        categoria: 'geral',
        conta: (activeProfile && PROFILE_TYPES[activeProfile]) ? activeProfile : 'geral',
      });
      setSelectedFiles([]);
      queryClient.invalidateQueries({ queryKey: ['my-support-tickets'] });

    } catch (error: any) {
      console.error('Erro ao criar ticket:', error);
      toast({
        title: "Erro ao enviar ticket",
        description: error.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendClientResponse = () => {
    if (!selectedTicket || !clientResponse.trim()) return;
    sendResponseMutation.mutate({
      ticketId: selectedTicket.id,
      content: clientResponse.trim(),
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'aberto':
        return <Badge variant="default">Aberto</Badge>;
      case 'em_analise':
        return <Badge className="bg-yellow-600">Em Análise</Badge>;
      case 'respondido':
        return <Badge className="bg-blue-600">Respondido pelo Suporte</Badge>;
      case 'respondido_cliente':
        return <Badge className="bg-purple-600">Aguardando Suporte</Badge>;
      case 'resolvido':
        return <Badge className="bg-green-600">Resolvido</Badge>;
      case 'fechado':
        return <Badge variant="outline">Fechado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getBgClass = () => {
    return 'bg-[#14171B]';
  };

  return (
    <div className={`min-h-[100dvh] ${getBgClass()} transition-colors duration-300 flex flex-col`}>
      {isMotoboy ? (
        <>
          <MotoboyPanelHeader
            avatarUrl={profileData?.avatar}
            userName={profileData?.name || 'Motoboy'}
            city={profileData?.city || 'Cidade'}
            state={profileData?.state || 'UF'}
            showBackButton={true}
          />
          <div className="px-3 pt-2">
            <OperationalWeatherCard />
          </div>
        </>
      ) : (
        <div className="flex items-center gap-4 px-4 pt-8 pb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Suporte
            </h1>
            <p className="text-sm text-gray-400">
              Como podemos ajudar?
            </p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-lg w-full px-4 py-8 flex-1">
        <div className="space-y-6 text-white [&_label]:text-gray-300">
          {/* Hero */}
          <div className="rounded-xl border border-[#2A3038]/60 bg-[#1B1F24] p-6 text-center space-y-4 shadow-sm">
            <div className="mx-auto w-fit rounded-md bg-primary/10 p-4">
              <div className="scale-[1.7] transform origin-center">
                <Logo size="sm" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Estamos aqui para ajudar
              </h2>
              <p className="mt-2 text-sm text-gray-400">
                Envie um ticket ou acompanhe seus chamados.
              </p>
            </div>
          </div>

          {/* Dynamic Admin Content */}
          {supportContent && supportContent.content && (
            <div className="rounded-xl border border-[#2A3038]/60 bg-[#1B1F24] p-6 shadow-sm prose prose-sm max-w-none text-white [&_h1]:text-lg [&_h1]:font-bold [&_p]:text-sm">
              <div dangerouslySetInnerHTML={{ __html: supportContent.content }} />
            </div>
          )}

          {/* Inline success removed in favor of Modal below */}

          {/* My Tickets Section (Redirect to new page) */}
          {user && (
            <div
              className="rounded-xl border border-[#2A3038]/60 bg-[#1B1F24] p-4 flex items-center justify-between shadow-sm cursor-pointer hover:bg-[#242830] transition-colors"
              onClick={() => navigate('/suporte')}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 flex items-center justify-center rounded-full bg-primary/20 text-primary">
                  <Ticket className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Meus Chamados</h3>
                  <p className="text-xs text-gray-400">Acompanhe seus tickets de suporte</p>
                </div>
              </div>
              <Button size="sm" variant="ghost" className="text-primary hover:text-primary hover:bg-transparent">
                Abrir Central ➔
              </Button>
            </div>
          )}

          {/* Not logged in — prompt to authenticate */}
          {!user && (
            <div className="rounded-xl border border-[#2A3038]/60 bg-[#1B1F24] p-6 text-center space-y-4 shadow-sm">
              <div className="mx-auto w-fit rounded-full bg-primary/10 p-4">
                <Ticket className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Abrir um Ticket de Suporte</h3>
                <p className="mt-2 text-sm text-gray-400">
                  Para enviar um chamado, acesse sua conta. O histórico de todos os seus tickets ficará disponível aqui.
                </p>
              </div>
              <Button className="gap-2" onClick={() => navigate('/auth')}>
                Entrar para abrir chamado
              </Button>
            </div>
          )}

          {/* Ticket Form */}
          {user && (
            <div className="rounded-xl border border-[#2A3038]/60 bg-[#1B1F24] p-6 space-y-5 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Ticket className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-white">Abrir um Ticket</h3>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="conta">Conta / Perfil relacionado</Label>
                  <Select
                    value={formData.conta}
                    onValueChange={(value) => handleInputChange('conta', value)}
                  >
                    <SelectTrigger className="text-white [&>span]:text-white data-[placeholder]:text-white/50">
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {contaOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="categoria">Categoria</Label>
                  <Select
                    value={formData.categoria}
                    onValueChange={(value) => handleInputChange('categoria', value)}
                  >
                    <SelectTrigger className="text-white [&>span]:text-white data-[placeholder]:text-white/50">
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="geral">Geral</SelectItem>
                      <SelectItem value="conta">Minha Conta</SelectItem>
                      <SelectItem value="entrega">Entregas</SelectItem>
                      <SelectItem value="pagamento">Pagamentos</SelectItem>
                      <SelectItem value="tecnico">Problema Técnico</SelectItem>
                      <SelectItem value="sugestao">Sugestão</SelectItem>
                      <SelectItem value="estorno">Estorno Financeiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="assunto">Assunto *</Label>
                  <Input
                    id="assunto"
                    placeholder="Resumo do seu problema"
                    value={formData.assunto}
                    onChange={(e) => handleInputChange('assunto', e.target.value)}
                    maxLength={100}
                    className="text-white placeholder:text-white/40"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mensagem">Mensagem *</Label>
                  <Textarea
                    id="mensagem"
                    placeholder="Descreva seu problema em detalhes..."
                    value={formData.mensagem}
                    onChange={(e) => handleInputChange('mensagem', e.target.value)}
                    rows={5}
                    maxLength={1000}
                    className="text-white placeholder:text-white/40"
                  />
                  <p className="text-xs text-gray-400 text-right">
                    {formData.mensagem.length}/1000
                  </p>
                </div>

                {/* File Upload Dropzone */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Anexos</Label>
                    <span className="text-xs text-gray-400">Opcional (Máx 5)</span>
                  </div>
                  <div
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onClick={() => document.getElementById('file-upload')?.click()}
                    className="border-2 border-dashed border-[#2A3038] rounded-lg p-6 text-center cursor-pointer hover:bg-[#242830] transition-colors"
                  >
                    <UploadCloud className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-white">
                      Arraste arquivos ou clique para enviar
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      PNG, JPG, PDF até 10MB
                    </p>
                    <input
                      id="file-upload"
                      type="file"
                      multiple
                      accept=".png,.jpg,.jpeg,.pdf"
                      className="hidden"
                      onChange={handleFileInput}
                    />
                  </div>

                  {/* Previews */}
                  {selectedFiles.length > 0 && (
                    <div className="space-y-3 mt-4">
                      <p className="text-sm font-medium text-gray-900">Arquivos selecionados:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {selectedFiles.map((file, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-white shadow-sm">
                            <div className="h-12 w-12 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                              {file.type.includes('image') ? (
                                <img src={URL.createObjectURL(file)} alt={file.name} className="h-full w-full object-cover" />
                              ) : (
                                <FileIcon className="h-6 w-6 text-gray-600" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate text-gray-900" title={file.name}>
                                {file.name}
                              </p>
                              <p className="text-xs text-gray-600 mt-0.5">
                                {formatFileSize(file.size)}
                              </p>
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-2 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(idx);
                              }}
                            >
                              Remover
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  className="w-full gap-2 bg-[#FF6A00] hover:bg-[#E65C00] text-white"
                  onClick={handleSubmitClick}
                  disabled={!formData.assunto.trim() || !formData.mensagem.trim() || isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {isSubmitting ? 'Enviando...' : 'Enviar Ticket'}
                </Button>
              </div>
            </div>
          )}

          {/* Removing bottom logo block per user request */}
        </div>
      </div>

      {/* Success Modal */}
      <Dialog open={!!ticketSuccess} onOpenChange={(open) => !open && setTicketSuccess(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              Sucesso
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4 pb-2">
            <p className="text-[15px] text-center text-gray-900 font-medium">Seu ticket foi criado com sucesso.</p>
            <div className="space-y-1">
              <p className="text-sm text-center text-gray-600">Número do ticket:</p>
              <div className="bg-muted rounded-xl p-3 flex justify-center border">
                <span className="font-mono text-xl font-bold text-primary">
                  {ticketSuccess && ticketSuccess.startsWith('#') ? ticketSuccess : `#${ticketSuccess}`}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setTicketSuccess(null)}
              className="flex-1"
            >
              Voltar
            </Button>
            <Button
              onClick={() => navigate('/suporte')}
              className="flex-1 bg-primary text-white"
            >
              Ver meus tickets
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ticket Details Modal - Email Style */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" />
              Ticket #{selectedTicket?.ticket_number}
            </DialogTitle>
          </DialogHeader>

          {selectedTicket && (
            <div className="space-y-4">
              {/* Ticket Info */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{selectedTicket.assunto}</p>
                  <p className="text-xs text-gray-600 capitalize">
                    {selectedTicket.categoria || 'Geral'} • Criado em{" "}
                    {format(new Date(selectedTicket.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
                {getStatusBadge(selectedTicket.status)}
              </div>

              {/* Messages - Email Style */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-600">Histórico de mensagens:</p>
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {messagesLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
                    </div>
                  ) : ticketMessages && ticketMessages.length > 0 ? (
                    ticketMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`rounded-lg p-4 border ${msg.autor === 'cliente'
                          ? 'bg-muted/50 border-border'
                          : 'bg-primary/10 border-primary/20'
                          }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {msg.autor === 'cliente' ? (
                            <User className="h-4 w-4 text-gray-600" />
                          ) : (
                            <Headphones className="h-4 w-4 text-primary" />
                          )}
                          <span className="font-medium text-sm">
                            {msg.autor === 'cliente' ? 'Você' : 'Suporte Viagg-TX8'}
                          </span>
                          <span className="text-xs text-gray-600 ml-auto">
                            {format(new Date(msg.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{msg.conteudo}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-600 text-center py-3">
                      Nenhuma mensagem encontrada.
                    </p>
                  )}
                </div>
              </div>

              {/* Reply Section */}
              {selectedTicket.status !== 'resolvido' && selectedTicket.status !== 'fechado' && (
                <div className="space-y-3 pt-2 border-t">
                  <Label className="text-sm text-gray-600">
                    Responder ao suporte:
                  </Label>
                  <Textarea
                    placeholder="Digite sua resposta..."
                    value={clientResponse}
                    onChange={(e) => setClientResponse(e.target.value)}
                    rows={3}
                    maxLength={1000}
                  />
                  <Button
                    onClick={handleSendClientResponse}
                    disabled={sendResponseMutation.isPending || !clientResponse.trim()}
                    className="w-full gap-2"
                  >
                    {sendResponseMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Enviar Resposta
                  </Button>
                </div>
              )}

              {(selectedTicket.status === 'resolvido' || selectedTicket.status === 'fechado') && (
                <div className="text-center py-3 text-sm text-gray-600 bg-muted/50 rounded-lg">
                  Este ticket foi encerrado.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {isMotoboy && (
        <>
          <div className="h-20" /> {/* Spacer for fixed bottom nav */}
          <MotoboyBottomNav />
        </>
      )}
    </div>
  );
}