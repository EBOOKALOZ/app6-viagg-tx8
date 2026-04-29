import React from "react";
import { Lock, Smartphone, ShieldAlert, LogOut, Loader2, KeyRound, Monitor } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function SecuritySettingsSection() {
  const { user, signOut } = useAuth();
  const [isResetting, setIsResetting] = React.useState(false);

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setIsResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (error) throw error;
      toast.success("E-mail de redefinição enviado com sucesso! Verifique sua caixa de entrada.");
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar e-mail de redefinição.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Card className="border-none shadow-xl shadow-zinc-200/50 rounded-[40px] overflow-hidden bg-white">
       <CardHeader className="p-8 pb-4">
          <CardTitle className="text-sm font-black text-zinc-900 flex items-center gap-2 uppercase tracking-tight">
             <ShieldAlert className="w-5 h-5 text-orange-500" /> SEGURANÇA E ACESSO
          </CardTitle>
       </CardHeader>
       <CardContent className="p-8 pt-4 space-y-8">
          <div className="space-y-6">
             {/* Security Item 1 */}
             <div className="flex items-start justify-between gap-4 py-4 border-b border-zinc-50 group/item">
                <div className="flex items-start gap-4">
                   <div className="p-3 bg-zinc-50 rounded-2xl text-zinc-400 group-hover/item:bg-orange-50 group-hover/item:text-orange-600 transition-colors">
                      <KeyRound className="w-5 h-5" />
                   </div>
                   <div className="space-y-1">
                      <p className="text-sm font-black text-zinc-900 uppercase tracking-tighter shadow-orange-100 group-hover/item:translate-x-1 duration-300">Senha da Conta</p>
                      <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">
                        Redefina sua senha regularmente para manter sua conta protegida.
                      </p>
                   </div>
                </div>
                <Button 
                   variant="outline" 
                   size="sm" 
                   className="rounded-xl font-bold text-[10px] h-10 uppercase transition-all border-transparent" 
                   style={{ backgroundColor: '#FF6A00', color: '#FFFFFF' }}
                   onClick={handlePasswordReset}
                   disabled={isResetting}
                >
                   {isResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Alterar Senha'}
                </Button>
             </div>

             {/* Security Item 2 */}
             <div className="flex items-start justify-between gap-4 py-4 border-b border-zinc-50 group/item">
                <div className="flex items-start gap-4">
                   <div className="p-3 bg-zinc-50 rounded-2xl text-zinc-400 group-hover/item:bg-orange-50 group-hover/item:text-orange-600 transition-colors">
                      <Monitor className="w-5 h-5" />
                   </div>
                   <div className="space-y-1">
                      <p className="text-sm font-black text-zinc-900 uppercase tracking-tighter shadow-orange-100 group-hover/item:translate-x-1 duration-300">Sessão Atual</p>
                      <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">
                        Gerencie os seus acessos ativos. {user?.last_sign_in_at ? `Último login em ${new Date(user.last_sign_in_at).toLocaleString('pt-BR')}` : 'Acesso recente.'}
                      </p>
                   </div>
                </div>
                <Button 
                   variant="ghost" 
                   size="sm" 
                   className="rounded-xl font-black text-zinc-400 hover:text-red-600 hover:bg-red-50 text-[10px] h-10 uppercase transition-all gap-2"
                   onClick={() => signOut()}
                >
                   <LogOut className="w-3.5 h-3.5" /> Sair
                </Button>
             </div>
          </div>

          <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100 flex items-center justify-center gap-3">
             <ShieldAlert className="w-4 h-4 text-orange-600" />
             <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest text-center leading-tight">
                Viagg ID Protegido • Viagg-TX8 Shield Ativo
             </p>
          </div>
       </CardContent>
    </Card>
  );
}
