import React, { useState, useMemo } from 'react';
import { useAdminH3Expansion, H3Cell, H3Status } from '@/hooks/useAdminH3Expansion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Play, Pause, BarChart3, Search, Download } from 'lucide-react';
import { format } from 'date-fns';

export function H3ExpansionTable() {
    const { cells, isLoading, updateCellStatus } = useAdminH3Expansion();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);
    const rowsPerPage = 10;

    const filteredCells = useMemo(() => {
        return cells.filter(c => {
            const matchSearch = c.h3_index.toLowerCase().includes(search.toLowerCase()) ||
                (c.city_name && c.city_name.toLowerCase().includes(search.toLowerCase()));
            const matchStatus = statusFilter === 'all' || c.status === statusFilter;
            return matchSearch && matchStatus;
        });
    }, [cells, search, statusFilter]);

    const paginatedCells = useMemo(() => {
        const start = (page - 1) * rowsPerPage;
        return filteredCells.slice(start, start + rowsPerPage);
    }, [filteredCells, page]);

    const totalPages = Math.ceil(filteredCells.length / rowsPerPage);

    const getStatusBadge = (status: H3Status) => {
        switch (status) {
            case 'ativo': return <Badge className="bg-green-500/20 text-green-600 border-green-500/50">Ativo</Badge>;
            case 'em_espera': return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/50">Em Espera</Badge>;
            case 'downloads': return <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/50">Downloads</Badge>;
        }
    };

    return (
        <Card className="bg-background border-border/50 shadow-sm mt-4">
            <div className="p-4 flex flex-col sm:flex-row justify-between items-center gap-4 border-b">
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar índice H3 ou cidade..."
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
                            <TableHead className="pl-6">H3 Index</TableHead>
                            <TableHead>Cidade</TableHead>
                            <TableHead>Downloads</TableHead>
                            <TableHead>Fila</TableHead>
                            <TableHead>Motoboys</TableHead>
                            <TableHead>Lojistas</TableHead>
                            <TableHead>Corridas</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right pr-6">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={9} className="text-center py-8">Carregando células H3...</TableCell></TableRow>
                        ) : paginatedCells.length === 0 ? (
                            <TableRow><TableCell colSpan={9} className="text-center py-8">Nenhuma célula encontrada.</TableCell></TableRow>
                        ) : (
                            paginatedCells.map((c) => (
                                <TableRow key={c.id}>
                                    <TableCell className="pl-6 font-mono text-sm">{c.h3_index}</TableCell>
                                    <TableCell>{c.city_name || '-'}</TableCell>
                                    <TableCell>{c.downloads}</TableCell>
                                    <TableCell>{c.waiting_users}</TableCell>

                                    <TableCell>
                                        <span className={c.motoboys_registered >= 3 ? 'text-green-600 font-medium' : ''}>
                                            {c.motoboys_registered} / 3
                                        </span>
                                    </TableCell>

                                    <TableCell>
                                        <span className={c.merchants_registered >= 2 ? 'text-green-600 font-medium' : ''}>
                                            {c.merchants_registered} / 2
                                        </span>
                                    </TableCell>

                                    <TableCell>{c.deliveries_completed}</TableCell>
                                    <TableCell>{getStatusBadge(c.status)}</TableCell>

                                    <TableCell className="text-right pr-6">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {c.status !== 'ativo' && (
                                                    <DropdownMenuItem onClick={() => updateCellStatus(c.id, 'ativo')} className="text-green-600">
                                                        <Play className="mr-2 h-4 w-4" /> Ativar Célula
                                                    </DropdownMenuItem>
                                                )}
                                                {c.status !== 'em_espera' && (
                                                    <DropdownMenuItem onClick={() => updateCellStatus(c.id, 'em_espera')} className="text-yellow-600">
                                                        <Pause className="mr-2 h-4 w-4" /> Pausar
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuItem>
                                                    <BarChart3 className="mr-2 h-4 w-4" /> Ver Métricas
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
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
