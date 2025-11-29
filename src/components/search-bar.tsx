'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Star, ChevronDown, X, Loader2, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { REGION_LIST, REGION_GROUPS, type RegionKey } from '@/lib/constants/regions';
import { useFavorites, type Favorite } from '@/hooks/use-favorites';
import { useSearchHistory } from '@/hooks/use-search-history';
import { cn } from '@/lib/utils';

interface PlayerSuggestion {
  puuid: string;
  gameName: string;
  tagLine: string;
  region: string;
  profileIconId: number;
  profileIconUrl: string;
  summonerLevel: number;
}

interface SearchBarProps {
  className?: string;
  autoFocus?: boolean;
  size?: 'default' | 'large';
}

type SelectableItem = (PlayerSuggestion | Favorite) & { type: 'player' | 'favorite' };

export function SearchBar({ className, autoFocus = false, size = 'default' }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<RegionKey>('euw');
  const [isRegionOpen, setIsRegionOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<PlayerSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const { favorites, isLoaded: favoritesLoaded } = useFavorites();
  const { addToHistory } = useSearchHistory();

  // Combined list of selectable items
  const selectableItems = useMemo<SelectableItem[]>(() => {
    const items: SelectableItem[] = [];

    // Add suggestions first if searching
    if (query.trim().length >= 2) {
      suggestions.forEach((s) => items.push({ ...s, type: 'player' }));
    }

    // Add favorites
    favorites.forEach((f) => items.push({ ...f, type: 'favorite' } as SelectableItem));

    return items;
  }, [suggestions, favorites, query]);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [selectableItems.length]);

  // Fetch player suggestions from database
  const fetchSuggestions = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      const res = await fetch(`/api/players/search?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.players || []);
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  // Debounced search for suggestions
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        fetchSuggestions(query.trim());
      }, 300);
    } else {
      setSuggestions([]);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, fetchSuggestions]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsRegionOpen(false);
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isDropdownOpen || selectableItems.length === 0) {
      if (e.key === 'ArrowDown' && !isDropdownOpen) {
        setIsDropdownOpen(true);
        return;
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < selectableItems.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : selectableItems.length - 1
        );
        break;
      case 'Enter':
        if (selectedIndex >= 0 && selectedIndex < selectableItems.length) {
          e.preventDefault();
          handleQuickSearch(selectableItems[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsDropdownOpen(false);
        setSelectedIndex(-1);
        break;
    }
  }, [isDropdownOpen, selectableItems, selectedIndex]);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    // Parse gameName#tagLine format
    let gameName = trimmedQuery;
    let tagLine = selectedRegion.toUpperCase();

    if (trimmedQuery.includes('#')) {
      const parts = trimmedQuery.split('#');
      gameName = parts[0];
      tagLine = parts[1] || tagLine;
    }

    setIsSearching(true);
    setIsDropdownOpen(false);

    // Add to search history
    addToHistory({ gameName, tagLine, region: selectedRegion });

    // Navigate to profile page (format: /region/gameName-tagLine)
    router.push(`/${selectedRegion}/${encodeURIComponent(`${gameName}-${tagLine}`)}`);
  };

  const handleQuickSearch = (item: SelectableItem) => {
    const region = item.region as RegionKey;
    setSelectedRegion(region);
    setQuery(`${item.gameName}#${item.tagLine}`);
    setIsDropdownOpen(false);
    setSuggestions([]);
    setSelectedIndex(-1);

    // Navigate directly (format: /region/gameName-tagLine)
    addToHistory({ gameName: item.gameName, tagLine: item.tagLine, region });
    router.push(`/${region}/${encodeURIComponent(`${item.gameName}-${item.tagLine}`)}`);
  };

  const selectedRegionData = REGION_LIST.find(r => r.key === selectedRegion);

  const isLarge = size === 'large';

  // Calculate index ranges for different sections
  const playerEndIndex = query.trim().length >= 2 ? suggestions.length : 0;

  return (
    <div ref={containerRef} className={cn('relative w-full max-w-2xl', className)}>
      <form onSubmit={handleSearch}>
        <div
          className={cn(
            'relative flex items-center gap-2 rounded-xl transition-all duration-200',
            isLarge
              ? 'border border-border/50 bg-card/80 backdrop-blur-sm hover:border-border hover:bg-card focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 p-2'
              : 'gap-1'
          )}
        >
          {/* Region Selector */}
          <button
            type="button"
            onClick={() => {
              setIsRegionOpen(!isRegionOpen);
              setIsDropdownOpen(false);
            }}
            className={cn(
              'flex items-center gap-1 rounded-lg font-medium transition-colors',
              isLarge
                ? 'px-3 py-2 text-sm bg-secondary/50 hover:bg-secondary'
                : 'px-2 py-1.5 text-xs bg-transparent hover:bg-muted/50',
              'text-muted-foreground hover:text-foreground',
              isRegionOpen && (isLarge ? 'bg-secondary text-foreground' : 'bg-muted/50 text-foreground')
            )}
          >
            <span className="uppercase tracking-wide">{selectedRegionData?.shortName}</span>
            <ChevronDown className={cn('h-3 w-3 transition-transform', isRegionOpen && 'rotate-180')} />
          </button>

          {/* Search Input */}
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                setIsDropdownOpen(true);
                setIsRegionOpen(false);
              }}
              onKeyDown={handleKeyDown}
              placeholder={isLarge ? "Search summoner... (Name#TAG)" : "Name#TAG"}
              autoFocus={autoFocus}
              className={cn(
                'shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50',
                isLarge
                  ? 'h-12 text-lg border-0 bg-transparent'
                  : 'h-9 text-sm border-border/50 bg-background/50 rounded-lg'
              )}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSuggestions([]);
                  setSelectedIndex(-1);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Search Button */}
          <Button
            type="submit"
            disabled={!query.trim() || isSearching}
            size={isLarge ? 'lg' : 'icon'}
            className={cn(
              'rounded-lg bg-primary hover:bg-primary/90 transition-all',
              !isLarge && 'h-9 w-9'
            )}
          >
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {isLarge && <span className="hidden sm:inline ml-2">Search</span>}
          </Button>
        </div>
      </form>

      {/* Region Dropdown */}
      <AnimatePresence>
        {isRegionOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 w-72 rounded-xl border border-border/50 bg-card/95 backdrop-blur-md shadow-xl z-50 overflow-hidden"
          >
            <div className="p-2 space-y-2 max-h-80 overflow-y-auto">
              {Object.entries(REGION_GROUPS).map(([group, regions]) => (
                <div key={group}>
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {group}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {regions.map((regionKey) => {
                      const region = REGION_LIST.find(r => r.key === regionKey);
                      if (!region) return null;
                      return (
                        <button
                          key={region.key}
                          onClick={() => {
                            setSelectedRegion(region.key);
                            setIsRegionOpen(false);
                          }}
                          className={cn(
                            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                            'hover:bg-secondary',
                            selectedRegion === region.key && 'bg-primary/10 text-primary'
                          )}
                        >
                          <span className="font-medium">{region.shortName}</span>
                          <span className="text-muted-foreground text-xs truncate">{region.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suggestions & Favorites Dropdown */}
      <AnimatePresence>
        {isDropdownOpen && favoritesLoaded && (favorites.length > 0 || query.trim().length >= 2) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-border/50 bg-card/95 backdrop-blur-md shadow-xl z-50 overflow-hidden"
          >
            <div className="max-h-80 overflow-y-auto">
              {/* Player Suggestions */}
              {query.trim().length >= 2 && (
                <div className={cn("p-2", favorites.length > 0 && "border-b border-border/50")}>
                  <div className="px-2 py-1 flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <Users className="h-3 w-3" />
                    Players
                    {isLoadingSuggestions && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                  </div>
                  {suggestions.map((player, idx) => (
                    <button
                      key={player.puuid}
                      onClick={() => handleQuickSearch({ ...player, type: 'player' })}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left",
                        selectedIndex === idx
                          ? "bg-secondary"
                          : "hover:bg-secondary/50"
                      )}
                    >
                      <img
                        src={player.profileIconUrl}
                        alt=""
                        className="h-8 w-8 rounded-full bg-muted"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {player.gameName}
                          <span className="text-muted-foreground">#{player.tagLine}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">Level {player.summonerLevel}</div>
                      </div>
                      <span className="text-xs text-muted-foreground uppercase">{player.region}</span>
                    </button>
                  ))}
                  {!isLoadingSuggestions && suggestions.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No players found</div>
                  )}
                </div>
              )}

              {/* Favorites */}
              {favorites.length > 0 && (
                <div className="p-2">
                  <div className="px-2 py-1 flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <Star className="h-3 w-3 fill-current" />
                    Favorites
                  </div>
                  {favorites.map((fav, idx) => {
                    const itemIndex = playerEndIndex + idx;
                    return (
                      <button
                        key={fav.puuid}
                        onClick={() => handleQuickSearch({ ...fav, type: 'favorite' } as SelectableItem)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left",
                          selectedIndex === itemIndex
                            ? "bg-secondary"
                            : "hover:bg-secondary/50"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {fav.gameName}
                            <span className="text-muted-foreground">#{fav.tagLine}</span>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground uppercase">{fav.region}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
