/**
 * /convenio-admin/configuracoes — Comando Convênio Fase 1.
 * Estrutura para desconto social (0,5%) e repasses — AMBOS DESATIVADOS
 * nesta fase, refletindo convenio_settings.repasses_ativos = false e
 * desconto_social_ativo = false. Alterar exige fase futura + autorização.
 */
import { Settings, Percent, Wallet } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorPlaceholderNotice } from "@/components/convenio/GestorPlaceholderNotice";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function GestorConfiguracoesPage() {
  return (
    <div>
      <GestorPageHeader icon={Settings} title="Configurações" subtitle="Parâmetros gerais do módulo Doações & Convênios" />
      <GestorPlaceholderNotice text="Fase 1 — nenhuma cobrança ou repasse real está ativo. Os controles abaixo refletem o estado atual (desativado) e ficam bloqueados nesta fase." />

      <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                <Percent className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <Label className="font-black text-white">Desconto Social (0,5%)</Label>
                <p className="text-xs text-white/40 max-w-md">
                  Estrutura preparada para aplicar 0,5% como desconto social conforme regras do projeto.
                  Cobrança permanece desativada nesta fase.
                </p>
              </div>
            </div>
            <Switch checked={false} disabled />
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
                  Estrutura visual de repasses criada. Operações financeiras reais permanecem
                  desativadas nesta fase.
                </p>
              </div>
            </div>
            <Switch checked={false} disabled />
          </div>
        </div>
      </div>
    </div>
  );
}
