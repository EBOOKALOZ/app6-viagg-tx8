import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bike, Truck, Scale, PackageSearch, ArrowRight, CheckCircle2 } from "lucide-react";
import { FREIGHT_CARGO_TYPES, shouldRouteToFreight } from "@/lib/freight/vehicleTypes";

/**
 * Widget de triagem inteligente: pergunta peso + tipo de carga e sugere
 * Motoboy (carga pequena) ou confirma que Fretes é o caminho certo (carga
 * grande/volumosa). Nunca bloqueia o acesso à vitrine — é só uma sugestão.
 */
export function FreightTriageWidget() {
  const navigate = useNavigate();
  const [weight, setWeight] = useState("");
  const [cargoType, setCargoType] = useState<string>("");
  const [result, setResult] = useState<"freight" | "motoboy" | null>(null);

  const handleCheck = () => {
    const w = Number(weight.replace(",", ".")) || 0;
    if (!cargoType) return;
    setResult(shouldRouteToFreight(w, cargoType) ? "freight" : "motoboy");
  };

  return (
    <div className="rounded-2xl bg-white shadow-xl border border-blue-100 p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <PackageSearch className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-black text-zinc-900 text-sm uppercase tracking-tight">O que você precisa enviar?</h3>
          <p className="text-xs text-zinc-500">Responda 2 perguntas e te dizemos o melhor jeito.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wide flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5" /> Peso aproximado (kg)
          </label>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Ex.: 15"
            value={weight}
            onChange={(e) => { setWeight(e.target.value); setResult(null); }}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wide">Tipo de carga</label>
          <Select value={cargoType} onValueChange={(v) => { setCargoType(v); setResult(null); }}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {FREIGHT_CARGO_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        onClick={handleCheck}
        disabled={!weight || !cargoType}
        className="w-full h-11 bg-zinc-900 hover:bg-black text-white font-bold rounded-xl"
      >
        Verificar
      </Button>

      {result === "motoboy" && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-orange-50 border border-orange-200 p-4">
          <div className="flex items-center gap-3">
            <Bike className="w-6 h-6 text-orange-600 shrink-0" />
            <p className="text-sm text-orange-800 font-medium">
              Isso é mais rápido e barato com <strong>Motoboy</strong>.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => navigate("/anunciante/entrega/nova")}
            className="bg-orange-600 hover:bg-orange-700 text-white font-bold shrink-0 gap-1"
          >
            Chamar Motoboy <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {result === "freight" && (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-800 font-medium">
            <strong>Fretes & Transportes</strong> é o caminho certo — navegue pelos anúncios abaixo.
          </p>
          <Truck className="w-5 h-5 text-emerald-600 shrink-0 ml-auto" />
        </div>
      )}
    </div>
  );
}

export default FreightTriageWidget;
