import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bot, Play, Square, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

export default function AdminAutoPoster() {
    const { user } = useAuth();
    const [isRunning, setIsRunning] = useState(false);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({ available: 0, posted: 0 });
    const [zapiConfig, setZapiConfig] = useState({ instance: "", token: "", groupId: "" });

    const fetchStats = async () => {
        try {
            const { count: availCount } = await supabase
                .from("postador_lotes_board")
                .select("*", { count: "exact", head: true })
                .eq("lot_status", "available");
            
            const { count: postedCount } = await supabase
                .from("postador_lotes_board")
                .select("*", { count: "exact", head: true })
                .eq("lot_status", "posted");
                
            setStats({
                available: availCount || 0,
                posted: postedCount || 0,
            });
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchStats();
        // Here we could load ZAPI configs from a settings table if implemented
        const savedInstance = localStorage.getItem("zapi_instance") || "";
        const savedToken = localStorage.getItem("zapi_token") || "";
        const savedGroup = localStorage.getItem("zapi_group") || "";
        setZapiConfig({ instance: savedInstance, token: savedToken, groupId: savedGroup });
    }, []);

    const handleSaveConfig = () => {
        localStorage.setItem("zapi_instance", zapiConfig.instance);
        localStorage.setItem("zapi_token", zapiConfig.token);
        localStorage.setItem("zapi_group", zapiConfig.groupId);
        toast.success("Configurações salvas localmente!");
    };

    const runOneLot = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke("auto-poster", {
                body: { ...zapiConfig } // Sending config in body for this demo. Ideally, store in secure DB.
            });
            
            if (error) throw error;
            if (data.success) {
                toast.success(data.message);
                fetchStats();
            } else {
                toast.error(data.message || data.error);
            }
        } catch (err: any) {
            toast.error("Erro ao rodar: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                    <Bot className="w-8 h-8 text-primary" />
                    Robô Postador Autônomo
                </h1>
                <p className="text-muted-foreground">Monitore e ative a postagem automática usando Inteligência Artificial e Z-API.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Status do Sistema</CardTitle>
                        <CardDescription>Resumo dos lotes disponíveis para postagem.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-center bg-muted/50 p-4 rounded-lg">
                            <div>
                                <p className="text-sm text-muted-foreground">Lotes Disponíveis</p>
                                <p className="text-3xl font-bold text-amber-500">{stats.available}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Lotes Postados (Hoje)</p>
                                <p className="text-3xl font-bold text-emerald-500">{stats.posted}</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between border p-4 rounded-lg">
                            <div className="space-y-0.5">
                                <h3 className="font-semibold">Cron Job Automático</h3>
                                <p className="text-sm text-muted-foreground">Rodar automaticamente a cada 5 min</p>
                            </div>
                            <Switch checked={isRunning} onCheckedChange={setIsRunning} />
                        </div>

                        <Button 
                            className="w-full gap-2" 
                            disabled={loading || stats.available === 0} 
                            onClick={runOneLot}
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            Processar Próximo Lote Agora
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Configuração Z-API</CardTitle>
                        <CardDescription>Credenciais para envio via WhatsApp</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Instance ID</label>
                            <Input 
                                placeholder="Ex: 3C4B..." 
                                value={zapiConfig.instance}
                                onChange={e => setZapiConfig(prev => ({...prev, instance: e.target.value}))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Instance Token</label>
                            <Input 
                                type="password"
                                placeholder="Ex: 8A9F..." 
                                value={zapiConfig.token}
                                onChange={e => setZapiConfig(prev => ({...prev, token: e.target.value}))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">ID do Grupo Base (Fallback)</label>
                            <Input 
                                placeholder="Ex: 120363000@g.us" 
                                value={zapiConfig.groupId}
                                onChange={e => setZapiConfig(prev => ({...prev, groupId: e.target.value}))}
                            />
                        </div>
                        <Button variant="secondary" onClick={handleSaveConfig} className="w-full">
                            Salvar Configurações
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
