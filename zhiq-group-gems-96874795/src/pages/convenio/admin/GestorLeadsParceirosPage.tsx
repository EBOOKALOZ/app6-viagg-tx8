/**
 * /convenio-admin/leads-parceiros — Comando Convênio.
 * Leads captados pelo botão "Quero ser parceiro" (convenio_partner_leads):
 * listar, buscar, filtrar por status, alterar status, registrar observações
 * e abrir contato via WhatsApp.
 */
import { useMemo, useState } from "react";
import { Inbox, Search, MessageCircle, Loader2 } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorStatusBadge } from "@/components/convenio/GestorEntityTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  usePartnerLeads, useUpdatePartnerLead, type PartnerLead, type PartnerLeadStatus,
} from "@/hooks/usePartnerLeads";

const STATUS_OPTIONS: { value: PartnerLeadStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "novo", label: "Novo" },
  { value: "em_analise", label: "Em análise" },
  { value: "contatado", label: "Contatado" },
  { value: "aprovado", label: "Aprovado" },
  { value: "recusado", label: "Recusado" },
];

const TIPO_PARCEIRO_LABEL: Record<string, string> = {
  hospital: "Hospital",
  clinica: "Clínica",
  laboratorio: "Laboratório",
  farmacia: "Farmácia",
  consultorio: "Consultório",
  plano_saude: "Plano de Saúde",
  empresa: "Empresa",
  associacao: "Associação",
  ong: "ONG",
  outro: "Outro",
};

function whatsappLink(whatsapp: string): string {
  const nums = whatsapp.replace(/\D/g, "");
  const withCountry = nums.length <= 11 ? `55${nums}` : nums;
  return `https://wa.me/${withCountry}`;
}

export default function GestorLeadsParceirosPage() {
  const { data: leads = [], isLoading } = usePartnerLeads();
  const updateMutation = useUpdatePartnerLead();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PartnerLeadStatus | "all">("all");
  const [selectedLead, setSelectedLead] = useState<PartnerLead | null>(null);
  const [observacoes, setObservacoes] = useState("");

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const lower = search.toLowerCase();
      return (
        lead.nome.toLowerCase().includes(lower) ||
        (lead.instituicao ?? "").toLowerCase().includes(lower) ||
        lead.cidade.toLowerCase().includes(lower) ||
        lead.whatsapp.includes(lower)
      );
    });
  }, [leads, search, statusFilter]);

  const openLead = (lead: PartnerLead) => {
    setSelectedLead(lead);
    setObservacoes(lead.observacoes ?? "");
  };

  const handleChangeStatus = (status: PartnerLeadStatus) => {
    if (!selectedLead) return;
    updateMutation.mutate({ id: selectedLead.id, status });
    setSelectedLead({ ...selectedLead, status });
  };

  const handleSaveObservacoes = () => {
    if (!selectedLead) return;
    updateMutation.mutate({ id: selectedLead.id, observacoes });
  };

  return (
    <div>
      <GestorPageHeader
        icon={Inbox}
        title="Leads de Parceiros"
        subtitle='Solicitações recebidas pelo botão "Quero ser parceiro"'
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <Input
            placeholder="Buscar por nome, instituição, cidade ou WhatsApp..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/[0.04] border-white/10 text-white placeholder:text-white/30"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PartnerLeadStatus | "all")}>
          <SelectTrigger className="sm:w-56 bg-white/[0.04] border-white/10 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-white/30" />
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
          <p className="text-sm text-white/40">Nenhum lead encontrado.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                {["Nome", "Tipo", "Cidade/UF", "WhatsApp", "Status", "Data", "Ações"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-white/40">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <p className="font-bold text-white">{lead.nome}</p>
                    {lead.instituicao && <p className="text-xs text-white/40">{lead.instituicao}</p>}
                  </td>
                  <td className="px-4 py-3 text-white/70">{TIPO_PARCEIRO_LABEL[lead.tipo_parceiro] ?? lead.tipo_parceiro}</td>
                  <td className="px-4 py-3 text-white/70">{lead.cidade}/{lead.estado}</td>
                  <td className="px-4 py-3 text-white/70 whitespace-nowrap">{lead.whatsapp}</td>
                  <td className="px-4 py-3"><GestorStatusBadge status={lead.status} /></td>
                  <td className="px-4 py-3 text-white/50 whitespace-nowrap">
                    {new Date(lead.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-lg border-white/15 bg-transparent text-white/70 text-xs"
                        onClick={() => openLead(lead)}
                      >
                        Ver
                      </Button>
                      <a href={whatsappLink(lead.whatsapp)} target="_blank" rel="noreferrer">
                        <Button size="sm" className="h-7 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1">
                          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                        </Button>
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!selectedLead} onOpenChange={(v) => !v && setSelectedLead(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-zinc-950 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Inbox className="h-4 w-4 text-emerald-400" />
              {selectedLead?.nome}
            </DialogTitle>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info label="Instituição" value={selectedLead.instituicao || "—"} />
                <Info label="Tipo de parceiro" value={TIPO_PARCEIRO_LABEL[selectedLead.tipo_parceiro] ?? selectedLead.tipo_parceiro} />
                <Info label="Cidade/UF" value={`${selectedLead.cidade}/${selectedLead.estado}`} />
                <Info label="WhatsApp" value={selectedLead.whatsapp} />
                <Info label="E-mail" value={selectedLead.email || "—"} />
                <Info label="Recebido em" value={new Date(selectedLead.created_at).toLocaleString("pt-BR")} />
              </div>

              {selectedLead.mensagem && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-white/40 mb-1">Mensagem</p>
                  <p className="text-sm text-white/80 bg-white/[0.04] rounded-lg p-3">{selectedLead.mensagem}</p>
                </div>
              )}

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-white/40 mb-1.5">Status</p>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.filter((o) => o.value !== "all").map((opt) => (
                    <Button
                      key={opt.value}
                      size="sm"
                      variant={selectedLead.status === opt.value ? "default" : "outline"}
                      className={
                        selectedLead.status === opt.value
                          ? "h-7 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
                          : "h-7 rounded-lg border-white/15 bg-transparent text-white/70 text-xs"
                      }
                      onClick={() => handleChangeStatus(opt.value as PartnerLeadStatus)}
                      disabled={updateMutation.isPending}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-white/40 mb-1.5">Observações internas</p>
                <Textarea
                  placeholder="Registre observações sobre o contato com este lead..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={3}
                  className="bg-white/[0.04] border-white/10 text-white placeholder:text-white/30"
                />
                <Button
                  size="sm"
                  className="mt-2 bg-blue-600 hover:bg-blue-500 text-white"
                  onClick={handleSaveObservacoes}
                  disabled={updateMutation.isPending}
                >
                  Salvar observações
                </Button>
              </div>

              <a href={whatsappLink(selectedLead.whatsapp)} target="_blank" rel="noreferrer" className="block">
                <Button className="w-full gap-2 bg-emerald-600 hover:bg-emerald-500 text-white">
                  <MessageCircle className="h-4 w-4" /> Entrar em contato pelo WhatsApp
                </Button>
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-white/40">{label}</p>
      <p className="text-white/80">{value}</p>
    </div>
  );
}
