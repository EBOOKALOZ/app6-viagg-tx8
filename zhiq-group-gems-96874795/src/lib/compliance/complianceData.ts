/**
 * complianceData.ts — conteúdo institucional do Centro de Conformidade (ORION-520).
 *
 * Estático por decisão de escopo: nenhuma tabela shc_ / orion_compliance_ é pública
 * hoje (são admin-only), então os números exibidos aqui não vêm do banco ao vivo.
 * Editar este arquivo é a forma oficial de atualizar o conteúdo até existir um
 * painel admin dedicado com persistência própria.
 */

export const SOFTWARE_REGISTRATION = {
  titulo: "VIAGG-TX8 PLATFORM CORE",
  tipo: "Registro de Programa de Computador",
  orgao: "Instituto Nacional da Propriedade Industrial (INPI)",
  processo: "BR512026003461-2",
  dataPublicacao: "11/05/2026",
  dataCriacao: "06/02/2026",
  titular: "Angelo Zanatta",
  autor: "Angelo Zanatta",
  linguagens: ["HTML", "JavaScript", "CSS", "SQL", "PostgreSQL", "JSON", "Node.js"],
} as const;

export const CERTIFICATE_INFO = {
  data: SOFTWARE_REGISTRATION.dataPublicacao,
  hash: "SHA256-VTX8-CORE-BR512026003461-2",
  autenticidade: "Verificável junto ao INPI pelo número do processo.",
} as const;

export interface AuditRecord {
  sistema: "SHC" | "ORION";
  nome: string;
  score: number;
  status: "Aprovado" | "Aprovado com Ressalvas" | "Em Andamento";
  data: string;
  versao: string;
}

export const AUDIT_HISTORY: AuditRecord[] = [
  { sistema: "SHC", nome: "Homologação Base — 12 módulos", score: 100, status: "Aprovado", data: "27/07/2026", versao: "v2.1" },
  { sistema: "SHC", nome: "Leilões — motor de lances", score: 92, status: "Aprovado com Ressalvas", data: "28/07/2026", versao: "v2.1" },
  { sistema: "ORION", nome: "Monetização de Leilões (3%/1,5%)", score: 100, status: "Aprovado", data: "30/07/2026", versao: "v1.0" },
  { sistema: "ORION", nome: "Correção GRANT Veículos", score: 100, status: "Aprovado", data: "30/07/2026", versao: "v1.0" },
];

export interface VersionRecord {
  versao: string;
  data: string;
  status: "Homologado" | "Em Homologação";
  responsavel: string;
  mudancas: string;
}

export const VERSION_HISTORY: VersionRecord[] = [
  { versao: "v2.1", data: "27/07/2026", status: "Homologado", responsavel: "Equipe Viagg-TX8", mudancas: "Motor SHC único server-side, fail-closed." },
  { versao: "v2.0", data: "23/07/2026", status: "Homologado", responsavel: "Equipe Viagg-TX8", mudancas: "Hardening e moderação administrativa do painel de Viagens." },
  { versao: "v1.0", data: "06/02/2026", status: "Homologado", responsavel: "Angelo Zanatta", mudancas: "Criação do software — base registrada no INPI." },
];

export const SECURITY_LINKS: { label: string; to: string }[] = [
  { label: "Política de Privacidade", to: "/legal/privacy" },
  { label: "Termos de Uso", to: "/legal/terms" },
  { label: "LGPD", to: "/legal/lgpd" },
  { label: "Política de Cookies", to: "/legal/cookies" },
  { label: "Canal de Denúncia", to: "/legal/complaints" },
];

export const COMPLIANCE_STATUS = {
  softwareRegistrado: true,
  sistemaHomologado: true,
  auditoriasEmDia: true,
  monitoramentoAtivo: true,
  disponibilidade: "99,9%",
  integridade: "Verificada",
} as const;

export interface DownloadItem {
  label: string;
  description: string;
}

export const DOWNLOADS: DownloadItem[] = [
  { label: "Certificado INPI", description: "Comprovante de Registro de Programa de Computador." },
  { label: "Termos de Uso", description: "Documento vigente na plataforma." },
  { label: "Política de Privacidade", description: "Documento vigente na plataforma." },
  { label: "Relatório de Auditorias", description: "Resumo consolidado das homologações SHC/ORION." },
];
