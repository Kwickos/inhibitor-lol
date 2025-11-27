'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  AlertCircle,
  Loader2,
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import { getChampionIconUrl } from '@/lib/riot-api';
import type { PlayerAnalysis, AnalysisInsight, ImprovementSuggestion, BenchmarkMetric } from '@/types/analysis';
import { cn } from '@/lib/utils';

interface PageProps {
  params: Promise<{
    region: string;
    riotId: string;
  }>;
}

export default function AnalysisPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const { region, riotId: encodedRiotId } = resolvedParams;

  const decodedRiotId = decodeURIComponent(encodedRiotId);
  const lastDashIndex = decodedRiotId.lastIndexOf('-');
  const gameName = lastDashIndex > 0 ? decodedRiotId.substring(0, lastDashIndex) : decodedRiotId;
  const tagLine = lastDashIndex > 0 ? decodedRiotId.substring(lastDashIndex + 1) : 'EUW';

  const [analysis, setAnalysis] = useState<PlayerAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isValidRegion = REGIONS[region as RegionKey] !== undefined;

  useEffect(() => {
    if (!isValidRegion) {
      setError('Invalid region');
      setIsLoading(false);
      return;
    }

    async function fetchAnalysis() {
      try {
        // First get puuid
        const riotIdParam = `${gameName}-${tagLine}`;
        const summonerRes = await fetch(`/api/summoner/${region}/${encodeURIComponent(riotIdParam)}`);
        if (!summonerRes.ok) throw new Error('Summoner not found');
        const summonerData = await summonerRes.json();

        // Then fetch analysis
        const analysisRes = await fetch(
          `/api/analysis/${summonerData.account.puuid}?region=${region}&gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(tagLine)}`
        );
        if (!analysisRes.ok) throw new Error('Failed to fetch analysis');

        const analysisData = await analysisRes.json();
        setAnalysis(analysisData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    }

    fetchAnalysis();
  }, [region, gameName, tagLine, isValidRegion]);

  if (isLoading) {
    return (
      <main className="flex-1 flex flex-col min-h-screen">
        <Header region={region} riotId={encodedRiotId} />
        <div className="container mx-auto px-4 py-8 space-y-8">
          <AnalysisSkeleton />
        </div>
      </main>
    );
  }

  if (error || !analysis) {
    return (
      <main className="flex-1 flex flex-col min-h-screen">
        <Header region={region} riotId={encodedRiotId} />
        <div className="container mx-auto px-4 py-8">
          <ErrorState error={error || 'Failed to load analysis'} region={region} riotId={encodedRiotId} />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col min-h-screen">
      <Header region={region} riotId={encodedRiotId} />

      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Title Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <h1 className="text-3xl font-bold">
            Analysis for {analysis.gameName}
            <span className="text-muted-foreground">#{analysis.tagLine}</span>
          </h1>
          <p className="text-muted-foreground">
            Based on {analysis.analyzedGames} recent games
          </p>
        </motion.div>

        {/* Overview Stats */}
        <OverviewSection stats={analysis.overallStats} />

        {/* Strengths & Weaknesses */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <InsightsCard
            title="Strengths"
            icon={<TrendingUp className="h-5 w-5 text-green-500" />}
            insights={analysis.strengths}
            type="strength"
          />
          <InsightsCard
            title="Areas to Improve"
            icon={<Target className="h-5 w-5 text-amber-500" />}
            insights={analysis.weaknesses}
            type="weakness"
          />
        </div>

        {/* Improvement Suggestions */}
        <ImprovementsSection improvements={analysis.improvements} />

        {/* Role Performance */}
        <RolePerformanceSection roleStats={analysis.roleStats} />

        {/* Champion Analysis */}
        <ChampionAnalysisSection champions={analysis.championAnalysis} />

        {/* Performance Trends */}
        <TrendsSection trends={analysis.trends} />
      </div>

      <footer className="mt-auto border-t border-border/30 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>inhibitor.lol is not endorsed by Riot Games.</p>
        </div>
      </footer>
    </main>
  );
}

function Header({ region, riotId }: { region: string; riotId: string }) {
  return (
    <header className="w-full border-b border-border/30 sticky top-0 bg-background/80 backdrop-blur-md z-50">
      <div className="container mx-auto px-4 h-16 flex items-center gap-4">
        <Link href={`/${region}/${riotId}`}>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">i</span>
          </div>
          <span className="text-lg font-bold tracking-tight hidden sm:inline">
            inhibitor<span className="text-primary">.lol</span>
          </span>
        </Link>
        <span className="text-muted-foreground hidden sm:inline">/ Analysis</span>
      </div>
    </header>
  );
}

function OverviewSection({ stats }: { stats: PlayerAnalysis['overallStats'] }) {
  const statCards = [
    { label: 'Win Rate', value: `${stats.winRate.toFixed(1)}%`, color: stats.winRate >= 50 ? 'text-green-500' : 'text-red-500' },
    { label: 'KDA', value: stats.avgKDA.toFixed(2), color: stats.avgKDA >= 3 ? 'text-green-500' : stats.avgKDA >= 2 ? 'text-foreground' : 'text-red-500' },
    { label: 'Avg K/D/A', value: `${stats.avgKills.toFixed(1)} / ${stats.avgDeaths.toFixed(1)} / ${stats.avgAssists.toFixed(1)}` },
    { label: 'CS/min', value: stats.avgCSPerMin.toFixed(1) },
    { label: 'Vision/min', value: stats.avgVisionPerMin.toFixed(2) },
    { label: 'Kill Part.', value: `${stats.avgKillParticipation.toFixed(0)}%` },
    { label: 'DMG/min', value: `${(stats.avgDamagePerMin / 1000).toFixed(1)}k` },
    { label: 'Gold/min', value: stats.avgGoldPerMin.toFixed(0) },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4"
    >
      {statCards.map((stat, idx) => (
        <div
          key={stat.label}
          className="bg-card border border-border/50 rounded-xl p-4 text-center"
        >
          <div className={cn('text-2xl font-bold', stat.color)}>{stat.value}</div>
          <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
        </div>
      ))}
    </motion.div>
  );
}

function InsightsCard({
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
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'combat': return <Sword className="h-4 w-4" />;
      case 'farming': return <Zap className="h-4 w-4" />;
      case 'vision': return <Eye className="h-4 w-4" />;
      case 'survivability': return <Shield className="h-4 w-4" />;
      case 'teamplay': return <Users className="h-4 w-4" />;
      case 'aggression': return <Target className="h-4 w-4" />;
      case 'consistency': return <Award className="h-4 w-4" />;
      default: return <Zap className="h-4 w-4" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className={cn(
        'bg-card border rounded-xl p-6',
        type === 'strength' ? 'border-green-500/30' : 'border-amber-500/30'
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>

      {insights.length === 0 ? (
        <p className="text-muted-foreground text-sm">Not enough data to identify {title.toLowerCase()}.</p>
      ) : (
        <div className="space-y-3">
          {insights.map((insight, idx) => (
            <div
              key={idx}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg',
                type === 'strength' ? 'bg-green-500/10' : 'bg-amber-500/10'
              )}
            >
              <div className={cn(
                'mt-0.5',
                type === 'strength' ? 'text-green-500' : 'text-amber-500'
              )}>
                {getCategoryIcon(insight.category)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{insight.title}</div>
                <p className="text-sm text-muted-foreground">{insight.description}</p>
                {insight.comparison && (
                  <p className="text-xs text-muted-foreground mt-1">{insight.comparison}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function ImprovementsSection({ improvements }: { improvements: ImprovementSuggestion[] }) {
  if (improvements.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-card border border-primary/30 rounded-xl p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Improvement Plan</h2>
      </div>

      <div className="space-y-4">
        {improvements.map((improvement, idx) => (
          <div key={idx} className="border border-border/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className={cn(
                'px-2 py-0.5 text-xs font-medium rounded',
                improvement.priority === 1 ? 'bg-red-500/20 text-red-500' :
                improvement.priority === 2 ? 'bg-amber-500/20 text-amber-500' :
                'bg-blue-500/20 text-blue-500'
              )}>
                Priority {improvement.priority}
              </span>
              <h3 className="font-semibold">{improvement.title}</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{improvement.description}</p>

            {/* Progress bar */}
            <div className="mb-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Current: {improvement.currentValue.toFixed(1)}</span>
                <span>Target: {improvement.targetValue.toFixed(1)}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (improvement.currentValue / improvement.targetValue) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Tips */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Tips:</p>
              {improvement.tips.map((tip, tipIdx) => (
                <div key={tipIdx} className="flex items-center gap-2 text-sm">
                  <ChevronRight className="h-3 w-3 text-primary" />
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function RolePerformanceSection({ roleStats }: { roleStats: PlayerAnalysis['roleStats'] }) {
  const roles = Object.entries(roleStats).sort((a, b) => b[1].games - a[1].games);

  if (roles.length === 0) return null;

  const getRatingColor = (rating: BenchmarkMetric['rating']) => {
    switch (rating) {
      case 'excellent': return 'text-green-500';
      case 'good': return 'text-emerald-400';
      case 'average': return 'text-yellow-500';
      case 'below_average': return 'text-orange-500';
      case 'poor': return 'text-red-500';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="bg-card border border-border/50 rounded-xl p-6"
    >
      <h2 className="text-lg font-semibold mb-4">Performance by Role</h2>

      <div className="space-y-4">
        {roles.map(([role, stats]) => (
          <div key={role} className="border border-border/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold capitalize">{role.toLowerCase()}</h3>
                <p className="text-sm text-muted-foreground">{stats.games} games • {stats.winRate.toFixed(0)}% WR</p>
              </div>
              <div className={cn(
                'text-2xl font-bold',
                stats.winRate >= 50 ? 'text-green-500' : 'text-red-500'
              )}>
                {stats.avgKDA.toFixed(2)} KDA
              </div>
            </div>

            {/* Benchmark comparisons */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {Object.entries(stats.benchmarkComparison).map(([key, metric]) => (
                <div key={key} className="text-center">
                  <div className={cn('text-sm font-medium', getRatingColor(metric.rating))}>
                    {metric.value.toFixed(key === 'kda' ? 2 : 1)}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Top {100 - metric.percentile}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function ChampionAnalysisSection({ champions }: { champions: PlayerAnalysis['championAnalysis'] }) {
  const topChampions = champions.slice(0, 10);

  if (topChampions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="bg-card border border-border/50 rounded-xl p-6"
    >
      <h2 className="text-lg font-semibold mb-4">Champion Performance</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border/30">
              <th className="pb-2 pr-4">Champion</th>
              <th className="pb-2 px-4 text-center">Games</th>
              <th className="pb-2 px-4 text-center">Win Rate</th>
              <th className="pb-2 px-4 text-center">KDA</th>
              <th className="pb-2 px-4 text-center">CS/min</th>
              <th className="pb-2 px-4 text-center">Avg Damage</th>
            </tr>
          </thead>
          <tbody>
            {topChampions.map((champ) => (
              <tr key={champ.championName} className="border-b border-border/20">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <Image
                      src={getChampionIconUrl(champ.championName)}
                      alt={champ.championName}
                      width={32}
                      height={32}
                      className="rounded"
                      unoptimized
                    />
                    <span className="font-medium">{champ.championName}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-center">{champ.games}</td>
                <td className={cn(
                  'py-3 px-4 text-center font-medium',
                  champ.winRate >= 50 ? 'text-green-500' : 'text-red-500'
                )}>
                  {champ.winRate.toFixed(0)}%
                </td>
                <td className={cn(
                  'py-3 px-4 text-center font-medium',
                  champ.avgKDA >= 3 ? 'text-green-500' : champ.avgKDA >= 2 ? 'text-foreground' : 'text-red-500'
                )}>
                  {champ.avgKDA.toFixed(2)}
                </td>
                <td className="py-3 px-4 text-center">{champ.avgCSPerMin.toFixed(1)}</td>
                <td className="py-3 px-4 text-center">{(champ.avgDamage / 1000).toFixed(1)}k</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

function TrendsSection({ trends }: { trends: PlayerAnalysis['trends'] }) {
  const getTrendIcon = (trend: 'improving' | 'stable' | 'declining') => {
    switch (trend) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'declining': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const trendItems = [
    { label: 'KDA', values: trends.recentKDA, trend: trends.kdaTrend },
    { label: 'Win Rate', values: trends.recentWinRate, trend: trends.winRateTrend, suffix: '%' },
    { label: 'CS/min', values: trends.recentCS, trend: trends.csTrend },
    { label: 'Vision/min', values: trends.recentVision, trend: trends.visionTrend },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="bg-card border border-border/50 rounded-xl p-6"
    >
      <h2 className="text-lg font-semibold mb-4">Performance Trends</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Comparing your most recent games (left) to older games (right)
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {trendItems.map((item) => (
          <div key={item.label} className="border border-border/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{item.label}</span>
              {getTrendIcon(item.trend)}
            </div>
            <div className="flex items-center gap-1">
              {item.values.map((val, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex-1 h-8 rounded flex items-center justify-center text-xs font-medium',
                    idx === 0 ? 'bg-primary/20 text-primary' : 'bg-muted/50'
                  )}
                >
                  {val.toFixed(1)}{item.suffix || ''}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>Recent</span>
              <span>Older</span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function AnalysisSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

function ErrorState({ error, region, riotId }: { error: string; region: string; riotId: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="p-4 rounded-full bg-destructive/10 mb-6">
        <AlertCircle className="h-12 w-12 text-destructive" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Analysis Failed</h2>
      <p className="text-muted-foreground mb-6 max-w-md">{error}</p>
      <Link href={`/${region}/${riotId}`}>
        <Button variant="outline" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Profile
        </Button>
      </Link>
    </motion.div>
  );
}
