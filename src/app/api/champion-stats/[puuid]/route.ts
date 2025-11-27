import { NextRequest, NextResponse } from 'next/server';
import { getChampionStats } from '@/lib/cache';

interface Params {
  params: Promise<{
    puuid: string;
  }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { puuid } = await params;

    // Get champion stats from stored match data
    const stats = await getChampionStats(puuid);

    return NextResponse.json({
      stats,
      totalGames: stats.reduce((acc, s) => acc + s.games, 0),
    });
  } catch (error) {
    console.error('Champion stats API error:', error);

    return NextResponse.json(
      { error: 'Failed to fetch champion stats' },
      { status: 500 }
    );
  }
}
