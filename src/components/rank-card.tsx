'use client';

import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { getTierColor, RANKED_QUEUE_TYPES } from '@/lib/constants/queues';
import { getRankIcon } from '@/components/icons/rank-icons';
import { cn } from '@/lib/utils';
import type { LeagueEntry } from '@/types/riot';

interface RankCardProps {
  entry: LeagueEntry;
  delay?: number;
}

export function RankCard({ entry, delay = 0 }: RankCardProps) {
  const queueInfo = RANKED_QUEUE_TYPES[entry.queueType as keyof typeof RANKED_QUEUE_TYPES];
  const totalGames = entry.wins + entry.losses;
  const winRate = totalGames > 0 ? Math.round((entry.wins / totalGames) * 100) : 0;
  const tierColor = getTierColor(entry.tier);

  // LP progress to 100
  const lpProgress = entry.leaguePoints;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="group"
    >
      <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-card via-card to-card/80">
        {/* Background glow effect */}
        <div
          className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-20 group-hover:opacity-30 transition-opacity duration-500"
          style={{ backgroundColor: tierColor }}
        />
        <div
          className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full blur-2xl opacity-10 group-hover:opacity-20 transition-opacity duration-500"
          style={{ backgroundColor: tierColor }}
        />

        <div className="relative p-5">
          {/* Header with queue type */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {queueInfo?.shortName || entry.queueType}
            </span>
            {entry.hotStreak && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20">
                <Flame className="w-3 h-3 text-orange-500" />
                <span className="text-[10px] font-medium text-orange-500">Hot Streak</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Rank Emblem with circular LP progress */}
            <div className="relative flex-shrink-0">
              {/* Circular progress background */}
              <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-muted/20"
                />
                <motion.circle
                  cx="40"
                  cy="40"
                  r="36"
                  fill="none"
                  stroke={tierColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  initial={{ strokeDasharray: '226', strokeDashoffset: '226' }}
                  animate={{ strokeDashoffset: 226 - (226 * lpProgress) / 100 }}
                  transition={{ duration: 1, delay: delay + 0.3, ease: 'easeOut' }}
                  style={{ strokeDasharray: '226' }}
                />
              </svg>
              {/* Emblem in center */}
              <div className="absolute inset-0 flex items-center justify-center">
                {(() => {
                  const RankIcon = getRankIcon(entry.tier);
                  return <RankIcon className="w-12 h-12 drop-shadow-lg" />;
                })()}
              </div>
            </div>

            {/* Rank Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5 mb-1">
                <span
                  className="text-2xl font-bold capitalize tracking-tight"
                  style={{ color: tierColor }}
                >
                  {entry.tier.toLowerCase()}
                </span>
                <span className="text-xl font-semibold text-foreground">
                  {entry.rank}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-foreground">{entry.leaguePoints}</span>
                <span className="text-sm text-muted-foreground">LP</span>
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-border/30">
            {/* Win Rate */}
            <div>
              <div
                className={cn(
                  'text-lg font-bold leading-none',
                  winRate >= 50 ? 'text-primary' : 'text-destructive'
                )}
              >
                {winRate}%
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                Win Rate
              </div>
            </div>

            {/* Games */}
            <div className="text-center">
              <div className="text-lg font-bold leading-none text-foreground">
                {totalGames}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                Games
              </div>
            </div>

            {/* W/L */}
            <div className="text-right">
              <div className="flex items-center gap-1 text-sm font-medium">
                <span className="text-primary">{entry.wins}W</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-destructive">{entry.losses}L</span>
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                Record
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function UnrankedCard({ queueType, delay = 0 }: { queueType: string; delay?: number }) {
  const queueInfo = RANKED_QUEUE_TYPES[queueType as keyof typeof RANKED_QUEUE_TYPES];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <div className="relative overflow-hidden rounded-2xl border border-border/30 bg-gradient-to-br from-card/50 via-card/30 to-card/50">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,120,120,0.1),transparent)]" />

        <div className="relative p-5">
          {/* Header */}
          <div className="mb-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {queueInfo?.shortName || queueType}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Placeholder emblem */}
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 rounded-full bg-muted/20 border-2 border-dashed border-muted/30 flex items-center justify-center">
                <span className="text-3xl text-muted-foreground/50">?</span>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="text-xl font-semibold text-muted-foreground mb-1">
                Unranked
              </div>
              <div className="text-sm text-muted-foreground/70">
                Play ranked to get placed
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
