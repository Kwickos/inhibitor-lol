'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Crown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getChampionIconUrl } from '@/lib/riot-api';
import { cn } from '@/lib/utils';

interface ChampionStat {
  championId: number;
  championName: string;
  games: number;
  wins: number;
  losses: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgCs: number;
  winRate: number;
  kda: number;
}

interface ChampionStatsCardProps {
  puuid: string;
}

export function ChampionStatsCard({ puuid }: ChampionStatsCardProps) {
  const [stats, setStats] = useState<ChampionStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch(`/api/champion-stats/${puuid}`);
        if (!res.ok) throw new Error('Failed to fetch champion stats');
        const data = await res.json();
        setStats(data.stats.slice(0, 5)); // Top 5 champions
      } catch (error) {
        console.error('Failed to fetch champion stats:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchStats();
  }, [puuid]);

  if (isLoading) {
    return <ChampionStatsSkeleton />;
  }

  if (stats.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-card via-card to-card/80">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl" />

        <div className="relative p-5">
          {/* Header */}
          <div className="mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Top Champions</h3>
          </div>

          {/* Champion List */}
          <div className="space-y-2">
            {stats.map((stat, index) => (
              <ChampionStatRow key={stat.championId} stat={stat} index={index} isFirst={index === 0} />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ChampionStatRow({ stat, index, isFirst }: { stat: ChampionStat; index: number; isFirst: boolean }) {
  const kdaColor = stat.kda >= 4 ? 'text-primary' : stat.kda >= 2.5 ? 'text-foreground' : 'text-muted-foreground';
  const winRateColor = stat.winRate >= 60 ? 'text-primary' : stat.winRate >= 50 ? 'text-foreground' : 'text-destructive';

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      className={cn(
        'relative flex items-center gap-3 p-3 rounded-xl transition-colors',
        isFirst
          ? 'bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20'
          : 'hover:bg-muted/30'
      )}
    >
      {/* Rank indicator for first place */}
      {isFirst && (
        <div className="absolute -top-1 -left-1">
          <Crown className="w-4 h-4 text-primary" />
        </div>
      )}

      {/* Champion icon */}
      <div className="relative">
        <Image
          src={getChampionIconUrl(stat.championName)}
          alt={stat.championName}
          width={44}
          height={44}
          className="rounded-xl ring-2 ring-border/50"
          unoptimized
        />
        {/* Games badge */}
        <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-md bg-card border border-border text-[10px] font-bold">
          {stat.games}
        </div>
      </div>

      {/* Champion name and KDA */}
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate text-sm">{stat.championName}</div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>{stat.avgKills.toFixed(1)}</span>
          <span>/</span>
          <span className="text-destructive">{stat.avgDeaths.toFixed(1)}</span>
          <span>/</span>
          <span>{stat.avgAssists.toFixed(1)}</span>
          <span className={cn('ml-1 font-medium', kdaColor)}>
            ({stat.kda.toFixed(2)})
          </span>
        </div>
      </div>

      {/* Win rate with visual bar */}
      <div className="flex flex-col items-end gap-1">
        <div className={cn('text-sm font-bold', winRateColor)}>
          {stat.winRate.toFixed(0)}%
        </div>
        <div className="w-12 h-1.5 bg-muted/30 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${stat.winRate}%` }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className={cn(
              'h-full rounded-full',
              stat.winRate >= 60 ? 'bg-primary' : stat.winRate >= 50 ? 'bg-foreground/50' : 'bg-destructive'
            )}
          />
        </div>
        <div className="text-[10px] text-muted-foreground">
          {stat.wins}W {stat.losses}L
        </div>
      </div>
    </motion.div>
  );
}

function ChampionStatsSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-card via-card to-card/80">
      <div className="p-5">
        <div className="mb-4">
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
              <Skeleton className="w-11 h-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
              <div className="flex flex-col items-end gap-1">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-1.5 w-12 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
