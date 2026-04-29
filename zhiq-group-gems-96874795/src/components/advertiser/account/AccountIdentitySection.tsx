import React, { useState, useRef } from "react";
import { User, CheckCircle2, Clock, ShieldCheck, Mail, Smartphone, Globe, Camera, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AdvertiserAccountData } from "@/hooks/useAdvertiserAccountData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface AccountIdentitySectionProps {
  data: AdvertiserAccountData;
}

export function AccountIdentitySection({ data }: AccountIdentitySectionProps) {
  const accountStatus = data.account_status || data.status || 'active';
  const isPremium = data.plan?.is_premium || false;
  
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file || !user) return;

      setIsUploading(true);

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Math.random()}.${fileExt}`;

      // Upload image
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, {upsert: true});

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Ensure merchant store also has an icon if they have one so it stays synced
      await supabase
        .from('merchant_stores')
        .update({ logo_url: publicUrl })
        .eq('owner_id', user.id);

      queryClient.invalidateQueries({ queryKey: ["advertiser-account-comprehensive"] });

      toast({
        title: "Avatar atualizado",
        description: "Sua foto de perfil foi alterada com sucesso.",
      });
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      toast({
        variant: "destructive",
        title: "Erro ao atualizar",
        description: error.message || "Não foi possível enviar a imagem.",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-zinc-900 tracking-tight flex items-center gap-3 uppercase">
            <User className="w-8 h-8 text-orange-500" />
            Minha Conta
          </h1>
          <p className="text-zinc-500 font-medium tracking-tight">Gerencie seus dados e verifique o status do seu perfil de anunciante.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Badge className={cn(
            "px-4 py-1.5 rounded-full font-black uppercase text-[10px] tracking-widest border-none shadow-xl",
            accountStatus === 'active' ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
          )}>
            {accountStatus === 'active' ? 'Conta Ativa' : 'Conta Pendente'}
          </Badge>
          <Badge className={cn(
            "px-4 py-1.5 rounded-full font-black uppercase text-[10px] tracking-widest border-none shadow-xl",
            isPremium ? "bg-zinc-900 text-orange-500" : "bg-zinc-100 text-zinc-400"
          )}>
            {isPremium ? (data.plan?.name || 'Conta Premium') : 'Conta Gratuita'}
          </Badge>
        </div>
      </div>

      <Card className="border-none shadow-2xl shadow-zinc-200/50 rounded-[40px] overflow-hidden bg-white border border-zinc-100 group">
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5">
           {/* Visual Avatar Column */}
           <div className="p-10 bg-zinc-50 flex flex-col items-center justify-center text-center border-r border-zinc-100 gap-6">
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleAvatarUpload} 
                accept="image/*" 
                className="hidden" 
              />
              
              <div 
                className="relative w-24 h-24 rounded-[32px] bg-orange-600 flex items-center justify-center text-white shadow-2xl shadow-orange-600/30 font-black text-4xl group-hover:scale-105 transition-transform duration-500 overflow-hidden border-4 border-white cursor-pointer"
                onClick={() => !isUploading && fileInputRef.current?.click()}
              >
                {data.profile.avatar_url && !isUploading ? (
                  <img src={data.profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                ) : !isUploading ? (
                  (data.profile.name?.[0] || data.email?.[0] || 'U').toUpperCase()
                ) : null}

                {/* Loading overlay */}
                {isUploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-sm z-10">
                     <Loader2 className="w-8 h-8 text-white animate-spin" />
                  </div>
                )}

                {/* Hover overlay for changing the avatar */}
                {!isUploading && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 hover:opacity-100 transition-opacity z-10">
                    <Camera className="w-6 h-6 text-white mb-1" />
                    <span className="text-[10px] text-white font-bold uppercase tracking-widest">Alterar</span>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <h3 className="font-black text-zinc-900 uppercase tracking-tight leading-tight">{data.profile.name || 'Anunciante'}</h3>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Desde {new Date(data.created_at).toLocaleDateString()}</p>
              </div>
           </div>

           {/* Data Columns */}
           <div className="md:col-span-3 lg:col-span-4 p-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
              <div className="space-y-2">
                 <div className="flex items-center gap-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    <Mail className="w-3.5 h-3.5" /> Email da Conta
                 </div>
                 <p className="text-sm font-bold text-zinc-800 break-all">{data.email || data.profile.email_confirmed && data.email}</p>
              </div>

              <div className="space-y-2">
                 <div className="flex items-center gap-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    <Smartphone className="w-3.5 h-3.5" /> WhatsApp / Telefone
                 </div>
                 <p className="text-sm font-bold text-zinc-800">{data.whatsapp || 'Não informado'}</p>
              </div>

              <div className="space-y-2">
                 <div className="flex items-center gap-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    <ShieldCheck className="w-3.5 h-3.5" /> Documento (CPF/CNPJ)
                 </div>
                 <p className="text-sm font-bold text-zinc-800">{data.profile.cpf_cnpj || 'Não verificado'}</p>
              </div>

              <div className="space-y-2">
                 <div className="flex items-center gap-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    <Globe className="w-3.5 h-3.5" /> Nome Comercial
                 </div>
                 <p className="text-sm font-bold text-zinc-800">{data.full_name || 'Individual'}</p>
              </div>

              <div className="space-y-2">
                 <div className="flex items-center gap-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    <Clock className="w-3.5 h-3.5" /> Última Atualização
                 </div>
                 <p className="text-sm font-bold text-zinc-800">{data.updated_at ? new Date(data.updated_at).toLocaleString() : 'Recente'}</p>
              </div>

              <div className="space-y-2">
                 <div className="flex items-center gap-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Onboarding
                 </div>
                 <Badge variant="outline" className={cn(
                   "font-black uppercase tracking-widest text-[9px]",
                   data.onboarding_completed ? "text-emerald-500 border-emerald-100 bg-emerald-50" : "text-amber-500 border-amber-100 bg-amber-50"
                 )}>
                   {data.onboarding_completed ? 'Concluído' : 'Pendente'}
                 </Badge>
              </div>
           </div>
        </div>
      </Card>
    </div>
  );
}
