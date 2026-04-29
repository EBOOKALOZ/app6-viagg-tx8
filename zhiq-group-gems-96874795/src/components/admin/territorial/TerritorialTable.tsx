import React, { useState, useMemo } from 'react';
import { useAdminTerritorialExpansion, SCCity, SC_City_Status, SCNeighborhood } from '@/hooks/useAdminTerritorialExpansion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Play, Pause, BarChart3, Search, Download, ChevronRight, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';

const getStatusBadge = (status: SC_City_Status) => {
    switch (status) {
        case 'ativo': return <Badge className="bg-green-500/20 text-green-600 border-green-500/50">Ativo</Badge>;
        case 'em_espera': return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/50">Em Espera</Badge>;
        case 'downloads': return <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/50">Downloads</Badge>;
        default: return <Badge variant="outline">{status}</Badge>;
    }
};

function InnerNeighborhoodTable({ neighborhoods }: { neighborhoods: SCNeighborhood[] }) {
    if (!neighborhoods || neighborhoods.length === 0) {
        return <div className="p-4 text-center text-sm text-muted-foreground w-full">Nenhum bairro cadastrado para esta cidade.</div>;
    }
    return (
        <div className="bg-slate-50/50 dark:bg-slate-900/50 p-4 border border-border/50 rounded-md m-2">
            <h4 className="font-semibold text-sm mb-3">Bairros Controlados</h4>
            <Table>
                <TableHeader className="bg-background">
                    <TableRow>
                        <TableHead>Bairro</TableHead>
                        <TableHead>Downloads app</TableHead>
                        <TableHead>Fila de Espera</TableHead>
                        <TableHead>Motoboys</TableHead>
                        <TableHead>Lojistas</TableHead>
                        <TableHead>Status Automático</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {neighborhoods.map(nb => (
                        <TableRow key={nb.id} className="bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800">
                            <TableCell className="font-medium text-sm">{nb.neighborhood_name}</TableCell>
                            <TableCell className="text-sm">{nb.downloads}</TableCell>
                            <TableCell className="text-sm">{nb.waiting_users}</TableCell>
                            <TableCell className="text-sm">
                                <span className={nb.motoboys_registered >= 5 ? 'text-green-600 font-medium' : ''}>
                                    {nb.motoboys_registered} / 5
                                </span>
                            </TableCell>
                            <TableCell className="text-sm">
                                <span className={nb.merchants_registered >= 3 ? 'text-green-600 font-medium' : ''}>
                                    {nb.merchants_registered} / 3
                                </span>
                            </TableCell>
                            <TableCell>{getStatusBadge(nb.neighborhood_status)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-2">*Um bairro ativa automaticamente quando: motoboys &gt;= 5 E lojistas &gt;= 3.</p>
        </div>
    );
}

export function TerritorialTable() {
    const { cities, isLoading, updateCityStatus } = useAdminTerritorialExpansion();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [expandedCityId, setExpandedCityId] = useState<string | null>(null);
    const rowsPerPage = 10;

    const filteredCities = useMemo(() => {
        return cities.filter(c => {
            const matchSearch = c.city_name.toLowerCase().includes(search.toLowerCase());
            const matchStatus = statusFilter === 'all' || c.city_status === statusFilter;
            return matchSearch && matchStatus;
        });
    }, [cities, search, statusFilter]);

    const paginatedCities = useMemo(() => {
        const start = (page - 1) * rowsPerPage;
        return filteredCities.slice(start, start + rowsPerPage);
    }, [filteredCities, page]);

    const totalPages = Math.ceil(filteredCities.length / rowsPerPage);

    const toggleRow = (id: string) => {
        setExpandedCityId(expandedCityId === id ? null : id);
    };

    return (
        <Card className="bg-background border-border/50 shadow-sm mt-4">
            <div className="p-4 flex flex-col sm:flex-row justify-between items-center gap-4 border-b">
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar cidade..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                        className="pl-9"
                    />
                </div>
                <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-full sm:w-48">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos os Status</SelectItem>
                        <SelectItem value="ativo">Ativos</SelectItem>
                        <SelectItem value="em_espera">Em Espera</SelectItem>
                        <SelectItem value="downloads">Fase de Download</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-8"></TableHead>
                            <TableHead>Cidade</TableHead>
                            <TableHead>Downloads app</TableHead>
                            <TableHead>Fila de Espera</TableHead>
                            <TableHead>Qtd Bairros Ativos</TableHead>
                            <TableHead>Status (Cidade Mãe)</TableHead>
                            <TableHead className="text-right pr-6">Ações Manuais</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-8">Carregando cidades...</TableCell></TableRow>
                        ) : paginatedCities.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-8">Nenhuma cidade encontrada.</TableCell></TableRow>
                        ) : (
                            paginatedCities.map((c) => (
                                <React.Fragment key={c.id}>
                                    <TableRow className="cursor-pointer hover:bg-muted/50 transition-colors group" onClick={() => toggleRow(c.id)}>
                                        <TableCell className="w-8 text-muted-foreground group-hover:text-primary">
                                            {expandedCityId === c.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                        </TableCell>
                                        <TableCell className="font-medium text-base">
                                            {c.city_name}
                                        </TableCell>
                                        <TableCell>{c.downloads}</TableCell>
                                        <TableCell>{c.waiting_users}</TableCell>
                                        <TableCell>
                                            <Badge variant={c.active_neighborhoods_count && c.active_neighborhoods_count > 0 ? "default" : "secondary"} className="bg-primary/20 text-primary hover:bg-primary/30 font-bold border-none">
                                                {c.active_neighborhoods_count || 0} / {(c.neighborhoods || []).length}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{getStatusBadge(c.city_status)}</TableCell>
                                        <TableCell className="text-right pr-6" onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    {c.city_status !== 'ativo' && (
                                                        <DropdownMenuItem onClick={() => updateCityStatus(c.id, 'ativo')} className="text-green-600">
                                                            <Play className="mr-2 h-4 w-4" /> Forçar Ativação
                                                        </DropdownMenuItem>
                                                    )}
                                                    {c.city_status !== 'em_espera' && (
                                                        <DropdownMenuItem onClick={() => updateCityStatus(c.id, 'em_espera')} className="text-yellow-600">
                                                            <Pause className="mr-2 h-4 w-4" /> Forçar Espera
                                                        </DropdownMenuItem>
                                                    )}
                                                    {c.city_status !== 'downloads' && (
                                                        <DropdownMenuItem onClick={() => updateCityStatus(c.id, 'downloads')} className="text-blue-600">
                                                            <Download className="mr-2 h-4 w-4" /> Fase de Downloads
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem>
                                                        <BarChart3 className="mr-2 h-4 w-4" /> Ver Métricas
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>

                                    {expandedCityId === c.id && (
                                        <TableRow className="bg-slate-50/30 dark:bg-slate-900/30 border-b">
                                            <TableCell colSpan={7} className="p-0">
                                                <InnerNeighborhoodTable neighborhoods={c.neighborhoods || []} />
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </React.Fragment>
                            ))
                        )}
                    </TableBody>
                </Table>

                {totalPages > 1 && (
                    <div className="flex items-center justify-between p-4 border-t border-border/50">
                        <div className="text-sm text-muted-foreground">
                            Página {page} de {totalPages}
                        </div>
                        <div className="flex space-x-2">
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                                Anterior
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                                Próxima
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
