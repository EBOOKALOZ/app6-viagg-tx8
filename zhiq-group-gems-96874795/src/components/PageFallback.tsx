/**
 * PageFallback — loader animado exibido durante carregamento lazy de páginas.
 * Extraído do App.tsx para ser reutilizado nas rotas modulares.
 */
export default function PageFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black gap-6">
      <div className="relative h-20 w-20">
        <svg viewBox="0 0 80 80" className="h-full w-full animate-spin" style={{ animationDuration: '1.8s' }}>
          <circle
            cx="40" cy="40" r="34"
            fill="none"
            stroke="hsl(var(--primary) / 0.15)"
            strokeWidth="5"
          />
          <circle
            cx="40" cy="40" r="34"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="140 214"
          />
        </svg>
      </div>
      <p className="text-sm text-white/50 tracking-wide">Preparando sua experiência</p>
    </div>
  );
}
