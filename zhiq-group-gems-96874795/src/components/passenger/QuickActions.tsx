import { History, User, Wallet, HelpCircle } from "lucide-react";

const actions = [
  { icon: History, label: "Histórico", color: "from-blue-500 to-blue-600" },
  { icon: User, label: "Editar Perfil", color: "from-purple-500 to-purple-600" },
  { icon: Wallet, label: "Carteira", color: "from-zhiq-gold to-yellow-500" },
  { icon: HelpCircle, label: "Suporte", color: "from-zhiq-teal to-zhiq-green" },
];

interface QuickActionsProps {
  onAction?: (action: string) => void;
}

const QuickActions = ({ onAction }: QuickActionsProps) => {
  return (
    <div className="grid grid-cols-4 gap-3">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => onAction?.(action.label)}
          className="flex flex-col items-center gap-2 p-3 rounded-xl bg-card border border-border hover:bg-accent transition-colors active:scale-95"
        >
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${action.color} flex items-center justify-center`}>
            <action.icon className="h-5 w-5 text-white" />
          </div>
          <span className="text-xs text-muted-foreground font-medium">{action.label}</span>
        </button>
      ))}
    </div>
  );
};

export default QuickActions;
