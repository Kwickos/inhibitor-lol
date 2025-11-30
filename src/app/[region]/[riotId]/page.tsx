'use client';

import { useState, useEffect, use, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, AlertCircle, Loader2, History, BarChart3, Radio, PieChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/search-bar';
import { Logo } from '@/components/logo';
import { SummonerHeader } from '@/components/summoner-header';
import { RankCard, UnrankedCard } from '@/components/rank-card';
import { MatchList } from '@/components/match-list';
import { ChampionStatsCard } from '@/components/champion-stats-card';
import { DuoPartnersCard } from '@/components/duo-partners-card';
import { AnalysisPanel } from '@/components/analysis-panel';
import { StatsPanel } from '@/components/stats-panel';
import { LiveGamePanel } from '@/components/live-game-panel';
import { Skeleton } from '@/components/ui/skeleton';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import { cn } from '@/lib/utils';

interface PageProps {
  params: Promise<{
    region: string;
    riotId: string;
  }>;
}

interface SummonerData {
  account: {
    puuid: string;
    gameName: string;
    tagLine: string;
  };
  summoner: {
    id: string;
    profileIconId: number;
    summonerLevel: number;
  };
  ranks: Array<{
    queueType: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR';
    tier: string;
    rank: string;
    leaguePoints: number;
    wins: number;
    losses: number;
    summonerId: string;
    leagueId: string;
    hotStreak: boolean;
    veteran: boolean;
    freshBlood: boolean;
    inactive: boolean;
  }>;
  liveGame?: {
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
  } | null;
}

export default function SummonerPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const { region, riotId: encodedRiotId } = resolvedParams;

  // Parse riotId (format: gameName-tagLine)
  const decodedRiotId = decodeURIComponent(encodedRiotId);
  const lastDashIndex = decodedRiotId.lastIndexOf('-');
  const gameName = lastDashIndex > 0 ? decodedRiotId.substring(0, lastDashIndex) : decodedRiotId;
  const tagLine = lastDashIndex > 0 ? decodedRiotId.substring(lastDashIndex + 1) : 'EUW';

  const [data, setData] = useState<SummonerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'stats' | 'livegame'>('overview');

  // Auto-switch to live game tab when player is in game
  useEffect(() => {
    if (data?.liveGame) {
      setActiveTab('livegame');
    }
  }, [data?.liveGame]);

  // Handle new matches detected (game ended)
  const handleNewMatches = useCallback((count: number) => {
    if (count > 0 && data?.liveGame) {
      // Game ended - clear live game and switch to overview
      setData(prev => prev ? { ...prev, liveGame: null } : prev);
      setActiveTab('overview');
    }
  }, [data?.liveGame]);

  // Validate region
  const isValidRegion = REGIONS[region as RegionKey] !== undefined;

  // Fetch summoner data
  useEffect(() => {
    if (!isValidRegion) {
      setError('Invalid region');
      setIsLoading(false);
      return;
    }

    async function fetchData() {
      try {
        const riotIdParam = `${gameName}-${tagLine}`;
        const res = await fetch(`/api/summoner/${region}/${encodeURIComponent(riotIdParam)}`);

        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Summoner not found');
          }
          throw new Error('Failed to fetch summoner data');
        }

        const summonerData = await res.json();
        setData(summonerData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [region, gameName, tagLine, isValidRegion]);

  // Loading state
  if (isLoading) {
    return (
      <main className="flex-1 flex flex-col min-h-screen">
        <Header />
        <div className="container mx-auto px-4 py-8 space-y-8">
          <ProfileSkeleton />
        </div>
      </main>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <main className="flex-1 flex flex-col min-h-screen">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <ErrorState error={error || 'Failed to load summoner'} />
        </div>
      </main>
    );
  }

  const soloRank = data.ranks.find((r) => r.queueType === 'RANKED_SOLO_5x5');
  const flexRank = data.ranks.find((r) => r.queueType === 'RANKED_FLEX_SR');

  return (
    <main className="flex-1 flex flex-col min-h-screen">
      <Header />

      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Summoner Header */}
        <SummonerHeader
          puuid={data.account.puuid}
          gameName={data.account.gameName}
          tagLine={data.account.tagLine}
          region={region}
          profileIconId={data.summoner.profileIconId}
          summonerLevel={data.summoner.summonerLevel}
        />

        {/* Tab Navigation */}
        <div className="relative">
          <div className="flex items-center gap-1 p-1 bg-card/50 backdrop-blur-sm rounded-xl border border-border/30 w-fit">
            {/* Live Game Tab - Only show when in game */}
            {data.liveGame && (
              <TabButton
                active={activeTab === 'livegame'}
                onClick={() => setActiveTab('livegame')}
                icon={<Radio className="h-4 w-4" />}
                label="Live Game"
                highlight
              />
            )}
            <TabButton
              active={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
              icon={<History className="h-4 w-4" />}
              label="Overview"
            />
            <TabButton
              active={activeTab === 'analysis'}
              onClick={() => setActiveTab('analysis')}
              icon={<BarChart3 className="h-4 w-4" />}
              label="Analysis"
            />
            <TabButton
              active={activeTab === 'stats'}
              onClick={() => setActiveTab('stats')}
              icon={<PieChart className="h-4 w-4" />}
              label="Stats"
            />
          </div>
        </div>

        {/* Tab Content - All tabs stay mounted to preserve state */}
        <div className="relative">
          {/* Live Game Tab */}
          {data.liveGame && (
            <div className={cn(activeTab === 'livegame' ? 'block' : 'hidden')}>
              <LiveGamePanel
                currentPuuid={data.account.puuid}
                region={region}
                gameData={data.liveGame}
                isActive={activeTab === 'livegame'}
              />
            </div>
          )}

          {/* Overview Tab */}
          <div className={cn(activeTab === 'overview' ? 'block' : 'hidden')}>
            <motion.div
              initial="hidden"
              animate={activeTab === 'overview' ? 'visible' : 'hidden'}
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.08,
                    delayChildren: 0.05
                  }
                }
              }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              {/* Left column - Ranks & Champion Stats */}
              <motion.div
                className="space-y-6"
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: {
                      staggerChildren: 0.1,
                      delayChildren: 0.05
                    }
                  }
                }}
              >
                {/* Ranks */}
                <div className="space-y-4">
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, x: -20, scale: 0.95 },
                      visible: {
                        opacity: 1,
                        x: 0,
                        scale: 1,
                        transition: {
                          duration: 0.4,
                          ease: [0.25, 0.46, 0.45, 0.94] as const
                        }
                      }
                    }}
                  >
                    {soloRank ? (
                      <RankCard entry={soloRank} />
                    ) : (
                      <UnrankedCard queueType="RANKED_SOLO_5x5" />
                    )}
                  </motion.div>
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, x: -20, scale: 0.95 },
                      visible: {
                        opacity: 1,
                        x: 0,
                        scale: 1,
                        transition: {
                          duration: 0.4,
                          ease: [0.25, 0.46, 0.45, 0.94] as const
                        }
                      }
                    }}
                  >
                    {flexRank ? (
                      <RankCard entry={flexRank} delay={0.1} />
                    ) : (
                      <UnrankedCard queueType="RANKED_FLEX_SR" delay={0.1} />
                    )}
                  </motion.div>
                </div>

                {/* Champion Stats */}
                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: 20, scale: 0.97 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      transition: {
                        duration: 0.45,
                        ease: [0.25, 0.46, 0.45, 0.94] as const
                      }
                    }
                  }}
                >
                  <ChampionStatsCard puuid={data.account.puuid} />
                </motion.div>

                {/* Duo Partners */}
                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: 20, scale: 0.97 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      transition: {
                        duration: 0.45,
                        ease: [0.25, 0.46, 0.45, 0.94] as const
                      }
                    }
                  }}
                >
                  <DuoPartnersCard puuid={data.account.puuid} region={region as RegionKey} regionSlug={region} />
                </motion.div>
              </motion.div>

              {/* Right column - Match History */}
              <motion.div
                className="lg:col-span-2"
                variants={{
                  hidden: { opacity: 0, x: 30 },
                  visible: {
                    opacity: 1,
                    x: 0,
                    transition: {
                      duration: 0.5,
                      ease: [0.25, 0.46, 0.45, 0.94] as const,
                      delay: 0.15
                    }
                  }
                }}
              >
                <MatchList puuid={data.account.puuid} region={region} onNewMatches={handleNewMatches} />
              </motion.div>
            </motion.div>
          </div>

          {/* Analysis Tab */}
          <div className={cn(activeTab === 'analysis' ? 'block' : 'hidden')}>
            <AnalysisPanel
              puuid={data.account.puuid}
              region={region}
              gameName={data.account.gameName}
              tagLine={data.account.tagLine}
              isActive={activeTab === 'analysis'}
            />
          </div>

          {/* Stats Tab */}
          <div className={cn(activeTab === 'stats' ? 'block' : 'hidden')}>
            <StatsPanel
              puuid={data.account.puuid}
              region={region}
              gameName={data.account.gameName}
              tagLine={data.account.tagLine}
              isActive={activeTab === 'stats'}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/30 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>inhibitor.lol is not endorsed by Riot Games.</p>
        </div>
      </footer>
    </main>
  );
}

function Header() {
  return (
    <header className="w-full border-b border-border/30 sticky top-0 bg-background/80 backdrop-blur-md z-50">
      <div className="container mx-auto px-4 h-16 flex items-center gap-4">
        <Logo size="sm" />
        <div className="flex-1 max-w-md ml-auto">
          <SearchBar />
        </div>
      </div>
    </header>
  );
}


function ProfileSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-6">
        <Skeleton className="h-28 w-28 rounded-full" />
        <div className="space-y-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
        <div className="lg:col-span-2 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="p-4 rounded-full bg-destructive/10 mb-6">
        <AlertCircle className="h-12 w-12 text-destructive" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Oops!</h2>
      <p className="text-muted-foreground mb-6 max-w-md">{error}</p>
      <Link href="/">
        <Button variant="outline" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Search
        </Button>
      </Link>
    </motion.div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  highlight,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
        active
          ? highlight ? 'text-[#f59e0b]' : 'text-foreground'
          : highlight
            ? 'text-[#f59e0b]/70 hover:text-[#f59e0b]'
            : 'text-muted-foreground hover:text-foreground/80'
      )}
    >
      {active && (
        <motion.div
          layoutId="activeTab"
          className={cn(
            'absolute inset-0 rounded-lg shadow-sm border',
            highlight
              ? 'bg-[#f59e0b]/10 border-[#f59e0b]/30'
              : 'bg-background border-border/50'
          )}
          transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
        />
      )}
      <span className="relative z-10 flex items-center gap-2">
        {icon}
        {label}
      </span>
    </button>
  );
}
