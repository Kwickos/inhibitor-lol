import { NextRequest, NextResponse } from 'next/server';
import { getMatch, storePlayerMatch, getStoredMatchIds, getStoredMatchSummaries } from '@/lib/cache';
import { type RegionKey } from '@/lib/constants/regions';
import { RiotApiError, getMatchIds as fetchMatchIdsFromRiot } from '@/lib/riot-api';
import { checkRateLimit } from '@/lib/rate-limit';
import { 
  validateParams, 
  validateQuery, 
  refreshMatchesParamsSchema, 
  refreshMatchesQuerySchema 
} from '@/lib/validation';
import type { MatchSummary } from '@/types/riot';

// Fetch new matches from Riot API and store them
// This is the "slow" endpoint that does the actual API calls
// The frontend should call this in the background after showing cached data

// Max duration for this endpoint (serverless)
export const maxDuration = 60;

interface Params {
  params: Promise<{
    puuid: string;
  }>;
}

// Fetch new match IDs from Riot API
// - UPDATE mode: stop when we find a known match (incremental update)
// - FIRST_TIME mode: fetch more history, skip known matches but continue
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

      // Safety limits - more conservative for faster response
      if (isFirstTime) {
        // First time: fetch up to 100 matches initially (will get more on subsequent refreshes)
        if (startIndex >= 200 || newMatchIds.length >= 100) break;
      } else {
        // Update mode: stop as soon as we find known matches or have 50 new ones
        if (shouldStop || newMatchIds.length >= 50) break;
      }

    } while (!shouldStop && startIndex < 500);

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
  // Increase batch size for faster processing
  const batchSize = 10;

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

export async function GET(request: NextRequest, { params }: Params) {
  // Apply strict rate limiting (10 req/min) - this is an expensive operation
  const rateLimitResponse = await checkRateLimit(request, 'strict');
  if (rateLimitResponse) return rateLimitResponse;

  // Validate params
  const paramsValidation = await validateParams(params, refreshMatchesParamsSchema);
  if (!paramsValidation.success) {
    return paramsValidation.error;
  }

  // Validate query
  const queryValidation = validateQuery(request, refreshMatchesQuerySchema);
  if (!queryValidation.success) {
    return queryValidation.error;
  }

  const { puuid } = paramsValidation.data;
  const { region } = queryValidation.data;
  const regionKey = region as RegionKey;

  try {

    // Get existing match IDs from DB
    const storedMatchIds = await getStoredMatchIds(puuid, 10000);
    const storedMatchIdSet = new Set(storedMatchIds);

    // Determine if this is first time (less than 20 matches) or update
    const FIRST_TIME_THRESHOLD = 20;
    const isFirstTime = storedMatchIds.length < FIRST_TIME_THRESHOLD;

    console.log(`[REFRESH ${isFirstTime ? 'FIRST_TIME' : 'UPDATE'}] Player has ${storedMatchIds.length} matches in DB`);

    // Fetch new match IDs from Riot API
    const newMatchIds = await fetchNewMatchIds(puuid, regionKey, storedMatchIdSet, isFirstTime);

    if (newMatchIds.length === 0) {
      return NextResponse.json({
        newMatches: 0,
        message: 'No new matches found',
      });
    }

    // Fetch and store new matches
    const storedCount = await fetchAndStoreNewMatches(puuid, regionKey, newMatchIds);

    // Return updated match list
    if (storedCount > 0) {
      const updatedSummaries = await getStoredMatchSummaries(puuid);
      const matches: MatchSummary[] = updatedSummaries.map(s => ({
        matchId: s.matchId,
        queueId: s.queueId,
        gameCreation: s.gameCreation,
        gameDuration: s.gameDuration,
        gameMode: s.gameMode,
        participant: s.participant,
        win: s.win,
        isRemake: s.isRemake,
        allParticipants: s.allParticipants,
        teams: s.teams,
      }));
      matches.sort((a, b) => b.gameCreation - a.gameCreation);

      return NextResponse.json({
        matches,
        total: matches.length,
        newMatches: storedCount,
      });
    }

    return NextResponse.json({
      newMatches: 0,
      message: 'Failed to store new matches',
    });
  } catch (error) {
    console.error('Refresh matches API error:', error);

    if (error instanceof RiotApiError) {
      if (error.status === 429) {
        return NextResponse.json(
          { error: 'Rate limited. Please try again later.', newMatches: 0 },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to refresh matches', newMatches: 0 },
      { status: 500 }
    );
  }
}
