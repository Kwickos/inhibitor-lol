import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { matches, playerMatches } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import * as riotApi from '@/lib/riot-api';
import type { Match } from '@/types/riot';

// Re-fetch matches from Riot API to get full data (challenges, pings, etc.)
// This updates existing matches with new fields

interface Params {
  params: Promise<{
    puuid: string;
  }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { puuid } = await params;
    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region') as RegionKey;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    if (!region || !REGIONS[region]) {
      return NextResponse.json(
        { error: 'Invalid or missing region parameter' },
        { status: 400 }
      );
    }

    // Get all match IDs for this player from DB
    const playerMatchData = await db
      .select({ matchId: playerMatches.matchId })
      .from(playerMatches)
      .where(eq(playerMatches.puuid, puuid))
      .limit(limit);

    const matchIds = playerMatchData.map(pm => pm.matchId);

    if (matchIds.length === 0) {
      return NextResponse.json({
        message: 'No matches found for this player',
        updated: 0,
      });
    }

    console.log(`Refreshing ${matchIds.length} matches for ${puuid}`);

    let updated = 0;
    let errors = 0;

    // Process in batches to respect rate limits
    const batchSize = 10;
    for (let i = 0; i < matchIds.length; i += batchSize) {
      const batch = matchIds.slice(i, i + batchSize);

      const batchPromises = batch.map(async (matchId) => {
        try {
          // Fetch fresh data from Riot API
          const match = await riotApi.getMatch(matchId, region);

          // Update match in DB with all new fields
          await db
            .update(matches)
            .set({
              gameVersion: match.info.gameVersion,
              mapId: match.info.mapId,
              platformId: match.info.platformId,
              gameType: match.info.gameType,
              endOfGameResult: match.info.endOfGameResult,
              participants: match.info.participants,
              teams: match.info.teams,
              updatedAt: new Date(),
            })
            .where(eq(matches.matchId, matchId));

          // Update playerMatches for all participants with new stats
          await updatePlayerMatchesWithFullStats(match);

          return true;
        } catch (error) {
          console.warn(`Failed to refresh match ${matchId}:`, error);
          return false;
        }
      });

      const results = await Promise.all(batchPromises);
      updated += results.filter(Boolean).length;
      errors += results.filter(r => !r).length;

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < matchIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return NextResponse.json({
      message: `Refreshed ${updated} matches`,
      updated,
      errors,
      total: matchIds.length,
    });
  } catch (error) {
    console.error('Refresh matches API error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh matches' },
      { status: 500 }
    );
  }
}

// Update playerMatches with all the new extended stats
async function updatePlayerMatchesWithFullStats(match: Match): Promise<void> {
  for (const participant of match.info.participants) {
    const challenges = participant.challenges;
    const primaryStyle = participant.perks?.styles?.find(s => s.description === 'primaryStyle');
    const secondaryStyle = participant.perks?.styles?.find(s => s.description === 'subStyle');

    try {
      await db
        .update(playerMatches)
        .set({
          // Extended stats
          goldEarned: participant.goldEarned,
          totalDamageDealtToChampions: participant.totalDamageDealtToChampions,
          totalDamageTaken: participant.totalDamageTaken,
          totalHeal: participant.totalHeal,
          totalDamageShieldedOnTeammates: participant.totalDamageShieldedOnTeammates,
          wardsPlaced: participant.wardsPlaced,
          wardsKilled: participant.wardsKilled,
          controlWardsPlaced: participant.detectorWardsPlaced ?? participant.visionWardsBoughtInGame,
          doubleKills: participant.doubleKills,
          tripleKills: participant.tripleKills,
          quadraKills: participant.quadraKills,
          pentaKills: participant.pentaKills,
          firstBloodKill: participant.firstBloodKill,
          turretKills: participant.turretKills,
          objectivesStolen: participant.objectivesStolen,
          // Challenges stats
          damagePerMinute: challenges?.damagePerMinute ? Math.round(challenges.damagePerMinute) : null,
          goldPerMinute: challenges?.goldPerMinute ? Math.round(challenges.goldPerMinute) : null,
          kda: challenges?.kda ? Math.round(challenges.kda * 100) : null,
          killParticipation: challenges?.killParticipation ? Math.round(challenges.killParticipation * 100) : null,
          teamDamagePercentage: challenges?.teamDamagePercentage ? Math.round(challenges.teamDamagePercentage * 100) : null,
          visionScorePerMinute: challenges?.visionScorePerMinute ? Math.round(challenges.visionScorePerMinute * 100) : null,
          soloKills: challenges?.soloKills ?? null,
          skillshotsDodged: challenges?.skillshotsDodged ?? null,
          skillshotsHit: challenges?.skillshotsHit ?? null,
          // Time data
          timePlayed: participant.timePlayed,
          totalTimeSpentDead: participant.totalTimeSpentDead,
          // Items
          item0: participant.item0,
          item1: participant.item1,
          item2: participant.item2,
          item3: participant.item3,
          item4: participant.item4,
          item5: participant.item5,
          item6: participant.item6,
          // Summoner spells
          summoner1Id: participant.summoner1Id,
          summoner2Id: participant.summoner2Id,
          // Runes
          primaryRune: primaryStyle?.selections?.[0]?.perk ?? null,
          secondaryRune: secondaryStyle?.style ?? null,
          // Game metadata
          queueId: match.info.queueId,
          gameVersion: match.info.gameVersion,
        })
        .where(
          and(
            eq(playerMatches.puuid, participant.puuid),
            eq(playerMatches.matchId, match.metadata.matchId)
          )
        );
    } catch (e) {
      // Ignore errors for individual participants
    }
  }
}
