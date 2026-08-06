/**
 * /convenio-admin/indicacoes — Comando Convênio · Painel de Indicações.
 * Indicações de entidades enviadas pelo formulário público "Indicar entidade"
 * (/medprev → convenio_entity_referrals). Dashboard, busca, filtros,
 * ordenação, paginação, detalhes com trilha de auditoria, alteração de
 * status, observações internas e exportação CSV.
 * Fecha o achado M4 da auditoria de 2026-08-04 (dados capturados sem UI).
 */
import { useEffect, useMemo, useState } from "react";
import {
  Building2, Search, MessageCircle, Loader2, Download, Inbox, Sparkles,
  Hourglass, CheckCircle2, XCircle, Handshake, ChevronLeft, ChevronRight,
  ArrowDownAZ, ArrowUpAZ, ShieldCheck,
} from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorStatCard } from "@/components/convenio/GestorStatCard";
import { GestorQueryState } from "@/components/convenio/GestorQueryState";
import { GestorEntityTable, GestorStatusBadge } from "@/components/convenio/GestorEntityTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { exportReportToCsv } from "@/lib/convenio/exportReport";
import {
  useEntityReferrals, useUpdateEntityReferral, useEntityReferralAudit,
  ENTITY_REFERRAL_STATUS_LABEL, ENTITY_REFERRAL_STATUSES,
  type EntityReferral, type EntityReferralStatus,
} from "@/hooks/convenio/useGestorEntityReferrals";

const PAGE_SIZE = 20;

type SortBy = "data" | "nome" | "cidade" | "status";
type SortDir = "asc" | "desc";

function statusLabel(value: unknown): string {
  return ENTITY_REFERRAL_STATUS_LABEL[value as EntityReferralStatus] ?? String(value ?? "—");
}

function whatsappLink(telefone: string): string {
  const nums = telefone.replace(/\D/g, "");
  const withCountry = nums.length <= 11 ? `55${nums}` : nums;
  return `https://wa.me/${withCountry}`;
}

function formatPhone(telefone: string | null): string {
  if (!telefone) return "—";
  const nums = telefone.replace(/\D/g, "");
  if (nums.length < 10) return telefone;
  const ddd = nums.slice(0, 2);
  const body = nums.slice(2);
  return body.length === 9
    ? `(${ddd}) ${body.slice(0, 5)}-${body.slice(5)}`
    : `(${ddd}) ${body.slice(0, 4)}-${body.slice(4)}`;
}

export default function GestorIndicacoesPage() {
  const referralsQuery = useEntityReferrals();
  const referrals = useMemo(() => referralsQuery.data ?? [], [referralsQuery.data]);
  const updateMutation = useUpdateEntityReferral();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EntityReferralStatus | "all">("all");
  const [origemFilter, setOrigemFilter] = useState<string>("all");
  const [cidadeFilter, setCidadeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("data");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<EntityReferral | null>(null);
  const [observacoes, setObservacoes] = useState("");

  const stats = useMemo(() => {
    const byStatus = (s: EntityReferralStatus) => referrals.filter((r) => r.status === s).length;
    return {
      total: referrals.length,
      novas: byStatus("novo"),
      emAnalise: byStatus("em_analise"),
      aprovadas: byStatus("aprovado"),
      rejeitadas: byStatus("recusado"),
      convertidas: byStatus("convertido_convenio"),
    };
  }, [referrals]);

  const origens = useMemo(
    () => Array.from(new Set(referrals.map((r) => r.origem))).sort(),
    [referrals]
  );

  const cidades = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of referrals) {
      const cidade = r.cidade.trim();
      const key = cidade.toLocaleLowerCase("pt-BR");
      if (cidade && !seen.has(key)) seen.set(key, cidade);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [referrals]);

  const filtered = useMemo(() => {
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
    const lower = search.trim().toLowerCase();
    const searchDigits = search.replace(/\D/g, "");

    return referrals.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (origemFilter !== "all" && r.origem !== origemFilter) return false;
      if (cidadeFilter !== "all" && r.cidade.trim().toLocaleLowerCase("pt-BR") !== cidadeFilter.toLocaleLowerCase("pt-BR")) return false;
      const createdAt = new Date(r.created_at);
      if (from && createdAt < from) return false;
      if (to && createdAt > to) return false;
      if (!lower) return true;
      return (
        r.nome_entidade.toLowerCase().includes(lower) ||
        r.cidade.toLowerCase().includes(lower) ||
        (r.responsavel ?? "").toLowerCase().includes(lower) ||
        (searchDigits.length >= 4 && (r.telefone ?? "").includes(searchDigits))
      );
    });
  }, [referrals, search, statusFilter, origemFilter, cidadeFilter, dateFrom, dateTo]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const funnelIndex = (s: EntityReferralStatus) => ENTITY_REFERRAL_STATUSES.indexOf(s);
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "nome": return dir * a.nome_entidade.localeCompare(b.nome_entidade, "pt-BR");
        case "cidade": return dir * a.cidade.localeCompare(b.cidade, "pt-BR");
        case "status": return dir * (funnelIndex(a.status) - funnelIndex(b.status));
        default: return dir * a.created_at.localeCompare(b.created_at);
      }
    });
  }, [filtered, sortBy, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, origemFilter, cidadeFilter, dateFrom, dateTo, sortBy, sortDir]);

  const openReferral = (referral: EntityReferral) => {
    setSelected(referral);
    setObservacoes(referral.observacoes ?? "");
  };

  const handleChangeStatus = (status: EntityReferralStatus) => {
    if (!selected) return;
    updateMutation.mutate({ id: selected.id, status });
    setSelected({ ...selected, status });
  };

  const handleSaveObservacoes = () => {
    if (!selected) return;
    updateMutation.mutate({ id: selected.id, observacoes });
  };

  const handleExportCsv = () => {
    exportReportToCsv(
      "Indicações de Entidades",
      [
        { header: "Entidade", key: "entidade" },
        { header: "Responsável", key: "responsavel" },
        { header: "Cidade", key: "cidade" },
        { header: "Telefone", key: "telefone" },
        { header: "Origem", key: "origem" },
        { header: "Status", key: "status" },
        { header: "Motivo", key: "motivo" },
        { header: "Observações internas", key: "observacoes" },
        { header: "IP de origem", key: "source_ip" },
        { header: "Recebida em", key: "created_at" },
        { header: "Última revisão", key: "reviewed_at" },
      ],
      sorted.map((r) => ({
        entidade: r.nome_entidade,
        responsavel: r.responsavel ?? "",
        cidade: r.cidade,
        telefone: formatPhone(r.telefone),
        origem: r.origem,
        status: statusLabel(r.status),
        motivo: r.motivo ?? "",
        observacoes: r.observacoes ?? "",
        source_ip: r.source_ip ?? "",
        created_at: new Date(r.created_at).toLocaleString("pt-BR"),
        reviewed_at: r.reviewed_at ? new Date(r.reviewed_at).toLocaleString("pt-BR") : "",
      }))
    );
  };

  return (
    <div>
      <GestorPageHeader
        icon={Building2}
        title="Indicações"
        subtitle='Entidades indicadas pelo formulário público "Indicar entidade"'
        action={
          <Button
            size="sm"
            variant="outline"
            className="gap-2 rounded-xl border-white/15 bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
            onClick={handleExportCsv}
            disabled={sorted.length === 0}
          >
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <GestorStatCard icon={Inbox} label="Total" value={String(stats.total)} accent="violet" />
        <GestorStatCard icon={Sparkles} label="Novas" value={String(stats.novas)} accent="cyan" />
        <GestorStatCard icon={Hourglass} label="Em análise" value={String(stats.emAnalise)} accent="amber" />
        <GestorStatCard icon={CheckCircle2} label="Aprovadas" value={String(stats.aprovadas)} accent="emerald" />
        <GestorStatCard icon={XCircle} label="Rejeitadas" value={String(stats.rejeitadas)} accent="red" />
        <GestorStatCard icon={Handshake} label="Convertidas" value={String(stats.convertidas)} accent="emerald" />
      </div>

      <div className="mb-3 flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <Input
            placeholder="Buscar por entidade, cidade, responsável ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/[0.04] border-white/10 text-white placeholder:text-white/30"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as EntityReferralStatus | "all")}>
          <SelectTrigger className="lg:w-52 bg-white/[0.04] border-white/10 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {ENTITY_REFERRAL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{ENTITY_REFERRAL_STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={cidadeFilter} onValueChange={setCidadeFilter}>
          <SelectTrigger className="lg:w-48 bg-white/[0.04] border-white/10 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as cidades</SelectItem>
            {cidades.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={origemFilter} onValueChange={setOrigemFilter}>
          <SelectTrigger className="lg:w-44 bg-white/[0.04] border-white/10 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as origens</SelectItem>
            {origens.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-white/40">Período</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-40 bg-white/[0.04] border-white/10 text-white [color-scheme:dark]"
          />
          <span className="text-white/30">—</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-40 bg-white/[0.04] border-white/10 text-white [color-scheme:dark]"
          />
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <span className="text-xs font-bold uppercase tracking-wide text-white/40">Ordenar por</span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="w-36 bg-white/[0.04] border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="data">Data</SelectItem>
              <SelectItem value="nome">Nome</SelectItem>
              <SelectItem value="cidade">Cidade</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 rounded-lg border-white/15 bg-transparent text-white/70 text-xs"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            title={sortDir === "asc" ? "Crescente" : "Decrescente"}
          >
            {sortDir === "asc" ? <ArrowUpAZ className="h-3.5 w-3.5" /> : <ArrowDownAZ className="h-3.5 w-3.5" />}
            {sortDir === "asc" ? "Crescente" : "Decrescente"}
          </Button>
        </div>
      </div>

      <GestorQueryState
        isLoading={referralsQuery.isLoading}
        isError={referralsQuery.isError}
        error={referralsQuery.error}
        onRetry={() => referralsQuery.refetch()}
        skeleton={
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-white/30" />
          </div>
        }
      >
        <GestorEntityTable
          getRowKey={(row) => row.id}
          rows={pageRows}
          emptyLabel="Nenhuma indicação encontrada com os filtros atuais."
          columns={[
            {
              header: "Entidade",
              render: (r) => <p className="font-bold text-white">{r.nome_entidade}</p>,
            },
            { header: "Responsável", render: (r) => r.responsavel || "—" },
            { header: "Cidade", render: (r) => r.cidade },
            {
              header: "Telefone",
              className: "whitespace-nowrap",
              render: (r) => formatPhone(r.telefone),
            },
            { header: "Origem", render: (r) => <span className="text-white/60">{r.origem}</span> },
            {
              header: "Status",
              render: (r) => <GestorStatusBadge status={r.status} label={statusLabel(r.status)} />,
            },
            {
              header: "Recebida em",
              className: "whitespace-nowrap text-white/50",
              render: (r) => new Date(r.created_at).toLocaleDateString("pt-BR"),
            },
            {
              header: "Ações",
              render: (r) => (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-lg border-white/15 bg-transparent text-white/70 text-xs"
                    onClick={() => openReferral(r)}
                  >
                    Ver
                  </Button>
                  {r.telefone && (
                    <a href={whatsappLink(r.telefone)} target="_blank" rel="noreferrer">
                      <Button size="sm" className="h-7 gap-1 rounded-lg bg-emerald-600 text-white text-xs hover:bg-emerald-500">
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </Button>
                    </a>
                  )}
                </div>
              ),
            },
          ]}
        />

        {sorted.length > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-white/40">
              {sorted.length} indicações — página {page + 1} de {pageCount}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 rounded-lg border-white/15 bg-transparent text-white/70 text-xs"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 rounded-lg border-white/15 bg-transparent text-white/70 text-xs"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                Próxima <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </GestorQueryState>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-zinc-950 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Building2 className="h-4 w-4 text-emerald-400" />
              {selected?.nome_entidade}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info label="Responsável" value={selected.responsavel || "—"} />
                <Info label="Cidade" value={selected.cidade} />
                <Info label="Telefone" value={formatPhone(selected.telefone)} />
                <Info label="Origem" value={selected.origem} />
                <Info label="Recebida em" value={new Date(selected.created_at).toLocaleString("pt-BR")} />
                <Info label="IP registrado" value={selected.source_ip || "—"} />
                <Info label="Consentimento LGPD" value={selected.consentimento ? "Sim" : "Não"} />
                <Info
                  label="Última revisão"
                  value={selected.reviewed_at ? new Date(selected.reviewed_at).toLocaleString("pt-BR") : "—"}
                />
              </div>

              {selected.motivo && (
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/40">Motivo da indicação</p>
                  <p className="rounded-lg bg-white/[0.04] p-3 text-sm text-white/80">{selected.motivo}</p>
                </div>
              )}

              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-white/40">Status</p>
                <div className="flex flex-wrap gap-2">
                  {ENTITY_REFERRAL_STATUSES.map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={selected.status === status ? "default" : "outline"}
                      className={
                        selected.status === status
                          ? "h-7 rounded-lg bg-emerald-600 text-white text-xs hover:bg-emerald-500"
                          : "h-7 rounded-lg border-white/15 bg-transparent text-white/70 text-xs"
                      }
                      onClick={() => handleChangeStatus(status)}
                      disabled={updateMutation.isPending}
                    >
                      {ENTITY_REFERRAL_STATUS_LABEL[status]}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-white/40">Observações internas</p>
                <Textarea
                  placeholder="Registre observações sobre a análise desta indicação..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={3}
                  className="bg-white/[0.04] border-white/10 text-white placeholder:text-white/30"
                />
                <Button
                  size="sm"
                  className="mt-2 bg-blue-600 text-white hover:bg-blue-500"
                  onClick={handleSaveObservacoes}
                  disabled={updateMutation.isPending}
                >
                  Salvar observações
                </Button>
              </div>

              {selected.telefone && (
                <a href={whatsappLink(selected.telefone)} target="_blank" rel="noreferrer" className="block">
                  <Button className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-500">
                    <MessageCircle className="h-4 w-4" /> Entrar em contato pelo WhatsApp
                  </Button>
                </a>
              )}

              <ReferralAuditTrail referralId={selected.id} />
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
      <p className="break-words text-white/80">{value}</p>
    </div>
  );
}

/** Trilha de auditoria da indicação (convenio_audit_log via trg_convenio_audit). */
function ReferralAuditTrail({ referralId }: { referralId: string }) {
  const auditQuery = useEntityReferralAudit(referralId);
  const entries = auditQuery.data ?? [];

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/40">
        <ShieldCheck className="h-3.5 w-3.5" /> Histórico de auditoria
      </p>

      {auditQuery.isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-white/30" />
        </div>
      ) : auditQuery.isError ? (
        <p className="rounded-lg bg-red-500/10 p-3 text-xs text-red-300">
          Não foi possível carregar o histórico de auditoria.
        </p>
      ) : entries.length === 0 ? (
        <p className="rounded-lg bg-white/[0.04] p-3 text-xs text-white/40">
          Nenhum evento registrado para esta indicação.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, idx) => {
            const details = (entry.details ?? null) as Record<string, unknown> | null;
            const previous = (entries[idx + 1]?.details ?? null) as Record<string, unknown> | null;
            const meta = (details?.["_meta"] ?? null) as { ip?: string } | null;
            const isInsert = entry.action.endsWith(":insert");

            const changes: string[] = [];
            if (isInsert) {
              changes.push("Indicação criada pelo formulário público");
              if (meta?.ip) changes.push(`IP de origem: ${meta.ip}`);
            } else if (details && previous) {
              if (details["status"] !== previous["status"]) {
                changes.push(`Status: ${statusLabel(previous["status"])} → ${statusLabel(details["status"])}`);
              }
              if ((details["observacoes"] ?? "") !== (previous["observacoes"] ?? "")) {
                changes.push("Observações internas atualizadas");
              }
              if (changes.length === 0) changes.push("Registro atualizado");
            } else {
              changes.push(entry.action.endsWith(":delete") ? "Registro excluído" : "Registro atualizado");
            }

            return (
              <div key={entry.id} className="rounded-lg bg-white/[0.04] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white/80">
                    {isInsert ? "Criação" : entry.action.endsWith(":delete") ? "Exclusão" : "Atualização"}
                  </span>
                  <span className="whitespace-nowrap text-[11px] text-white/40">
                    {new Date(entry.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-white/40">
                  {entry.actor_email ?? (isInsert ? "Visitante (formulário público)" : "Sistema")}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {changes.map((c) => (
                    <li key={c} className="text-xs text-white/70">• {c}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
