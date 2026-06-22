import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component to catch JavaScript errors anywhere in the child component tree.
 * This prevents the entire app from crashing and shows a fallback UI instead.
 */
class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  /**
   * Depois de um deploy novo, abas já abertas referenciam chunks (.js) que não
   * existem mais no servidor — dá esse erro em vez de quebrar de verdade.
   * Recarrega a página automaticamente (1x só, guardado em sessionStorage p/
   * não entrar em loop se o erro for outra coisa).
   */
  private isChunkLoadError(error: Error): boolean {
    const msg = error?.message || '';
    return (
      /Failed to fetch dynamically imported module/i.test(msg) ||
      /Loading chunk .* failed/i.test(msg) ||
      /Importing a module script failed/i.test(msg) ||
      /dynamically imported module/i.test(msg)
    );
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    if (this.isChunkLoadError(error)) {
      const RELOAD_KEY = 'viagg_chunk_reload_at';
      const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      const now = Date.now();
      // Só recarrega de novo se a última tentativa foi há mais de 10s
      // (evita loop infinito se o erro persistir por outro motivo).
      if (now - lastReload > 10_000) {
        sessionStorage.setItem(RELOAD_KEY, String(now));
        window.location.reload();
      }
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      // Check if it's a Supabase configuration error
      const isSupabaseError = this.state.error?.message?.includes('supabaseUrl') || 
                              this.state.error?.message?.includes('SUPABASE');

      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertCircle className="h-7 w-7 text-red-600 dark:text-red-400" />
            </div>
            
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {isSupabaseError ? 'Conectando ao servidor...' : 'Algo deu errado'}
            </h2>
            
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">
              {isSupabaseError 
                ? 'O aplicativo está iniciando. Por favor, aguarde ou recarregue a página.'
                : 'Ocorreu um erro inesperado. Tente recarregar a página.'}
            </p>
            
            <button
              onClick={this.handleReload}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors w-full"
            >
              <RefreshCw className="h-4 w-4" />
              Recarregar página
            </button>

            {!isSupabaseError && this.state.error && (
              <details className="mt-4 text-left">
                <summary className="text-xs text-gray-500 cursor-pointer">Detalhes técnicos</summary>
                <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-700 dark:text-gray-300 overflow-auto max-h-32">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
