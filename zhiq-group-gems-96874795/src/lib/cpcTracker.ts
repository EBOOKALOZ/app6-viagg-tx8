export function getVisitorFingerprint(): string {
  if (typeof window === 'undefined') return 'unknown_ssr_visitor';
  
  const STORAGE_KEY = 'viaggtx8_visitor_id';
  
  try {
    let visitorId = window.localStorage.getItem(STORAGE_KEY);
    
    if (!visitorId) {
      if (typeof window.crypto !== 'undefined' && typeof window.crypto.randomUUID === 'function') {
        visitorId = 'anon-' + window.crypto.randomUUID();
      } else {
        visitorId = 'anon-' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      }
      window.localStorage.setItem(STORAGE_KEY, visitorId);
    }
    
    return visitorId;
  } catch (e) {
    // Fallback seguro caso o localStorage esteja bloqueado etc.
    return 'anon-fallback-id';
  }
}
