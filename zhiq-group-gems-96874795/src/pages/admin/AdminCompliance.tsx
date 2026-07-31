/**
 * /admin/compliance — painel Compliance (ORION-520).
 *
 * Visão administrativa (leitura) do Centro de Conformidade público: registro INPI,
 * auditorias, versionamento e status geral. Conteúdo estático (mesma fonte de
 * `src/lib/compliance/complianceData.ts` usada em /conformidade) — editar aquele
 * arquivo atualiza esta tela e a pública juntas. Sem tabela dedicada ainda.
 */
import { Link } from "react-router-dom";
import { ShieldCheck, ExternalLink, FileCheck2, History, Activity, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SOFTWARE_REGISTRATION, CERTIFICATE_INFO, AUDIT_HISTORY, VERSION_HISTORY,
  COMPLIANCE_STATUS, DOWNLOADS,
} from "@/lib/compliance/complianceData";

export default function AdminCompliance() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-black">Compliance</h1>
            <p className="text-sm text-muted-foreground">Registro INPI, auditorias, homologações e versionamento.</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to="/conformidade" target="_blank">
            <ExternalLink className="h-3.5 w-3.5" /> Ver página pública
          </Link>
        </Button>
      </div>

      {/* Status geral */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Software Registrado", ok: COMPLIANCE_STATUS.softwareRegistrado },
          { label: "Sistema Homologado", ok: COMPLIANCE_STATUS.sistemaHomologado },
          { label: "Auditorias em Dia", ok: COMPLIANCE_STATUS.auditoriasEmDia },
          { label: "Monitoramento Ativo", ok: COMPLIANCE_STATUS.monitoramentoAtivo },
        ].map((s) => (
          <Card key={s.label} className="border-border">
            <CardContent className="flex items-center gap-2 pt-4">
              <ShieldCheck className={`h-4 w-4 ${s.ok ? "text-emerald-600" : "text-muted-foreground"}`} />
              <span className="text-xs font-bold">{s.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Registro do software */}
      <Card className="border-border">
        <CardHeader className="flex flex-row items-center gap-2">
          <FileCheck2 className="h-4 w-4 text-emerald-600" />
          <CardTitle className="text-base">Registro do Software</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <p><span className="text-muted-foreground">Título:</span> <strong>{SOFTWARE_REGISTRATION.titulo}</strong></p>
          <p><span className="text-muted-foreground">Órgão:</span> {SOFTWARE_REGISTRATION.orgao}</p>
          <p><span className="text-muted-foreground">Processo:</span> {SOFTWARE_REGISTRATION.processo}</p>
          <p><span className="text-muted-foreground">Publicação:</span> {SOFTWARE_REGISTRATION.dataPublicacao}</p>
          <p><span className="text-muted-foreground">Titular:</span> {SOFTWARE_REGISTRATION.titular}</p>
          <p><span className="text-muted-foreground">Hash do certificado:</span> {CERTIFICATE_INFO.hash}</p>
        </CardContent>
      </Card>

      {/* Auditorias */}
      <Card className="border-border">
        <CardHeader className="flex flex-row items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-600" />
          <CardTitle className="text-base">Auditorias (SHC / ORION)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {AUDIT_HISTORY.map((a, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span><Badge variant="outline" className="mr-2">{a.sistema}</Badge>{a.nome}</span>
              <span className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="font-black text-emerald-600">{a.score}/100</span>
                {a.status} · {a.data} · {a.versao}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Versionamento */}
      <Card className="border-border">
        <CardHeader className="flex flex-row items-center gap-2">
          <History className="h-4 w-4 text-emerald-600" />
          <CardTitle className="text-base">Versionamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {VERSION_HISTORY.map((v) => (
            <div key={v.versao} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="font-bold">{v.versao} — {v.mudancas}</span>
              <span className="text-xs text-muted-foreground">{v.status} · {v.data} · {v.responsavel}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Downloads */}
      <Card className="border-border">
        <CardHeader className="flex flex-row items-center gap-2">
          <Download className="h-4 w-4 text-emerald-600" />
          <CardTitle className="text-base">Documentos para Download</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {DOWNLOADS.map((d) => (
            <div key={d.label} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <div>
                <p className="font-bold">{d.label}</p>
                <p className="text-xs text-muted-foreground">{d.description}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Conteúdo estático — para atualizar, edite <code>src/lib/compliance/complianceData.ts</code>.
      </p>
    </div>
  );
}
