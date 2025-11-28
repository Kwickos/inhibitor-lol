import { NextRequest, NextResponse } from 'next/server';
import { getMatchIds, getMatch, storePlayerMatch, getStoredMatchIds, getStoredMatchCount } from '@/lib/cache';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import { RiotApiError } from '@/lib/riot-api';
import type { MatchSummary, Match } from '@/types/riot';

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
    const count = parseInt(searchParams.get('count') || '20', 10);
    const start = parseInt(searchParams.get('start') || '0', 10);
    const queueParam = searchParams.get('queue'); // Queue ID filter
    const queueIds = queueParam ? queueParam.split(',').map(Number) : null;

    // Validate region
    if (!region || !REGIONS[region]) {
      return NextResponse.json(
        { error: 'Invalid or missing region parameter' },
        { status: 400 }
      );
    }

    // Strategy: Combine DB stored matches with fresh API data
    // 1. Get recent match IDs from Riot API (max 100)
    // 2. Get stored match IDs from DB (can be unlimited)
    // 3. Merge and deduplicate, keeping chronological order

    // Get match IDs from Riot API (recent games)
    const fetchCount = Math.min(100, queueIds ? (count + start) * 2 : count + start);
    const apiMatchIds = await getMatchIds(puuid, region, fetchCount);

    // Get stored match IDs from DB (historical games)
    const storedMatchIds = await getStoredMatchIds(puuid, 500, queueIds || undefined);

    // Merge and deduplicate - API matches first (most recent), then stored
    const seenIds = new Set<string>();
    const allMatchIds: string[] = [];

    // Add API matches first
    for (const id of apiMatchIds) {
      if (!seenIds.has(id)) {
        seenIds.add(id);
        allMatchIds.push(id);
      }
    }

    // Add stored matches that aren't in API results
    for (const id of storedMatchIds) {
      if (!seenIds.has(id)) {
        seenIds.add(id);
        allMatchIds.push(id);
      }
    }

    // If filtering by queue, we need to fetch matches and filter (for API matches not yet filtered)
    let matchIds = allMatchIds;
    if (queueIds && queueIds.length > 0) {
      // Fetch all match details to filter by queue
      const matchDetails = await Promise.all(
        allMatchIds.map(async (matchId) => {
          try {
            const match = await getMatch(matchId, region);
            return { matchId, queueId: match.info.queueId, gameCreation: match.info.gameCreation };
          } catch {
            return null;
          }
        })
      );

      // Filter by queue IDs and sort by creation time
      matchIds = matchDetails
        .filter((m): m is { matchId: string; queueId: number; gameCreation: number } =>
          m !== null && queueIds.includes(m.queueId)
        )
        .sort((a, b) => b.gameCreation - a.gameCreation)
        .map(m => m.matchId);
    }

    const paginatedIds = matchIds.slice(start, start + count);

    // Fetch match details in parallel (limit concurrency)
    const fullMatches: Match[] = [];

    const matchPromises = paginatedIds.map(async (matchId) => {
      try {
        const match = await getMatch(matchId, region);
        fullMatches.push(match); // Keep full match for prefetch

        // Store player match data for champion stats (fire and forget)
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
          // Include all participants and teams for expanded view
          allParticipants: match.info.participants,
          teams: match.info.teams,
        };

        return summary;
      } catch (error) {
        console.warn(`Failed to fetch match ${matchId}:`, error);
        return null;
      }
    });

    const matchSummaries = (await Promise.all(matchPromises)).filter(Boolean);

    // Prefetch frequent teammates' data in background (fire and forget)
    prefetchTeammateData(fullMatches, puuid, region).catch(() => {});

    return NextResponse.json({
      matches: matchSummaries,
      total: matchIds.length,
      hasMore: matchIds.length > start + count,
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
