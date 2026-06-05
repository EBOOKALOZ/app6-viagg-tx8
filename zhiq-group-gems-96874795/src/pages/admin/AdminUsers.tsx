import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getAllUsers } from '@/lib/api';
import { Search, Eye, Users, UserCheck, Shield } from 'lucide-react';

interface UserWithData {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  groupCount: number;
  commissionRate: number;
  hasOverride: boolean;
  availableProfiles: string[];
  isAdmin: boolean;
  availableCredits: number;
}

/** Profile visual config: badge colors + card accent */
const PROFILE_CONFIG: Record<string, {
  label: string;
  badge: string;
  border: string;
  headerBg: string;
  avatarRing: string;
}> = {
  motoboy: {
    label: 'Motoboy',
    badge: 'bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-400/40',
    border: 'border-orange-400/50',
    headerBg: 'from-orange-500/8 to-transparent',
    avatarRing: 'ring-orange-400/60',
  },
  merchant: {
    label: 'Lojista',
    badge: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-400/40',
    border: 'border-emerald-400/50',
    headerBg: 'from-emerald-500/8 to-transparent',
    avatarRing: 'ring-emerald-400/60',
  },
  passenger: {
    label: 'Passageiro',
    badge: 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-400/40',
    border: 'border-blue-400/50',
    headerBg: 'from-blue-500/8 to-transparent',
    avatarRing: 'ring-blue-400/60',
  },
  driver: {
    label: 'Motorista',
    badge: 'bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-400/40',
    border: 'border-slate-400/40',
    headerBg: 'from-slate-500/5 to-transparent',
    avatarRing: 'ring-slate-400/50',
  },
  mototaxi: {
    label: 'Moto-Táxi',
    badge: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-400/40',
    border: 'border-cyan-400/40',
    headerBg: 'from-cyan-500/5 to-transparent',
    avatarRing: 'ring-cyan-400/50',
  },
  freteiro: {
    label: 'Freteiro',
    badge: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-400/40',
    border: 'border-amber-400/40',
    headerBg: 'from-amber-500/5 to-transparent',
    avatarRing: 'ring-amber-400/50',
  },
};

const ADMIN_CONFIG = {
  label: 'Admin',
  badge: 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-400/40',
  border: 'border-red-400/40',
  headerBg: 'from-red-500/6 to-transparent',
  avatarRing: 'ring-red-400/50',
};

const NEUTRAL = {
  border: 'border-border/60',
  headerBg: 'from-transparent to-transparent',
  avatarRing: 'ring-border/40',
};

/** Get dominant profile theme for card-level accent */
function getCardTheme(user: UserWithData) {
  // Priority: motoboy > merchant > passenger > admin > neutral
  const priority = ['motoboy', 'merchant', 'passenger', 'driver', 'mototaxi', 'freteiro'];
  for (const p of priority) {
    if (user.availableProfiles.includes(p)) return PROFILE_CONFIG[p];
  }
  if (user.isAdmin) return ADMIN_CONFIG;
  return NEUTRAL;
}

function getInitials(name: string | null): string {
  if (!name) return '??';
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase();
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserWithData[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserWithData[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchUsers() {
      const { data } = await getAllUsers();
      setUsers(data || []);
      setFilteredUsers(data || []);
      setIsLoading(false);
    }
    fetchUsers();
  }, []);

  useEffect(() => {
    const filtered = users.filter(
      (user) =>
        user.name?.toLowerCase().includes(search.toLowerCase()) ||
        user.email?.toLowerCase().includes(search.toLowerCase())
    );
    setFilteredUsers(filtered);
  }, [search, users]);

  const adminCount = users.filter((u) => u.isAdmin).length;
  const activeCount = users.filter((u) => u.is_active).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Gestão de Usuários</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visão completa de todos os usuários da plataforma
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: users.length, icon: Users, accent: 'text-primary' },
          { label: 'Ativos', value: activeCount, icon: UserCheck, accent: 'text-emerald-500' },
          { label: 'Admins', value: adminCount, icon: Shield, accent: 'text-red-400' },
          { label: 'Com Override', value: users.filter((u) => u.hasOverride).length, icon: Eye, accent: 'text-amber-400' },
        ].map((kpi) => (
          <Card key={kpi.label} className="border-border/60 bg-card/80 backdrop-blur-sm">
            <CardContent className="flex items-center gap-3 py-3 px-4">
              <kpi.icon className={`h-5 w-5 ${kpi.accent} shrink-0`} />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{kpi.label}</p>
                <p className={`text-xl font-bold ${kpi.accent}`}>{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-card/80 border-border/60"
        />
      </div>

      {/* Users Grid */}
      {filteredUsers.length === 0 ? (
        <Card className="border-dashed border-border/60">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-1">Nenhum usuário encontrado</h3>
            <p className="text-muted-foreground text-sm">
              {search ? 'Tente uma busca diferente' : 'Ainda não há usuários cadastrados'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredUsers.map((user) => {
            const theme = getCardTheme(user);
            return (
              <Card
                key={user.id}
                className={`group bg-card/80 backdrop-blur-sm hover:shadow-lg transition-all duration-200 ${theme.border}`}
              >
                {/* Colored header strip */}
                <div className={`h-1.5 rounded-t-lg bg-gradient-to-r ${theme.headerBg}`} />

                <CardContent className="p-4 pt-3">
                  <div className="flex items-start gap-3">
                    {/* Avatar with profile-colored ring */}
                    <Avatar className={`h-11 w-11 shrink-0 ring-2 ${theme.avatarRing}`}>
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm truncate">{user.name || 'Sem nome'}</h3>
                        {!user.is_active && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Inativo</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>

                      {/* Profile badges */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {user.isAdmin && (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${ADMIN_CONFIG.badge}`}>
                            {ADMIN_CONFIG.label}
                          </Badge>
                        )}
                        {user.availableProfiles.map((profile) => {
                          const config = PROFILE_CONFIG[profile];
                          if (!config) return null;
                          return (
                            <Badge key={profile} variant="outline" className={`text-[10px] px-1.5 py-0 border ${config.badge}`}>
                              {config.label}
                            </Badge>
                          );
                        })}
                        {!user.isAdmin && user.availableProfiles.length === 0 && (
                          <span className="text-[10px] text-muted-foreground">Nenhum perfil</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer: metrics + action */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Grupos</p>
                        <p className="text-sm font-bold">{user.groupCount}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Taxa</p>
                        <p className="text-sm font-bold text-primary">{user.commissionRate}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Créditos</p>
                        <p className="text-sm font-black text-amber-500">R$ {user.availableCredits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                      {user.hasOverride && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Override</Badge>
                      )}
                    </div>
                    <Button size="sm" className="h-8 text-xs bg-orange-500 hover:bg-orange-600 text-white border-0" asChild>
                      <Link to={`/admin/users/${user.id}`}>
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        Detalhes
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
