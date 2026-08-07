import DOMPurify from 'dompurify';

/**
 * Allowlist de tags/atributos para conteúdo rico "simples" (textos legais,
 * respostas de IA, mensagens de chat). Cobre formatação básica de texto e
 * links, sem permitir script, iframes, handlers on* ou estilos inline
 * perigosos.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'small', 'span',
  'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'blockquote', 'code', 'pre', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

const ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'class'];

// Só permite http(s)/mailto em href (bloqueia javascript:, data:, etc.)
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i;

/**
 * Sanitiza uma string HTML antes de uso em dangerouslySetInnerHTML,
 * removendo scripts, handlers de evento (on*), estilos perigosos e
 * qualquer tag/atributo fora da allowlist.
 *
 * Uso obrigatório em qualquer ponto que injete HTML vindo de: usuário,
 * IA/assistente, ou conteúdo administrativo persistido em banco — mesmo
 * quando "só admin edita", como defesa em profundidade contra XSS
 * armazenado (conta admin comprometida, editor com bug, etc.).
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
    ALLOW_DATA_ATTR: false,
    // Força links a abrirem com segurança (evita reverse tabnabbing)
    ADD_ATTR: ['target', 'rel'],
  });

  return clean;
}

// Reforça rel="noopener noreferrer" em links com target="_blank".
// Guarda defensiva: em ambientes sem DOM real (ex.: testes Node sem jsdom
// importando este módulo indiretamente), DOMPurify pode não expor addHook —
// nesse caso a chamada em sanitizeHtml() também não funcionaria, então
// evitamos quebrar o import do módulo em si.
if (typeof DOMPurify.addHook === 'function') {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}
