import { NextRequest, NextResponse } from 'next/server';
import { getMatchIds, getMatch, storePlayerMatch, getStoredMatchIds, getStoredMatchSummaries } from '@/lib/cache';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import { RiotApiError } from '@/lib/riot-api';
import type { MatchSummary, Match } from '@/types/riot';

// Fetch new match IDs from Riot API (only those not in DB)
// For first load: paginate through ALL history
// For refresh: just get recent ones until we hit existing matches
async function fetchNewMatchIds(
  puuid: string,
  region: RegionKey,
  existingMatchIds: Set<string>,
  isFirstLoad: boolean
): Promise<string[]> {
  const newMatchIds: string[] = [];
  let start = 0;
  const batchSize = 100; // Riot API max
  let hasMore = true;
  let consecutiveExisting = 0;

  while (hasMore) {
    try {
      const batchIds = await getMatchIds(puuid, region, batchSize, undefined, start);

      if (batchIds.length === 0) {
        hasMore = false;
        break;
      }

      let newMatchesInBatch = 0;
      for (const id of batchIds) {
        if (!existingMatchIds.has(id)) {
          newMatchIds.push(id);
          newMatchesInBatch++;
        }
      }

      // If all matches in this batch already exist in DB, we can stop
      if (newMatchesInBatch === 0) {
        consecutiveExisting++;
        // For refresh: stop immediately when we hit existing matches
        // For first load: stop after 2 consecutive batches of only existing matches
        if (!isFirstLoad || consecutiveExisting >= 2) {
          hasMore = false;
          break;
        }
      } else {
        consecutiveExisting = 0;
      }

      // If we got fewer than batchSize, we've reached the end
      if (batchIds.length < batchSize) {
        hasMore = false;
      } else {
        start += batchSize;
        // Safety limit: don't fetch more than 1000 matches in one request
        if (start >= 1000) {
          hasMore = false;
        }
      }
    } catch (error) {
      console.warn(`Error fetching batch at start=${start}:`, error);
      hasMore = false;
    }
  }

  return newMatchIds;
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

    // Validate region
    if (!region || !REGIONS[region]) {
      return NextResponse.json(
        { error: 'Invalid or missing region parameter' },
        { status: 400 }
      );
    }

    // Strategy:
    // 1. Get all stored match summaries from DB (fast, no API calls)
    // 2. Check for new matches from Riot API
    // 3. Fetch and store only NEW match details
    // 4. Return combined results

    // Get stored match IDs from DB
    const storedMatchIds = await getStoredMatchIds(puuid, 10000);
    const storedMatchIdSet = new Set(storedMatchIds);
    const isFirstLoad = storedMatchIds.length === 0;

    // Fetch new match IDs from Riot API
    const newMatchIds = await fetchNewMatchIds(puuid, region, storedMatchIdSet, isFirstLoad);

    console.log(`Found ${newMatchIds.length} new matches, ${storedMatchIds.length} in DB`);

    // Fetch and store only NEW matches
    const newMatchSummaries: MatchSummary[] = [];

    if (newMatchIds.length > 0) {
      // Process new matches in batches
      const batchSize = 20;
      for (let i = 0; i < newMatchIds.length; i += batchSize) {
        const batchIds = newMatchIds.slice(i, i + batchSize);

        const batchPromises = batchIds.map(async (matchId) => {
          try {
            const match = await getMatch(matchId, region);

            // Store player match data for ALL participants
            await storePlayerMatch(puuid, match);

            // Find participant data for the requested player
            const participant = match.info.participants.find(p => p.puuid === puuid);
            if (!participant) return null;

            const summary: MatchSummary = {
              matchId: match.metadata.matchId,
              queueId: match.info.queueId,
              gameCreation: match.info.gameCreation,
              gameDuration: match.info.gameDuration,
              gameMode: match.info.gameMode,
              participant,
              win: participant.win,
              allParticipants: match.info.participants,
              teams: match.info.teams,
            };

            return summary;
          } catch (error) {
            console.warn(`Failed to fetch match ${matchId}:`, error);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        newMatchSummaries.push(...batchResults.filter((s): s is MatchSummary => s !== null));
      }
    }

    // Get all stored match summaries from DB (including just-added ones)
    const storedSummaries = await getStoredMatchSummaries(puuid);

    // Convert stored summaries to MatchSummary format
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
      newMatches: newMatchIds.length,
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
