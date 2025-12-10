import { NextRequest, NextResponse } from 'next/server';
import { getStoredMatchSummaries } from '@/lib/cache';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import type { MatchSummary } from '@/types/riot';

// FAST PATH ONLY: Return stored matches from DB immediately
// For fetching new matches, use /api/refresh-matches/[puuid] instead

interface Params {
  params: Promise<{
    puuid: string;
  }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { puuid } = await params;
    const { searchParams } = new URL(request.url);

    const region = searchParams.get('region') as RegionKey;

    // Validate region
    if (!region || !REGIONS[region]) {
      return NextResponse.json(
        { error: 'Invalid or missing region parameter' },
        { status: 400 }
      );
    }

    // FAST PATH: Return stored matches from DB immediately
    // This should be very fast (<100ms)
    const storedSummaries = await getStoredMatchSummaries(puuid);

    // Convert to MatchSummary format
    const allSummaries: MatchSummary[] = storedSummaries.map(s => ({
      matchId: s.matchId,
      queueId: s.queueId,
      gameCreation: s.gameCreation,
      gameDuration: s.gameDuration,
      gameMode: s.gameMode,
      participant: s.participant,
      win: s.win,
      allParticipants: s.allParticipants,
      teams: s.teams,
    }));

    // Sort by game creation time (most recent first)
    allSummaries.sort((a, b) => b.gameCreation - a.gameCreation);

    return NextResponse.json({
      matches: allSummaries,
      total: allSummaries.length,
      hasMatches: allSummaries.length > 0,
    });
  } catch (error) {
    console.error('Matches API error:', error);

    return NextResponse.json(
      { error: 'Failed to fetch match history' },
      { status: 500 }
    );
  }
}
