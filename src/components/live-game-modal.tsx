'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Clock, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getChampionIconUrl } from '@/lib/riot-api';
import { getTierColor } from '@/lib/constants/queues';
import { cn } from '@/lib/utils';

interface LiveGameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPuuid: string;
  gameData: {
    gameId: number;
    gameMode: string;
    gameStartTime: number;
    gameLength: number;
    queueId: number;
    participants: Array<{
      championId: number;
      teamId: number;
      gameName: string;
      tagLine: string;
      puuid: string;
      rank?: {
        tier: string;
        rank: string;
        lp: number;
      } | null;
    }>;
  };
}

// Champion ID to name mapping (partial, would need full list from Data Dragon)
const CHAMPION_NAMES: Record<number, string> = {
  1: 'Annie', 2: 'Olaf', 3: 'Galio', 4: 'TwistedFate', 5: 'XinZhao',
  6: 'Urgot', 7: 'Leblanc', 8: 'Vladimir', 9: 'Fiddlesticks', 10: 'Kayle',
  // Add more as needed
};

export function LiveGameModal({
  open,
  onOpenChange,
  currentPuuid,
  gameData,
}: LiveGameModalProps) {
  const [gameTime, setGameTime] = useState(0);

  // Update game time
  useEffect(() => {
    if (!open) return;

    const updateTime = () => {
      const elapsed = Math.floor((Date.now() - gameData.gameStartTime) / 1000);
      setGameTime(elapsed);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [open, gameData.gameStartTime]);

  const formattedTime = `${Math.floor(gameTime / 60)}:${(gameTime % 60).toString().padStart(2, '0')}`;

  const blueTeam = gameData.participants.filter((p) => p.teamId === 100);
  const redTeam = gameData.participants.filter((p) => p.teamId === 200);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-card/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <span className="flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f59e0b] opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[#f59e0b]" />
                </span>
              </div>
              <span>Live Game</span>
              <Badge variant="outline" className="ml-2">
                {gameData.gameMode}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-sm font-normal">
              <Clock className="h-4 w-4" />
              {formattedTime}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* Blue Team */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-3 w-3 rounded-full bg-blue-500" />
              <span className="text-sm font-medium text-blue-400">Blue Team</span>
            </div>
            <div className="space-y-2">
              {blueTeam.map((participant, idx) => (
                <ParticipantRow
                  key={participant.puuid}
                  participant={participant}
                  isCurrentPlayer={participant.puuid === currentPuuid}
                  delay={idx * 0.05}
                />
              ))}
            </div>
          </div>

          <Separator className="bg-border/50" />

          {/* Red Team */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <span className="text-sm font-medium text-red-400">Red Team</span>
            </div>
            <div className="space-y-2">
              {redTeam.map((participant, idx) => (
                <ParticipantRow
                  key={participant.puuid}
                  participant={participant}
                  isCurrentPlayer={participant.puuid === currentPuuid}
                  delay={0.25 + idx * 0.05}
                />
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ParticipantRow({
  participant,
  isCurrentPlayer,
  delay,
}: {
  participant: LiveGameModalProps['gameData']['participants'][0];
  isCurrentPlayer: boolean;
  delay: number;
}) {
  const championName = CHAMPION_NAMES[participant.championId] || `Champion${participant.championId}`;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay }}
      className={cn(
        'flex items-center gap-3 p-2 rounded-lg transition-colors',
        isCurrentPlayer ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-secondary/50'
      )}
    >
      {/* Champion icon */}
      <Image
        src={getChampionIconUrl(championName)}
        alt={championName}
        width={40}
        height={40}
        className="rounded-lg"
        unoptimized
      />

      {/* Player info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('font-medium truncate', isCurrentPlayer && 'text-primary')}>
            {participant.gameName}
          </span>
          <span className="text-muted-foreground text-sm">#{participant.tagLine}</span>
          {isCurrentPlayer && (
            <Badge variant="secondary" className="text-xs">
              You
            </Badge>
          )}
        </div>
        <div className="text-sm text-muted-foreground">{championName}</div>
      </div>

      {/* Rank */}
      {participant.rank ? (
        <div className="text-right">
          <div
            className="font-medium capitalize"
            style={{ color: getTierColor(participant.rank.tier) }}
          >
            {participant.rank.tier.toLowerCase()} {participant.rank.rank}
          </div>
          <div className="text-xs text-muted-foreground">{participant.rank.lp} LP</div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Unranked</div>
      )}
    </motion.div>
  );
}
