/**
 * M58.0 · Export Framework — APENAS INTERFACES (conforme spec).
 *
 * Nenhuma exportação implementada; cada formato é um stub registrado
 * como indisponível, no mesmo padrão dos cio_export_adapters do banco
 * (interfaces desligadas até haver demanda real).
 */

export type ExportFormat = 'pdf' | 'excel' | 'csv' | 'image' | 'share';

export interface ExportRequest {
  /** chave do dataset ou identificador do painel */
  source: string;
  /** dados JÁ RENDERIZADOS (o exportador nunca reconsulta nem recalcula) */
  payload: unknown;
  title?: string;
}

export interface Exporter {
  format: ExportFormat;
  label: string;
  available: boolean;
  export(req: ExportRequest): Promise<{ ok: boolean; reason?: string }>;
}

function stub(format: ExportFormat, label: string): Exporter {
  return {
    format,
    label,
    available: false,
    async export() {
      return { ok: false, reason: `Exportação ${label} ainda não implementada (interface preparada no M58.0).` };
    },
  };
}

export const EXPORTERS: readonly Exporter[] = [
  stub('pdf', 'PDF'),
  stub('excel', 'Excel'),
  stub('csv', 'CSV'),
  stub('image', 'Imagem'),
  stub('share', 'Compartilhar'),
] as const;

export function getExporter(format: ExportFormat): Exporter {
  const e = EXPORTERS.find((x) => x.format === format);
  if (!e) throw new Error(`Formato de exportação desconhecido: ${format}`);
  return e;
}
