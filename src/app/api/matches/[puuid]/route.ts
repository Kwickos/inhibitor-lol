import { NextRequest, NextResponse } from 'next/server';
import { getMatch, storePlayerMatch, getStoredMatchIds, getStoredMatchSummaries } from '@/lib/cache';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import { RiotApiError, getMatchIds as fetchMatchIdsFromRiot } from '@/lib/riot-api';
import type { MatchSummary, Match } from '@/types/riot';

// Queues to exclude (tutorials, practice tool, arena)
const EXCLUDED_QUEUES = [2000, 2010, 2020]; // Tutorial queues

// Fetch new match IDs from Riot API until we find a known match (like LeagueStats)
// This ensures we always get the latest games without missing any
async function fetchNewMatchIds(
  puuid: string,
  region: RegionKey,
  existingMatchIds: Set<string>,
  isFirstTime: boolean = false
): Promise<string[]> {
  const newMatchIds: string[] = [];
  let startIndex = 0;
  const batchSize = 100; // API max per request
  let foundKnownMatch = false;

  try {
    do {
      console.log(`--> Fetching matchIds from Riot API (start: ${startIndex})`);
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
        // If we find a match we already have, stop fetching (UPDATE mode)
        if (existingMatchIds.has(id)) {
          foundKnownMatch = true;
          break;
        }

        // Check if match is from the same region (LeagueStats does this)
        const matchRegion = id.split('_')[0]?.toLowerCase();
        if (matchRegion && matchRegion !== region.toLowerCase()) {
          // Match from different region, stop fetching
          foundKnownMatch = true;
          break;
        }

        newMatchIds.push(id);
      }

      // Move to next page
      startIndex += batchSize;

      // Safety limit: don't fetch more than 500 matches at once for new accounts
      // (LeagueStats uses FIRSTIME mode for this, we use a simple limit)
      if (isFirstTime && startIndex >= 500) {
        break;
      }

      // For regular updates, stop after finding known match or fetching 200 new ones
      if (!isFirstTime && (foundKnownMatch || newMatchIds.length >= 200)) {
        break;
      }

    } while (!foundKnownMatch && startIndex < 1000); // Max 1000 matches safety limit

  } catch (error) {
    console.warn('Error fetching match IDs:', error);
  }

  console.log(`Found ${newMatchIds.length} new matches to fetch`);
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

    // Strategy (like LeagueStats):
    // 1. Get all stored match IDs from DB
    // 2. Fetch new match IDs from Riot API until we find a known match
    // 3. Fetch and store only NEW match details
    // 4. Return combined results

    // Get stored match IDs from DB
    const storedMatchIds = await getStoredMatchIds(puuid, 10000);
    const storedMatchIdSet = new Set(storedMatchIds);

    // Consider it "first time" if player has less than 20 games stored
    // This handles the case where a player appears in another player's match
    // but hasn't had their own profile fetched yet
    const FIRST_TIME_THRESHOLD = 20;
    const isFirstTime = storedMatchIds.length < FIRST_TIME_THRESHOLD;

    // Fetch new match IDs from Riot API (paginated, stops when finding known match)
    const newMatchIds = await fetchNewMatchIds(puuid, region, storedMatchIdSet, isFirstTime);

    console.log(`[${isFirstTime ? 'FIRST_TIME' : 'UPDATE'}] Found ${newMatchIds.length} new matches, ${storedMatchIds.length} in DB`);

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
