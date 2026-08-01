interface GestorPageHeaderProps {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function GestorPageHeader({ icon: Icon, title, subtitle, action }: GestorPageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-white/15">
          <Icon className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-white/50">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
