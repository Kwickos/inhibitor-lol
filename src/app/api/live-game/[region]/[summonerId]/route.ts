import { NextRequest, NextResponse } from 'next/server';
import { getLiveGame, getRanks, getSummoner } from '@/lib/cache';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import { RiotApiError, getAccountByPuuid } from '@/lib/riot-api';
import { assignTeamRoles } from '@/lib/constants/champion-roles';

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

    // Split participants by team for role assignment
    const blueTeam = liveGame.participants
      .filter(p => p.teamId === 100)
      .map((p, idx) => ({
        championId: p.championId,
        spell1Id: p.spell1Id,
        spell2Id: p.spell2Id,
        index: idx,
        puuid: p.puuid,
      }));
    const redTeam = liveGame.participants
      .filter(p => p.teamId === 200)
      .map((p, idx) => ({
        championId: p.championId,
        spell1Id: p.spell1Id,
        spell2Id: p.spell2Id,
        index: idx + 5,
        puuid: p.puuid,
      }));

    // Assign roles using champion position rates + summoner spells
    const blueRoles = await assignTeamRoles(blueTeam);
    const redRoles = await assignTeamRoles(redTeam);

    // Create puuid to role mapping
    const puuidToRole = new Map<string, string>();
    for (const player of blueTeam) {
      const role = blueRoles.get(player.index);
      if (role) puuidToRole.set(player.puuid, role);
    }
    for (const player of redTeam) {
      const role = redRoles.get(player.index);
      if (role) puuidToRole.set(player.puuid, role);
    }

    // Enrich participant data with ranks and roles
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

          // Get assigned role
          const assignedRole = puuidToRole.get(participant.puuid);

          return {
            ...participant,
            gameName: account.gameName,
            tagLine: account.tagLine,
            role: assignedRole || null,
            rank: soloRank ? {
              tier: soloRank.tier,
              rank: soloRank.rank,
              lp: soloRank.leaguePoints,
            } : null,
          };
        } catch (error) {
          console.warn(`Failed to enrich participant ${participant.puuid}:`, error);
          const assignedRole = puuidToRole.get(participant.puuid);
          return {
            ...participant,
            gameName: participant.riotId?.split('#')[0] || 'Unknown',
            tagLine: participant.riotId?.split('#')[1] || '',
            role: assignedRole || null,
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
