import { NextRequest, NextResponse } from 'next/server';
import { getMatch, storePlayerMatch, getStoredMatchIds, getStoredMatchSummaries } from '@/lib/cache';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import { RiotApiError, getMatchIds as fetchMatchIdsFromRiot } from '@/lib/riot-api';
import type { MatchSummary } from '@/types/riot';

// Fetch new match IDs from Riot API
// - UPDATE mode: stop when we find a known match (incremental update)
// - FIRST_TIME mode: fetch full history, skip known matches but continue
async function fetchNewMatchIds(
  puuid: string,
  region: RegionKey,
  existingMatchIds: Set<string>,
  isFirstTime: boolean = false
): Promise<string[]> {
  const newMatchIds: string[] = [];
  let startIndex = 0;
  const batchSize = 100; // API max per request
  let shouldStop = false;

  try {
    do {
      console.log(`--> Fetching matchIds from Riot API (start: ${startIndex}, mode: ${isFirstTime ? 'FIRST_TIME' : 'UPDATE'})`);
      const batchIds = await fetchMatchIdsFromRiot(puuid, region, {
        count: batchSize,
        start: startIndex,
      });

      // No more matches from API
      if (!batchIds || batchIds.length === 0) {
        break;
      }

      // Check each match ID
      for (const id of batchIds) {
        // Skip matches we already have
        if (existingMatchIds.has(id)) {
          // In UPDATE mode, stop when we find a known match
          // In FIRST_TIME mode, just skip it and continue
          if (!isFirstTime) {
            shouldStop = true;
            break;
          }
          continue; // Skip this match but keep going in FIRST_TIME mode
        }

        // Check if match is from the same region
        const matchRegion = id.split('_')[0]?.toLowerCase();
        const regionLower = region.toLowerCase();
        if (matchRegion && !matchRegion.startsWith(regionLower) && !regionLower.startsWith(matchRegion)) {
          if (!isFirstTime) {
            shouldStop = true;
            break;
          }
          continue;
        }

        newMatchIds.push(id);
      }

      // Move to next page
      startIndex += batchSize;

      // Safety limits
      if (isFirstTime) {
        if (startIndex >= 500) break;
      } else {
        if (shouldStop || newMatchIds.length >= 200) break;
      }

    } while (!shouldStop && startIndex < 1000);

  } catch (error) {
    console.warn('Error fetching match IDs:', error);
  }

  console.log(`Found ${newMatchIds.length} new matches to fetch`);
  return newMatchIds;
}

// Fetch and store new matches (returns count of new matches)
async function fetchAndStoreNewMatches(
  puuid: string,
  region: RegionKey,
  newMatchIds: string[]
): Promise<number> {
  if (newMatchIds.length === 0) return 0;

  let storedCount = 0;
  const batchSize = 5;

  for (let i = 0; i < newMatchIds.length; i += batchSize) {
    const batchIds = newMatchIds.slice(i, i + batchSize);

    const batchPromises = batchIds.map(async (matchId) => {
      try {
        const match = await getMatch(matchId, region);
        await storePlayerMatch(puuid, match);
        return true;
      } catch (error) {
        console.warn(`Failed to fetch match ${matchId}:`, error);
        return false;
      }
    });

    const results = await Promise.all(batchPromises);
    storedCount += results.filter(Boolean).length;
  }

  return storedCount;
}

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
    const refresh = searchParams.get('refresh') === 'true';

    // Validate region
    if (!region || !REGIONS[region]) {
      return NextResponse.json(
        { error: 'Invalid or missing region parameter' },
        { status: 400 }
      );
    }

    // FAST PATH: Return stored matches from DB immediately
    // This is much faster than waiting for Riot API checks
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

    // If refresh requested or no matches in DB, check for new matches
    let newMatchesCount = 0;
    const shouldRefresh = refresh || allSummaries.length === 0;

    if (shouldRefresh) {
      const storedMatchIds = await getStoredMatchIds(puuid, 10000);
      const storedMatchIdSet = new Set(storedMatchIds);

      const FIRST_TIME_THRESHOLD = 20;
      const isFirstTime = storedMatchIds.length < FIRST_TIME_THRESHOLD;

      console.log(`[${isFirstTime ? 'FIRST_TIME' : 'UPDATE'}] Checking for new matches, ${storedMatchIds.length} in DB`);

      const newMatchIds = await fetchNewMatchIds(puuid, region, storedMatchIdSet, isFirstTime);

      if (newMatchIds.length > 0) {
        newMatchesCount = await fetchAndStoreNewMatches(puuid, region, newMatchIds);

        // Re-fetch summaries to include new matches
        if (newMatchesCount > 0) {
          const updatedSummaries = await getStoredMatchSummaries(puuid);
          const updatedMatches: MatchSummary[] = updatedSummaries.map(s => ({
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
          updatedMatches.sort((a, b) => b.gameCreation - a.gameCreation);

          return NextResponse.json({
            matches: updatedMatches,
            total: updatedMatches.length,
            newMatches: newMatchesCount,
          });
        }
      }
    }

    return NextResponse.json({
      matches: allSummaries,
      total: allSummaries.length,
      newMatches: newMatchesCount,
    });
  } catch (error) {
    console.error('Matches API error:', error);

    if (error instanceof RiotApiError) {
      if (error.status === 429) {
        return NextResponse.json(
          { error: 'Rate limited. Please try again later.' },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to fetch match history' },
      { status: 500 }
    );
  }
}
