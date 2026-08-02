/**
 * /convenio-admin/configuracoes — Comando Convênio Fase 1.
 * Leitura real de convenio_settings (desconto social 0,5% e repasses).
 * Ambos os toggles permanecem desabilitados nesta fase por regra de negócio
 * — Fase 1 não ativa cobrança nem repasse real, mesmo que o Gestor queira.
 */
import { Settings, Percent, Wallet } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useConvenioSettings } from "@/hooks/convenio/useConvenioSettings";

export default function GestorConfiguracoesPage() {
  const settingsQuery = useConvenioSettings();
  const settings = settingsQuery.data;

  return (
    <div>
      <GestorPageHeader icon={Settings} title="Configurações" subtitle="Parâmetros gerais do módulo Doações & Convênios" />

      <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                <Percent className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <Label className="font-black text-white">
                  Desconto Social ({settingsQuery.isLoading ? "…" : `${(Number(settings?.desconto_social_pct ?? 0) * 100).toFixed(1)}%`})
                </Label>
                <p className="text-xs text-white/40 max-w-md">
                  Estrutura preparada para aplicar o desconto social conforme regras do projeto.
                  Cobrança permanece desativada nesta fase.
                </p>
              </div>
            </div>
            {settingsQuery.isLoading ? (
              <Skeleton className="h-6 w-11 rounded-full" />
            ) : (
              <Switch checked={settings?.desconto_social_ativo ?? false} disabled />
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                <Wallet className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <Label className="font-black text-white">Repasses Financeiros</Label>
                <p className="text-xs text-white/40 max-w-md">
                  Estrutura de repasses criada. Operações financeiras reais permanecem
                  desativadas nesta fase.
                </p>
              </div>
            </div>
            {settingsQuery.isLoading ? (
              <Skeleton className="h-6 w-11 rounded-full" />
            ) : (
              <Switch checked={settings?.repasses_ativos ?? false} disabled />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
