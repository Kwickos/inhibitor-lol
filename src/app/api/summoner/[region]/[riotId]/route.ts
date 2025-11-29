import { NextRequest, NextResponse } from 'next/server';
import { getAccount, getSummoner, getRanks, getMasteries, getLiveGame } from '@/lib/cache';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import { RiotApiError, getLeagueEntriesByPuuid } from '@/lib/riot-api';
import { getChampionNameById } from '@/lib/champions';
import { assignTeamRoles, ROLE_ORDER } from '@/lib/constants/champion-roles';
import { db } from '@/lib/db';
import { summoners } from '@/db/schema';
import type { CurrentGameInfo } from '@/types/riot';

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
    const [summoner, ranks, masteries, liveGameRaw] = await Promise.all([
      getSummoner(account.puuid, regionKey),
      getRanks(account.puuid, regionKey).catch((e) => {
        console.warn('Failed to fetch ranks:', e);
        return [];
      }),
      getMasteries(account.puuid, regionKey, 5).catch(() => []),
      getLiveGame(account.puuid, regionKey).catch(() => null),
    ]);

    // Store summoner in database for search suggestions (non-blocking)
    const summonerId = summoner.id || account.puuid; // Fallback to puuid if id is missing
    db.insert(summoners)
      .values({
        puuid: account.puuid,
        gameName: account.gameName,
        tagLine: account.tagLine,
        region: regionKey,
        summonerId,
        profileIconId: summoner.profileIconId,
        summonerLevel: summoner.summonerLevel,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: summoners.puuid,
        set: {
          gameName: account.gameName,
          tagLine: account.tagLine,
          region: regionKey,
          summonerId,
          profileIconId: summoner.profileIconId,
          summonerLevel: summoner.summonerLevel,
          updatedAt: new Date(),
        },
      })
      .catch((e) => console.warn('Failed to store summoner:', e));

    // Transform live game data if present
    let liveGame = null;
    if (liveGameRaw) {
      // Fetch ranks for all participants in parallel
      const participantRanks = await Promise.all(
        liveGameRaw.participants.map(async (p) => {
          try {
            const entries = await getLeagueEntriesByPuuid(p.puuid, regionKey);
            const soloRank = entries.find((e) => e.queueType === 'RANKED_SOLO_5x5');
            if (soloRank) {
              return {
                puuid: p.puuid,
                tier: soloRank.tier,
                rank: soloRank.rank,
                lp: soloRank.leaguePoints,
              };
            }
          } catch {
            // Ignore errors fetching ranks
          }
          return null;
        })
      );

      const ranksMap = new Map(
        participantRanks.filter(Boolean).map((r) => [r!.puuid, r])
      );

      // Fetch champion names for all participants
      const participantChampionNames = await Promise.all(
        liveGameRaw.participants.map((p) => getChampionNameById(p.championId))
      );

      // Separate players by team
      const blueTeam = liveGameRaw.participants
        .map((p, idx) => ({ ...p, index: idx }))
        .filter((p) => p.teamId === 100);
      const redTeam = liveGameRaw.participants
        .map((p, idx) => ({ ...p, index: idx }))
        .filter((p) => p.teamId === 200);

      // Assign roles optimally for each team
      const [blueRoles, redRoles] = await Promise.all([
        assignTeamRoles(blueTeam.map((p) => ({
          championId: p.championId,
          spell1Id: p.spell1Id,
          spell2Id: p.spell2Id,
          index: p.index,
        }))),
        assignTeamRoles(redTeam.map((p) => ({
          championId: p.championId,
          spell1Id: p.spell1Id,
          spell2Id: p.spell2Id,
          index: p.index,
        }))),
      ]);

      // Merge role assignments
      const roleAssignments = new Map([...blueRoles, ...redRoles]);

      // Map participants with roles
      const participantsWithRoles = liveGameRaw.participants.map((p, idx) => {
        // Parse riotId (format: "gameName#tagLine")
        const [gameName, tagLine] = p.riotId?.split('#') || [p.summonerName, ''];
        const rank = ranksMap.get(p.puuid);
        return {
          championId: p.championId,
          championName: participantChampionNames[idx],
          teamId: p.teamId,
          gameName: gameName || p.summonerName,
          tagLine: tagLine || '',
          puuid: p.puuid,
          role: roleAssignments.get(idx) || 'MIDDLE',
          rank: rank ? { tier: rank.tier, rank: rank.rank, lp: rank.lp } : null,
        };
      });

      // Sort participants by role order within each team
      const sortByRole = (a: typeof participantsWithRoles[0], b: typeof participantsWithRoles[0]) => {
        return ROLE_ORDER.indexOf(a.role as typeof ROLE_ORDER[number]) - ROLE_ORDER.indexOf(b.role as typeof ROLE_ORDER[number]);
      };

      liveGame = {
        gameId: liveGameRaw.gameId,
        gameMode: liveGameRaw.gameMode,
        gameStartTime: liveGameRaw.gameStartTime,
        gameLength: liveGameRaw.gameLength,
        queueId: liveGameRaw.gameQueueConfigId,
        participants: participantsWithRoles.sort((a, b) => {
          // First sort by team
          if (a.teamId !== b.teamId) return a.teamId - b.teamId;
          // Then by role
          return sortByRole(a, b);
        }),
      };
    }

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
