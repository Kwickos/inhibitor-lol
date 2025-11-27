'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Clock, Swords, Shield, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getChampionIconUrl } from '@/lib/riot-api';
import { getTierColor } from '@/lib/constants/queues';
import { cn } from '@/lib/utils';

interface LiveGamePanelProps {
  currentPuuid: string;
  gameData: {
    gameId: number;
    gameMode: string;
    gameStartTime: number;
    gameLength: number;
    queueId: number;
    participants: Array<{
      championId: number;
      championName?: string;
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

export function LiveGamePanel({ currentPuuid, gameData }: LiveGamePanelProps) {
  const [gameTime, setGameTime] = useState(0);

  // Update game time every second
  useEffect(() => {
    const updateTime = () => {
      const elapsed = Math.floor((Date.now() - gameData.gameStartTime) / 1000);
      setGameTime(Math.max(0, elapsed));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [gameData.gameStartTime]);

  const formattedTime = `${Math.floor(gameTime / 60)}:${(gameTime % 60).toString().padStart(2, '0')}`;

  const blueTeam = gameData.participants.filter((p) => p.teamId === 100);
  const redTeam = gameData.participants.filter((p) => p.teamId === 200);

  // Find current player's team
  const currentPlayer = gameData.participants.find(p => p.puuid === currentPuuid);
  const isBlueTeam = currentPlayer?.teamId === 100;

  return (
    <div className="space-y-6">
      {/* Header with live indicator */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-[#f59e0b]/30 bg-gradient-to-br from-[#f59e0b]/10 via-card to-card/80 p-6"
      >
        {/* Animated glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#f59e0b]/10 rounded-full blur-3xl animate-pulse" />

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Live pulse indicator */}
            <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-[#f59e0b]/20 border border-[#f59e0b]/30">
              <span className="absolute inline-flex h-full w-full rounded-xl bg-[#f59e0b] opacity-20 animate-ping" />
              <Swords className="w-6 h-6 text-[#f59e0b]" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">Live Game</h2>
                <Badge variant="outline" className="border-[#f59e0b]/30 text-[#f59e0b]">
                  {gameData.gameMode}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Currently in match
              </p>
            </div>
          </div>

          {/* Game timer */}
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-background/50 border border-border/30">
            <Clock className="w-5 h-5 text-[#f59e0b]" />
            <div>
              <div className="text-2xl font-bold font-mono">{formattedTime}</div>
              <div className="text-xs text-muted-foreground">Game Time</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Teams */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Blue Team */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className={cn(
            'relative overflow-hidden rounded-2xl border p-5',
            isBlueTeam
              ? 'border-blue-500/40 bg-gradient-to-br from-blue-500/10 via-card to-card/80'
              : 'border-border/40 bg-gradient-to-br from-card via-card to-card/80'
          )}
        >
          {/* Team glow */}
          <div className="absolute top-0 left-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-sm font-semibold uppercase tracking-wider text-blue-400">Blue Team</span>
              {isBlueTeam && (
                <Badge className="ml-auto bg-blue-500/20 text-blue-400 border-blue-500/30">Your Team</Badge>
              )}
            </div>

            <div className="space-y-2">
              {blueTeam.map((participant, idx) => (
                <ParticipantCard
                  key={participant.puuid}
                  participant={participant}
                  isCurrentPlayer={participant.puuid === currentPuuid}
                  teamColor="blue"
                  delay={0.2 + idx * 0.05}
                />
              ))}
            </div>
          </div>
        </motion.div>

        {/* Red Team */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className={cn(
            'relative overflow-hidden rounded-2xl border p-5',
            !isBlueTeam && currentPlayer
              ? 'border-red-500/40 bg-gradient-to-br from-red-500/10 via-card to-card/80'
              : 'border-border/40 bg-gradient-to-br from-card via-card to-card/80'
          )}
        >
          {/* Team glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-sm font-semibold uppercase tracking-wider text-red-400">Red Team</span>
              {!isBlueTeam && currentPlayer && (
                <Badge className="ml-auto bg-red-500/20 text-red-400 border-red-500/30">Your Team</Badge>
              )}
            </div>

            <div className="space-y-2">
              {redTeam.map((participant, idx) => (
                <ParticipantCard
                  key={participant.puuid}
                  participant={participant}
                  isCurrentPlayer={participant.puuid === currentPuuid}
                  teamColor="red"
                  delay={0.2 + idx * 0.05}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function ParticipantCard({
  participant,
  isCurrentPlayer,
  teamColor,
  delay,
}: {
  participant: LiveGamePanelProps['gameData']['participants'][0];
  isCurrentPlayer: boolean;
  teamColor: 'blue' | 'red';
  delay: number;
}) {
  const championName = participant.championName || `Champion${participant.championId}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay }}
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl transition-all',
        isCurrentPlayer
          ? teamColor === 'blue'
            ? 'bg-blue-500/20 ring-1 ring-blue-500/40'
            : 'bg-red-500/20 ring-1 ring-red-500/40'
          : 'bg-background/30 hover:bg-background/50'
      )}
    >
      {/* Champion icon */}
      <div className="relative">
        <Image
          src={getChampionIconUrl(championName)}
          alt={championName}
          width={44}
          height={44}
          className={cn(
            'rounded-xl ring-2',
            isCurrentPlayer
              ? teamColor === 'blue' ? 'ring-blue-500/50' : 'ring-red-500/50'
              : 'ring-border/50'
          )}
          unoptimized
        />
        {isCurrentPlayer && (
          <div className={cn(
            'absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold',
            teamColor === 'blue' ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'
          )}>
            <Users className="w-2.5 h-2.5" />
          </div>
        )}
      </div>

      {/* Player info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'font-semibold truncate text-sm',
            isCurrentPlayer && (teamColor === 'blue' ? 'text-blue-400' : 'text-red-400')
          )}>
            {participant.gameName}
          </span>
          <span className="text-xs text-muted-foreground">#{participant.tagLine}</span>
        </div>
        <div className="text-xs text-muted-foreground">{championName}</div>
      </div>

      {/* Rank */}
      {participant.rank ? (
        <div className="text-right">
          <div
            className="text-sm font-bold capitalize"
            style={{ color: getTierColor(participant.rank.tier) }}
          >
            {participant.rank.tier.toLowerCase()} {participant.rank.rank}
          </div>
          <div className="text-[10px] text-muted-foreground">{participant.rank.lp} LP</div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground italic">Unranked</div>
      )}
    </motion.div>
  );
}
