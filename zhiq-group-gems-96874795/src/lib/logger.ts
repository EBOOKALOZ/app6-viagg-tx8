/**
 * Logger utilitário — exibe logs apenas em desenvolvimento.
 * Erros sempre são reportados, mesmo em produção.
 *
 * Use este utilitário no lugar de console.log para evitar
 * vazamento de dados internos no ambiente de produção.
 *
 * Exemplo:
 *   import logger from '@/lib/logger';
 *   logger.log('wallet carregada', data);
 *   logger.error('falha ao buscar pedidos', err);
 */
const IS_DEV = import.meta.env.DEV;

const logger = {
  log: (...args: unknown[]): void => {
    if (IS_DEV) console.log(...args);
  },
  warn: (...args: unknown[]): void => {
    if (IS_DEV) console.warn(...args);
  },
  info: (...args: unknown[]): void => {
    if (IS_DEV) console.info(...args);
  },
  /** Erros são sempre logados para diagnóstico em produção */
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
};

export default logger;
