import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';

interface UserAvatarProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  clickable?: boolean;
}

/**
 * Componente reutilizável de avatar do usuário.
 * Exibe a foto do usuário logado com fallback para iniciais ou ícone.
 * Clicável para navegar ao perfil pessoal.
 */
export function UserAvatar({ size = 'sm', className = '', clickable = true }: UserAvatarProps) {
  const navigate = useNavigate();
  const { user, displayName, avatarUrl } = useAuth();

  // Tamanhos padronizados
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  };

  // Resolver avatar: context -> user_metadata -> null
  const resolvedAvatarUrl = avatarUrl || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  // Resolver iniciais do nome
  const getInitials = (): string => {
    if (displayName) {
      const parts = displayName.trim().split(' ');
      if (parts.length >= 2) {
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
      }
      return displayName.charAt(0).toUpperCase();
    }
    if (user?.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return '';
  };

  const handleClick = () => {
    if (clickable) {
      navigate('/profile');
    }
  };

  return (
    <Avatar 
      className={`${sizeClasses[size]} ${clickable ? 'cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all' : ''} ${className}`}
      onClick={handleClick}
      title="Meu Perfil"
    >
      {resolvedAvatarUrl ? (
        <AvatarImage 
          src={resolvedAvatarUrl} 
          alt={displayName || 'Avatar do usuário'}
          className="object-cover"
        />
      ) : null}
      <AvatarFallback className="bg-primary/10 text-primary font-medium text-xs">
        {getInitials() || <User className="h-4 w-4" />}
      </AvatarFallback>
    </Avatar>
  );
}
