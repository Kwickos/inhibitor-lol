'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MatchCard } from '@/components/match-card';
import { Skeleton } from '@/components/ui/skeleton';
import { QUEUE_FILTERS, type QueueFilterId } from '@/lib/constants/queues';
import { cn } from '@/lib/utils';
import type { MatchSummary } from '@/types/riot';

interface MatchListProps {
  puuid: string;
  region: string;
  initialCount?: number;
  initialMatches?: MatchSummary[];
}

const DEFAULT_COUNT = 20;

export function MatchList({ puuid, region, initialCount = DEFAULT_COUNT, initialMatches = [] }: MatchListProps) {
  const [matches, setMatches] = useState<MatchSummary[]>(initialMatches);
  const [isLoading, setIsLoading] = useState(initialMatches.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<QueueFilterId>('all');

  // Build API URL with queue filter
  const buildApiUrl = useCallback((start: number, count: number) => {
    const filter = QUEUE_FILTERS.find(f => f.id === activeFilter);
    let url = `/api/matches/${puuid}?region=${region}&count=${count}&start=${start}`;
    if (filter?.queueIds) {
      url += `&queue=${filter.queueIds.join(',')}`;
    }
    return url;
  }, [puuid, region, activeFilter]);

  // Fetch matches when filter changes
  useEffect(() => {
    async function fetchMatches() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(buildApiUrl(0, initialCount));
        if (!res.ok) throw new Error('Failed to fetch matches');

        const data = await res.json();
        setMatches(data.matches);
        setHasMore(data.hasMore);
      } catch (err) {
        setError('Failed to load match history');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchMatches();
  }, [buildApiUrl, initialCount]);

  const loadMore = async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const res = await fetch(buildApiUrl(matches.length, initialCount));
      if (!res.ok) throw new Error('Failed to fetch more matches');

      const data = await res.json();
      setMatches((prev) => [...prev, ...data.matches]);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleFilterChange = (filterId: QueueFilterId) => {
    if (filterId === activeFilter) return;
    setActiveFilter(filterId);
    setMatches([]);
    setHasMore(true);
  };

  return (
    <div className="space-y-3">
      {/* Header with filters */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Match History</h2>
          {!isLoading && (
            <div className="text-sm text-muted-foreground">
              {matches.length} games
            </div>
          )}
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
      {!isLoading && !error && matches.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No matches found for this filter</p>
        </div>
      )}

      {/* Match list */}
      {!isLoading && !error && matches.length > 0 && (
        <>
          <div className="space-y-2">
            {matches.map((match, index) => (
              <MatchCard key={match.matchId} match={match} currentPuuid={puuid} region={region} delay={index * 0.03} />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="gap-2"
              >
                {isLoadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                Load More
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
