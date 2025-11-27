'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, AlertCircle, Loader2, History, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/search-bar';
import { SummonerHeader } from '@/components/summoner-header';
import { RankCard, UnrankedCard } from '@/components/rank-card';
import { LiveGameBanner } from '@/components/live-game-banner';
import { MatchList } from '@/components/match-list';
import { ChampionStatsCard } from '@/components/champion-stats-card';
import { AnalysisPanel } from '@/components/analysis-panel';
import { Skeleton } from '@/components/ui/skeleton';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import { useSearchHistory } from '@/hooks/use-search-history';
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'analysis'>('overview');

  const { addToHistory } = useSearchHistory();

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

        // Add to search history
        addToHistory({ gameName, tagLine, region });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [region, gameName, tagLine, isValidRegion, addToHistory]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const riotIdParam = `${gameName}-${tagLine}`;
      const res = await fetch(`/api/summoner/${region}/${encodeURIComponent(riotIdParam)}`);
      if (res.ok) {
        const summonerData = await res.json();
        setData(summonerData);
      }
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

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
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />

        {/* Live Game Banner */}
        {data.liveGame && (
          <LiveGameBanner
            puuid={data.account.puuid}
            region={region}
            inGame={true}
            gameData={data.liveGame}
          />
        )}

        {/* Tab Navigation */}
        <div className="relative">
          <div className="flex items-center gap-1 p-1 bg-card/50 backdrop-blur-sm rounded-xl border border-border/30 w-fit">
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
          </div>
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'overview' ? (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              {/* Left column - Ranks & Champion Stats */}
              <div className="space-y-6">
                {/* Ranks */}
                <div className="space-y-4">
                  {soloRank ? (
                    <RankCard entry={soloRank} />
                  ) : (
                    <UnrankedCard queueType="RANKED_SOLO_5x5" />
                  )}
                  {flexRank ? (
                    <RankCard entry={flexRank} delay={0.1} />
                  ) : (
                    <UnrankedCard queueType="RANKED_FLEX_SR" delay={0.1} />
                  )}
                </div>

                {/* Champion Stats */}
                <ChampionStatsCard puuid={data.account.puuid} />
              </div>

              {/* Right column - Match History */}
              <div className="lg:col-span-2">
                <MatchList puuid={data.account.puuid} region={region} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="analysis"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <AnalysisPanel
                puuid={data.account.puuid}
                region={region}
                gameName={data.account.gameName}
                tagLine={data.account.tagLine}
              />
            </motion.div>
          )}
        </AnimatePresence>
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
        <Link href="/">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <Logo />
        <div className="flex-1 max-w-md ml-auto">
          <SearchBar />
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 group">
      <div className="relative">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center">
          <span className="text-white font-bold text-sm">i</span>
        </div>
      </div>
      <span className="text-lg font-bold tracking-tight hidden sm:inline">
        inhibitor
        <span className="text-primary">.lol</span>
      </span>
    </Link>
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
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground/80'
      )}
    >
      {active && (
        <motion.div
          layoutId="activeTab"
          className="absolute inset-0 bg-background rounded-lg shadow-sm border border-border/50"
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
