'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MatchCard, type ChampionBenchmark } from '@/components/match-card';
import { Skeleton } from '@/components/ui/skeleton';
import { QUEUE_FILTERS, type QueueFilterId } from '@/lib/constants/queues';
import { cn } from '@/lib/utils';
import type { MatchSummary } from '@/types/riot';

interface MatchListProps {
  puuid: string;
  region: string;
  initialMatches?: MatchSummary[];
  onNewMatches?: (count: number) => void;
}

// Cache duration: 2 minutes (short to ensure fresh data after games)
const CACHE_DURATION = 2 * 60 * 1000;

interface CachedMatchData {
  matches: MatchSummary[];
  timestamp: number;
}

// Get cached data from localStorage (always cache ALL matches, filter client-side)
// Returns cache data and whether it's stale (should refresh in background)
function getCachedMatches(puuid: string): { data: CachedMatchData | null; isStale: boolean } {
  try {
    const key = `matches_${puuid}_all`;
    const cached = localStorage.getItem(key);
    if (!cached) return { data: null, isStale: false };

    const data: CachedMatchData = JSON.parse(cached);

    // Validate data structure
    if (!data || !Array.isArray(data.matches) || typeof data.timestamp !== 'number') {
      localStorage.removeItem(key); // Clear invalid cache
      return { data: null, isStale: false };
    }

    const age = Date.now() - data.timestamp;

    // Return cache if less than 2 minutes old (fresh)
    if (age < CACHE_DURATION) {
      return { data, isStale: false };
    }

    // Return stale cache (will be refreshed in background)
    // This allows showing old data immediately while fetching new
    return { data, isStale: true };
  } catch {
    return { data: null, isStale: false };
  }
}

// Save data to localStorage cache
function setCachedMatches(puuid: string, matches: MatchSummary[]): void {
  try {
    const key = `matches_${puuid}_all`;
    const data: CachedMatchData = {
      matches,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage might be full or unavailable
  }
}

interface GroupedMatches {
  date: string;
  label: string;
  matches: MatchSummary[];
  wins: number;
  losses: number;
}

const GAMES_PER_PAGE = 15;

// Helper to format date
function formatDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const matchDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (matchDate.getTime() === today.getTime()) {
    return 'Today';
  }
  if (matchDate.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  }

  // Check if within last 7 days
  const diffDays = Math.floor((today.getTime() - matchDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }

  // Otherwise show full date
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

// Group matches by day
function groupMatchesByDay(matches: MatchSummary[]): GroupedMatches[] {
  if (!matches || !Array.isArray(matches)) return [];

  const groups: Map<string, GroupedMatches> = new Map();

  matches.forEach(match => {
    const date = new Date(match.gameCreation);
    const dateKey = date.toISOString().split('T')[0];

    if (!groups.has(dateKey)) {
      groups.set(dateKey, {
        date: dateKey,
        label: formatDateLabel(date),
        matches: [],
        wins: 0,
        losses: 0,
      });
    }

    const group = groups.get(dateKey)!;
    group.matches.push(match);
    if (match.win) {
      group.wins++;
    } else {
      group.losses++;
    }
  });

  return Array.from(groups.values()).sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function MatchList({ puuid, region, initialMatches = [], onNewMatches }: MatchListProps) {
  // Initialize from cache synchronously to avoid skeleton flash
  const initialCache = useMemo(() => {
    if (initialMatches.length > 0) return { matches: initialMatches, timestamp: Date.now() };
    const { data } = getCachedMatches(puuid);
    return data;
  }, [puuid, initialMatches]);

  // All matches (unfiltered) - this is our source of truth
  const [allMatches, setAllMatches] = useState<MatchSummary[]>(initialCache?.matches || []);
  const [isLoading, setIsLoading] = useState(!initialCache);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<QueueFilterId>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(initialCache ? new Date(initialCache.timestamp) : null);
  const hasFetched = useRef(false);
  const [benchmarks, setBenchmarks] = useState<Record<string, ChampionBenchmark>>({});

  // Filter matches client-side based on active filter
  const filteredMatches = useMemo(() => {
    const filter = QUEUE_FILTERS.find(f => f.id === activeFilter);
    if (!filter?.queueIds) return allMatches; // 'all' filter
    const queueIds = filter.queueIds as readonly number[];
    return allMatches.filter(match => queueIds.includes(match.queueId));
  }, [allMatches, activeFilter]);

  // Fetch matches with background refresh pattern
  // 1. First call: get DB matches immediately (fast)
  // 2. Second call: check for new matches in background
  const fetchMatches = useCallback(async (forceRefresh = false) => {
    const { data: cached, isStale } = getCachedMatches(puuid);

    // Show cached data immediately if available
    if (cached && !forceRefresh) {
      setAllMatches(cached.matches);
      setLastUpdated(new Date(cached.timestamp));
      setIsLoading(false);

      // If cache is stale, refresh in background
      if (isStale) {
        // Background refresh - don't show loading state
        fetch(`/api/matches/${puuid}?region=${region}&refresh=true`)
          .then(res => res.json())
          .then(data => {
            if (data.matches && data.matches.length > 0) {
              setAllMatches(data.matches);
              setLastUpdated(new Date());
              setCachedMatches(puuid, data.matches);
              // Notify parent if new matches were found (game ended)
              if (data.newMatches > 0 && onNewMatches) {
                onNewMatches(data.newMatches);
              }
            }
          })
          .catch(console.error);
      }
      return;
    }

    // No cache - need to fetch
    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      // First: get DB matches quickly (no refresh)
      const fastRes = await fetch(`/api/matches/${puuid}?region=${region}`);
      if (!fastRes.ok) throw new Error('Failed to fetch matches');
      const fastData = await fastRes.json();

      // Show DB matches immediately
      if (fastData.matches && fastData.matches.length > 0) {
        setAllMatches(fastData.matches);
        setLastUpdated(new Date());
        setCachedMatches(puuid, fastData.matches);
        setIsLoading(false);

        // Then: check for new matches in background
        fetch(`/api/matches/${puuid}?region=${region}&refresh=true`)
          .then(res => res.json())
          .then(data => {
            if (data.newMatches > 0 && data.matches) {
              setAllMatches(data.matches);
              setLastUpdated(new Date());
              setCachedMatches(puuid, data.matches);
              // Notify parent if new matches were found (game ended)
              if (onNewMatches) {
                onNewMatches(data.newMatches);
              }
            }
          })
          .catch(console.error)
          .finally(() => setIsRefreshing(false));
      } else {
        // No matches in DB - do full refresh
        const refreshRes = await fetch(`/api/matches/${puuid}?region=${region}&refresh=true`);
        if (!refreshRes.ok) throw new Error('Failed to fetch matches');
        const refreshData = await refreshRes.json();

        setAllMatches(refreshData.matches || []);
        setLastUpdated(new Date());
        if (refreshData.matches?.length > 0) {
          setCachedMatches(puuid, refreshData.matches);
        }
      }
    } catch (err) {
      if (!cached) {
        setError('Failed to load match history');
      }
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [puuid, region, onNewMatches]);

  // Fetch benchmarks for all champions in current matches
  const fetchBenchmarks = useCallback(async (matches: MatchSummary[]) => {
    if (matches.length === 0) return;

    // Get unique champion IDs from all matches (player + participants)
    const championIds = new Set<number>();
    matches.forEach(match => {
      championIds.add(match.participant.championId);
      match.allParticipants?.forEach(p => championIds.add(p.championId));
    });

    if (championIds.size === 0) return;

    try {
      const res = await fetch(`/api/champion-benchmarks?championIds=${Array.from(championIds).join(',')}`);
      if (res.ok) {
        const data = await res.json();
        setBenchmarks(data);
      }
    } catch (err) {
      console.error('Failed to fetch benchmarks:', err);
    }
  }, []);

  // Initial fetch - only once
  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchMatches(false);
    }
  }, [fetchMatches]);

  // Fetch benchmarks when matches change
  useEffect(() => {
    if (allMatches.length > 0) {
      fetchBenchmarks(allMatches);
    }
  }, [allMatches, fetchBenchmarks]);

  // Manual refresh
  const handleRefresh = () => {
    fetchMatches(true);
  };

  // Handle filter change - just reset page, no refetch needed!
  const handleFilterChange = (filterId: QueueFilterId) => {
    if (filterId === activeFilter) return;
    setActiveFilter(filterId);
    setCurrentPage(1); // Reset to first page when filter changes
  };

  // Pagination logic - use filtered matches
  const totalPages = Math.ceil(filteredMatches.length / GAMES_PER_PAGE);
  const startIndex = (currentPage - 1) * GAMES_PER_PAGE;
  const endIndex = startIndex + GAMES_PER_PAGE;
  const currentMatches = filteredMatches.slice(startIndex, endIndex);

  // Group current page matches by day
  const groupedMatches = useMemo(() =>
    groupMatchesByDay(currentMatches),
    [currentMatches]
  );

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 300, behavior: 'smooth' });
    }
  };

  // Format time ago
  const getTimeAgo = (date: Date | null): string => {
    if (!date) return '';
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Match History</h2>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Updated {getTimeAgo(lastUpdated)}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8 px-2"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* Queue Filters */}
        <div className="flex flex-wrap gap-2">
          {QUEUE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              onClick={() => handleFilterChange(filter.id)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-lg transition-all',
                'border border-transparent',
                activeFilter === filter.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Loading state */}
      {isLoading && <MatchListSkeleton />}

      {/* Error state */}
      {error && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <p>{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && filteredMatches.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>{allMatches.length === 0 ? 'No matches found' : 'No matches found for this filter'}</p>
        </div>
      )}

      {/* Match list grouped by day */}
      {!isLoading && !error && filteredMatches.length > 0 && (
        <>
          <div className="space-y-6">
            {groupedMatches.map((group) => (
              <div key={group.date}>
                {/* Day header - static, no animation */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="text-sm font-medium">
                    {group.label}
                  </div>
                  <div className="h-px flex-1 bg-border/50" />
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-primary font-medium">{group.wins}W</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-[#ef4444] font-medium">{group.losses}L</span>
                  </div>
                </div>

                {/* Matches for this day - only these animate */}
                <div className="space-y-2">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {group.matches.map((match) => (
                      <motion.div
                        key={match.matchId}
                        layout="position"
                        initial={{ opacity: 0, x: -20, scale: 0.98 }}
                        animate={{
                          opacity: 1,
                          x: 0,
                          scale: 1,
                        }}
                        exit={{
                          opacity: 0,
                          x: 40,
                          scale: 0.98,
                        }}
                        transition={{
                          type: 'spring',
                          stiffness: 400,
                          damping: 28,
                          mass: 0.8,
                          opacity: { duration: 0.15 }
                        }}
                      >
                        <MatchCard
                          match={match}
                          currentPuuid={puuid}
                          region={region}
                          delay={0}
                          benchmarks={benchmarks}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-6">
              <Button
                variant="outline"
                size="icon"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-9 w-9"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  const showPage =
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(page - currentPage) <= 1;

                  const showEllipsis =
                    (page === 2 && currentPage > 3) ||
                    (page === totalPages - 1 && currentPage < totalPages - 2);

                  if (showEllipsis && !showPage) {
                    return (
                      <span key={page} className="px-2 text-muted-foreground">
                        ...
                      </span>
                    );
                  }

                  if (!showPage) return null;

                  return (
                    <Button
                      key={page}
                      variant={currentPage === page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => goToPage(page)}
                      className={cn(
                        'h-9 w-9',
                        currentPage === page && 'bg-primary text-primary-foreground'
                      )}
                    >
                      {page}
                    </Button>
                  );
                })}
              </div>

              <Button
                variant="outline"
                size="icon"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="h-9 w-9"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

        </>
      )}
    </div>
  );
}

function MatchListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}
