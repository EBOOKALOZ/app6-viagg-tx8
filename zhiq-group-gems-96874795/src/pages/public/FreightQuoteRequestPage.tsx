/**
 * FreightQuoteRequestPage — "Preciso Transportar" / Solicitar Cotações.
 * Modalidade 2 do módulo Fretes: o cliente descreve a carga e o ORION
 * calcula os veículos compatíveis; só transportadores compatíveis recebem.
 * A Modalidade 1 (vitrine /fretes) permanece intacta.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { InstitutionalSafetyBanner } from "@/components/public/InstitutionalSafetyBanner";
import { FREIGHT_CARGO_TYPES } from "@/lib/freight/vehicleTypes";
import {
  CARGO_CHARACTERISTICS, computeAllowedVehicles, orionQuoteAnalysis,
} from "@/lib/freight/quoteEngine";
import { freightQuoteActions } from "@/hooks/useFreightQuotes";
import {
  Truck, Package, MapPin, CalendarDays, Camera, Loader2, Sparkles,
  ArrowLeft, CheckCircle2, ClipboardList,
} from "lucide-react";

function Input({ label, value, onChange, placeholder, type = "text", suffix }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; suffix?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11px] font-black text-zinc-600 uppercase tracking-wider mb-1">{label}</span>
      <span className="relative block">
        <input
          type={type} value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-xs text-zinc-800 outline-none focus:border-[#FF6A00]/60 bg-white"
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-zinc-400">{suffix}</span>}
      </span>
    </label>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-5 sm:p-6 space-y-4">
      <h2 className="flex items-center gap-2 text-xs font-black text-zinc-800 uppercase tracking-widest">
        <Icon className="w-4 h-4 text-[#FF6A00]" /> {title}
      </h2>
      {children}
    </div>
  );
}

export default function FreightQuoteRequestPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ allowed: string[]; analysis: string | null } | null>(null);

  const [f, setF] = useState({
    cargo_type: "", category: "", weight_kg: "", length_cm: "", width_cm: "", height_cm: "",
    volumes: "", cargo_value_brl: "", suggested_price_brl: "",
    origin_cep: "", origin_address: "", origin_city: "", origin_state: "",
    dest_cep: "", dest_address: "", dest_city: "", dest_state: "",
    desired_date: "", desired_time: "", notes: "",
  });
  const [flexible, setFlexible] = useState(true);
  const [urgency, setUrgency] = useState<"baixa" | "normal" | "alta">("normal");
  const [chars, setChars] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const num = (v: string): number | null => {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const toggleChar = (key: string) =>
    setChars((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));

  const handleSubmit = async () => {
    if (!user) { navigate("/auth"); return; }
    if (!f.cargo_type) { toast.error("Informe o que deseja transportar."); return; }
    if (!f.origin_city || !f.dest_city) { toast.error("Informe as cidades de origem e destino."); return; }
    setSending(true);
    try {
      // 1) ORION: veículos compatíveis (determinístico, no front)
      const orion = computeAllowedVehicles({
        weightKg: num(f.weight_kg), lengthCm: num(f.length_cm), widthCm: num(f.width_cm),
        heightCm: num(f.height_cm), volumes: num(f.volumes), characteristics: chars,
      });
      // 2) Parecer da IA (não bloqueia se falhar)
      const analysis = await orionQuoteAnalysis({
        cargoType: f.cargo_type, weightKg: num(f.weight_kg), volumeM3: orion.volumeM3,
        originCity: f.origin_city, destCity: f.dest_city,
        characteristics: chars, allowedVehicleTypes: orion.allowedVehicleTypes,
      });
      // 3) Fotos da carga
      const photoUrls: string[] = [];
      for (const file of files.slice(0, 6)) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `freight-quotes/${user.id}/${Date.now()}-${photoUrls.length}.${ext}`;
        const { error } = await supabase.storage.from("logos_lojas").upload(path, file, { upsert: true });
        if (!error) photoUrls.push(supabase.storage.from("logos_lojas").getPublicUrl(path).data.publicUrl);
      }
      // 4) Cria a solicitação (RPC)
      await freightQuoteActions.create({
        ...f,
        weight_kg: num(f.weight_kg), length_cm: num(f.length_cm), width_cm: num(f.width_cm),
        height_cm: num(f.height_cm), volumes: num(f.volumes),
        cargo_value_brl: num(f.cargo_value_brl), suggested_price_brl: num(f.suggested_price_brl),
        schedule_flexible: flexible, urgency,
        characteristics: chars, photos: photoUrls,
        allowed_vehicle_types: orion.allowedVehicleTypes,
        orion_analysis: { reasons: orion.reasons, volume_m3: orion.volumeM3, ai: analysis },
      });
      setDone({ allowed: orion.allowedVehicleTypes, analysis });
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar a solicitação.");
    } finally {
      setSending(false);
    }
  };

  return (
    <MarketLayout showSearch={false} hideCart blueFooter blueFooterLabel="🚚 Solicitar Cotações" headerChildren={<MarketNavButtons />}>
      <InstitutionalSafetyBanner />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4 pb-24">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link to="/fretes" className="inline-flex items-center gap-1 text-[11px] font-black text-zinc-500 uppercase tracking-wider hover:text-[#FF6A00]">
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar aos fretes
            </Link>
            <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight mt-1">🟠 Preciso Transportar</h1>
            <p className="text-sm text-zinc-600 font-medium">
              Descreva sua carga — o <strong>ORION</strong> envia sua solicitação só para transportadores compatíveis, e você recebe propostas para comparar.
            </p>
          </div>
          <Link
            to="/fretes/minhas-solicitacoes"
            className="hidden sm:flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-300 bg-white text-[11px] font-black uppercase tracking-wider text-zinc-600 hover:border-[#FF6A00]/50 hover:text-[#FF6A00] shrink-0"
          >
            <ClipboardList className="w-3.5 h-3.5" /> Minhas Solicitações
          </Link>
        </div>

        {!user && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm font-bold text-amber-800">
            Você precisa estar logado para solicitar cotações.{" "}
            <button onClick={() => navigate("/auth")} className="underline underline-offset-2">Entrar agora</button>
          </div>
        )}

        {done ? (
          <div className="bg-white rounded-3xl border border-emerald-200 shadow-sm p-8 text-center space-y-4">
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-black text-zinc-900 uppercase">Solicitação enviada!</h2>
            <p className="text-sm text-zinc-600 max-w-lg mx-auto">
              O ORION identificou os veículos compatíveis e sua solicitação já está visível
              <strong> apenas para transportadores que podem atender</strong>. As propostas aparecem em Minhas Solicitações.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {done.allowed.map((t) => (
                <span key={t} className="px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-[11px] font-black text-blue-700">🚚 {t}</span>
              ))}
            </div>
            {done.analysis && (
              <p className="text-xs text-zinc-500 max-w-lg mx-auto flex items-start gap-1.5 text-left bg-violet-50 border border-violet-100 rounded-xl p-3">
                <Sparkles className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" /> <span><strong>ORION:</strong> {done.analysis}</span>
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <Link to="/fretes/minhas-solicitacoes" className="px-5 py-3 rounded-xl bg-[#FF6A00] text-white text-xs font-black uppercase tracking-wider hover:bg-[#E65C00]">
                Acompanhar propostas
              </Link>
              <button onClick={() => { setDone(null); }} className="px-5 py-3 rounded-xl border border-zinc-300 text-xs font-black uppercase tracking-wider text-zinc-600">
                Nova solicitação
              </button>
            </div>
          </div>
        ) : (
        <>
          <SectionCard title="Informações da carga" icon={Package}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-[11px] font-black text-zinc-600 uppercase tracking-wider mb-1">O que deseja transportar? *</span>
                <input
                  list="cargo-types" value={f.cargo_type} onChange={(e) => set("cargo_type")(e.target.value)}
                  placeholder="Sofá, moto, geladeira, mudança, paletes…"
                  className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-xs text-zinc-800 outline-none focus:border-[#FF6A00]/60 bg-white"
                />
                <datalist id="cargo-types">
                  {FREIGHT_CARGO_TYPES.map((t) => <option key={t} value={t} />)}
                </datalist>
              </label>
              <Input label="Categoria" value={f.category} onChange={set("category")} placeholder="Ex.: Eletrodoméstico" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Input label="Peso" value={f.weight_kg} onChange={set("weight_kg")} placeholder="250" suffix="kg" />
              <Input label="Comprimento" value={f.length_cm} onChange={set("length_cm")} placeholder="200" suffix="cm" />
              <Input label="Largura" value={f.width_cm} onChange={set("width_cm")} placeholder="90" suffix="cm" />
              <Input label="Altura" value={f.height_cm} onChange={set("height_cm")} placeholder="100" suffix="cm" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Input label="Qtd. de volumes" value={f.volumes} onChange={set("volumes")} placeholder="1" />
              <Input label="Valor estimado da carga" value={f.cargo_value_brl} onChange={set("cargo_value_brl")} placeholder="1500" suffix="R$" />
              <Input label="Preço sugerido do frete" value={f.suggested_price_brl} onChange={set("suggested_price_brl")} placeholder="450 (opcional)" suffix="R$" />
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Origem" icon={MapPin}>
              <div className="grid grid-cols-2 gap-3">
                <Input label="CEP" value={f.origin_cep} onChange={set("origin_cep")} placeholder="78250-000" />
                <Input label="Estado (UF)" value={f.origin_state} onChange={set("origin_state")} placeholder="MT" />
              </div>
              <Input label="Cidade *" value={f.origin_city} onChange={set("origin_city")} placeholder="Aripuanã" />
              <Input label="Endereço" value={f.origin_address} onChange={set("origin_address")} placeholder="Rua, número, bairro" />
            </SectionCard>
            <SectionCard title="Destino" icon={MapPin}>
              <div className="grid grid-cols-2 gap-3">
                <Input label="CEP" value={f.dest_cep} onChange={set("dest_cep")} placeholder="80000-000" />
                <Input label="Estado (UF)" value={f.dest_state} onChange={set("dest_state")} placeholder="PR" />
              </div>
              <Input label="Cidade *" value={f.dest_city} onChange={set("dest_city")} placeholder="Curitiba" />
              <Input label="Endereço" value={f.dest_address} onChange={set("dest_address")} placeholder="Rua, número, bairro" />
            </SectionCard>
          </div>

          <SectionCard title="Datas e urgência" icon={CalendarDays}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
              <Input label="Data desejada" value={f.desired_date} onChange={set("desired_date")} type="date" />
              <Input label="Horário" value={f.desired_time} onChange={set("desired_time")} placeholder="08:00–12:00" />
              <div>
                <span className="block text-[11px] font-black text-zinc-600 uppercase tracking-wider mb-1">Agenda</span>
                <div className="flex bg-zinc-100 rounded-xl p-0.5">
                  {[{ v: true, l: "Flexível" }, { v: false, l: "Fixa" }].map((o) => (
                    <button key={o.l} type="button" onClick={() => setFlexible(o.v)}
                      className={cn("flex-1 px-2 py-2 rounded-lg text-[10px] font-black uppercase", flexible === o.v ? "bg-white shadow text-[#FF6A00]" : "text-zinc-500")}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="block text-[11px] font-black text-zinc-600 uppercase tracking-wider mb-1">Urgência</span>
                <div className="flex bg-zinc-100 rounded-xl p-0.5">
                  {(["baixa", "normal", "alta"] as const).map((u) => (
                    <button key={u} type="button" onClick={() => setUrgency(u)}
                      className={cn("flex-1 px-2 py-2 rounded-lg text-[10px] font-black uppercase", urgency === u ? "bg-white shadow text-[#FF6A00]" : "text-zinc-500")}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Características da carga" icon={Truck}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {CARGO_CHARACTERISTICS.map((c) => (
                <button
                  key={c.key} type="button" onClick={() => toggleChar(c.key)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-[11px] font-bold transition-all",
                    chars.includes(c.key)
                      ? "border-[#FF6A00] bg-[#FF6A00]/5 text-[#FF6A00]"
                      : "border-zinc-200 text-zinc-600 hover:border-[#FF6A00]/40"
                  )}
                >
                  <span>{c.emoji}</span> {c.label}
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Fotos e observações" icon={Camera}>
            <label className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 text-[11px] font-black uppercase tracking-wider text-zinc-500 cursor-pointer hover:border-[#FF6A00]/60 hover:text-[#FF6A00]">
              <Camera className="w-4 h-4" />
              {files.length ? `${files.length} foto(s) selecionada(s)` : "Anexar fotos da carga (até 6)"}
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 6))} />
            </label>
            <textarea
              value={f.notes} onChange={(e) => set("notes")(e.target.value)} rows={3}
              placeholder="Observações: acesso, escadas, embalagem, restrições de horário…"
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-xs text-zinc-800 outline-none focus:border-[#FF6A00]/60 resize-y"
            />
          </SectionCard>

          <button
            onClick={handleSubmit} disabled={sending || !user}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#FF6A00] text-white text-sm font-black uppercase tracking-widest shadow-lg shadow-[#FF6A00]/25 hover:bg-[#E65C00] transition-all disabled:opacity-60"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            {sending ? "ORION analisando sua carga…" : "Enviar e receber propostas"}
          </button>
          <p className="text-[10px] text-zinc-400 text-center">
            Ao enviar, o ORION define os veículos compatíveis e distribui sua solicitação apenas para transportadores que podem atender. Distância/pedágios: estrutura pronta para cálculo automático via mapa.
          </p>
        </>
        )}
      </div>
    </MarketLayout>
  );
}
