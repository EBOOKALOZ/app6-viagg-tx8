/**
 * /conformidade (alias /certificacoes) — Centro de Conformidade e Certificações (ORION-520).
 *
 * Página pública institucional: registro do software no INPI, certificado oficial,
 * auditorias SHC/ORION, segurança/LGPD, versionamento, status geral de compliance
 * e downloads. Sem autenticação — mesma linha visual de InstitutionalLayout/LegalPage.
 */
import { Link } from "react-router-dom";
import {
  ShieldCheck, FileCheck2, ScrollText, Lock, History, Activity,
  Download, ChevronLeft, BadgeCheck, ExternalLink,
} from "lucide-react";
import { InstitutionalLayout } from "@/components/InstitutionalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  SOFTWARE_REGISTRATION, CERTIFICATE_INFO, AUDIT_HISTORY, VERSION_HISTORY,
  SECURITY_LINKS, COMPLIANCE_STATUS, DOWNLOADS,
} from "@/lib/compliance/complianceData";

function SectionCard({
  icon: Icon, title, children,
}: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <Card className="border-white/10 bg-white/[0.04] text-white">
      <CardHeader className="flex flex-row items-center gap-3 pb-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
          <Icon className="h-4.5 w-4.5 text-emerald-400" />
        </div>
        <CardTitle className="text-base font-black">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm leading-relaxed text-white/80">
        {children}
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-2 text-xs last:border-0">
      <span className="text-white/50">{label}</span>
      <span className="text-right font-semibold text-white">{value}</span>
    </div>
  );
}

const statusChecks: { label: string; ok: boolean }[] = [
  { label: "Software Registrado", ok: COMPLIANCE_STATUS.softwareRegistrado },
  { label: "Sistema Homologado", ok: COMPLIANCE_STATUS.sistemaHomologado },
  { label: "Auditorias em Dia", ok: COMPLIANCE_STATUS.auditoriasEmDia },
  { label: "Monitoramento Ativo", ok: COMPLIANCE_STATUS.monitoramentoAtivo },
];

export default function ComplianceCenter() {
  return (
    <InstitutionalLayout>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-white/50 hover:text-white/80"
        >
          <ChevronLeft className="h-4 w-4" /> Início
        </Link>

        {/* Cabeçalho */}
        <div className="mb-8 flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/10">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Centro de Conformidade</h1>
            <p className="text-sm text-white/50">Segurança · Transparência · Governança · Certificações</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Seção 1 — Registro do Software */}
          <SectionCard icon={FileCheck2} title="Registro do Software">
            <InfoRow label="Título" value={SOFTWARE_REGISTRATION.titulo} />
            <InfoRow label="Tipo" value={SOFTWARE_REGISTRATION.tipo} />
            <InfoRow label="Órgão" value={SOFTWARE_REGISTRATION.orgao} />
            <InfoRow label="Processo" value={SOFTWARE_REGISTRATION.processo} />
            <InfoRow label="Data de Publicação" value={SOFTWARE_REGISTRATION.dataPublicacao} />
            <InfoRow label="Data de Criação" value={SOFTWARE_REGISTRATION.dataCriacao} />
            <InfoRow label="Titular" value={SOFTWARE_REGISTRATION.titular} />
            <InfoRow label="Autor" value={SOFTWARE_REGISTRATION.autor} />
            <div className="pt-2">
              <p className="mb-1.5 text-xs text-white/50">Linguagens Registradas</p>
              <div className="flex flex-wrap gap-1.5">
                {SOFTWARE_REGISTRATION.linguagens.map((l) => (
                  <Badge key={l} variant="outline" className="border-white/15 text-white/70">{l}</Badge>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* Seção 2 — Certificado Oficial */}
          <SectionCard icon={BadgeCheck} title="Certificado Oficial">
            <InfoRow label="Data" value={CERTIFICATE_INFO.data} />
            <InfoRow label="Hash" value={CERTIFICATE_INFO.hash} />
            <p className="text-xs text-white/50">{CERTIFICATE_INFO.autenticidade}</p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" variant="secondary" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> Visualizar Certificado
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 border-white/15 text-white hover:bg-white/10 hover:text-white">
                <Download className="h-3.5 w-3.5" /> Baixar PDF
              </Button>
            </div>
          </SectionCard>

          {/* Seção 3 — Auditorias */}
          <SectionCard icon={Activity} title="Auditorias">
            <div className="space-y-2">
              {AUDIT_HISTORY.map((a, i) => (
                <div key={i} className="rounded-xl bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-white">
                      <Badge variant="outline" className="mr-1.5 border-white/15 text-[10px] text-emerald-400">{a.sistema}</Badge>
                      {a.nome}
                    </span>
                    <span className="text-xs font-black text-emerald-400">{a.score}/100</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-white/50">
                    <span>{a.status}</span>
                    <span>·</span>
                    <span>{a.data}</span>
                    <span>·</span>
                    <span>{a.versao}</span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Seção 4 — Segurança */}
          <SectionCard icon={Lock} title="Segurança">
            <p className="text-xs text-white/50">
              Práticas de proteção de dados, privacidade e segurança da plataforma, em conformidade com a LGPD.
            </p>
            <div className="flex flex-col gap-1.5 pt-1">
              {SECURITY_LINKS.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"
                >
                  {l.label}
                  <ChevronLeft className="h-3.5 w-3.5 rotate-180 text-white/30" />
                </Link>
              ))}
            </div>
          </SectionCard>

          {/* Seção 5 — Versionamento */}
          <SectionCard icon={History} title="Versionamento">
            <div className="space-y-2">
              {VERSION_HISTORY.map((v) => (
                <div key={v.versao} className="rounded-xl bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-white">{v.versao}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${v.status === "Homologado" ? "border-emerald-400/30 text-emerald-400" : "border-amber-400/30 text-amber-400"}`}
                    >
                      {v.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-white/60">{v.mudancas}</p>
                  <p className="mt-1 text-[10px] text-white/40">{v.data} · {v.responsavel}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Seção 6 — Compliance (status geral) */}
          <SectionCard icon={ShieldCheck} title="Compliance">
            <div className="grid grid-cols-2 gap-2">
              {statusChecks.map((s) => (
                <div key={s.label} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                  <BadgeCheck className={`h-4 w-4 ${s.ok ? "text-emerald-400" : "text-white/20"}`} />
                  <span className="text-[11px] font-semibold text-white/80">{s.label}</span>
                </div>
              ))}
            </div>
            <Separator className="my-2 bg-white/10" />
            <InfoRow label="Disponibilidade" value={COMPLIANCE_STATUS.disponibilidade} />
            <InfoRow label="Integridade" value={COMPLIANCE_STATUS.integridade} />
          </SectionCard>

          {/* Seção 7 — Downloads */}
          <SectionCard icon={ScrollText} title="Downloads">
            <div className="space-y-1.5">
              {DOWNLOADS.map((d) => (
                <div key={d.label} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-black text-white">{d.label}</p>
                    <p className="text-[10px] text-white/40">{d.description}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-white/70 hover:bg-white/10 hover:text-white">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <p className="mt-8 text-center text-[10px] text-white/30">
          Viagg-TX8 – Plataforma de Mobilidade Inteligente · Tecnologia que fortalece economias locais.
        </p>
      </div>
    </InstitutionalLayout>
  );
}
