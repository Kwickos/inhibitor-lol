'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Shield,
  Eye,
  Sword,
  Zap,
  Users,
  Award,
  ChevronRight,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Flame,
  Crosshair,
} from 'lucide-react';
import { getChampionIconUrl } from '@/lib/riot-api';
import { getRoleIcon } from '@/components/icons/role-icons';
import type { PlayerAnalysis, AnalysisInsight, ImprovementSuggestion, BenchmarkMetric } from '@/types/analysis';
import { cn } from '@/lib/utils';

interface AnalysisPanelProps {
  puuid: string;
  region: string;
  gameName: string;
  tagLine: string;
}

type QueueType = 'solo' | 'flex';

export function AnalysisPanel({ puuid, region, gameName, tagLine }: AnalysisPanelProps) {
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
          throw new Error(data.error || 'Failed to fetch analysis');
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
    return <AnalysisLoading />;
  }

  if (error || !analysis) {
    return (
      <div className="space-y-4">
        <QueueSelector queueType={queueType} onQueueChange={setQueueType} />
        <AnalysisError error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Queue Selector */}
      <QueueSelector queueType={queueType} onQueueChange={setQueueType} />

      {/* Performance Overview - Radar Style Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        {/* Left: Stat Rings */}
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card to-primary/5 p-6">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

          <h3 className="text-lg font-semibold flex items-center gap-2 mb-6">
            <Crosshair className="h-5 w-5 text-primary" />
            Performance Overview
          </h3>

          <div className="grid grid-cols-3 gap-4">
            <StatRing
              label="Win Rate"
              value={analysis.overallStats.winRate}
              max={100}
              suffix="%"
              isGood={analysis.overallStats.winRate >= 50}
            />
            <StatRing
              label="KDA"
              value={analysis.overallStats.avgKDA}
              max={5}
              isGood={analysis.overallStats.avgKDA >= 2}
            />
            <StatRing
              label="Kill Part."
              value={analysis.overallStats.avgKillParticipation}
              max={100}
              suffix="%"
              isGood={analysis.overallStats.avgKillParticipation >= 50}
            />
          </div>

          <div className="mt-6 grid grid-cols-4 gap-3">
            <MiniStat label="CS/min" value={analysis.overallStats.avgCSPerMin.toFixed(1)} icon={<Zap className="h-3.5 w-3.5" />} />
            <MiniStat label="Vision" value={analysis.overallStats.avgVisionPerMin.toFixed(2)} icon={<Eye className="h-3.5 w-3.5" />} />
            <MiniStat label="DMG/min" value={`${(analysis.overallStats.avgDamagePerMin / 1000).toFixed(1)}k`} icon={<Sword className="h-3.5 w-3.5" />} />
            <MiniStat label="Gold/min" value={analysis.overallStats.avgGoldPerMin.toFixed(0)} icon={<Award className="h-3.5 w-3.5" />} />
          </div>
        </div>

        {/* Right: Trends */}
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card to-primary/5 p-6">
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Recent Trends
          </h3>

          <div className="space-y-4">
            <TrendBar
              label="KDA"
              values={analysis.trends.recentKDA}
              trend={analysis.trends.kdaTrend}
              format={(v) => v.toFixed(2)}
            />
            <TrendBar
              label="Win Rate"
              values={analysis.trends.recentWinRate}
              trend={analysis.trends.winRateTrend}
              format={(v) => `${v.toFixed(0)}%`}
            />
            <TrendBar
              label="CS/min"
              values={analysis.trends.recentCS}
              trend={analysis.trends.csTrend}
              format={(v) => v.toFixed(1)}
            />
            <TrendBar
              label="Vision"
              values={analysis.trends.recentVision}
              trend={analysis.trends.visionTrend}
              format={(v) => v.toFixed(2)}
            />
          </div>
        </div>
      </motion.div>

      {/* Insights & Improvement Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 xl:grid-cols-3 gap-6"
      >
        {/* Strengths & Weaknesses - 2 columns on xl */}
        <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          <InsightCard
            title="Strengths"
            icon={<CheckCircle2 className="h-5 w-5" />}
            insights={analysis.strengths}
            type="strength"
          />
          <InsightCard
            title="Areas to Improve"
            icon={<AlertTriangle className="h-5 w-5" />}
            insights={analysis.weaknesses}
            type="weakness"
          />
        </div>

        {/* Improvement Plan - Sidebar */}
        {analysis.improvements.length > 0 && (
          <div className="xl:col-span-1">
            <ImprovementPlanCompact improvements={analysis.improvements} />
          </div>
        )}
      </motion.div>

      {/* Champions & Role Performance Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 xl:grid-cols-3 gap-6"
      >
        {/* Top Champions - Takes 2 columns */}
        <div className="xl:col-span-2">
          <TopChampionsGrid champions={analysis.championAnalysis.slice(0, 8)} />
        </div>

        {/* Role Performance - Sidebar */}
        <div className="xl:col-span-1">
          <RolePerformanceCompact roleStats={analysis.roleStats} />
        </div>
      </motion.div>
    </div>
  );
}

function StatRing({
  label,
  value,
  max,
  suffix = '',
  isGood
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  isGood: boolean;
}) {
  const percentage = Math.min((value / max) * 100, 100);
  const circumference = 2 * Math.PI * 36;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Use vivid colors that work in SVG gradients - matching primary #6366F1
  const goodColors = { start: '#818cf8', end: '#6366f1' }; // Indigo gradient (primary)
  const badColors = { start: '#f87171', end: '#dc2626' };  // Red gradient (destructive)
  const colors = isGood ? goodColors : badColors;
  const uniqueId = `gradient-${label.replace(/\s+/g, '-').toLowerCase()}-${isGood ? 'good' : 'bad'}`;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
          <defs>
            <linearGradient id={uniqueId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={colors.start} />
              <stop offset="100%" stopColor={colors.end} />
            </linearGradient>
          </defs>
          {/* Background circle */}
          <circle
            cx="40"
            cy="40"
            r="36"
            stroke="currentColor"
            strokeWidth="6"
            fill="none"
            className="text-muted/30"
          />
          {/* Progress circle */}
          <motion.circle
            cx="40"
            cy="40"
            r="36"
            stroke={`url(#${uniqueId})`}
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: 'easeOut' }}
            style={{ strokeDasharray: circumference }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className={cn('text-xl font-bold', isGood ? 'text-primary' : 'text-destructive')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {value.toFixed(value < 10 ? 1 : 0)}{suffix}
          </motion.span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground mt-2">{label}</span>
    </div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-background/50 rounded-lg p-3 text-center border border-border/30">
      <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function TrendBar({
  label,
  values,
  trend,
  format
}: {
  label: string;
  values: number[];
  trend: 'improving' | 'stable' | 'declining';
  format: (v: number) => string;
}) {
  const maxValue = Math.max(...values);

  const trendIcon = {
    improving: <TrendingUp className="h-4 w-4 text-primary" />,
    stable: <Minus className="h-4 w-4 text-muted-foreground" />,
    declining: <TrendingDown className="h-4 w-4 text-destructive" />,
  };

  const trendColor = {
    improving: 'from-primary/20 to-primary',
    stable: 'from-muted/20 to-muted',
    declining: 'from-destructive/20 to-destructive',
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {trendIcon[trend]}
      </div>
      <div className="flex items-end gap-1 h-8">
        {values.map((val, idx) => {
          const height = (val / maxValue) * 100;
          const isRecent = idx === 0;
          return (
            <motion.div
              key={idx}
              className="flex-1 relative group"
              initial={{ height: 0 }}
              animate={{ height: `${height}%` }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
            >
              <div
                className={cn(
                  'absolute inset-0 rounded-t bg-gradient-to-t',
                  isRecent ? trendColor[trend] : 'from-muted/10 to-muted/30'
                )}
              />
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-popover px-2 py-1 rounded text-xs whitespace-nowrap z-10">
                {format(val)}
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Recent</span>
        <span>Older</span>
      </div>
    </div>
  );
}

function InsightCard({
  title,
  icon,
  insights,
  type,
}: {
  title: string;
  icon: React.ReactNode;
  insights: AnalysisInsight[];
  type: 'strength' | 'weakness';
}) {
  const categoryIcon: Record<string, React.ReactNode> = {
    combat: <Sword className="h-4 w-4" />,
    farming: <Zap className="h-4 w-4" />,
    vision: <Eye className="h-4 w-4" />,
    survivability: <Shield className="h-4 w-4" />,
    teamplay: <Users className="h-4 w-4" />,
    aggression: <Flame className="h-4 w-4" />,
    consistency: <Award className="h-4 w-4" />,
    objectives: <Target className="h-4 w-4" />,
  };

  const isStrength = type === 'strength';

  return (
    <div className={cn(
      'relative overflow-hidden rounded-2xl border bg-card p-5',
      isStrength ? 'border-primary/30' : 'border-destructive/30'
    )}>
      <div className={cn(
        'absolute inset-0 bg-gradient-to-br opacity-50',
        isStrength ? 'from-primary/10 via-transparent to-transparent' : 'from-destructive/10 via-transparent to-transparent'
      )} />

      <div className="relative">
        <div className={cn('flex items-center gap-2 mb-4', isStrength ? 'text-primary' : 'text-destructive')}>
          {icon}
          <h3 className="font-semibold text-foreground">{title}</h3>
          <span className="ml-auto text-xs bg-background/80 px-2 py-0.5 rounded-full text-muted-foreground">
            {insights.length} found
          </span>
        </div>

        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not enough data to identify {title.toLowerCase()}.</p>
        ) : (
          <div className="space-y-2">
            {insights.slice(0, 4).map((insight, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="flex items-start gap-3 p-3 rounded-xl bg-background/50 border border-border/30"
              >
                <div className={cn('mt-0.5 p-1.5 rounded-lg',
                  isStrength ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'
                )}>
                  {categoryIcon[insight.category] || <Zap className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{insight.title}</div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{insight.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ImprovementPlanCompact({ improvements }: { improvements: ImprovementSuggestion[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-card via-card to-primary/5 p-5 h-full">
      <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

      <div className="relative h-full flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-primary/20">
            <Target className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Improvement Plan</h3>
            <p className="text-[10px] text-muted-foreground">Focus areas</p>
          </div>
        </div>

        <div className="space-y-2 flex-1 overflow-y-auto">
          {improvements.slice(0, 5).map((improvement, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={cn(
                'rounded-lg border transition-all cursor-pointer',
                expanded === idx
                  ? 'bg-background/80 border-primary/50'
                  : 'bg-background/40 border-border/30 hover:border-border/50'
              )}
              onClick={() => setExpanded(expanded === idx ? null : idx)}
            >
              <div className="p-3">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs flex-shrink-0',
                    improvement.priority === 1 ? 'bg-primary/20 text-primary' :
                    improvement.priority === 2 ? 'bg-primary/10 text-primary/70' :
                    'bg-muted/30 text-muted-foreground'
                  )}>
                    {improvement.priority}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">{improvement.title}</h4>
                  </div>
                  <ChevronRight className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform flex-shrink-0',
                    expanded === idx && 'rotate-90'
                  )} />
                </div>

                {/* Compact progress bar */}
                <div className="mt-2">
                  <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-primary/70 to-primary rounded-full"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${Math.min(100, (improvement.currentValue / improvement.targetValue) * 100)}%`
                      }}
                      transition={{ duration: 0.8, delay: 0.2 }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>{improvement.currentValue.toFixed(1)}</span>
                    <span>{improvement.targetValue.toFixed(1)}</span>
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {expanded === idx && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 pt-1 border-t border-border/30">
                      <p className="text-[10px] font-medium text-muted-foreground mb-1.5">Tips:</p>
                      <div className="space-y-1">
                        {improvement.tips.slice(0, 3).map((tip, tipIdx) => (
                          <div key={tipIdx} className="flex items-start gap-1.5 text-xs">
                            <ChevronRight className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                            <span className="text-muted-foreground">{tip}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RolePerformanceCompact({ roleStats }: { roleStats: PlayerAnalysis['roleStats'] }) {
  const roles = Object.entries(roleStats).sort((a, b) => b[1].games - a[1].games);

  if (roles.length === 0) return null;

  const roleNames: Record<string, string> = {
    TOP: 'Top',
    JUNGLE: 'Jungle',
    MIDDLE: 'Mid',
    BOTTOM: 'ADC',
    UTILITY: 'Support',
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 h-full">
      <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        Role Performance
      </h3>

      <div className="space-y-2">
        {roles.map(([role, stats], idx) => {
          const RoleIcon = getRoleIcon(role);
          const isMainRole = idx === 0;
          return (
            <motion.div
              key={role}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={cn(
                'relative overflow-hidden rounded-lg border p-3 transition-all',
                isMainRole
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border/30 bg-background/50'
              )}
            >
              {isMainRole && (
                <div className="absolute top-1.5 right-1.5">
                  <span className="text-[8px] uppercase tracking-wider text-primary/70 font-semibold bg-primary/10 px-1.5 py-0.5 rounded">
                    Main
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className={cn(
                  'p-1.5 rounded-lg',
                  isMainRole ? 'bg-primary/20 text-primary' : 'bg-muted/30 text-muted-foreground'
                )}>
                  <RoleIcon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm">{roleNames[role] || role}</h4>
                    <div className={cn(
                      'text-sm font-bold ml-auto',
                      isMainRole ? 'mr-12' : '',
                      stats.winRate >= 50 ? 'text-primary' : 'text-destructive'
                    )}>
                      {stats.winRate.toFixed(0)}%
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-muted-foreground">{stats.games}G</span>
                    <span className="text-[10px] text-muted-foreground">{stats.avgKDA.toFixed(1)} KDA</span>
                    <span className="text-[10px] text-muted-foreground">{stats.avgCSPerMin.toFixed(1)} CS/m</span>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function RoleStat({ label, value, rating }: { label: string; value: string; rating: BenchmarkMetric['rating'] }) {
  // Simplified to 3 colors: good (primary), average (muted), bad (destructive)
  const ratingColor =
    rating === 'excellent' || rating === 'good' ? 'text-primary' :
    rating === 'average' ? 'text-muted-foreground' :
    'text-destructive';

  return (
    <div className="bg-background/50 rounded-lg p-2">
      <div className={cn('text-sm font-semibold', ratingColor)}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function TopChampionsGrid({ champions }: { champions: PlayerAnalysis['championAnalysis'] }) {
  if (champions.length === 0) return null;

  // Separate best champion from others
  const [bestChamp, ...otherChamps] = champions;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 h-full">
      <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
        <Award className="h-4 w-4 text-muted-foreground" />
        Top Champions
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Best Champion - Featured */}
        {bestChamp && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background p-4 sm:row-span-2"
          >
            <div className="absolute top-2 right-2">
              <span className="text-[8px] uppercase tracking-wider text-primary font-semibold bg-primary/20 px-1.5 py-0.5 rounded">
                Best
              </span>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="relative w-16 h-16 mb-3">
                <Image
                  src={getChampionIconUrl(bestChamp.championName)}
                  alt={bestChamp.championName}
                  width={64}
                  height={64}
                  className="rounded-xl ring-2 ring-primary/30"
                  unoptimized
                />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">
                  {bestChamp.games}
                </div>
              </div>
              <h4 className="font-semibold">{bestChamp.championName}</h4>
              <div className={cn(
                'text-2xl font-bold mt-1',
                bestChamp.winRate >= 50 ? 'text-primary' : 'text-destructive'
              )}>
                {bestChamp.winRate.toFixed(0)}%
              </div>
              <div className="text-sm text-muted-foreground">
                {bestChamp.avgKDA.toFixed(2)} KDA
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 w-full">
                <div className="text-center">
                  <div className="text-xs font-semibold">{bestChamp.avgKills.toFixed(1)}</div>
                  <div className="text-[10px] text-muted-foreground">Kills</div>
                </div>
                <div className="text-center">
                  <div className="text-xs font-semibold">{bestChamp.avgDeaths.toFixed(1)}</div>
                  <div className="text-[10px] text-muted-foreground">Deaths</div>
                </div>
                <div className="text-center">
                  <div className="text-xs font-semibold">{bestChamp.avgAssists.toFixed(1)}</div>
                  <div className="text-[10px] text-muted-foreground">Assists</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Other Champions - Compact Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-1 lg:grid-cols-2 gap-2 content-start">
          {otherChamps.slice(0, 6).map((champ, idx) => (
            <motion.div
              key={champ.championName}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="relative group"
            >
              <div className="flex items-center gap-2 p-2 rounded-lg border border-border/30 bg-background/50 transition-all group-hover:border-primary/30 group-hover:bg-background/80">
                <div className="relative w-10 h-10 flex-shrink-0">
                  <Image
                    src={getChampionIconUrl(champ.championName)}
                    alt={champ.championName}
                    width={40}
                    height={40}
                    className="rounded-lg"
                    unoptimized
                  />
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-card border border-border flex items-center justify-center text-[8px] font-bold">
                    {champ.games}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-medium truncate">{champ.championName}</h4>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'text-sm font-bold',
                      champ.winRate >= 50 ? 'text-primary' : 'text-destructive'
                    )}>
                      {champ.winRate.toFixed(0)}%
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {champ.avgKDA.toFixed(1)} KDA
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
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
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground mr-2">Queue:</span>
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
    </div>
  );
}

function AnalysisLoading() {
  return null;
}

function AnalysisError({ error }: { error: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="p-4 rounded-full bg-destructive/10 mb-4">
        <AlertTriangle className="h-10 w-10 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Analysis Failed</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        {error || 'Unable to generate analysis. Please try again later.'}
      </p>
    </div>
  );
}
