import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SHCLayout } from "./SHCLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ArrowLeft, Award, ExternalLink, Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useSHCRealtime } from "@/hooks/useSHCRealtime";
import { runModuleAudit } from "@/services/shc/executor";

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export default function AdminSHC_CertificationTab() {
  const { moduleId } = useParams();
  const { modules, certificates, isLoading, error } = useSHCRealtime();
  const [executing, setExecuting] = useState(false);

  const handleRecertify = async () => {
    if (!moduleId || executing) return;
    setExecuting(true);
    try {
      const result = await runModuleAudit(moduleId);
      if (!result.ok) {
        toast.error(result.error || "Falha ao executar a homologação server-side.");
        return;
      }
      const scoreTxt = typeof result.score === "number" ? ` — score ${result.score}` : "";
      if (result.decision === "FAILED") {
        toast.error(`Homologação REPROVADA${scoreTxt}. Nenhum certificado foi emitido.`);
      } else if (result.certificate_hash) {
        toast.success(`Homologação aprovada${scoreTxt}. Novo certificado emitido.`);
      } else {
        toast.success(`Homologação concluída: ${result.decision ?? "sem decisão"}${scoreTxt}.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setExecuting(false);
    }
  };

  if (isLoading) {
    return (
      <SHCLayout>
        <div className="flex h-[400px] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#16A34A]" />
        </div>
      </SHCLayout>
    );
  }

  const module = modules.find(m => m.slug === moduleId);

  if (!module) {
    return (
      <SHCLayout>
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erro ao carregar dados do SHC</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        <Card className="bg-white rounded-2xl shadow-sm border border-slate-200">
          <CardContent className="p-12 text-center">
            <AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-700 mb-2">Módulo não encontrado</h3>
            <p className="text-slate-500 text-sm mb-6">
              Nenhum módulo com o identificador "{moduleId}" foi localizado no banco.
            </p>
            <Button asChild variant="outline" className="rounded-xl gap-2">
              <Link to="/admin/shc">
                <ArrowLeft className="w-4 h-4" /> Voltar para o SHC
              </Link>
            </Button>
          </CardContent>
        </Card>
      </SHCLayout>
    );
  }

  const moduleCerts = certificates
    .filter(c => c.module_id === module.id)
    .sort((a, b) => new Date(b.issued_at ?? 0).getTime() - new Date(a.issued_at ?? 0).getTime());

  const latestCert = moduleCerts[0] ?? null;

  return (
    <SHCLayout>
      <div className="space-y-8 font-inter">

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erro ao carregar dados do SHC</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {/* Selo Principal — certificado real mais recente */}
        <div className="flex justify-center">
          {latestCert ? (
            <Card className="w-full max-w-lg border-2 border-emerald-300 rounded-3xl overflow-hidden shadow-lg bg-gradient-to-br from-white via-emerald-50/20 to-white">
              <CardContent className="p-10 text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner">
                  <Award className="w-10 h-10 text-emerald-600" />
                </div>

                <span className="text-xs font-black uppercase tracking-[0.25em] text-emerald-700 inline-block border border-emerald-300 rounded-full px-4 py-1 mb-5 bg-emerald-50">
                  CERTIFICADO
                </span>

                <div className="text-6xl font-black text-emerald-600 mb-6">{latestCert.quality_score}%</div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm max-w-sm mx-auto">
                  <div className="text-right text-slate-500 font-medium">Versão</div>
                  <div className="text-left font-bold text-slate-800">{latestCert.version}</div>

                  <div className="text-right text-slate-500 font-medium">Emitido em</div>
                  <div className="text-left font-bold text-slate-800">
                    {latestCert.issued_at
                      ? format(new Date(latestCert.issued_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                      : "—"}
                  </div>

                  <div className="text-right text-slate-500 font-medium">Hash</div>
                  <div className="text-left font-mono font-bold text-slate-800 text-xs break-all">
                    {latestCert.hash ?? "—"}
                  </div>

                  <div className="text-right text-slate-500 font-medium">Testes</div>
                  <div className="text-left font-bold text-slate-800">{latestCert.total_tests}</div>

                  <div className="text-right text-slate-500 font-medium">Duração</div>
                  <div className="text-left font-mono font-bold text-slate-800">{formatMs(latestCert.duration_ms)}</div>

                  <div className="text-right text-slate-500 font-medium">Coordenador</div>
                  <div className="text-left font-bold text-slate-800 text-xs">{latestCert.coordinator_ai}</div>
                </div>

                <div className="mt-8 space-y-3">
                  <Button
                    onClick={handleRecertify}
                    disabled={executing}
                    className="bg-[#16A34A] hover:bg-[#15803d] text-white rounded-xl gap-2"
                  >
                    {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                    {executing ? "Executando homologação server-side..." : "Recertificar (Server-Side)"}
                  </Button>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    A recertificação executa a homologação completa no servidor. O certificado é
                    emitido pelo motor somente se a execução for aprovada.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="w-full max-w-lg border border-slate-200 rounded-3xl">
              <CardContent className="p-12 text-center">
                <Award className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-700 mb-2">Nenhum Certificado Emitido</h3>
                <p className="text-slate-500 text-sm mb-6">
                  O certificado é emitido pelo motor server-side somente quando uma homologação
                  completa é aprovada.
                </p>
                <Button
                  onClick={handleRecertify}
                  disabled={executing}
                  className="bg-[#16A34A] hover:bg-[#15803d] text-white rounded-xl gap-2"
                >
                  {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                  {executing ? "Executando homologação server-side..." : "Executar Homologação (Server-Side)"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Histórico de Certificados reais */}
        {moduleCerts.length > 0 && (
          <Card className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg font-bold text-[#111827]">Histórico de Certificações</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow className="hover:bg-transparent border-slate-100">
                      <TableHead className="font-semibold text-slate-500 py-4 px-6">Emitido em</TableHead>
                      <TableHead className="font-semibold text-slate-500 py-4">ID</TableHead>
                      <TableHead className="font-semibold text-slate-500 py-4">Hash</TableHead>
                      <TableHead className="font-semibold text-slate-500 py-4">Score</TableHead>
                      <TableHead className="font-semibold text-slate-500 py-4">Testes</TableHead>
                      <TableHead className="font-semibold text-slate-500 py-4">Duração</TableHead>
                      <TableHead className="font-semibold text-slate-500 py-4">Coordenador</TableHead>
                      <TableHead className="font-semibold text-slate-500 py-4">Execução</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {moduleCerts.map(cert => (
                      <TableRow key={cert.id} className="border-slate-100 even:bg-slate-50/30">
                        <TableCell className="px-6 py-3 font-medium text-[#111827] whitespace-nowrap">
                          {cert.issued_at
                            ? format(new Date(cert.issued_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                            : "—"}
                        </TableCell>
                        <TableCell className="py-3 font-mono text-xs text-slate-500">
                          {cert.id}
                        </TableCell>
                        <TableCell className="py-3 font-mono text-xs text-slate-500 max-w-[160px] truncate">
                          {cert.hash ?? "—"}
                        </TableCell>
                        <TableCell className="py-3 font-bold text-slate-700">
                          {cert.quality_score}%
                        </TableCell>
                        <TableCell className="py-3 text-slate-700">{cert.total_tests}</TableCell>
                        <TableCell className="py-3 font-mono text-slate-700">{formatMs(cert.duration_ms)}</TableCell>
                        <TableCell className="py-3 text-xs text-slate-500">{cert.coordinator_ai}</TableCell>
                        <TableCell className="py-3">
                          {cert.run_id ? (
                            <Link
                              to={`/admin/shc/${moduleId}/resultados/${cert.run_id}`}
                              className="inline-flex items-center gap-1 text-[#16A34A] hover:text-[#15803d] font-semibold text-xs"
                            >
                              Ver execução <ExternalLink className="w-3 h-3" />
                            </Link>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </SHCLayout>
  );
}
