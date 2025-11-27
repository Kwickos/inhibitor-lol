import { NextRequest, NextResponse } from 'next/server';
import { getAccount, getSummoner, getRanks, getMasteries, getLiveGame } from '@/lib/cache';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import { RiotApiError } from '@/lib/riot-api';

interface Params {
  params: Promise<{
    region: string;
    riotId: string;
  }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { region, riotId } = await params;

    // Validate region
    if (!REGIONS[region as RegionKey]) {
      return NextResponse.json(
        { error: 'Invalid region' },
        { status: 400 }
      );
    }

    // Parse Riot ID (format: gameName-tagLine)
    const decodedRiotId = decodeURIComponent(riotId);
    const lastDashIndex = decodedRiotId.lastIndexOf('-');

    if (lastDashIndex === -1) {
      return NextResponse.json(
        { error: 'Invalid Riot ID format. Expected: gameName-tagLine' },
        { status: 400 }
      );
    }

    const gameName = decodedRiotId.substring(0, lastDashIndex);
    const tagLine = decodedRiotId.substring(lastDashIndex + 1);

    if (!gameName || !tagLine) {
      return NextResponse.json(
        { error: 'Invalid Riot ID format' },
        { status: 400 }
      );
    }

    const regionKey = region as RegionKey;

    // Get account info (PUUID)
    const account = await getAccount(gameName, tagLine, regionKey);

    // Get summoner, ranks, masteries, and live game in parallel
    // Using PUUID-based endpoint for ranks (like LeagueStats)
    const [summoner, ranks, masteries, liveGame] = await Promise.all([
      getSummoner(account.puuid, regionKey),
      getRanks(account.puuid, regionKey).catch((e) => {
        console.warn('Failed to fetch ranks:', e);
        return [];
      }),
      getMasteries(account.puuid, regionKey, 5).catch(() => []),
      getLiveGame(account.puuid, regionKey).catch(() => null),
    ]);

    return NextResponse.json({
      account,
      summoner,
      ranks,
      masteries,
      liveGame,
    });
  } catch (error) {
    console.error('Summoner API error:', error);

    if (error instanceof RiotApiError) {
      if (error.status === 404) {
        return NextResponse.json(
          { error: 'Summoner not found' },
          { status: 404 }
        );
      }
      if (error.status === 429) {
        return NextResponse.json(
          { error: 'Rate limited. Please try again later.' },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to fetch summoner data' },
      { status: 500 }
    );
  }
}
