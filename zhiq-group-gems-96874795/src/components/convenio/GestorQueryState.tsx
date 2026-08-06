/**
 * GestorQueryState — Comando Convênio P1-03.
 * Estados padronizados das consultas do Super Painel do Gestor:
 * loading (skeleton), erro (mensagem + retry) e conteúdo. Erro NUNCA é
 * exibido como lista vazia — o empty state fica a cargo do conteúdo
 * (GestorEntityTable/emptyLabel) e só é renderizado quando a consulta
 * conclui com sucesso.
 */
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface GestorQueryStateProps {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry: () => void;
  skeleton?: React.ReactNode;
  children: React.ReactNode;
}

function errorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return null;
}

export function GestorQueryState({ isLoading, isError, error, onRetry, skeleton, children }: GestorQueryStateProps) {
  if (isLoading) {
    return (
      <>
        {skeleton ?? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
      </>
    );
  }

  if (isError) {
    const message = errorMessage(error);
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
        <p className="mt-3 text-sm font-bold text-red-200">Não foi possível carregar os dados.</p>
        {message && <p className="mt-1 text-xs text-red-300/70 break-words">{message}</p>}
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="mt-4 gap-2 rounded-xl border-red-400/40 bg-transparent text-red-200 hover:bg-red-500/15 hover:text-red-100"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
