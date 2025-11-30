import { NextRequest, NextResponse } from 'next/server';
import { getMatchIds, getMatch, getSummoner } from '@/lib/cache';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import { RiotApiError } from '@/lib/riot-api';

interface Params {
  params: Promise<{
    puuid: string;
  }>;
}

// Ranked queue IDs
const RANKED_QUEUES = [420, 440]; // Solo/Duo and Flex

interface DuoPartner {
  puuid: string;
  gameName: string;
  tagLine: string;
  profileIconId: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { puuid } = await params;
    const { searchParams } = new URL(request.url);

    const region = searchParams.get('region') as RegionKey;
    const minGames = parseInt(searchParams.get('minGames') || '2', 10);

    // Validate region
    if (!region || !REGIONS[region]) {
      return NextResponse.json(
        { error: 'Invalid or missing region parameter' },
        { status: 400 }
      );
    }

    // Get recent match IDs (last 50 games for duo detection)
    let matchIds: string[] = [];
    try {
      matchIds = await getMatchIds(puuid, region, 50);
    } catch (error) {
      console.warn('Failed to fetch match IDs for duo partners:', error);
      return NextResponse.json({ partners: [] });
    }

    if (matchIds.length === 0) {
      return NextResponse.json({ partners: [] });
    }

    // Track teammates
    const teammateStats = new Map<string, {
      puuid: string;
      gameName: string;
      tagLine: string;
      games: number;
      wins: number;
    }>();

    // Fetch matches and analyze teammates (only ranked)
    // Process in small batches to avoid DB connection limit
    const batchSize = 5;
    for (let i = 0; i < matchIds.length; i += batchSize) {
      const batchMatchIds = matchIds.slice(i, i + batchSize);

      await Promise.all(
        batchMatchIds.map(async (matchId) => {
          try {
            const match = await getMatch(matchId, region);

            // Only count ranked games
            if (!RANKED_QUEUES.includes(match.info.queueId)) return;

            // Find player's team
            const player = match.info.participants.find(p => p.puuid === puuid);
            if (!player) return;

            const playerTeamId = player.teamId;

            // Find teammates (same team, not the player)
            const teammates = match.info.participants.filter(
              p => p.teamId === playerTeamId && p.puuid !== puuid
            );

            const isWin = player.win;

            for (const teammate of teammates) {
              const existing = teammateStats.get(teammate.puuid);

              if (existing) {
                existing.games++;
                if (isWin) existing.wins++;
                // Update name in case it changed
                existing.gameName = teammate.riotIdGameName;
                existing.tagLine = teammate.riotIdTagline;
              } else {
                teammateStats.set(teammate.puuid, {
                  puuid: teammate.puuid,
                  gameName: teammate.riotIdGameName,
                  tagLine: teammate.riotIdTagline,
                  games: 1,
                  wins: isWin ? 1 : 0,
                });
              }
            }
          } catch (error) {
            console.warn(`Failed to fetch match ${matchId}:`, error);
          }
        })
      );
    }

    // Filter teammates with minGames or more games together
    const frequentTeammates = Array.from(teammateStats.values())
      .filter(teammate => teammate.games >= minGames)
      .sort((a, b) => b.games - a.games)
      .slice(0, 5);

    // Fetch profile icons for frequent teammates
    const duoPartners: DuoPartner[] = await Promise.all(
      frequentTeammates.map(async (teammate) => {
        let profileIconId = 1; // Default icon
        try {
          const summoner = await getSummoner(teammate.puuid, region);
          profileIconId = summoner.profileIconId;
        } catch {
          // Use default icon if fetch fails
        }

        return {
          puuid: teammate.puuid,
          gameName: teammate.gameName,
          tagLine: teammate.tagLine,
          profileIconId,
          gamesPlayed: teammate.games,
          wins: teammate.wins,
          losses: teammate.games - teammate.wins,
          winRate: (teammate.wins / teammate.games) * 100,
        };
      })
    );

    return NextResponse.json({
      partners: duoPartners,
    });
  } catch (error) {
    console.error('Duo partners API error:', error);

    if (error instanceof RiotApiError) {
      if (error.status === 429) {
        return NextResponse.json(
          { error: 'Rate limited. Please try again later.' },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to fetch duo partners' },
      { status: 500 }
    );
  }
}
