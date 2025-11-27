'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { Clock, Sword, Eye, ChevronDown, Target, Shield, Coins } from 'lucide-react';
import { getChampionIconUrl, getItemIconUrl, getSummonerSpellIconUrl } from '@/lib/riot-api';
import { getQueueInfo } from '@/lib/constants/queues';
import { cn } from '@/lib/utils';
import type { MatchSummary, Participant } from '@/types/riot';

interface MatchCardProps {
  match: MatchSummary;
  currentPuuid: string;
  region: string;
  delay?: number;
}

export function MatchCard({ match, currentPuuid, region, delay = 0 }: MatchCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { participant } = match;
  const queueInfo = getQueueInfo(match.queueId);

  const kda = participant.deaths === 0
    ? 'Perfect'
    : ((participant.kills + participant.assists) / participant.deaths).toFixed(2);

  const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
  const csPerMin = (cs / (match.gameDuration / 60)).toFixed(1);

  // Keep all 6 item slots for consistent layout
  const items = [
    participant.item0,
    participant.item1,
    participant.item2,
    participant.item3,
    participant.item4,
    participant.item5,
  ];

  const trinket = participant.item6;

  const timeAgo = getTimeAgo(match.gameCreation);
  const duration = formatDuration(match.gameDuration);

  // Split teams
  const blueTeam = match.allParticipants?.filter(p => p.teamId === 100) || [];
  const redTeam = match.allParticipants?.filter(p => p.teamId === 200) || [];
  const playerTeam = participant.teamId === 100 ? blueTeam : redTeam;
  const enemyTeam = participant.teamId === 100 ? redTeam : blueTeam;

  // Calculate kill participation
  const teamKills = playerTeam.reduce((sum, p) => sum + p.kills, 0);
  const killParticipation = teamKills > 0
    ? Math.round(((participant.kills + participant.assists) / teamKills) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      {/* Main card - clickable */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'group relative flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border transition-all cursor-pointer',
          isExpanded ? 'rounded-t-xl' : 'rounded-xl',
          'hover:bg-card/70',
          match.win
            ? 'bg-[#22c55e]/5 border-[#22c55e]/20 hover:border-[#22c55e]/40'
            : 'bg-[#ef4444]/5 border-[#ef4444]/20 hover:border-[#ef4444]/40'
        )}
      >
        {/* Win/Loss indicator bar */}
        <div
          className={cn(
            'absolute left-0 top-2 bottom-2 w-1 rounded-full',
            match.win ? 'bg-[#22c55e]' : 'bg-[#ef4444]'
          )}
        />

        {/* Champion */}
        <div className="relative flex-shrink-0 ml-2">
          <Image
            src={getChampionIconUrl(participant.championName)}
            alt={participant.championName}
            width={56}
            height={56}
            className="rounded-xl"
            unoptimized
          />
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center text-xs font-bold">
            {participant.champLevel}
          </div>
        </div>

        {/* Summoner Spells */}
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <Image
            src={getSummonerSpellIconUrl(participant.summoner1Id)}
            alt="Spell 1"
            width={22}
            height={22}
            className="rounded"
            unoptimized
          />
          <Image
            src={getSummonerSpellIconUrl(participant.summoner2Id)}
            alt="Spell 2"
            width={22}
            height={22}
            className="rounded"
            unoptimized
          />
        </div>

        {/* Game Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              'text-sm font-semibold',
              match.win ? 'text-[#22c55e]' : 'text-[#ef4444]'
            )}>
              {match.win ? 'Victory' : 'Defeat'}
            </span>
            <span className="text-xs text-muted-foreground">{queueInfo.shortName}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
          </div>

          {/* KDA */}
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1 text-lg font-bold">
              <span>{participant.kills}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-[#ef4444]">{participant.deaths}</span>
              <span className="text-muted-foreground">/</span>
              <span>{participant.assists}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              <span className={cn(
                'font-medium',
                parseFloat(kda) >= 3 ? 'text-[#22c55e]' : parseFloat(kda) >= 2 ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {kda}
              </span>
              {' '}KDA
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {duration}
            </span>
            <span className="flex items-center gap-1">
              <Sword className="h-3 w-3" />
              {cs} ({csPerMin})
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {participant.visionScore}
            </span>
            <span className="hidden sm:flex items-center gap-1">
              <Target className="h-3 w-3" />
              {killParticipation}% KP
            </span>
          </div>
        </div>

        {/* Items */}
        <div className="hidden sm:flex flex-col gap-1">
          <div className="flex gap-0.5">
            {items.slice(0, 3).map((itemId, idx) => (
              <ItemSlot key={idx} itemId={itemId} />
            ))}
          </div>
          <div className="flex gap-0.5">
            {items.slice(3, 6).map((itemId, idx) => (
              <ItemSlot key={idx + 3} itemId={itemId} />
            ))}
            <ItemSlot itemId={trinket} isTrinket />
          </div>
        </div>

        {/* Expand indicator */}
        <ChevronDown
          className={cn(
            'h-5 w-5 text-muted-foreground transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && match.allParticipants && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'overflow-hidden border border-t-0 rounded-b-xl',
              match.win
                ? 'bg-[#22c55e]/5 border-[#22c55e]/20'
                : 'bg-[#ef4444]/5 border-[#ef4444]/20'
            )}
          >
            <div className="p-4 space-y-4">
              {/* Team stats header */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <TeamObjectives
                  team={match.teams?.find(t => t.teamId === participant.teamId)}
                  label="Your Team"
                  isWin={match.win}
                />
                <TeamObjectives
                  team={match.teams?.find(t => t.teamId !== participant.teamId)}
                  label="Enemy Team"
                  isWin={!match.win}
                />
              </div>

              {/* Players table */}
              <div className="space-y-3">
                {/* Your team */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <div className={cn(
                      'w-2 h-2 rounded-full',
                      participant.teamId === 100 ? 'bg-blue-500' : 'bg-red-500'
                    )} />
                    {match.win ? 'Victory' : 'Defeat'} - {participant.teamId === 100 ? 'Blue' : 'Red'} Team
                  </div>
                  <div className="space-y-1">
                    {playerTeam.map((p) => (
                      <PlayerRow
                        key={p.puuid}
                        player={p}
                        region={region}
                        gameDuration={match.gameDuration}
                        isCurrentPlayer={p.puuid === currentPuuid}
                        maxDamage={Math.max(...match.allParticipants.map(x => x.totalDamageDealtToChampions))}
                      />
                    ))}
                  </div>
                </div>

                {/* Enemy team */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <div className={cn(
                      'w-2 h-2 rounded-full',
                      participant.teamId === 100 ? 'bg-red-500' : 'bg-blue-500'
                    )} />
                    {!match.win ? 'Victory' : 'Defeat'} - {participant.teamId === 100 ? 'Red' : 'Blue'} Team
                  </div>
                  <div className="space-y-1">
                    {enemyTeam.map((p) => (
                      <PlayerRow
                        key={p.puuid}
                        player={p}
                        region={region}
                        gameDuration={match.gameDuration}
                        isCurrentPlayer={p.puuid === currentPuuid}
                        maxDamage={Math.max(...match.allParticipants.map(x => x.totalDamageDealtToChampions))}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TeamObjectives({ team, label, isWin }: { team?: MatchSummary['teams'][0]; label: string; isWin: boolean }) {
  if (!team) return null;

  return (
    <div className={cn(
      'p-3 rounded-lg',
      isWin ? 'bg-[#22c55e]/10' : 'bg-[#ef4444]/10'
    )}>
      <div className={cn(
        'text-xs font-medium mb-2',
        isWin ? 'text-[#22c55e]' : 'text-[#ef4444]'
      )}>
        {label}
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>🏰 {team.objectives.tower.kills}</span>
        <span>🐉 {team.objectives.dragon.kills}</span>
        <span>👹 {team.objectives.baron.kills}</span>
        <span>🦀 {team.objectives.riftHerald.kills}</span>
      </div>
    </div>
  );
}

function PlayerRow({
  player,
  region,
  gameDuration,
  isCurrentPlayer,
  maxDamage
}: {
  player: Participant;
  region: string;
  gameDuration: number;
  isCurrentPlayer: boolean;
  maxDamage: number;
}) {
  const cs = player.totalMinionsKilled + player.neutralMinionsKilled;
  const csPerMin = (cs / (gameDuration / 60)).toFixed(1);
  const kda = player.deaths === 0
    ? 'Perfect'
    : ((player.kills + player.assists) / player.deaths).toFixed(2);
  const damagePercent = (player.totalDamageDealtToChampions / maxDamage) * 100;

  const items = [player.item0, player.item1, player.item2, player.item3, player.item4, player.item5];
  const trinket = player.item6;

  // Build profile URL
  const gameName = player.riotIdGameName || player.summonerName;
  const tagLine = player.riotIdTagline || 'EUW';
  const profileUrl = `/${region}/${encodeURIComponent(`${gameName}-${tagLine}`)}`;

  return (
    <div className={cn(
      'flex items-center gap-2 p-2 rounded-lg text-xs',
      isCurrentPlayer ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-secondary/30'
    )}>
      {/* Champion */}
      <Image
        src={getChampionIconUrl(player.championName)}
        alt={player.championName}
        width={32}
        height={32}
        className="rounded-lg flex-shrink-0"
        unoptimized
      />

      {/* Spells */}
      <div className="flex flex-col gap-0.5 flex-shrink-0">
        <Image
          src={getSummonerSpellIconUrl(player.summoner1Id)}
          alt="Spell"
          width={14}
          height={14}
          className="rounded"
          unoptimized
        />
        <Image
          src={getSummonerSpellIconUrl(player.summoner2Id)}
          alt="Spell"
          width={14}
          height={14}
          className="rounded"
          unoptimized
        />
      </div>

      {/* Name - clickable link */}
      <div className="min-w-0 w-24 flex-shrink-0">
        <Link
          href={profileUrl}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'font-medium truncate block hover:underline',
            isCurrentPlayer ? 'text-primary' : 'hover:text-primary'
          )}
        >
          {gameName}
        </Link>
      </div>

      {/* KDA */}
      <div className="w-20 flex-shrink-0 text-center">
        <span className="font-medium">
          {player.kills}/{player.deaths}/{player.assists}
        </span>
        <div className={cn(
          'text-[10px]',
          parseFloat(kda) >= 3 ? 'text-[#22c55e]' : 'text-muted-foreground'
        )}>
          {kda} KDA
        </div>
      </div>

      {/* Damage bar */}
      <div className="flex-1 min-w-0 hidden md:block">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary/60 rounded-full"
              style={{ width: `${damagePercent}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground w-12 text-right">
            {(player.totalDamageDealtToChampions / 1000).toFixed(1)}k
          </span>
        </div>
      </div>

      {/* CS */}
      <div className="w-14 flex-shrink-0 text-center hidden sm:block">
        <div className="font-medium">{cs}</div>
        <div className="text-[10px] text-muted-foreground">{csPerMin}/m</div>
      </div>

      {/* Gold */}
      <div className="w-14 flex-shrink-0 text-center hidden lg:block">
        <div className="font-medium flex items-center justify-center gap-1">
          <Coins className="h-3 w-3 text-yellow-500" />
          {(player.goldEarned / 1000).toFixed(1)}k
        </div>
      </div>

      {/* Items */}
      <div className="hidden xl:flex gap-0.5 flex-shrink-0">
        {items.map((itemId, idx) => (
          <ItemSlot key={idx} itemId={itemId} size={20} />
        ))}
        <ItemSlot itemId={trinket} size={20} isTrinket />
      </div>
    </div>
  );
}

function ItemSlot({ itemId, isTrinket = false, size = 28 }: { itemId: number; isTrinket?: boolean; size?: number }) {
  if (!itemId) {
    return (
      <div
        className={cn(
          'rounded bg-muted/20 border border-border/30',
          isTrinket && 'rounded-full'
        )}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <Image
      src={getItemIconUrl(itemId)}
      alt={`Item ${itemId}`}
      width={size}
      height={size}
      className={cn('rounded border border-border/20', isTrinket && 'rounded-full')}
      unoptimized
    />
  );
}

function getTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
