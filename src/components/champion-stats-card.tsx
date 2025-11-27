'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      transition={{ duration: 0.4 }}
    >
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Champion Performance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {stats.map((stat, index) => (
            <ChampionStatRow key={stat.championId} stat={stat} index={index} />
          ))}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ChampionStatRow({ stat, index }: { stat: ChampionStat; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/30 transition-colors"
    >
      {/* Champion icon */}
      <Image
        src={getChampionIconUrl(stat.championName)}
        alt={stat.championName}
        width={40}
        height={40}
        className="rounded-lg"
        unoptimized
      />

      {/* Champion name and games */}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{stat.championName}</div>
        <div className="text-xs text-muted-foreground">{stat.games} games</div>
      </div>

      {/* KDA */}
      <div className="text-center">
        <div className="text-sm font-medium">
          {stat.avgKills.toFixed(1)}/{stat.avgDeaths.toFixed(1)}/{stat.avgAssists.toFixed(1)}
        </div>
        <div className="text-xs text-muted-foreground">
          <span
            className={cn(
              'font-medium',
              stat.kda >= 3 ? 'text-[#22c55e]' : stat.kda >= 2 ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {stat.kda.toFixed(2)}
          </span>
          {' '}KDA
        </div>
      </div>

      {/* Win rate */}
      <div className="text-right w-16">
        <div
          className={cn(
            'text-sm font-bold',
            stat.winRate >= 60 ? 'text-[#22c55e]' : stat.winRate >= 50 ? 'text-foreground' : 'text-[#ef4444]'
          )}
        >
          {stat.winRate.toFixed(0)}%
        </div>
        <div className="text-xs text-muted-foreground">
          {stat.wins}W {stat.losses}L
        </div>
      </div>
    </motion.div>
  );
}

function ChampionStatsSkeleton() {
  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <Skeleton className="w-10 h-10 rounded-lg" />
            <div className="flex-1">
              <Skeleton className="h-4 w-24 mb-1" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
