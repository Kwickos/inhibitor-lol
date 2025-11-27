'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Star, Clock, ChevronDown, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { REGION_LIST, REGION_GROUPS, type RegionKey } from '@/lib/constants/regions';
import { useFavorites, type Favorite } from '@/hooks/use-favorites';
import { useSearchHistory, type SearchHistoryItem } from '@/hooks/use-search-history';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  className?: string;
  autoFocus?: boolean;
  size?: 'default' | 'large';
}

export function SearchBar({ className, autoFocus = false, size = 'default' }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<RegionKey>('euw');
  const [isRegionOpen, setIsRegionOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { favorites, isLoaded: favoritesLoaded } = useFavorites();
  const { history, addToHistory, isLoaded: historyLoaded } = useSearchHistory();

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

    // Add to search history
    addToHistory({ gameName, tagLine, region: selectedRegion });

    // Navigate to profile page (format: /region/gameName-tagLine)
    router.push(`/${selectedRegion}/${encodeURIComponent(`${gameName}-${tagLine}`)}`);
  };

  const handleQuickSearch = (item: Favorite | SearchHistoryItem) => {
    const region = item.region as RegionKey;
    setSelectedRegion(region);
    setQuery(`${item.gameName}#${item.tagLine}`);
    setIsDropdownOpen(false);

    // Navigate directly (format: /region/gameName-tagLine)
    addToHistory({ gameName: item.gameName, tagLine: item.tagLine, region });
    router.push(`/${region}/${encodeURIComponent(`${item.gameName}-${item.tagLine}`)}`);
  };

  const selectedRegionData = REGION_LIST.find(r => r.key === selectedRegion);

  const isLarge = size === 'large';

  return (
    <div ref={containerRef} className={cn('relative w-full max-w-2xl', className)}>
      <form onSubmit={handleSearch}>
        <div
          className={cn(
            'relative flex items-center gap-2 rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-200',
            'hover:border-border hover:bg-card',
            'focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20',
            isLarge ? 'p-2' : 'p-1.5'
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
              'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground',
              isRegionOpen && 'bg-secondary text-foreground'
            )}
          >
            <span className="uppercase tracking-wide">{selectedRegionData?.shortName}</span>
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isRegionOpen && 'rotate-180')} />
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
              placeholder="Search summoner... (Name#TAG)"
              autoFocus={autoFocus}
              className={cn(
                'border-0 bg-transparent shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50',
                isLarge ? 'h-12 text-lg' : 'h-10'
              )}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
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
            size={isLarge ? 'lg' : 'default'}
            className="rounded-lg gap-2 bg-primary hover:bg-primary/90 transition-all"
          >
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Search</span>
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

      {/* Favorites & History Dropdown */}
      <AnimatePresence>
        {isDropdownOpen && favoritesLoaded && historyLoaded && (favorites.length > 0 || history.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-border/50 bg-card/95 backdrop-blur-md shadow-xl z-50 overflow-hidden"
          >
            <div className="max-h-80 overflow-y-auto">
              {/* Favorites */}
              {favorites.length > 0 && (
                <div className="p-2 border-b border-border/50">
                  <div className="px-2 py-1 flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <Star className="h-3 w-3 fill-current" />
                    Favorites
                  </div>
                  {favorites.map((fav) => (
                    <button
                      key={fav.puuid}
                      onClick={() => handleQuickSearch(fav)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {fav.gameName}
                          <span className="text-muted-foreground">#{fav.tagLine}</span>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground uppercase">{fav.region}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* History */}
              {history.length > 0 && (
                <div className="p-2">
                  <div className="px-2 py-1 flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <Clock className="h-3 w-3" />
                    Recent
                  </div>
                  {history.slice(0, 5).map((item, idx) => (
                    <button
                      key={`${item.gameName}-${item.tagLine}-${item.region}-${idx}`}
                      onClick={() => handleQuickSearch(item)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {item.gameName}
                          <span className="text-muted-foreground">#{item.tagLine}</span>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground uppercase">{item.region}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
