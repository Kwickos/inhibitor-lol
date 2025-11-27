import { NextRequest, NextResponse } from 'next/server';
import { getMatchIds, getMatch, storePlayerMatch } from '@/lib/cache';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import { RiotApiError } from '@/lib/riot-api';
import type { MatchSummary } from '@/types/riot';

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

    // Get match IDs - fetch more if filtering
    const fetchCount = queueIds ? Math.max(100, (count + start) * 3) : count + start;
    const allMatchIds = await getMatchIds(puuid, region, fetchCount);

    // If filtering by queue, we need to fetch matches and filter
    let matchIds = allMatchIds;
    if (queueIds && queueIds.length > 0) {
      // Fetch all match details to filter by queue
      const matchDetails = await Promise.all(
        allMatchIds.map(async (matchId) => {
          try {
            const match = await getMatch(matchId, region);
            return { matchId, queueId: match.info.queueId };
          } catch {
            return null;
          }
        })
      );

      // Filter by queue IDs
      matchIds = matchDetails
        .filter((m): m is { matchId: string; queueId: number } =>
          m !== null && queueIds.includes(m.queueId)
        )
        .map(m => m.matchId);
    }

    const paginatedIds = matchIds.slice(start, start + count);

    // Fetch match details in parallel (limit concurrency)
    const matchPromises = paginatedIds.map(async (matchId) => {
      try {
        const match = await getMatch(matchId, region);

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
