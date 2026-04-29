import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface CategoriaAutocompleteProps {
    valueId: string;
    valueName: string;
    onChange: (id: string, name: string) => void;
    theme?: "dark" | "light";
}

export function CategoriaAutocomplete({
    valueId,
    valueName,
    onChange,
    theme = "dark"
}: CategoriaAutocompleteProps) {
    const [query, setQuery] = useState(valueName || "");
    const [results, setResults] = useState<{ id: string; nome: string }[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Sync external name in case it's loaded asynchronously
    useEffect(() => {
        if (valueName && !query && !isOpen) {
            setQuery(valueName);
        }
    }, [valueName, query, isOpen]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        // Se a query for vazia, limpamos a busca e avisamos o pai se havia algo
        if (!query) {
            setResults([]);
            setIsOpen(false);
            if (valueId) onChange("", "");
            return;
        }

        // Se a query é exatamente o nome que ja foi validado/selecionado, evitamos buscar novamente à toa
        if (query === valueName) {
            return;
        }

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase.rpc("search_categorias_loja", { p_texto: query } as any);
                if (!error && data) {
                    setResults(data);
                    setIsOpen(true);
                }
            } catch (e) {
                console.error("Erro ao buscar categorias", e);
            }
            setLoading(false);
        }, 400);

        return () => clearTimeout(timer);
    }, [query, valueName, valueId]);

    const isDark = theme === "dark";

    return (
        <div className="relative" ref={wrapperRef}>
            <Input
                placeholder="Digite a categoria"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    // Limpa o item no pai se o usuário começar a customizar/apagar, 
                    // para garantir que ele seja forçado a escolher algo valido da lista
                    if (valueId) {
                        onChange("", "");
                    }
                }}
                onFocus={() => {
                    if (results.length > 0) setIsOpen(true);
                }}
                className={isDark
                    ? "bg-white/5 border-white/10 text-white placeholder:text-white/30"
                    : "bg-background border-input text-foreground"
                }
            />
            {loading && (
                <div className="absolute right-3 top-3">
                    <Loader2 className={isDark ? "h-4 w-4 animate-spin text-white/50" : "h-4 w-4 animate-spin text-muted-foreground"} />
                </div>
            )}

            {isOpen && results.length > 0 && (
                <div className={isDark
                    ? "absolute z-[9999] w-full mt-1 bg-neutral-900 border border-white/10 rounded-md shadow-[0_4px_24px_rgba(0,0,0,0.8)] max-h-60 overflow-auto"
                    : "absolute z-[9999] w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto"
                }>
                    {results.map((cat) => (
                        <button
                            key={cat.id}
                            className={isDark
                                ? "w-full text-left px-4 py-2 text-sm text-white hover:bg-emerald-600/50 transition-colors"
                                : "w-full text-left px-4 py-2 text-sm text-black hover:bg-gray-100 transition-colors"
                            }
                            onClick={(e) => {
                                e.preventDefault();
                                setQuery(cat.nome);
                                onChange(cat.id, cat.nome);
                                setIsOpen(false);
                            }}
                        >
                            {cat.nome}
                        </button>
                    ))}
                </div>
            )}

            {isOpen && results.length === 0 && query.length > 1 && !loading && (
                <div className={isDark
                    ? "absolute z-[9999] w-full mt-1 bg-neutral-900 border border-white/10 rounded-md shadow-lg p-4 text-center text-white/50 text-sm"
                    : "absolute z-[9999] w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-4 text-center text-gray-500 text-sm"
                }>
                    Nenhuma categoria encontrada para "{query}"
                </div>
            )}
        </div>
    );
}
