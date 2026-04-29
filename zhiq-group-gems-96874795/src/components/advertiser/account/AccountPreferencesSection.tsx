import React from "react";
import { Settings, Bell, Mail, Smartphone, MessageSquare, Loader2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdvertiserAccountData } from "@/hooks/useAdvertiserAccountData";

interface AccountPreferencesSectionProps {
  data: AdvertiserAccountData;
}

export function AccountPreferencesSection({ data }: AccountPreferencesSectionProps) {
  const [settings, setSettings] = React.useState(data.settings_json);
  const [isSaving, setIsSaving] = React.useState(false);

  const handleUpdateSetting = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("advertiser_accounts")
        .update({ settings_json: settings })
        .eq("id", data.id);

      if (error) throw error;
      toast.success("Preferências salvas com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar preferências.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-none shadow-xl shadow-zinc-200/50 rounded-[40px] overflow-hidden bg-white">
       <CardHeader className="p-8 pb-4">
          <CardTitle className="text-sm font-black text-zinc-900 flex items-center justify-between gap-2 uppercase tracking-tight">
             <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-orange-500" /> PREFERÊNCIAS DA CONTA
             </div>
             <Button 
                onClick={handleSave} 
                disabled={isSaving}
                className="h-10 bg-zinc-900 text-white hover:bg-black rounded-xl font-black uppercase text-[9px] tracking-widest gap-2 shadow-xl shadow-zinc-900/10"
             >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar Escolhas
             </Button>
          </CardTitle>
       </CardHeader>
       <CardContent className="p-8 pt-4 space-y-2">
          {/* Preferences items */}
          <div className="space-y-4">
             <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 border border-zinc-100/50 group/item transition-all hover:bg-white hover:border-zinc-200">
                <div className="flex items-center gap-4">
                   <div className="p-2.5 bg-white rounded-xl text-zinc-400 group-hover/item:text-orange-500 shadow-sm transition-colors border border-zinc-50">
                      <Mail className="w-4 h-4" />
                   </div>
                   <div className="space-y-0.5">
                      <p className="text-[11px] font-black text-zinc-900 uppercase tracking-tighter">Notificações por E-mail</p>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Receba alertas importantes</p>
                   </div>
                </div>
                <Switch 
                   checked={settings.receive_email_notifications} 
                   onCheckedChange={() => handleUpdateSetting("receive_email_notifications")}
                   className="data-[state=checked]:bg-orange-600 shadow-lg"
                />
             </div>

             <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 border border-zinc-100/50 group/item transition-all hover:bg-white hover:border-zinc-200">
                <div className="flex items-center gap-4">
                   <div className="p-2.5 bg-white rounded-xl text-zinc-400 group-hover/item:text-orange-500 shadow-sm transition-colors border border-zinc-50">
                      <Bell className="w-4 h-4" />
                   </div>
                   <div className="space-y-0.5">
                      <p className="text-[11px] font-black text-zinc-900 uppercase tracking-tighter">Alertas de Anúncios</p>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Saiba quando anúncios vencem</p>
                   </div>
                </div>
                <Switch 
                   checked={settings.receive_listing_alerts} 
                   onCheckedChange={() => handleUpdateSetting("receive_listing_alerts")}
                   className="data-[state=checked]:bg-orange-600 shadow-lg"
                />
             </div>

             <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 border border-zinc-100/50 group/item transition-all hover:bg-white hover:border-zinc-200">
                <div className="flex items-center gap-4">
                   <div className="p-2.5 bg-white rounded-xl text-zinc-400 group-hover/item:text-orange-500 shadow-sm transition-colors border border-zinc-50">
                      <Smartphone className="w-4 h-4" />
                   </div>
                   <div className="space-y-0.5">
                      <p className="text-[11px] font-black text-zinc-900 uppercase tracking-tighter">Aviso sobre Créditos</p>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Alertas de saldo baixo</p>
                   </div>
                </div>
                <Switch 
                   checked={settings.receive_credit_warnings} 
                   onCheckedChange={() => handleUpdateSetting("receive_credit_warnings")}
                   className="data-[state=checked]:bg-orange-600 shadow-lg"
                />
             </div>

             <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 border border-zinc-100/50 group/item transition-all hover:bg-white hover:border-zinc-200">
                <div className="flex items-center gap-4">
                   <div className="p-2.5 bg-white rounded-xl text-zinc-400 group-hover/item:text-orange-500 shadow-sm transition-colors border border-zinc-50">
                      <MessageSquare className="w-4 h-4" />
                   </div>
                   <div className="space-y-0.5">
                      <p className="text-[11px] font-black text-zinc-900 uppercase tracking-tighter">Comunicações Comerciais</p>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Receba promoções da Viagg</p>
                   </div>
                </div>
                <Switch 
                   checked={settings.receive_commercial_messages} 
                   onCheckedChange={() => handleUpdateSetting("receive_commercial_messages")}
                   className="data-[state=checked]:bg-orange-600 shadow-lg"
                />
             </div>
          </div>
       </CardContent>
    </Card>
  );
}
