import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Settings, Clock, Image as ImageIcon, ShieldAlert, Save, Loader2 } from 'lucide-react';

export interface GroupPostingSettings {
    id: string;
    min_days_between_posts: number;
    max_days_variation: number;
    min_minutes_between_posts: number;
    max_minutes_between_posts: number;
    block_same_template_days: number;
    allow_images: boolean;
    allow_videos: boolean;
    allow_links: boolean;
    posting_start_hour: number;
    posting_end_hour: number;
}

const defaultSettings: Omit<GroupPostingSettings, 'id'> = {
    min_days_between_posts: 6,
    max_days_variation: 2,
    min_minutes_between_posts: 2,
    max_minutes_between_posts: 5,
    block_same_template_days: 30,
    allow_images: true,
    allow_videos: false,
    allow_links: true,
    posting_start_hour: 8,
    posting_end_hour: 21,
};

export default function AdminGroupSettings() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState<Partial<GroupPostingSettings>>(defaultSettings);

    const { data: settings, isLoading, isError } = useQuery({
        queryKey: ['group-posting-settings'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('group_posting_settings')
                .select('*')
                .limit(1)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') throw error;
            return data as GroupPostingSettings | null;
        },
    });

    useEffect(() => {
        if (settings) {
            setFormData(settings);
        }
    }, [settings]);

    const mutation = useMutation({
        mutationFn: async (newSettings: Partial<GroupPostingSettings>) => {
            if (settings?.id) {
                // Update existing
                const { error } = await supabase
                    .from('group_posting_settings')
                    .update(newSettings)
                    .eq('id', settings.id);
                if (error) throw error;
            } else {
                // Insert new
                const { error } = await supabase
                    .from('group_posting_settings')
                    .insert([newSettings]);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['group-posting-settings'] });
            toast({
                title: "Configurações salvas",
                description: "As regras de postagem em grupos foram atualizadas com sucesso.",
            });
        },
        onError: (error: any) => {
            console.error('Error saving settings:', error);
            toast({
                variant: "destructive",
                title: "Erro ao salvar",
                description: "Ocorreu um erro ao atualizar as configurações.",
            });
        }
    });

    const handleChange = (field: keyof GroupPostingSettings, value: string | number | boolean) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        mutation.mutate(formData);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (isError) {
        return (
            <div className="p-12 text-center text-destructive">
                Erro ao carregar as configurações. Certifique-se de que a tabela foi criada no banco de dados.
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <Settings className="h-6 w-6 text-primary" />
                    Configurações de Grupos
                </h1>
                <p className="text-muted-foreground mt-1">
                    Gerencie regras e comportamentos das postagens automáticas e manuais nos grupos de WhatsApp da plataforma.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Card 1 — Intervalos */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Clock className="h-5 w-5 text-blue-500" />
                            Intervalos de Postagem
                        </CardTitle>
                        <CardDescription>Defina o tempo mínimo entre as publicações e as pausas anti-ban.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Dias mínimos entre postagens no mesmo grupo</Label>
                            <Input
                                type="number"
                                min={1}
                                value={formData.min_days_between_posts ?? 6}
                                onChange={(e) => handleChange('min_days_between_posts', Number(e.target.value))}
                            />
                            <p className="text-xs text-muted-foreground">Ex: 6 dias. Bloqueia spam enviando para o mesmo grupo repetidamente.</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Variação máxima de dias (Randomização)</Label>
                            <Input
                                type="number"
                                min={0}
                                value={formData.max_days_variation ?? 2}
                                onChange={(e) => handleChange('max_days_variation', Number(e.target.value))}
                            />
                            <p className="text-xs text-muted-foreground">Adiciona X dias ao intervalo mínimo. (Ex: 0 a 2 dias extras).</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <div className="space-y-2">
                                <Label>Delay mínimo (min)</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={formData.min_minutes_between_posts ?? 2}
                                    onChange={(e) => handleChange('min_minutes_between_posts', Number(e.target.value))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Delay máximo (min)</Label>
                                <Input
                                    type="number"
                                    min={2}
                                    value={formData.max_minutes_between_posts ?? 5}
                                    onChange={(e) => handleChange('max_minutes_between_posts', Number(e.target.value))}
                                />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-[-4px]">Intervalo obrigatório (anti-ban) entre o envio em um grupo e o próximo na fila do operador.</p>
                    </CardContent>
                </Card>

                {/* Card 2 — Conteúdo Permitido */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <ImageIcon className="h-5 w-5 text-purple-500" />
                            Conteúdo Permitido
                        </CardTitle>
                        <CardDescription>Selecione quais mídias são liberadas nas campanhas.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base font-medium">Permitir Imagens</Label>
                                <p className="text-sm text-muted-foreground">O sistema enviará banners e fotos (recomendado).</p>
                            </div>
                            <Switch
                                checked={formData.allow_images ?? true}
                                onCheckedChange={(checked) => handleChange('allow_images', checked)}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base font-medium">Permitir Vídeos</Label>
                                <p className="text-sm text-muted-foreground">Libera o upload e envio de arquivos MP4.</p>
                            </div>
                            <Switch
                                checked={formData.allow_videos ?? false}
                                onCheckedChange={(checked) => handleChange('allow_videos', checked)}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base font-medium">Permitir Links</Label>
                                <p className="text-sm text-muted-foreground">Permite anexar botões ou URLs clicáveis na postagem.</p>
                            </div>
                            <Switch
                                checked={formData.allow_links ?? true}
                                onCheckedChange={(checked) => handleChange('allow_links', checked)}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Card 3 — Janela de Postagem */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Clock className="h-5 w-5 text-orange-500" />
                            Janela de Horário
                        </CardTitle>
                        <CardDescription>Limite as operações de postagem a um intervalo comercial.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Horário Inicial (0-23)</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={23}
                                    value={formData.posting_start_hour ?? 8}
                                    onChange={(e) => handleChange('posting_start_hour', Number(e.target.value))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Horário Final (0-23)</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={23}
                                    value={formData.posting_end_hour ?? 21}
                                    onChange={(e) => handleChange('posting_end_hour', Number(e.target.value))}
                                />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-4">Mensagens geradas fora desse horário ficarão represadas até o início da próxima janela comercial.</p>
                    </CardContent>
                </Card>

                {/* Card 4 — Controle de Template */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <ShieldAlert className="h-5 w-5 text-red-500" />
                            Controle de Template
                        </CardTitle>
                        <CardDescription>Evite a exaustão visual repetindo o mesmo criativo.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Bloquear repetição do mesmo template (dias)</Label>
                            <Input
                                type="number"
                                min={1}
                                value={formData.block_same_template_days ?? 30}
                                onChange={(e) => handleChange('block_same_template_days', Number(e.target.value))}
                            />
                            <p className="text-xs text-muted-foreground">Ex: 30 dias. O sistema não permitirá que o Template A seja postado novamente para o mesmo grupo A durante este período, forçando uma rotação.</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex justify-end pt-4">
                <Button
                    onClick={handleSave}
                    disabled={mutation.isPending}
                    className="min-w-[200px]"
                >
                    {mutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvar Configurações
                </Button>
            </div>
        </div>
    );
}
