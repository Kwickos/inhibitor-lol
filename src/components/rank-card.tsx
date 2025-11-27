'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { getRankedEmblemUrl } from '@/lib/riot-api';
import { getTierColor, RANKED_QUEUE_TYPES } from '@/lib/constants/queues';
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Card className="bg-card/50 backdrop-blur-sm border-border/50 hover:bg-card/70 transition-all overflow-hidden group">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-4">
            {/* Rank Emblem */}
            <div className="relative flex-shrink-0">
              <div
                className="absolute inset-0 rounded-full blur-xl opacity-30 group-hover:opacity-50 transition-opacity"
                style={{ backgroundColor: tierColor }}
              />
              <Image
                src={getRankedEmblemUrl(entry.tier)}
                alt={entry.tier}
                width={72}
                height={72}
                className="relative drop-shadow-lg"
                unoptimized
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                {queueInfo?.shortName || entry.queueType}
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className="text-xl font-bold capitalize"
                  style={{ color: tierColor }}
                >
                  {entry.tier.toLowerCase()}
                </span>
                <span className="text-lg font-semibold text-foreground">
                  {entry.rank}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {entry.leaguePoints} LP
              </div>
            </div>

            {/* Stats */}
            <div className="text-right">
              <div className="text-2xl font-bold" style={{ color: winRate >= 50 ? '#22c55e' : '#ef4444' }}>
                {winRate}%
              </div>
              <div className="text-sm text-muted-foreground">
                {entry.wins}W {entry.losses}L
              </div>
            </div>
          </div>

          {/* Progress bar to next rank (visual only) */}
          <div className="mt-4 h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${entry.leaguePoints}%` }}
              transition={{ duration: 0.8, delay: delay + 0.3 }}
              className="h-full rounded-full"
              style={{ backgroundColor: tierColor }}
            />
          </div>
        </CardContent>
      </Card>
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
      <Card className="bg-card/30 backdrop-blur-sm border-border/30">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <div className="w-[72px] h-[72px] rounded-full bg-muted/30 flex items-center justify-center">
              <span className="text-3xl text-muted-foreground">?</span>
            </div>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                {queueInfo?.shortName || queueType}
              </div>
              <div className="text-lg font-semibold text-muted-foreground">
                Unranked
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
