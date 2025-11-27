import { NextRequest, NextResponse } from 'next/server';
import { getMatchIds, getMatch } from '@/lib/cache';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import { RiotApiError } from '@/lib/riot-api';

interface Params {
  params: Promise<{
    puuid: string;
  }>;
}

interface DuoPartner {
  puuid: string;
  gameName: string;
  tagLine: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  lastPlayedTogether: number;
  mostPlayedChampion: {
    championName: string;
    games: number;
  };
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

    // Get recent match IDs (last 50 games for better duo detection)
    const matchIds = await getMatchIds(puuid, region, 50);

    // Track teammates
    const teammateStats = new Map<string, {
      puuid: string;
      gameName: string;
      tagLine: string;
      games: number;
      wins: number;
      lastPlayed: number;
      champions: Map<string, number>;
    }>();

    // Fetch matches and analyze teammates
    await Promise.all(
      matchIds.map(async (matchId) => {
        try {
          const match = await getMatch(matchId, region);

          // Find player's team
          const player = match.info.participants.find(p => p.puuid === puuid);
          if (!player) return;

          const playerTeamId = player.teamId;

          // Find teammates (same team, not the player)
          const teammates = match.info.participants.filter(
            p => p.teamId === playerTeamId && p.puuid !== puuid
          );

          const isWin = player.win;
          const gameTime = match.info.gameCreation;

          for (const teammate of teammates) {
            const existing = teammateStats.get(teammate.puuid);

            if (existing) {
              existing.games++;
              if (isWin) existing.wins++;
              if (gameTime > existing.lastPlayed) {
                existing.lastPlayed = gameTime;
                // Update name in case it changed
                existing.gameName = teammate.riotIdGameName;
                existing.tagLine = teammate.riotIdTagline;
              }
              // Track champion
              const champCount = existing.champions.get(teammate.championName) || 0;
              existing.champions.set(teammate.championName, champCount + 1);
            } else {
              const champions = new Map<string, number>();
              champions.set(teammate.championName, 1);

              teammateStats.set(teammate.puuid, {
                puuid: teammate.puuid,
                gameName: teammate.riotIdGameName,
                tagLine: teammate.riotIdTagline,
                games: 1,
                wins: isWin ? 1 : 0,
                lastPlayed: gameTime,
                champions,
              });
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch match ${matchId}:`, error);
        }
      })
    );

    // Filter and format duo partners (only those with minGames or more games together)
    const duoPartners: DuoPartner[] = Array.from(teammateStats.values())
      .filter(teammate => teammate.games >= minGames)
      .map(teammate => {
        // Find most played champion
        let mostPlayedChamp = { championName: 'Unknown', games: 0 };
        teammate.champions.forEach((games, championName) => {
          if (games > mostPlayedChamp.games) {
            mostPlayedChamp = { championName, games };
          }
        });

        return {
          puuid: teammate.puuid,
          gameName: teammate.gameName,
          tagLine: teammate.tagLine,
          gamesPlayed: teammate.games,
          wins: teammate.wins,
          losses: teammate.games - teammate.wins,
          winRate: (teammate.wins / teammate.games) * 100,
          lastPlayedTogether: teammate.lastPlayed,
          mostPlayedChampion: mostPlayedChamp,
        };
      })
      .sort((a, b) => b.gamesPlayed - a.gamesPlayed)
      .slice(0, 5); // Top 5 duo partners

    return NextResponse.json({
      partners: duoPartners,
      totalGamesAnalyzed: matchIds.length,
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
