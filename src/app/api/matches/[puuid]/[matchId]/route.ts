import { NextRequest, NextResponse } from 'next/server';
import { getMatchDetails } from '@/lib/cache';

// Get full match details (all participants + teams) for expanded view
// This is called on-demand when user expands a match card

interface Params {
  params: Promise<{
    puuid: string;
    matchId: string;
  }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { puuid, matchId } = await params;

    const details = await getMatchDetails(matchId, puuid);

    if (!details) {
      return NextResponse.json(
        { error: 'Match not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(details);
  } catch (error) {
    console.error('Match details API error:', error);

    return NextResponse.json(
      { error: 'Failed to fetch match details' },
      { status: 500 }
    );
  }
}
