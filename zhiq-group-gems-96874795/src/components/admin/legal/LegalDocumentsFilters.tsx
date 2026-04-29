import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Filter, X, ChevronDown, Search } from "lucide-react";
import { useState } from "react";

interface LegalDocumentsFiltersProps {
  filterProfile: string;
  setFilterProfile: (value: string) => void;
  filterCode: string;
  setFilterCode: (value: string) => void;
  filterStatus: string;
  setFilterStatus: (value: string) => void;
  filterLanguage: string;
  setFilterLanguage: (value: string) => void;
  filterJurisdiction: string;
  setFilterJurisdiction: (value: string) => void;
  onFilter: () => void;
  onClear: () => void;
}

const PROFILE_OPTIONS = [
  { value: "all", label: "Todos os Perfis" },
  { value: "passenger", label: "Passageiro" },
  { value: "driver", label: "Motorista" },
  { value: "motoboy", label: "Motoboy" },
  { value: "mototaxi", label: "Mototáxi" },
  { value: "merchant", label: "Comerciante" },
  { value: "freteiro", label: "Freteiro" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Ativo" },
  { value: "archived", label: "Arquivado" },
];

export function LegalDocumentsFilters({
  filterProfile,
  setFilterProfile,
  filterCode,
  setFilterCode,
  filterStatus,
  setFilterStatus,
  filterLanguage,
  setFilterLanguage,
  filterJurisdiction,
  setFilterJurisdiction,
  onFilter,
  onClear,
}: LegalDocumentsFiltersProps) {
  const [isOpen, setIsOpen] = useState(true);
  const hasActiveFilters = 
    filterProfile !== "all" || 
    filterCode || 
    filterStatus !== "all" || 
    filterLanguage || 
    filterJurisdiction;

  return (
    <Card className="border-border/50 shadow-sm">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <Filter className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Filtros de Busca</h3>
                <p className="text-xs text-muted-foreground">
                  {hasActiveFilters ? "Filtros ativos" : "Clique para expandir"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                  !
                </span>
              )}
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Perfil</Label>
                <Select value={filterProfile} onValueChange={setFilterProfile}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROFILE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Código</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="terms, privacy..."
                    value={filterCode}
                    onChange={(e) => setFilterCode(e.target.value)}
                    className="h-9 pl-8"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Idioma</Label>
                <Input
                  placeholder="pt-BR"
                  value={filterLanguage}
                  onChange={(e) => setFilterLanguage(e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Jurisdição</Label>
                <Input
                  placeholder="BR"
                  value={filterJurisdiction}
                  onChange={(e) => setFilterJurisdiction(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4 pt-4 border-t border-border/50">
              <Button onClick={onFilter} size="sm" className="gap-2">
                <Search className="h-3.5 w-3.5" />
                Buscar
              </Button>
              <Button variant="ghost" size="sm" onClick={onClear} className="gap-2 text-muted-foreground">
                <X className="h-3.5 w-3.5" />
                Limpar
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
