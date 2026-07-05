/**
 * M58.0 · Component Library — estados de feedback (Loading, Skeleton,
 * Empty, Error). Desacoplados de dados: recebem tudo por props.
 */

import React from 'react';
import { borders, typography } from '../core/tokens';

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {label}
    </div>
  );
}

export function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-hidden className="space-y-2 p-1">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded bg-muted"
          style={{ width: `${100 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  title = 'Sem dados no período',
  description = 'A fonte oficial não retornou registros — nada é estimado ou inventado.',
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`${borders.radiusSm} border border-dashed border-border p-6 text-center`}>
      <p className={typography.cardTitle}>{title}</p>
      <p className={`${typography.cardSubtitle} mt-1`}>{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

const ERROR_COPY: Record<string, { title: string; hint: string }> = {
  permission: {
    title: 'Acesso negado',
    hint: 'Seu papel não tem permissão para este dado. Solicite acesso a um administrador.',
  },
  timeout: {
    title: 'Tempo esgotado',
    hint: 'A consulta demorou além do limite. Tente atualizar; se persistir, verifique o Health Center.',
  },
  network: {
    title: 'Falha de conexão',
    hint: 'Não foi possível falar com o servidor. Verifique sua rede e tente novamente.',
  },
  contract: {
    title: 'Resposta inesperada',
    hint: 'O dataset retornou um formato não previsto. Registre um chamado com o horário exato.',
  },
  unknown: {
    title: 'Erro ao carregar',
    hint: 'Algo falhou ao consultar o dado. Tente novamente.',
  },
};

export function ErrorState({
  kind = 'unknown',
  detail,
  onRetry,
}: {
  kind?: string;
  detail?: string | null;
  onRetry?: () => void;
}) {
  const copy = ERROR_COPY[kind] ?? ERROR_COPY.unknown;
  return (
    <div role="alert" className={`${borders.radiusSm} border border-destructive/40 bg-destructive/5 p-4`}>
      <p className="text-sm font-semibold text-destructive">{copy.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{copy.hint}</p>
      {detail && <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{detail}</p>}
      {onRetry && kind !== 'permission' && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-border px-3 py-1 text-xs hover:bg-accent"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}

/** Composição padrão: decide qual estado renderizar a partir do useDataset. */
export function DatasetBoundary({
  isLoading,
  isEmpty,
  isError,
  errorKind,
  errorMessage,
  onRetry,
  skeletonLines = 3,
  children,
}: {
  isLoading: boolean;
  isEmpty: boolean;
  isError: boolean;
  errorKind?: string | null;
  errorMessage?: string | null;
  onRetry?: () => void;
  skeletonLines?: number;
  children: React.ReactNode;
}) {
  if (isLoading) return <SkeletonBlock lines={skeletonLines} />;
  if (isError) return <ErrorState kind={errorKind ?? 'unknown'} detail={errorMessage} onRetry={onRetry} />;
  if (isEmpty) return <EmptyState />;
  return <>{children}</>;
}
