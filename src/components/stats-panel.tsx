'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Sword,
  Shield,
  Eye,
  Coins,
  Target,
  Skull,
  Crosshair,
  Zap,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  Users,
  Activity,
} from 'lucide-react';
import { getChampionIconUrl } from '@/lib/riot-api';
import { getRoleIcon } from '@/components/icons/role-icons';
import type { PlayerAnalysis } from '@/types/analysis';
import { cn } from '@/lib/utils';

interface StatsPanelProps {
  puuid: string;
  region: string;
  gameName: string;
  tagLine: string;
  isActive?: boolean;
}

type QueueType = 'solo' | 'flex';

export function StatsPanel({ puuid, region, gameName, tagLine, isActive = true }: StatsPanelProps) {
  const [analysis, setAnalysis] = useState<PlayerAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queueType, setQueueType] = useState<QueueType>('solo');

  useEffect(() => {
    async function fetchAnalysis() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/analysis/${puuid}?region=${region}&gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(tagLine)}&queue=${queueType}`
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to fetch stats');
        }
        const data = await res.json();
        setAnalysis(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    }

    fetchAnalysis();
  }, [puuid, region, gameName, tagLine, queueType]);

  if (isLoading) {
    return <StatsLoading />;
  }

  if (error || !analysis) {
    return <StatsError error={error} />;
  }

  const stats = analysis.overallStats;

  // Stagger animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.06,
        delayChildren: 0.02
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15, scale: 0.98 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.35,
        ease: [0.25, 0.46, 0.45, 0.94] as const
      }
    }
  };

  const sectionVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: [0.25, 0.46, 0.45, 0.94] as const
      }
    }
  };

  const scaleVariants = {
    hidden: { opacity: 0, scale: 0.92 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.45,
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
      {/* Queue Selector */}
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between"
      >
        <QueueSelector queueType={queueType} onQueueChange={setQueueType} />
        <div className="text-xs text-muted-foreground">
          {analysis.analyzedGames} games analyzed
        </div>
      </motion.div>

      {/* Main Stats Grid - Bento style */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: {
              staggerChildren: 0.04,
              delayChildren: 0.1
            }
          }
        }}
      >
        {/* Large KDA Card */}
        <motion.div
          variants={scaleVariants}
          className="col-span-2 row-span-2 relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card to-primary/5 p-5"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative h-full flex flex-col">
            <div className="flex items-center gap-2 text-muted-foreground mb-4">
              <Crosshair className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">KDA</span>
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <div className={cn(
                'text-5xl font-bold tracking-tight',
                stats.avgKDA >= 3 ? 'text-primary' : stats.avgKDA >= 2 ? 'text-foreground' : 'text-destructive'
              )}>
                {stats.avgKDA.toFixed(2)}
              </div>
              <div className="flex items-center gap-3 mt-3 text-sm">
                <span className="text-primary">{stats.avgKills.toFixed(1)}</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-destructive">{stats.avgDeaths.toFixed(1)}</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-muted-foreground">{stats.avgAssists.toFixed(1)}</span>
              </div>
            </div>
            <div className="mt-auto pt-4 border-t border-border/30">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Kill Participation</span>
                <span className={cn(
                  'font-semibold',
                  stats.avgKillParticipation >= 60 ? 'text-primary' : 'text-foreground'
                )}>
                  {stats.avgKillParticipation.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Win Rate */}
        <StatCard
          icon={<Target className="h-4 w-4" />}
          label="Win Rate"
          value={`${stats.winRate.toFixed(0)}%`}
          isGood={stats.winRate >= 50}
        />

        {/* CS/min */}
        <StatCard
          icon={<Coins className="h-4 w-4" />}
          label="CS / min"
          value={stats.avgCSPerMin.toFixed(1)}
          isGood={stats.avgCSPerMin >= 7}
        />

        {/* Vision */}
        <StatCard
          icon={<Eye className="h-4 w-4" />}
          label="Vision / min"
          value={stats.avgVisionPerMin.toFixed(2)}
          isGood={stats.avgVisionPerMin >= 1}
        />

        {/* Gold/min */}
        <StatCard
          icon={<Coins className="h-4 w-4" />}
          label="Gold / min"
          value={stats.avgGoldPerMin.toFixed(0)}
          isGood={stats.avgGoldPerMin >= 400}
        />

        {/* Damage/min */}
        <StatCard
          icon={<Sword className="h-4 w-4" />}
          label="DMG / min"
          value={`${(stats.avgDamagePerMin / 1000).toFixed(1)}k`}
          isGood={stats.avgDamagePerMin >= 600}
        />

        {/* Damage Share */}
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="DMG Share"
          value={`${stats.avgDamageShare.toFixed(0)}%`}
          isGood={stats.avgDamageShare >= 20}
        />

        {/* First Blood */}
        <StatCard
          icon={<Skull className="h-4 w-4" />}
          label="First Blood"
          value={`${stats.firstBloodRate.toFixed(0)}%`}
          isGood={stats.firstBloodRate >= 20}
        />

        {/* Game Duration */}
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Avg Game"
          value={`${stats.avgGameDuration.toFixed(0)}m`}
          neutral
        />
      </motion.div>

      {/* Advanced Stats Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Combat Stats */}
        <motion.div variants={sectionVariants}>
          <DetailedStatGroup
            title="Combat"
            icon={<Sword className="h-4 w-4" />}
            stats={[
              { label: 'Solo Kills', value: stats.avgSoloKills?.toFixed(1) || '—', highlight: (stats.avgSoloKills || 0) >= 1 },
              { label: 'Skillshots Hit', value: stats.avgSkillshotsHit?.toFixed(0) || '—' },
              { label: 'Skillshots Dodged', value: stats.avgSkillshotsDodged?.toFixed(0) || '—' },
              { label: 'Multi-Kill Games', value: `${stats.multiKillRate.toFixed(0)}%`, highlight: stats.multiKillRate >= 30 },
              { label: 'Avg Damage Dealt', value: `${(stats.avgDamageDealt / 1000).toFixed(1)}k` },
              { label: 'Avg Damage Taken', value: `${(stats.avgDamageTaken / 1000).toFixed(1)}k` },
            ]}
          />
        </motion.div>

        {/* Economy Stats */}
        <motion.div variants={sectionVariants}>
          <DetailedStatGroup
            title="Economy"
            icon={<Coins className="h-4 w-4" />}
            stats={[
              { label: 'Avg Gold Earned', value: `${(stats.avgGoldEarned / 1000).toFixed(1)}k` },
              { label: 'Gold Share', value: `${stats.avgGoldShare.toFixed(0)}%` },
              { label: 'Avg CS', value: stats.avgCS.toFixed(0) },
              { label: 'Turret Plates', value: stats.avgTurretPlatesTaken?.toFixed(1) || '—', highlight: (stats.avgTurretPlatesTaken || 0) >= 1 },
              { label: 'First Tower', value: `${stats.firstTowerRate.toFixed(0)}%`, highlight: stats.firstTowerRate >= 25 },
              { label: 'Early Gold Adv', value: stats.avgEarlyGoldAdvantage?.toFixed(0) || '—' },
            ]}
          />
        </motion.div>

        {/* Vision Stats */}
        <motion.div variants={sectionVariants}>
          <DetailedStatGroup
            title="Vision"
            icon={<Eye className="h-4 w-4" />}
            stats={[
              { label: 'Avg Vision Score', value: stats.avgVisionScore.toFixed(0) },
              { label: 'Control Wards', value: stats.avgControlWardsPlaced?.toFixed(1) || '—', highlight: (stats.avgControlWardsPlaced || 0) >= 2 },
              { label: 'Wards Killed', value: stats.avgWardsKilled?.toFixed(1) || '—' },
              { label: 'Vision / min', value: stats.avgVisionPerMin.toFixed(2) },
            ]}
          />
        </motion.div>

        {/* Objectives Stats */}
        <motion.div variants={sectionVariants}>
          <DetailedStatGroup
            title="Objectives"
            icon={<Target className="h-4 w-4" />}
            stats={[
              { label: 'Dragon Takedowns', value: stats.avgDragonTakedowns?.toFixed(1) || '—' },
              { label: 'Objective Part.', value: stats.objectiveParticipation > 0 ? stats.objectiveParticipation.toFixed(1) : '—' },
              { label: 'First Tower Rate', value: `${stats.firstTowerRate.toFixed(0)}%` },
              { label: 'First Blood Rate', value: `${stats.firstBloodRate.toFixed(0)}%` },
            ]}
          />
        </motion.div>
      </div>

      {/* Role Breakdown */}
      <motion.div variants={sectionVariants}>
        <RoleBreakdown roleStats={analysis.roleStats} />
      </motion.div>

      {/* Champion Stats Table */}
      <motion.div variants={sectionVariants}>
        <ChampionStatsTable champions={analysis.championAnalysis} />
      </motion.div>

      {/* Trends Visualization */}
      <motion.div variants={sectionVariants}>
        <TrendsSection trends={analysis.trends} />
      </motion.div>
    </motion.div>
  );
}

function StatCard({
  icon,
  label,
  value,
  isGood,
  neutral,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  isGood?: boolean;
  neutral?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 12, scale: 0.96 },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: {
            duration: 0.3,
            ease: [0.25, 0.46, 0.45, 0.94] as const
          }
        }
      }}
      className="relative overflow-hidden rounded-xl border border-border/50 bg-card p-4 hover:border-primary/30 transition-colors"
    >
      <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className={cn(
        'text-2xl font-bold',
        neutral ? 'text-foreground' : isGood ? 'text-primary' : 'text-destructive'
      )}>
        {value}
      </div>
    </motion.div>
  );
}

function DetailedStatGroup({
  title,
  icon,
  stats,
}: {
  title: string;
  icon: React.ReactNode;
  stats: Array<{ label: string; value: string; highlight?: boolean }>;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{stat.label}</span>
            <span className={cn(
              'text-sm font-semibold tabular-nums',
              stat.highlight ? 'text-primary' : 'text-foreground'
            )}>
              {stat.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleBreakdown({ roleStats }: { roleStats: PlayerAnalysis['roleStats'] }) {
  const roles = Object.entries(roleStats).sort((a, b) => b[1].games - a[1].games);
  const totalGames = roles.reduce((sum, [, stats]) => sum + stats.games, 0);

  if (roles.length === 0) return null;

  const roleNames: Record<string, string> = {
    TOP: 'Top',
    JUNGLE: 'Jungle',
    MIDDLE: 'Mid',
    BOTTOM: 'ADC',
    UTILITY: 'Support',
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
          <Users className="h-4 w-4" />
        </div>
        <h3 className="font-semibold text-sm">Role Breakdown</h3>
      </div>

      <div className="space-y-3">
        {roles.map(([role, stats], idx) => {
          const RoleIcon = getRoleIcon(role);
          const percentage = (stats.games / totalGames) * 100;
          const isMain = idx === 0;

          return (
            <div key={role} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RoleIcon className={cn('w-4 h-4', isMain ? 'text-primary' : 'text-muted-foreground')} />
                  <span className={cn('text-sm font-medium', isMain && 'text-primary')}>
                    {roleNames[role] || role}
                  </span>
                  {isMain && (
                    <span className="text-[8px] uppercase tracking-wider text-primary/70 font-semibold bg-primary/10 px-1.5 py-0.5 rounded">
                      Main
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-muted-foreground">{stats.games}G</span>
                  <span className={cn('font-semibold', stats.winRate >= 50 ? 'text-primary' : 'text-destructive')}>
                    {stats.winRate.toFixed(0)}% WR
                  </span>
                  <span className="text-muted-foreground">{stats.avgKDA.toFixed(2)} KDA</span>
                </div>
              </div>
              <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                <motion.div
                  className={cn('h-full rounded-full', isMain ? 'bg-primary' : 'bg-muted')}
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.8, delay: idx * 0.1 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChampionStatsTable({ champions }: { champions: PlayerAnalysis['championAnalysis'] }) {
  const [showAll, setShowAll] = useState(false);
  const displayedChamps = showAll ? champions : champions.slice(0, 5);

  if (champions.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="p-5 border-b border-border/30">
        <h3 className="font-semibold text-sm">Champion Performance</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/30 text-xs text-muted-foreground">
              <th className="text-left p-3 font-medium">Champion</th>
              <th className="text-center p-3 font-medium">Games</th>
              <th className="text-center p-3 font-medium">Win Rate</th>
              <th className="text-center p-3 font-medium">KDA</th>
              <th className="text-center p-3 font-medium">CS/min</th>
              <th className="text-center p-3 font-medium">DMG/min</th>
              <th className="text-center p-3 font-medium hidden md:table-cell">KP</th>
            </tr>
          </thead>
          <tbody>
            {displayedChamps.map((champ, idx) => (
              <motion.tr
                key={champ.championName}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="border-b border-border/20 hover:bg-muted/30 transition-colors"
              >
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <Image
                      src={getChampionIconUrl(champ.championName)}
                      alt={champ.championName}
                      width={32}
                      height={32}
                      className="rounded-lg"
                      unoptimized
                    />
                    <div>
                      <div className="font-medium text-sm">{champ.championName}</div>
                      <div className="text-[10px] text-muted-foreground">{champ.role}</div>
                    </div>
                  </div>
                </td>
                <td className="text-center p-3 text-sm">{champ.games}</td>
                <td className="text-center p-3">
                  <span className={cn(
                    'text-sm font-semibold',
                    champ.winRate >= 50 ? 'text-primary' : 'text-destructive'
                  )}>
                    {champ.winRate.toFixed(0)}%
                  </span>
                </td>
                <td className="text-center p-3">
                  <span className={cn(
                    'text-sm font-semibold',
                    champ.avgKDA >= 3 ? 'text-primary' : champ.avgKDA >= 2 ? 'text-foreground' : 'text-destructive'
                  )}>
                    {champ.avgKDA.toFixed(2)}
                  </span>
                </td>
                <td className="text-center p-3 text-sm text-muted-foreground">
                  {champ.avgCSPerMin.toFixed(1)}
                </td>
                <td className="text-center p-3 text-sm text-muted-foreground">
                  {(champ.avgDamagePerMin / 1000).toFixed(1)}k
                </td>
                <td className="text-center p-3 text-sm text-muted-foreground hidden md:table-cell">
                  {champ.avgKillParticipation.toFixed(0)}%
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {champions.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full p-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors flex items-center justify-center gap-1"
        >
          {showAll ? 'Show less' : `Show all ${champions.length} champions`}
          <ChevronDown className={cn('h-3 w-3 transition-transform', showAll && 'rotate-180')} />
        </button>
      )}
    </div>
  );
}

function TrendsSection({ trends }: { trends: PlayerAnalysis['trends'] }) {
  const trendIcon = (trend: 'improving' | 'stable' | 'declining') => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="h-4 w-4 text-primary" />;
      case 'declining':
        return <TrendingDown className="h-4 w-4 text-destructive" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const trendLabel = (trend: 'improving' | 'stable' | 'declining') => {
    switch (trend) {
      case 'improving':
        return 'Improving';
      case 'declining':
        return 'Declining';
      default:
        return 'Stable';
    }
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
          <Activity className="h-4 w-4" />
        </div>
        <h3 className="font-semibold text-sm">Recent Trends</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">Last 20 games</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'KDA', trend: trends.kdaTrend, values: trends.recentKDA },
          { label: 'Win Rate', trend: trends.winRateTrend, values: trends.recentWinRate },
          { label: 'CS/min', trend: trends.csTrend, values: trends.recentCS },
          { label: 'Vision', trend: trends.visionTrend, values: trends.recentVision },
        ].map((item) => (
          <div key={item.label} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <div className="flex items-center gap-1">
                {trendIcon(item.trend)}
                <span className={cn(
                  'text-[10px] font-medium',
                  item.trend === 'improving' ? 'text-primary' :
                  item.trend === 'declining' ? 'text-destructive' : 'text-muted-foreground'
                )}>
                  {trendLabel(item.trend)}
                </span>
              </div>
            </div>
            {/* Mini sparkline */}
            <div className="flex items-end gap-0.5 h-8">
              {item.values.map((val, idx) => {
                const max = Math.max(...item.values);
                const min = Math.min(...item.values);
                const range = max - min || 1;
                const height = ((val - min) / range) * 100;
                const isRecent = idx === 0;

                return (
                  <motion.div
                    key={idx}
                    className={cn(
                      'flex-1 rounded-sm',
                      isRecent
                        ? item.trend === 'improving' ? 'bg-primary' :
                          item.trend === 'declining' ? 'bg-destructive' : 'bg-muted'
                        : 'bg-muted/50'
                    )}
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(20, height)}%` }}
                    transition={{ duration: 0.5, delay: idx * 0.05 }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QueueSelector({
  queueType,
  onQueueChange,
}: {
  queueType: QueueType;
  onQueueChange: (queue: QueueType) => void;
}) {
  return (
    <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-lg">
      <button
        onClick={() => onQueueChange('solo')}
        className={cn(
          'px-3 py-1.5 rounded-md text-sm font-medium transition-all',
          queueType === 'solo'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
      >
        Solo/Duo
      </button>
      <button
        onClick={() => onQueueChange('flex')}
        className={cn(
          'px-3 py-1.5 rounded-md text-sm font-medium transition-all',
          queueType === 'flex'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
      >
        Flex
      </button>
    </div>
  );
}

function StatsLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
    </div>
  );
}

function StatsError({ error }: { error: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="p-4 rounded-full bg-destructive/10 mb-4">
        <Skull className="h-10 w-10 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Failed to load stats</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        {error || 'Unable to load statistics. Please try again later.'}
      </p>
    </div>
  );
}
