import { LucideIcon } from 'lucide-react';

interface MotoboyPageTemplateProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** Extra content rendered inline with the title row (e.g. action buttons) */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Template visual padrão para todas as páginas do perfil Motoboy.
 * Garante título laranja, subtítulo, espaçamento e paleta consistentes.
 */
export function MotoboyPageTemplate({
  title,
  subtitle,
  icon: Icon,
  headerRight,
  children,
}: MotoboyPageTemplateProps) {
  return (
    <div className="flex-1 p-3 sm:p-4 space-y-3 sm:space-y-4 pb-24">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {Icon && (
            <div className="p-1.5 sm:p-2 rounded-full bg-motoboy/10 shrink-0">
              <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-motoboy" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-bold text-motoboy truncate">{title}</h1>
            {subtitle && (
              <p className="text-xs sm:text-sm text-muted-foreground leading-tight">{subtitle}</p>
            )}
          </div>
        </div>
        {headerRight && <div className="flex items-center justify-center sm:justify-end gap-2 flex-wrap w-full sm:w-auto shrink-0">{headerRight}</div>}
      </div>

      {/* Page Content */}
      {children}
    </div>
  );
}
