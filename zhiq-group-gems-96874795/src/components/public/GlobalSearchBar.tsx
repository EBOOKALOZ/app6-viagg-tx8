import React, { useState, useEffect, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/useDebounce";
import { GlobalSearchService, GlobalSearchResult } from "@/services/GlobalSearchService";

interface GlobalSearchBarProps {
  initialValue?: string;
}

export function GlobalSearchBar({ initialValue = "" }: GlobalSearchBarProps) {
  const [query, setQuery] = useState(initialValue);
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<GlobalSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const debouncedQuery = useDebounce(query, 300);
  const navigate = useNavigate();
  const location = useLocation();
  const wrapperRef = useRef<HTMLDivElement>(null);

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
      <form onSubmit={handleSubmit} className="relative flex w-full">
        <Input
          placeholder="Buscar produtos, serviços, carros, imóveis..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          className="w-full pl-4 pr-10 h-[44px] rounded-l-xl rounded-r-none border-0 bg-white text-gray-700 placeholder:text-gray-400 text-[15px] font-medium focus-visible:ring-0 shadow-inner"
        />
        <button 
          type="submit"
          className="px-5 bg-[#e65c00] hover:bg-[#cc5200] transition-colors rounded-r-xl flex items-center shrink-0"
        >
          <Search className="h-5 w-5 text-white" />
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
