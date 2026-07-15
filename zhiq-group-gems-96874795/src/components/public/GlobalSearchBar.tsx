import React, { useState, useEffect, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/useDebounce";
import { GlobalSearchService, GlobalSearchResult } from "@/services/GlobalSearchService";

interface GlobalSearchBarProps {
  initialValue?: string;
}

const PLACEHOLDERS = [
  "Buscar produtos...",
  "Encontre serviços...",
  "Pesquisar imóveis...",
  "Encontrar motoboys...",
  "Promoções perto de você...",
  "O que você procura hoje?"
];

export function GlobalSearchBar({ initialValue = "" }: GlobalSearchBarProps) {
  const [query, setQuery] = useState(initialValue);
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<GlobalSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [fadePlaceholder, setFadePlaceholder] = useState(true);
  
  const debouncedQuery = useDebounce(query, 300);
  const navigate = useNavigate();
  const location = useLocation();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Efeito rotativo de placeholders inteligentes com transição fade e pausa durante digitação/foco
  useEffect(() => {
    const timer = setInterval(() => {
      // Nunca trocar durante a digitação do usuário ou quando focado
      if (isFocused || query.trim().length > 0) return;

      setFadePlaceholder(false);
      setTimeout(() => {
        setPlaceholderIdx((prev) => (prev + 1) % PLACEHOLDERS.length);
        setFadePlaceholder(true);
      }, 200);
    }, 4000);
    return () => clearInterval(timer);
  }, [isFocused, query]);

  // Sync initial value if url changes
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (location.pathname === "/busca") {
      setQuery(params.get("q") || "");
    }
  }, [location.search, location.pathname]);

  // Fetch suggestions
  useEffect(() => {
    let active = true;

    if (debouncedQuery.trim().length >= 2) {
      setIsLoading(true);
      GlobalSearchService.searchAll(debouncedQuery).then(results => {
        if (!active) return;
        setSuggestions(results.slice(0, 8)); // Top 8 suggestions
        setIsLoading(false);
      });
    } else {
      setSuggestions([]);
    }

    return () => { active = false; };
  }, [debouncedQuery]);

  // Handle outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (query.trim()) {
      setIsFocused(false);
      navigate(`/busca?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleSuggestionClick = (suggestion: GlobalSearchResult) => {
    setIsFocused(false);
    navigate(suggestion.routePath);
  };

  return (
    <div className="relative flex-1 min-w-0" ref={wrapperRef}>
      <form
        onSubmit={handleSubmit}
        className="relative flex w-full items-center h-[48px] bg-white rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-[#68C7F2]/60 focus-within:border-[#68C7F2] focus-within:ring-2 focus-within:ring-[#68C7F2]/80 focus-within:shadow-[0_2px_16px_rgba(104,199,242,0.3)] focus-within:scale-[1.008] transition-all duration-200 ease-out overflow-hidden"
      >
        <div className="relative flex-1 h-full flex items-center pl-5 pr-3">
          {/* Placeholder inteligente animado (fade + transform) */}
          {query.length === 0 && (
            <span
              className={`absolute left-5 text-gray-400 text-[15px] font-medium pointer-events-none select-none transition-all duration-200 ${
                fadePlaceholder ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1.5"
              }`}
            >
              {PLACEHOLDERS[placeholderIdx]}
            </span>
          )}
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            aria-label="Campo de pesquisa global da VIAGG-TX8"
            className="w-full h-full border-0 bg-transparent text-gray-800 text-[15px] font-medium focus-visible:ring-0 shadow-none px-0"
          />
        </div>
        <button 
          type="submit"
          aria-label="Buscar"
          className="h-[38px] px-5 mr-1.5 my-1 bg-[#FF6A00] hover:bg-[#e65c00] hover:brightness-110 hover:shadow-md active:scale-95 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#FF6A00] outline-none transition-all duration-150 rounded-[20px] flex items-center justify-center gap-2 shrink-0 shadow-sm text-white font-black text-sm cursor-pointer"
        >
          <Search className="h-4 w-4 text-white shrink-0 transition-transform duration-150 group-hover:scale-110" />
          <span className="hidden sm:inline">Buscar</span>
        </button>
      </form>

      {/* Autocomplete Dropdown */}
      {isFocused && query.trim().length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-zinc-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {isLoading && suggestions.length === 0 ? (
            <div className="p-4 flex items-center justify-center text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Buscando na plataforma...</span>
            </div>
          ) : suggestions.length > 0 ? (
            <div className="max-h-[60vh] overflow-y-auto">
              {suggestions.map((item) => (
                <div 
                  key={`${item.category}-${item.id}`}
                  onClick={() => handleSuggestionClick(item)}
                  className="px-4 py-3 hover:bg-zinc-50 border-b border-zinc-100 last:border-0 cursor-pointer flex items-center gap-3 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-zinc-100 shrink-0 overflow-hidden">
                    {item.thumbnail_url ? (
                      <img src={item.thumbnail_url} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-400">
                        <Search className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-zinc-800 truncate">{item.title}</h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[#FF6A00]">
                        {item.categoryLabel}
                      </span>
                      {item.location && (
                        <span className="text-xs text-zinc-500 truncate">• {item.location}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div 
                className="p-3 bg-zinc-50 text-center text-sm font-bold text-[#FF6A00] hover:bg-zinc-100 cursor-pointer transition-colors"
                onClick={handleSubmit}
              >
                Ver todos os resultados para "{query}"
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-zinc-500">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Nenhum resultado encontrado para "{query}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
