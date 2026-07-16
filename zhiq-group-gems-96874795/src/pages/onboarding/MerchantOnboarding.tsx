import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Logo } from "@/components/Logo";
import { Loader2, Store, Camera } from "lucide-react";
import { brazilianStates } from "@/lib/brazilianStates";
import { cn } from "@/lib/utils";
import { CategoriaAutocomplete } from "@/components/merchant/CategoriaAutocomplete";



export default function MerchantOnboarding() {
  const navigate = useNavigate();
  const { user, refreshProfiles } = useAuth();
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [form, setForm] = useState({
    nome_loja: "",
    categoria_id: "",
    categoria_nome: "",
    whatsapp: "",
    cidade: "",
    estado: "",
    endereco: "",
    logo_url: "",
  });

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const isValid =
    form.nome_loja.trim().length >= 2 &&
    form.categoria_id.length > 0 &&
    form.whatsapp.length >= 10 &&
    form.cidade.trim().length >= 2 &&
    form.estado.length === 2 &&
    form.endereco.trim().length >= 5 &&
    form.logo_url.trim().length > 0;

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: "Imagem inválida", description: "Selecione um arquivo de imagem válido.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "A foto deve ter no máximo 5MB.", variant: "destructive" });
      return;
    }
    setUploadingLogo(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const fileName = `logos/${user.id}/logo-${Date.now()}.${ext}`;
      
      const { error } = await supabase.storage.from('logos_lojas').upload(fileName, file, { upsert: true });
      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage.from('logos_lojas').getPublicUrl(fileName);
      update("logo_url", publicUrl);
      toast({ title: "Foto enviada!", description: "Sua foto de perfil/logo foi carregada com sucesso." });
    } catch (err: any) {
      toast({ title: "Erro ao enviar foto", description: err?.message || "Não foi possível carregar a imagem.", variant: "destructive" });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSubmit = async () => {
    if (!user || !isValid || saving) return;
    setSaving(true);

    try {
      // Update merchant_stores
      const { error: storeError } = await supabase
        .from("merchant_stores")
        .update({
          nome_loja: form.nome_loja.trim(),
          categoria: form.categoria_nome, // Salva o nome ou slug para manter retrocompatibilidade visual
          cidade: form.cidade.trim(),
          estado: form.estado,
          endereco_formatado: form.endereco.trim(),
          logo_url: form.logo_url.trim(),
        })
        .eq("user_id", user.id);

      if (storeError) throw storeError;

      // Update main profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          cidade: form.cidade.trim(),
          estado: form.estado,
          whatsapp: form.whatsapp.trim(),
          avatar_url: form.logo_url.trim(),
          logo_url: form.logo_url.trim(),
        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      // Mark onboarding complete
      const { error: onboardingError } = await supabase.rpc(
        "complete_profile_onboarding" as any,
        { p_profile_type: "merchant" }
      );

      if (onboardingError) throw onboardingError;

      // Re-sync profile data in context
      await refreshProfiles();

      toast({ title: "Loja configurada!", description: "Bem-vindo ao painel Lojista." });
      navigate("/merchant", { replace: true });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-950 via-emerald-900 to-black">
      <div className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center space-y-3 text-center">
            <Logo size="xl" />
            <div className="flex items-center gap-2 mt-4">
              <Store className="h-6 w-6 text-emerald-400" />
              <h1 className="text-xl font-bold text-white">Configure sua Loja</h1>
            </div>
            <p className="text-sm text-white/60">Preencha os dados para começar a receber pedidos</p>
          </div>

          <div className="space-y-4 rounded-xl border border-white/10 bg-black/30 p-5">
            {/* Upload Foto do Vendedor / Logo (Obrigatório) */}
            <div className="flex flex-col items-center justify-center space-y-3 pb-4 border-b border-white/10">
              <Label className="text-white/90 text-sm font-semibold flex items-center gap-1.5">
                Foto do Vendedor ou Logo da Loja <span className="text-emerald-400 font-bold">*</span>
              </Label>
              <div className="relative group cursor-pointer">
                <label htmlFor="seller-photo-upload" className="cursor-pointer block">
                  <div className={cn(
                    "w-24 h-24 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden transition-all",
                    form.logo_url ? "border-emerald-500/80 bg-black/40 ring-2 ring-emerald-500/30" : "border-white/30 bg-white/5 hover:border-emerald-400 hover:bg-white/10"
                  )}>
                    {form.logo_url ? (
                      <img src={form.logo_url} alt="Foto do Vendedor" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center justify-center p-2 text-center text-white/60">
                        <Camera className="h-6 w-6 mb-1 text-emerald-400" />
                        <span className="text-[10px] leading-tight font-medium">Adicionar Foto</span>
                      </div>
                    )}
                    {uploadingLogo && (
                      <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                      </div>
                    )}
                  </div>
                </label>
                <input
                  id="seller-photo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  disabled={uploadingLogo || saving}
                  className="hidden"
                />
              </div>
              <p className="text-[11px] text-white/50 text-center max-w-[260px]">
                {form.logo_url ? "Foto carregada! Clique para substituir se desejar." : "Obrigatório para completar o cadastro."}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-white/80">Nome da Loja</Label>
              <Input
                placeholder="Ex: Pizzaria do João"
                value={form.nome_loja}
                onChange={(e) => update("nome_loja", e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>

            <div className="space-y-2 relative z-50">
              <Label className="text-white/80">Categoria da Loja</Label>
              <CategoriaAutocomplete
                valueId={form.categoria_id}
                valueName={form.categoria_nome}
                onChange={(id, nome) => {
                  update("categoria_id", id);
                  update("categoria_nome", nome);
                }}
                theme="dark"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white/80">WhatsApp</Label>
              <Input
                placeholder="(11) 99999-9999"
                value={form.whatsapp}
                onChange={(e) => update("whatsapp", e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-white/80">Cidade</Label>
                <Input
                  placeholder="Sua cidade"
                  value={form.cidade}
                  onChange={(e) => update("cidade", e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/80">Estado</Label>
                <Select value={form.estado} onValueChange={(v) => update("estado", v)}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {brazilianStates.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-white/80">Endereço</Label>
              <Input
                placeholder="Rua, número, bairro"
                value={form.endereco}
                onChange={(e) => update("endereco", e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || saving}
            className={cn(
              "w-full h-12 rounded-md font-medium text-sm transition-all",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "bg-emerald-700 text-white hover:bg-emerald-600",
            )}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando…
              </span>
            ) : (
              "Confirmar e Entrar"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
