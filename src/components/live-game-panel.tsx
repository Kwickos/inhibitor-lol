'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Clock,
  Swords,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Skull,
  Eye,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ChevronRight
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getChampionIconUrl } from '@/lib/riot-api';
import { getTierColor, getQueueInfo } from '@/lib/constants/queues';
import { getRoleIcon } from '@/components/icons/role-icons';
import { cn } from '@/lib/utils';
import type { PlayerAnalysis } from '@/types/analysis';

interface LiveGamePanelProps {
  currentPuuid: string;
  region: string;
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
      role?: string;
      rank?: {
        tier: string;
        rank: string;
        lp: number;
      } | null;
    }>;
  };
  isActive?: boolean;
}

export function LiveGamePanel({ currentPuuid, region, gameData, isActive = true }: LiveGamePanelProps) {
  const [gameTime, setGameTime] = useState(0);
  const [opponentAnalysis, setOpponentAnalysis] = useState<PlayerAnalysis | null>(null);
  const [isLoadingOpponent, setIsLoadingOpponent] = useState(false);

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

  // Find current player and their role
  const currentPlayer = gameData.participants.find(p => p.puuid === currentPuuid);
  const isBlueTeam = currentPlayer?.teamId === 100;
  const currentRole = currentPlayer?.role;

  // Find lane opponent (same role, opposite team)
  const laneOpponent = currentPlayer && currentRole
    ? gameData.participants.find(p =>
        p.teamId !== currentPlayer.teamId &&
        p.role === currentRole
      )
    : null;

  // Fetch opponent analysis
  useEffect(() => {
    if (!laneOpponent || !laneOpponent.puuid || !laneOpponent.gameName) return;

    async function fetchOpponentAnalysis() {
      if (!laneOpponent) return;

      setIsLoadingOpponent(true);
      try {
        const res = await fetch(
          `/api/analysis/${laneOpponent.puuid}?region=${region}&gameName=${encodeURIComponent(laneOpponent.gameName)}&tagLine=${encodeURIComponent(laneOpponent.tagLine || '')}&queue=solo`
        );
        if (res.ok) {
          const data = await res.json();
          setOpponentAnalysis(data);
        }
      } catch (err) {
        console.error('Failed to fetch opponent analysis:', err);
      } finally {
        setIsLoadingOpponent(false);
      }
    }

    fetchOpponentAnalysis();
  }, [laneOpponent, region]);

  // Stagger animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.05
      }
    }
  };

  const headerVariants = {
    hidden: { opacity: 0, y: -20, scale: 0.95 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.5,
        ease: [0.25, 0.46, 0.45, 0.94] as const
      }
    }
  };

  const blueTeamVariants = {
    hidden: { opacity: 0, x: -30, scale: 0.97 },
    visible: {
      opacity: 1,
      x: 0,
      scale: 1,
      transition: {
        duration: 0.45,
        ease: [0.25, 0.46, 0.45, 0.94] as const
      }
    }
  };

  const redTeamVariants = {
    hidden: { opacity: 0, x: 30, scale: 0.97 },
    visible: {
      opacity: 1,
      x: 0,
      scale: 1,
      transition: {
        duration: 0.45,
        ease: [0.25, 0.46, 0.45, 0.94] as const
      }
    }
  };

  const playerVariants = {
    hidden: { opacity: 0, y: 10, scale: 0.98 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.3,
        ease: [0.25, 0.46, 0.45, 0.94] as const
      }
    }
  };

  const matchupVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.5,
        ease: [0.25, 0.46, 0.45, 0.94] as const
      }
    }
  };

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate={isActive ? "visible" : "hidden"}
    >
      {/* Header with live indicator */}
      <motion.div
        variants={headerVariants}
        className="relative overflow-hidden rounded-2xl border border-[#f59e0b]/30 bg-gradient-to-br from-[#f59e0b]/10 via-card to-card/80 p-6"
      >
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">Live Game</h2>
              <Badge variant="outline" className="border-[#f59e0b]/30 text-[#f59e0b]">
                {getQueueInfo(gameData.queueId).shortName}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Currently in match
            </p>
          </div>

          {/* Game timer */}
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-[#f59e0b]" />
            <div>
              <div className="text-2xl font-bold font-mono tabular-nums">{formattedTime}</div>
              <div className="text-xs text-muted-foreground">Game Time</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Lane Matchup Analysis */}
      {currentPlayer && laneOpponent && (
        <motion.div variants={matchupVariants}>
          <LaneMatchupCard
            currentPlayer={currentPlayer}
            opponent={laneOpponent}
            opponentAnalysis={opponentAnalysis}
            isLoading={isLoadingOpponent}
            region={region}
          />
        </motion.div>
      )}

      {/* Teams */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Blue Team */}
        <motion.div
          variants={blueTeamVariants}
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

            <motion.div
              className="space-y-2"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.05,
                    delayChildren: 0.1
                  }
                }
              }}
            >
              {blueTeam.map((participant, idx) => (
                <motion.div key={participant.puuid || `blue-${idx}`} variants={playerVariants}>
                  <ParticipantCard
                    participant={participant}
                    region={region}
                    isCurrentPlayer={participant.puuid === currentPuuid}
                    teamColor="blue"
                  />
                </motion.div>
              ))}
            </motion.div>
          </div>
        </motion.div>

        {/* Red Team */}
        <motion.div
          variants={redTeamVariants}
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

            <motion.div
              className="space-y-2"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.05,
                    delayChildren: 0.1
                  }
                }
              }}
            >
              {redTeam.map((participant, idx) => (
                <motion.div key={participant.puuid || `red-${idx}`} variants={playerVariants}>
                  <ParticipantCard
                    participant={participant}
                    region={region}
                    isCurrentPlayer={participant.puuid === currentPuuid}
                    teamColor="red"
                  />
                </motion.div>
              ))}
            </motion.div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function ParticipantCard({
  participant,
  region,
  isCurrentPlayer,
  teamColor,
}: {
  participant: LiveGamePanelProps['gameData']['participants'][0];
  region: string;
  isCurrentPlayer: boolean;
  teamColor: 'blue' | 'red';
}) {
  const championName = participant.championName || `Champion${participant.championId}`;
  const isStreamerMode = !participant.tagLine;
  const profileUrl = `/${region}/${encodeURIComponent(`${participant.gameName}-${participant.tagLine}`)}`;

  const cardContent = (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl transition-all',
        isStreamerMode ? 'opacity-70' : 'cursor-pointer',
        isCurrentPlayer
          ? teamColor === 'blue'
            ? 'bg-blue-500/20 ring-1 ring-blue-500/40 hover:bg-blue-500/30'
            : 'bg-red-500/20 ring-1 ring-red-500/40 hover:bg-red-500/30'
          : isStreamerMode
            ? 'bg-background/30'
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

      {/* Role icon */}
      {participant.role && (() => {
        const RoleIcon = getRoleIcon(participant.role);
        return <RoleIcon className="w-5 h-5 text-muted-foreground" />;
      })()}

      {/* Player info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'font-semibold truncate text-sm',
            isCurrentPlayer && (teamColor === 'blue' ? 'text-blue-400' : 'text-red-400')
          )}>
            {participant.gameName}
          </span>
          {participant.tagLine && (
            <span className="text-xs text-muted-foreground">#{participant.tagLine}</span>
          )}
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
    </div>
  );

  if (isStreamerMode) {
    return cardContent;
  }

  return <Link href={profileUrl}>{cardContent}</Link>;
}

// Lane Matchup Analysis Card
function LaneMatchupCard({
  currentPlayer,
  opponent,
  opponentAnalysis,
  isLoading,
  region,
}: {
  currentPlayer: LiveGamePanelProps['gameData']['participants'][0];
  opponent: LiveGamePanelProps['gameData']['participants'][0];
  opponentAnalysis: PlayerAnalysis | null;
  isLoading: boolean;
  region: string;
}) {
  const currentChampion = currentPlayer.championName || `Champion${currentPlayer.championId}`;
  const opponentChampion = opponent.championName || `Champion${opponent.championId}`;
  const RoleIcon = opponent.role ? getRoleIcon(opponent.role) : null;

  const roleNames: Record<string, string> = {
    TOP: 'Top Lane',
    JUNGLE: 'Jungle',
    MIDDLE: 'Mid Lane',
    BOTTOM: 'Bot Lane',
    UTILITY: 'Support',
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card to-primary/5">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

      {/* Header - VS Matchup */}
      <div className="relative p-5 border-b border-border/30">
        <div className="flex items-center gap-2 mb-4">
          {RoleIcon && <RoleIcon className="w-4 h-4 text-muted-foreground" />}
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {roleNames[opponent.role || ''] || 'Lane'} Matchup
          </span>
        </div>

        <div className="flex items-center justify-between">
          {/* Your Champion */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Image
                src={getChampionIconUrl(currentChampion)}
                alt={currentChampion}
                width={56}
                height={56}
                className="rounded-xl ring-2 ring-primary/50"
                unoptimized
              />
              <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded bg-primary text-[8px] font-bold text-white">
                YOU
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold">{currentChampion}</div>
              <div className="text-xs text-muted-foreground">{currentPlayer.gameName}</div>
            </div>
          </div>

          {/* VS */}
          <div className="flex flex-col items-center px-4">
            <Swords className="w-5 h-5 text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-1">VS</span>
          </div>

          {/* Opponent Champion */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold text-destructive">{opponentChampion}</div>
              <div className="text-xs text-muted-foreground">{opponent.gameName}</div>
              {opponent.rank && (
                <div
                  className="text-[10px] font-semibold capitalize"
                  style={{ color: getTierColor(opponent.rank.tier) }}
                >
                  {opponent.rank.tier.toLowerCase()} {opponent.rank.rank}
                </div>
              )}
            </div>
            <div className="relative">
              <Image
                src={getChampionIconUrl(opponentChampion)}
                alt={opponentChampion}
                width={56}
                height={56}
                className="rounded-xl ring-2 ring-destructive/50"
                unoptimized
              />
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Content */}
      <div className="relative p-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Analyzing opponent...</span>
          </div>
        ) : opponentAnalysis ? (
          <div className="space-y-5">
            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-3">
              <StatBox
                label="Win Rate"
                value={`${opponentAnalysis.overallStats.winRate.toFixed(0)}%`}
                icon={<Target className="w-3.5 h-3.5" />}
                isGood={opponentAnalysis.overallStats.winRate >= 50}
                trend={opponentAnalysis.trends.winRateTrend}
              />
              <StatBox
                label="KDA"
                value={opponentAnalysis.overallStats.avgKDA.toFixed(2)}
                icon={<Skull className="w-3.5 h-3.5" />}
                isGood={opponentAnalysis.overallStats.avgKDA >= 2.5}
                trend={opponentAnalysis.trends.kdaTrend}
              />
              <StatBox
                label="CS/min"
                value={opponentAnalysis.overallStats.avgCSPerMin.toFixed(1)}
                icon={<Zap className="w-3.5 h-3.5" />}
                isGood={opponentAnalysis.overallStats.avgCSPerMin >= 7}
                trend={opponentAnalysis.trends.csTrend}
              />
              <StatBox
                label="Vision"
                value={opponentAnalysis.overallStats.avgVisionPerMin.toFixed(2)}
                icon={<Eye className="w-3.5 h-3.5" />}
                isGood={opponentAnalysis.overallStats.avgVisionPerMin >= 1}
                trend={opponentAnalysis.trends.visionTrend}
              />
            </div>

            {/* Champions & Game Plan */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Most Played */}
              <div className="rounded-xl border border-border/40 bg-background/50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Swords className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Most Played
                  </span>
                </div>
                <div className="flex gap-2">
                  {opponentAnalysis.championAnalysis.slice(0, 4).map((champ, idx) => (
                    <div key={champ.championName} className="flex-1 flex flex-col items-center gap-1">
                      <div className="relative">
                        <Image
                          src={getChampionIconUrl(champ.championName)}
                          alt={champ.championName}
                          width={36}
                          height={36}
                          className={cn(
                            'rounded-lg ring-1',
                            champ.championName === opponentChampion
                              ? 'ring-destructive'
                              : 'ring-border/50'
                          )}
                          unoptimized
                        />
                        {idx === 0 && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center text-[8px] font-bold text-white">
                            1
                          </div>
                        )}
                      </div>
                      <span className={cn(
                        'text-[10px] font-medium',
                        champ.winRate >= 50 ? 'text-primary' : 'text-muted-foreground'
                      )}>
                        {champ.winRate.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Game Plan */}
              <GamePlanSection analysis={opponentAnalysis} opponentChampion={opponentChampion} />
            </div>

            {/* Strengths & Weaknesses */}
            <div className="grid grid-cols-2 gap-4">
              {/* Strengths */}
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-destructive">
                    Watch Out
                  </span>
                </div>
                <div className="space-y-1.5">
                  {opponentAnalysis.strengths.slice(0, 3).map((strength, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs">
                      <div className="w-1 h-1 rounded-full bg-destructive mt-1.5 shrink-0" />
                      <span className="text-muted-foreground">{strength.title}</span>
                    </div>
                  ))}
                  {opponentAnalysis.strengths.length === 0 && (
                    <span className="text-xs text-muted-foreground italic">No notable strengths</span>
                  )}
                </div>
              </div>

              {/* Weaknesses */}
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                    Exploit
                  </span>
                </div>
                <div className="space-y-1.5">
                  {opponentAnalysis.weaknesses.slice(0, 3).map((weakness, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs">
                      <div className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                      <span className="text-muted-foreground">{weakness.title}</span>
                    </div>
                  ))}
                  {opponentAnalysis.weaknesses.length === 0 && (
                    <span className="text-xs text-muted-foreground italic">No notable weaknesses</span>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-[10px] text-muted-foreground">
                Based on {opponentAnalysis.analyzedGames} recent games
              </span>
              <Link
                href={`/${region}/${encodeURIComponent(`${opponent.gameName}-${opponent.tagLine}`)}`}
                className="text-[10px] text-primary hover:underline"
              >
                View full profile →
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <AlertTriangle className="w-6 h-6 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Unable to load opponent analysis</span>
            <span className="text-xs text-muted-foreground">They may not have enough ranked games</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Stat box component with trend indicator
function StatBox({
  label,
  value,
  icon,
  isGood,
  trend,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  isGood: boolean;
  trend?: 'improving' | 'stable' | 'declining';
}) {
  const trendIcon = trend === 'improving'
    ? <TrendingUp className="w-3 h-3 text-primary" />
    : trend === 'declining'
      ? <TrendingDown className="w-3 h-3 text-destructive" />
      : null;

  return (
    <div className="rounded-xl border border-border/40 bg-background/50 p-3 text-center">
      <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-center justify-center gap-1">
        <span className={cn('text-lg font-bold', isGood ? 'text-primary' : 'text-muted-foreground')}>
          {value}
        </span>
        {trendIcon}
      </div>
    </div>
  );
}

// Game plan section with coaching advice
function GamePlanSection({
  analysis,
  opponentChampion,
}: {
  analysis: PlayerAnalysis;
  opponentChampion: string;
}) {
  const tips: string[] = [];

  // Analyze stats and generate tips
  const { overallStats, trends } = analysis;

  // Win rate analysis
  if (overallStats.winRate >= 55) {
    tips.push(`High win rate player (${overallStats.winRate.toFixed(0)}%). Respect their skill and avoid coinflip fights.`);
  } else if (overallStats.winRate < 48) {
    tips.push(`Low win rate (${overallStats.winRate.toFixed(0)}%). They may tilt easily - apply pressure.`);
  }

  // KDA analysis
  if (overallStats.avgKDA >= 3.5) {
    tips.push('Very clean player with high KDA. They play safe - force trades when they overextend.');
  } else if (overallStats.avgKDA < 2) {
    tips.push('Low KDA player. They take risky fights - bait them into bad engages.');
  }

  // CS analysis
  if (overallStats.avgCSPerMin >= 8) {
    tips.push('Strong farmer. Contest their CS and deny cannons to slow their spike timing.');
  } else if (overallStats.avgCSPerMin < 6) {
    tips.push('Weak farmer. Out-CS them and gain item advantage through superior gold income.');
  }

  // Vision analysis
  if (overallStats.avgVisionPerMin < 0.8) {
    tips.push('Poor vision control. Ask your jungler to gank - they likely won\'t see it coming.');
  }

  // Trend analysis
  if (trends.kdaTrend === 'declining' && trends.winRateTrend === 'declining') {
    tips.push('On a downward trend. They may be tilted - punish their mistakes aggressively.');
  } else if (trends.kdaTrend === 'improving' && trends.winRateTrend === 'improving') {
    tips.push('On a hot streak. Stay focused and don\'t underestimate them.');
  }

  // Death analysis
  if (overallStats.avgDeaths >= 5) {
    tips.push('Dies frequently. Set up vision and catch them when they overextend.');
  }

  // Kill participation
  if (overallStats.avgKillParticipation < 45) {
    tips.push('Low kill participation. They may not group well - punish with team plays.');
  }

  // Limit tips to best ones
  const displayTips = tips.slice(0, 4);

  if (displayTips.length === 0) {
    displayTips.push('Play your game and focus on your win conditions.');
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
          Game Plan vs {opponentChampion}
        </span>
      </div>
      <div className="space-y-2">
        {displayTips.map((tip, idx) => (
          <div key={idx} className="flex items-start gap-2 text-xs">
            <ChevronRight className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
            <span className="text-muted-foreground">{tip}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
