'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MatchCard } from '@/components/match-card';
import { Skeleton } from '@/components/ui/skeleton';
import { QUEUE_FILTERS, type QueueFilterId } from '@/lib/constants/queues';
import { cn } from '@/lib/utils';
import type { MatchSummary } from '@/types/riot';

interface MatchListProps {
  puuid: string;
  region: string;
  initialMatches?: MatchSummary[];
}

interface GroupedMatches {
  date: string;
  label: string;
  matches: MatchSummary[];
  wins: number;
  losses: number;
}

const TOTAL_GAMES = 50;
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

export function MatchList({ puuid, region, initialMatches = [] }: MatchListProps) {
  const [allMatches, setAllMatches] = useState<MatchSummary[]>(initialMatches);
  const [isLoading, setIsLoading] = useState(initialMatches.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<QueueFilterId>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Build API URL with queue filter
  const buildApiUrl = useCallback(() => {
    const filter = QUEUE_FILTERS.find(f => f.id === activeFilter);
    let url = `/api/matches/${puuid}?region=${region}&count=${TOTAL_GAMES}&start=0`;
    if (filter?.queueIds) {
      url += `&queue=${filter.queueIds.join(',')}`;
    }
    return url;
  }, [puuid, region, activeFilter]);

  // Fetch all matches when filter changes
  useEffect(() => {
    async function fetchMatches() {
      setIsLoading(true);
      setError(null);
      setCurrentPage(1);
      try {
        const res = await fetch(buildApiUrl());
        if (!res.ok) throw new Error('Failed to fetch matches');

        const data = await res.json();
        setAllMatches(data.matches);
      } catch (err) {
        setError('Failed to load match history');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchMatches();
  }, [buildApiUrl]);

  const handleFilterChange = (filterId: QueueFilterId) => {
    if (filterId === activeFilter) return;
    setActiveFilter(filterId);
    setAllMatches([]);
    setCurrentPage(1);
  };

  // Pagination logic
  const totalPages = Math.ceil(allMatches.length / GAMES_PER_PAGE);
  const startIndex = (currentPage - 1) * GAMES_PER_PAGE;
  const endIndex = startIndex + GAMES_PER_PAGE;
  const currentMatches = allMatches.slice(startIndex, endIndex);

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

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-3"
      >
        <h2 className="text-lg font-semibold">Match History</h2>

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
      {!isLoading && !error && allMatches.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No matches found for this filter</p>
        </div>
      )}

      {/* Match list grouped by day */}
      {!isLoading && !error && allMatches.length > 0 && (
        <>
          <div className="space-y-6">
            {groupedMatches.map((group, groupIndex) => (
              <motion.div
                key={group.date}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: groupIndex * 0.1 }}
              >
                {/* Day header */}
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

                {/* Matches for this day */}
                <div className="space-y-2">
                  {group.matches.map((match, index) => (
                    <MatchCard
                      key={match.matchId}
                      match={match}
                      currentPuuid={puuid}
                      region={region}
                      delay={index * 0.02}
                    />
                  ))}
                </div>
              </motion.div>
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
