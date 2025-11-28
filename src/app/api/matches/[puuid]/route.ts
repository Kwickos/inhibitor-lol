import { NextRequest, NextResponse } from 'next/server';
import { getMatchIds, getMatch, storePlayerMatch, getStoredMatchIds } from '@/lib/cache';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import { RiotApiError } from '@/lib/riot-api';
import type { MatchSummary, Match } from '@/types/riot';

// Fetch ALL match IDs from Riot API by paginating through history
async function fetchAllMatchIds(
  puuid: string,
  region: RegionKey,
  existingMatchIds: Set<string>
): Promise<string[]> {
  const allMatchIds: string[] = [];
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
          allMatchIds.push(id);
          newMatchesInBatch++;
        }
      }

      // If all matches in this batch already exist in DB, we can stop
      // (we've reached the point where we already have historical data)
      if (newMatchesInBatch === 0) {
        consecutiveExisting++;
        // Stop after 2 consecutive batches of only existing matches
        if (consecutiveExisting >= 2) {
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

  return allMatchIds;
}

// Prefetch match data for frequent teammates (fire and forget)
async function prefetchTeammateData(
  matches: Match[],
  currentPuuid: string,
  region: RegionKey
): Promise<void> {
  try {
    // Count teammate appearances
    const teammateCount = new Map<string, { count: number; gameName?: string; tagLine?: string }>();

    for (const match of matches) {
      const currentParticipant = match.info.participants.find(p => p.puuid === currentPuuid);
      if (!currentParticipant) continue;

      // Get teammates (same team)
      const teammates = match.info.participants.filter(
        p => p.puuid !== currentPuuid && p.teamId === currentParticipant.teamId
      );

      for (const teammate of teammates) {
        const existing = teammateCount.get(teammate.puuid) || { count: 0 };
        teammateCount.set(teammate.puuid, {
          count: existing.count + 1,
          gameName: teammate.riotIdGameName || teammate.summonerName,
          tagLine: teammate.riotIdTagline,
        });
      }
    }

    // Get top 3 most frequent teammates
    const topTeammates = Array.from(teammateCount.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .filter(([_, data]) => data.count >= 2); // Only prefetch if played 2+ games together

    // Prefetch their match IDs (fire and forget, don't await)
    for (const [puuid] of topTeammates) {
      getMatchIds(puuid, region, 10).catch(() => {
        // Silently ignore errors - this is just a prefetch
      });
    }

    console.log(`Prefetched data for ${topTeammates.length} frequent teammates`);
  } catch (error) {
    // Silently ignore prefetch errors
    console.warn('Teammate prefetch error:', error);
  }
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

    // Strategy: Fetch ALL matches and store in DB
    // 1. Get all stored match IDs from DB
    // 2. Fetch new matches from Riot API (paginate until we hit existing ones)
    // 3. Fetch and store all new match details
    // 4. Return all matches from DB + new ones

    // Get stored match IDs from DB (unlimited)
    const storedMatchIds = await getStoredMatchIds(puuid, 10000);
    const storedMatchIdSet = new Set(storedMatchIds);

    // Fetch new matches from Riot API
    const newMatchIds = await fetchAllMatchIds(puuid, region, storedMatchIdSet);

    // Combine: new matches first (most recent), then stored
    const allMatchIds = [...newMatchIds, ...storedMatchIds];

    // Fetch all match details (from cache/DB or API)
    const fullMatches: Match[] = [];
    const matchSummaries: MatchSummary[] = [];

    // Process in batches to avoid overwhelming the API
    const batchSize = 20;
    for (let i = 0; i < allMatchIds.length; i += batchSize) {
      const batchIds = allMatchIds.slice(i, i + batchSize);

      const batchPromises = batchIds.map(async (matchId) => {
        try {
          const match = await getMatch(matchId, region);
          fullMatches.push(match);

          // Store player match data for ALL participants (fire and forget)
          storePlayerMatch(puuid, match).catch(console.warn);

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
      matchSummaries.push(...batchResults.filter((s): s is MatchSummary => s !== null));
    }

    // Sort by game creation time (most recent first)
    matchSummaries.sort((a, b) => b.gameCreation - a.gameCreation);

    // Prefetch frequent teammates' data in background (fire and forget)
    prefetchTeammateData(fullMatches.slice(0, 50), puuid, region).catch(() => {});

    return NextResponse.json({
      matches: matchSummaries,
      total: matchSummaries.length,
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
