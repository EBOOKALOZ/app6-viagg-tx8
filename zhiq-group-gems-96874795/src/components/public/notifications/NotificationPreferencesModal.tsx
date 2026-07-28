import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Settings, Mail, Smartphone, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export function NotificationPreferencesModal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["notification-prefs", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("user_notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .single();
      
      // Se não tem preferência salva, a gente assume padrão e cria no backend ou aqui.
      if (error && error.code === 'PGRST116') {
        return { email_enabled: true, push_enabled: true, whatsapp_enabled: false };
      }
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const updatePrefs = useMutation({
    mutationFn: async (newPrefs: any) => {
      if (!user) return;
      const { error } = await supabase
        .from("user_notification_preferences")
        .upsert({ user_id: user.id, ...newPrefs });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-prefs"] });
      toast.success("Preferências salvas com sucesso!");
    },
    onError: () => toast.error("Erro ao salvar preferências."),
  });

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-2 p-2 hover:bg-[#252B33] rounded-lg transition-colors text-[#8E98A3] hover:text-white">
          <Settings className="w-5 h-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="bg-[#1A1F24] border-[#323A45] text-white rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-black text-white">Preferências de Notificação</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-[#8E98A3]">Carregando...</div>
        ) : (
          <div className="space-y-6 mt-4">
            <div className="flex items-center justify-between p-4 bg-[#252B33] rounded-xl border border-[#323A45]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#00C58E]/10 rounded-lg">
                  <Smartphone className="w-5 h-5 text-[#00C58E]" />
                </div>
                <div>
                  <h4 className="font-bold">Push Notifications</h4>
                  <p className="text-xs text-[#8E98A3]">Avisos em tempo real no navegador/app</p>
                </div>
              </div>
              <Switch 
                checked={prefs?.push_enabled} 
                onCheckedChange={(c) => updatePrefs.mutate({ ...prefs, push_enabled: c })} 
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-[#252B33] rounded-xl border border-[#323A45]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Mail className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h4 className="font-bold">E-mail</h4>
                  <p className="text-xs text-[#8E98A3]">Resumos diários e alertas críticos</p>
                </div>
              </div>
              <Switch 
                checked={prefs?.email_enabled} 
                onCheckedChange={(c) => updatePrefs.mutate({ ...prefs, email_enabled: c })} 
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-[#252B33] rounded-xl border border-[#323A45]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#25D366]/10 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-[#25D366]" />
                </div>
                <div>
                  <h4 className="font-bold">WhatsApp</h4>
                  <p className="text-xs text-[#8E98A3]">Apenas para segurança e alertas críticos</p>
                </div>
              </div>
              <Switch 
                checked={prefs?.whatsapp_enabled} 
                onCheckedChange={(c) => updatePrefs.mutate({ ...prefs, whatsapp_enabled: c })} 
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
