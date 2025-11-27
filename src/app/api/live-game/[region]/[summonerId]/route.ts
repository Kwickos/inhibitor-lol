import { NextRequest, NextResponse } from 'next/server';
import { getLiveGame, getRanks, getSummoner } from '@/lib/cache';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import { RiotApiError, getAccountByPuuid } from '@/lib/riot-api';

interface Params {
  params: Promise<{
    region: string;
    summonerId: string;
  }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { region, summonerId } = await params;

    // Validate region
    if (!REGIONS[region as RegionKey]) {
      return NextResponse.json(
        { error: 'Invalid region' },
        { status: 400 }
      );
    }

    const regionKey = region as RegionKey;

    // summonerId here is actually the puuid (passed from frontend)
    const puuid = summonerId;

    // Get live game
    const liveGame = await getLiveGame(puuid, regionKey);

    if (!liveGame) {
      return NextResponse.json(
        { inGame: false },
        { status: 200 }
      );
    }

    // Enrich participant data with ranks
    const enrichedParticipants = await Promise.all(
      liveGame.participants.map(async (participant) => {
        try {
          // Get account info for display name
          const account = await getAccountByPuuid(participant.puuid, regionKey);

          // Get summoner data for summoner ID
          const summoner = await getSummoner(participant.puuid, regionKey);

          // Get ranks using PUUID
          const ranks = await getRanks(participant.puuid, regionKey).catch(() => []);

          const soloRank = ranks.find(r => r.queueType === 'RANKED_SOLO_5x5');

          return {
            ...participant,
            gameName: account.gameName,
            tagLine: account.tagLine,
            rank: soloRank ? {
              tier: soloRank.tier,
              rank: soloRank.rank,
              lp: soloRank.leaguePoints,
            } : null,
          };
        } catch (error) {
          console.warn(`Failed to enrich participant ${participant.puuid}:`, error);
          return {
            ...participant,
            gameName: participant.riotId?.split('#')[0] || 'Unknown',
            tagLine: participant.riotId?.split('#')[1] || '',
            rank: null,
          };
        }
      })
    );

    return NextResponse.json({
      inGame: true,
      gameId: liveGame.gameId,
      gameMode: liveGame.gameMode,
      gameType: liveGame.gameType,
      gameStartTime: liveGame.gameStartTime,
      gameLength: liveGame.gameLength,
      mapId: liveGame.mapId,
      queueId: liveGame.gameQueueConfigId,
      bannedChampions: liveGame.bannedChampions,
      participants: enrichedParticipants,
    });
  } catch (error) {
    console.error('Live game API error:', error);

    if (error instanceof RiotApiError) {
      if (error.status === 429) {
        return NextResponse.json(
          { error: 'Rate limited. Please try again later.' },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to fetch live game data' },
      { status: 500 }
    );
  }
}
