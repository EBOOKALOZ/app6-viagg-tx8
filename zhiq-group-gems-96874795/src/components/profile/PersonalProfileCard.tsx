import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { User, MapPin, Pencil, Check, X, Loader2, LogOut, Mail, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brazilianStates } from "@/lib/brazilianStates";
import { toast } from "sonner";

interface Profile {
  name?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  cidade?: string | null;
  estado?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
}

interface PersonalProfileCardProps {
  profile: Profile | null | undefined;
  queryKey?: string[];
  onSignOut?: () => void;
  accentClass?: string;
  accentBgClass?: string;
}

export function PersonalProfileCard({
  profile,
  queryKey = ["personal-profile"],
  onSignOut,
  accentClass = "text-sky-600",
  accentBgClass = "bg-sky-600 hover:bg-sky-700",
}: PersonalProfileCardProps) {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", cidade: "", estado: "" });

  const displayName = profile?.name || profile?.full_name || user?.email?.split("@")[0] || "Usuário";
  const avatarSrc = avatarPreview || profile?.avatar_url || null;

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem válida");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB");
      return;
    }

    const preview = URL.createObjectURL(file);
    setAvatarPreview(preview);
    setUploadingAvatar(true);

    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);

      await (supabase.from("profiles") as any).update({ avatar_url: publicUrl }).eq("id", user.id);
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Foto atualizada!");
    } catch {
      toast.error("Erro ao enviar a foto");
      setAvatarPreview(null);
    } finally {
      setUploadingAvatar(false);
      URL.revokeObjectURL(preview);
      e.target.value = "";
    }
  };

  const handleStartEdit = () => {
    setForm({
      name: profile?.name || profile?.full_name || "",
      phone: profile?.whatsapp || profile?.telefone || "",
      cidade: profile?.cidade || "",
      estado: profile?.estado || "",
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    await (supabase.from("profiles") as any).update({
      name: form.name.trim() || null,
      cidade: form.cidade.trim() || null,
      estado: form.estado || null,
      whatsapp: form.phone.trim() || null,
    }).eq("id", user.id);
    await queryClient.invalidateQueries({ queryKey });
    setSaving(false);
    setEditing(false);
  };

  const handleLogout = async () => {
    await signOut();
    if (onSignOut) onSignOut();
  };

  return (
    <div className="bg-white rounded-3xl p-6 border border-zinc-200 space-y-4">
      <div className="flex items-center gap-4">
        {/* Avatar clicável */}
        <button
          type="button"
          onClick={handleAvatarClick}
          className="relative w-16 h-16 rounded-2xl shrink-0 group focus:outline-none"
          title="Trocar foto"
        >
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="w-full h-full object-cover rounded-2xl" />
          ) : (
            <div className={`w-full h-full rounded-2xl bg-zinc-100 flex items-center justify-center`}>
              <User className={`w-8 h-8 ${accentClass}`} />
            </div>
          )}
          {/* Overlay câmera */}
          <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            {uploadingAvatar
              ? <Loader2 className="w-5 h-5 text-white animate-spin" />
              : <Camera className="w-5 h-5 text-white" />}
          </div>
          {/* Badge câmera sempre visível */}
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white border border-zinc-200 flex items-center justify-center shadow-sm">
            {uploadingAvatar
              ? <Loader2 className="w-3 h-3 text-zinc-500 animate-spin" />
              : <Camera className="w-3 h-3 text-zinc-500" />}
          </div>
        </button>

        {/* Input arquivo oculto — aceita câmera e galeria no celular */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          className="hidden"
        />

        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black text-zinc-900 truncate">{displayName}</h2>
          <p className="text-sm text-zinc-500 truncate">{user?.email}</p>
          {(profile?.cidade || profile?.estado) && (
            <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3" />
              {[profile?.cidade, profile?.estado].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-3 pt-2 border-t border-zinc-100">
          <p className="text-xs font-black text-zinc-500 uppercase tracking-widest">Dados pessoais</p>
          <div className="space-y-2">
            <Input
              placeholder="Seu nome"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="rounded-xl text-sm"
            />
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              <Input
                value={user?.email || ""}
                readOnly
                disabled
                className="rounded-xl text-sm pl-9 bg-zinc-50 text-zinc-400 cursor-not-allowed"
              />
            </div>
            <Input
              placeholder="WhatsApp / Telefone"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="rounded-xl text-sm"
              type="tel"
            />
            <Input
              placeholder="Cidade"
              value={form.cidade}
              onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))}
              className="rounded-xl text-sm"
            />
            <Select value={form.estado} onValueChange={v => setForm(f => ({ ...f, estado: v }))}>
              <SelectTrigger className="rounded-xl text-sm">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                {brazilianStates.map(s => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.value} — {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-zinc-400">E-mail não pode ser alterado aqui.</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className={`rounded-xl text-xs font-bold text-white ${accentBgClass}`}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
              Salvar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
              className="rounded-xl text-xs font-bold"
            >
              <X className="w-3.5 h-3.5 mr-1" /> Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleStartEdit}
            className="rounded-xl text-xs font-bold"
          >
            <Pencil className="w-3.5 h-3.5 mr-1" /> Editar perfil pessoal
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="rounded-xl text-xs font-bold text-red-500 hover:text-red-600 hover:bg-red-50"
          >
            <LogOut className="w-3.5 h-3.5 mr-1" /> Sair
          </Button>
        </div>
      )}
    </div>
  );
}
