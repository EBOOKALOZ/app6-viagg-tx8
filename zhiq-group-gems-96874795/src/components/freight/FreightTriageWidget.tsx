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
    <div className="rounded-2xl bg-[#1A1F24] shadow-[0_8px_24px_rgba(0,0,0,0.35)] border border-[#323A45] p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-[#252B33] border border-[#323A45] text-[#00C58E] flex items-center justify-center shrink-0">
          <PackageSearch className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-black text-white text-sm uppercase tracking-tight">O que você precisa enviar?</h3>
          <p className="text-xs text-[#B8C2CC]">Responda 2 perguntas e te dizemos o melhor jeito.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-[#8E98A3] uppercase tracking-wide flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5" /> Peso aproximado (kg)
          </label>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Ex.: 15"
            value={weight}
            onChange={(e) => { setWeight(e.target.value); setResult(null); }}
            className="h-11 bg-[#252B33] border-[#323A45] text-white placeholder:text-[#8E98A3]"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-[#8E98A3] uppercase tracking-wide">Tipo de carga</label>
          <Select value={cargoType} onValueChange={(v) => { setCargoType(v); setResult(null); }}>
            <SelectTrigger className="h-11 bg-[#252B33] border-[#323A45] text-white">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent className="bg-[#252B33] border-[#323A45] text-white">
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
        className="w-full h-11 bg-[#FF7A00] hover:bg-[#FF8E1F] text-white font-bold rounded-xl"
      >
        Verificar
      </Button>

      {result === "motoboy" && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-[#FF7A00]/10 border border-[#FF7A00]/40 p-4">
          <div className="flex items-center gap-3">
            <Bike className="w-6 h-6 text-[#FF7A00] shrink-0" />
            <p className="text-sm text-[#B8C2CC] font-medium">
              Isso é mais rápido e barato com <strong className="text-white">Motoboy</strong>.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => navigate("/anunciante/entrega/nova")}
            className="bg-[#FF7A00] hover:bg-[#FF8E1F] text-white font-bold shrink-0 gap-1"
          >
            Chamar Motoboy <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {result === "freight" && (
        <div className="flex items-center gap-3 rounded-xl bg-[#00C58E]/10 border border-[#00C58E]/40 p-4">
          <CheckCircle2 className="w-6 h-6 text-[#00C58E] shrink-0" />
          <p className="text-sm text-[#B8C2CC] font-medium">
            <strong className="text-white">Fretes & Transportes</strong> é o caminho certo — navegue pelos anúncios abaixo.
          </p>
          <Truck className="w-5 h-5 text-[#00C58E] shrink-0 ml-auto" />
        </div>
      )}
    </div>
  );
}

export default FreightTriageWidget;
